"""个人用户界面偏好设置。目前仅包含主题配置——模式/预设/自定义调色板/
背景图片/圆角/字体缩放/动画强度。

读取来自 ``users.theme_preferences``（JSON 字段）；写入受管理员设置的
``branding.allow_user_override`` 标志控制，以便在锁定部署环境中强制所有用户
使用统一的配色方案。

所有响应模型均使用 ``_CamelModel``/``response_model_by_alias=True``，
以确保网络传输格式为驼峰命名（与 TypeScript 的 ``ThemeSpec`` 匹配）。
内部 Python 结构通过 ``settings_service.py`` 中的别名生成器配置保持蛇形命名。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.services import settings_service
from app.services.settings_service import Branding, ThemeSpec, _CamelModel

router = APIRouter(prefix="/api/me", tags=["me"])


class MyThemeResponse(_CamelModel):
    """前端完整应用正确主题所需的数据。

    ``effective`` 是 UI 实际应该渲染的主题——当用户设置了主题且允许覆盖时，
    它使用用户的配置，否则使用管理员默认值。``user`` 和 ``defaults``
    分别暴露，以便设置页面可以显示"你的自定义"与"站点默认"。
    """

    user: ThemeSpec | None
    defaults: ThemeSpec
    effective: ThemeSpec
    branding: Branding
    allow_override: bool

    # ``_CamelModel`` 已经提供了别名生成器，因此 ``allow_override`` 会自动
    # 在传输中变为 ``allowOverride``。
    model_config = ConfigDict(
        alias_generator=_CamelModel.model_config["alias_generator"],
        populate_by_name=True,
    )


def _resolve_effective(
    user_spec: ThemeSpec | None,
    defaults: ThemeSpec,
    allow_override: bool,
) -> ThemeSpec:
    if not allow_override:
        return defaults
    if user_spec is None:
        return defaults

    # 如果用户设置了自定义配置，但没有设置自己的背景（kind 为 "none"），
    # 则应继承管理员设置的系统默认背景壁纸！
    effective = user_spec.model_copy(deep=True)
    if effective.background.kind == "none" and defaults.background.kind != "none":
        effective.background = defaults.background
    return effective


@router.get("/theme", response_model=MyThemeResponse, response_model_by_alias=True)
async def get_my_theme(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_spec = settings_service.parse_user_theme(current_user.theme_preferences)
    defaults = await settings_service.get_theme_defaults(db)
    branding = await settings_service.get_branding(db)
    effective = _resolve_effective(user_spec, defaults, branding.allow_user_override)
    return MyThemeResponse(
        user=user_spec,
        defaults=defaults,
        effective=effective,
        branding=branding,
        allow_override=branding.allow_user_override,
    )


@router.put("/theme", response_model=MyThemeResponse, response_model_by_alias=True)
async def update_my_theme(
    spec: ThemeSpec,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    branding = await settings_service.get_branding(db)
    if not branding.allow_user_override:
        raise HTTPException(
            status_code=403,
            detail="管理员已锁定主题，无法修改个人外观偏好。",
        )

    current_user.theme_preferences = settings_service.serialize_user_theme(spec)
    await db.flush()

    defaults = await settings_service.get_theme_defaults(db)
    effective = _resolve_effective(spec, defaults, True)
    return MyThemeResponse(
        user=spec,
        defaults=defaults,
        effective=effective,
        branding=branding,
        allow_override=True,
    )


@router.delete("/theme", response_model=MyThemeResponse, response_model_by_alias=True)
async def reset_my_theme(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """清除个人主题覆盖，回退到管理员默认设置。"""
    current_user.theme_preferences = None
    await db.flush()
    defaults = await settings_service.get_theme_defaults(db)
    branding = await settings_service.get_branding(db)
    return MyThemeResponse(
        user=None,
        defaults=defaults,
        effective=defaults,
        branding=branding,
        allow_override=branding.allow_user_override,
    )


# ── 匿名访问：公开的品牌信息 + 默认主题 ──────────────────────────
#
# 登录/注册页面在用户认证之前就需要品牌信息（app_name、logo）和默认主题
# 才能正确渲染。通过下方的 /api/public/* 端点对外暴露。

public_router = APIRouter(prefix="/api/public", tags=["public"])


class PublicAppearanceResponse(_CamelModel):
    branding: Branding
    defaults: ThemeSpec


@public_router.get(
    "/appearance", response_model=PublicAppearanceResponse, response_model_by_alias=True
)
async def get_public_appearance(db: AsyncSession = Depends(get_db)):
    branding = await settings_service.get_branding(db)
    defaults = await settings_service.get_theme_defaults(db)
    return PublicAppearanceResponse(branding=branding, defaults=defaults)
