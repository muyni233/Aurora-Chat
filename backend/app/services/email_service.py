"""邮件发送与验证码生命周期管理。

包含两个职责：
1. send_verification_email — 通过 SMTP 发送邮件
2. issue_code / verify_code / cleanup_expired_codes — 管理验证码行
   验证码为 6 位数字，以 SHA-256 哈希存储，数据库中永不明文保存。
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import allowed_email_domains, settings
from app.models.email_verification import EmailVerificationCode
from app.services import oauth_microsoft, settings_service
from app.services.settings_service import SmtpConfig

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 公共 API
# ---------------------------------------------------------------------------


def hash_code(code: str) -> str:
    """对验证码进行 SHA-256 哈希，加盐应用密钥以防彩虹表攻击。"""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{code}".encode("utf-8")).hexdigest()


def generate_code() -> str:
    """生成均匀随机的 6 位数字字符串（零填充）。"""
    return f"{secrets.randbelow(1_000_000):06d}"


def is_email_domain_allowed(email: str) -> bool:
    """检查邮箱域名是否在配置的白名单中（无白名单时默认允许）。"""
    domains = allowed_email_domains()
    if not domains:
        return True
    if "@" not in email:
        return False
    return email.split("@", 1)[1].lower() in domains


def _as_aware_utc(dt: datetime) -> datetime:
    """重新附加 UTC 时区信息（SQLite 可能会剥离时区）。

    对于任何原始时区的值，假定其原本为 UTC 并重新附加。
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def issue_code(db: AsyncSession, email: str, purpose: str = "register") -> str:
    """生成新验证码，持久化哈希，返回明文以供发送。

    如果同一邮箱在限速时间内重复请求则抛出 RateLimited。
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=settings.VERIFICATION_CODE_RATE_LIMIT_SECONDS)

    # 限速检查：该邮箱最近一次验证码必须早于截止时间
    result = await db.execute(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    if last:
        last_created = _as_aware_utc(last.created_at)
        if last_created > cutoff:
            wait = settings.VERIFICATION_CODE_RATE_LIMIT_SECONDS - int(
                (now - last_created).total_seconds()
            )
            raise RateLimited(max(wait, 1))

    code = generate_code()
    row = EmailVerificationCode(
        email=email,
        code_hash=hash_code(code),
        purpose=purpose,
        expires_at=now + timedelta(minutes=settings.VERIFICATION_CODE_EXPIRE_MINUTES),
    )
    db.add(row)
    await db.flush()
    return code


async def verify_code(
    db: AsyncSession, email: str, code: str, purpose: str = "register"
) -> bool:
    """验证验证码，匹配则标记为已使用。返回 True 表示验证码有效。"""
    now = datetime.now(timezone.utc)
    target_hash = hash_code(code)

    result = await db.execute(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.used_at.is_(None),
        )
        .order_by(EmailVerificationCode.created_at.desc())
    )
    rows = result.scalars().all()
    candidates = [r for r in rows if _as_aware_utc(r.expires_at) > now]
    if not candidates:
        return False

    # 无论是否匹配，递增最新验证码的尝试次数以限制暴力破解
    latest = candidates[0]
    latest.attempts += 1
    if latest.attempts > 6:
        return False

    for row in candidates:
        if row.code_hash == target_hash:
            row.used_at = now
            return True
    return False


async def cleanup_expired_codes(db: AsyncSession) -> None:
    """尽力清理过期/已使用的验证码行，随时可安全调用。"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).replace(tzinfo=None)
    await db.execute(
        EmailVerificationCode.__table__.delete().where(
            EmailVerificationCode.expires_at < cutoff
        )
    )


class RateLimited(Exception):
    def __init__(self, retry_after_seconds: int):
        super().__init__(f"请在 {retry_after_seconds} 秒后重试")
        self.retry_after = retry_after_seconds


# ---------------------------------------------------------------------------
# SMTP 发送
# ---------------------------------------------------------------------------


async def send_verification_email(
    smtp: SmtpConfig,
    to_email: str,
    code: str,
    *,
    db: AsyncSession | None = None,
) -> None:
    """使用提供的 SMTP 配置发送验证邮件。

    如果配置中没有主机则抛出 SMTPNotConfigured。
    """
    if not smtp.is_enabled():
        raise SMTPNotConfigured()

    sender_addr = smtp.from_address or smtp.username or "no-reply@aurora.chat"
    sender_pretty = formataddr((smtp.from_name, sender_addr))

    msg = EmailMessage()
    msg["Subject"] = f"{settings.APP_NAME} 注册验证码"
    msg["From"] = sender_pretty
    msg["To"] = to_email
    msg.set_content(_plaintext_body(code))
    msg.add_alternative(_html_body(code), subtype="html")

    access_token = await _resolve_access_token(smtp, db)
    await asyncio.to_thread(_smtp_send, smtp, msg, access_token)


