"use client";

/**
 * Spotlight 搜索入口按钮 —— 左上角固定的搜索快捷方式。
 */

import * as React from "react";
import { Search } from "lucide-react";

export function SpotlightPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="spotlight-pill fixed top-14 left-6 w-[240px] px-3.5 py-2.5 rounded-[14px] z-[9] cursor-pointer flex items-center gap-2.5 glass animate-rise transition-colors"
      style={{ animationDelay: "0.4s" }}
    >
      <Search
        size={15}
        strokeWidth={1.8}
        style={{
          color: "var(--ink-secondary)",
          position: "relative",
          zIndex: 1,
        }}
      />
      <span
        className="text-[13px] flex-1 text-left relative z-[1] truncate whitespace-nowrap overflow-hidden"
        style={{ color: "var(--ink-secondary)" }}
      >
        搜索智能体、对话…
      </span>
      <span
        className="text-[10.5px] px-1.5 py-0.5 rounded font-mono font-medium relative z-[1]"
        style={{ background: "var(--hover-bg)", color: "var(--ink-tertiary)" }}
      >
        ⌘K
      </span>
    </button>
  );
}
