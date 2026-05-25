"use client";

/**
 * Aether OS 窗口管理器 — zustand store
 *
 * 桌面上每个可见的"窗口"都是这里的一个条目。路由不决定哪些窗口存在；
 * 这个 store 才是窗口存在与否的决策者。（URL 深链接会打开窗口，而非替换它们。）
 *
 * 每个窗口包含：
 *   - id          稳定标识符（字符串）
 *   - kind        窗口内渲染的内容类型（chat/settings/profile/...）
 *   - title       标题栏文字
 *   - props       与类型相关的负载数据（例如 {conversationId}）
 *   - x,y,w,h     视口像素坐标与尺寸
 *   - z           堆叠层级
 *   - minimized   视觉上隐藏但保留在 store 中
 *   - maximized   固定到视口 - 菜单栏 - dock 之间的区域
 *   - prev        取消最大化时恢复的快照
 */

import { create } from "zustand";

export type WindowKind = "chat" | "agents" | "settings";

export interface WindowProps {
  conversationId?: string;
  agentId?: string;
  initialModel?: string;
  /** 用于 SettingsWindow：指定打开的标签页。 */
  initialTab?: "account" | "appearance" | "about";
}

export interface OsWindow {
  id: string;
  kind: WindowKind;
  title: string;
  subtitle?: string;
  props: WindowProps;
  /** Dock 目标 key — 设置后，最小化动画会飞向对应 dock 图标的矩形位置。 */
  dockKey?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  prev?: { x: number; y: number; w: number; h: number };
  /** 进入/退出动画的生命周期阶段 */
  phase: "opening" | "open" | "closing" | "minimizing" | "restoring";
}

