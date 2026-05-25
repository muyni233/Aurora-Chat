// 后端 API 地址的解析顺序：
//   1. window.__AURORA__.apiBase   — 由 /public/aurora.config.js 设置（在根布局中同步加载），
//                                     允许部署版本无需重新构建即可指向不同的后端。
//   2. NEXT_PUBLIC_API_URL          — 构建时的环境变量。
//   3. http://localhost:8000        — 开发环境的合理默认值。
//
// 空字符串也是有效值：表示"同源"，适用于 API 被反向代理到 Next.js 宿主后面的情况。
declare global {
  interface Window {
    __AURORA__?: { apiBase?: string };
  }
}

function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const fromWindow = window.__AURORA__?.apiBase;
    if (fromWindow !== undefined && fromWindow !== null) return fromWindow;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

const API_BASE = resolveApiBase();

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aurora_token");
}

function setToken(token: string) {
  localStorage.setItem("aurora_token", token);
}

function removeToken() {
  localStorage.removeItem("aurora_token");
}

async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 对于 FormData 不设置 Content-Type（浏览器会自动设置带 boundary 的头）
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  // 默认 20 秒超时保护，避免后端无响应时界面永远挂起。
  // 流式端点（/api/chat/...）不走此辅助函数，自行管理时序。
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("请求超时，请检查后端服务是否正常运行");
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (res.status === 401) {
    removeToken();
    if (typeof window !== "undefined") {
      // 当已经在登录页或 OAuth 回调页面时，避免重定向循环。
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/oauth/")) {
        window.location.href = "/login";
      }
    }
  }

  return res;
}

async function handleApiError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({ detail: "Request failed" }));
  let message = "Request failed";
  if (typeof err.detail === "string") {
    message = err.detail;
  } else if (Array.isArray(err.detail)) {
    // FastAPI 验证错误（422）以数组形式返回详细的错误信息
    message = err.detail.map((d: any) => d.msg).join(", ");
  } else if (err.detail && typeof err.detail === "object") {
    message = JSON.stringify(err.detail);
  }
  throw new Error(message);
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    await handleApiError(res);
  }
  return res.json();
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    await handleApiError(res);
  }
  return res.json();
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await handleApiError(res);
  }
  return res.json();
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    await handleApiError(res);
  }
  return res.json();
}

async function apiDelete<T = void>(path: string): Promise<T> {
  const res = await apiFetch(path, { method: "DELETE" });
  if (!res.ok) {
    await handleApiError(res);
  }
  // 204 No Content / 空响应体 → 返回 void。
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/**
 * 带身份验证的文件下载。
 *
 * 普通的 ``<a href>`` 不会携带 bearer token，因此我们先获取响应，创建 Blob 对象，
 * 再通过合成锚点触发下载。文件名优先从服务端的 ``Content-Disposition`` 响应头读取
 * （这样用户看到的是例如 ``aurora_chat-snapshot-20260502.db`` 而不是 UUID），
 * 若无法获取则回退到调用者提供的默认名称。
 */
async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Download failed" }));
    throw new Error(err.detail || "Download failed");
  }
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename\*?=(?:UTF-8''|"?)([^;"\s]+)/i);
  const filename = match
    ? decodeURIComponent(match[1].replace(/"/g, ""))
    : fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 用于聊天的 SSE 流式传输
async function* streamChat(
  conversationId: string,
  content: string,
  modelId?: string,
  options: { attachments?: Attachment[]; signal?: AbortSignal } = {},
): AsyncGenerator<{
  content?: string;
  done?: boolean;
  error?: string;
  notice?: string;
}> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/chat/${conversationId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content,
      model_id: modelId,
      attachments:
        options.attachments && options.attachments.length > 0
          ? options.attachments
          : undefined,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Chat failed" }));
    yield { error: err.detail || "Chat failed" };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data;
          } catch {
            // 跳过无效的 JSON
          }
        }
      }
    }
  } finally {
    // 释放锁，以便后续重试不会遇到响应体仍被锁定的情况。
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

async function* streamRegenerate(
  conversationId: string,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<{
  content?: string;
  done?: boolean;
  error?: string;
  notice?: string;
}> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/chat/${conversationId}/regenerate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: options.signal,
  });

  if (!res.ok) {
    yield { error: "Regenerate failed" };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6));
          } catch {
            /* skip */
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

// ── 附件 ────────────────────────────────────────────────────────────────────
//
// 服务端的分类（`kind`）决定了我们在聊天中如何渲染附件——
// `text` 类型的文件在发送时以内联的代码块形式展示；
// `image` 和 `pdf` 则原样传递给 LLM。
export interface Attachment {
  url: string;
  content_type: string;
  name: string;
  size: number;
  text_preview?: string | null;
  kind: "image" | "pdf" | "text";
}

async function apiUploadFiles(files: File[]): Promise<Attachment[]> {
  if (files.length === 0) return [];
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await apiFetch("/api/uploads", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export {
  API_BASE,
  getToken,
  setToken,
  removeToken,
  apiFetch,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  apiDownload,
  apiUploadFiles,
  streamChat,
  streamRegenerate,
};
