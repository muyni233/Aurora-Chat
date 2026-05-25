import asyncio
import json
import logging
from typing import AsyncGenerator
import litellm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.provider import Provider
from app.models.model import Model

logger = logging.getLogger(__name__)

# 抑制 LiteLLM 的详细日志输出
litellm.suppress_debug_info = True


# 某些 LiteLLM 提供商在特定代码路径中会在提供商专属的参数名中查找 API Key。
# 典型情况：Gemini 在设置了 api_base 时会经过"自定义代理"分支，该分支只读取
# gemini_api_key 而忽略通用的 api_key。我们为这些提供商同时发送通用 key 和别名，
# 以避免耦合 LiteLLM 内部版本差异。
_LITELLM_KEY_ALIASES: dict[str, str] = {
    "gemini": "gemini_api_key",
    "anthropic": "anthropic_api_key",
    "cohere": "cohere_api_key",
}


def resolve_litellm_model(provider_type: str, model_id: str) -> str:
    """确保 LiteLLM 能正确路由请求。

    如果模型 ID 已包含前缀则保持不变，否则根据提供商类型自动添加前缀。
    """
    if "/" in model_id:
        return model_id

    # custom_openai 是我们的别名，LiteLLM 将任何带有 base_url 的 OpenAI 兼容服务
    # 视为 openai 提供商
    prefix = "openai" if provider_type == "custom_openai" else provider_type
    return f"{prefix}/{model_id}"


def build_litellm_kwargs(provider: Provider, model_id: str) -> dict:
    """将 (Provider, Model) 行转换为 litellm.acompletion 的关键字参数。

    始终包含 model 和 api_key；必要时添加提供商专属的 key 别名；
    仅在管理员明确设置了 base_url 时才添加 api_base。

    如果存储的 API Key 为空则抛出 ValueError。
    """
    if not (provider.api_key or "").strip():
        raise ValueError(
            f"服务商「{provider.name}」尚未配置 API Key。"
            f"请在「模型提供商」页面打开该服务商，点击「重置密钥」并填入新的密钥后保存。"
        )

    out: dict = {
        "model": resolve_litellm_model(provider.provider_type, model_id),
        "api_key": provider.api_key,
    }
    alias = _LITELLM_KEY_ALIASES.get(provider.provider_type)
    if alias:
        out[alias] = provider.api_key

    if provider.base_url:
        out["api_base"] = provider.base_url

    return out


async def get_model_config(db: AsyncSession, model_db_id: str) -> dict | None:
    """获取活跃模型行的 LiteLLM 配置，未找到或已禁用时返回 None。"""
    result = await db.execute(
        select(Model, Provider)
        .join(Provider, Model.provider_id == Provider.id)
        .where(Model.id == model_db_id)
        .where(Model.is_active == True)
        .where(Provider.is_active == True)
    )
    row = result.first()
    if not row:
        return None

    model, provider = row
    return build_litellm_kwargs(provider, model.model_id)


async def get_model_stream_enabled(db: AsyncSession, model_db_id: str) -> bool:
    """解析模型的 stream_enabled 标志。

    对未知或已禁用的行返回 True，以保持历史的流式行为。
    """
    result = await db.execute(
        select(Model.stream_enabled).where(Model.id == model_db_id)
    )
    val = result.scalar_one_or_none()
    return True if val is None else bool(val)


async def get_model_show_thinking(db: AsyncSession, model_db_id: str) -> bool:
    """解析模型的 show_thinking 标志。

    对未知行返回 False，这是面向管理员的保守默认值。
    """
    result = await db.execute(
        select(Model.show_thinking).where(Model.id == model_db_id)
    )
    val = result.scalar_one_or_none()
    return False if val is None else bool(val)


# ── 思考块过滤器 ──────────────────────────────────────────────────────────
#
# 推理模型（DeepSeek-R1、Gemini 2.0 Flash Thinking 等）将其思维链包裹在
# <think>...</think> 中。当管理员关闭 show_thinking 时，我们在流式回复中
# 在线剥离这些块，让用户只看到最终答案。

_THINK_OPEN = "<think>"
_THINK_CLOSE = "</think>"


