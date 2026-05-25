/**
 * Aether OS — 玻璃拟态基础样式，以原始形式注入到文档头部。
 *
 * 我们绕过 PostCSS / lightningcss，因为二者在发现 `-webkit-backdrop-filter`
 * 与非前缀版本并存时，会删除非前缀的 `backdrop-filter` 声明（将其视为重复）。
 * Chrome/Edge 需要非前缀属性；Safari 需要 -webkit- 前缀；缺少任何一个，
 * 玻璃效果就会在其中一种浏览器中失效。
 *
 * 通过 dangerouslySetInnerHTML 内联可确保浏览器精准看到两条声明。
 */
export const GLASS_CSS = `
/* ── 液态玻璃基础样式 ─────────────────────────────────────────── */
.glass {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(28px) saturate(200%) brightness(1.08);
  -webkit-backdrop-filter: blur(28px) saturate(200%) brightness(1.08);
  border: 1px solid var(--glass-border-bright);
  box-shadow:
    inset 0 1px 0 0 var(--glass-highlight),
    inset 0 -1px 0 0 rgba(30, 60, 120, 0.04),
    var(--shadow-soft);
}
.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(120% 80% at 50% -20%,
    rgba(255, 255, 255, 0.55) 0%,
    rgba(255, 255, 255, 0.08) 35%,
    transparent 65%);
  pointer-events: none;
  z-index: 0;
  mix-blend-mode: plus-lighter;
}
[data-theme='dark'] .glass::before {
  background: radial-gradient(120% 80% at 50% -20%,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.04) 35%,
    transparent 65%);
}

.glass-strong { background: var(--glass-bg-strong); }
.glass-soft   { background: var(--glass-bg-soft); }

.glass-tile {
  background: var(--glass-bg);
  backdrop-filter: blur(14px) saturate(180%);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  border: 1px solid var(--glass-border);
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    0 4px 12px rgba(30, 60, 120, 0.08);
}
[data-theme='dark'] .glass-tile {
  box-shadow:
    inset 0 1px 0 var(--glass-highlight),
    0 4px 14px rgba(0, 0, 0, 0.35);
}

/* ── 窗口玻璃 — 最强模糊，彩色边缘 ────────────────────────────── */
.glass-window {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(28px) saturate(200%) brightness(1.08);
  -webkit-backdrop-filter: blur(28px) saturate(200%) brightness(1.08);
  border: 1px solid var(--glass-border-bright);
  box-shadow:
    inset 0 1px 0 0 var(--glass-highlight),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 0 rgba(30, 60, 120, 0.05),
    var(--shadow-window);
}
.glass-window::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(140% 70% at 50% -10%,
      rgba(255, 255, 255, 0.40) 0%,
      rgba(255, 255, 255, 0.06) 30%,
      transparent 55%),
    radial-gradient(80% 30% at 30% 100%,
      rgba(56, 189, 248, 0.06) 0%,
      transparent 70%);
  pointer-events: none;
  z-index: 0;
  mix-blend-mode: plus-lighter;
}
[data-theme='dark'] .glass-window::before {
  background:
    radial-gradient(140% 70% at 50% -10%,
      rgba(255, 255, 255, 0.12) 0%,
      rgba(255, 255, 255, 0.03) 30%,
      transparent 55%),
    radial-gradient(80% 30% at 30% 100%,
      rgba(56, 189, 248, 0.05) 0%,
      transparent 70%);
}
.glass-window::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg,
    rgba(168, 139, 250, 0.45) 0%,
    rgba(56, 189, 248, 0.45) 25%,
    rgba(244, 114, 182, 0.30) 50%,
    rgba(56, 189, 248, 0.45) 75%,
    rgba(52, 211, 153, 0.40) 100%);
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
  opacity: 0.55;
  z-index: 0;
}
[data-theme='dark'] .glass-window::after {
  opacity: 0.35;
}

/* ── Dock 外壳 ────────────────────────────────────────────────── */
.dock-shell {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(28px) saturate(200%) brightness(1.08);
  -webkit-backdrop-filter: blur(28px) saturate(200%) brightness(1.08);
  border: 1px solid var(--glass-border-bright);
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.95),
    inset 0 -1px 0 0 rgba(30, 60, 120, 0.06),
    var(--shadow-dock);
}
.dock-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(80% 100% at 50% -20%,
    rgba(255, 255, 255, 0.6) 0%,
    transparent 60%);
  pointer-events: none;
  z-index: 0;
  mix-blend-mode: plus-lighter;
}
[data-theme='dark'] .dock-shell {
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 0 rgba(0, 0, 0, 0.3),
    var(--shadow-dock);
}
[data-theme='dark'] .dock-shell::before {
  background: radial-gradient(80% 100% at 50% -20%,
    rgba(255, 255, 255, 0.10) 0%,
    transparent 60%);
}

/* ── 输入框（聊天消息输入）外壳 ───────────────────────────────── */
.composer-shell {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 1px 3px rgba(30, 60, 120, 0.06);
}
.composer-shell:focus-within {
  background: rgba(255, 255, 255, 0.78);
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 0 0 4px rgba(56, 189, 248, 0.15);
}
[data-theme='dark'] .composer-shell {
  background: rgba(28, 38, 58, 0.55);
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.30);
}
[data-theme='dark'] .composer-shell:focus-within {
  background: rgba(36, 50, 76, 0.7);
  border-color: rgba(56, 189, 248, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 0 4px rgba(56, 189, 248, 0.12);
}

/* ── 搜索框悬停效果 ──────────────────────────────────────────── */
.spotlight-pill:hover {
  background: var(--glass-bg-strong);
}

/* ── 锁屏入场动画 — CSS 关键帧（不用 framer-motion → 使静止卡片
       上的 backdrop-filter 保持活跃） ────────────────────────── */
@keyframes lockscreen-rise {
  from { opacity: 0; transform: translateY(22px) scale(0.96); }
  to   { opacity: 1; transform: none; }
}
.lockscreen-card {
  animation: lockscreen-rise 0.65s cubic-bezier(0.16, 1, 0.3, 1) both;
  box-shadow: var(--shadow-window);
}

/* ── 窗口打开与关闭关键帧 ────────────────────────────────────── */
@keyframes window-open-full {
  from { transform: translateY(22px) scale(0.965); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
@keyframes window-close-full {
  from { transform: none; opacity: 1; filter: none; }
  to   { transform: translateY(80px) scale(0.8) rotate(-6deg) skewX(-3deg); opacity: 0; filter: blur(16px); }
}
@keyframes window-open-reduced {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes window-close-reduced {
  from { opacity: 1; }
  to   { opacity: 0; }
}
.window-anim-opening-full {
  animation: window-open-full 480ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.window-anim-closing-full {
  animation: window-close-full 280ms cubic-bezier(0.6, 0, 0.84, 0) forwards !important;
}
.window-anim-opening-reduced {
  animation: window-open-reduced 200ms ease-out forwards;
}
.window-anim-closing-reduced {
  animation: window-close-reduced 150ms ease-in forwards !important;
}
.window-anim-opening-none {
  transform: none !important;
  opacity: 1 !important;
}
.window-anim-closing-none {
  opacity: 0 !important;
}

/* ── 菜单栏扁平覆盖 ──────────────────────────────────────────── */
.menubar-flat {
  box-shadow:
    inset 0 -1px 0 0 rgba(30, 60, 120, 0.04),
    var(--shadow-soft) !important;
}
.menubar-flat::before {
  display: none !important;
}


`;
