"use client";

/**
 * 管理后台系统设置 — 注册策略、SMTP 基础/OAuth 配置、上下文策略和主题默认值。
 *
 *   GET/PUT /api/admin/settings           注册模式
 *   GET/PUT /api/admin/settings/smtp      SMTP 配置
 *   POST    /api/admin/settings/smtp/test SMTP 测试
 *   GET/PUT /api/admin/settings/context   会话上下文窗口管理
 *   GET/PUT /api/admin/settings/theme     主题系统默认值
 */

import * as React from "react";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  apiUploadFiles,
  API_BASE,
} from "@/lib/api";
import {
  Save,
  AlertCircle,
  CheckCircle2,
  Mail,
  ShieldCheck,
  ShieldQuestion,
  Globe,
  Upload,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

type RegistrationMode = "open" | "admin_review" | "email_verification";

interface AdminSettingsResponse {
  registration_mode: RegistrationMode;
  email_verification_available: boolean;
  allowed_email_domains: string[];
}

interface SmtpConfigResponse {
  host: string;
  port: number;
  username: string;
  password_set: boolean;
  from_address: string;
  from_name: string;
  use_tls: boolean;
  use_ssl: boolean;
  enabled: boolean;
  auth_method: "password" | "xoauth2_microsoft";
  oauth_tenant_id: string;
  oauth_client_id: string;
  oauth_client_secret_set: boolean;
  oauth_authorized: boolean;
}

interface ContextSummaryModelOption {
  id: string;
  display_name: string;
  provider_name: string;
}

interface ContextConfig {
  strategy: "none" | "truncate" | "summarize";
  trigger_rounds: number;
  keep_recent_rounds: number;
  summary_model_id: string | null;
  auto_truncate_on_overflow: boolean;
  overflow_truncate_rounds: number;
  summary_prompt: string;
  available_models: ContextSummaryModelOption[];
}

interface ThemeBackground {
  kind: "none" | "image";
  imageUrl: string;
  imageUrlDark: string;
  blur: number;
  dim: number;
  extractPalette: boolean;
  parallaxEnabled: boolean;
}

interface ThemeSpec {
  mode: "light" | "dark" | "system";
  preset?: string;
  customAccent?: string | null;
  customSecondary?: string | null;
  customTertiary?: string | null;
  radius?: "compact" | "normal" | "soft";
  fontScale?: "sm" | "md" | "lg";
  motion?: "none" | "reduced" | "full";
  background?: ThemeBackground;
}

export default function AdminSettingsPage() {
  // 挂载时监听查询参数，用于拦截微软 OAuth 回调重定向
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (code && state) {
      const savedState = localStorage.getItem("microsoft_smtp_oauth_state");
      if (state !== savedState) {
        console.error("微软 OAuth CSRF 状态不匹配！");
        return;
      }
      localStorage.removeItem("microsoft_smtp_oauth_state");

      const redirectUri = window.location.origin + "/admin/settings";

      // 交换回调
      apiPost<SmtpConfigResponse>("/api/admin/settings/smtp/oauth/callback", {
        code,
        state,
        redirect_uri: redirectUri,
      })
        .then(() => {
          // 清理 URL 参数并重新加载
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
          window.location.reload();
        })
        .catch((e) => {
          console.error("完成微软 SMTP OAuth 回调失败:", e);
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        });
    }
  }, []);

  return (
    <div className="p-8 max-w-[760px] space-y-8">
      <div>
        <h1
          className="font-serif-italic text-[32px]"
          style={{ color: "var(--ink-primary)" }}
        >
          系统设置
        </h1>
        <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          管理注册策略、发信服务器、会话溢出规则与全局显示预设。
        </p>
      </div>
      <RegistrationSection />
      <SmtpSection />
      <ContextSection />
      <DefaultThemeSection />
    </div>
  );
}

// ── 注册策略 ──────────────────────────────────────────────────

