"use client";

/**
 * DesktopShell —— Aether OS 根组件。
 *
 * 层叠顺序（从后到前）：
 *   - 壁纸层（渐变 + 漂浮云朵 + 光标光晕）
 *   - 顶部：菜单栏、Spotlight 搜索入口、桌面小部件
 *   - 中间：窗口画布（按 z 轴顺序渲染所有可见窗口）
 *   - 底部：Dock 栏
 *   - 覆盖层：Spotlight 搜索面板（⌘K）
 *
 * 快捷键：
 *   ⌘K / Ctrl+K → 切换 Spotlight 搜索面板
 */

import * as React from "react";
import { useWindowStore } from "@/stores/windows";
import { useAuth } from "@/contexts/AuthContext";
import { Wallpaper } from "./Wallpaper";
import { Menubar } from "./Menubar";
import { Widget } from "./Widget";
import { Dock } from "./Dock";
import { Spotlight } from "./Spotlight";
import { WindowSwitch } from "./WindowSwitch";
import { SpotlightPill } from "./SpotlightPill";
import { LockScreen } from "./LockScreen";
import { MobileShell } from "./MobileShell";
import { useIsMobile } from "@/lib/useIsMobile";

export function DesktopShell() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [spotlightOpen, setSpotlightOpen] = React.useState(false);
  const windows = useWindowStore((s) => s.windows);

  // 快捷键：⌘K 切换 Spotlight 搜索面板
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlightOpen((v) => !v);
      } else if (e.key === "Escape" && spotlightOpen) {
        e.preventDefault();
        setSpotlightOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spotlightOpen]);

  if (!user) {
    // LockScreen 同时覆盖"仍在加载认证状态"的情况，因为 SSR 无法知道
    // 客户端是否持有有效令牌。两种情况下渲染相同的 DOM 可避免水合不匹配。
    return <LockScreen />;
  }

  if (isMobile) {
    return <MobileShell />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Wallpaper />
      <Menubar onOpenSpotlight={() => setSpotlightOpen(true)} />
      <SpotlightPill onClick={() => setSpotlightOpen(true)} />
      <Widget />

      {/* 窗口画布 */}
      <div className="absolute inset-0 z-[10] pointer-events-none">
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{ pointerEvents: "none" }}
        >
          {windows.map((win) => (
            <div key={win.id} style={{ pointerEvents: "auto" }}>
              <WindowSwitch win={win} />
            </div>
          ))}
        </div>
      </div>

      <Dock onOpenSpotlight={() => setSpotlightOpen(true)} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}
