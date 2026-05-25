from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    """仅包含启动时必需的配置。

    运行时需要变更的配置（SMTP 凭证、注册模式等）存储在 ``app_settings`` 表中，
    通过管理后台进行管理。此文件仅保留应用启动前必须知晓的密钥和绑定地址。
    """

    # 应用
    APP_NAME: str = "Aurora Chat"
    DEBUG: bool = True

    # API 监听地址，由 run.py 读取
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # 数据库
    DATABASE_URL: str = "sqlite+aiosqlite:///./aurora_chat.db"

    # JWT
    SECRET_KEY: str = "aurora-chat-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # 上传文件
    UPLOAD_DIR: str = str(Path(__file__).parent.parent / "uploads")

    # CORS — 逗号分隔的允许来源，例如 "http://localhost:3000,https://app.example.com"
    # 使用 "*" 允许所有来源（仅限开发环境）
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # 注册控制（部署时策略）
    # 逗号分隔的允许邮箱域名，例如 "example.com,company.com"
    # 留空表示接受所有域名
    ALLOWED_EMAIL_DOMAINS: str = ""

    # 验证码生命周期（部署级别，一般无需调整）
    VERIFICATION_CODE_EXPIRE_MINUTES: int = 10
    VERIFICATION_CODE_RATE_LIMIT_SECONDS: int = 60

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


def cors_origins() -> list[str]:
    """将逗号分隔的 CORS 来源解析为列表。"""
    parts = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    return parts or ["*"]


def allowed_email_domains() -> list[str]:
    """将逗号分隔的邮箱域名白名单解析为小写域名列表。"""
    return [
        d.strip().lower()
        for d in settings.ALLOWED_EMAIL_DOMAINS.split(",")
        if d.strip()
    ]


# 确保上传目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(settings.UPLOAD_DIR, "avatars"), exist_ok=True)
