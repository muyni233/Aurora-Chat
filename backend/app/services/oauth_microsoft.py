"""Microsoft 身份平台 v2.0 OAuth 辅助模块，用于 SMTP XOAUTH2 认证。

供 email_service 使用，在 Microsoft 弃用基本认证后通过 OAuth 对接 Outlook / Microsoft 365 SMTP。

三个操作：
1. build_authorize_url — 生成管理员浏览器访问的授权 URL
2. exchange_code — 将重定向返回的 code 换取令牌
3. refresh_access_token — 用存储的刷新令牌换取新的访问令牌
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)


# 授权范围：SMTP 发送权限 + 离线访问 + 邮箱信息
SCOPES = "https://outlook.office.com/SMTP.Send offline_access openid email"

AUTHORIZE_URL_TEMPLATE = (
    "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
)
TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


@dataclass
class TokenResult:
    access_token: str
    refresh_token: str
    expires_in: int
    email: str = ""


def build_authorize_url(
    *, tenant: str, client_id: str, redirect_uri: str, state: str
) -> str:
    """生成管理员浏览器授权 URL。"""
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "response_mode": "query",
        "scope": SCOPES,
        "state": state,
        "prompt": "select_account",
    }
    tenant_safe = tenant or "consumers"
    return AUTHORIZE_URL_TEMPLATE.format(tenant=tenant_safe) + "?" + urlencode(params)


async def exchange_code(
    *,
    tenant: str,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
) -> TokenResult:
    """用授权码换取访问令牌和刷新令牌。"""
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
        "scope": SCOPES,
    }
    return await _post_token(tenant, data)


async def refresh_access_token(
    *,
    tenant: str,
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> TokenResult:
    """用刷新令牌换取新的访问令牌。优先使用内存缓存。"""
    cached = _cache_get(client_id, refresh_token)
    if cached is not None:
        return TokenResult(
            access_token=cached, refresh_token=refresh_token, expires_in=0
        )

    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "scope": SCOPES,
    }
    result = await _post_token(tenant, data)
    if not result.refresh_token:
        result.refresh_token = refresh_token
    _cache_put(client_id, result.refresh_token, result.access_token, result.expires_in)
    return result


# ── 内部实现 ──────────────────────────────────────────────────────────────


async def _post_token(tenant: str, data: dict[str, str]) -> TokenResult:
    url = TOKEN_URL_TEMPLATE.format(tenant=tenant or "consumers")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            data=data,
            headers={"Accept": "application/json"},
        )
    if resp.status_code != 200:
        try:
            payload = resp.json()
            detail = (
                payload.get("error_description") or payload.get("error") or resp.text
            )
        except Exception:
            detail = resp.text
        logger.warning(
            "Microsoft 令牌端点返回 %s: %s", resp.status_code, detail
        )
        raise OAuthError(f"Microsoft 令牌端点错误: {detail}")

    payload = resp.json()
    access_token: str = payload.get("access_token", "")
    refresh_token: str = payload.get("refresh_token", "")
    expires_in: int = int(payload.get("expires_in") or 3600)
    email = _email_from_id_token(payload.get("id_token", ""))
    if not access_token:
        raise OAuthError("Microsoft 令牌响应缺少 access_token")
    return TokenResult(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        email=email,
    )


def _email_from_id_token(id_token: str) -> str:
    """从 Microsoft id_token 中提取邮箱声明（不验证签名，仅用于预填）。"""
    if not id_token or id_token.count(".") != 2:
        return ""
    try:
        import base64
        import json

        _, payload_b64, _ = id_token.split(".")
        padding = "=" * (-len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(payload_b64 + padding)
        claims = json.loads(decoded)
    except Exception:
        return ""
    return (
        claims.get("email")
        or claims.get("preferred_username")
        or claims.get("upn")
        or ""
    )


# 进程内访问令牌缓存，按 (client_id, sha256(refresh_token)) 为键
_TOKEN_CACHE: dict[tuple[str, str], tuple[str, float]] = {}
_REFRESH_SAFETY_MARGIN_SECONDS = 60


def _cache_key(client_id: str, refresh_token: str) -> tuple[str, str]:
    digest = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
    return (client_id, digest)


def _cache_get(client_id: str, refresh_token: str) -> Optional[str]:
    key = _cache_key(client_id, refresh_token)
    entry = _TOKEN_CACHE.get(key)
    if not entry:
        return None
    token, expires_at = entry
    if expires_at <= time.time():
        _TOKEN_CACHE.pop(key, None)
        return None
    return token


def _cache_put(
    client_id: str, refresh_token: str, access_token: str, expires_in: int
) -> None:
    if not access_token or expires_in <= 0:
        return
    expires_at = time.time() + max(expires_in - _REFRESH_SAFETY_MARGIN_SECONDS, 30)
    _TOKEN_CACHE[_cache_key(client_id, refresh_token)] = (access_token, expires_at)


def invalidate_cache_for(client_id: str, refresh_token: str) -> None:
    _TOKEN_CACHE.pop(_cache_key(client_id, refresh_token), None)


class OAuthError(Exception):
    """Microsoft 令牌端点返回非成功响应时抛出。"""
