"use client";

/**
 * Dock —— 底部居中，智能体快速启动 + 系统操作
 *
 * 行为：
 *   - 悬停时在图标上方显示工具提示标签
 *   - 鼠标移动时图标放大效果（Apple Dock 风格）
 *   - 点击使用该智能体打开聊天窗口（若已存在则聚焦）
 *   - 系统图标：Spotlight 搜索、智能体市场、设置
 *   - 当前可见（非最小化）窗口对应的图标下方显示激活指示点
 *   - 最小化窗口的图标显示缓慢脉冲 + 弹跳效果
 */

import * as React from "react";
import { useWindowStore } from "@/stores/windows";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPost } from "@/lib/api";
import { irisPalette, toneForKey } from "@/components/theme/tokens";
import type { Agent } from "@/lib/types";
import { LayoutGrid, Settings, Search } from "lucide-react";
import { openChatWindow } from "@/stores/windows";
import { registerDockTarget } from "@/stores/dockTargets";

interface DockProps {
  onOpenSpotlight: () => void;
}

export function Dock({ onOpenSpotlight }: DockProps) {
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const { user } = useAuth();
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const windows = useWindowStore((s) => s.windows);
  const open = useWindowStore((s) => s.open);
  const focus = useWindowStore((s) => s.focus);
  const restore = useWindowStore((s) => s.restore);
  const minimize = useWindowStore((s) => s.minimize);
  const activeId = useWindowStore((s) => s.activeId);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const a = await apiGet<Agent[]>("/api/agents");
        if (!cancelled) setAgents(a);
      } catch {
        // 忽略错误
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 鼠标移动时图标放大效果
  React.useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const items = () =>
      Array.from(dock.querySelectorAll<HTMLDivElement>("[data-dock-item]"));
    const onMove = (e: MouseEvent) => {
      items().forEach((item) => {
        const r = item.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const distance = Math.abs(e.clientX - center);
        const max = 130;
        if (distance < max) {
          const t = 1 - distance / max;
          item.style.transform = `scale(${1 + t * 0.45}) translateY(-${t * 8}px)`;
        } else {
          item.style.transform = "";
        }
      });
    };
    const onLeave = () =>
      items().forEach((item) => (item.style.transform = ""));
    dock.addEventListener("mousemove", onMove);
    dock.addEventListener("mouseleave", onLeave);
    return () => {
      dock.removeEventListener("mousemove", onMove);
      dock.removeEventListener("mouseleave", onLeave);
    };
  }, [agents.length]);

  // ── 每个 Dock 图标对应一个窗口 ──
  //
  // 点击图标：
  //   - 若绑定的窗口已最小化 → 还原窗口
  //   - 若窗口存在、可见且已聚焦 → 最小化（切换行为）
  //   - 若窗口存在、可见但未聚焦 → 聚焦该窗口
  //   - 否则 → 创建新窗口（由调用方定义的工厂方法创建）
  const handleAgentClick = async (agent: Agent) => {
    const dockKey = `agent:${agent.id}`;
    const bound = windows.find((w) => w.dockKey === dockKey);
    if (bound) {
      if (bound.minimized) return restore(bound.id);
      if (bound.id === activeId) return minimize(bound.id);
      return focus(bound.id);
    }
    // 无现有窗口 —— 为该智能体创建新会话。
    try {
      const conv = await apiPost<{ id: string }>("/api/conversations", {
        agent_id: agent.id,
      });
      openChatWindow(conv.id, agent.nickname || agent.name, agent.id);
    } catch {
      open("agents", { id: "agents", props: { agentId: agent.id } });
    }
  };

  const handleSystemClick = (kind: "agents" | "settings") => {
    const dockKey = `system:${kind}`;
    const bound = windows.find((w) => w.dockKey === dockKey);
    if (bound) {
      if (bound.minimized) return restore(bound.id);
      if (bound.id === activeId) return minimize(bound.id);
      return focus(bound.id);
    }
    open(kind, { id: kind });
  };

  // 当前绑定到*可见*（非最小化）窗口的 Dock 键集合
  const visibleDockKeys = React.useMemo(() => {
    const s = new Set<string>();
    windows.forEach((w) => {
      if (!w.minimized && w.dockKey) s.add(w.dockKey);
    });
    return s;
  }, [windows]);

  // 绑定到*已最小化*窗口的 Dock 键集合
  const dockKeysWithMinimized = React.useMemo(() => {
    const s = new Set<string>();
    windows.forEach((w) => {
      if (w.minimized && w.dockKey) s.add(w.dockKey);
    });
    return s;
  }, [windows]);

  // 没有匹配 Dock 图标的最小化窗口会显示自己的缩略图。
  const orphanedMinimized = React.useMemo(() => {
    return windows
      .filter((w) => w.minimized && !w.dockKey)
      .map((w) => ({ win: w }));
  }, [windows]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 14,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <nav
        ref={dockRef}
        className="dock-shell animate-dock-in"
        style={{
          borderRadius: 22,
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          padding: "8px 10px",
          pointerEvents: "auto",
        }}
      >
        <div className="relative z-[1] flex items-end gap-1.5">
          {/* 搜索快捷方式 */}
          <DockSystemItem
            tone="azure"
            icon={<Search size={22} strokeWidth={1.7} />}
            label="Spotlight 搜索"
            onClick={onOpenSpotlight}
          />

          {/* 分隔线 */}
          <div
            className="w-px h-9 mx-1 self-center"
            style={{ background: "rgba(30, 60, 120, 0.15)" }}
          />

          {/* 智能体 Dock 项目 */}
          {agents.length === 0 ? (
            <div className="flex items-end gap-1.5 opacity-50">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[50px] h-[50px] rounded-[13px]"
                  style={{ background: "var(--hover-bg)" }}
                />
              ))}
            </div>
          ) : (
            agents
              .slice(0, 8)
              .map((agent) => (
                <DockAgentItem
                  key={agent.id}
                  agent={agent}
                  active={visibleDockKeys.has(`agent:${agent.id}`)}
                  hasMinimized={dockKeysWithMinimized.has(`agent:${agent.id}`)}
                  onClick={() => handleAgentClick(agent)}
                />
              ))
          )}

          {/* 分隔线 —— 仅当存在孤立的最小化窗口时显示 */}
          {orphanedMinimized.length > 0 && (
            <div
              className="w-px h-9 mx-1 self-center"
              style={{ background: "rgba(30, 60, 120, 0.15)" }}
            />
          )}

          {/* 孤立的最小化窗口（无匹配 Dock 图标） */}
          {orphanedMinimized.map(({ win }) => (
            <DockMinimizedItem
              key={win.id}
              label={win.subtitle || win.title}
              tone="azure"
              initial={(win.subtitle || win.title || "W")
                .charAt(0)
                .toUpperCase()}
              onClick={() => restore(win.id)}
            />
          ))}

          {/* 系统操作 */}
          <DockSystemItem
            tone="slate"
            icon={<LayoutGrid size={20} strokeWidth={1.7} />}
            label="智能体市场"
            dockKey="system:agents"
            active={visibleDockKeys.has("system:agents")}
            hasMinimized={dockKeysWithMinimized.has("system:agents")}
            onClick={() => handleSystemClick("agents")}
          />
          <DockSystemItem
            tone="slate"
            icon={<Settings size={20} strokeWidth={1.7} />}
            label="系统偏好"
            dockKey="system:settings"
            active={visibleDockKeys.has("system:settings")}
            hasMinimized={dockKeysWithMinimized.has("system:settings")}
            onClick={() => handleSystemClick("settings")}
          />
        </div>
      </nav>
    </div>
  );
}

