"use client";

/**
 * AgentsWindow —— 智能体卡片网格，用于选择开始新对话的智能体。
 *
 * 真实后端请求：GET /api/agents
 * 点击智能体 → POST /api/conversations + 打开聊天窗口。
 */

import * as React from "react";
import type { OsWindow } from "@/stores/windows";
import { apiGet, apiPost } from "@/lib/api";
import { irisPalette, toneForKey } from "@/components/theme/tokens";
import { openChatWindow, useWindowStore } from "@/stores/windows";
import { motion } from "framer-motion";
import type { Agent } from "@/lib/types";
import { Sparkles, MessageSquarePlus } from "lucide-react";

export function AgentsWindow({ win }: { win: OsWindow }) {
  const [agents, setAgents] = React.useState<Agent[] | null>(null);
  const [creating, setCreating] = React.useState<string | null>(null);
  const close = useWindowStore((s) => s.close);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const a = await apiGet<Agent[]>("/api/agents");
        if (!cancelled) setAgents(a);
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async (agent: Agent) => {
    setCreating(agent.id);
    try {
      const conv = await apiPost<{ id: string }>("/api/conversations", {
        agent_id: agent.id,
      });
      openChatWindow(conv.id, agent.nickname || agent.name, agent.id);
      close(win.id);
    } catch {
      setCreating(null);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-8">
      <div className="max-w-[860px] mx-auto">
        <div className="mb-6">
          <div
            className="font-serif-italic text-[32px] leading-tight"
            style={{ color: "var(--ink-primary)" }}
          >
            选一位智能体开始
          </div>
          <div
            className="text-[13px] mt-1.5"
            style={{ color: "var(--ink-secondary)" }}
          >
            点击任意一张卡片，新对话会自动出现在桌面上
          </div>
        </div>

        {agents === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[160px] rounded-[18px] glass-tile animate-pulse"
              />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div
            className="rounded-[18px] glass-tile p-10 text-center"
            style={{ color: "var(--ink-secondary)" }}
          >
            尚未配置任何智能体
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {agents.map((agent, i) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                index={i}
                busy={creating === agent.id}
                highlight={win.props.agentId === agent.id}
                onClick={() => start(agent)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  index,
  busy,
  highlight,
  onClick,
}: {
  agent: Agent;
  index: number;
  busy: boolean;
  highlight: boolean;
  onClick: () => void;
}) {
  const tone = toneForKey(agent.id);
  const [c1, c2] = irisPalette[tone];
  const initial = (agent.nickname || agent.name || "?").charAt(0).toUpperCase();

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.04,
        type: "spring",
        stiffness: 280,
        damping: 24,
      }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      disabled={busy}
      className="rounded-[18px] glass-tile p-5 text-left flex flex-col gap-3 cursor-pointer transition-all relative overflow-hidden disabled:opacity-60"
      style={{
        boxShadow: highlight
          ? "0 0 0 2px var(--sky-400), 0 8px 24px rgba(14,165,233,0.20)"
          : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-[12px] flex items-center justify-center text-white font-bold text-[18px]"
          style={{
            background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 10px rgba(30,60,120,0.18)",
          }}
        >
          {agent.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agent.avatar_url}
              alt={agent.name}
              className="w-full h-full object-cover rounded-[12px]"
            />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-medium text-[15px] tracking-tight truncate"
            style={{ color: "var(--ink-primary)" }}
          >
            {agent.nickname || agent.name}
          </div>
          {agent.nickname && agent.name !== agent.nickname && (
            <div
              className="text-[11.5px] truncate"
              style={{ color: "var(--ink-tertiary)" }}
            >
              {agent.name}
            </div>
          )}
        </div>
      </div>
      <div
        className="text-[12.5px] leading-[1.55] line-clamp-3 min-h-[3em]"
        style={{ color: "var(--ink-secondary)" }}
      >
        {agent.description || "一位等待和你对话的伙伴。"}
      </div>
      <div
        className="flex items-center gap-1.5 text-[11.5px] mt-auto"
        style={{ color: "var(--sky-700)" }}
      >
        {busy ? (
          <>
            <Sparkles size={12} /> 创建对话中…
          </>
        ) : (
          <>
            <MessageSquarePlus size={12} /> 开始对话
          </>
        )}
      </div>
    </motion.button>
  );
}
