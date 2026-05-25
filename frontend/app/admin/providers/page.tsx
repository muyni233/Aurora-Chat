"use client";

/**
 * 管理后台模型供应商 — 供应商与模型两个选项卡。
 *
 *   GET    /api/providers                     列表
 *   POST   /api/providers                     创建
 *   PUT    /api/providers/{id}                更新
 *   DELETE /api/providers/{id}                删除
 *   POST   /api/providers/{id}/test           测试连接
 *   GET    /api/models                        模型列表
 *   POST   /api/models                        创建模型
 *   PUT    /api/models/{id}                   更新
 *   DELETE /api/models/{id}                   删除
 */

import * as React from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Server,
  Cpu,
  AlertCircle,
  CheckCircle2,
  ZapOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Tab = "providers" | "models";

interface AdminProvider {
  id: string;
  name: string;
  provider_type: string;
  base_url: string | null;
  description: string | null;
  is_active: boolean;
  model_count: number;
}

interface AdminModel {
  id: string;
  provider_id: string;
  provider_name: string;
  model_id: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  supports_vision: boolean;
  supports_tools: boolean;
  stream_enabled: boolean;
  show_thinking: boolean;
}

const PROVIDER_TYPES = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "mistral",
  "cohere",
  "ollama",
  "custom",
];

