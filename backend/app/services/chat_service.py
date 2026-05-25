import base64
import json
import logging
import os
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.message import Message
from app.models.conversation import Conversation
from app.models.agent import Agent
from app.models.model import Model
from app.models.provider import Provider

logger = logging.getLogger(__name__)


# ── 多模态辅助函数 ────────────────────────────────────────────────────────
#
# OpenAI 风格的多模态消息使用 content 部分列表：
#   [{type: "text", text: "..."}, {type: "image_url", image_url: {url: "data:..."}}, ...]
# LiteLLM 在 Anthropic / Gemini 等提供商之间统一此格式。
#
# PDF 使用 file 内容部分 — 支持 Anthropic（转换为 document 块）和 Gemini（转换为 inline_data）。
# OpenAI 的聊天补全不支持在消息中接受 PDF，因此对这些提供商回退到文本提及。
#
# text 附件拼接到用户文本内容中作为围栏代码块，通用兼容所有提供商。

# 原生接受 file 内容部分的提供商类型
_FILE_BLOCK_PROVIDERS = {"anthropic", "gemini"}


def _resolve_attachment_path(url: str) -> str | None:
    """将附件 URL 解析为磁盘路径。如果 URL 无效或文件不存在则返回 None。"""
    if not url or not url.startswith("/uploads/"):
        return None
    rel = url[len("/uploads/") :]
    abs_path = os.path.join(settings.UPLOAD_DIR, rel)
    # 安全检查：确保解析后的路径在 UPLOAD_DIR 内，防止路径遍历攻击
    upload_root = os.path.realpath(settings.UPLOAD_DIR)
    real = os.path.realpath(abs_path)
    if not real.startswith(upload_root):
        return None
    if not os.path.isfile(real):
        return None
    return real


def _read_as_data_url(path: str, content_type: str) -> str | None:
    """从磁盘读取文件并编码为 data: URL。读取失败时返回 None。"""
    try:
        with open(path, "rb") as fp:
            raw = fp.read()
    except OSError:
        logger.warning("无法读取附件: %s", path)
        return None
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _format_text_attachment(att: dict) -> str:
    """将文本类附件渲染为围栏代码块拼接到用户消息中。"""
    name = att.get("name") or "attachment"
    text = att.get("text_preview")
    if not text:
        return f"\n\n[附件: {name} — 内容不可用]"
    # 根据扩展名选择代码块语言提示
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    lang_map = {
        "py": "python",
        "js": "javascript",
        "ts": "typescript",
        "tsx": "tsx",
        "jsx": "jsx",
        "html": "html",
        "css": "css",
        "yml": "yaml",
        "yaml": "yaml",
        "json": "json",
        "md": "markdown",
        "csv": "csv",
        "sql": "sql",
        "sh": "bash",
        "bash": "bash",
        "rs": "rust",
        "go": "go",
        "java": "java",
    }
    lang = lang_map.get(ext, "")
    return f"\n\n--- 附件: {name} ---\n```{lang}\n{text}\n```"


def _build_user_content(
    text: str,
    attachments: list[dict] | None,
    provider_type: str | None,
    supports_vision: bool,
) -> str | list[dict[str, Any]]:
    """为带有附件的用户消息构建 LLM 格式的 content。

    当没有媒体类附件时返回纯字符串；涉及图片/PDF 时返回 OpenAI 风格的 content 部分列表。

    supports_vision 为 False 时，将图片/PDF 降级为文本提及。
    """
    if not attachments:
        return text

    images = [a for a in attachments if a.get("kind") == "image"]
    pdfs = [a for a in attachments if a.get("kind") == "pdf"]
    texts = [a for a in attachments if a.get("kind") == "text"]

    # 组合文本部分
    text_with_files = text or ""
    for att in texts:
        text_with_files += _format_text_attachment(att)

    # 不支持视觉 — 将所有媒体降级为文本提及
    if not supports_vision:
        for att in images:
            text_with_files += (
                f"\n\n[图片附件: {att.get('name') or 'image'} — "
                "当前模型未配置视觉能力，仅发送了文件名。]"
            )
        for att in pdfs:
            text_with_files += (
                f"\n\n[PDF 附件: {att.get('name') or 'document.pdf'} — "
                "当前模型未配置文件输入能力，仅发送了文件名。]"
            )
        return text_with_files

    # 视觉支持。PDF 仅在原生支持的提供商上发送
    fallback_pdf_names: list[str] = []
    if pdfs and provider_type not in _FILE_BLOCK_PROVIDERS:
        fallback_pdf_names = [a.get("name") or "document.pdf" for a in pdfs]
        for name in fallback_pdf_names:
            text_with_files += (
                f"\n\n[PDF 附件: {name} — 当前提供商不支持文件输入，仅发送了文件名。]"
            )

    media_pdfs = pdfs if provider_type in _FILE_BLOCK_PROVIDERS else []
    if not images and not media_pdfs:
        return text_with_files

    parts: list[dict[str, Any]] = []
    if text_with_files:
        parts.append({"type": "text", "text": text_with_files})

    for img in images:
        path = _resolve_attachment_path(img.get("url", ""))
        if not path:
            continue
        data_url = _read_as_data_url(path, img.get("content_type") or "image/jpeg")
        if not data_url:
            continue
        parts.append({"type": "image_url", "image_url": {"url": data_url}})

    for pdf in media_pdfs:
        path = _resolve_attachment_path(pdf.get("url", ""))
        if not path:
            continue
        data_url = _read_as_data_url(path, pdf.get("content_type") or "application/pdf")
        if not data_url:
            continue
        parts.append(
            {
                "type": "file",
                "file": {
                    "file_data": data_url,
                    "filename": pdf.get("name") or "document.pdf",
                },
            }
        )

    return parts


