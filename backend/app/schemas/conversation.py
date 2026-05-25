from pydantic import BaseModel


class ConversationCreate(BaseModel):
    agent_id: str
    model_id: str | None = None
    title: str | None = None


class ConversationUpdate(BaseModel):
    title: str | None = None
    model_id: str | None = None


class ConversationResponse(BaseModel):
    id: str
    user_id: str
    agent_id: str | None = None
    agent_name: str | None = None
    agent_avatar: str | None = None
    model_id: str | None = None
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0

    class Config:
        from_attributes = True
