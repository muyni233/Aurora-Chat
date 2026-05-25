"""管理其他用户的管理员接口。

通过 require_admin 强制授权。路由器有意防范两种误操作：
* 不能删除或降级自己
* 不能删除或降级最后一位管理员
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models.user import User
from app.schemas.auth import AdminUserResponse, AdminUserUpdate

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


def _to_response(user: User) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
        updated_at=user.updated_at.isoformat(),
    )


async def _admin_count(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.role == "admin", User.is_active.is_(True))
    )
    return int(result.scalar_one())


@router.get("", response_model=list[AdminUserResponse])
async def list_users(
    status: str | None = Query(None, description="active | pending | all"),
    search: str | None = Query(None, description="match against username or email"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(User)
    if status == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif status == "pending":
        stmt = stmt.where(User.is_active.is_(False))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(User.username.ilike(like), User.email.ilike(like)))
    stmt = stmt.order_by(User.created_at.desc())

    result = await db.execute(stmt)
    return [_to_response(u) for u in result.scalars()]


@router.patch("/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin),
):
    """审核/禁用用户或更改其角色。"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 防止将自己锁在门外
    if user.id == actor.id and data.role and data.role != "admin":
        raise HTTPException(status_code=400, detail="不能取消自己的管理员身份")
    if user.id == actor.id and data.is_active is False:
        raise HTTPException(status_code=400, detail="不能停用自己的账号")

    if data.role is not None:
        if data.role not in {"user", "admin"}:
            raise HTTPException(status_code=400, detail="角色只能是 user 或 admin")
        # 禁止降级最后一位管理员
        if user.role == "admin" and data.role == "user" and await _admin_count(db) <= 1:
            raise HTTPException(status_code=400, detail="必须保留至少一名管理员")
        user.role = data.role

    if data.is_active is not None:
        if (
            user.role == "admin"
            and data.is_active is False
            and await _admin_count(db) <= 1
        ):
            raise HTTPException(status_code=400, detail="必须保留至少一名活跃管理员")
        user.is_active = data.is_active

    await db.flush()
    await db.refresh(user)
    return _to_response(user)


@router.post("/{user_id}/approve", response_model=AdminUserResponse)
async def approve_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """便捷接口：一键审核通过用户。"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_active = True
    await db.flush()
    await db.refresh(user)
    return _to_response(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == actor.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    if user.role == "admin" and await _admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="必须保留至少一名活跃管理员")

    await db.delete(user)
    await db.flush()
