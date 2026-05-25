"""运行时可变的应用设置，基于 ``app_settings`` 表。

包含三类设置：
- registration_mode: open / admin_review / email_verification
- smtp_config: SMTP 服务器配置的 JSON 快照
- context_management: 长对话上下文裁剪策略配置
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

# ── 注册模式 ──────────────────────────────────────────────────────────────

REGISTRATION_MODE_KEY = "registration_mode"
DEFAULT_REGISTRATION_MODE = "open"
ALLOWED_REGISTRATION_MODES: set[str] = {"open", "admin_review", "email_verification"}


# ── SMTP 配置 ────────────────────────────────────────────────────────────


SMTP_CONFIG_KEY = "smtp_config"


class SmtpConfig(BaseModel):
    """SMTP 服务器配置，以 JSON 形式存储在 app_settings 中。

    host 是判断 SMTP 是否已配置的唯一依据：host 为空 = 已禁用。

    支持两种认证方式：
    - password: 经典 AUTH LOGIN，用户名 + 密码
    - xoauth2_microsoft: SASL XOAUTH2，使用 Microsoft Entra ID 刷新令牌
    """

    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    from_address: str = ""
    from_name: str = "Aurora Chat"
    use_tls: bool = True
    use_ssl: bool = False

    # OAuth2 (Microsoft) — 仅在 auth_method == "xoauth2_microsoft" 时生效
    auth_method: Literal["password", "xoauth2_microsoft"] = "password"
    oauth_tenant_id: str = "consumers"
    oauth_client_id: str = ""
    oauth_client_secret: str = ""
    oauth_refresh_token: str = ""

    def is_enabled(self) -> bool:
        if not self.host:
            return False
        if self.auth_method == "xoauth2_microsoft":
            return bool(self.oauth_refresh_token and self.oauth_client_id)
        return True


# ── 通用辅助函数 ─────────────────────────────────────────────────────────


async def get_setting(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    if row is None:
        row = AppSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    await db.flush()


# ── 注册模式辅助函数 ───────────────────────────────────────────────────


async def get_registration_mode(db: AsyncSession) -> str:
    value = await get_setting(db, REGISTRATION_MODE_KEY)
    if value not in ALLOWED_REGISTRATION_MODES:
        return DEFAULT_REGISTRATION_MODE
    return value


async def set_registration_mode(db: AsyncSession, mode: str) -> None:
    if mode not in ALLOWED_REGISTRATION_MODES:
        raise ValueError(f"无效的注册模式: {mode}")
    await set_setting(db, REGISTRATION_MODE_KEY, mode)


# ── SMTP 辅助函数 ───────────────────────────────────────────────────────


async def get_smtp_config(db: AsyncSession) -> SmtpConfig:
    raw = await get_setting(db, SMTP_CONFIG_KEY)
    if not raw:
        return SmtpConfig()
    try:
        data: dict[str, Any] = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return SmtpConfig()
    try:
        return SmtpConfig.model_validate(data)
    except Exception:
        return SmtpConfig()


async def set_smtp_config(db: AsyncSession, config: SmtpConfig) -> None:
    await set_setting(db, SMTP_CONFIG_KEY, config.model_dump_json())


async def is_smtp_enabled(db: AsyncSession) -> bool:
    cfg = await get_smtp_config(db)
    return cfg.is_enabled()


# ── 长对话上下文管理 ────────────────────────────────────────────────────


CONTEXT_CONFIG_KEY = "context_management"

ContextStrategy = Literal["none", "truncate", "summarize"]

# 默认摘要提示词
DEFAULT_SUMMARY_PROMPT = (
    "You are a conversation-summarization assistant. Condense the earlier user/assistant "
    "exchange below into a single concise paragraph. Preserve the key facts, the user's "
    "intent, confirmed conclusions, and any unresolved questions. Begin the output with "
    '"Prior conversation summary:". Do not restate the original verbatim and do not '
    "introduce new inferences."
)


class ContextManagementConfig(BaseModel):
    """控制长对话在发送给 LLM 之前的裁剪方式。

    strategy:
      * none      — 传递所有消息，仅溢出回退生效
      * truncate  — 超过 trigger_rounds 后删除最早轮次
      * summarize — 超过 trigger_rounds 后压缩旧轮次为系统摘要消息

    auto_truncate_on_overflow 独立于 strategy：启用时，提供商返回
    ContextWindowExceededError 会触发自动截断重试。
    """

    strategy: ContextStrategy = "none"
    trigger_rounds: int = Field(default=40, ge=2, le=500)
    keep_recent_rounds: int = Field(default=8, ge=1, le=500)
    summary_model_id: str | None = None
    auto_truncate_on_overflow: bool = True
    overflow_truncate_rounds: int = Field(default=2, ge=1, le=20)
    summary_prompt: str = DEFAULT_SUMMARY_PROMPT

    def is_strategy_active(self) -> bool:
        return self.strategy != "none"


async def get_context_config(db: AsyncSession) -> ContextManagementConfig:
    raw = await get_setting(db, CONTEXT_CONFIG_KEY)
    if not raw:
        return ContextManagementConfig()
    try:
        data: dict[str, Any] = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return ContextManagementConfig()
    try:
        return ContextManagementConfig.model_validate(data)
    except Exception:
        return ContextManagementConfig()


async def set_context_config(db: AsyncSession, config: ContextManagementConfig) -> None:
    if config.keep_recent_rounds >= config.trigger_rounds:
        raise ValueError("保留的最近轮数必须小于触发截断的轮数。")
    if config.strategy == "summarize" and not config.summary_model_id:
        raise ValueError("自动总结策略需要选择一个用于生成摘要的模型。")
    await set_setting(db, CONTEXT_CONFIG_KEY, config.model_dump_json())


# ── 主题默认值 ──────────────────────────────────────────────────────────


THEME_DEFAULTS_KEY = "theme_defaults"

ThemeMode = Literal["light", "dark", "system"]
ThemeRadius = Literal["compact", "normal", "soft"]
ThemeFontScale = Literal["sm", "md", "lg"]
ThemeMotion = Literal["full", "reduced", "none"]


def _to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class _CamelModel(BaseModel):
    """主题/品牌 Pydantic 模型基类 — 输出 camelCase JSON。

    前端 ThemeSpec 使用 TypeScript camelCase，此基类自动转换以保持兼容。
    """

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
    )


class ThemeBackground(_CamelModel):
    """可选背景图片。image_url 为空 = 无背景图片。"""

    kind: Literal["none", "image"] = "none"
    image_url: str = ""
    image_url_dark: str = ""
    blur: int = Field(default=0, ge=0, le=32)
    dim: float = Field(default=0.0, ge=0.0, le=1.0)
    extract_palette: bool = False
    parallax_enabled: bool = True


class ThemeSpec(_CamelModel):
    """用户/管理员主题配置。以 JSON 形式持久化。

    preset 为前端预设 ID（aurora / water-lilies 等）或 custom。
    当 preset == 'custom' 时，custom_accent 驱动调色板生成器。
    """

    mode: ThemeMode = "system"
    preset: str = "aether"
    custom_accent: str | None = None
    custom_secondary: str | None = None
    custom_tertiary: str | None = None
    background: ThemeBackground = Field(default_factory=ThemeBackground)
    radius: ThemeRadius = "normal"
    font_scale: ThemeFontScale = "md"
    motion: ThemeMotion = "full"


def _default_theme_spec() -> ThemeSpec:
    return ThemeSpec()


async def get_theme_defaults(db: AsyncSession) -> ThemeSpec:
    raw = await get_setting(db, THEME_DEFAULTS_KEY)
    if not raw:
        return _default_theme_spec()
    try:
        data: dict[str, Any] = json.loads(raw)
        return ThemeSpec.model_validate(data)
    except Exception:
        return _default_theme_spec()


async def set_theme_defaults(db: AsyncSession, spec: ThemeSpec) -> None:
    await set_setting(db, THEME_DEFAULTS_KEY, spec.model_dump_json(by_alias=True))


# ── 品牌设置 ──────────────────────────────────────────────────────────────


BRANDING_KEY = "branding"


class Branding(_CamelModel):
    """站点级品牌覆盖设置。

    app_name 替换 UI 中的 "Aurora" 文字；logo_url 覆盖默认图标。
    allow_user_override 控制用户是否可以修改主题设置。
    """

    app_name: str = "Aurora Chat"
    app_tagline: str = "Intelligent Conversations"
    logo_url: str = "/logo.png"
    favicon_url: str = ""
    allow_user_override: bool = True


def _default_branding() -> Branding:
    return Branding()


async def get_branding(db: AsyncSession) -> Branding:
    raw = await get_setting(db, BRANDING_KEY)
    if not raw:
        return _default_branding()
    try:
        data: dict[str, Any] = json.loads(raw)
        return Branding.model_validate(data)
    except Exception:
        return _default_branding()


async def set_branding(db: AsyncSession, branding: Branding) -> None:
    await set_setting(db, BRANDING_KEY, branding.model_dump_json(by_alias=True))


# ── 每用户主题偏好 ─────────────────────────────────────────────────────


def parse_user_theme(raw: str | None) -> ThemeSpec | None:
    """解码 users.theme_preferences 中存储的 JSON。

    用户未设置时返回 None，以便调用方区分"用户继承默认值"和"用户明确清空"。
    """
    if not raw:
        return None
    try:
        data: dict[str, Any] = json.loads(raw)
        return ThemeSpec.model_validate(data)
    except Exception:
        return None


def serialize_user_theme(spec: ThemeSpec | None) -> str | None:
    if spec is None:
        return None
    return spec.model_dump_json(by_alias=True)