interface OpenOptions {
  /** 强制指定 id（这样重新打开同一个聊天时可以复用同一个窗口）。 */
  id?: string;
  /** Dock 绑定 key（用于灯神飞入式最小化动画）。 */
  dockKey?: string;
  /** 初始几何参数覆盖。 */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface WindowStore {
  windows: OsWindow[];
  activeId: string | null;
  zCounter: number;
  open: (
    kind: WindowKind,
    opts?: OpenOptions & {
      title?: string;
      subtitle?: string;
      props?: WindowProps;
    },
  ) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  setPhase: (id: string, phase: OsWindow["phase"]) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setTitle: (id: string, title: string, subtitle?: string) => void;
  closeAll: () => void;
}

/** 新窗口的默认尺寸 + 层叠偏移量。 */
function defaultGeometry(kind: WindowKind, count: number) {
  const baseW = (() => {
    switch (kind) {
      case "chat":
        return 1080;
      case "agents":
        return 880;
      case "settings":
        return 760;
      default:
        return 720;
    }
  })();
  const baseH = (() => {
    switch (kind) {
      case "chat":
        return 720;
      case "agents":
        return 600;
      case "settings":
        return 600;
      default:
        return 540;
    }
  })();

  if (typeof window === "undefined") {
    return { x: 80, y: 80, w: baseW, h: baseH };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(baseW, vw - 80);
  const h = Math.min(baseH, vh - 200);
  // 每个后续窗口向右下方层叠 30px
  const offset = (count % 6) * 30;
  const x = Math.max(40, (vw - w) / 2 + offset - 60);
  const y = Math.max(56, 80 + offset);
  return { x, y, w, h };
}

function defaultTitle(
  kind: WindowKind,
  props: WindowProps,
): { title: string; subtitle?: string } {
  switch (kind) {
    case "chat":
      return { title: "Aether OS", subtitle: "对话" };
    case "agents":
      return { title: "Aether OS", subtitle: "智能体" };
    case "settings":
      return { title: "设置" };
    default:
      return { title: "Aether OS" };
  }
  void props;
}

/** 窗口到 dock 图标 key 的默认映射，用于灯神飞入动画的锚定。 */
function defaultDockKey(
  kind: WindowKind,
  props: WindowProps,
): string | undefined {
  switch (kind) {
    case "chat":
      return props.agentId ? `agent:${props.agentId}` : undefined;
    case "agents":
      return "system:agents";
    case "settings":
      return "system:settings";
    default:
      return undefined;
  }
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  activeId: null,
  zCounter: 10,

  open(kind, opts = {}) {
    const targetDockKey =
      opts.dockKey ?? defaultDockKey(kind, opts.props ?? {});

    // 我们希望通过 ID 或 targetDockKey 来匹配现有窗口。
    // 如果 targetDockKey 已设置，它唯一地代表了某个"应用"实例，
    // 因此我们会复用该窗口，而不是打开一个重复的。
    let existing = opts.id
      ? get().windows.find((w) => w.id === opts.id)
      : undefined;
    if (!existing && targetDockKey) {
      existing = get().windows.find((w) => w.dockKey === targetDockKey);
    }

    if (existing) {
      const newTitle = opts.title ?? defaultTitle(kind, opts.props ?? {}).title;
      const newSubtitle =
        opts.subtitle ?? defaultTitle(kind, opts.props ?? {}).subtitle;
      set((state) => ({
        windows: state.windows.map((w) =>
          w.id === existing.id
            ? {
                ...w,
                title: newTitle,
                subtitle: newSubtitle,
                props: { ...w.props, ...opts.props },
              }
            : w,
        ),
      }));
      get().focus(existing.id);
      if (existing.minimized) get().restore(existing.id);
      return existing.id;
    }

    const id = opts.id ?? `${kind}-${Math.random().toString(36).slice(2, 8)}`;
    const count = get().windows.length;
    const geom = defaultGeometry(kind, count);
    const title = opts.title ?? defaultTitle(kind, opts.props ?? {}).title;
    const subtitle =
      opts.subtitle ?? defaultTitle(kind, opts.props ?? {}).subtitle;

    const zCounter = get().zCounter + 1;
    set((state) => ({
      zCounter,
      activeId: id,
      windows: [
        ...state.windows,
        {
          id,
          kind,
          title,
          subtitle,
          props: opts.props ?? {},
          dockKey: targetDockKey,
          x: opts.x ?? geom.x,
          y: opts.y ?? geom.y,
          w: opts.w ?? geom.w,
          h: opts.h ?? geom.h,
          z: zCounter,
          minimized: false,
          maximized: false,
          phase: "opening",
        },
      ],
    }));

    // 入场动画结束后将状态切换为 'open'
    setTimeout(() => {
      const w = get().windows.find((x) => x.id === id);
      if (w && w.phase === "opening") get().setPhase(id, "open");
    }, 560);

    return id;
  },

  close(id) {
    get().setPhase(id, "closing");
    setTimeout(() => {
      set((state) => {
        const remaining = state.windows.filter((w) => w.id !== id);
        const newActive = remaining.length
          ? remaining.reduce((a, b) => (a.z > b.z ? a : b)).id
          : null;
        return { windows: remaining, activeId: newActive };
      });
    }, 320);
  },

  focus(id) {
    set((state) => {
      const w = state.windows.find((x) => x.id === id);
      if (!w) return state;
      // 如果已经在顶层则跳过
      const max = Math.max(...state.windows.map((x) => x.z));
      if (w.z === max && state.activeId === id) return state;
      const zCounter = state.zCounter + 1;
      return {
        zCounter,
        activeId: id,
        windows: state.windows.map((x) =>
          x.id === id ? { ...x, z: zCounter, minimized: false } : x,
        ),
      };
    });
  },

  setPhase(id, phase) {
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, phase } : w)),
    }));
  },

  move(id, x, y) {
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    }));
  },

  resize(id, w, h) {
    set((state) => ({
      windows: state.windows.map((win) =>
        win.id === id ? { ...win, w, h } : win,
      ),
    }));
  },

  minimize(id) {
    get().setPhase(id, "minimizing");
    setTimeout(() => {
      set((state) => ({
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, minimized: true, phase: "open" } : w,
        ),
        activeId:
          state.activeId === id
            ? (state.windows
                .filter((w) => w.id !== id && !w.minimized)
                .reduce<OsWindow | null>(
                  (a, b) => (!a || b.z > a.z ? b : a),
                  null,
                )?.id ?? null)
            : state.activeId,
      }));
    }, 460);
  },

  restore(id) {
    get().setPhase(id, "restoring");
    set((state) => {
      const zCounter = state.zCounter + 1;
      return {
        zCounter,
        activeId: id,
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, minimized: false, z: zCounter } : w,
        ),
      };
    });
    setTimeout(() => {
      const w = get().windows.find((x) => x.id === id);
      if (w && w.phase === "restoring") get().setPhase(id, "open");
    }, 460);
  },

  toggleMaximize(id) {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized && w.prev) {
          return { ...w, ...w.prev, maximized: false, prev: undefined };
        }
        const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
        const vh = typeof window !== "undefined" ? window.innerHeight : 900;
        return {
          ...w,
          maximized: true,
          prev: { x: w.x, y: w.y, w: w.w, h: w.h },
          x: 6,
          y: 36,
          w: vw - 12,
          h: vh - 36 - 90,
        };
      }),
    }));
  },

  setTitle(id, title, subtitle) {
    set((state) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, title, subtitle } : w,
      ),
    }));
  },

  closeAll() {
    set({ windows: [], activeId: null });
  },
}));

/** 打开或聚焦一个指定 conversation id 的聊天窗口。 */
export function openChatWindow(
  conversationId: string,
  subtitle?: string,
  agentId?: string,
): string {
  return useWindowStore.getState().open("chat", {
    id: agentId ? `chat-agent-${agentId}` : `chat-${conversationId}`,
    props: { conversationId, agentId },
    subtitle: subtitle ?? "对话",
    dockKey: agentId ? `agent:${agentId}` : undefined,
  });
}