class _ThinkBlockFilter:
    """从分块文本流中剥离 <think>...</think> 块。

    调用 feed() 输入每个片段，返回可见部分。上游结束后调用 flush()
    排空被暂存的尾部。flush 时未闭合的 <think> 将被丢弃。
    """

    def __init__(self) -> None:
        self._buf: str = ""
        self._in_think: bool = False

    def feed(self, piece: str) -> str:
        self._buf += piece
        out: list[str] = []
        while True:
            if self._in_think:
                idx = self._buf.find(_THINK_CLOSE)
                if idx >= 0:
                    self._buf = self._buf[idx + len(_THINK_CLOSE) :]
                    self._in_think = False
                    continue
                # 保留可能是部分 </think> 的尾部
                tail = self._partial_tail(self._buf, _THINK_CLOSE)
                self._buf = self._buf[len(self._buf) - tail :] if tail else ""
                break
            idx = self._buf.find(_THINK_OPEN)
            if idx >= 0:
                out.append(self._buf[:idx])
                self._buf = self._buf[idx + len(_THINK_OPEN) :]
                self._in_think = True
                continue
            tail = self._partial_tail(self._buf, _THINK_OPEN)
            if tail:
                out.append(self._buf[:-tail])
                self._buf = self._buf[-tail:]
            else:
                out.append(self._buf)
                self._buf = ""
            break
        return "".join(out)

    def flush(self) -> str:
        if self._in_think:
            self._buf = ""
            self._in_think = False
            return ""
        out = self._buf
        self._buf = ""
        return out

    @staticmethod
    def _partial_tail(buf: str, marker: str) -> int:
        """最长的 k，使得 buf 以 marker[:k] 结尾且 0 < k <= len(marker)。"""
        for k in range(min(len(marker), len(buf)), 0, -1):
            if buf.endswith(marker[:k]):
                return k
        return 0


# 提示提供商拒绝请求的子字符串（小写），表示模型不支持多模态/图片/文件内容。
# 当 supports_vision 标志配置错误时，我们剥离媒体内容并重试一次。
_MEDIA_UNSUPPORTED_FRAGMENTS = (
    "does not support image",
    "doesn't support image",
    "does not support vision",
    "doesn't support vision",
    "does not support multimodal",
    "doesn't support multimodal",
    "does not support file",
    "doesn't support file",
    "image_url is not supported",
    "image_url not supported",
    "image content not supported",
    "image type not supported",
    "file type not supported",
    "vision is not supported",
    "vision not supported",
    "no vision capability",
    "multimodal not supported",
    "cannot process image",
    "image input is not supported",
    "model does not have vision",
)


def _looks_like_media_unsupported(e: Exception) -> bool:
    msg = str(e).lower()
    return any(fragment in msg for fragment in _MEDIA_UNSUPPORTED_FRAGMENTS)


def _strip_media_blocks(messages: list[dict]) -> tuple[list[dict], int]:
    """将多模态 content 列表替换为纯文本等效内容。

    每个 image_url / file 部分变为简短的文本提及，让模型知道有附件但未发送。
    返回重写后的消息列表和剥离的媒体部分数量。
    """
    out: list[dict] = []
    dropped = 0
    for m in messages:
        content = m.get("content")
        if not isinstance(content, list):
            out.append(m)
            continue
        text_pieces: list[str] = []
        for part in content:
            ptype = part.get("type") if isinstance(part, dict) else None
            if ptype == "text":
                text_pieces.append(part.get("text", ""))
            elif ptype == "image_url":
                text_pieces.append(
                    "[图片已附加，但当前模型不支持图片输入]"
                )
                dropped += 1
            elif ptype == "file":
                fname = (part.get("file") or {}).get("filename") or "file"
                text_pieces.append(
                    f"[文件已附加：{fname} — 当前模型不支持文件输入]"
                )
                dropped += 1
        rewritten = "\n\n".join(p for p in text_pieces if p)
        out.append({**m, "content": rewritten})
    return out, dropped


