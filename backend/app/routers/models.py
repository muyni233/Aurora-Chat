from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.model import Model
from app.models.provider import Provider
from app.schemas.model import ModelCreate, ModelUpdate, ModelResponse
from app.deps import require_admin
from app.models.user import User

router = APIRouter(prefix="/api/models", tags=["models"])


def _model_response(
    model: Model, provider_name: str = "", provider_type: str = ""
) -> ModelResponse:
    return ModelResponse(
        id=model.id,
        provider_id=model.provider_id,
        provider_name=provider_name,
        provider_type=provider_type,
        model_id=model.model_id,
        display_name=model.display_name,
        description=model.description,
        is_active=model.is_active,
        supports_vision=model.supports_vision,
        supports_tools=model.supports_tools,
        stream_enabled=model.stream_enabled,
        show_thinking=model.show_thinking,
        created_at=model.created_at.isoformat(),
    )


@router.get("", response_model=list[ModelResponse])
async def list_models(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """列出所有模型（仅管理员）。"""
    result = await db.execute(
        select(Model, Provider.name, Provider.provider_type)
        .join(Provider, Model.provider_id == Provider.id)
        .order_by(Model.created_at.desc())
    )
    rows = result.all()
    return [_model_response(m, pn, pt) for m, pn, pt in rows]


@router.post("", response_model=ModelResponse)
async def create_model(
    data: ModelCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """创建新模型。"""
    # 验证服务商是否存在
    result = await db.execute(select(Provider).where(Provider.id == data.provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    model = Model(**data.model_dump())
    db.add(model)
    await db.flush()
    await db.refresh(model)
    return _model_response(model, provider.name, provider.provider_type)


@router.put("/{model_id}", response_model=ModelResponse)
async def update_model(
    model_id: str,
    data: ModelUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """更新模型。"""
    result = await db.execute(
        select(Model, Provider.name, Provider.provider_type)
        .join(Provider, Model.provider_id == Provider.id)
        .where(Model.id == model_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Model not found")

    model, provider_name, provider_type = row
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(model, key, value)
    await db.flush()
    await db.refresh(model)
    return _model_response(model, provider_name, provider_type)


@router.delete("/{model_id}")
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """删除模型。"""
    result = await db.execute(select(Model).where(Model.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    await db.delete(model)
    await db.flush()
    return {"message": "Model deleted"}
