/**
 * Aurora Chat 运行时配置。
 *
 * 此文件在 React 打包前由 /app/layout.tsx 同步加载，因此任何代码运行时
 * `window.__AURORA__` 已经就绪。只需编辑此文件即可将同一次构建部署到不同后端。
 *
 * 字段说明：
 *   - apiBase: FastAPI 后端的完整地址（不含尾部斜杠）。示例：
 *       ""                                — 同源（默认）。浏览器请求 Next.js 进程，
 *                                           由 next.config.ts rewrites 将 /api 和
 *                                           /uploads 代理到 FastAPI。公网部署只需
 *                                           开放 Next.js 端口。
 *       "http://localhost:8000"           — 绕过代理直连 FastAPI（开发调试用）。
 *       "https://api.aurora.example.com"  — 前后端分离的生产部署。
 *
 * 编辑后刷新页面即可生效。
 */
window.__AURORA__ = {
  apiBase: "",
};