function DockAgentItem({
  agent,
  active,
  hasMinimized,
  onClick,
}: {
  agent: Agent;
  active: boolean;
  hasMinimized: boolean;
  onClick: () => void;
}) {
  const tone = toneForKey(agent.id);
  const [c1, c2] = irisPalette[tone];
  const initial = (agent.nickname || agent.name || "?").charAt(0).toUpperCase();
  const ref = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    return registerDockTarget(
      `agent:${agent.id}`,
      () => ref.current?.getBoundingClientRect() ?? null,
    );
  }, [agent.id]);
  return (
    <div className="relative">
      <button
        ref={ref}
        data-dock-item
        onClick={onClick}
        title={agent.nickname || agent.name}
        className="w-[50px] h-[50px] rounded-[13px] flex items-center justify-center cursor-pointer relative text-white font-bold text-[22px] tracking-tight"
        style={{
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 14px rgba(30, 60, 120, 0.18)",
          transformOrigin: "center bottom",
          transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
          willChange: "transform",
        }}
      >
        {agent.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agent.avatar_url}
            alt={agent.name}
            className="w-full h-full object-cover rounded-[13px]"
          />
        ) : (
          initial
        )}
        <DockLabel>{agent.nickname || agent.name}</DockLabel>
      </button>
      {(active || hasMinimized) && <ActiveDot pulse={hasMinimized} />}
    </div>
  );
}

