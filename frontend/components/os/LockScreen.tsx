"use client";

/**
 * LockScreen —— 登录前的状态。
 *
 * 壁纸 + 居中的玻璃卡片，内含登录表单。
 *
 * 重要提示 —— 玻璃卡片不使用 framer-motion。framer-motion 总是会
 * 生成 transform（即使是 `transform: matrix(1,0,0,1,0,0)`），这会破坏
 * `backdrop-filter` 对壁纸的引用。入场动画通过 CSS 关键帧动画实现，
 * 该动画将 `transform` 从"起始"状态过渡到 NONE（因此静止时卡片没有
 * transform → 模糊效果正常工作）。
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wallpaper } from "./Wallpaper";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Lock, ArrowRight, UserPlus, Eye, EyeOff } from "lucide-react";

export function LockScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const { branding } = useTheme();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      const next = params.get("next") || "/";
      router.push(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Wallpaper />
      <div className="absolute inset-0 z-[10] flex items-center justify-center p-4">
        <div className="glass-window lockscreen-card w-[90%] max-w-[400px] rounded-[18px] p-8 relative">
          <div className="relative z-[1]">
            <div className="text-center mb-6 flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logoUrl || "/logo.png"}
                alt="Logo"
                className="w-16 h-16 rounded-2xl object-contain p-2.5 mb-3.5"
                style={{
                  background: "var(--logo-mask-bg)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.15), 0 6px 16px rgba(0,0,0,0.1)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid var(--logo-mask-border)",
                }}
                onError={(e) => {
                  e.currentTarget.src = "/logo.png";
                }}
              />
              <div
                className="font-serif-italic text-[36px] leading-none mb-1"
                style={{ color: "var(--ink-primary)" }}
              >
                {branding.appName || "Aurora Chat"}
              </div>
              <div
                className="text-[13px] tracking-tight"
                style={{ color: "var(--ink-secondary)" }}
              >
                {branding.appTagline || "智能对话从这里开始"}
              </div>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <Input
                type="email"
                placeholder="邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                iconLeft={<Mail size={15} />}
                required
                autoFocus
              />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                iconLeft={<Lock size={15} />}
                iconRight={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-ink-tertiary hover:text-ink-secondary transition-colors cursor-pointer select-none active:scale-90"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
                required
              />

              {error && (
                <div
                  className="text-[12.5px] px-3 py-2 rounded-md"
                  style={{
                    background: "rgba(239,68,68,0.10)",
                    color: "var(--color-danger)",
                  }}
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={busy || !email || !password}
                size="lg"
                className="w-full justify-center gap-2"
              >
                {busy ? (
                  "正在登录…"
                ) : (
                  <>
                    登录 <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </form>

            <div
              className="mt-5 text-center text-[12.5px]"
              style={{ color: "var(--ink-secondary)" }}
            >
              还没有账号？
              <button
                onClick={() => router.push("/register")}
                className="ml-1 inline-flex items-center gap-1 font-medium"
                style={{ color: "var(--sky-600)" }}
              >
                创建一个 <UserPlus size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
