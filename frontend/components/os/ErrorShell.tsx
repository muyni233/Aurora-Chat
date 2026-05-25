"use client";

/**
 * ErrorShell —— `not-found.tsx`、`error.tsx` 和 `global-error.tsx` 共享的视觉效果组件。
 * 消除了约 100 行重复的标记代码，并确保在所有 4xx/5xx 状态下壁纸 / 玻璃卡片的
 * 显示效果保持一致。
 *
 * 为什么是客户端组件：错误边界根据定义仅存在于客户端。
 * 为什么大量使用内联样式：这些文件在正常布局树之外渲染（尤其是 global-error，
 * 它会替换根 <html> 元素），因此无法依赖 OS Wallpaper 组件 —— 该组件需要 ThemeContext。
 */

import * as React from "react";

interface ErrorShellProps {
  /** 位于 /public 目录下的吉祥物插图。 */
  mascotSrc: string;
  mascotAlt: string;
  title: string;
  description: string;
  /** 操作按钮行 —— 通常包含两个按钮。 */
  actions: React.ReactNode;
  /** 可选的可折叠详情区域（错误堆栈查看器）。 */
  details?: React.ReactNode;
  /** 玻璃卡片的最大宽度。默认为 28rem (md)。 */
  maxWidth?: "sm" | "md";
}

export function ErrorShell({
  mascotSrc,
  mascotAlt,
  title,
  description,
  actions,
  details,
  maxWidth = "md",
}: ErrorShellProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-4 select-none overflow-y-auto">
      {/* 壁纸背景 —— 浅色模式 */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse at 18% 22%, rgba(186, 230, 253, 0.45) 0%, transparent 55%),
            radial-gradient(ellipse at 82% 78%, rgba(254, 215, 170, 0.35) 0%, transparent 55%),
            radial-gradient(ellipse at 70% 14%, rgba(165, 243, 252, 0.30) 0%, transparent 50%),
            linear-gradient(135deg, #E9F1F8 0%, #F2EAD8 65%, #E5DCC5 100%)
          `,
        }}
      />
      {/* 壁纸背景 —— 深色覆盖层 */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none transition-opacity duration-300 opacity-0 dark:opacity-100"
        style={{
          background: `
            radial-gradient(ellipse at 20% 30%, rgba(56, 189, 248, 0.08) 0%, transparent 55%),
            radial-gradient(ellipse at 80% 70%, rgba(167, 139, 250, 0.08) 0%, transparent 55%),
            linear-gradient(135deg, #0B1220 0%, #0B1428 50%, #0A0F1E 100%)
          `,
        }}
      />

      {/* 玻璃卡片 */}
      <div
        className={`glass-window animate-window relative w-full rounded-2xl flex flex-col overflow-hidden my-8 ${
          maxWidth === "sm" ? "max-w-sm" : "max-w-md"
        }`}
        style={{ borderRadius: "var(--radius-window)" }}
      >
        {/* 模拟 OS 窗口标题栏 */}
        <div
          className="h-11 flex-shrink-0 flex items-center px-4 relative z-[2] select-none"
          style={{
            borderBottom: "1px solid var(--divider)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)",
          }}
        >
          <div className="flex gap-2 opacity-40 pointer-events-none">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: "#FF5F57",
                boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.10)",
              }}
            />
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: "#FEBC2E",
                boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.10)",
              }}
            />
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: "#28C840",
                boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.10)",
              }}
            />
          </div>
          <div
            className="absolute left-1/2 top-1/2 text-[13px] font-semibold pointer-events-none"
            style={{
              transform: "translate(-50%, -50%)",
              color: "var(--ink-primary)",
            }}
          >
            系统提示
          </div>
        </div>

        {/* 主体内容 */}
        <div className="p-8 flex flex-col items-center text-center relative z-[1]">
          <div className="relative w-44 h-44 mb-5 flex items-center justify-center">
            {/* 有意使用 <img>：错误边界需要最小的水合开销。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mascotSrc}
              alt={mascotAlt}
              className="w-full h-full object-contain"
              style={{ filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.06))" }}
            />
          </div>

          <h2
            className="text-xl font-bold tracking-tight mb-2"
            style={{ color: "var(--ink-primary)" }}
          >
            {title}
          </h2>
          <p
            className="text-xs mb-6 leading-relaxed max-w-[280px]"
            style={{ color: "var(--ink-secondary)" }}
          >
            {description}
          </p>

          <div className="flex gap-3 w-full mb-6">{actions}</div>

          {details}
        </div>
      </div>
    </div>
  );
}

// ── ErrorDetails：可折叠的堆栈查看器 + 复制按钮 ────────

interface ErrorDetailsProps {
  message: string;
  digest?: string;
  stack?: string;
}

export function ErrorDetails({ message, digest, stack }: ErrorDetailsProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (copied) return;
    const logText = `Message: ${message}\nDigest: ${digest || "N/A"}\nStack: ${stack || "N/A"}`;
    void navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="w-full pt-4 text-left"
      style={{ borderTop: "1px solid var(--divider)" }}
    >
      {/* 切换行 —— 使用真实的 <button> 元素，无嵌套 */}
      <div className="flex items-center justify-between gap-2 w-full">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
          style={{
            color: open ? "var(--ink-primary)" : "var(--ink-secondary)",
          }}
        >
          <Caret open={open} />
          查看错误详细日志
        </button>
        {open && (
          <button
            onClick={copy}
            className="inline-flex items-center gap-1 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
            style={{ color: "var(--sky-600)" }}
          >
            <CopyIcon copied={copied} />
            {copied ? "已复制" : "复制日志"}
          </button>
        )}
      </div>

      {open && (
        <div
          className="mt-3 max-h-36 overflow-y-auto p-3 rounded-lg font-mono text-[10px] select-text"
          style={{
            border: "1px solid var(--divider)",
            background: "rgba(239,68,68,0.06)",
            color: "var(--color-danger)",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>Error: </strong>
          {message || "Unknown error message"}
          {digest && (
            <>
              <br />
              <strong>Digest: </strong>
              {digest}
            </>
          )}
          {stack && (
            <>
              <br />
              <br />
              {stack}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.15s ease-out",
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied)
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