# ── 公共 API ────────────────────────────────────────────────────────────────


async def get_conversation_messages(
    db: AsyncSession, conversation_id: str
) -> tuple[list[dict], list[Message]]:
    """构建对话的 LLM 格式消息列表。

    返回 (消息列表, 聊天部分对应的 Message 行列表)。
    多模态：带有附件的用户消息展开为 OpenAI 风格的 content 部分列表。
    """
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        return [], []

    # 从对话关联的模型查找提供商类型和视觉能力
    provider_type: str | None = None
    supports_vision: bool = False
    if conversation.model_id:
        meta_result = await db.execute(
            select(Provider.provider_type, Model.supports_vision)
            .join(Model, Model.provider_id == Provider.id)
            .where(Model.id == conversation.model_id)
        )
        meta = meta_result.first()
        if meta:
            provider_type, supports_vision = meta[0], bool(meta[1])

    messages: list[dict] = []

    # 添加智能体的系统提示
    if conversation.agent_id:
        agent_result = await db.execute(
            select(Agent).where(Agent.id == conversation.agent_id)
        )
        agent = agent_result.scalar_one_or_none()
        if agent and agent.system_prompt:
            messages.append({"role": "system", "content": agent.system_prompt})

    # 添加对话消息
    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.is_deleted == False)
        .order_by(Message.created_at)
    )
    db_messages_all = msg_result.scalars().all()
    chat_rows: list[Message] = []

    for msg in db_messages_all:
        if msg.role == "system":
            continue
        if msg.role == "user" and msg.attachments:
            attachments = msg.attachments
            if isinstance(attachments, str):
                try:
                    attachments = json.loads(attachments)
                except json.JSONDecodeError:
                    attachments = None
            content = _build_user_content(
                msg.content, attachments, provider_type, supports_vision
            )
            messages.append({"role": msg.role, "content": content})
        else:
            messages.append({"role": msg.role, "content": msg.content})
        chat_rows.append(msg)

    return messages, chat_rows


async def save_message(
    db: AsyncSession,
    conversation_id: str,
    role: str,
    content: str,
    token_count: int | None = None,
    attachments: list[dict] | None = None,
) -> Message:
    """将消息保存到数据库。"""
    message = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        token_count=token_count,
        attachments=attachments if attachments else None,
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def auto_title_conversation(db: AsyncSession, conversation_id: str):
    """从第一条用户消息自动生成对话标题。"""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation or conversation.title != "New Conversation":
        return

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.role == "user")
        .where(Message.is_deleted == False)
        .order_by(Message.created_at)
        .limit(1)
    )
    first_msg = msg_result.scalar_one_or_none()
    if first_msg:
        title = first_msg.content[:50] if first_msg.content else ""
        if not title and first_msg.attachments:
            attachments = first_msg.attachments
            if isinstance(attachments, str):
                try:
                    attachments = json.loads(attachments)
                except json.JSONDecodeError:
                    attachments = []
            first_name = (attachments[0] or {}).get("name") if attachments else ""
            title = first_name or "New Conversation"
        elif first_msg.content and len(first_msg.content) > 50:
            title += "..."
        conversation.title = title or "New Conversation"
        await db.flush()