async def send_smtp_test(
    smtp: SmtpConfig,
    to_email: str,
    *,
    db: AsyncSession | None = None,
) -> None:
    """发送 SMTP 测试邮件，供管理后台设置页面使用。"""
    if not smtp.is_enabled():
        raise SMTPNotConfigured()

    sender_addr = smtp.from_address or smtp.username or "no-reply@aurora.chat"
    sender_pretty = formataddr((smtp.from_name, sender_addr))

    msg = EmailMessage()
    msg["Subject"] = f"{settings.APP_NAME} SMTP 测试邮件"
    msg["From"] = sender_pretty
    msg["To"] = to_email
    msg.set_content(
        "这是一封 Aurora 后台发送的测试邮件。如果你收到了，说明 SMTP 配置正确。\n"
    )

    access_token = await _resolve_access_token(smtp, db)
    await asyncio.to_thread(_smtp_send, smtp, msg, access_token)


class SMTPNotConfigured(Exception):
    """在未配置 SMTP 主机时尝试发送邮件时抛出。"""


async def _resolve_access_token(
    smtp: SmtpConfig, db: AsyncSession | None
) -> str | None:
    """OAuth 模式下刷新并返回访问令牌，否则返回 None。"""
    if smtp.auth_method != "xoauth2_microsoft":
        return None
    if not smtp.oauth_refresh_token or not smtp.oauth_client_id:
        raise SMTPNotConfigured()

    try:
        result = await oauth_microsoft.refresh_access_token(
            tenant=smtp.oauth_tenant_id or "consumers",
            client_id=smtp.oauth_client_id,
            client_secret=smtp.oauth_client_secret,
            refresh_token=smtp.oauth_refresh_token,
        )
    except oauth_microsoft.OAuthError as exc:
        raise RuntimeError(f"OAuth 刷新失败：{exc}") from exc

    if (
        db is not None
        and result.refresh_token
        and result.refresh_token != smtp.oauth_refresh_token
    ):
        smtp.oauth_refresh_token = result.refresh_token
        try:
            await settings_service.set_smtp_config(db, smtp)
            await db.commit()
        except Exception:
            logger.warning("持久化轮换的 OAuth 刷新令牌失败", exc_info=True)

    return result.access_token


def _smtp_send(smtp: SmtpConfig, msg: EmailMessage, access_token: str | None) -> None:
    """同步 SMTP 发送 — 由异步调用方通过 to_thread 包装调用。"""
    timeout = 15

    try:
        if smtp.use_ssl:
            with smtplib.SMTP_SSL(smtp.host, smtp.port, timeout=timeout) as conn:
                _authenticate(conn, smtp, access_token)
                conn.send_message(msg)
        else:
            with smtplib.SMTP(smtp.host, smtp.port, timeout=timeout) as conn:
                conn.ehlo()
                if smtp.use_tls:
                    conn.starttls()
                    conn.ehlo()
                _authenticate(conn, smtp, access_token)
                conn.send_message(msg)
    except Exception as exc:
        logger.warning("SMTP 发送失败: %s", exc)
        raise


def _authenticate(
    conn: smtplib.SMTP, smtp: SmtpConfig, access_token: str | None
) -> None:
    """根据配置的认证方式执行对应的 AUTH 命令。"""
    if access_token is not None:
        # SASL XOAUTH2 认证
        sasl = f"user={smtp.username}\x01auth=Bearer {access_token}\x01\x01"
        b64 = base64.b64encode(sasl.encode("utf-8")).decode("ascii")
        code, response = conn.docmd("AUTH", "XOAUTH2 " + b64)
        if code != 235:
            if code == 334:
                conn.docmd("")
            raise smtplib.SMTPAuthenticationError(code, response)
        return

    if smtp.username:
        conn.login(smtp.username, smtp.password)


def _plaintext_body(code: str) -> str:
    return (
        f"您好！\n\n"
        f"您的 {settings.APP_NAME} 注册验证码是：{code}\n"
        f"该验证码 {settings.VERIFICATION_CODE_EXPIRE_MINUTES} 分钟内有效。\n\n"
        f"如非本人操作，请忽略此邮件。\n"
    )


def _html_body(code: str) -> str:
    return f"""\
<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:32px;background:#FAFAFB;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0B1020;">
    <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #ECEEF2;border-radius:24px;padding:32px;">
      <div style="font-size:0.7rem;letter-spacing:0.18em;color:#6366F1;font-weight:700;text-transform:uppercase;">
        {settings.APP_NAME}
      </div>
      <h1 style="margin:8px 0 16px;font-size:1.6rem;font-weight:800;letter-spacing:-0.02em;">注册验证码</h1>
      <p style="color:#5C6478;line-height:1.7;margin:0 0 24px;">
        请将下面的 6 位验证码填入注册页面以完成账号创建。验证码 {settings.VERIFICATION_CODE_EXPIRE_MINUTES} 分钟内有效。
      </p>
      <div style="font-size:2.4rem;font-weight:800;letter-spacing:0.4em;text-align:center;
                  padding:20px;border-radius:16px;
                  background:linear-gradient(135deg,#EEF2FF 0%,#F0F9FF 100%);
                  color:#4F46E5;">
        {code}
      </div>
      <p style="color:#8B92A4;font-size:0.85rem;margin:24px 0 0;">
        如非本人操作，请忽略此邮件。
      </p>
    </div>
  </body>
</html>
"""
