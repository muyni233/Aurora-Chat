"use client";

/**
 * Dock 目标注册表 — 一个小型的全局键值映射（key → DOMRect 获取函数）。
 *
 * Dock 项目使用稳定的 key（例如 'system:agents'、'chat:<agentId>'）来注册自身。
 * 窗口在最小化时会查找对应的目标矩形，以便灯神飞入动画精准地落到匹配的 Dock
 * 图标上，而不是落在通用的底部中央位置。
 *
 * 此模块刻意不放在 React 状态中 — 测量数据是按需读取的（在准备最小化动画时），
 * 而非在矩形变化时触发重新渲染。
 */

type RectGetter = () => DOMRect | null;

const targets = new Map<string, RectGetter>();

export function registerDockTarget(key: string, get: RectGetter): () => void {
  targets.set(key, get);
  return () => {
    if (targets.get(key) === get) targets.delete(key);
  };
}

export function getDockTargetRect(key: string | undefined): DOMRect | null {
  if (!key) return null;
  return targets.get(key)?.() ?? null;
}

export function hasDockTarget(key: string | undefined): boolean {
  return !!key && targets.has(key);
}