function RegistrationSection() {
  const [data, setData] = React.useState<AdminSettingsResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = await apiGet<AdminSettingsResponse>("/api/admin/settings");
        if (!cancelled) setData(d);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = async (mode: RegistrationMode) => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const d = await apiPut<AdminSettingsResponse>("/api/admin/settings", {
        registration_mode: mode,
      });
      setData(d);
      setOk("已保存");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Skel rows={3} />;

  const opts: {
    id: RegistrationMode;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "open",
      label: "开放注册",
      desc: "任何人都可立即注册并使用",
      icon: <Globe size={16} />,
    },
    {
      id: "admin_review",
      label: "管理员审核",
      desc: "注册后需管理员手动批准",
      icon: <ShieldQuestion size={16} />,
    },
    {
      id: "email_verification",
      label: "邮箱验证",
      desc: "注册后需通过邮箱验证码确认",
      icon: <ShieldCheck size={16} />,
    },
  ];

  return (
    <div className="rounded-[16px] glass-tile p-6">
      <h2
        className="text-[14px] font-semibold tracking-tight mb-1"
        style={{ color: "var(--ink-primary)" }}
      >
        注册策略
      </h2>
      <p
        className="text-[12.5px] mb-4"
        style={{ color: "var(--ink-secondary)" }}
      >
        控制新用户能否自由注册。
      </p>
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o) => {
          const active = data.registration_mode === o.id;
          const disabled =
            o.id === "email_verification" && !data.email_verification_available;
          return (
            <button
              key={o.id}
              disabled={busy || disabled}
              onClick={() => setMode(o.id)}
              className="rounded-[14px] p-3 text-left transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 cursor-pointer"
              style={{
                background: active
                  ? "rgba(14,165,233,0.12)"
                  : "var(--hover-bg)",
                boxShadow: active ? "0 0 0 2px var(--sky-500)" : undefined,
              }}
            >
              <div
                className="mb-2"
                style={{
                  color: active ? "var(--sky-700)" : "var(--ink-secondary)",
                }}
              >
                {o.icon}
              </div>
              <div
                className="text-[13px] font-medium mb-0.5"
                style={{ color: "var(--ink-primary)" }}
              >
                {o.label}
              </div>
              <div
                className="text-[11px] leading-relaxed"
                style={{ color: "var(--ink-tertiary)" }}
              >
                {o.desc}
                {disabled && "（需先配置 SMTP）"}
              </div>
            </button>
          );
        })}
      </div>
      {err && <Banner kind="error">{err}</Banner>}
      {ok && <Banner kind="ok">{ok}</Banner>}
    </div>
  );
}

// ── SMTP ──────────────────────────────────────────────────────

