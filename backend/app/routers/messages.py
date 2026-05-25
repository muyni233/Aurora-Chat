from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.message import Message
from app.models.conversation import Conversation
from app.schemas.message import MessageUpdate, MessageResponse
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.put("/{message_id}", response_model=MessageResponse)
async def update_message(
    message_id: str,
    data: MessageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """编辑消息内容。"""
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.id == message_id)
        .where(Conversation.user_id == current_user.id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.content = data.content
    await db.flush()
    await db.refresh(message)

    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        role=message.role,
        content=message.content,
        token_count=message.token_count,
        is_deleted=message.is_deleted,
        created_at=message.created_at.isoformat(),
        updated_at=message.updated_at.isoformat(),
    )


@router.delete("/{message_id}")
async def delete_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """软删除一条消息。"""
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.id == message_id)
        .where(Conversation.user_id == current_user.id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.is_deleted = True
    await db.flush()
    return {"message": "Message deleted"}
