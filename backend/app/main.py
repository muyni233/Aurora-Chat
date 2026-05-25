import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import cors_origins, settings
from app.database import init_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动
    await init_db()
    logger.info("Aurora-Chat 后端已启动。")
    yield
    # 关闭
    logger.info("Aurora-Chat 后端正在关闭。")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 上传文件静态服务
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# 注册路由
from app.routers import (
    auth,
    providers,
    models,
    agents,
    conversations,
    messages,
    chat,
    admin,
    admin_settings,
    admin_database,
    uploads,
    settings_user,
)

app.include_router(auth.router)
app.include_router(providers.router)
app.include_router(models.router)
app.include_router(agents.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(chat.router)
app.include_router(uploads.router)
app.include_router(admin.router)
app.include_router(admin_settings.router)
app.include_router(admin_database.router)
app.include_router(settings_user.router)
app.include_router(settings_user.public_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
