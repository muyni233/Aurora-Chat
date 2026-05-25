import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.agent import Agent, AgentModel
from app.models.model import Model
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse
from app.schemas.model import ModelResponse
from app.deps import require_admin, get_current_user
from app.models.user import User
from app.config import settings

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _agent_response(agent: Agent, model_ids: list[str] = []) -> AgentResponse:
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        nickname=agent.nickname,
        avatar_url=agent.avatar_url,
        system_prompt=agent.system_prompt,
        description=agent.description,
        greeting_message=agent.greeting_message,
        temperature=agent.temperature,
        top_p=agent.top_p,
        max_tokens=agent.max_tokens,
        is_active=agent.is_active,
        created_at=agent.created_at.isoformat(),
        updated_at=agent.updated_at.isoformat(),
        model_ids=model_ids,
    )


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出所有智能体。普通用户仅能看到激活的；管理员能看到全部。"""
    query = select(Agent)
    if current_user.role != "admin":
        query = query.where(Agent.is_active == True)
    query = query.order_by(Agent.created_at.desc())
    result = await db.execute(query)
    agents = result.scalars().all()

    response = []
    for agent in agents:
        am_result = await db.execute(
            select(AgentModel.model_id).where(AgentModel.agent_id == agent.id)
        )
        model_ids = [row[0] for row in am_result.all()]
        response.append(_agent_response(agent, model_ids))
    return response


@router.post("", response_model=AgentResponse)
async def create_agent(
    data: AgentCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """创建新的智能体（仅管理员）。"""
    agent_data = data.model_dump(exclude={"model_ids"})
    agent = Agent(**agent_data)
    db.add(agent)
    await db.flush()
    await db.refresh(agent)
    for mid in data.model_ids:
        db.add(AgentModel(agent_id=agent.id, model_id=mid))
    await db.flush()
    return _agent_response(agent, data.model_ids)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """更新智能体（仅管理员）。"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = data.model_dump(exclude_unset=True, exclude={"model_ids"})
    for key, value in update_data.items():
        setattr(agent, key, value)

    if data.model_ids is not None:
        am_result = await db.execute(
            select(AgentModel).where(AgentModel.agent_id == agent_id)
        )
        for am in am_result.scalars().all():
            await db.delete(am)
        for mid in data.model_ids:
            db.add(AgentModel(agent_id=agent.id, model_id=mid))

    await db.flush()
    await db.refresh(agent)
    am_result = await db.execute(
        select(AgentModel.model_id).where(AgentModel.agent_id == agent.id)
    )
    current_model_ids = [row[0] for row in am_result.all()]
    return _agent_response(agent, current_model_ids)


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """删除智能体（仅管理员）。"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.delete(agent)
    await db.flush()
    return {"message": "Agent deleted"}


@router.post("/{agent_id}/avatar")
async def upload_avatar(
    agent_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """为智能体上传头像图片。"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    allowed = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Invalid image type")

    ext = file.filename.split(".")[-1] if file.filename else "png"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, "avatars", filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    agent.avatar_url = f"/uploads/avatars/{filename}"
    await db.flush()
    return {"avatar_url": agent.avatar_url}


@router.get("/{agent_id}/models", response_model=list[ModelResponse])
async def get_agent_models(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """获取智能体可用的模型列表。

    会过滤掉未激活的模型以及其服务商未激活的模型——这两类都无法实际处理请求，
    在聊天下拉框中显示它们只会误导用户。返回的行中包含了服务商名称和类型，
    以便前端在多个服务商存在同名模型时能够区分，并选择正确的品牌图标。
    """
    from app.models.provider import Provider

    result = await db.execute(
        select(Model, Provider.name, Provider.provider_type)
        .join(AgentModel, AgentModel.model_id == Model.id)
        .join(Provider, Provider.id == Model.provider_id)
        .where(AgentModel.agent_id == agent_id)
        .where(Model.is_active == True)
        .where(Provider.is_active == True)
        .order_by(Model.display_name.asc())
    )
    rows = result.all()
    return [
        ModelResponse(
            id=m.id,
            provider_id=m.provider_id,
            provider_name=pname,
            provider_type=ptype,
            model_id=m.model_id,
            display_name=m.display_name,
            description=m.description,
            is_active=m.is_active,
            supports_vision=m.supports_vision,
            supports_tools=m.supports_tools,
            stream_enabled=m.stream_enabled,
            show_thinking=m.show_thinking,
            created_at=m.created_at.isoformat(),
        )
        for m, pname, ptype in rows
    ]
