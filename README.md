# Aurora Chat

> ⚠️ **注意：本项目目前为半成品，仍在开发中，部分功能可能不稳定或未完成。**

Aurora Chat 是一个基于 Web 的 AI 聊天应用，采用桌面操作系统风格的用户界面（Aether OS），支持多种 LLM 提供商。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 16 + React 19 + TypeScript |
| 样式 | Tailwind CSS 4 + Radix UI + Framer Motion |
| 后端框架 | FastAPI (Python 3) |
| 数据库 | SQLite + SQLAlchemy 2 (异步) |
| LLM 网关 | LiteLLM（统一多提供商 API） |
| 认证 | JWT + bcrypt |

## 功能特性

- 桌面操作系统风格 UI（窗口管理、Dock、菜单栏、壁纸）
- 多 LLM 提供商支持（OpenAI 兼容、Anthropic、Google Gemini、Cohere 等）
- 自定义 AI 智能体（系统提示词、温度、上下文窗口）
- 流式聊天（SSE）+ 思维链可视化
- 图片/文件附件上传（多模态）
- 长对话自动摘要与截断
- 用户注册（开放 / 管理员审核 / 邮箱验证码 三种模式）
- 管理后台（提供商、模型、智能体、用户、数据库、品牌、主题）
- 毛玻璃主题系统（亮色/暗色/跟随系统）

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+
- Windows（脚本为 PowerShell 编写）

### 一键部署

```bat
deploy.bat
```

此脚本将自动完成：创建 Python 虚拟环境 → 安装依赖 → 生成配置文件 → 构建前端。

### 开发模式

```bat
dev.bat
```

同时启动 FastAPI 热重载（端口 8000）和 Next.js Turbopack HMR（端口 3000）。

### 生产模式

```bat
start.bat
```

### 卸载

```bat
undeploy.bat
```

停止进程并清理虚拟环境和依赖，可选择是否保留数据库和上传文件。

## 项目结构

```
Aurora-Chat/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── models/         # 数据库模型
│   │   ├── routers/        # API 路由
│   │   ├── schemas/        # Pydantic 数据校验
│   │   └── services/       # 业务逻辑层
│   ├── requirements.txt
│   └── run.py              # 入口
├── frontend/               # Next.js 前端
│   ├── app/                # App Router 页面
│   ├── components/         # React 组件
│   │   ├── os/             # 桌面 OS 组件
│   │   ├── windows/        # 窗口/聊天组件
│   │   ├── theme/          # 主题系统
│   │   └── ui/             # 通用 UI 组件
│   ├── lib/                # 工具函数
│   ├── stores/             # Zustand 状态管理
│   └── public/             # 静态资源
├── scripts/                # 部署/运行脚本
├── deploy.bat              # 一键部署
├── dev.bat                 # 开发启动
└── start.bat               # 生产启动
```

## 配置

后端配置文件为 `backend/.env`（运行 `deploy.bat` 自动生成），主要配置项：

| 变量 | 说明 |
|------|------|
| `HOST` / `PORT` | API 监听地址和端口 |
| `DATABASE_URL` | 数据库连接字符串 |
| `SECRET_KEY` | JWT 签名密钥 |
| `CORS_ORIGINS` | 允许的前端来源（逗号分隔） |
| `ALLOWED_EMAIL_DOMAINS` | 允许注册的邮箱域名（留空=不限） |

## 公网部署注意事项

本项目前后端通过 Next.js rewrites 代理通信，前端（Next.js）会将 `/api/*` 和 `/uploads/*` 请求转发到后端（FastAPI）。因此：

- **只需对外开放前端端口**（默认 3000），后端端口（默认 8000）无需暴露到公网
- 防火墙/安全组只需放行前端端口即可
- 后端 `HOST` 保持 `0.0.0.0` 但绑定在本地即可，前端通过内网转发
- 如果前后端分离部署在不同机器上，需要额外配置 `BACKEND_ORIGIN` 环境变量，并确保 `CORS_ORIGINS` 包含前端域名

## 待办事项

- [ ] 完善错误处理和边界情况
- [ ] 优化细节
- [ ] 优化聊天页面
- [ ] 对话截图
- [ ] 对话导入
- [ ] 性能优化
- [ ] 移动端体验优化
- [ ] 国际化（i18n）支持
- [ ] 消息搜索
- [ ] 对话导出格式扩展
- [ ] E2E 测试覆盖
- [ ] Docker 部署支持

## License

MIT