export default function AdminProvidersPage() {
  const [tab, setTab] = React.useState<Tab>("providers");
  return (
    <div className="p-8 max-w-[1100px]">
      <div className="mb-6">
        <h1
          className="font-serif-italic text-[32px]"
          style={{ color: "var(--ink-primary)" }}
        >
          模型供应商
        </h1>
        <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
          配置上游 API 凭证并启用具体模型。
        </p>
      </div>
      <div
        className="flex gap-1 mb-5 border-b"
        style={{ borderColor: "var(--divider)" }}
      >
        <TabBtn
          active={tab === "providers"}
          onClick={() => setTab("providers")}
        >
          <Server size={13} /> 供应商
        </TabBtn>
        <TabBtn active={tab === "models"} onClick={() => setTab("models")}>
          <Cpu size={13} /> 模型
        </TabBtn>
      </div>
      {tab === "providers" ? <ProvidersPane /> : <ModelsPane />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 -mb-px text-[13px] inline-flex items-center gap-1.5 font-medium transition-colors"
      style={{
        borderBottom: active
          ? "2px solid var(--sky-500)"
          : "2px solid transparent",
        color: active ? "var(--sky-700)" : "var(--ink-secondary)",
      }}
    >
      {children}
    </button>
  );
}

// ── 供应商 ─────────────────────────────────────────────────

function ProvidersPane() {
  const [items, setItems] = React.useState<AdminProvider[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<AdminProvider | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const a = await apiGet<AdminProvider[]>("/api/providers");
        if (!cancelled) setItems(a);
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

  const load = React.useCallback(async () => {
    try {
      setItems(await apiGet<AdminProvider[]>("/api/providers"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  const onDelete = async (p: AdminProvider) => {
    if (!confirm(`删除「${p.name}」？同时移除其下所有模型`)) return;
    try {
      await apiDelete(`/api/providers/${p.id}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setCreating(true)} className="gap-1.5">
          <Plus size={14} /> 新增供应商
        </Button>
      </div>

      {error && <ErrBanner>{error}</ErrBanner>}

      {loading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <Empty hint="点击右上「新增供应商」开始配置。" />
      ) : (
        <div className="rounded-[14px] glass-tile overflow-hidden">
          <table className="w-full text-[13px]">
            <thead style={{ background: "rgba(15,30,60,0.04)" }}>
              <tr>
                <Th>名称</Th>
                <Th>类型</Th>
                <Th>Base URL</Th>
                <Th>模型数</Th>
                <Th>状态</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr
                  key={p.id}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                  }}
                >
                  <Td>
                    <span
                      className="font-medium"
                      style={{ color: "var(--ink-primary)" }}
                    >
                      {p.name}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className="text-[11px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--sky-700)" }}
                    >
                      {p.provider_type}
                    </span>
                  </Td>
                  <Td
                    className="font-mono text-[11.5px]"
                    style={{ color: "var(--ink-tertiary)" }}
                  >
                    {p.base_url ?? "—"}
                  </Td>
                  <Td>{p.model_count}</Td>
                  <Td>
                    {p.is_active ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11.5px]"
                        style={{ color: "var(--color-success)" }}
                      >
                        <CheckCircle2 size={11} /> 启用
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[11.5px]"
                        style={{ color: "var(--ink-tertiary)" }}
                      >
                        <ZapOff size={11} /> 已停
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(p)}
                      className="gap-1"
                    >
                      <Pencil size={11} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(p)}
                      className="gap-1 ml-1"
                      style={{ color: "var(--color-danger)" }}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ProviderDialog
          provider={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ProviderDialog({
  provider,
  onClose,
  onSaved,
}: {
  provider: AdminProvider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !provider;
  const [form, setForm] = React.useState({
    name: provider?.name ?? "",
    provider_type: provider?.provider_type ?? "openai",
    base_url: provider?.base_url ?? "",
    api_key: "",
    description: provider?.description ?? "",
    is_active: provider?.is_active ?? true,
  });
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) return;
    if (isNew && !form.api_key) {
      setErr("需要 API Key");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { ...form };
      // PATCH 风格更新：编辑时 api_key 为空则保持原值不变
      if (!isNew && !form.api_key) delete body.api_key;
      if (isNew) await apiPost("/api/providers", body);
      else await apiPut(`/api/providers/${provider!.id}`, body);
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    if (!provider) return;
    setTesting(true);
    setErr(null);
    setOk(null);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>(
        `/api/providers/${provider.id}/test`,
        {},
      );
      if (res.ok) setOk("连接成功");
      else setErr(res.error || "连接失败");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTesting(false);
    }
  };

  return (
    <DialogShell
      title={isNew ? "新增供应商" : `编辑「${provider!.name}」`}
      onClose={onClose}
    >
      <Field label="名称">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="My OpenAI"
        />
      </Field>
      <Field label="类型">
        <select
          value={form.provider_type}
          onChange={(e) => setForm({ ...form, provider_type: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-[14px] outline-none"
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            color: "var(--ink-primary)",
          }}
        >
          {PROVIDER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Base URL" hint="可选；代理或自部署端点">
        <Input
          value={form.base_url}
          onChange={(e) => setForm({ ...form, base_url: e.target.value })}
          placeholder="https://api.openai.com/v1"
        />
      </Field>
      <Field label="API Key" hint={isNew ? "必填" : "留空保留原值"}>
        <Input
          type="password"
          value={form.api_key}
          onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          placeholder={isNew ? "sk-…" : "••••••••"}
        />
      </Field>
      <Field label="描述">
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="启用">
        <Switch
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
        />
      </Field>

      {err && <ErrBanner>{err}</ErrBanner>}
      {ok && <OkBanner>{ok}</OkBanner>}

      <div className="flex gap-2 mt-2">
        {!isNew && (
          <Button variant="ghost" onClick={testConn} disabled={testing}>
            {testing ? "测试中…" : "测试连接"}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="gap-1.5"
          >
            <Save size={14} /> {saving ? "保存中…" : isNew ? "创建" : "保存"}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

// ── 模型 ────────────────────────────────────────────────────

function ModelsPane() {
  const [items, setItems] = React.useState<AdminModel[]>([]);
  const [providers, setProviders] = React.useState<AdminProvider[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<AdminModel | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [m, p] = await Promise.all([
          apiGet<AdminModel[]>("/api/models"),
          apiGet<AdminProvider[]>("/api/providers"),
        ]);
        if (cancelled) return;
        setItems(m);
        setProviders(p);
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

  const load = React.useCallback(async () => {
    try {
      setItems(await apiGet<AdminModel[]>("/api/models"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  const onDelete = async (m: AdminModel) => {
    if (!confirm(`删除模型「${m.display_name}」？`)) return;
    try {
      await apiDelete(`/api/models/${m.id}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button
          onClick={() => setCreating(true)}
          disabled={providers.length === 0}
          className="gap-1.5"
        >
          <Plus size={14} /> 新增模型
        </Button>
      </div>

      {error && <ErrBanner>{error}</ErrBanner>}

      {loading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <Empty
          hint={
            providers.length === 0
              ? "请先创建至少一个供应商。"
              : "点击右上「新增模型」开始。"
          }
        />
      ) : (
        <div className="rounded-[14px] glass-tile overflow-hidden">
          <table className="w-full text-[13px]">
            <thead style={{ background: "rgba(15,30,60,0.04)" }}>
              <tr>
                <Th>显示名</Th>
                <Th>Model ID</Th>
                <Th>供应商</Th>
                <Th>能力</Th>
                <Th>状态</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((m, i) => (
                <tr
                  key={m.id}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--divider)",
                  }}
                >
                  <Td>
                    <span
                      className="font-medium"
                      style={{ color: "var(--ink-primary)" }}
                    >
                      {m.display_name}
                    </span>
                  </Td>
                  <Td
                    className="font-mono text-[11.5px]"
                    style={{ color: "var(--ink-tertiary)" }}
                  >
                    {m.model_id}
                  </Td>
                  <Td>{m.provider_name}</Td>
                  <Td>
                    <span className="inline-flex gap-1">
                      {m.supports_vision && (
                        <span
                          className="text-[10px] px-1 rounded font-semibold"
                          style={{
                            background: "rgba(124,58,237,0.15)",
                            color: "#7C3AED",
                          }}
                        >
                          VIS
                        </span>
                      )}
                      {m.supports_tools && (
                        <span
                          className="text-[10px] px-1 rounded font-semibold"
                          style={{
                            background: "rgba(14,165,233,0.15)",
                            color: "var(--sky-700)",
                          }}
                        >
                          TOOL
                        </span>
                      )}
                      {m.stream_enabled && (
                        <span
                          className="text-[10px] px-1 rounded font-semibold"
                          style={{
                            background: "rgba(34,197,94,0.15)",
                            color: "var(--color-success)",
                          }}
                        >
                          STREAM
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td>
                    {m.is_active ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11.5px]"
                        style={{ color: "var(--color-success)" }}
                      >
                        <CheckCircle2 size={11} />
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[11.5px]"
                        style={{ color: "var(--ink-tertiary)" }}
                      >
                        <ZapOff size={11} />
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(m)}
                    >
                      <Pencil size={11} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(m)}
                      className="ml-1"
                      style={{ color: "var(--color-danger)" }}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ModelDialog
          model={editing}
          providers={providers}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async () => {
            setEditing(null);
            setCreating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ModelDialog({
  model,
  providers,
  onClose,
  onSaved,
}: {
  model: AdminModel | null;
  providers: AdminProvider[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !model;
  const [form, setForm] = React.useState({
    provider_id: model?.provider_id ?? providers[0]?.id ?? "",
    model_id: model?.model_id ?? "",
    display_name: model?.display_name ?? "",
    description: model?.description ?? "",
    is_active: model?.is_active ?? true,
    supports_vision: model?.supports_vision ?? false,
    supports_tools: model?.supports_tools ?? false,
    stream_enabled: model?.stream_enabled ?? true,
    show_thinking: model?.show_thinking ?? false,
  });
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async () => {
    if (!form.display_name.trim() || !form.model_id.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { ...form };
      // 更新时 provider_id 不可变
      if (!isNew) delete body.provider_id;
      if (isNew) await apiPost("/api/models", body);
      else await apiPut(`/api/models/${model!.id}`, body);
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      title={isNew ? "新增模型" : `编辑「${model!.display_name}」`}
      onClose={onClose}
    >
      {isNew && (
        <Field label="供应商">
          <select
            value={form.provider_id}
            onChange={(e) => setForm({ ...form, provider_id: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-[14px] outline-none"
            style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              color: "var(--ink-primary)",
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.provider_type})
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="显示名">
        <Input
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          placeholder="GPT-4o"
        />
      </Field>
      <Field label="Model ID" hint="LiteLLM 标识符">
        <Input
          value={form.model_id}
          onChange={(e) => setForm({ ...form, model_id: e.target.value })}
          placeholder="gpt-4o"
        />
      </Field>
      <Field label="描述">
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <Field label="启用">
        <Switch
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="视觉">
          <Switch
            checked={form.supports_vision}
            onCheckedChange={(v) => setForm({ ...form, supports_vision: v })}
          />
        </Field>
        <Field label="工具调用">
          <Switch
            checked={form.supports_tools}
            onCheckedChange={(v) => setForm({ ...form, supports_tools: v })}
          />
        </Field>
        <Field label="流式">
          <Switch
            checked={form.stream_enabled}
            onCheckedChange={(v) => setForm({ ...form, stream_enabled: v })}
          />
        </Field>
        <Field label="显示思考">
          <Switch
            checked={form.show_thinking}
            onCheckedChange={(v) => setForm({ ...form, show_thinking: v })}
          />
        </Field>
      </div>

      {err && <ErrBanner>{err}</ErrBanner>}

      <div className="flex gap-2 mt-2 justify-end">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          onClick={save}
          disabled={
            saving || !form.display_name.trim() || !form.model_id.trim()
          }
          className="gap-1.5"
        >
          <Save size={14} /> {saving ? "保存中…" : isNew ? "创建" : "保存"}
        </Button>
      </div>
    </DialogShell>
  );
}

// ── 共享组件 ────────────────────────────────────────────────

function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-8"
      style={{ background: "rgba(15,30,60,0.20)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-window relative w-[560px] max-w-[90vw] max-h-[88vh] flex flex-col rounded-[18px] overflow-hidden"
        style={{ boxShadow: "var(--shadow-window)" }}
      >
        <div
          className="px-6 py-4 flex items-center"
          style={{ borderBottom: "1px solid var(--divider)" }}
        >
          <h2
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--ink-primary)" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-md hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 relative z-[1] space-y-4">
          {children}
        </div>
      </div>
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
      <div className="flex items-baseline justify-between mb-1">
        <label
          className="text-[11.5px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--ink-tertiary)" }}
        >
          {label}
        </label>
        {hint && (
          <span
            className="text-[10.5px]"
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

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left px-3 py-2 text-[10.5px] uppercase tracking-wider font-semibold ${className}`}
      style={{ color: "var(--ink-tertiary)" }}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-3 py-2 ${className}`} style={style}>
      {children}
    </td>
  );
}
function ErrBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[12.5px] px-3 py-2 rounded-md flex items-center gap-2 mt-2"
      style={{
        background: "rgba(239,68,68,0.10)",
        color: "var(--color-danger)",
      }}
    >
      <AlertCircle size={13} /> {children}
    </div>
  );
}
function OkBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[12.5px] px-3 py-2 rounded-md flex items-center gap-2 mt-2"
      style={{
        background: "rgba(34,197,94,0.10)",
        color: "var(--color-success)",
      }}
    >
      <CheckCircle2 size={13} /> {children}
    </div>
  );
}
function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 rounded-lg glass-tile animate-pulse" />
      ))}
    </div>
  );
}
function Empty({ hint }: { hint: string }) {
  return (
    <div
      className="rounded-[16px] glass-tile p-10 text-center text-[13px]"
      style={{ color: "var(--ink-tertiary)" }}
    >
      {hint}
    </div>
  );
}
