"use client";

import * as React from "react";
import { apiGet } from "@/lib/api";
import { Users2, Server, Bot, MessageSquare } from "lucide-react";
import type { Agent } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tint: string;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

interface Provider {
  id: string;
  name: string;
}

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [a, u, p] = await Promise.all([
          apiGet<Agent[]>("/api/agents"),
          apiGet<AdminUser[]>("/api/admin/users").catch(() => []),
          apiGet<Provider[]>("/api/providers").catch(() => []),
        ]);
        if (cancelled) return;
        setAgents(a);
        setUsers(u);
        setProviders(p);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats: StatCard[] = [
    {
      label: "智能体",
      value: agents.length,
      icon: <Bot size={18} />,
      tint: "#7C3AED",
    },
    {
      label: "供应商",
      value: providers.length,
      icon: <Server size={18} />,
      tint: "#0284C7",
    },
    {
      label: "用户",
      value: users.length,
      icon: <Users2 size={18} />,
      tint: "#047857",
    },
    {
      label: "消息",
      value: "—",
      icon: <MessageSquare size={18} />,
      tint: "#BE185D",
    },
  ];

  return (
    <div className="p-8 max-w-[1000px]">
      <h1
        className="font-serif-italic text-[36px] mb-1"
        style={{ color: "var(--ink-primary)" }}
      >
        管理总览
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--ink-secondary)" }}>
        欢迎回来，{user?.username}。这里是 Aurora Chat 的全局状态。
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[16px] glass-tile p-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                style={{
                  background: s.tint,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                {s.icon}
              </div>
              <div
                className="text-[11.5px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--ink-tertiary)" }}
              >
                {s.label}
              </div>
            </div>
            <div
              className="text-[28px] font-bold tracking-tight"
              style={{
                color: "var(--ink-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {loading ? "—" : s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[16px] glass-tile p-5">
        <div
          className="text-[11.5px] uppercase tracking-wider font-semibold mb-3"
          style={{ color: "var(--ink-tertiary)" }}
        >
          近期注册
        </div>
        {users.length === 0 ? (
          <div
            className="text-[12.5px]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            暂无
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {users.slice(0, 5).map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 text-[13px]"
                style={{ color: "var(--ink-primary)" }}
              >
                <span className="font-medium">{u.username}</span>
                <span style={{ color: "var(--ink-tertiary)" }}>{u.email}</span>
                <span
                  className="ml-auto text-[10.5px] px-1.5 py-0.5 rounded-md uppercase tracking-wider font-semibold"
                  style={{
                    background:
                      u.role === "admin"
                        ? "rgba(124,58,237,0.15)"
                        : "rgba(14,165,233,0.12)",
                    color: u.role === "admin" ? "#7C3AED" : "var(--sky-700)",
                  }}
                >
                  {u.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