function SmtpSection() {
  const [cfg, setCfg] = React.useState<SmtpConfigResponse | null>(null);
  const [form, setForm] = React.useState({
    host: "",
    port: 587,
    username: "",
    password: "",
    from_address: "",
    from_name: "Aurora Chat",
    use_tls: true,
    use_ssl: false,
    auth_method: "password" as "password" | "xoauth2_microsoft",
    oauth_tenant_id: "consumers",
    oauth_client_id: "",
    oauth_client_secret: "",
  });
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testEmail, setTestEmail] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const c = await apiGet<SmtpConfigResponse>("/api/admin/settings/smtp");
        if (cancelled) return;
        setCfg(c);
        setForm({
          host: c.host || "",
          port: c.port || 587,
          username: c.username || "",
          password: "",
          from_address: c.from_address || "",
          from_name: c.from_name || "Aurora Chat",
          use_tls: c.use_tls,
          use_ssl: c.use_ssl,
          auth_method: c.auth_method || "password",
          oauth_tenant_id: c.oauth_tenant_id || "consumers",
          oauth_client_id: c.oauth_client_id || "",
          oauth_client_secret: "",
        });
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const body: Record<string, unknown> = {
        host: form.host,
        port: Number(form.port),
        username: form.username,
        from_address: form.from_address,
        from_name: form.from_name,
        use_tls: form.use_tls,
        use_ssl: form.use_ssl,
        auth_method: form.auth_method,
      };

      if (form.auth_method === "password") {
        if (form.password) body.password = form.password;
        else body.password = null; // 空表示保持原值
      } else {
        body.oauth_tenant_id = form.oauth_tenant_id || "consumers";
        body.oauth_client_id = form.oauth_client_id;
        if (form.oauth_client_secret)
          body.oauth_client_secret = form.oauth_client_secret;
        else body.oauth_client_secret = null; // 空表示保持原值
      }

      const c = await apiPut<SmtpConfigResponse>(
        "/api/admin/settings/smtp",
        body,
      );
      setCfg(c);
      setForm((f) => ({ ...f, password: "", oauth_client_secret: "" }));
      setOk("SMTP 配置已保存");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const startOAuth = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const redirectUri = window.location.origin + "/admin/settings";
      const res = await apiPost<{ authorize_url: string; state: string }>(
        "/api/admin/settings/smtp/oauth/start",
        { redirect_uri: redirectUri },
      );
      localStorage.setItem("microsoft_smtp_oauth_state", res.state);
      window.location.href = res.authorize_url;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "发起授权失败");
      setSaving(false);
    }
  };

  const revokeOAuth = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const c = await apiDelete<SmtpConfigResponse>(
        "/api/admin/settings/smtp/oauth",
      );
      setCfg(c);
      setForm((f) => ({
        ...f,
        auth_method: c.auth_method,
        oauth_client_id: c.oauth_client_id || "",
        oauth_client_secret: "",
        oauth_tenant_id: c.oauth_tenant_id || "consumers",
        username: c.username || "",
      }));
      setOk("已成功注销微软 Office365 邮箱授权");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "注销授权失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!testEmail) return;
    setTesting(true);
    setErr(null);
    setOk(null);
    try {
      await apiPost("/api/admin/settings/smtp/test", { to: testEmail });
      setOk(`测试邮件已发送至 ${testEmail}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  if (!cfg) return <Skel rows={6} />;

  return (
    <div className="rounded-[16px] glass-tile p-6">
      <h2
        className="text-[14px] font-semibold tracking-tight mb-1 inline-flex items-center gap-2"
        style={{ color: "var(--ink-primary)" }}
      >
        <Mail size={14} /> SMTP 邮件服务
        {cfg.enabled && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold"
            style={{
              background: "rgba(34,197,94,0.15)",
              color: "var(--color-success)",
            }}
          >
            已启用
          </span>
        )}
      </h2>
      <p
        className="text-[12.5px] mb-4"
        style={{ color: "var(--ink-secondary)" }}
      >
        用于发送验证邮件、找回密码等系统邮件。
      </p>

      {/* 分段式认证方式选择器 */}
      <div className="mb-4">
        <label
          className="text-[11px] uppercase tracking-wider font-semibold block mb-1.5"
          style={{ color: "var(--ink-tertiary)" }}
        >
          认证方式
        </label>
        <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)] max-w-[280px]">
          {(["password", "xoauth2_microsoft"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setForm({ ...form, auth_method: m })}
              className="flex-1 py-1.5 px-1.5 text-[11px] sm:text-[12px] rounded-full font-medium transition-all cursor-pointer whitespace-nowrap"
              style={{
                background:
                  form.auth_method === m
                    ? "var(--glass-bg-strong)"
                    : "transparent",
                color:
                  form.auth_method === m
                    ? "var(--ink-primary)"
                    : "var(--ink-secondary)",
                boxShadow:
                  form.auth_method === m
                    ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                    : "none",
              }}
            >
              {m === "password" ? "密码认证" : "微软 OAuth2 认证"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="发信服务器 (Host)">
          <Input
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="例如 smtp.office365.com"
          />
        </Field>
        <Field label="端口 (Port)">
          <Input
            type="number"
            value={String(form.port)}
            onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            placeholder="587"
          />
        </Field>
        <Field label="发件人地址">
          <Input
            value={form.from_address}
            onChange={(e) => setForm({ ...form, from_address: e.target.value })}
            placeholder="noreply@example.com"
          />
        </Field>
        <Field label="发件人名称">
          <Input
            value={form.from_name}
            onChange={(e) => setForm({ ...form, from_name: e.target.value })}
          />
        </Field>
      </div>

      {form.auth_method === "password" ? (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="用户名">
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="例如 example@domain.com"
            />
          </Field>
          <Field
            label="密码"
            hint={cfg.password_set ? "已保存（留空保留）" : "必填"}
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={cfg.password_set ? "••••••" : ""}
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-4 mb-4 select-none">
          <div className="grid grid-cols-3 gap-3">
            <Field label="租户 ID (Tenant ID)" hint="默认 consumers">
              <Input
                value={form.oauth_tenant_id}
                onChange={(e) =>
                  setForm({ ...form, oauth_tenant_id: e.target.value })
                }
                placeholder="consumers"
              />
            </Field>
            <Field label="客户端 ID (Client ID)">
              <Input
                value={form.oauth_client_id}
                onChange={(e) =>
                  setForm({ ...form, oauth_client_id: e.target.value })
                }
                placeholder="Azure Application ID"
              />
            </Field>
            <Field
              label="客户端密钥"
              hint={cfg.oauth_client_secret_set ? "已保存（留空保留）" : "必填"}
            >
              <Input
                type="password"
                value={form.oauth_client_secret}
                onChange={(e) =>
                  setForm({ ...form, oauth_client_secret: e.target.value })
                }
                placeholder={cfg.oauth_client_secret_set ? "••••••" : ""}
              />
            </Field>
          </div>

          {/* 微软 OAuth 状态面板 */}
          <div className="p-4 rounded-2xl border flex items-center justify-between bg-black/5 dark:bg-white/5 border-[var(--divider)]">
            <div className="space-y-0.5">
              <div
                className="text-[12.5px] font-semibold flex items-center gap-1.5"
                style={{ color: "var(--ink-primary)" }}
              >
                微软 Outlook/Office365 邮箱授权状态
              </div>
              <div
                className="text-[11.5px]"
                style={{ color: "var(--ink-secondary)" }}
              >
                授权状态：
                {cfg.oauth_authorized ? (
                  <span className="font-bold text-emerald-500">
                    已授权 ({cfg.username || "已绑定"})
                  </span>
                ) : (
                  <span className="font-bold text-amber-500">未授权</span>
                )}
              </div>
            </div>
            {cfg.oauth_authorized ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={revokeOAuth}
                className="hover:bg-rose-500/10 hover:text-rose-500 border-rose-500/20 text-rose-500 cursor-pointer"
              >
                撤销授权
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={startOAuth}
                disabled={!cfg.oauth_client_id}
                className="cursor-pointer"
              >
                开始授权
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-6 mt-3">
        <label
          className="inline-flex items-center gap-2 text-[12.5px] select-none cursor-pointer"
          style={{ color: "var(--ink-secondary)" }}
        >
          <Switch
            checked={form.use_tls}
            onCheckedChange={(v) => setForm({ ...form, use_tls: v })}
          />{" "}
          使用 STARTTLS
        </label>
        <label
          className="inline-flex items-center gap-2 text-[12.5px] select-none cursor-pointer"
          style={{ color: "var(--ink-secondary)" }}
        >
          <Switch
            checked={form.use_ssl}
            onCheckedChange={(v) => setForm({ ...form, use_ssl: v })}
          />{" "}
          使用 SSL
        </label>
      </div>

      <div
        className="flex items-center justify-end gap-2 mt-5 pt-4"
        style={{ borderTop: "1px solid var(--divider)" }}
      >
        <Button onClick={save} disabled={saving} className="gap-1.5">
          <Save size={14} /> {saving ? "保存中…" : "保存 SMTP"}
        </Button>
      </div>

      <div
        className="mt-4 pt-4"
        style={{ borderTop: "1px solid var(--divider)" }}
      >
        <Field label="发信测试">
          <div className="flex gap-2">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="发送测试邮件到…"
              className="flex-1"
            />
            <Button
              variant="ghost"
              onClick={test}
              disabled={testing || !testEmail || !cfg.enabled}
            >
              {testing ? "发送中…" : "发送测试"}
            </Button>
          </div>
        </Field>
      </div>

      {err && <Banner kind="error">{err}</Banner>}
      {ok && <Banner kind="ok">{ok}</Banner>}
    </div>
  );
}

// ── 上下文策略 ───────────────────────────────────────────────

function ContextSection() {
  const [data, setData] = React.useState<ContextConfig | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    apiGet<ContextConfig>("/api/admin/settings/context")
      .then((cfg) => {
        if (!cancelled) setData(cfg);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "加载上下文配置失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!data) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const res = await apiPut<ContextConfig>("/api/admin/settings/context", {
        strategy: data.strategy,
        trigger_rounds: Number(data.trigger_rounds),
        keep_recent_rounds: Number(data.keep_recent_rounds),
        summary_model_id: data.summary_model_id || null,
        auto_truncate_on_overflow: data.auto_truncate_on_overflow,
        overflow_truncate_rounds: Number(data.overflow_truncate_rounds),
        summary_prompt: data.summary_prompt,
      });
      setData(res);
      setOk("会话上下文策略已成功保存");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Skel rows={4} />;

  return (
    <div className="rounded-[16px] glass-tile p-6">
      <h2
        className="text-[14px] font-semibold tracking-tight mb-1 flex items-center gap-2"
        style={{ color: "var(--ink-primary)" }}
      >
        会话上下文窗口策略
      </h2>
      <p
        className="text-[12.5px] mb-4"
        style={{ color: "var(--ink-secondary)" }}
      >
        配置长对话中，当上下文超出设定轮数时的溢出截断与自动总结策略。
      </p>

      <div className="space-y-4">
        {/* 策略选择 */}
        <div>
          <label
            className="text-[11px] uppercase tracking-wider font-semibold block mb-1.5"
            style={{ color: "var(--ink-tertiary)" }}
          >
            管理策略
          </label>
          <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)] max-w-sm">
            {(["none", "truncate", "summarize"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setData({ ...data, strategy: s })}
                className="flex-1 py-1.5 px-1.5 text-[11px] sm:text-[12px] rounded-full font-medium transition-all cursor-pointer whitespace-nowrap"
                style={{
                  background:
                    data.strategy === s
                      ? "var(--glass-bg-strong)"
                      : "transparent",
                  color:
                    data.strategy === s
                      ? "var(--ink-primary)"
                      : "var(--ink-secondary)",
                  boxShadow:
                    data.strategy === s
                      ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                      : "none",
                }}
              >
                {s === "none"
                  ? "不管理"
                  : s === "truncate"
                    ? "自动截断"
                    : "智能总结"}
              </button>
            ))}
          </div>
        </div>

        {data.strategy !== "none" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="触发轮数阈值">
                <Input
                  type="number"
                  min={2}
                  max={500}
                  value={String(data.trigger_rounds)}
                  onChange={(e) =>
                    setData({ ...data, trigger_rounds: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="保留最新轮数">
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={String(data.keep_recent_rounds)}
                  onChange={(e) =>
                    setData({
                      ...data,
                      keep_recent_rounds: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>

            {data.strategy === "summarize" && (
              <div className="space-y-3">
                <Field label="总结使用模型">
                  <select
                    value={data.summary_model_id || ""}
                    onChange={(e) =>
                      setData({
                        ...data,
                        summary_model_id: e.target.value || null,
                      })
                    }
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--divider)] bg-white/40 dark:bg-black/40 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 select-none text-[var(--ink-primary)]"
                  >
                    <option value="" disabled className="text-gray-400">
                      选择总结模型…
                    </option>
                    {data.available_models.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        className="bg-[var(--desktop)] text-[var(--ink-primary)]"
                      >
                        [{m.provider_name.toUpperCase()}] {m.display_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="总结 System Prompt">
                  <textarea
                    value={data.summary_prompt}
                    onChange={(e) =>
                      setData({ ...data, summary_prompt: e.target.value })
                    }
                    rows={4}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--divider)] bg-white/40 dark:bg-black/40 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 text-[var(--ink-primary)]"
                    placeholder="输入自动生成会话历史摘要的指令…"
                  />
                </Field>
              </div>
            )}

            <div className="pt-3 border-t border-[var(--divider)]">
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--ink-primary)" }}
                  >
                    溢出时自动截断保护
                  </div>
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--ink-tertiary)" }}
                  >
                    启用后，若总结策略失败或输入仍溢出，系统会自动截断较早的历史以保证稳定性
                  </div>
                </div>
                <Switch
                  checked={data.auto_truncate_on_overflow}
                  onCheckedChange={(checked) =>
                    setData({ ...data, auto_truncate_on_overflow: checked })
                  }
                />
              </div>

              {data.auto_truncate_on_overflow && (
                <div className="mt-3 max-w-xs">
                  <Field label="溢出截断轮数">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={String(data.overflow_truncate_rounds)}
                      onChange={(e) =>
                        setData({
                          ...data,
                          overflow_truncate_rounds: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className="flex items-center justify-end gap-2 mt-5 pt-4"
        style={{ borderTop: "1px solid var(--divider)" }}
      >
        <Button onClick={save} disabled={busy} className="gap-1.5">
          <Save size={14} /> {busy ? "保存中…" : "保存上下文策略"}
        </Button>
      </div>

      {err && <Banner kind="error">{err}</Banner>}
      {ok && <Banner kind="ok">{ok}</Banner>}
    </div>
  );
}

// ── 默认主题预设 ────────────────────────────────────────────

function DefaultThemeSection() {
  const [data, setData] = React.useState<ThemeSpec | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [wallpaperUploading, setWallpaperUploading] = React.useState(false);
  const [wallpaperDarkUploading, setWallpaperDarkUploading] =
    React.useState(false);

  const onWallpaperPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !data) return;
    const f = e.target.files[0];
    setWallpaperUploading(true);
    try {
      const [att] = await apiUploadFiles([f]);
      const url = att.url;
      setData({
        ...data,
        background: {
          kind: "image",
          imageUrl: url,
          imageUrlDark: data.background?.imageUrlDark ?? "",
          blur: data.background?.blur ?? 0,
          dim: data.background?.dim ?? 0,
          extractPalette: data.background?.extractPalette ?? false,
          parallaxEnabled: data.background?.parallaxEnabled ?? true,
        },
      });
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setWallpaperUploading(false);
      e.target.value = "";
    }
  };

  const onWallpaperDarkPick = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files?.length || !data) return;
    const f = e.target.files[0];
    setWallpaperDarkUploading(true);
    try {
      const [att] = await apiUploadFiles([f]);
      const url = att.url;
      setData({
        ...data,
        background: {
          kind: "image",
          imageUrl: data.background?.imageUrl ?? "",
          imageUrlDark: url,
          blur: data.background?.blur ?? 0,
          dim: data.background?.dim ?? 0,
          extractPalette: data.background?.extractPalette ?? false,
          parallaxEnabled: data.background?.parallaxEnabled ?? true,
        },
      });
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setWallpaperDarkUploading(false);
      e.target.value = "";
    }
  };

  const onWallpaperRemove = () => {
    if (!data) return;
    const hasDark = !!data.background?.imageUrlDark;
    setData({
      ...data,
      background: {
        kind: hasDark ? "image" : "none",
        imageUrl: "",
        imageUrlDark: data.background?.imageUrlDark ?? "",
        blur: data.background?.blur ?? 0,
        dim: data.background?.dim ?? 0,
        extractPalette: false,
        parallaxEnabled: data.background?.parallaxEnabled ?? true,
      },
    });
  };

  const onWallpaperDarkRemove = () => {
    if (!data) return;
    const hasLight = !!data.background?.imageUrl;
    setData({
      ...data,
      background: {
        kind: hasLight ? "image" : "none",
        imageUrl: data.background?.imageUrl ?? "",
        imageUrlDark: "",
        blur: data.background?.blur ?? 0,
        dim: data.background?.dim ?? 0,
        extractPalette: false,
        parallaxEnabled: data.background?.parallaxEnabled ?? true,
      },
    });
  };

  React.useEffect(() => {
    let cancelled = false;
    apiGet<ThemeSpec>("/api/admin/settings/theme")
      .then((cfg) => {
        if (!cancelled) setData(cfg);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "加载默认主题失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!data) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const res = await apiPut<ThemeSpec>("/api/admin/settings/theme", data);
      setData(res);
      setOk("默认外观主题已成功更新");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Skel rows={3} />;

  return (
    <div className="rounded-[16px] glass-tile p-6">
      <h2
        className="text-[14px] font-semibold tracking-tight mb-1 flex items-center gap-2"
        style={{ color: "var(--ink-primary)" }}
      >
        默认外观主题
      </h2>
      <p
        className="text-[12.5px] mb-4"
        style={{ color: "var(--ink-secondary)" }}
      >
        配置新注册用户及访客界面默认继承的外观主题预设参数。
      </p>

      <div className="grid grid-cols-2 gap-4 select-none">
        {/* 默认配色模式 */}
        <Field label="默认配色模式">
          <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)] mt-1">
            {(
              [
                { id: "light", label: "浅色" },
                { id: "dark", label: "深色" },
                { id: "system", label: "跟随系统" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setData({ ...data, mode: opt.id })}
                className="flex-1 py-1.5 px-1.5 text-[11px] sm:text-[12px] rounded-full font-medium transition-all cursor-pointer whitespace-nowrap"
                style={{
                  background:
                    data.mode === opt.id
                      ? "var(--glass-bg-strong)"
                      : "transparent",
                  color:
                    data.mode === opt.id
                      ? "var(--ink-primary)"
                      : "var(--ink-secondary)",
                  boxShadow:
                    data.mode === opt.id
                      ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                      : "none",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 默认窗口圆角 */}
        <Field label="默认窗口圆角">
          <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)] mt-1">
            {(
              [
                { id: "compact", label: "紧凑" },
                { id: "normal", label: "标准" },
                { id: "soft", label: "柔和" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setData({ ...data, radius: opt.id })}
                className="flex-1 py-1.5 px-1.5 text-[11px] sm:text-[12px] rounded-full font-medium transition-all cursor-pointer whitespace-nowrap"
                style={{
                  background:
                    data.radius === opt.id
                      ? "var(--glass-bg-strong)"
                      : "transparent",
                  color:
                    data.radius === opt.id
                      ? "var(--ink-primary)"
                      : "var(--ink-secondary)",
                  boxShadow:
                    data.radius === opt.id
                      ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                      : "none",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 默认字体大小 */}
        <Field label="默认字体大小">
          <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)] mt-1">
            {(
              [
                { id: "sm", label: "小" },
                { id: "md", label: "中" },
                { id: "lg", label: "大" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setData({ ...data, fontScale: opt.id })}
                className="flex-1 py-1.5 px-1.5 text-[11px] sm:text-[12px] rounded-full font-medium transition-all cursor-pointer whitespace-nowrap"
                style={{
                  background:
                    data.fontScale === opt.id
                      ? "var(--glass-bg-strong)"
                      : "transparent",
                  color:
                    data.fontScale === opt.id
                      ? "var(--ink-primary)"
                      : "var(--ink-secondary)",
                  boxShadow:
                    data.fontScale === opt.id
                      ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                      : "none",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 默认动效强度 */}
        <Field label="默认动效强度">
          <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)] mt-1">
            {(
              [
                { id: "none", label: "无动效" },
                { id: "reduced", label: "减弱" },
                { id: "full", label: "完整" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setData({ ...data, motion: opt.id })}
                className="flex-1 py-1.5 px-1.5 text-[11px] sm:text-[12px] rounded-full font-medium transition-all cursor-pointer whitespace-nowrap"
                style={{
                  background:
                    data.motion === opt.id
                      ? "var(--glass-bg-strong)"
                      : "transparent",
                  color:
                    data.motion === opt.id
                      ? "var(--ink-primary)"
                      : "var(--ink-secondary)",
                  boxShadow:
                    data.motion === opt.id
                      ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                      : "none",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {/* 默认自定义背景壁纸 */}
      <div className="pt-4 mt-4 border-t border-[var(--divider)] space-y-4">
        <h3
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-secondary)" }}
        >
          默认自定义壁纸与背景
        </h3>

        <div className="grid grid-cols-2 gap-6 select-none">
          {/* 浅色模式壁纸 */}
          <div className="space-y-2">
            <div
              className="text-[11px] font-medium"
              style={{ color: "var(--ink-secondary)" }}
            >
              浅色模式默认壁纸
            </div>
            <div className="flex items-center gap-3">
              {data.background?.kind === "image" &&
              data.background?.imageUrl ? (
                <div className="relative w-20 h-12 rounded-lg overflow-hidden border border-[var(--divider)] flex-shrink-0 bg-slate-500/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.background.imageUrl}
                    alt="浅色壁纸"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-12 rounded-lg border border-dashed border-[var(--divider)] flex items-center justify-center flex-shrink-0 bg-slate-500/5">
                  <ImageIcon size={16} className="text-[var(--ink-tertiary)]" />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <label className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)]">
                    <Upload size={11} />{" "}
                    {wallpaperUploading ? "上传中…" : "上传"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onWallpaperPick}
                      disabled={wallpaperUploading}
                    />
                  </label>
                  {data.background?.kind === "image" &&
                    data.background?.imageUrl && (
                      <button
                        type="button"
                        onClick={onWallpaperRemove}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-rose-500/10 hover:text-rose-500 text-[var(--ink-secondary)]"
                      >
                        <X size={11} /> 清除
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>

          {/* 深色模式壁纸 */}
          <div className="space-y-2">
            <div
              className="text-[11px] font-medium"
              style={{ color: "var(--ink-secondary)" }}
            >
              深色模式默认壁纸
            </div>
            <div className="flex items-center gap-3">
              {data.background?.kind === "image" &&
              data.background?.imageUrlDark ? (
                <div className="relative w-20 h-12 rounded-lg overflow-hidden border border-[var(--divider)] flex-shrink-0 bg-slate-500/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.background.imageUrlDark}
                    alt="深色壁纸"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-12 rounded-lg border border-dashed border-[var(--divider)] flex items-center justify-center flex-shrink-0 bg-slate-500/5">
                  <ImageIcon size={16} className="text-[var(--ink-tertiary)]" />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <label className="cursor-pointer inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)]">
                    <Upload size={11} />{" "}
                    {wallpaperDarkUploading ? "上传中…" : "上传"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onWallpaperDarkPick}
                      disabled={wallpaperDarkUploading}
                    />
                  </label>
                  {data.background?.kind === "image" &&
                    data.background?.imageUrlDark && (
                      <button
                        type="button"
                        onClick={onWallpaperDarkRemove}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-rose-500/10 hover:text-rose-500 text-[var(--ink-secondary)]"
                      >
                        <X size={11} /> 清除
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* 默认壁纸模糊 */}
          <div className="flex flex-col gap-1.5 select-none">
            <div className="flex items-center justify-between">
              <span
                className="text-[12px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                默认壁纸模糊
              </span>
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--sky-600)" }}
              >
                {data.background?.blur ?? 0}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-[10px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                0px
              </span>
              <Slider
                value={[data.background?.blur ?? 0]}
                min={0}
                max={32}
                step={1}
                onValueChange={([val]) => {
                  setData({
                    ...data,
                    background: {
                      ...(data.background || {
                        kind: "none",
                        imageUrl: "",
                        imageUrlDark: "",
                        blur: 0,
                        dim: 0,
                        extractPalette: false,
                        parallaxEnabled: true,
                      }),
                      blur: val,
                    },
                  });
                }}
                className="flex-1"
              />
              <span
                className="text-[10px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                32px
              </span>
            </div>
          </div>

          {/* 默认亮度遮罩 */}
          <div className="flex flex-col gap-1.5 select-none">
            <div className="flex items-center justify-between">
              <span
                className="text-[12px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                默认亮度遮罩（暗度）
              </span>
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--sky-600)" }}
              >
                {Math.round((data.background?.dim ?? 0) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-[10px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                0%
              </span>
              <Slider
                value={[data.background?.dim ?? 0]}
                min={0.0}
                max={0.9}
                step={0.05}
                onValueChange={([val]) => {
                  setData({
                    ...data,
                    background: {
                      ...(data.background || {
                        kind: "none",
                        imageUrl: "",
                        imageUrlDark: "",
                        blur: 0,
                        dim: 0,
                        extractPalette: false,
                        parallaxEnabled: true,
                      }),
                      dim: val,
                    },
                  });
                }}
                className="flex-1"
              />
              <span
                className="text-[10px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                90%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-end gap-2 mt-5 pt-4"
        style={{ borderTop: "1px solid var(--divider)" }}
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => window.open("/error-preview", "_blank")}
          className="mr-auto text-[12.5px] font-medium"
        >
          预览系统错误页面
        </Button>
        <Button onClick={save} disabled={busy} className="gap-1.5">
          <Save size={14} /> {busy ? "保存中…" : "保存外观默认设置"}
        </Button>
      </div>

      {err && <Banner kind="error">{err}</Banner>}
      {ok && <Banner kind="ok">{ok}</Banner>}
    </div>
  );
}

// ── 共享组件 ────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--ink-tertiary)" }}
        >
          {label}
        </label>
        {hint && (
          <span
            className="text-[10px]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "error" | "ok";
  children: React.ReactNode;
}) {
  const isError = kind === "error";
  return (
    <div
      className="mt-3 text-[12.5px] px-3 py-2 rounded-md flex items-center gap-2 border select-none"
      style={{
        background: isError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
        borderColor: isError ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.18)",
        color: isError ? "var(--color-danger)" : "var(--color-success)",
      }}
    >
      {isError ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
      {children}
    </div>
  );
}

function Skel({ rows }: { rows: number }) {
  return (
    <div className="rounded-[16px] glass-tile p-6 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-lg animate-pulse"
          style={{ background: "var(--hover-bg)" }}
        />
      ))}
    </div>
  );
}
