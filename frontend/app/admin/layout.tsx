"use client";

/**
 * 管理后台布局 — 独立的全屏区域，不包含 OS 外壳。
 * 侧边导航栏 + 主内容区 + 返回桌面按钮。
 *
 * 客户端侧保护：将非管理员用户重定向回桌面。
 * （服务端权限校验在后端完成；此处仅为体验优化。）
 */

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { Wallpaper } from "@/components/os/Wallpaper";
import {
  ArrowLeft,
  Sparkles,
  Users2,
  Server,
  Bot,
  Palette,
  SlidersHorizontal,
  Database,
  Menu,
  X,
} from "lucide-react";

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavLink[] = [
  { href: "/admin", label: "总览", icon: <Sparkles size={15} /> },
  { href: "/admin/agents", label: "智能体", icon: <Bot size={15} /> },
  { href: "/admin/providers", label: "模型供应商", icon: <Server size={15} /> },
  { href: "/admin/users", label: "用户", icon: <Users2 size={15} /> },
  { href: "/admin/database", label: "数据库", icon: <Database size={15} /> },
  { href: "/admin/branding", label: "品牌", icon: <Palette size={15} /> },
  {
    href: "/admin/settings",
    label: "系统设置",
    icon: <SlidersHorizontal size={15} />,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { branding, effectiveMode } = useTheme();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <Wallpaper />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col md:flex-row">
      <Wallpaper />

      {/* 动态可读性叠加层 */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none transition-colors duration-500 ease-in-out"
        style={{
          background:
            effectiveMode === "dark"
              ? "rgba(10, 15, 26, 0.45)"
              : "rgba(255, 255, 255, 0.28)",
        }}
      />

      {/* 移动端顶栏 */}
      <header
        className="flex md:hidden items-center justify-between px-4 py-3 z-[80] flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--divider)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1 rounded-lg hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-1.5">
          <div
            className="text-[13.5px] font-semibold tracking-tight"
            style={{ color: "var(--ink-primary)" }}
          >
            管理后台
          </div>
        </div>

        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1 text-[11.5px] font-medium px-2 py-1 rounded-lg bg-[var(--hover-bg)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          <ArrowLeft size={12} />
          桌面
        </button>
      </header>

      {/* 移动端侧边抽屉遮罩 */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-[190] md:hidden bg-black/25 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* 侧边栏 - 桌面端固定 / 移动端抽屉 */}
      <aside
        className={`fixed md:relative top-0 bottom-0 left-0 w-[240px] md:w-[220px] z-[200] md:z-[10] flex flex-col p-4 md:p-3 gap-1 transition-transform duration-300 md:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{
          borderRight: "1px solid var(--divider)",
          background: "var(--glass-bg-strong)",
          backdropFilter: "blur(28px) saturate(180%) brightness(1.04)",
          WebkitBackdropFilter: "blur(28px) saturate(180%) brightness(1.04)",
        }}
      >
        <div className="flex items-center justify-between md:hidden mb-2">
          <span
            className="text-[11.5px] font-bold uppercase tracking-widest"
            style={{ color: "var(--ink-tertiary)" }}
          >
            Aether OS
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1 rounded-lg hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--ink-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>

        <button
          onClick={() => {
            setDrawerOpen(false);
            router.push("/");
          }}
          className="flex items-center gap-2 px-2.5 py-2 mb-2 rounded-lg text-[12.5px] font-medium transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          <ArrowLeft size={14} />
          返回桌面
        </button>

        <div className="flex items-center gap-2.5 px-2.5 py-2.5 mb-2 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--divider)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoUrl || "/logo.png"}
            alt="Logo"
            className="w-9 h-9 rounded-xl object-contain p-1.5 flex-shrink-0"
            style={{
              background: "var(--logo-mask-bg)",
              border: "1px solid " + "var(--logo-mask-border)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 12px rgba(14,165,233,0.18)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onError={(e) => {
              e.currentTarget.src = "/logo.png";
            }}
          />
          <div className="min-w-0">
            <div
              className="text-[13px] font-semibold tracking-tight truncate"
              style={{ color: "var(--ink-primary)" }}
            >
              {branding.appName || "Aurora Chat"}
            </div>
            <div
              className="text-[10px] uppercase font-bold"
              style={{ color: "var(--ink-tertiary)" }}
            >
              管理控制台
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 mt-2">
          {NAV.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors"
                style={{
                  background: active ? "rgba(14,165,233,0.14)" : "transparent",
                  color: active ? "var(--sky-700)" : "var(--ink-secondary)",
                  fontWeight: active ? 600 : 500,
                }}
              >
                <span style={{ opacity: active ? 1 : 0.7 }}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="mt-auto px-2.5 py-2 text-[11px] tracking-wider uppercase"
          style={{ color: "var(--ink-tertiary)" }}
        >
          {user.username} · admin
        </div>
      </aside>

      <main className="relative z-[10] flex-1 overflow-y-auto min-h-0">
        {children}
      </main>
    </div>
  );
}