function DockSystemItem({
  tone,
  icon,
  label,
  dockKey,
  active = false,
  hasMinimized = false,
  onClick,
}: {
  tone: "azure" | "slate";
  icon: React.ReactNode;
  label: string;
  dockKey?: string;
  active?: boolean;
  hasMinimized?: boolean;
  onClick: () => void;
}) {
  const [c1, c2] = irisPalette[tone === "azure" ? "azure" : "slate"];
  const ref = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (!dockKey) return;
    return registerDockTarget(
      dockKey,
      () => ref.current?.getBoundingClientRect() ?? null,
    );
  }, [dockKey]);
  return (
    <div className="relative">
      <button
        ref={ref}
        data-dock-item
        onClick={onClick}
        title={label}
        className="w-[50px] h-[50px] rounded-[13px] flex items-center justify-center cursor-pointer relative text-white"
        style={{
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 14px rgba(30, 60, 120, 0.18)",
          transformOrigin: "center bottom",
          transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
          willChange: "transform",
        }}
      >
        {icon}
        <DockLabel>{label}</DockLabel>
      </button>
      {(active || hasMinimized) && (
        <ActiveDot pulse={hasMinimized && !active} />
      )}
    </div>
  );
}

function DockMinimizedItem({
  label,
  tone,
  initial,
  onClick,
}: {
  label: string;
  tone: keyof typeof irisPalette;
  initial: string;
  onClick: () => void;
}) {
  const [c1, c2] = irisPalette[tone];
  return (
    <button
      data-dock-item
      onClick={onClick}
      title={label}
      className="w-[50px] h-[50px] rounded-[13px] flex items-center justify-center cursor-pointer relative text-white font-bold text-[20px]"
      style={{
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 14px rgba(30, 60, 120, 0.18)",
        transformOrigin: "center bottom",
        transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
        willChange: "transform",
        opacity: 0.85,
      }}
    >
      {initial}
      <DockLabel>{label}</DockLabel>
      <ActiveDot />
    </button>
  );
}

function DockLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="dock-tooltip absolute left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap pointer-events-none opacity-0 font-medium glass-tile"
      style={{
        bottom: "calc(100% + 14px)",
        color: "var(--ink-primary)",
        transition: "opacity 0.15s, transform 0.15s",
      }}
    >
      {children}
    </span>
  );
}

function ActiveDot({ pulse = false }: { pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className="absolute left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
      style={{
        bottom: -7,
        background: pulse ? "var(--sky-600)" : "var(--ink-primary)",
        opacity: 0.6,
        boxShadow: pulse ? "0 0 6px rgba(14,165,233,0.7)" : undefined,
        animation: pulse ? "livePulse 2.4s ease-in-out infinite" : undefined,
      }}
    />
  );
}
