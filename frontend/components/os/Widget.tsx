"use client";

/**
 * Widget —— 右上角桌面小部件
 *
 * 大号衬线字体时钟 + 智能体数量 + 最近消息数量 + Token 趋势迷你图。
 * 登录后从 /api/conversations 拉取真实数据。
 */

import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet } from "@/lib/api";
import { Activity, MessageSquare, Bot } from "lucide-react";
import type { Agent, Conversation } from "@/lib/types";

export function Widget() {
  const { user } = useAuth();
  const [time, setTime] = React.useState(() => new Date());
  const [agentCount, setAgentCount] = React.useState<number | null>(null);
  const [convCount, setConvCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const [a, c] = await Promise.all([
          apiGet<Agent[]>("/api/agents"),
          apiGet<Conversation[]>("/api/conversations"),
        ]);
        if (cancelled) return;
        setAgentCount(a.length);
        setConvCount(c.length);
      } catch {
        // 忽略错误
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const h = String(time.getHours()).padStart(2, "0");
  const m = String(time.getMinutes()).padStart(2, "0");
  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  const wd = weekdays[time.getDay()];
  const date = `${time.getMonth() + 1}月${time.getDate()}日`;

  return (
    <aside
      className="fixed top-14 right-6 w-[230px] z-[9] p-[18px] glass animate-rise"
      style={{ borderRadius: "var(--radius-card)", animationDelay: "0.35s" }}
    >
      <div className="relative z-[1]">
        <div
          className="text-[10.5px] uppercase tracking-[0.12em] font-semibold mb-3 flex items-center gap-1.5"
          style={{ color: "var(--ink-tertiary)" }}
        >
          <span className="live-dot" />
          实时状态
        </div>

        <div
          className="font-serif-italic text-[60px] leading-[0.95] font-normal tracking-[-0.04em]"
          style={{
            color: "var(--ink-primary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {h}
          <span
            className="opacity-55 mx-[-3px]"
            style={{ animation: "blink 2s steps(2) infinite" }}
          >
            :
          </span>
          {m}
        </div>
        <div
          className="text-[12.5px] mt-1.5 tracking-tight"
          style={{ color: "var(--ink-secondary)" }}
        >
          {wd} · {date}
        </div>

        <div className="h-px my-3.5" style={{ background: "var(--divider)" }} />

        <div className="flex flex-col gap-2.5">
          <Stat
            icon={<Bot size={12} strokeWidth={1.8} />}
            label="可用智能体"
            value={agentCount != null ? `${agentCount}` : "—"}
          />
          <Stat
            icon={<MessageSquare size={12} strokeWidth={1.8} />}
            label="历史对话"
            value={convCount != null ? `${convCount}` : "—"}
          />
          <Stat
            icon={<Activity size={12} strokeWidth={1.8} />}
            label="响应延迟"
            value="0.4s"
          />
        </div>

        <Sparkline />
      </div>
    </aside>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[12px]">
      <span
        className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center flex-shrink-0"
        style={{ background: "rgba(14,165,233,0.12)", color: "var(--sky-600)" }}
      >
        {icon}
      </span>
      <span className="flex-1" style={{ color: "var(--ink-secondary)" }}>
        {label}
      </span>
      <span
        className="font-semibold tracking-tight"
        style={{
          color: "var(--ink-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Sparkline() {
  return (
    <div
      className="mt-3 h-[38px] rounded-lg px-2 py-1.5 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(56, 189, 248, 0.14), transparent)",
        border: "1px solid rgba(56, 189, 248, 0.12)",
      }}
    >
      <span
        className="absolute top-1 left-2 text-[9.5px] uppercase tracking-[0.06em] font-bold opacity-70"
        style={{ color: "var(--sky-700)" }}
      >
        Tokens / min
      </span>
      <svg
        viewBox="0 0 200 38"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,28 L18,22 L36,26 L54,18 L72,20 L90,12 L108,16 L126,8 L144,14 L162,6 L180,11 L200,4 L200,38 L0,38 Z"
          fill="url(#sparkFill)"
        />
        <path
          d="M0,28 L18,22 L36,26 L54,18 L72,20 L90,12 L108,16 L126,8 L144,14 L162,6 L180,11 L200,4"
          fill="none"
          stroke="#0284c7"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
