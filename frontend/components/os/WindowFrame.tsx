"use client";

/**
 * WindowFrame —— 可拖拽、可调整大小的 Liquid Glass 窗口。
 *
 * 关键注意 —— `backdrop-filter` 要求该元素及其所有祖先元素上均不设置
 * transform。framer-motion 总是会生成 transform，因此我们改用纯 CSS
 * transition 来实现动画效果。静止时：`transform: none` → 模糊效果正常。
 * 在打开/关闭/最小化/还原过渡期间：transform 短暂为非 none 值 → 模糊
 * 效果暂时失效，但此时窗口处于过渡动画中，因此不可见。
 *
 * 动画策略：
 *   - CSS `transition` 覆盖 transform、opacity、left、top、width、height
 *   - 挂载时组件在首次渲染后读取自己的 DOM，递增一个 `tick` ref 并
 *     强制重新渲染一次，以将 transform 从"起始"状态翻转到"结束"状态。
 *     这是在不使用 framer-motion 且不违反 react-hooks/set-state-in-effect
 *     规则的情况下实现入场动画的唯一方式。
 *   - 阶段变更（opening → open、minimizing → minimized）通过 setTimeout
 *     在 store 中完成。一旦 store 翻转阶段，此处的内联 transform 即从
 *     "起始"变为"结束"，CSS 会自动接管过渡。
 *
 * 最小化飞行目标：窗口底部中心 → Dock 图标中心。
 */

import * as React from "react";
import { useWindowStore, type OsWindow } from "@/stores/windows";
import { getDockTargetRect } from "@/stores/dockTargets";
import { useTheme } from "@/components/theme/GlassThemeProvider";

interface WindowFrameProps {
  win: OsWindow;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}

const MIN_W = 360;
const MIN_H = 280;
const MENUBAR_BOTTOM = 36;
const DOCK_TOP_AREA = 90;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.6, 0, 0.84, 0)";

