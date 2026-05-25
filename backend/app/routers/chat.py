import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.conversation import Conversation
from app.models.agent import Agent
from app.models.message import Message
from app.schemas.message import ChatRequest
from app.deps import get_current_user
from app.models.user import User
from app.services.llm_service import (
    stream_chat_completion,
    get_model_stream_enabled,
    get_model_show_thinking,
)
from app.services.chat_service import (
    get_conversation_messages,
    save_message,
    auto_title_conversation,
)
from app.services.context_service import apply_context_strategy
from app.services.settings_service import get_context_config

router = APIRouter(prefix="/api/chat", tags=["chat"])


async def _prepare_messages_for_llm(db: AsyncSession, conversation: Conversation):
    """为对话构建 LLM 格式的消息列表并应用裁剪策略。"""
    messages, db_chat_rows = await get_conversation_messages(db, conversation.id)
    context_config = await get_context_config(db)
    messages = await apply_context_strategy(
        db, conversation, messages, db_chat_rows, context_config
    )
    return messages, context_config


@router.post("/{conversation_id}")
async def chat(
    conversation_id: str,
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """发送消息并获取流式响应。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == current_user.id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="对话未找到")

    model_id = data.model_id or conversation.model_id
    if not model_id:
        raise HTTPException(status_code=400, detail="未选择模型")

    if data.model_id:
        conversation.model_id = data.model_id
        await db.flush()

    # 持久化用户消息及其附件，以便后续加载时能重建相同的多模态载荷
    attachment_dicts = (
        [a.model_dump() for a in data.attachments] if data.attachments else None
    )
    await save_message(
        db,
        conversation_id,
        "user",
        data.content,
        attachments=attachment_dicts,
    )
    await auto_title_conversation(db, conversation_id)
    await db.commit()

    messages, context_config = await _prepare_messages_for_llm(db, conversation)
    await db.commit()

    agent_result = await db.execute(
        select(Agent).where(Agent.id == conversation.agent_id)
    )
    agent = agent_result.scalar_one_or_none()
    temperature = agent.temperature if agent else 0.7
    top_p = agent.top_p if agent else 1.0
    max_tokens = agent.max_tokens if agent else None

    # 每个模型的流式开关
    stream_flag = await get_model_stream_enabled(db, model_id)
    show_thinking = await get_model_show_thinking(db, model_id)

    async def event_stream():
        full_content = ""
        async for chunk in stream_chat_completion(
            db,
            model_id,
            messages,
            temperature,
            top_p,
            max_tokens,
            auto_truncate_on_overflow=context_config.auto_truncate_on_overflow,
            overflow_truncate_rounds=context_config.overflow_truncate_rounds,
            stream=stream_flag,
            show_thinking=show_thinking,
        ):
            if chunk.startswith("data: "):
                try:
                    chunk_data = json.loads(chunk[6:].strip())
                    if "content" in chunk_data:
                        full_content += chunk_data["content"]
                    if chunk_data.get("done"):
                        await save_message(
                            db, conversation_id, "assistant", full_content
                        )
                        await db.commit()
                except (json.JSONDecodeError, Exception):
                    pass
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            # 告知中间代理（nginx、CDN 等）不要缓冲响应
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/{conversation_id}/regenerate")
async def regenerate(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """重新生成最后一条助手消息。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == current_user.id)
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="对话未找到")

    if not conversation.model_id:
        raise HTTPException(status_code=400, detail="未选择模型")

    last_msg = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.role == "assistant")
        .where(Message.is_deleted == False)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    last_assistant = last_msg.scalar_one_or_none()
    if last_assistant:
        last_assistant.is_deleted = True
        await db.flush()
        await db.commit()

    messages, context_config = await _prepare_messages_for_llm(db, conversation)
    await db.commit()

    agent_result = await db.execute(
        select(Agent).where(Agent.id == conversation.agent_id)
    )
    agent = agent_result.scalar_one_or_none()
    temperature = agent.temperature if agent else 0.7
    top_p = agent.top_p if agent else 1.0
    max_tokens = agent.max_tokens if agent else None

    stream_flag = await get_model_stream_enabled(db, conversation.model_id)
    show_thinking = await get_model_show_thinking(db, conversation.model_id)

    async def event_stream():
        full_content = ""
        async for chunk in stream_chat_completion(
            db,
            conversation.model_id,
            messages,
            temperature,
            top_p,
            max_tokens,
            auto_truncate_on_overflow=context_config.auto_truncate_on_overflow,
            overflow_truncate_rounds=context_config.overflow_truncate_rounds,
            stream=stream_flag,
            show_thinking=show_thinking,
        ):
            if chunk.startswith("data: "):
                try:
                    chunk_data = json.loads(chunk[6:].strip())
                    if "content" in chunk_data:
                        full_content += chunk_data["content"]
                    if chunk_data.get("done"):
                        await save_message(
                            db, conversation_id, "assistant", full_content
                        )
                        await db.commit()
                except (json.JSONDecodeError, Exception):
                    pass
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
