// ────────────────────────────────────────────────────────────────────
// Aether OS — 设计令牌
// "云层之上的玻璃" — 灵感来自 Win7 Aero / macOS Big Sur
// ────────────────────────────────────────────────────────────────────

// Sky 色板 — 主界面品牌色（清凉、明亮、专业）
export const sky = {
  100: "#E0F2FE",
  200: "#BAE6FD",
  300: "#7DD3FC",
  400: "#38BDF8",
  500: "#0EA5E9",
  600: "#0284C7",
  700: "#0369A1",
  800: "#075985",
  900: "#0C4A6E",
} as const;

// Iris 色板 — 仅用于智能体头像/强调色（非主界面）
// 六种命名色调，使每个智能体拥有独特的身份渐变
export const irisPalette = {
  violet: ["#A78BFA", "#7C3AED"] as const,
  orange: ["#FB923C", "#EA580C"] as const,
  azure: ["#38BDF8", "#0369A1"] as const,
  mint: ["#34D399", "#047857"] as const,
  pink: ["#F472B6", "#BE185D"] as const,
  amber: ["#FBBF24", "#D97706"] as const,
  slate: ["#94A3B8", "#475569"] as const,
} as const;

export type IrisTone = keyof typeof irisPalette;

// 将智能体 ID（或名称哈希）→ 映射到稳定的 iris 色调
export const AGENT_TONES: IrisTone[] = [
  "violet",
  "orange",
  "azure",
  "mint",
  "pink",
  "amber",
];

export function toneForKey(key: string): IrisTone {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AGENT_TONES[h % AGENT_TONES.length];
}

// ── 语义化强调色 ──────────────────────────────────────────────────
export const semantic = {
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: sky[500],
} as const;

// ── 浅色表面图层 — "Aether Sky" ──────────────────────────────────
export const surfacesLight = {
  desktop: "#EEF1F5", // 壁纸后备颜色
  glass: "rgba(255,255,255,0.32)",
  glassStrong: "rgba(255,255,255,0.50)",
  glassSoft: "rgba(255,255,255,0.22)",
  glassBorder: "rgba(255,255,255,0.55)",
  glassBorderBright: "rgba(255,255,255,0.85)",
  glassHighlight: "rgba(255,255,255,0.95)",
  divider: "rgba(15,30,60,0.08)",
  hover: "rgba(15,30,60,0.06)",
  hoverStrong: "rgba(15,30,60,0.10)",
  inkPrimary: "rgba(15,30,60,0.94)",
  inkSecondary: "rgba(15,30,60,0.62)",
  inkTertiary: "rgba(15,30,60,0.40)",
} as const;

// ── 深色表面图层 — "夜空" ────────────────────────────────────────
export const surfacesDark = {
  desktop: "#0B1220",
  glass: "rgba(20,28,44,0.42)",
  glassStrong: "rgba(28,38,58,0.62)",
  glassSoft: "rgba(20,28,44,0.28)",
  glassBorder: "rgba(255,255,255,0.10)",
  glassBorderBright: "rgba(255,255,255,0.16)",
  glassHighlight: "rgba(255,255,255,0.08)",
  divider: "rgba(255,255,255,0.06)",
  hover: "rgba(255,255,255,0.06)",
  hoverStrong: "rgba(255,255,255,0.10)",
  inkPrimary: "rgba(240,246,255,0.94)",
  inkSecondary: "rgba(200,212,232,0.62)",
  inkTertiary: "rgba(170,182,205,0.42)",
} as const;

// ── 阴影 ──────────────────────────────────────────────────────────
export const shadowsLight = {
  // 蓝色调，如天空反射
  soft: "0 28px 60px -16px rgba(30, 80, 160, 0.22), 0 6px 16px rgba(30, 80, 160, 0.08), 0 1px 2px rgba(30, 80, 160, 0.06)",
  window:
    "0 32px 80px -20px rgba(15, 40, 100, 0.35), 0 12px 28px rgba(15, 40, 100, 0.18), 0 2px 6px rgba(15, 40, 100, 0.08)",
  pop: "0 12px 32px rgba(30, 80, 160, 0.18)",
  dock: "0 18px 40px -10px rgba(15, 40, 100, 0.32), 0 6px 14px rgba(15, 40, 100, 0.12)",
} as const;

export const shadowsDark = {
  soft: "0 28px 60px -16px rgba(0,0,0,0.55), 0 6px 16px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
  window:
    "0 32px 80px -20px rgba(0,0,0,0.7), 0 12px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)",
  pop: "0 12px 32px rgba(0,0,0,0.45)",
  dock: "0 18px 40px -10px rgba(0,0,0,0.65), 0 6px 14px rgba(0,0,0,0.35)",
} as const;

// ── 动效 ──────────────────────────────────────────────────────────
export const motion = {
  // visionOS / macOS Big Sur 风格的缓动曲线
  easing: {
    glide: "cubic-bezier(0.16, 1, 0.3, 1)", // 主推 — 近似 out-quint
    decelerate: "cubic-bezier(0, 0, 0, 1)",
    accelerate: "cubic-bezier(0.6, 0, 0.84, 0)",
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  duration: {
    micro: 120,
    fast: 200,
    base: 320,
    slow: 460,
    epic: 720,
  },
} as const;

// ── 圆角 ──────────────────────────────────────────────────────────
export const radii = {
  none: 0,
  xs: 5,
  sm: 8,
  md: 11,
  lg: 14,
  window: 16,
  card: 18,
  pill: 9999,
} as const;

// ── 类型 ──────────────────────────────────────────────────────────
export type EffectiveMode = "light" | "dark";
export type ThemeMode = EffectiveMode | "system";
