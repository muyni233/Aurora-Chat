"use client";

/**
 * 管理后台用户 — 列表 / 批准待审 / 提升角色 / 禁用 / 删除。
 *
 *   GET    /api/admin/users?status=active|pending|all&search=…
 *   PATCH  /api/admin/users/{id}    { role?, is_active? }
 *   POST   /api/admin/users/{id}/approve
 *   DELETE /api/admin/users/{id}
 */

import * as React from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import {
  CheckCircle2,
  Trash2,
  ShieldCheck,
  ShieldOff,
  ZapOff,
  Search as SearchIcon,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

type Filter = "all" | "active" | "pending";

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // 搜索输入防抖
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("status", filter);
        if (debouncedSearch) params.set("search", debouncedSearch);
        const u = await apiGet<AdminUser[]>(`/api/admin/users?${params}`);
        if (!cancelled) setUsers(u);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, debouncedSearch]);

  const reload = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("status", filter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      setUsers(await apiGet<AdminUser[]>(`/api/admin/users?${params}`));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, [filter, debouncedSearch]);

  const approve = async (u: AdminUser) => {
    try {
      await apiPost(`/api/admin/users/${u.id}/approve`, {});
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  };
  const toggleRole = async (u: AdminUser) => {
    const target = u.role === "admin" ? "user" : "admin";
    try {
      await apiPatch(`/api/admin/users/${u.id}`, { role: target });
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  };
  const toggleActive = async (u: AdminUser) => {
    try {
      await apiPatch(`/api/admin/users/${u.id}`, { is_active: !u.is_active });
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  };
  const remove = async (u: AdminUser) => {
    if (!confirm(`删除用户「${u.username}」？此操作不可撤销。`)) return;
    try {
      await apiDelete(`/api/admin/users/${u.id}`);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="mb-6">
        <h1
          className="font-serif-italic text-[32px]"
          style={{ color: "var(--ink-primary)" }}
        >
          用户
        </h1>
        <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          管理已注册用户、审核待审账户、调整角色。
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div
          className="flex gap-0.5 rounded-lg p-0.5"
          style={{ background: "var(--hover-bg)" }}
        >
          {(["all", "active", "pending"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 text-[12px] rounded-md transition-colors font-medium"
              style={{
                background:
                  filter === f ? "var(--glass-bg-strong)" : "transparent",
                color:
                  filter === f ? "var(--ink-primary)" : "var(--ink-secondary)",
              }}
            >
              {f === "all" ? "全部" : f === "active" ? "已激活" : "待审"}
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          iconLeft={<SearchIcon size={14} />}
          placeholder="搜索用户名 / 邮箱…"
          className="flex-1 max-w-[320px]"
        />
      </div>

      {error && (
        <div
          className="mb-4 px-3 py-2 rounded-md text-[12.5px] flex items-center gap-2"
          style={{
            background: "rgba(239,68,68,0.10)",
            color: "var(--color-danger)",
          }}
        >
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg glass-tile animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div
          className="rounded-[16px] glass-tile p-10 text-center text-[13px]"
          style={{ color: "var(--ink-tertiary)" }}
        >
          没有匹配的用户
        </div>
      ) : (
        <div className="rounded-[14px] glass-tile overflow-hidden">
          <table className="w-full text-[13px]">
            <thead style={{ background: "rgba(15,30,60,0.04)" }}>
              <tr>
                <th
                  className="text-left px-3 py-2 text-[10.5px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  用户
                </th>
                <th
                  className="text-left px-3 py-2 text-[10.5px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  角色
                </th>
                <th
                  className="text-left px-3 py-2 text-[10.5px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  状态
                </th>
                <th
                  className="text-left px-3 py-2 text-[10.5px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  注册时间
                </th>
                <th
                  className="text-right px-3 py-2 text-[10.5px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                  }}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span
                        className="font-medium"
                        style={{ color: "var(--ink-primary)" }}
                      >
                        {u.username}
                      </span>
                      <span
                        className="text-[11.5px]"
                        style={{ color: "var(--ink-tertiary)" }}
                      >
                        {u.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="text-[10.5px] px-1.5 py-0.5 rounded-md uppercase tracking-wider font-semibold"
                      style={{
                        background:
                          u.role === "admin"
                            ? "rgba(124,58,237,0.15)"
                            : "rgba(14,165,233,0.12)",
                        color:
                          u.role === "admin" ? "#7C3AED" : "var(--sky-700)",
                      }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {u.is_active ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11.5px]"
                        style={{ color: "var(--color-success)" }}
                      >
                        <CheckCircle2 size={11} /> 激活
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[11.5px]"
                        style={{ color: "var(--color-warning)" }}
                      >
                        <ZapOff size={11} /> 待审
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 text-[11.5px]"
                    style={{ color: "var(--ink-tertiary)" }}
                  >
                    {new Date(u.created_at).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {!u.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => approve(u)}
                          className="gap-1"
                          style={{ color: "var(--color-success)" }}
                        >
                          <CheckCircle2 size={11} /> 批准
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRole(u)}
                        className="gap-1"
                        title={
                          u.role === "admin" ? "降为普通用户" : "升为管理员"
                        }
                      >
                        {u.role === "admin" ? (
                          <ShieldOff size={11} />
                        ) : (
                          <ShieldCheck size={11} />
                        )}
                      </Button>
                      {u.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(u)}
                          title="停用"
                        >
                          <ZapOff size={11} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(u)}
                        title="删除"
                        style={{ color: "var(--color-danger)" }}
                      >
                        <Trash2 size={11} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
