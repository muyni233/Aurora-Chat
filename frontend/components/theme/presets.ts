// Aether OS — 主题预设（浅色 / 深色 / 跟随系统）
//
// 相比旧的 iris/dusk/forest/sakura/mono 矩阵，已大幅简化。
// Aether OS 拥有统一的视觉标识（天蓝色 Aero 玻璃）；用户唯一可调节的
// 是浅色 vs 深色 vs 跟随系统。

import type { ThemeMode, EffectiveMode } from "./tokens";

export interface ThemeBackground {
  kind: "none" | "image";
  imageUrl: string;
  imageUrlDark?: string;
  blur: number;
  dim: number;
  extractPalette: boolean;
  parallaxEnabled?: boolean;
}

export interface ThemeSpec {
  mode: ThemeMode;
  /** 预留给未来的预设（目前仅有 'aether'）。 */
  preset?: string;
  /** 可选的主题色覆盖（保留用于后端兼容，Aether OS 当前未使用）。 */
  customAccent?: string | null;
  customSecondary?: string | null;
  customTertiary?: string | null;
  /** 可选的圆角缩放微调。 */
  radius?: "compact" | "normal" | "soft";
  /** 可选的字体缩放微调。 */
  fontScale?: "sm" | "md" | "lg";
  /** 可选的动效缩放微调。 */
  motion?: "none" | "reduced" | "full";
  /** 可选的背景图片偏好。 */
  background?: ThemeBackground;
}

export const DEFAULT_THEME_SPEC: ThemeSpec = {
  mode: "system",
  preset: "aether",
  radius: "normal",
  fontScale: "md",
  motion: "full",
  background: {
    kind: "none",
    imageUrl: "",
    imageUrlDark: "",
    blur: 0,
    dim: 0,
    extractPalette: false,
    parallaxEnabled: true,
  },
};

export function resolveEffectiveMode(
  mode: ThemeMode,
  systemMode: EffectiveMode,
): EffectiveMode {
  return mode === "system" ? systemMode : mode;
}

// 后端兼容 — 保留 PresetId 类型以供序列化器使用
export type PresetId = string;
