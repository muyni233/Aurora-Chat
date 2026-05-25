"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wallpaper } from "@/components/os/Wallpaper";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Lock,
  User as UserIcon,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Key,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface RegisterConfig {
  mode: "open" | "admin_review" | "email_verification";
  email_verification_available: boolean;
  allowed_email_domains: string[];
}

export default function RegisterPage() {
  const router = useRouter();
  const { branding, effectiveMode } = useTheme();
  const { loginWithToken } = useAuth();

  // 表单字段
  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");

  // UI 状态
  const [config, setConfig] = React.useState<RegisterConfig | null>(null);
  const [configLoading, setConfigLoading] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // 验证码状态
  const [codeSending, setCodeSending] = React.useState(false);
  const [codeSent, setCodeSent] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  // 密码规则校验
  const isLengthValid = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const isPasswordValid = isLengthValid && hasUpperCase && hasLowerCase;

  // 挂载时加载注册配置
  React.useEffect(() => {
    let cancelled = false;
    apiGet<RegisterConfig>("/api/auth/register/config")
      .then((cfg) => {
        if (!cancelled) {
          setConfig(cfg);
          setConfigLoading(false);
        }
      })
      .catch((err) => {
        console.error("加载注册配置失败:", err);
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 冷却倒计时
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const sendVerificationCode = async () => {
    if (!email) {
      setError("请先填写邮箱地址");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("请输入有效的邮箱地址");
      return;
    }

    setCodeSending(true);
    setError(null);
    try {
      const res = await apiPost<{
        sent: boolean;
        resend_after_seconds: number;
      }>("/api/auth/register/request-code", { email });
      if (res.sent) {
        setCodeSent(true);
        setCooldown(res.resend_after_seconds || 60);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "发送验证码失败");
    } finally {
      setCodeSending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) {
      setError("密码不满足复杂度要求");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const payload: Record<string, unknown> = { email, username, password };
      if (config?.mode === "email_verification") {
        payload.code = code;
      }

      const res = await apiPost<{
        status: string;
        access_token?: string;
        message?: string;
      }>("/api/auth/register", payload);

      if (res.status === "active" && res.access_token) {
        await loginWithToken(res.access_token);
        router.replace("/");
      } else {
        setSuccessMsg(
          res.message || "注册成功！您的账号已创建，正在等待管理员审核通过。",
        );
        setEmail("");
        setUsername("");
        setPassword("");
        setCode("");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setBusy(false);
    }
  };

  const isFormValid =
    email &&
    username &&
    isPasswordValid &&
    (config?.mode !== "email_verification" || code);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Wallpaper />
      <div className="absolute inset-0 z-[10] flex items-center justify-center p-4 overflow-y-auto">
        <div className="glass-window lockscreen-card w-[95%] max-w-[420px] rounded-[20px] p-6.5 relative my-8">
          <div className="relative z-[1]">
            <button
              onClick={() => router.push("/")}
              className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] cursor-pointer hover:underline transition-all"
              style={{ color: "var(--ink-secondary)" }}
            >
              <ArrowLeft size={13} /> 返回登录
            </button>

            <div className="text-center mb-5 flex flex-col items-center select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logoUrl || "/logo.png"}
                alt="Logo"
                className="w-15 h-15 rounded-2xl object-contain p-2 mb-3"
                style={{
                  background:
                    effectiveMode === "dark"
                      ? "rgba(0, 0, 0, 0.4)"
                      : "rgba(255, 255, 255, 0.4)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.15), 0 6px 16px rgba(0,0,0,0.1)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border:
                    effectiveMode === "dark"
                      ? "1px solid rgba(255,255,255,0.06)"
                      : "1px solid rgba(0,0,0,0.06)",
                }}
                onError={(e) => {
                  e.currentTarget.src = "/logo.png";
                }}
              />
              <div
                className="font-serif-italic text-[30px] leading-none mb-1.5"
                style={{ color: "var(--ink-primary)" }}
              >
                加入 {branding.appName || "Aurora Chat"}
              </div>
              <div
                className="text-[12.5px] tracking-tight"
                style={{ color: "var(--ink-secondary)" }}
              >
                创建 Aurora 账号以开始使用
              </div>
            </div>

            {configLoading ? (
              <div className="space-y-3 py-6 select-none">
                <div className="h-11 rounded-xl animate-pulse bg-black/5 dark:bg-white/5" />
                <div className="h-11 rounded-xl animate-pulse bg-black/5 dark:bg-white/5" />
                <div className="h-11 rounded-xl animate-pulse bg-black/5 dark:bg-white/5" />
                <div className="h-12 rounded-xl animate-pulse bg-black/5 dark:bg-white/5 mt-6" />
              </div>
            ) : successMsg ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <div
                  className="text-[14px] leading-relaxed font-medium"
                  style={{ color: "var(--ink-primary)" }}
                >
                  {successMsg}
                </div>
                <Button
                  onClick={() => router.push("/")}
                  className="w-full justify-center mt-2"
                >
                  回到登录页面
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3.5">
                {/* 管理员审核警告 */}
                {config?.mode === "admin_review" && (
                  <div
                    className="px-3.5 py-2.5 rounded-xl text-[12px] leading-relaxed flex items-start gap-2 border"
                    style={{
                      background: "rgba(245,158,11,0.08)",
                      borderColor: "rgba(245,158,11,0.18)",
                      color: "var(--color-warning)",
                    }}
                  >
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>
                      提示：当前系统已开启审核模式。账号创建后，需等待管理员批准才可登录。
                    </span>
                  </div>
                )}

                {/* 用户名输入 */}
                <Input
                  placeholder="用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  iconLeft={<UserIcon size={15} />}
                  required
                  autoFocus
                />

                {/* 邮箱验证布局 */}
                {config?.mode === "email_verification" ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="邮箱"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        iconLeft={<Mail size={15} />}
                        required
                        className="flex-1 min-w-0"
                      />
                      <Button
                        type="button"
                        disabled={codeSending || cooldown > 0 || !email}
                        onClick={sendVerificationCode}
                        className="flex-shrink-0 text-[12px] h-11 px-3.5 rounded-xl justify-center font-semibold cursor-pointer active:scale-95 disabled:scale-100 select-none"
                        style={{
                          background: "var(--hover-bg)",
                          border: "1px solid var(--divider)",
                          color: "var(--ink-primary)",
                        }}
                      >
                        {codeSending
                          ? "发送中…"
                          : cooldown > 0
                            ? `${cooldown}s`
                            : "获取验证码"}
                      </Button>
                    </div>

                    <Input
                      placeholder="邮箱验证码"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      iconLeft={<Key size={15} />}
                      required
                      minLength={4}
                      maxLength={10}
                    />
                  </div>
                ) : (
                  <Input
                    type="email"
                    placeholder="邮箱"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    iconLeft={<Mail size={15} />}
                    required
                  />
                )}

                {/* 允许的邮箱域名提示 */}
                {config &&
                  config.allowed_email_domains &&
                  config.allowed_email_domains.length > 0 && (
                    <div
                      className="text-[11px] px-1"
                      style={{ color: "var(--ink-tertiary)" }}
                    >
                      只允许使用以下域名的邮箱注册：
                      <strong style={{ color: "var(--ink-secondary)" }}>
                        {config.allowed_email_domains.join(", ")}
                      </strong>
                    </div>
                  )}

                {/* 密码输入 */}
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="密码（包含大小写与数字）"
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

                {/* 实时密码复杂度检查 */}
                {password.length > 0 && (
                  <div
                    className="p-3 rounded-xl border space-y-1.5 select-none"
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      borderColor: "var(--divider)",
                    }}
                  >
                    <div
                      className="text-[11px] font-semibold mb-1"
                      style={{ color: "var(--ink-tertiary)" }}
                    >
                      密码复杂度要求：
                    </div>
                    <RuleRow checked={isLengthValid} text="长度至少 8 位" />
                    <RuleRow checked={hasUpperCase} text="包含大写字母 (A-Z)" />
                    <RuleRow checked={hasLowerCase} text="包含小写字母 (a-z)" />
                  </div>
                )}

                {/* 错误提示 */}
                {error && (
                  <div
                    className="text-[12.5px] px-3.5 py-2.5 rounded-xl flex items-start gap-2 border"
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      borderColor: "rgba(239,68,68,0.18)",
                      color: "var(--color-danger)",
                    }}
                  >
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 提交按钮 */}
                <Button
                  type="submit"
                  disabled={busy || !isFormValid}
                  size="lg"
                  className="w-full justify-center gap-2 mt-4 select-none cursor-pointer"
                >
                  {busy ? (
                    "正在创建账户…"
                  ) : (
                    <>
                      创建账号 <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleRow({ checked, text }: { checked: boolean; text: string }) {
  return (
    <div
      className="flex items-center gap-1.5 text-[11.5px] transition-colors"
      style={{
        color: checked ? "var(--color-success)" : "var(--ink-tertiary)",
      }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] border"
        style={{
          background: checked ? "rgba(34,197,94,0.1)" : "transparent",
          borderColor: checked ? "rgba(34,197,94,0.3)" : "var(--divider)",
        }}
      >
        {checked ? "✓" : "✗"}
      </span>
      <span>{text}</span>
    </div>
  );
}
