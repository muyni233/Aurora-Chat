import logging
import os
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import allowed_email_domains, settings
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ProfileUpdate,
    RegisterConfig,
    RegisterResponse,
    RequestCodeRequest,
    RequestCodeResponse,
    Token,
    UserLogin,
    UserRegister,
    UserResponse,
)
from app.services import email_service, settings_service
from app.services.auth_service import (
    create_access_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


# 辅助函数


def _user_to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


def _check_email_domain(email: str) -> None:
    if not email_service.is_email_domain_allowed(email):
        raise HTTPException(
            status_code=400,
            detail=(
                "邮箱域名不在允许列表中，可用域名："
                + ", ".join(allowed_email_domains())
            ),
        )


async def _user_count(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return int(result.scalar_one())


# 公共注册配置 — 驱动前端 UI


@router.get("/register/config", response_model=RegisterConfig)
async def register_config(db: AsyncSession = Depends(get_db)):
    """告知前端当前激活的注册模式。"""
    mode = await settings_service.get_registration_mode(db)
    smtp_ok = await settings_service.is_smtp_enabled(db)
    # 邮箱验证模式仅在 SMTP 可用时有效，否则降级为管理员审核
    if mode == "email_verification" and not smtp_ok:
        mode = "admin_review"
    return RegisterConfig(
        mode=mode,
        email_verification_available=smtp_ok,
        allowed_email_domains=allowed_email_domains(),
    )


# 注册第一步：请求验证码


@router.post("/register/request-code", response_model=RequestCodeResponse)
async def request_register_code(
    data: RequestCodeRequest, db: AsyncSession = Depends(get_db)
):
    """向指定邮箱发送一次性 6 位验证码。"""
    mode = await settings_service.get_registration_mode(db)
    if mode != "email_verification":
        raise HTTPException(
            status_code=400,
            detail="当前注册模式不需要邮箱验证码。",
        )
    smtp_cfg = await settings_service.get_smtp_config(db)
    if not smtp_cfg.is_enabled():
        raise HTTPException(
            status_code=503,
            detail="邮箱验证未启用，请联系管理员。",
        )

    _check_email_domain(data.email)

    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该邮箱已被注册")

    try:
        code = await email_service.issue_code(db, data.email, purpose="register")
    except email_service.RateLimited as exc:
        raise HTTPException(
            status_code=429,
            detail=f"请求过于频繁，请 {exc.retry_after} 秒后再试",
            headers={"Retry-After": str(exc.retry_after)},
        )

    try:
        await email_service.send_verification_email(smtp_cfg, data.email, code, db=db)
    except email_service.SMTPNotConfigured:
        raise HTTPException(status_code=503, detail="邮件服务未配置")
    except Exception as exc:
        logger.exception("验证邮件发送失败")
        raise HTTPException(status_code=502, detail=f"邮件发送失败：{exc}")

    return RequestCodeResponse(
        sent=True,
        resend_after_seconds=settings.VERIFICATION_CODE_RATE_LIMIT_SECONDS,
    )


# 注册第二步：创建账户


@router.post("/register", response_model=RegisterResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """创建新账户。行为根据当前注册模式分支：

    - open               → 账户立即激活，返回令牌
    - admin_review       → 创建账户但 is_active=False，等待审核
    - email_verification → 需要验证码，验证通过后激活

    特例：如果尚无用户存在，注册者成为首位管理员且无条件激活。
    """
    _check_email_domain(data.email)

    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已被使用")

    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    is_first_user = (await _user_count(db)) == 0

    if is_first_user:
        role = "admin"
        is_active = True
    else:
        mode = await settings_service.get_registration_mode(db)

        if mode == "email_verification":
            smtp_cfg = await settings_service.get_smtp_config(db)
            if not smtp_cfg.is_enabled():
                raise HTTPException(
                    status_code=503,
                    detail="邮箱验证模式已启用但 SMTP 未配置，请联系管理员。",
                )
            if not data.code:
                raise HTTPException(status_code=400, detail="请填写邮箱验证码")
            ok = await email_service.verify_code(
                db, data.email, data.code, purpose="register"
            )
            if not ok:
                raise HTTPException(status_code=400, detail="验证码无效或已过期")
            is_active = True
        elif mode == "admin_review":
            is_active = False
        else:
            is_active = True

        role = "user"

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=role,
        is_active=is_active,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    if is_active:
        token = create_access_token({"sub": user.id, "role": user.role})
        message = (
            "你已成为本系统的首位管理员，欢迎加入 Aurora Chat。"
            if is_first_user
            else None
        )
        return RegisterResponse(
            status="active",
            access_token=token,
            message=message,
        )

    return RegisterResponse(
        status="pending",
        access_token=None,
        message="账号已创建，等待管理员审核通过后即可登录。",
    )


# 登录（邮箱 + 密码）


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """邮箱/密码登录。

    通过 email 列查找用户，区分三种失败情况：
    - 凭据错误 → 401
    - 待审核/已停用 → 403
    """
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号尚未通过审核或已被停用，请联系管理员。",
        )

    access_token = create_access_token({"sub": user.id, "role": user.role})
    return Token(access_token=access_token)


# 个人资料接口


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_to_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新当前用户的个人资料。密码修改始终需要当前密码。"""
    if data.username and data.username != current_user.username:
        existing = await db.execute(
            select(User).where(
                User.username == data.username, User.id != current_user.id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="用户名已被使用")
        current_user.username = data.username

    if data.email is not None and data.email != current_user.email:
        _check_email_domain(data.email)
        existing = await db.execute(
            select(User).where(User.email == data.email, User.id != current_user.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="邮箱已被注册")
        current_user.email = data.email

    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url or None

    if data.new_password:
        if not data.current_password or not verify_password(
            data.current_password, current_user.password_hash
        ):
            raise HTTPException(status_code=400, detail="当前密码不正确")
        current_user.password_hash = hash_password(data.new_password)

    await db.flush()
    await db.refresh(current_user)
    return _user_to_response(current_user)


# 头像上传 — multipart，保存在 uploads/avatars/ 目录


_AVATAR_ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_AVATAR_MAX_BYTES = 4 * 1024 * 1024  # 4 MB


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """接受 multipart 头像上传，保存并更新用户资料。"""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _AVATAR_ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail="仅支持 PNG / JPG / WEBP / GIF 格式的图片",
        )

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(contents) > _AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="头像文件不得超过 4 MB")

    avatar_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)

    filename = f"{current_user.id}_{secrets.token_hex(6)}{ext}"
    target_path = os.path.join(avatar_dir, filename)
    with open(target_path, "wb") as f:
        f.write(contents)

    # 尽力清理旧头像
    old = current_user.avatar_url
    if old and old.startswith("/uploads/avatars/"):
        old_name = os.path.basename(old)
        old_path = os.path.join(avatar_dir, old_name)
        if os.path.isfile(old_path) and old_path != target_path:
            try:
                os.remove(old_path)
            except OSError:
                pass

    current_user.avatar_url = f"/uploads/avatars/{filename}"
    await db.flush()
    await db.refresh(current_user)
    return _user_to_response(current_user)
