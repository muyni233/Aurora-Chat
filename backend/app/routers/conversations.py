import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.agent import Agent
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
)
from app.schemas.message import MessageResponse, MessageUpdate
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _normalise_attachments(value) -> list | None:
    """将 Message.attachments 列的值还原为 list[dict] 或 None。

    SQLAlchemy 的 JSON 列通常直接返回 Python 列表，但对于在列创建之前
    插入的行（NULL → None），以及 SQLite 可能返回原始字符串的边缘情况，
    我们在此进行防御性处理，以确保 MessageResponse 的序列化保持一致。
    """
    if not value:
        return None
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else None
        except json.JSONDecodeError:
            return None
    return None


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出当前用户的会话。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().all()

    response = []
    for c in convs:
        count_result = await db.execute(
            select(func.count(Message.id))
            .where(Message.conversation_id == c.id)
            .where(Message.is_deleted == False)
        )
        msg_count = count_result.scalar() or 0

        agent_name = None
        agent_avatar = None
        if c.agent_id:
            agent_result = await db.execute(select(Agent).where(Agent.id == c.agent_id))
            agent = agent_result.scalar_one_or_none()
            if agent:
                agent_name = agent.nickname or agent.name
                agent_avatar = agent.avatar_url

        response.append(
            ConversationResponse(
                id=c.id,
                user_id=c.user_id,
                agent_id=c.agent_id,
                agent_name=agent_name,
                agent_avatar=agent_avatar,
                model_id=c.model_id,
                title=c.title,
                created_at=c.created_at.isoformat(),
                updated_at=c.updated_at.isoformat(),
                message_count=msg_count,
            )
        )
    return response


@router.post("", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建新的会话。"""
    conv = Conversation(
        user_id=current_user.id,
        agent_id=data.agent_id,
        model_id=data.model_id,
        title=data.title or "New Conversation",
    )
    db.add(conv)
    await db.flush()
    await db.refresh(conv)

    agent_name = None
    agent_avatar = None
    if conv.agent_id:
        agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
        agent = agent_result.scalar_one_or_none()
        if agent:
            agent_name = agent.nickname or agent.name
            agent_avatar = agent.avatar_url

    return ConversationResponse(
        id=conv.id,
        user_id=conv.user_id,
        agent_id=conv.agent_id,
        agent_name=agent_name,
        agent_avatar=agent_avatar,
        model_id=conv.model_id,
        title=conv.title,
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
    )


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取会话及其消息。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.is_deleted == False)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()

    agent_name = None
    agent_avatar = None
    greeting = None
    if conv.agent_id:
        agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
        agent = agent_result.scalar_one_or_none()
        if agent:
            agent_name = agent.nickname or agent.name
            agent_avatar = agent.avatar_url
            greeting = agent.greeting_message

    return {
        "conversation": ConversationResponse(
            id=conv.id,
            user_id=conv.user_id,
            agent_id=conv.agent_id,
            agent_name=agent_name,
            agent_avatar=agent_avatar,
            model_id=conv.model_id,
            title=conv.title,
            created_at=conv.created_at.isoformat(),
            updated_at=conv.updated_at.isoformat(),
            message_count=len(messages),
        ).model_dump(),
        "messages": [
            MessageResponse(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                attachments=_normalise_attachments(m.attachments),
                token_count=m.token_count,
                is_deleted=m.is_deleted,
                created_at=m.created_at.isoformat(),
                updated_at=m.updated_at.isoformat(),
            ).model_dump()
            for m in messages
        ],
        "greeting_message": greeting,
    }


@router.put("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    data: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新会话标题或模型。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(conv, key, value)
    await db.flush()
    await db.refresh(conv)

    return ConversationResponse(
        id=conv.id,
        user_id=conv.user_id,
        agent_id=conv.agent_id,
        model_id=conv.model_id,
        title=conv.title,
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
    )


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除会话。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(conv)
    await db.flush()
    return {"message": "Conversation deleted"}


@router.get("/{conversation_id}/export")
async def export_conversation(
    conversation_id: str,
    format: str = Query("json", pattern="^(json|markdown)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """将会话导出为 JSON 或 Markdown 格式。"""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .where(Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.is_deleted == False)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()

    if format == "json":
        export_data = {
            "title": conv.title,
            "created_at": conv.created_at.isoformat(),
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat(),
                }
                for m in messages
            ],
        }
        return Response(
            content=json.dumps(export_data, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{conv.title}.json"'
            },
        )
    else:
        lines = [f"# {conv.title}\n"]
        for m in messages:
            role_label = "🧑 User" if m.role == "user" else "🤖 Assistant"
            lines.append(f"\n## {role_label}\n\n{m.content}\n")
        content = "\n".join(lines)
        return Response(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{conv.title}.md"'},
        )
