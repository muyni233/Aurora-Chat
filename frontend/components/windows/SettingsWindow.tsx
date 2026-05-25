"use client";

/**
 * SettingsWindow —— 多标签页系统偏好设置。
 *
 * 标签页（左侧导航栏）：
 *   - 账号  → 个人资料（用户名 / 邮箱 / 密码 / 头像）
 *   - 外观  → 浅色 / 深色 / 跟随系统
 *   - 关于  → 版本信息、品牌信息
 *
 * 替代了旧的独立的个人资料/外观/关于窗口。
 */

import * as React from "react";
import type { OsWindow } from "@/stores/windows";
import { useWindowStore } from "@/stores/windows";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { apiPut, apiUploadFiles, API_BASE } from "@/lib/api";
import { irisPalette, toneForKey } from "@/components/theme/tokens";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ImageCropperModal } from "@/components/ui/ImageCropperModal";
import {
  User2,
  Palette,
  Info,
  Sun,
  Moon,
  MonitorSmartphone,
  Check,
  Lock,
  Mail,
  Camera,
  AlertCircle,
  Upload,
  RefreshCw,
  Image as ImageIcon,
  Github,
  X,
} from "lucide-react";

type Tab = "account" | "appearance" | "about";

interface SettingsWindowProps {
  win: OsWindow;
}

export function SettingsWindow({ win }: SettingsWindowProps) {
  const tab = (win.props.initialTab ?? "account") as Tab;
  const open = useWindowStore((s) => s.open);
  const setTab = (t: Tab) =>
    open("settings", { id: "settings", props: { initialTab: t } });

  return (
    <div className="h-full flex min-h-0">
      <aside
        className="w-[180px] flex-shrink-0 flex flex-col gap-0.5 py-3 px-2"
        style={{
          borderRight: "1px solid var(--divider)",
          background: "rgba(255,255,255,0.10)",
        }}
      >
        <NavItem
          icon={<User2 size={14} />}
          active={tab === "account"}
          onClick={() => setTab("account")}
        >
          账号
        </NavItem>
        <NavItem
          icon={<Palette size={14} />}
          active={tab === "appearance"}
          onClick={() => setTab("appearance")}
        >
          外观
        </NavItem>
        <NavItem
          icon={<Info size={14} />}
          active={tab === "about"}
          onClick={() => setTab("about")}
        >
          关于
        </NavItem>
      </aside>
      <section className="flex-1 min-w-0 overflow-y-auto">
        <div style={{ display: tab === "account" ? "block" : "none" }}>
          <AccountPane />
        </div>
        <div style={{ display: tab === "appearance" ? "block" : "none" }}>
          <AppearancePane />
        </div>
        <div style={{ display: tab === "about" ? "block" : "none" }}>
          <AboutPane />
        </div>
      </section>
    </div>
  );
}

function NavItem({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors text-left"
      style={{
        background: active ? "rgba(14,165,233,0.14)" : "transparent",
        color: active ? "var(--sky-700)" : "var(--ink-secondary)",
        fontWeight: active ? 600 : 500,
      }}
    >
      <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
      {children}
    </button>
  );
}

// ── 账号 ─────────────────────────────────────────────────────

function AccountPane() {
  const { user } = useAuth();
  if (!user) {
    return (
      <div className="p-8 text-center" style={{ color: "var(--ink-tertiary)" }}>
        未登录
      </div>
    );
  }
  // 使用 user.id 作为 key，以便切换账号（如退出再登录）时重置本地状态。
  return <AccountForm key={user.id} />;
}

