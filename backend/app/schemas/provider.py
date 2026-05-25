from pydantic import BaseModel, Field


class ProviderCreate(BaseModel):
    name: str = Field(..., max_length=100)
    provider_type: str = Field(..., max_length=50)  # 例如 "openai"、"anthropic" 等
    base_url: str | None = None
    # 空密钥在边界处被拒绝——每个活跃的服务商都需要一个真实的密钥来与其上游 API 通信。
    api_key: str = Field(..., min_length=1)
    description: str | None = None
    is_active: bool = True


class ProviderUpdate(BaseModel):
    name: str | None = None
    provider_type: str | None = None
    base_url: str | None = None
    # ``None`` 和空字符串都表示"保留现有密钥不做更改"。路由层必须据此过滤，
    # 以确保不相关的表单保存不会悄悄清空密钥。
    api_key: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ProviderResponse(BaseModel):
    id: str
    name: str
    provider_type: str
    base_url: str | None = None
    description: str | None = None
    is_active: bool
    created_at: str
    updated_at: str
    model_count: int = 0

    class Config:
        from_attributes = True
