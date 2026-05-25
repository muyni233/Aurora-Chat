"""Admin endpoints for runtime application settings.

Exposes:
- ``registration_mode`` — open / admin_review / email_verification.
- SMTP configuration — host, port, credentials, from address, TLS/SSL toggles.
- ``POST /smtp/test`` — try sending a test email with the *current* SMTP config so the
  admin can validate without registering a fresh account.
- ``POST /smtp/oauth/{start,callback}`` and ``DELETE /smtp/oauth`` — Microsoft OAuth2
  authorization-code flow for Outlook / Microsoft 365 (basic auth was retired by MS).
- ``GET / PUT /context`` — long-conversation context management policy
  (truncate / summarize / off, plus the auto-truncate-on-overflow fallback).
"""

from __future__ import annotations

import os
import secrets
import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import allowed_email_domains, settings as app_config
from app.database import get_db
from app.deps import require_admin
from app.models.model import Model
from app.models.provider import Provider
from app.models.user import User
from app.schemas.auth import AdminSettingsResponse, AdminSettingsUpdate
from app.services import email_service, oauth_microsoft, settings_service
from app.services.settings_service import (
    DEFAULT_SUMMARY_PROMPT,
    Branding,
    ContextManagementConfig,
    ContextStrategy,
    SmtpConfig,
    ThemeSpec,
)
from sqlalchemy import select

router = APIRouter(prefix="/api/admin/settings", tags=["admin"])


# ── Registration mode ─────────────────────────────────────────────────────


async def _build_response(db: AsyncSession) -> AdminSettingsResponse:
    mode = await settings_service.get_registration_mode(db)
    smtp_ok = await settings_service.is_smtp_enabled(db)
    return AdminSettingsResponse(
        registration_mode=mode,
        email_verification_available=smtp_ok,
        allowed_email_domains=allowed_email_domains(),
    )


