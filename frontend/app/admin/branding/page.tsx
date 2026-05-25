"use client";

/**
 * 管理后台品牌设置 — 应用名称、口号、Logo、Favicon、用户覆盖开关。
 *
 *   GET  /api/admin/settings/branding
 *   PUT  /api/admin/settings/branding
 *   POST /api/admin/settings/branding/logo     （multipart 上传，字段名：file）
 *   POST /api/admin/settings/branding/favicon  （multipart 上传，字段名：file）
 */

import * as React from "react";
import { apiGet, apiPut, apiFetch, API_BASE } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Save,
  Upload,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { ImageCropperModal } from "@/components/ui/ImageCropperModal";

interface Branding {
  appName: string;
  appTagline: string;
  logoUrl: string;
  faviconUrl: string;
  allowUserOverride: boolean;
}

const BLANK: Branding = {
  appName: "Aurora Chat",
  appTagline: "智能对话",
  logoUrl: "",
  faviconUrl: "",
  allowUserOverride: true,
};

export default function AdminBrandingPage() {
  const { reload: reloadTheme } = useTheme();
  const [form, setForm] = React.useState<Branding>(BLANK);
  const [original, setOriginal] = React.useState<Branding>(BLANK);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const b = await apiGet<Branding>("/api/admin/settings/branding");
        if (cancelled) return;
        setForm(b);
        setOriginal(b);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof Branding>(k: K, v: Branding[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const b = await apiPut<Branding>("/api/admin/settings/branding", form);
      setForm(b);
      setOriginal(b);
      setOk("已保存");
      await reloadTheme();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const [cropperOpen, setCropperOpen] = React.useState(false);
  const [cropperSrc, setCropperSrc] = React.useState("");

  const upload = (
    kind: "logo" | "favicon",
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];

    if (kind === "logo") {
      const reader = new FileReader();
      reader.onload = () => {
        setCropperSrc(reader.result as string);
        setCropperOpen(true);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
      return;
    }

    void executeUpload(kind, file);
    e.target.value = "";
  };

  const executeUpload = async (kind: "logo" | "favicon", file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    setError(null);
    setOk(null);
    try {
      const res = await apiFetch(`/api/admin/settings/branding/${kind}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("上传失败");
      const b = (await res.json()) as Branding;
      setForm(b);
      setOriginal(b);
      setOk(kind === "logo" ? "Logo 已上传" : "Favicon 已上传");
      await reloadTheme();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "上传失败");
    }
  };

  const onLogoCropConfirm = (croppedFile: File) => {
    setCropperOpen(false);
    void executeUpload("logo", croppedFile);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  if (loading) {
    return (
      <div className="p-8 max-w-[680px]">
        <div className="h-12 rounded-lg glass-tile animate-pulse mb-3" />
        <div className="h-12 rounded-lg glass-tile animate-pulse mb-3" />
        <div className="h-12 rounded-lg glass-tile animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[680px]">
      <div className="mb-6">
        <h1
          className="font-serif-italic text-[32px]"
          style={{ color: "var(--ink-primary)" }}
        >
          品牌
        </h1>
        <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          自定义应用名、口号、Logo 与 Favicon。
        </p>
      </div>

      <div className="rounded-[16px] glass-tile p-6 space-y-5">
        <Field label="应用名">
          <Input
            value={form.appName}
            onChange={(e) => set("appName", e.target.value)}
            placeholder="Aurora Chat"
          />
        </Field>
        <Field label="副标题">
          <Input
            value={form.appTagline}
            onChange={(e) => set("appTagline", e.target.value)}
            placeholder="智能对话"
          />
        </Field>

        <UploadField
          label="Logo"
          hint="出现在登录页与桌面左上角"
          url={form.logoUrl}
          onUpload={(e) => upload("logo", e)}
          onRestoreDefault={
            form.logoUrl !== "/logo.png"
              ? () => set("logoUrl", "/logo.png")
              : undefined
          }
        />
        <UploadField
          label="Favicon"
          hint="浏览器标签页图标"
          url={form.faviconUrl}
          onUpload={(e) => upload("favicon", e)}
          onRestoreDefault={
            form.faviconUrl !== "" ? () => set("faviconUrl", "") : undefined
          }
        />

        <Field
          label="允许用户覆盖外观"
          hint="关闭后所有用户必须使用管理员设置的主题"
        >
          <Switch
            checked={form.allowUserOverride}
            onCheckedChange={(v) => set("allowUserOverride", v)}
          />
        </Field>

        {error && (
          <div
            className="text-[12.5px] px-3 py-2 rounded-md flex items-center gap-2"
            style={{
              background: "rgba(239,68,68,0.10)",
              color: "var(--color-danger)",
            }}
          >
            <AlertCircle size={13} /> {error}
          </div>
        )}
        {ok && (
          <div
            className="text-[12.5px] px-3 py-2 rounded-md flex items-center gap-2"
            style={{
              background: "rgba(34,197,94,0.10)",
              color: "var(--color-success)",
            }}
          >
            <CheckCircle2 size={13} /> {ok}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => setForm(original)}
            disabled={!dirty}
          >
            重置
          </Button>
          <Button
            onClick={save}
            disabled={!dirty || saving}
            className="gap-1.5"
          >
            <Save size={14} /> {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <ImageCropperModal
        isOpen={cropperOpen}
        imageSrc={cropperSrc}
        aspectRatio={1.5}
        circular={false}
        onCrop={onLogoCropConfirm}
        onCancel={() => setCropperOpen(false)}
        title="裁剪 Logo"
      />
    </div>
  );
}

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
      <div className="flex items-baseline justify-between mb-1.5">
        <label
          className="text-[11.5px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--ink-tertiary)" }}
        >
          {label}
        </label>
        {hint && (
          <span
            className="text-[10.5px] max-w-[60%] text-right"
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

function UploadField({
  label,
  hint,
  url,
  onUpload,
  onRestoreDefault,
}: {
  label: string;
  hint?: string;
  url: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRestoreDefault?: () => void;
}) {
  const fullUrl = url
    ? url.startsWith("http")
      ? url
      : `${API_BASE}${url}`
    : "";
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: fullUrl
              ? `url(${fullUrl}) center/contain no-repeat`
              : "var(--hover-bg)",
            border: "1px solid var(--glass-border)",
          }}
        >
          {!fullUrl && (
            <ImageIcon size={20} style={{ color: "var(--ink-tertiary)" }} />
          )}
        </div>
        <div className="flex gap-2">
          <label
            className="cursor-pointer inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--hover-bg)",
              color: "var(--ink-secondary)",
            }}
          >
            <Upload size={12} /> 选择文件
            <input type="file" accept="image/*" hidden onChange={onUpload} />
          </label>
          {onRestoreDefault && (
            <button
              type="button"
              onClick={onRestoreDefault}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition-colors hover:text-rose-500"
              style={{
                background: "var(--hover-bg)",
                color: "var(--ink-secondary)",
              }}
            >
              恢复默认
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}
