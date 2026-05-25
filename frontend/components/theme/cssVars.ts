// Aether OS — CSS 变量桥接层
//
// 根据解析后的主题 spec + 有效模式，构建 `--var: value` 映射表。
// applyCssVars 将其写入 `document.documentElement.style`。
//
// 我们有意提供两套变量集（浅色 + 深色），以便 globals.css 中的
// .glass 工具类可以通过 `[data-theme='dark']` 切换，无需在此处重新计算。

import {
  sky,
  surfacesLight,
  surfacesDark,
  shadowsLight,
  shadowsDark,
  radii,
} from "./tokens";
import type { EffectiveMode } from "./tokens";
import type { ThemeSpec } from "./presets";

export interface ResolvedTheme {
  mode: EffectiveMode;
  vars: Record<string, string>;
}

export function buildCssVars(
  spec: ThemeSpec,
  mode: EffectiveMode,
): ResolvedTheme {
  const s = mode === "dark" ? surfacesDark : surfacesLight;
  const sh = mode === "dark" ? shadowsDark : shadowsLight;

  const radiusScale =
    spec.radius === "compact" ? 0.5 : spec.radius === "soft" ? 1.5 : 1.0;
  const fontSize =
    spec.fontScale === "sm"
      ? "13px"
      : spec.fontScale === "lg"
        ? "16.5px"
        : "14px";

  const vars: Record<string, string> = {
    // Sky 色板
    "--sky-100": sky[100],
    "--sky-200": sky[200],
    "--sky-300": sky[300],
    "--sky-400": sky[400],
    "--sky-500": sky[500],
    "--sky-600": sky[600],
    "--sky-700": sky[700],
    "--sky-800": sky[800],
    "--sky-900": sky[900],

    // 表面图层
    "--desktop": s.desktop,
    "--glass-bg": s.glass,
    "--glass-bg-strong": s.glassStrong,
    "--glass-bg-soft": s.glassSoft,
    "--glass-border": s.glassBorder,
    "--glass-border-bright": s.glassBorderBright,
    "--glass-highlight": s.glassHighlight,
    "--divider": s.divider,
    "--hover-bg": s.hover,
    "--hover-bg-strong": s.hoverStrong,

    // 文字颜色
    "--ink-primary": s.inkPrimary,
    "--ink-secondary": s.inkSecondary,
    "--ink-tertiary": s.inkTertiary,

    // 阴影
    "--shadow-soft": sh.soft,
    "--shadow-window": sh.window,
    "--shadow-pop": sh.pop,
    "--shadow-dock": sh.dock,

    // 字体缩放
    "--base-font-size": fontSize,

    // 圆角
    "--radius-xs": `${Math.round(radii.xs * radiusScale)}px`,
    "--radius-sm": `${Math.round(radii.sm * radiusScale)}px`,
    "--radius-md": `${Math.round(radii.md * radiusScale)}px`,
    "--radius-lg": `${Math.round(radii.lg * radiusScale)}px`,
    "--radius-window": `${Math.round(radii.window * radiusScale)}px`,
    "--radius-card": `${Math.round(radii.card * radiusScale)}px`,
  };

  return { mode, vars };
}

export function applyCssVars(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved.mode);
  for (const [k, v] of Object.entries(resolved.vars)) {
    root.style.setProperty(k, v);
  }
  root.style.colorScheme = resolved.mode;
}

export function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
