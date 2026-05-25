from pydantic import BaseModel, Field


class ModelCreate(BaseModel):
    provider_id: str
    model_id: str = Field(..., max_length=200)  # LiteLLM model identifier
    display_name: str = Field(..., max_length=100)
    description: str | None = None
    is_active: bool = True
    supports_vision: bool = False
    supports_tools: bool = False
    stream_enabled: bool = True
    show_thinking: bool = False


class ModelUpdate(BaseModel):
    model_id: str | None = None
    display_name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    supports_vision: bool | None = None
    supports_tools: bool | None = None
    stream_enabled: bool | None = None
    show_thinking: bool | None = None


class ModelResponse(BaseModel):
    id: str
    provider_id: str
    provider_name: str = ""
    # Brand identifier for the owning provider — exposed so the chat UI can
    # render the right lobehub logo next to each model without a second join
    # client-side. Defaults to "" because older callers may not populate it.
    provider_type: str = ""
    model_id: str
    display_name: str
    description: str | None = None
    is_active: bool
    supports_vision: bool = False
    supports_tools: bool = False
    stream_enabled: bool = True
    # When False, the chat layer strips `<think>...</think>` blocks (and any
    # LiteLLM-standardised `reasoning_content` deltas) from the streamed reply
    # before forwarding to the user — useful for reasoning models that emit
    # noisy chain-of-thought the operator doesn't want surfaced.
    show_thinking: bool = False
    created_at: str

    class Config:
        from_attributes = True
