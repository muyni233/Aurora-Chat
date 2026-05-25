from pydantic import BaseModel, Field


class AgentCreate(BaseModel):
    name: str = Field(..., max_length=100)
    nickname: str | None = None
    system_prompt: str = "You are a helpful assistant."
    description: str | None = None
    greeting_message: str | None = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=1.0, ge=0.0, le=1.0)
    max_tokens: int | None = None
    is_active: bool = True
    model_ids: list[str] = []  # List of model IDs to associate


class AgentUpdate(BaseModel):
    name: str | None = None
    nickname: str | None = None
    system_prompt: str | None = None
    description: str | None = None
    greeting_message: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    max_tokens: int | None = None
    is_active: bool | None = None
    model_ids: list[str] | None = None


class AgentResponse(BaseModel):
    id: str
    name: str
    nickname: str | None = None
    avatar_url: str | None = None
    system_prompt: str
    description: str | None = None
    greeting_message: str | None = None
    temperature: float
    top_p: float
    max_tokens: int | None = None
    is_active: bool
    created_at: str
    updated_at: str
    model_ids: list[str] = []

    class Config:
        from_attributes = True