function AccountForm() {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = React.useState(user?.username ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  // 密码修改
  const [pwOld, setPwOld] = React.useState("");
  const [pwNew, setPwNew] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwOk, setPwOk] = React.useState<string | null>(null);

  const saveProfile = async () => {
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await apiPut("/api/auth/me", { username });
      await refreshUser();
      setOk("已保存");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (!pwOld || !pwNew) return;
    if (pwNew.length < 8) {
      setPwError("新密码至少 8 位");
      return;
    }
    setPwBusy(true);
    setPwError(null);
    setPwOk(null);
    try {
      await apiPut("/api/auth/me", {
        current_password: pwOld,
        new_password: pwNew,
      });
      setPwOk("密码已更新");
      setPwOld("");
      setPwNew("");
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : "修改失败");
    } finally {
      setPwBusy(false);
    }
  };

  const [cropperOpen, setCropperOpen] = React.useState(false);
  const [cropperSrc, setCropperSrc] = React.useState("");

  const onAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const f = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setCropperSrc(reader.result as string);
      setCropperOpen(true);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const onAvatarCropConfirm = async (croppedFile: File) => {
    setCropperOpen(false);
    setBusy(true);
    setError(null);
    try {
      const [att] = await apiUploadFiles([croppedFile]);
      const url = att.url;
      await apiPut("/api/auth/me", { avatar_url: url });
      await refreshUser();
      setOk("头像已更新");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const onAvatarRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPut("/api/auth/me", { avatar_url: "" });
      await refreshUser();
      setOk("头像已删除");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center" style={{ color: "var(--ink-tertiary)" }}>
        未登录
      </div>
    );
  }

  const tone = toneForKey(user.id);
  const [c1, c2] = irisPalette[tone];

  return (
    <div className="p-8 max-w-[560px]">
      <h2
        className="font-serif-italic text-[28px] mb-1"
        style={{ color: "var(--ink-primary)" }}
      >
        账号
      </h2>
      <p className="text-[13px] mb-6" style={{ color: "var(--ink-secondary)" }}>
        修改你在 Aurora Chat 的身份与凭证。
      </p>

      <Section title="资料">
        <div className="flex items-center gap-5">
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <label
              className="relative w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white font-bold text-[28px] cursor-pointer group/avatar"
              style={{
                background: user.avatar_url
                  ? `url(${user.avatar_url}) center/cover`
                  : `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.32), 0 6px 14px rgba(30,60,120,0.18)",
              }}
            >
              {!user.avatar_url && user.username.charAt(0).toUpperCase()}
              <span
                className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.5)" }}
              >
                <Camera size={20} className="text-white" />
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarPick}
              />
            </label>
            <div className="flex items-center gap-1.5 text-[11px] font-medium select-none">
              <label className="cursor-pointer text-[var(--sky-600)] hover:underline">
                更换
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatarPick}
                />
              </label>
              {user.avatar_url && (
                <>
                  <span className="text-[var(--ink-tertiary)]">•</span>
                  <button
                    type="button"
                    onClick={onAvatarRemove}
                    className="text-rose-500 hover:underline"
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <label
              className="text-[11.5px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--ink-tertiary)" }}
            >
              用户名
            </label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div
            className="inline-flex items-center gap-1.5 text-[12.5px]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            <Mail size={12} /> {user.email}
          </div>
          <Button
            size="sm"
            onClick={saveProfile}
            disabled={busy || username === user.username || !username.trim()}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </div>
        {error && <Banner kind="error">{error}</Banner>}
        {ok && <Banner kind="ok">{ok}</Banner>}
      </Section>

      <Section title="密码">
        <Input
          type="password"
          placeholder="当前密码"
          value={pwOld}
          onChange={(e) => setPwOld(e.target.value)}
          iconLeft={<Lock size={15} />}
        />
        <Input
          type="password"
          placeholder="新密码（至少 8 位）"
          value={pwNew}
          onChange={(e) => setPwNew(e.target.value)}
          iconLeft={<Lock size={15} />}
          className="mt-2"
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={changePassword}
            disabled={pwBusy || !pwOld || !pwNew}
          >
            {pwBusy ? "更新中…" : "更新密码"}
          </Button>
        </div>
        {pwError && <Banner kind="error">{pwError}</Banner>}
        {pwOk && <Banner kind="ok">{pwOk}</Banner>}
      </Section>

      <ImageCropperModal
        isOpen={cropperOpen}
        imageSrc={cropperSrc}
        circular
        onCrop={onAvatarCropConfirm}
        onCancel={() => setCropperOpen(false)}
        title="裁剪头像"
      />
    </div>
  );
}

// ── 外观 ──────────────────────────────────────────────────

const APPEARANCE_OPTIONS = [
  { id: "light", label: "浅色", desc: "晨雾", icon: Sun },
  { id: "dark", label: "深色", desc: "夜空", icon: Moon },
  {
    id: "system",
    label: "跟随系统",
    desc: "自动匹配",
    icon: MonitorSmartphone,
  },
] as const;

function AppearancePane() {
  const { spec, effectiveMode, patchSpec } = useTheme();
  const [wallpaperUploading, setWallpaperUploading] = React.useState(false);
  const [wallpaperDarkUploading, setWallpaperDarkUploading] =
    React.useState(false);

  const onWallpaperPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const f = e.target.files[0];
    setWallpaperUploading(true);
    try {
      const [att] = await apiUploadFiles([f]);
      const url = att.url;
      await patchSpec({
        background: {
          kind: "image",
          imageUrl: url,
          imageUrlDark: spec.background?.imageUrlDark ?? "",
          blur: spec.background?.blur ?? 0,
          dim: spec.background?.dim ?? 0,
          extractPalette: spec.background?.extractPalette ?? false,
          parallaxEnabled: spec.background?.parallaxEnabled ?? true,
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
    if (!e.target.files?.length) return;
    const f = e.target.files[0];
    setWallpaperDarkUploading(true);
    try {
      const [att] = await apiUploadFiles([f]);
      const url = att.url;
      await patchSpec({
        background: {
          kind: "image",
          imageUrl: spec.background?.imageUrl ?? "",
          imageUrlDark: url,
          blur: spec.background?.blur ?? 0,
          dim: spec.background?.dim ?? 0,
          extractPalette: spec.background?.extractPalette ?? false,
          parallaxEnabled: spec.background?.parallaxEnabled ?? true,
        },
      });
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setWallpaperDarkUploading(false);
      e.target.value = "";
    }
  };

  const onWallpaperRemove = async () => {
    const hasDark = !!spec.background?.imageUrlDark;
    await patchSpec({
      background: {
        kind: hasDark ? "image" : "none",
        imageUrl: "",
        imageUrlDark: spec.background?.imageUrlDark ?? "",
        blur: spec.background?.blur ?? 0,
        dim: spec.background?.dim ?? 0,
        extractPalette: false,
        parallaxEnabled: spec.background?.parallaxEnabled ?? true,
      },
    });
  };

  const onWallpaperDarkRemove = async () => {
    const hasLight = !!spec.background?.imageUrl;
    await patchSpec({
      background: {
        kind: hasLight ? "image" : "none",
        imageUrl: spec.background?.imageUrl ?? "",
        imageUrlDark: "",
        blur: spec.background?.blur ?? 0,
        dim: spec.background?.dim ?? 0,
        extractPalette: false,
        parallaxEnabled: spec.background?.parallaxEnabled ?? true,
      },
    });
  };

  const toggleParallax = async (checked: boolean) => {
    await patchSpec({
      background: {
        kind: spec.background?.kind ?? "none",
        imageUrl: spec.background?.imageUrl ?? "",
        imageUrlDark: spec.background?.imageUrlDark ?? "",
        blur: spec.background?.blur ?? 0,
        dim: spec.background?.dim ?? 0,
        extractPalette: spec.background?.extractPalette ?? false,
        parallaxEnabled: checked,
      },
    });
  };

  return (
    <div className="p-8 max-w-[560px] space-y-6">
      <div>
        <h2
          className="font-serif-italic text-[28px] mb-1"
          style={{ color: "var(--ink-primary)" }}
        >
          外观
        </h2>
        <p
          className="text-[13px] mb-6"
          style={{ color: "var(--ink-secondary)" }}
        >
          Aether OS 当前显示为「
          <strong style={{ color: "var(--ink-primary)" }}>
            {effectiveMode === "dark" ? "深色" : "浅色"}
          </strong>
          」。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {APPEARANCE_OPTIONS.map((opt) => {
          const active = spec.mode === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() => patchSpec({ mode: opt.id })}
              className="rounded-[16px] glass-tile p-4 flex flex-col items-start gap-2 text-left cursor-pointer relative transition-transform hover:-translate-y-0.5"
              style={{
                boxShadow: active
                  ? "0 0 0 2px var(--sky-500), 0 8px 24px rgba(14,165,233,0.18)"
                  : undefined,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background:
                    opt.id === "dark"
                      ? "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)"
                      : opt.id === "light"
                        ? "linear-gradient(135deg, #BAE6FD 0%, #38BDF8 100%)"
                        : "linear-gradient(135deg, #94A3B8 0%, #475569 100%)",
                  color: "white",
                }}
              >
                <Icon size={16} strokeWidth={1.8} />
              </div>
              <div
                className="text-[14px] font-medium tracking-tight"
                style={{ color: "var(--ink-primary)" }}
              >
                {opt.label}
              </div>
              <div
                className="text-[11.5px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                {opt.desc}
              </div>
              {active && (
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--sky-500)" }}
                >
                  <Check size={12} strokeWidth={3} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Section title="自定义壁纸">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            {/* 浅色模式壁纸 */}
            <div className="space-y-2 min-w-[240px] flex-1">
              <div
                className="text-[12px] font-medium"
                style={{ color: "var(--ink-secondary)" }}
              >
                浅色模式壁纸
              </div>
              <div className="flex items-center gap-3">
                {spec.background?.kind === "image" &&
                spec.background?.imageUrl ? (
                  <div className="relative w-24 h-14 rounded-lg overflow-hidden border border-[var(--divider)] flex-shrink-0 bg-slate-500/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={spec.background.imageUrl}
                      alt="自定义浅色壁纸"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-24 h-14 rounded-lg border border-dashed border-[var(--divider)] flex items-center justify-center flex-shrink-0 bg-slate-500/5">
                    <ImageIcon
                      size={18}
                      className="text-[var(--ink-tertiary)]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)]">
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
                    {spec.background?.kind === "image" &&
                      spec.background?.imageUrl && (
                        <button
                          type="button"
                          onClick={onWallpaperRemove}
                          className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-rose-500/10 hover:text-rose-500 text-[var(--ink-secondary)]"
                        >
                          <X size={11} /> 清除
                        </button>
                      )}
                  </div>
                </div>
              </div>
            </div>

            {/* 深色模式壁纸 */}
            <div className="space-y-2 min-w-[240px] flex-1">
              <div
                className="text-[12px] font-medium"
                style={{ color: "var(--ink-secondary)" }}
              >
                深色模式壁纸
              </div>
              <div className="flex items-center gap-3">
                {spec.background?.kind === "image" &&
                spec.background?.imageUrlDark ? (
                  <div className="relative w-24 h-14 rounded-lg overflow-hidden border border-[var(--divider)] flex-shrink-0 bg-slate-500/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={spec.background.imageUrlDark}
                      alt="自定义深色壁纸"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-24 h-14 rounded-lg border border-dashed border-[var(--divider)] flex items-center justify-center flex-shrink-0 bg-slate-500/5">
                    <ImageIcon
                      size={18}
                      className="text-[var(--ink-tertiary)]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)]">
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
                    {spec.background?.kind === "image" &&
                      spec.background?.imageUrlDark && (
                        <button
                          type="button"
                          onClick={onWallpaperDarkRemove}
                          className="inline-flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-rose-500/10 hover:text-rose-500 text-[var(--ink-secondary)]"
                        >
                          <X size={11} /> 清除
                        </button>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            className="text-[11px] mt-3"
            style={{ color: "var(--ink-tertiary)" }}
          >
            分别配置浅色和深色主题下的自定义背景。若未指定深色壁纸，将默认回退为浅色壁纸。
          </div>

          {/* 壁纸模糊滑块 */}
          <div className="flex flex-col gap-2 pt-3 border-t border-[var(--divider)] select-none">
            <div className="flex items-center justify-between">
              <span
                className="text-[13px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                壁纸模糊
              </span>
              <span
                className="text-[11.5px] font-medium"
                style={{ color: "var(--sky-600)" }}
              >
                {spec.background?.blur ?? 0}px
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                0px
              </span>
              <Slider
                value={[spec.background?.blur ?? 0]}
                min={0}
                max={32}
                step={1}
                onValueChange={async ([val]) => {
                  await patchSpec({
                    background: {
                      ...(spec.background || {
                        kind: "none",
                        imageUrl: "",
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
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                32px
              </span>
            </div>
          </div>

          {/* 壁纸暗度滑块 */}
          <div className="flex flex-col gap-2 pt-3 border-t border-[var(--divider)] select-none">
            <div className="flex items-center justify-between">
              <span
                className="text-[13px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                亮度遮罩 (暗度)
              </span>
              <span
                className="text-[11.5px] font-medium"
                style={{ color: "var(--sky-600)" }}
              >
                {Math.round((spec.background?.dim ?? 0) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                0%
              </span>
              <Slider
                value={[spec.background?.dim ?? 0]}
                min={0.0}
                max={0.9}
                step={0.05}
                onValueChange={async ([val]) => {
                  await patchSpec({
                    background: {
                      ...(spec.background || {
                        kind: "none",
                        imageUrl: "",
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
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                90%
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[var(--divider)]">
            <div>
              <div
                className="text-[13px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                鼠标跟随 3D 视差效果
              </div>
              <div
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                开启后，背景壁纸会随鼠标指针方向产生细微的 3D 浮动视差
              </div>
            </div>
            <Switch
              checked={spec.background?.parallaxEnabled !== false}
              onCheckedChange={toggleParallax}
            />
          </div>
        </div>
      </Section>

      <Section title="布局与交互">
        <div className="space-y-4.5 select-none">
          {/* 圆角选项 */}
          <div className="flex items-center justify-between">
            <div>
              <div
                className="text-[13px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                窗口圆角
              </div>
              <div
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                调整应用窗口和卡片的弧度
              </div>
            </div>
            <div className="w-[215px]">
              <SegmentedControl
                options={
                  [
                    { id: "compact", label: "紧凑" },
                    { id: "normal", label: "标准" },
                    { id: "soft", label: "柔和" },
                  ] as const
                }
                value={spec.radius || "normal"}
                onChange={async (val) => {
                  await patchSpec({ radius: val });
                }}
              />
            </div>
          </div>

          {/* 字体大小选项 */}
          <div className="flex items-center justify-between pt-3.5 border-t border-[var(--divider)]">
            <div>
              <div
                className="text-[13px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                系统字体大小
              </div>
              <div
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                缩放系统界面文本和组件大小
              </div>
            </div>
            <div className="w-[215px]">
              <SegmentedControl
                options={
                  [
                    { id: "sm", label: "小" },
                    { id: "md", label: "中" },
                    { id: "lg", label: "大" },
                  ] as const
                }
                value={spec.fontScale || "md"}
                onChange={async (val) => {
                  await patchSpec({ fontScale: val });
                }}
              />
            </div>
          </div>

          {/* 动效选项 */}
          <div className="flex items-center justify-between pt-3.5 border-t border-[var(--divider)]">
            <div>
              <div
                className="text-[13px] font-semibold"
                style={{ color: "var(--ink-primary)" }}
              >
                系统动效强度
              </div>
              <div
                className="text-[11px]"
                style={{ color: "var(--ink-tertiary)" }}
              >
                自定义系统窗口动画的缓入缓出与响应速度
              </div>
            </div>
            <div className="w-[215px]">
              <SegmentedControl
                options={
                  [
                    { id: "none", label: "无动效" },
                    { id: "reduced", label: "减弱" },
                    { id: "full", label: "完整" },
                  ] as const
                }
                value={spec.motion || "full"}
                onChange={async (val) => {
                  await patchSpec({ motion: val });
                }}
              />
            </div>
          </div>
        </div>
      </Section>

      <p
        className="text-[11.5px] leading-relaxed"
        style={{ color: "var(--ink-tertiary)" }}
      >
        Aether OS 的玻璃质感在浅色下呈天空蓝调，在深色下转为靛海冷。
      </p>
    </div>
  );
}

// ── 关于 ───────────────────────────────────────────────────────

function AboutPane() {
  const { branding } = useTheme();
  return (
    <div className="p-8 flex flex-col items-center text-center max-w-[560px] mx-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={branding.logoUrl || "/logo.png"}
        alt="Logo"
        className="w-24 h-24 rounded-3xl object-contain p-2 mb-4"
        style={{
          background: "var(--logo-mask-bg)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.15), 0 12px 28px rgba(14,165,233,0.18)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid var(--logo-mask-border)",
        }}
        onError={(e) => {
          e.currentTarget.src = "/logo.png";
        }}
      />
      <div
        className="font-serif-italic text-[28px] leading-none"
        style={{ color: "var(--ink-primary)" }}
      >
        {branding.appName || "Aurora Chat"}
      </div>
      <div
        className="text-[12.5px] mt-1.5"
        style={{ color: "var(--ink-secondary)" }}
      >
        {branding.appTagline || "Intelligent conversations, in glass."}
      </div>
      <div
        className="text-[11px] mt-4 tracking-wider uppercase"
        style={{ color: "var(--ink-tertiary)" }}
      >
        v0.3 · Aether OS
      </div>
      <div
        className="mt-6 text-[12px] leading-relaxed max-w-[420px]"
        style={{ color: "var(--ink-secondary)" }}
      >
        基于 Next.js + FastAPI + LiteLLM 构建的 AI 对话平台。
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/about-mascot.png"
        alt="关于吉祥物"
        className="w-28 h-28 object-contain mt-5 select-none pointer-events-none filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.05)]"
      />
      <a
        href="https://github.com/muyni233/Aurora-Chat"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200"
        style={{
          background: "var(--hover-bg)",
          border: "1px solid var(--divider)",
          color: "var(--ink-primary)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--hover-bg-strong)";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--hover-bg)";
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.02)";
        }}
      >
        <Github size={14} className="opacity-80" />
        <span>muyni233/Aurora-Chat</span>
      </a>
      <div
        className="mt-5 text-[11px]"
        style={{ color: "var(--ink-tertiary)" }}
      >
        该网站的源代码已使用 MIT 许可证开放
      </div>
    </div>
  );
}

// ── 共享组件 ──────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div
        className="text-[11.5px] uppercase tracking-wider font-semibold mb-3"
        style={{ color: "var(--ink-tertiary)" }}
      >
        {title}
      </div>
      <div className="rounded-[16px] glass-tile p-5">{children}</div>
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
      className="mt-3 text-[12.5px] px-3 py-2 rounded-md flex items-center gap-2"
      style={{
        background: isError ? "rgba(239,68,68,0.10)" : "rgba(34,197,94,0.10)",
        color: isError ? "var(--color-danger)" : "var(--color-success)",
      }}
    >
      {isError ? <AlertCircle size={13} /> : <Check size={13} />}
      {children}
    </div>
  );
}

interface SegmentOption<T> {
  id: T;
  label: string;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
}) {
  return (
    <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)]">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className="flex-1 py-1 px-1 text-[11.5px] sm:text-[12.5px] rounded-full font-medium transition-all duration-200 cursor-pointer select-none whitespace-nowrap"
            style={{
              background: active ? "var(--glass-bg-strong)" : "transparent",
              color: active ? "var(--ink-primary)" : "var(--ink-secondary)",
              boxShadow: active
                ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
