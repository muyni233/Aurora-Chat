from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import litellm
from app.database import get_db
from app.models.provider import Provider
from app.models.model import Model
from app.schemas.provider import ProviderCreate, ProviderUpdate, ProviderResponse
from app.deps import require_admin
from app.models.user import User
from app.services.llm_service import build_litellm_kwargs

router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=list[ProviderResponse])
async def list_providers(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """列出所有服务商（仅管理员）。"""
    result = await db.execute(select(Provider).order_by(Provider.created_at.desc()))
    providers = result.scalars().all()

    response = []
    for p in providers:
        # 统计模型数量
        count_result = await db.execute(
            select(func.count(Model.id)).where(Model.provider_id == p.id)
        )
        model_count = count_result.scalar() or 0

        response.append(
            ProviderResponse(
                id=p.id,
                name=p.name,
                provider_type=p.provider_type,
                base_url=p.base_url,
                description=p.description,
                is_active=p.is_active,
                created_at=p.created_at.isoformat(),
                updated_at=p.updated_at.isoformat(),
                model_count=model_count,
            )
        )
    return response


@router.post("", response_model=ProviderResponse)
async def create_provider(
    data: ProviderCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """创建新服务商。"""
    provider = Provider(**data.model_dump())
    db.add(provider)
    await db.flush()
    await db.refresh(provider)
    return ProviderResponse(
        id=provider.id,
        name=provider.name,
        provider_type=provider.provider_type,
        base_url=provider.base_url,
        description=provider.description,
        is_active=provider.is_active,
        created_at=provider.created_at.isoformat(),
        updated_at=provider.updated_at.isoformat(),
    )


@router.put("/{provider_id}", response_model=ProviderResponse)
async def update_provider(
    provider_id: str,
    data: ProviderUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """更新服务商。"""
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    update_data = data.model_dump(exclude_unset=True)
    # 防御性处理：空值或 null 的 api_key 始终表示"保留现有密钥不做更改"。
    # 前端的重置流程仅在管理员实际输入了新密钥时才会发送 api_key，
    # 但若在此接受空字符串 ""，则任何不相关的表单保存都会悄悄清空正在使用的密钥。
    # 因此在应用更新前将其从数据中移除。
    if "api_key" in update_data and not update_data["api_key"]:
        update_data.pop("api_key")
    for key, value in update_data.items():
        setattr(provider, key, value)
    await db.flush()
    await db.refresh(provider)

    return ProviderResponse(
        id=provider.id,
        name=provider.name,
        provider_type=provider.provider_type,
        base_url=provider.base_url,
        description=provider.description,
        is_active=provider.is_active,
        created_at=provider.created_at.isoformat(),
        updated_at=provider.updated_at.isoformat(),
    )


@router.delete("/{provider_id}")
async def delete_provider(
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """删除服务商及其模型。"""
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    await db.delete(provider)
    await db.flush()
    return {"message": "Provider deleted"}


@router.post("/{provider_id}/duplicate", response_model=ProviderResponse)
async def duplicate_provider(
    provider_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """复制一个服务商，包括其 API 密钥以及所有关联的模型。

    复制后的服务商名称将附加"（副本）"后缀。副本会继承源服务商的
    ``is_active`` 标志——管理员可以在之后根据需要关闭它。
    返回新服务商的完整 ProviderResponse，包含已填充的 ``model_count``，
    以便前端可以刷新并直接选中它，而无需额外的列表查询往返。
    """
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    src = result.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Provider not found")

    new_provider = Provider(
        name=f"{src.name} (副本)",
        provider_type=src.provider_type,
        base_url=src.base_url,
        api_key=src.api_key,
        description=src.description,
        is_active=src.is_active,
    )
    db.add(new_provider)
    await db.flush()
    await db.refresh(new_provider)

    # 复制子模型。使用级联关系是最理想的方式，但无论如何我们都需要显式地
    # 重新绑定 provider_id，所以直接遍历复制即可。
    models_result = await db.execute(select(Model).where(Model.provider_id == src.id))
    new_count = 0
    for m in models_result.scalars().all():
        db.add(
            Model(
                provider_id=new_provider.id,
                model_id=m.model_id,
                display_name=m.display_name,
                description=m.description,
                is_active=m.is_active,
            )
        )
        new_count += 1
    await db.flush()

    return ProviderResponse(
        id=new_provider.id,
        name=new_provider.name,
        provider_type=new_provider.provider_type,
        base_url=new_provider.base_url,
        description=new_provider.description,
        is_active=new_provider.is_active,
        created_at=new_provider.created_at.isoformat(),
        updated_at=new_provider.updated_at.isoformat(),
        model_count=new_count,
    )


# ── 连接测试 ─────────────────────────────────────────────────────────────────


class ProviderTestRequest(BaseModel):
    """可以按数据库 ID 选择现有模型行，也可以直接传入 LiteLLM 模型 ID。"""

    model_db_id: str | None = None
    model_id: str | None = None


class ProviderTestResponse(BaseModel):
    ok: bool
    model: str
    reply: str | None = None
    error: str | None = None


@router.post("/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    provider_id: str,
    data: ProviderTestRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """运行一次短小的补全请求，以验证 API 密钥和基础 URL 是否有效。

    按以下顺序确定 LiteLLM 模型 ID：
    1. ``data.model_db_id`` —— 查找对应的数据库行。
    2. ``data.model_id``    —— 直接使用。
    3. 该服务商下第一个已激活的模型。

    无论如何都返回 200 状态码；通过 ``ok`` 字段来区分成功与失败，
    以便前端可以原样显示服务商返回的错误信息，而不是被 HTTP 错误码误导。
    """
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    model_litellm_id: str | None = None

    if data.model_db_id:
        r = await db.execute(
            select(Model).where(
                Model.id == data.model_db_id, Model.provider_id == provider_id
            )
        )
        m = r.scalar_one_or_none()
        if not m:
            raise HTTPException(
                status_code=404, detail="Model not found for this provider"
            )
        model_litellm_id = m.model_id
    elif data.model_id:
        model_litellm_id = data.model_id
    else:
        r = await db.execute(
            select(Model)
            .where(Model.provider_id == provider_id, Model.is_active.is_(True))
            .order_by(Model.created_at.asc())
            .limit(1)
        )
        m = r.scalar_one_or_none()
        if not m:
            raise HTTPException(
                status_code=400,
                detail="该服务商下尚未添加可用模型，无法测试。请先添加一个模型或在请求中提供 model_id。",
            )
        model_litellm_id = m.model_id

    try:
        kwargs: dict = {
            **build_litellm_kwargs(provider, model_litellm_id),
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 8,
            "temperature": 0,
            "stream": False,
            "timeout": 15,
        }
    except ValueError as ve:
        # build_litellm_kwargs 在配置错误（如 api_key 为空）时会抛出此异常。
        # 将其作为正常的 "ok=false" 返回，以便前端以内联方式显示，而不是返回 500 错误。
        return ProviderTestResponse(
            ok=False, model=model_litellm_id or "", error=str(ve)
        )

    try:
        resp = await litellm.acompletion(**kwargs)
        reply = ""
        try:
            reply = resp.choices[0].message.content or ""
        except Exception:
            reply = ""
        return ProviderTestResponse(
            ok=True, model=kwargs["model"], reply=reply.strip()[:120]
        )
    except Exception as exc:
        return ProviderTestResponse(
            ok=False, model=kwargs["model"], error=str(exc)[:500]
        )