@router.get("", response_model=AdminSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return await _build_response(db)


@router.put("", response_model=AdminSettingsResponse)
async def update_settings(
    data: AdminSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if data.registration_mode == "email_verification":
        if not await settings_service.is_smtp_enabled(db):
            raise HTTPException(
                status_code=400,
                detail="未配置 SMTP，无法启用邮箱验证模式。请先在「邮件服务」中保存 SMTP 配置。",
            )

    try:
        await settings_service.set_registration_mode(db, data.registration_mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return await _build_response(db)


# ── SMTP config ───────────────────────────────────────────────────────────


class SmtpConfigResponse(BaseModel):
    """SMTP config as exposed to the admin UI.

    Secrets (password, oauth client_secret, oauth refresh_token) are intentionally
    omitted on read — the UI shows boolean badges instead. To rotate them, the admin
    re-enters the value (password / client_secret) or re-runs the OAuth consent flow
    (refresh_token).
    """

    host: str
    port: int
    username: str
    password_set: bool
    from_address: str
    from_name: str
    use_tls: bool
    use_ssl: bool
    enabled: bool

    auth_method: Literal["password", "xoauth2_microsoft"]
    oauth_tenant_id: str
    oauth_client_id: str
    oauth_client_secret_set: bool
    oauth_authorized: bool


class SmtpConfigUpdate(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    # ``None`` means "leave the existing password untouched"; an empty string clears it.
    password: str | None = None
    from_address: str = ""
    from_name: str = "Aurora Chat"
    use_tls: bool = True
    use_ssl: bool = False

    auth_method: Literal["password", "xoauth2_microsoft"] = "password"
    oauth_tenant_id: str = "consumers"
    oauth_client_id: str = ""
    # Same None-sentinel as ``password``.
    oauth_client_secret: str | None = None


class SmtpTestRequest(BaseModel):
    to: EmailStr


class OAuthStartRequest(BaseModel):
    redirect_uri: str


class OAuthStartResponse(BaseModel):
    authorize_url: str
    state: str


class OAuthCallbackRequest(BaseModel):
    code: str
    state: str
    redirect_uri: str


# In-process OAuth state store for CSRF protection. Each entry expires after 10 minutes.
# Single-process FastAPI deployments only — that's the project's current shape.
_OAUTH_STATES: dict[str, tuple[int, str, float]] = {}
_OAUTH_STATE_TTL_SECONDS = 600


def _purge_expired_states() -> None:
    now = time.time()
    expired = [s for s, (_, _, exp) in _OAUTH_STATES.items() if exp <= now]
    for s in expired:
        _OAUTH_STATES.pop(s, None)


def _smtp_to_response(cfg: SmtpConfig) -> SmtpConfigResponse:
    return SmtpConfigResponse(
        host=cfg.host,
        port=cfg.port,
        username=cfg.username,
        password_set=bool(cfg.password),
        from_address=cfg.from_address,
        from_name=cfg.from_name,
        use_tls=cfg.use_tls,
        use_ssl=cfg.use_ssl,
        enabled=cfg.is_enabled(),
        auth_method=cfg.auth_method,
        oauth_tenant_id=cfg.oauth_tenant_id,
        oauth_client_id=cfg.oauth_client_id,
        oauth_client_secret_set=bool(cfg.oauth_client_secret),
        oauth_authorized=bool(cfg.oauth_refresh_token),
    )


@router.get("/smtp", response_model=SmtpConfigResponse)
async def get_smtp(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cfg = await settings_service.get_smtp_config(db)
    return _smtp_to_response(cfg)


@router.put("/smtp", response_model=SmtpConfigResponse)
async def update_smtp(
    data: SmtpConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Persist a new SMTP configuration.

    Sentinel rule for the password and ``oauth_client_secret``:
    - field ``is None`` → keep the previously stored value.
    - field ``== ""``   → wipe the stored value.
    - any other value   → replace it.

    ``oauth_refresh_token`` is *never* set by this endpoint — it is only written by the
    OAuth callback. Switching ``auth_method`` back to ``password`` does **not** clear it,
    so the admin can flip back without re-running consent. Use the dedicated
    ``DELETE /smtp/oauth`` endpoint to revoke.
    """
    current = await settings_service.get_smtp_config(db)

    new_password = current.password if data.password is None else data.password
    new_client_secret = (
        current.oauth_client_secret
        if data.oauth_client_secret is None
        else data.oauth_client_secret
    )

    new_cfg = SmtpConfig(
        host=data.host.strip(),
        port=int(data.port),
        username=data.username.strip(),
        password=new_password,
        from_address=data.from_address.strip(),
        from_name=data.from_name.strip() or "Aurora Chat",
        use_tls=bool(data.use_tls),
        use_ssl=bool(data.use_ssl),
        auth_method=data.auth_method,
        oauth_tenant_id=(data.oauth_tenant_id or "consumers").strip(),
        oauth_client_id=data.oauth_client_id.strip(),
        oauth_client_secret=new_client_secret,
        oauth_refresh_token=current.oauth_refresh_token,
    )

    if new_cfg.port < 1 or new_cfg.port > 65535:
        raise HTTPException(status_code=400, detail="端口号需在 1 到 65535 之间")

    await settings_service.set_smtp_config(db, new_cfg)

    # If SMTP just got disabled but the active mode demands it, downgrade quietly so the
    # frontend doesn't get stuck advertising an impossible flow.
    if not new_cfg.is_enabled():
        mode = await settings_service.get_registration_mode(db)
        if mode == "email_verification":
            await settings_service.set_registration_mode(db, "admin_review")

    return _smtp_to_response(new_cfg)


@router.post("/smtp/test")
async def test_smtp(
    data: SmtpTestRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Send a test email to validate the stored SMTP settings."""
    cfg = await settings_service.get_smtp_config(db)
    if not cfg.is_enabled():
        raise HTTPException(status_code=400, detail="尚未配置 SMTP")

    try:
        await email_service.send_smtp_test(cfg, data.to, db=db)
    except email_service.SMTPNotConfigured:
        raise HTTPException(status_code=400, detail="尚未配置 SMTP")
    except Exception as exc:  # pragma: no cover - SMTP errors surface here
        raise HTTPException(status_code=502, detail=f"发送失败：{exc}")

    return {"sent": True, "to": data.to}


# ── OAuth (Microsoft) ─────────────────────────────────────────────────────


@router.post("/smtp/oauth/start", response_model=OAuthStartResponse)
async def smtp_oauth_start(
    data: OAuthStartRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Begin a Microsoft OAuth consent flow. Returns the URL the browser should open.

    Requires ``oauth_client_id`` to already be saved in SMTP settings — this endpoint
    doesn't take credentials in the body, by design (forces the admin to save first so
    the callback exchange has the matching secret).
    """
    cfg = await settings_service.get_smtp_config(db)
    if not cfg.oauth_client_id:
        raise HTTPException(
            status_code=400,
            detail="请先填写并保存「客户端 ID」与「客户端密钥」，再点击授权。",
        )
    if not cfg.oauth_client_secret:
        raise HTTPException(status_code=400, detail="请先保存「客户端密钥」")

    redirect_uri = data.redirect_uri.strip()
    if not redirect_uri.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="redirect_uri 必须是 http(s) 链接")

    _purge_expired_states()
    state = secrets.token_urlsafe(24)
    _OAUTH_STATES[state] = (
        admin.id,
        redirect_uri,
        time.time() + _OAUTH_STATE_TTL_SECONDS,
    )

    authorize_url = oauth_microsoft.build_authorize_url(
        tenant=cfg.oauth_tenant_id or "consumers",
        client_id=cfg.oauth_client_id,
        redirect_uri=redirect_uri,
        state=state,
    )
    return OAuthStartResponse(authorize_url=authorize_url, state=state)


@router.post("/smtp/oauth/callback", response_model=SmtpConfigResponse)
async def smtp_oauth_callback(
    data: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Finish the OAuth flow: exchange the code for tokens and persist the refresh token."""
    _purge_expired_states()
    entry = _OAUTH_STATES.pop(data.state, None)
    if not entry:
        raise HTTPException(status_code=400, detail="授权状态已过期，请重新发起授权")
    state_admin_id, state_redirect_uri, _exp = entry
    if state_admin_id != admin.id:
        raise HTTPException(status_code=400, detail="授权状态与当前管理员不匹配")
    if state_redirect_uri != data.redirect_uri:
        raise HTTPException(status_code=400, detail="redirect_uri 与发起时不一致")

    cfg = await settings_service.get_smtp_config(db)
    if not cfg.oauth_client_id or not cfg.oauth_client_secret:
        raise HTTPException(status_code=400, detail="客户端凭据缺失")

    try:
        result = await oauth_microsoft.exchange_code(
            tenant=cfg.oauth_tenant_id or "consumers",
            client_id=cfg.oauth_client_id,
            client_secret=cfg.oauth_client_secret,
            code=data.code,
            redirect_uri=data.redirect_uri,
        )
    except oauth_microsoft.OAuthError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if not result.refresh_token:
        raise HTTPException(
            status_code=502,
            detail="Microsoft 未返回 refresh_token，请确认应用已申请 offline_access 权限",
        )

    cfg.oauth_refresh_token = result.refresh_token
    cfg.auth_method = "xoauth2_microsoft"
    # Auto-fill username from the id_token email when empty — saves the admin a step.
    if not cfg.username and result.email:
        cfg.username = result.email
    # Preset Outlook host/port if they're empty so testing works immediately.
    if not cfg.host:
        cfg.host = "smtp.office365.com"
        cfg.port = 587
        cfg.use_tls = True
        cfg.use_ssl = False

    await settings_service.set_smtp_config(db, cfg)
    return _smtp_to_response(cfg)


@router.delete("/smtp/oauth", response_model=SmtpConfigResponse)
async def smtp_oauth_revoke(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Clear the stored refresh token. Client ID/secret are preserved so re-authorizing is one click."""
    cfg = await settings_service.get_smtp_config(db)
    if cfg.oauth_refresh_token and cfg.oauth_client_id:
        oauth_microsoft.invalidate_cache_for(
            cfg.oauth_client_id, cfg.oauth_refresh_token
        )
    cfg.oauth_refresh_token = ""
    await settings_service.set_smtp_config(db, cfg)

    # Same protective downgrade as update_smtp: if email_verification mode is now
    # impossible, fall back to admin_review.
    if not cfg.is_enabled():
        mode = await settings_service.get_registration_mode(db)
        if mode == "email_verification":
            await settings_service.set_registration_mode(db, "admin_review")

    return _smtp_to_response(cfg)


# ── Long-conversation context management ─────────────────────────────────


class ContextManagementResponse(BaseModel):
    """Effective context-management policy plus the model picker the UI needs.

    The list of usable summary models is computed server-side so the admin UI doesn't
    have to second-guess which models are active. Disabled models are hidden — using
    one as a summarizer would just fail at runtime.
    """

    strategy: ContextStrategy
    trigger_rounds: int
    keep_recent_rounds: int
    summary_model_id: str | None
    auto_truncate_on_overflow: bool
    overflow_truncate_rounds: int
    summary_prompt: str
    available_models: list["ContextSummaryModelOption"]


class ContextSummaryModelOption(BaseModel):
    id: str
    display_name: str
    provider_name: str


class ContextManagementUpdate(BaseModel):
    strategy: ContextStrategy
    trigger_rounds: int = Field(ge=2, le=500)
    keep_recent_rounds: int = Field(ge=1, le=500)
    summary_model_id: str | None = None
    auto_truncate_on_overflow: bool = True
    overflow_truncate_rounds: int = Field(default=2, ge=1, le=20)
    summary_prompt: str | None = None


async def _list_summary_model_options(
    db: AsyncSession,
) -> list[ContextSummaryModelOption]:
    result = await db.execute(
        select(Model, Provider.name)
        .join(Provider, Model.provider_id == Provider.id)
        .where(Model.is_active == True)
        .where(Provider.is_active == True)
        .order_by(Provider.name, Model.display_name)
    )
    return [
        ContextSummaryModelOption(
            id=m.id, display_name=m.display_name, provider_name=pn or ""
        )
        for m, pn in result.all()
    ]


def _context_to_response(
    cfg: ContextManagementConfig, options: list[ContextSummaryModelOption]
) -> ContextManagementResponse:
    return ContextManagementResponse(
        strategy=cfg.strategy,
        trigger_rounds=cfg.trigger_rounds,
        keep_recent_rounds=cfg.keep_recent_rounds,
        summary_model_id=cfg.summary_model_id,
        auto_truncate_on_overflow=cfg.auto_truncate_on_overflow,
        overflow_truncate_rounds=cfg.overflow_truncate_rounds,
        summary_prompt=cfg.summary_prompt,
        available_models=options,
    )


@router.get("/context", response_model=ContextManagementResponse)
async def get_context_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cfg = await settings_service.get_context_config(db)
    options = await _list_summary_model_options(db)
    return _context_to_response(cfg, options)


@router.put("/context", response_model=ContextManagementResponse)
async def update_context_settings(
    data: ContextManagementUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if data.keep_recent_rounds >= data.trigger_rounds:
        raise HTTPException(
            status_code=400,
            detail="保留的最近轮数必须小于触发截断的轮数。",
        )

    options = await _list_summary_model_options(db)
    available_ids = {opt.id for opt in options}

    summary_model_id = data.summary_model_id
    if summary_model_id and summary_model_id not in available_ids:
        # Either the model was deactivated since the page loaded, or the admin sent a
        # stale id. Either way, refuse — silently dropping it would let "summarize" mode
        # succeed in saving but fail at every chat call.
        raise HTTPException(status_code=400, detail="所选总结模型不存在或已被禁用")

    if data.strategy == "summarize" and not summary_model_id:
        raise HTTPException(
            status_code=400,
            detail="启用「自动总结」策略前必须选择一个用于生成摘要的模型。",
        )

    new_cfg = ContextManagementConfig(
        strategy=data.strategy,
        trigger_rounds=data.trigger_rounds,
        keep_recent_rounds=data.keep_recent_rounds,
        summary_model_id=summary_model_id,
        auto_truncate_on_overflow=data.auto_truncate_on_overflow,
        overflow_truncate_rounds=data.overflow_truncate_rounds,
        summary_prompt=(
            data.summary_prompt.strip()
            if data.summary_prompt and data.summary_prompt.strip()
            else DEFAULT_SUMMARY_PROMPT
        ),
    )

    try:
        await settings_service.set_context_config(db, new_cfg)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return _context_to_response(new_cfg, options)


# ── Theme defaults & site branding ───────────────────────────────────────
#
# Two related settings, both stored as JSON under one app_settings key each.
# `theme_defaults` is what unauthenticated users + new users see; `branding` is
# the site name / logo / favicon and the master switch that lets/forbids users
# customizing their own appearance.


@router.get("/theme", response_model=ThemeSpec, response_model_by_alias=True)
async def get_theme_defaults_route(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return await settings_service.get_theme_defaults(db)


@router.put("/theme", response_model=ThemeSpec, response_model_by_alias=True)
async def update_theme_defaults_route(
    spec: ThemeSpec,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    await settings_service.set_theme_defaults(db, spec)
    return spec


@router.get("/branding", response_model=Branding, response_model_by_alias=True)
async def get_branding_route(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return await settings_service.get_branding(db)


@router.put("/branding", response_model=Branding, response_model_by_alias=True)
async def update_branding_route(
    branding: Branding,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    # Trim whitespace; an empty `app_name` would render as a blank brand row, so we fall
    # back to the default rather than persist the empty string.
    branding.app_name = branding.app_name.strip() or "Aurora Chat"
    branding.app_tagline = branding.app_tagline.strip()
    branding.logo_url = branding.logo_url.strip()
    branding.favicon_url = branding.favicon_url.strip()
    await settings_service.set_branding(db, branding)
    return branding


_BRANDING_ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"}
_BRANDING_MAX_BYTES = 2 * 1024 * 1024  # 2 MB


async def _save_branding_asset(
    file: UploadFile, slot: Literal["logo", "favicon"]
) -> str:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _BRANDING_ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"仅支持以下格式：{', '.join(sorted(_BRANDING_ALLOWED_EXTS))}",
        )
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(contents) > _BRANDING_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小不得超过 {_BRANDING_MAX_BYTES // 1024 // 1024} MB",
        )

    branding_dir = os.path.join(app_config.UPLOAD_DIR, "branding")
    os.makedirs(branding_dir, exist_ok=True)
    filename = f"{slot}_{secrets.token_hex(6)}{ext}"
    target_path = os.path.join(branding_dir, filename)
    with open(target_path, "wb") as f:
        f.write(contents)
    return f"/uploads/branding/{filename}"


@router.post("/branding/logo", response_model=Branding, response_model_by_alias=True)
async def upload_branding_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    url = await _save_branding_asset(file, "logo")
    branding = await settings_service.get_branding(db)
    branding.logo_url = url
    await settings_service.set_branding(db, branding)
    return branding


@router.post("/branding/favicon", response_model=Branding, response_model_by_alias=True)
async def upload_branding_favicon(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    url = await _save_branding_asset(file, "favicon")
    branding = await settings_service.get_branding(db)
    branding.favicon_url = url
    await settings_service.set_branding(db, branding)
    return branding
