from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def init_db():
    """创建所有数据库表。

    SQLAlchemy 的 ``create_all`` 只会添加缺失的表，不会修改已有列。
    如需为已有表添加新列，请在此处添加 ALTER TABLE 迁移。
    """
    from app.models import (  # noqa: F401
        user,
        provider,
        model,
        agent,
        conversation,
        message,
        email_verification,
        app_setting,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_columns(
            conn,
            "conversations",
            {
                "summary": "TEXT",
                "summary_through_message_id": "VARCHAR(36)",
            },
        )
        # 聊天附件：以 JSON 编码的 list[dict] 存储在用户消息行中
        await _ensure_columns(
            conn,
            "messages",
            {"attachments": "TEXT"},
        )
        # 模型能力标志。SQLite 将 BOOLEAN 存储为 INTEGER 0/1
        await _ensure_columns(
            conn,
            "models",
            {
                "supports_vision": "BOOLEAN NOT NULL DEFAULT 0",
                "supports_tools": "BOOLEAN NOT NULL DEFAULT 0",
                "stream_enabled": "BOOLEAN NOT NULL DEFAULT 1",
                "show_thinking": "BOOLEAN NOT NULL DEFAULT 0",
            },
        )
        # 用户级别的 UI 偏好设置（主题 JSON），NULL 表示使用站点默认值
        await _ensure_columns(
            conn,
            "users",
            {"theme_preferences": "TEXT"},
        )


async def _ensure_columns(conn, table: str, columns: dict[str, str]) -> None:
    """为 ``table`` 添加缺失的列。

    通过 ``PRAGMA table_info`` 检查已有列，仅对缺失的列执行 ``ADD COLUMN``。
    每次启动时运行，列已存在时为无操作。
    """
    from sqlalchemy import text

    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    existing = {row[1] for row in result.fetchall()}
    for col, ddl in columns.items():
        if col in existing:
            continue
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))


async def get_db():
    """提供数据库会话的依赖注入。"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