async def stream_chat_completion(
    db: AsyncSession,
    model_db_id: str,
    messages: list[dict],
    temperature: float = 0.7,
    top_p: float = 1.0,
    max_tokens: int | None = None,
    *,
    auto_truncate_on_overflow: bool = False,
    overflow_truncate_rounds: int = 2,
    max_overflow_retries: int = 4,
    stream: bool = True,
    show_thinking: bool = False,
) -> AsyncGenerator[str, None]:
    """通过 LiteLLM 流式获取聊天补全。

    内置两种自动重试机制：
    * 上下文溢出：当 auto_truncate_on_overflow 为 True 时，截断最早几轮对话后重试。
    * 媒体不支持：当提供商拒绝图片/文件内容时，剥离媒体块并重试一次。

    stream 为 False 时，发出单个 content SSE 事件后跟 done 标记，
    与流式路径保持相同的 wire shape。

    show_thinking 为 False 时，剥离 <think>...</think> 块和 reasoning_content 增量。
    """
    from app.services.context_service import (
        drop_oldest_rounds,
        is_context_overflow_error,
    )

    try:
        config = await get_model_config(db, model_db_id)
    except ValueError as ve:
        yield f"data: {json.dumps({'error': str(ve)})}\n\n"
        return
    if not config:
        yield f"data: {json.dumps({'error': '模型未找到或已禁用'})}\n\n"
        return

    current_messages = list(messages)
    attempts = 0
    while True:
        kwargs: dict = {
            **config,
            "messages": current_messages,
            "stream": stream,
            "temperature": temperature,
            "top_p": top_p,
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens

        try:
            response = await litellm.acompletion(**kwargs)
        except Exception as e:
            if (
                auto_truncate_on_overflow
                and attempts < max_overflow_retries
                and is_context_overflow_error(e)
            ):
                trimmed = drop_oldest_rounds(current_messages, overflow_truncate_rounds)
                if len(trimmed) < len(current_messages):
                    attempts += 1
                    notice = (
                        f"上下文超出模型限制，已自动截断最早 {overflow_truncate_rounds} 轮对话后重试"
                        f"（第 {attempts} 次）。"
                    )
                    yield f"data: {json.dumps({'notice': notice})}\n\n"
                    current_messages = trimmed
                    continue
            if attempts < max_overflow_retries and _looks_like_media_unsupported(e):
                stripped, dropped = _strip_media_blocks(current_messages)
                if dropped > 0:
                    attempts += 1
                    notice = (
                        f"当前模型不支持媒体附件，已剥离 {dropped} 个附件后重试。"
                        "若需要原生多模态，请在「模型提供商」中开启该模型的「视觉」开关。"
                    )
                    yield f"data: {json.dumps({'notice': notice})}\n\n"
                    current_messages = stripped
                    continue
            logger.error("LLM 请求错误: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        if not stream:
            # 非流式分支：将完整响应打包为与流式路径相同的 SSE 格式
            try:
                msg = (
                    response.choices[0].message
                    if (response.choices and response.choices[0].message)
                    else None
                )
                raw_content = (msg.content if msg else "") or ""
                reasoning = getattr(msg, "reasoning_content", None) if msg else None
            except Exception as e:
                logger.error("LLM 非流式解析错误: %s", e)
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return
            full_content = _apply_thinking_visibility(
                raw_content, reasoning, show_thinking
            )
            if full_content:
                yield f"data: {json.dumps({'content': full_content})}\n\n"
            yield f"data: {json.dumps({'done': True, 'full_content': full_content})}\n\n"
            return

        # 流式分支。部分提供商/模型会静默拒绝流式请求，
        # LiteLLM 返回普通 ModelResponse 而非异步可迭代对象，此时回退到模拟流式。
        if not hasattr(response, "__aiter__"):
            try:
                msg = (
                    response.choices[0].message
                    if (response.choices and response.choices[0].message)
                    else None
                )
                raw_content = (msg.content if msg else "") or ""
                reasoning = getattr(msg, "reasoning_content", None) if msg else None
            except Exception as e:
                logger.error("LLM 流式回退解析错误: %s", e)
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return
            full_content = _apply_thinking_visibility(
                raw_content, reasoning, show_thinking
            )
            if full_content:
                CHUNK_SIZE = 24
                CHUNK_DELAY_S = 0.015
                for i in range(0, len(full_content), CHUNK_SIZE):
                    piece = full_content[i : i + CHUNK_SIZE]
                    yield f"data: {json.dumps({'content': piece})}\n\n"
                    if i + CHUNK_SIZE < len(full_content):
                        await asyncio.sleep(CHUNK_DELAY_S)
            yield f"data: {json.dumps({'done': True, 'full_content': full_content})}\n\n"
            return

        # ── 真正的流式路径 ────────────────────────────────────────────────
        think_filter = None if show_thinking else _ThinkBlockFilter()
        reasoning_open = False
        full_content = ""
        try:
            async for chunk in response:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta

                # 推理内容字段 — 发出合成的 <think>…</think>
                rc = getattr(delta, "reasoning_content", None)
                if rc:
                    if show_thinking:
                        if not reasoning_open:
                            piece = "<think>" + rc
                            reasoning_open = True
                        else:
                            piece = rc
                        full_content += piece
                        yield f"data: {json.dumps({'content': piece})}\n\n"

                content = delta.content
                if content:
                    if reasoning_open:
                        closer = "</think>\n\n"
                        full_content += closer
                        yield f"data: {json.dumps({'content': closer})}\n\n"
                        reasoning_open = False

                    if think_filter is None:
                        full_content += content
                        yield f"data: {json.dumps({'content': content})}\n\n"
                    else:
                        visible = think_filter.feed(content)
                        if visible:
                            full_content += visible
                            yield f"data: {json.dumps({'content': visible})}\n\n"
        except Exception as e:
            logger.error("LLM 流式错误: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # 排空过滤器暂存的尾部
        if think_filter is not None:
            tail = think_filter.flush()
            if tail:
                full_content += tail
                yield f"data: {json.dumps({'content': tail})}\n\n"
        elif reasoning_open:
            closer = "</think>"
            full_content += closer
            yield f"data: {json.dumps({'content': closer})}\n\n"

        yield f"data: {json.dumps({'done': True, 'full_content': full_content})}\n\n"
        return


def _apply_thinking_visibility(
    content: str, reasoning: str | None, show_thinking: bool
) -> str:
    """非流式分支的思考可见性处理。

    show_thinking 为 True 时，将 reasoning_content 包裹在 <think>…</think> 中前置。
    为 False 时剥离两者。
    """
    if show_thinking:
        prefix = f"<think>{reasoning}</think>\n\n" if reasoning else ""
        return prefix + (content or "")
    if not content:
        return ""
    f = _ThinkBlockFilter()
    head = f.feed(content)
    return head + f.flush()
