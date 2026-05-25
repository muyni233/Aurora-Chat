"use client";

/**
 * Spotlight —— ⌘K 命令面板
 *
 * 搜索范围包括：
 *   - 智能体（使用默认智能体打开聊天窗口）
 *   - 会话（按 ID 打开现有聊天）
 *   - 系统操作（打开设置、个人资料、外观、退出登录）
 *
 * 键盘操作：
 *   ⌘K / Ctrl+K   切换面板
 *   Esc           关闭面板
 *   ↑↓            移动焦点
 *   Enter         确认选择
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MessageSquare,
  Bot,
  Settings,
  User as UserIcon,
  Palette,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useWindowStore, openChatWindow } from "@/stores/windows";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet } from "@/lib/api";
import { toneForKey, irisPalette } from "@/components/theme/tokens";
import type { Agent, Conversation } from "@/lib/types";

type SpotResult =
  | {
      kind: "agent";
      id: string;
      name: string;
      description: string;
      agent: Agent;
    }
  | {
      kind: "conversation";
      id: string;
      name: string;
      description: string;
      agentId?: string | null;
    }
  | {
      kind: "action";
      id: string;
      name: string;
      description: string;
      run: () => void;
      icon: React.ReactNode;
    };

interface SpotlightProps {
  open: boolean;
  onClose: () => void;
}

export function Spotlight({ open, onClose }: SpotlightProps) {
  // 切换开/关时重新挂载内容 —— 比基于 useEffect 的重置更简单，且
  // 规避了 react-hooks/set-state-in-effect 规则的限制。
  return (
    <SpotlightBody key={open ? "on" : "off"} open={open} onClose={onClose} />
  );
}

function SpotlightBody({ open, onClose }: SpotlightProps) {
  const [q, setQ] = React.useState("");
  const [focus, setFocus] = React.useState(0);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { user, logout } = useAuth();
  const openWin = useWindowStore((s) => s.open);

  // 打开时加载数据（不要在这里调用 setQ —— 我们通过 `key` 重新挂载来重置状态）
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 60);
    if (!user)
      return () => {
        cancelled = true;
        clearTimeout(focusTimer);
      };
    void (async () => {
      try {
        const [a, c] = await Promise.all([
          apiGet<Agent[]>("/api/agents"),
          apiGet<Conversation[]>("/api/conversations"),
        ]);
        if (cancelled) return;
        setAgents(a);
        setConversations(c.slice(0, 20));
      } catch {
        // 忽略错误
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, [open, user]);

  const actions = React.useMemo<SpotResult[]>(() => {
    const list: SpotResult[] = [
      {
        kind: "action",
        id: "open-agents",
        name: "智能体市场",
        description: "浏览全部智能体",
        icon: <Bot size={16} />,
        run: () => openWin("agents", { id: "agents" }),
      },
      {
        kind: "action",
        id: "open-settings",
        name: "偏好设置",
        description: "调整通用设置",
        icon: <Settings size={16} />,
        run: () =>
          openWin("settings", {
            id: "settings",
            props: { initialTab: "account" },
          }),
      },
      {
        kind: "action",
        id: "open-appearance",
        name: "外观",
        description: "切换浅色 / 深色 / 系统",
        icon: <Palette size={16} />,
        run: () =>
          openWin("settings", {
            id: "settings",
            props: { initialTab: "appearance" },
          }),
      },
      {
        kind: "action",
        id: "open-profile",
        name: "账号资料",
        description: "查看与编辑账号",
        icon: <UserIcon size={16} />,
        run: () =>
          openWin("settings", {
            id: "settings",
            props: { initialTab: "account" },
          }),
      },
      {
        kind: "action",
        id: "open-about",
        name: "关于 Aether OS",
        description: "版本与致谢",
        icon: <Sparkles size={16} />,
        run: () =>
          openWin("settings", {
            id: "settings",
            props: { initialTab: "about" },
          }),
      },
    ];
    if (user?.role === "admin") {
      list.push({
        kind: "action",
        id: "open-admin",
        name: "管理后台",
        description: "管理全局用户、供应商、模型与数据库",
        icon: <Settings size={16} />,
        run: () => {
          window.location.href = "/admin";
        },
      });
    }
    list.push({
      kind: "action",
      id: "logout",
      name: "退出登录",
      description: "清除当前会话",
      icon: <LogOut size={16} />,
      run: () => logout(),
    });
    return list;
  }, [openWin, logout, user]);

  const results = React.useMemo<SpotResult[]>(() => {
    const norm = q.trim().toLowerCase();
    const agentResults: SpotResult[] = agents
      .filter(
        (a) =>
          !norm ||
          `${a.name} ${a.description ?? ""} ${a.nickname ?? ""}`
            .toLowerCase()
            .includes(norm),
      )
      .map((a) => ({
        kind: "agent" as const,
        id: a.id,
        name: a.nickname || a.name,
        description: a.description ?? "智能体",
        agent: a,
      }))
      .slice(0, 8);
    const convResults: SpotResult[] = conversations
      .filter((c) => !norm || (c.title ?? "").toLowerCase().includes(norm))
      .map((c) => ({
        kind: "conversation" as const,
        id: c.id,
        name: c.title || "未命名会话",
        description: c.agent_name ? `${c.agent_name} · 对话` : "对话",
        agentId: c.agent_id,
      }))
      .slice(0, 5);
    const actionResults = actions.filter(
      (a) => !norm || `${a.name} ${a.description}`.toLowerCase().includes(norm),
    );
    return [...agentResults, ...convResults, ...actionResults];
  }, [q, agents, conversations, actions]);

  const onQChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQ(e.target.value);
    setFocus(0);
  };

  const commit = React.useCallback(
    (idx: number) => {
      const item = results[idx];
      if (!item) return;
      if (item.kind === "agent") {
        openWin("agents", { id: "agents", props: { agentId: item.id } });
      } else if (item.kind === "conversation") {
        openChatWindow(item.id, item.description, item.agentId ?? undefined);
      } else {
        item.run();
      }
      onClose();
    },
    [results, openWin, onClose],
  );

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocus((f) => Math.min(results.length - 1, f + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocus((f) => Math.max(0, f - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(focus);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // 将搜索结果分组显示
  const grouped: {
    label: string;
    items: { item: SpotResult; idx: number }[];
  }[] = [];
  let lastKind = "";
  results.forEach((item, idx) => {
    if (item.kind !== lastKind) {
      grouped.push({
        label:
          item.kind === "agent"
            ? "智能体"
            : item.kind === "conversation"
              ? "最近对话"
              : "系统",
        items: [],
      });
      lastKind = item.kind;
    }
    grouped[grouped.length - 1].items.push({ item, idx });
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[16vh]"
          style={{
            background: "rgba(15, 30, 60, 0.16)",
            backdropFilter: "blur(10px) saturate(140%)",
            WebkitBackdropFilter: "blur(10px) saturate(140%)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ y: -14, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -8, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="glass-window relative w-[min(560px,90vw)] rounded-[18px] overflow-hidden"
            style={{ boxShadow: "var(--shadow-window)" }}
          >
            <div
              className="flex items-center gap-3 px-[18px] py-4 relative z-[1]"
              style={{ borderBottom: "1px solid var(--divider)" }}
            >
              <Search
                size={18}
                strokeWidth={1.8}
                style={{ color: "var(--ink-tertiary)" }}
              />
              <input
                ref={inputRef}
                value={q}
                onChange={onQChange}
                onKeyDown={onKey}
                placeholder="切换智能体、搜索对话、运行命令…"
                className="flex-1 bg-transparent border-0 outline-0 text-[16px] font-medium tracking-tight"
                style={{ color: "var(--ink-primary)" }}
                autoComplete="off"
              />
              <Kbd>ESC</Kbd>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-1.5 relative z-[1]">
              {grouped.length === 0 ? (
                <div
                  className="py-6 text-center text-[13px]"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  没有匹配项
                </div>
              ) : (
                grouped.map((g) => (
                  <div key={g.label}>
                    <div
                      className="text-[10px] uppercase tracking-[0.1em] px-3 py-1.5 font-semibold"
                      style={{ color: "var(--ink-tertiary)" }}
                    >
                      {g.label}
                    </div>
                    {g.items.map(({ item, idx }) => (
                      <SpotRow
                        key={item.kind + "-" + item.id}
                        item={item}
                        focused={idx === focus}
                        onMouseEnter={() => setFocus(idx)}
                        onClick={() => commit(idx)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SpotRow({
  item,
  focused,
  onMouseEnter,
  onClick,
}: {
  item: SpotResult;
  focused: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  let avatar: React.ReactNode = null;
  if (item.kind === "agent") {
    const tone = toneForKey(item.id);
    const [c1, c2] = irisPalette[tone];
    avatar = (
      <div
        className="w-8 h-8 rounded-[9px] flex items-center justify-center text-white text-[14px] font-semibold overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.32), 0 2px 5px rgba(30,60,120,0.18)",
        }}
      >
        {item.agent?.avatar_url ? (
          <img
            src={item.agent.avatar_url}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          item.name.charAt(0).toUpperCase()
        )}
      </div>
    );
  } else if (item.kind === "conversation") {
    avatar = (
      <div
        className="w-8 h-8 rounded-[9px] flex items-center justify-center"
        style={{ background: "rgba(14,165,233,0.12)", color: "var(--sky-700)" }}
      >
        <MessageSquare size={16} strokeWidth={1.8} />
      </div>
    );
  } else {
    avatar = (
      <div
        className="w-8 h-8 rounded-[9px] flex items-center justify-center"
        style={{ background: "var(--hover-bg)", color: "var(--ink-secondary)" }}
      >
        {item.icon}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 rounded-[9px] cursor-default transition-colors"
      style={{ background: focused ? "rgba(14,165,233,0.16)" : "transparent" }}
    >
      {avatar}
      <div className="flex-1 min-w-0">
        <div
          className="text-[14px] font-medium leading-tight truncate"
          style={{ color: "var(--ink-primary)" }}
        >
          {item.name}
        </div>
        <div
          className="text-[11.5px] mt-0.5 truncate"
          style={{ color: "var(--ink-tertiary)" }}
        >
          {item.description}
        </div>
      </div>
      {focused && (
        <span
          className="text-[10.5px] px-1.5 py-0.5 rounded font-mono font-semibold"
          style={{
            background: "rgba(14,165,233,0.18)",
            color: "var(--sky-700)",
          }}
        >
          ↵
        </span>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10.5px] px-1.5 py-0.5 rounded font-mono font-medium"
      style={{
        background: "rgba(15,30,60,0.07)",
        color: "var(--ink-tertiary)",
      }}
    >
      {children}
    </span>
  );
}
