import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Model(Base):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    provider_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("providers.id", ondelete="CASCADE"), nullable=False
    )
    model_id: Mapped[str] = mapped_column(
        String(200), nullable=False
    )  # LiteLLM 模型标识符
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # 管理员声明的能力标志，由 chat_service 用于决定是否发送多模态内容
    supports_vision: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    supports_tools: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 流式开关。为 False 时使用一次性完成请求，默认 True 以保持向后兼容
    stream_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # 为 False 时，聊天层会从回复中剥离思考块和 reasoning_content 增量
    show_thinking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relationships
    provider = relationship("Provider", back_populates="models")
    agent_models = relationship(
        "AgentModel", back_populates="model", cascade="all, delete-orphan"
    )
