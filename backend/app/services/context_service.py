"""长对话上下文管理。

包含两种互补机制：

1. **预检裁剪** — 在 LLM 调用前执行，根据管理员配置的策略删除最早轮次（truncate）
   或将它们压缩为系统消息（summarize）。摘要缓存在对话行上。

2. **溢出回退** — 如果提供商返回 ContextWindowExceededError，
   则使用 drop_oldest_rounds 再剥离几轮并重试。

一个"轮次"指一条用户消息 + 一条助手回复。按用户消息计数。
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator

import litellm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.conversation import Conversation
from app.models.message import Message
from app.services.llm_service import get_model_config
from app.services.settings_service import ContextManagementConfig

logger = logging.getLogger(__name__)

# 摘要模型的最大输出 token 数
_SUMMARY_MAX_TOKENS = 600


def _split_system_and_chat(messages: list[dict]) -> tuple[list[dict], list[dict]]:
    """将前导 system 消息与聊天消息分离，避免意外裁剪系统消息。"""
    sys_msgs: list[dict] = []
    i = 0
    for msg in messages:
        if msg.get("role") == "system":
            sys_msgs.append(msg)
            i += 1
            continue
        break
    return sys_msgs, messages[i:]


def count_rounds(messages: list[dict]) -> int:
    """统计聊天块中的用户轮次（需先剥离系统消息）。"""
    return sum(1 for m in messages if m.get("role") == "user")


def _slice_keep_recent_rounds(
    chat: list[dict], keep_rounds: int
) -> tuple[list[dict], list[dict]]:
    """按轮次边界将聊天块分割为 (较旧部分, 最近部分)。

    从列表末尾向前遍历，保留最近 keep_rounds 个用户消息。
    """
    if keep_rounds <= 0:
        return list(chat), []

    seen_users = 0
    boundary = 0
    for idx in range(len(chat) - 1, -1, -1):
        if chat[idx].get("role") == "user":
            seen_users += 1
            if seen_users == keep_rounds:
                boundary = idx
                break
    else:
        return [], list(chat)
    return list(chat[:boundary]), list(chat[boundary:])


def drop_oldest_rounds(messages: list[dict], rounds_to_drop: int) -> list[dict]:
    """从消息列表中移除最早的 rounds_to_drop 个轮次。

    保留前导系统消息。如果聊天块没有足够的轮次可丢弃，则返回原列表不变。
    """
    if rounds_to_drop <= 0:
        return list(messages)

    sys_msgs, chat = _split_system_and_chat(messages)
    total_rounds = count_rounds(chat)
    if total_rounds <= rounds_to_drop:
        return list(messages)

    keep_rounds = total_rounds - rounds_to_drop
    _, recent = _slice_keep_recent_rounds(chat, keep_rounds)
    return sys_msgs + recent


async def _summarize_block(
    db: AsyncSession, model_db_id: str, prompt: str, block: list[dict]
) -> str | None:
    """执行一次性补全，将消息块压缩为段落摘要。失败时返回 None。"""
    try:
        config = await get_model_config(db, model_db_id)
    except ValueError as exc:
        logger.warning("摘要模型配置错误: %s", exc)
        return None
    if not config:
        logger.warning("摘要模型 %s 未找到或已禁用", model_db_id)
        return None

    rendered_block = "\n\n".join(
        f"[{m.get('role', '?')}] {m.get('content', '')}" for m in block
    )
    summary_messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": rendered_block},
    ]
    try:
        response = await litellm.acompletion(
            **config,
            messages=summary_messages,
            stream=False,
            temperature=0.3,
            max_tokens=_SUMMARY_MAX_TOKENS,
        )
        text = response.choices[0].message.content if response.choices else None
        return (text or "").strip() or None
    except Exception as exc:
        logger.warning("摘要调用失败: %s", exc)
        return None


async def _build_summary_block(
    db: AsyncSession,
    conversation: Conversation,
    older: list[dict],
    last_message_id: str | None,
    config: ContextManagementConfig,
) -> str | None:
    """获取 older 的摘要，当边界未移动时复用缓存的摘要。"""
    if not older:
        return None

    if (
        conversation.summary
        and conversation.summary_through_message_id
        and conversation.summary_through_message_id == last_message_id
    ):
        return conversation.summary

    if not config.summary_model_id:
        return None

    summary = await _summarize_block(
        db, config.summary_model_id, config.summary_prompt, older
    )
    if summary is None:
        return None

    conversation.summary = summary
    conversation.summary_through_message_id = last_message_id
    await db.flush()
    return summary


async def apply_context_strategy(
    db: AsyncSession,
    conversation: Conversation,
    messages: list[dict],
    db_messages: list[Message],
    config: ContextManagementConfig,
) -> list[dict]:
    """在 LLM 调用前按配置裁剪消息列表。

    返回可能被修改的消息列表，原列表不会被修改。
    """
    if not config.is_strategy_active():
        return messages

    sys_msgs, chat = _split_system_and_chat(messages)
    rounds = count_rounds(chat)
    if rounds <= config.trigger_rounds:
        return messages

    older, recent = _slice_keep_recent_rounds(chat, config.keep_recent_rounds)
    if not older:
        return messages

    if config.strategy == "truncate":
        return sys_msgs + recent

    # summarize 策略
    boundary_message_id: str | None = None
    if older and len(older) <= len(db_messages):
        boundary_message_id = db_messages[len(older) - 1].id

    summary = await _build_summary_block(
        db, conversation, older, boundary_message_id, config
    )
    if not summary:
        # 摘要不可用时降级为直接截断
        return sys_msgs + recent

    summary_msg = {
        "role": "system",
        "content": f"以下是当前对话的早期内容摘要，供你延续上下文使用：\n{summary}",
    }
    return sys_msgs + [summary_msg] + recent


def is_context_overflow_error(exc: BaseException) -> bool:
    """跨提供商检测"上下文窗口超出"错误。

    同时检查 LiteLLM 标准化的 ContextWindowExceededError 和错误消息中的已知关键词。
    """
    if isinstance(exc, litellm.ContextWindowExceededError):
        return True
    text = str(exc).lower()
    needles = (
        "context length",
        "context window",
        "maximum context",
        "max_tokens",
        "too many tokens",
        "token limit",
        "prompt is too long",
        "reduce the length",
    )
    return any(n in text for n in needles)
