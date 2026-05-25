"use client";

/**
 * Menubar —— macOS 风格的顶部菜单栏
 *
 * 左侧：品牌名称 + 活动应用菜单（文件 / 智能体 / 视图 / 窗口 / 帮助）
 * 右侧：连接状态 + 电池 + 时间
 *
 * 菜单目前仅为视觉展示；品牌菜单下拉包含"关于 / 设置 / 退出登录"。
 */

import * as React from "react";
import { useWindowStore } from "@/stores/windows";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Wifi,
  BatteryMedium,
  Bluetooth,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MenubarProps {
  onOpenSpotlight: () => void;
}

export function Menubar({ onOpenSpotlight }: MenubarProps) {
  const { branding, effectiveMode, patchSpec } = useTheme();
  const { user, logout } = useAuth();
  const open = useWindowStore((s) => s.open);
  const [time, setTime] = React.useState(() => new Date());
  const [shouldAnimate, setShouldAnimate] = React.useState(true);

  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    const timer = setTimeout(() => setShouldAnimate(false), 900);
    return () => {
      clearInterval(t);
      clearTimeout(timer);
    };
  }, []);

  const h = time.getHours();
  const m = String(time.getMinutes()).padStart(2, "0");
  const period = h >= 12 ? "下午" : "上午";
  const h12 = h % 12 || 12;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center px-4 text-[13px] ${shouldAnimate ? "animate-slide-down" : ""} glass menubar-flat`}
      style={{
        height: 30,
        borderRadius: 0,
        borderLeft: "none",
        borderRight: "none",
        borderTop: "none",
        color: "var(--ink-primary)",
      }}
    >
      <div className="flex items-center gap-4 relative z-[1]">
        {/* 品牌 → 菜单 */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="font-bold tracking-tight px-1.5 py-0.5 rounded-md hover:bg-[var(--hover-bg)]">
              {branding.appName || "Aurora Chat"}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              className="glass relative min-w-[220px] py-1.5 z-[300]"
              style={{ borderRadius: 12, color: "var(--ink-primary)" }}
              asChild
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: "top left" }}
              >
                <MenuItem
                  onSelect={() =>
                    open("settings", {
                      id: "settings",
                      props: { initialTab: "about" },
                    })
                  }
                >
                  关于 Aether OS
                </MenuItem>
                <MenuItem
                  onSelect={() =>
                    open("settings", {
                      id: "settings",
                      props: { initialTab: "appearance" },
                    })
                  }
                >
                  外观…
                </MenuItem>
                <MenuItem
                  onSelect={() =>
                    open("settings", {
                      id: "settings",
                      props: { initialTab: "account" },
                    })
                  }
                >
                  偏好设置…
                </MenuItem>
                {user?.role === "admin" && (
                  <>
                    <Separator />
                    <MenuItem
                      onSelect={() => {
                        window.location.href = "/admin";
                      }}
                    >
                      管理后台…
                    </MenuItem>
                  </>
                )}
                <Separator />
                <MenuItem onSelect={onOpenSpotlight}>
                  Spotlight 搜索… <Shortcut keys="⌘K" />
                </MenuItem>
                <Separator />
                {user && (
                  <>
                    <MenuItem
                      onSelect={() =>
                        open("settings", {
                          id: "settings",
                          props: { initialTab: "account" },
                        })
                      }
                    >
                      账号资料
                    </MenuItem>
                    <MenuItem
                      onSelect={() => logout()}
                      className="text-[var(--color-danger)]"
                    >
                      退出登录
                    </MenuItem>
                  </>
                )}
              </motion.div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <MenuLink label="文件" />
        <MenuLink
          label="智能体"
          onClick={() => open("agents", { id: "agents" })}
        />
        <MenuLink label="视图" />
        <MenuLink label="窗口" />
        <MenuLink label="帮助" />
      </div>

      <div
        className="ml-auto flex items-center gap-3.5 relative z-[1]"
        style={{ color: "var(--ink-secondary)" }}
      >
        <button
          onClick={onOpenSpotlight}
          aria-label="Spotlight 搜索"
          className="p-1 rounded-md hover:bg-[var(--hover-bg)] flex items-center justify-center w-[26px] h-[26px]"
        >
          <Search size={15} strokeWidth={1.7} />
        </button>
        <ModeToggle
          effectiveMode={effectiveMode}
          onToggle={() =>
            patchSpec({ mode: effectiveMode === "dark" ? "light" : "dark" })
          }
        />
        <Wifi size={15} strokeWidth={1.6} />
        <Bluetooth size={15} strokeWidth={1.6} />
        <span
          className="inline-flex items-center gap-1 text-[12px]"
          style={{
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink-primary)",
          }}
        >
          <BatteryMedium size={18} strokeWidth={1.5} />
          78%
        </span>
        <span
          className="text-[var(--ink-primary)] font-medium tracking-tight"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {period} {h12}:{m}
        </span>
      </div>
    </header>
  );
}

function MenuLink({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-medium px-1.5 py-0.5 rounded-md hover:bg-[var(--hover-bg)] transition-colors"
    >
      {label}
    </button>
  );
}

function MenuItem({
  children,
  onSelect,
  className = "",
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu.Item
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.();
      }}
      className={`px-3 py-1.5 mx-1 rounded-md text-[13px] outline-none cursor-default data-[highlighted]:bg-[var(--hover-bg)] flex items-center justify-between gap-3 ${className}`}
    >
      {children}
    </DropdownMenu.Item>
  );
}

function Separator() {
  return <div className="my-1 mx-2 h-px bg-[var(--divider)]" />;
}

function Shortcut({ keys }: { keys: string }) {
  return (
    <span
      className="text-[10.5px] px-1.5 py-0.5 rounded font-mono opacity-60"
      style={{ background: "var(--hover-bg)" }}
    >
      {keys}
    </span>
  );
}

function ModeToggle({
  effectiveMode,
  onToggle,
}: {
  effectiveMode: "light" | "dark";
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label="切换主题"
      className="p-1 rounded-md hover:bg-[var(--hover-bg)] cursor-pointer flex items-center justify-center relative w-[26px] h-[26px] overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        {effectiveMode === "dark" ? (
          <motion.span
            key="moon"
            initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Moon size={15} strokeWidth={1.7} />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: 90, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0.8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Sun size={15} strokeWidth={1.7} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