export function WindowFrame({ win, children, headerExtra }: WindowFrameProps) {
  const { spec } = useTheme();
  const motion = spec.motion || "full";
  const duration = motion === "none" ? 0 : motion === "reduced" ? 192 : 480;

  const focus = useWindowStore((s) => s.focus);
  const close = useWindowStore((s) => s.close);
  const minimize = useWindowStore((s) => s.minimize);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const move = useWindowStore((s) => s.move);
  const resize = useWindowStore((s) => s.resize);

  const minW = React.useMemo(() => {
    switch (win.kind) {
      case "chat":
        return 580;
      case "settings":
        return 560;
      case "agents":
        return 500;
      default:
        return MIN_W;
    }
  }, [win.kind]);

  const minH = React.useMemo(() => {
    switch (win.kind) {
      case "chat":
        return 450;
      case "settings":
        return 400;
      case "agents":
        return 400;
      default:
        return MIN_H;
    }
  }, [win.kind]);

  const dragState = React.useRef<
    | { kind: "drag"; offX: number; offY: number }
    | {
        kind: "resize";
        dir: string;
        startX: number;
        startY: number;
        startW: number;
        startH: number;
        startLeft: number;
        startTop: number;
      }
    | null
  >(null);
  const [interacting, setInteracting] = React.useState(false);

  // 挂载后，在下一次渲染时将 entered 翻转为 true，以便 CSS transition 生效。
  // 初始值从 phase 惰性派生，因此服务端和首次客户端渲染一致；
  // 后续渲染使用 state 中的值。
  const [entered, setEntered] = React.useState(
    () => win.phase !== "opening" && win.phase !== "restoring",
  );
  React.useEffect(() => {
    if (entered) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [entered]);

  // 每次渲染时计算飞行目标。当几何尺寸 / dockKey 变化时重新解析。
  const flyTarget = React.useMemo(() => {
    if (typeof window === "undefined") return { dx: 0, dy: 0 };
    const winBottomX = win.x + win.w / 2;
    const winBottomY = win.y + win.h;
    const rect = getDockTargetRect(win.dockKey);
    const targetX = rect ? rect.x + rect.width / 2 : window.innerWidth / 2;
    const targetY = rect ? rect.y + rect.height / 2 : window.innerHeight - 45;
    return { dx: targetX - winBottomX, dy: targetY - winBottomY };
  }, [win.x, win.y, win.w, win.h, win.dockKey]);

  const phase = win.phase;
  const isMinimized = win.minimized;

  // 解析 transform + opacity。静止时 transform === 'none'，以便
  // backdrop-filter 正确引用壁纸。
  let transform = "none";
  let opacity = 1;
  if (isMinimized || phase === "minimizing") {
    transform = `translate(${flyTarget.dx}px, ${flyTarget.dy}px) scale(0.08)`;
    opacity = 0;
  } else if (phase === "restoring" && !entered) {
    transform = `translate(${flyTarget.dx}px, ${flyTarget.dy}px) scale(0.08)`;
    opacity = 0;
  }

  const animClass =
    phase === "opening"
      ? `window-anim-opening-${motion}`
      : phase === "closing"
        ? `window-anim-closing-${motion}`
        : "";

  const transformOrigin =
    isMinimized || phase === "minimizing" || phase === "restoring"
      ? "50% 100%"
      : "50% 50%";

  const opacityEasing =
    phase === "minimizing" ? "cubic-bezier(0.75, 0, 1, 0.5)" : EASE;
  const transformEasing = phase === "minimizing" ? EASE_IN : EASE;
  const transition = interacting
    ? "none"
    : `left ${duration}ms ${EASE}, top ${duration}ms ${EASE}, width ${duration}ms ${EASE}, height ${duration}ms ${EASE}, transform ${duration}ms ${transformEasing}, opacity ${duration}ms ${opacityEasing}, background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease, color 0.4s ease`;

  const onTitleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (win.maximized) return;
      focus(win.id);
      dragState.current = {
        kind: "drag",
        offX: e.clientX - win.x,
        offY: e.clientY - win.y,
      };
      setInteracting(true);
      e.preventDefault();
    },
    [win.maximized, win.id, win.x, win.y, focus],
  );

  const onResizeMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (win.maximized) return;
      const dir = e.currentTarget.dataset.dir ?? "";
      focus(win.id);
      dragState.current = {
        kind: "resize",
        dir,
        startX: e.clientX,
        startY: e.clientY,
        startW: win.w,
        startH: win.h,
        startLeft: win.x,
        startTop: win.y,
      };
      setInteracting(true);
      e.preventDefault();
      e.stopPropagation();
    },
    [win.maximized, win.id, win.w, win.h, win.x, win.y, focus],
  );

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (s.kind === "drag") {
        const x = Math.max(6, Math.min(vw - 200, e.clientX - s.offX));
        const y = Math.max(
          MENUBAR_BOTTOM,
          Math.min(vh - DOCK_TOP_AREA - 40, e.clientY - s.offY),
        );
        move(win.id, x, y);
      } else {
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        let { startLeft: nx, startTop: ny, startW: nw, startH: nh } = s;
        const dir = s.dir;
        if (dir.includes("e")) nw = Math.max(minW, s.startW + dx);
        if (dir.includes("s")) nh = Math.max(minH, s.startH + dy);
        if (dir.includes("w")) {
          let w2 = Math.max(minW, s.startW - dx);
          let candidateX = s.startLeft + (s.startW - w2);
          if (candidateX < 6) {
            w2 = Math.max(minW, w2 - (6 - candidateX));
            candidateX = 6;
          }
          nx = candidateX;
          nw = w2;
        }
        if (dir.includes("n")) {
          const h2 = Math.max(minH, s.startH - dy);
          ny = Math.max(MENUBAR_BOTTOM, s.startTop + (s.startH - h2));
          nh = h2;
        }
        if (nx + nw > vw - 6) {
          nw = Math.max(minW, vw - 6 - nx);
        }
        if (ny + nh > vh - DOCK_TOP_AREA) nh = vh - DOCK_TOP_AREA - ny;
        move(win.id, nx, ny);
        resize(win.id, nw, nh);
      }
    };
    const onUp = () => {
      if (dragState.current) {
        dragState.current = null;
        setInteracting(false);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [win.id, move, resize, minW, minH]);

  return (
    <div
      onMouseDown={() => focus(win.id)}
      className={`glass-window absolute flex flex-col overflow-hidden ${animClass}`}
      style={{
        zIndex: win.z,
        position: "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        minWidth: minW,
        minHeight: minH,
        borderRadius: "var(--radius-window)",
        pointerEvents:
          phase === "closing" || phase === "minimizing" || isMinimized
            ? "none"
            : "auto",
        transform:
          phase === "opening" || phase === "closing" ? undefined : transform,
        opacity:
          phase === "opening" || phase === "closing" ? undefined : opacity,
        filter:
          phase === "opening" || phase === "closing"
            ? undefined
            : isMinimized || phase === "minimizing"
              ? "none"
              : undefined,
        transformOrigin,
        transition: phase === "closing" ? "none" : transition,
        willChange: "left, top, width, height, transform, opacity, filter",
      }}
    >
      <div
        onMouseDown={onTitleMouseDown}
        onDoubleClick={() => toggleMaximize(win.id)}
        className="h-11 flex-shrink-0 flex items-center px-4 relative z-[2] select-none cursor-move"
        style={{
          borderBottom: "1px solid var(--divider)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)",
        }}
      >
        <TrafficLights
          onClose={() => close(win.id)}
          onMin={() => minimize(win.id)}
          onMax={() => toggleMaximize(win.id)}
        />
        <div
          className="absolute left-1/2 top-1/2 text-[13px] font-medium tracking-tight flex items-center gap-1.5 pointer-events-none"
          style={{
            transform: "translate(-50%, -50%)",
            color: "var(--ink-secondary)",
          }}
        >
          <strong style={{ color: "var(--ink-primary)", fontWeight: 600 }}>
            {win.title}
          </strong>
          {win.subtitle && (
            <>
              <span
                className="w-[3px] h-[3px] rounded-full"
                style={{ background: "var(--ink-tertiary)" }}
              />
              <span>{win.subtitle}</span>
            </>
          )}
        </div>
        {headerExtra && (
          <div className="ml-auto flex items-center gap-1 relative z-[3]">
            {headerExtra}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 relative z-[1]">{children}</div>

      {!win.maximized && !isMinimized && (
        <>
          <Handle
            dir="n"
            className="top-0 left-2 right-2 h-1 cursor-ns-resize"
            onMouseDown={onResizeMouseDown}
          />
          <Handle
            dir="s"
            className="bottom-0 left-2 right-2 h-1 cursor-ns-resize"
            onMouseDown={onResizeMouseDown}
          />
          <Handle
            dir="e"
            className="top-2 bottom-2 right-0 w-1 cursor-ew-resize"
            onMouseDown={onResizeMouseDown}
          />
          <Handle
            dir="w"
            className="top-2 bottom-2 left-0 w-1 cursor-ew-resize"
            onMouseDown={onResizeMouseDown}
          />
          <Handle
            dir="ne"
            className="top-0 right-0 w-3 h-3 cursor-nesw-resize"
            onMouseDown={onResizeMouseDown}
          />
          <Handle
            dir="nw"
            className="top-0 left-0 w-3 h-3 cursor-nwse-resize"
            onMouseDown={onResizeMouseDown}
          />
          <Handle
            dir="se"
            className="bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
            onMouseDown={onResizeMouseDown}
          />
          <Handle
            dir="sw"
            className="bottom-0 left-0 w-3 h-3 cursor-nesw-resize"
            onMouseDown={onResizeMouseDown}
          />
        </>
      )}
    </div>
  );
}

function Handle({
  dir,
  className,
  onMouseDown,
}: {
  dir: string;
  className: string;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-dir={dir}
      className={`absolute z-[5] ${className}`}
      onMouseDown={onMouseDown}
    />
  );
}

function TrafficLights({
  onClose,
  onMin,
  onMax,
}: {
  onClose: () => void;
  onMin: () => void;
  onMax: () => void;
}) {
  return (
    <div
      className="flex gap-2 relative z-[3]"
      style={{ "--show-glyph": "0" } as React.CSSProperties}
      onMouseEnter={(e) => {
        e.currentTarget.style.setProperty("--show-glyph", "0.65");
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.setProperty("--show-glyph", "0");
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Light bg="#FF5F57" label="关闭" onClick={onClose}>
        <svg
          viewBox="0 0 24 24"
          width="7"
          height="7"
          stroke="#000"
          strokeWidth="1.8"
          fill="none"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </Light>
      <Light bg="#FEBC2E" label="最小化" onClick={onMin}>
        <svg
          viewBox="0 0 24 24"
          width="7"
          height="7"
          stroke="#000"
          strokeWidth="1.8"
          fill="none"
        >
          <path d="M5 12h14" />
        </svg>
      </Light>
      <Light bg="#28C840" label="最大化" onClick={onMax}>
        <svg
          viewBox="0 0 24 24"
          width="7"
          height="7"
          stroke="#000"
          strokeWidth="1.8"
          fill="none"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </Light>
    </div>
  );
}

function Light({
  bg,
  label,
  onClick,
  children,
}: {
  bg: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      className="w-3 h-3 rounded-full relative flex items-center justify-center transition-[filter] active:brightness-90"
      style={{
        background: bg,
        boxShadow:
          "inset 0 0 0 0.5px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.10)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 50%)",
        }}
      />
      <span
        className="relative z-[1] transition-opacity"
        style={{ opacity: "var(--show-glyph)" }}
      >
        {children}
      </span>
    </button>
  );
}
