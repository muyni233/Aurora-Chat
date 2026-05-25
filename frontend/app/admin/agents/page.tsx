"use client";

/**
 * 管理后台智能体 — 列表 + 创建 + 编辑 + 删除 + 头像上传。
 *
 * 后端接口：
 *   GET    /api/agents                 列表
 *   POST   /api/agents                 创建
 *   PUT    /api/agents/{id}            更新
 *   DELETE /api/agents/{id}            删除
 *   POST   /api/agents/{id}/avatar     上传头像
 *   GET    /api/models                 模型列表（用于 model_ids 选择器）
 */

import * as React from "react";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  apiFetch,
  API_BASE,
} from "@/lib/api";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Bot,
  Image as ImageIcon,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { irisPalette, toneForKey } from "@/components/theme/tokens";
import { ImageCropperModal } from "@/components/ui/ImageCropperModal";

interface AdminAgent {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  system_prompt: string;
  description: string | null;
  greeting_message: string | null;
  temperature: number;
  top_p: number;
  max_tokens: number | null;
  is_active: boolean;
  model_ids: string[];
}

interface ModelOption {
  id: string;
  display_name: string;
  provider_name?: string;
}

const BLANK_AGENT: Partial<AdminAgent> = {
  name: "",
  nickname: "",
  system_prompt: "You are a helpful assistant.",
  description: "",
  greeting_message: "",
  temperature: 0.7,
  top_p: 1.0,
  max_tokens: null,
  is_active: true,
  model_ids: [],
};

export default function AdminAgentsPage() {
  const [agents, setAgents] = React.useState<AdminAgent[]>([]);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<AdminAgent | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [a, m] = await Promise.all([
        apiGet<AdminAgent[]>("/api/agents"),
        apiGet<ModelOption[]>("/api/models").catch(() => []),
      ]);
      setAgents(a);
      setModels(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [a, m] = await Promise.all([
          apiGet<AdminAgent[]>("/api/agents"),
          apiGet<ModelOption[]>("/api/models").catch(() => []),
        ]);
        if (cancelled) return;
        setAgents(a);
        setModels(m);
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

  const onDelete = async (a: AdminAgent) => {
    if (!confirm(`确定删除「${a.nickname || a.name}」？`)) return;
    try {
      await apiDelete(`/api/agents/${a.id}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="font-serif-italic text-[32px]"
            style={{ color: "var(--ink-primary)" }}
          >
            智能体
          </h1>
          <p className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            创建与管理可用的对话伙伴。
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5">
          <Plus size={15} /> 新建智能体
        </Button>
      </div>

      {error && (
        <div
          className="mb-4 px-3 py-2 rounded-md text-[12.5px] flex items-center gap-2"
          style={{
            background: "rgba(239,68,68,0.10)",
            color: "var(--color-danger)",
          }}
        >
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[160px] rounded-[16px] glass-tile animate-pulse"
            />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div
          className="rounded-[16px] glass-tile p-10 text-center"
          style={{ color: "var(--ink-tertiary)" }}
        >
          还没有智能体。点右上「新建智能体」开始。
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              onEdit={() => setEditing(a)}
              onDelete={() => onDelete(a)}
            />
          ))}
        </div>
      )}

      {(editing || creating) && (
        <AgentDialog
          agent={editing ?? null}
          models={models}
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

function AgentCard({
  agent,
  onEdit,
  onDelete,
}: {
  agent: AdminAgent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tone = toneForKey(agent.id);
  const [c1, c2] = irisPalette[tone];
  return (
    <div className="rounded-[16px] glass-tile p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-[18px] flex-shrink-0"
          style={{
            background: agent.avatar_url
              ? `url(${agent.avatar_url.startsWith("http") ? agent.avatar_url : API_BASE + agent.avatar_url}) center/cover`
              : `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 10px rgba(30,60,120,0.18)",
          }}
        >
          {!agent.avatar_url &&
            (agent.nickname || agent.name).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] font-medium tracking-tight truncate"
            style={{ color: "var(--ink-primary)" }}
          >
            {agent.nickname || agent.name}
          </div>
          {agent.nickname && agent.name !== agent.nickname && (
            <div
              className="text-[11.5px] truncate"
              style={{ color: "var(--ink-tertiary)" }}
            >
              {agent.name}
            </div>
          )}
        </div>
        {!agent.is_active && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
            style={{
              background: "rgba(239,68,68,0.10)",
              color: "var(--color-danger)",
            }}
          >
            已停用
          </span>
        )}
      </div>
      <p
        className="text-[12.5px] line-clamp-2 leading-relaxed min-h-[2.6em]"
        style={{ color: "var(--ink-secondary)" }}
      >
        {agent.description || "（无描述）"}
      </p>
      <div
        className="flex items-center gap-2 text-[11px]"
        style={{ color: "var(--ink-tertiary)" }}
      >
        <span className="inline-flex items-center gap-1">
          <Bot size={11} /> {agent.model_ids.length} 模型
        </span>
        <span>· T={agent.temperature.toFixed(2)}</span>
      </div>
      <div className="flex gap-1.5 mt-auto pt-2 border-t border-[var(--divider)]">
        <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1">
          <Pencil size={12} /> 编辑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="gap-1 ml-auto"
          style={{ color: "var(--color-danger)" }}
        >
          <Trash2 size={12} /> 删除
        </Button>
      </div>
    </div>
  );
}

function AgentDialog({
  agent,
  models,
  onClose,
  onSaved,
}: {
  agent: AdminAgent | null;
  models: ModelOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !agent;
  const [form, setForm] = React.useState<Partial<AdminAgent>>(
    agent ?? BLANK_AGENT,
  );
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const set = <K extends keyof AdminAgent>(k: K, v: AdminAgent[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleModel = (id: string) => {
    const cur = new Set(form.model_ids ?? []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    set("model_ids", Array.from(cur));
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        await apiPost("/api/agents", form);
      } else {
        await apiPut(`/api/agents/${agent!.id}`, form);
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const [cropperOpen, setCropperOpen] = React.useState(false);
  const [cropperSrc, setCropperSrc] = React.useState("");

  const uploadAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!agent || !e.target.files?.length) return;
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
    if (!agent) return;
    setCropperOpen(false);
    const fd = new FormData();
    fd.append("file", croppedFile);
    try {
      const res = await apiFetch(`/api/agents/${agent.id}/avatar`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("上传失败");
      const updated = (await res.json()) as AdminAgent;
      set("avatar_url", updated.avatar_url);
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : "上传失败");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-8"
      style={{ background: "rgba(15,30,60,0.20)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-window relative flex flex-col w-[640px] max-w-[90vw] max-h-[88vh] rounded-[18px] overflow-hidden"
        style={{ boxShadow: "var(--shadow-window)" }}
      >
        <div
          className="px-6 py-4 flex items-center"
          style={{ borderBottom: "1px solid var(--divider)" }}
        >
          <h2
            className="text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--ink-primary)" }}
          >
            {isNew ? "新建智能体" : `编辑「${form.nickname || form.name}」`}
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
          {!isNew && (
            <Field label="头像">
              <label className="inline-flex items-center gap-3 cursor-pointer">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-[18px]"
                  style={{
                    background: form.avatar_url
                      ? `url(${form.avatar_url.startsWith("http") ? form.avatar_url : API_BASE + form.avatar_url}) center/cover`
                      : "linear-gradient(135deg, #94A3B8 0%, #475569 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32)",
                  }}
                >
                  {!form.avatar_url &&
                    (form.nickname || form.name || "?").charAt(0).toUpperCase()}
                </div>
                <span
                  className="inline-flex items-center gap-1 text-[12.5px]"
                  style={{ color: "var(--sky-700)" }}
                >
                  <ImageIcon size={12} /> 上传头像
                </span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={uploadAvatar}
                />
              </label>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="名称（内部）" hint="唯一标识">
              <Input
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="atlas"
              />
            </Field>
            <Field label="昵称（显示）">
              <Input
                value={form.nickname ?? ""}
                onChange={(e) => set("nickname", e.target.value)}
                placeholder="Atlas"
              />
            </Field>
          </div>

          <Field label="描述">
            <Input
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="一句话简介，会出现在选择列表"
            />
          </Field>

          <Field label="系统提示词">
            <Textarea
              value={form.system_prompt ?? ""}
              onChange={(e) => set("system_prompt", e.target.value)}
              rows={5}
              placeholder="You are a helpful assistant."
            />
          </Field>

          <Field label="问候语">
            <Textarea
              value={form.greeting_message ?? ""}
              onChange={(e) => set("greeting_message", e.target.value)}
              rows={2}
              placeholder="对话开始时的第一句话"
            />
          </Field>

          <Field
            label={`温度 — ${(form.temperature ?? 0.7).toFixed(2)}`}
            hint="越高越发散"
          >
            <Slider
              value={[form.temperature ?? 0.7]}
              min={0}
              max={2}
              step={0.05}
              onValueChange={(v) => set("temperature", v[0])}
            />
          </Field>

          <Field label={`Top-p — ${(form.top_p ?? 1).toFixed(2)}`}>
            <Slider
              value={[form.top_p ?? 1]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={(v) => set("top_p", v[0])}
            />
          </Field>

          <Field label="启用">
            <Switch
              checked={form.is_active ?? true}
              onCheckedChange={(v) => set("is_active", v)}
            />
          </Field>

          <Field
            label="可用模型"
            hint={`${form.model_ids?.length ?? 0} / ${models.length}`}
          >
            <div className="flex flex-wrap gap-1.5 mt-1">
              {models.length === 0 ? (
                <span
                  className="text-[12.5px]"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  没有可用模型
                </span>
              ) : (
                models.map((m) => {
                  const selected = form.model_ids?.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleModel(m.id)}
                      className="text-[11.5px] px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors"
                      style={{
                        background: selected
                          ? "rgba(14,165,233,0.18)"
                          : "var(--hover-bg)",
                        color: selected
                          ? "var(--sky-700)"
                          : "var(--ink-secondary)",
                        fontWeight: selected ? 600 : 500,
                      }}
                    >
                      {selected && <Check size={10} />}
                      {m.display_name}
                    </button>
                  );
                })
              )}
            </div>
          </Field>

          {err && (
            <div
              className="text-[12.5px] px-3 py-2 rounded-md flex items-center gap-2"
              style={{
                background: "rgba(239,68,68,0.10)",
                color: "var(--color-danger)",
              }}
            >
              <AlertCircle size={13} /> {err}
            </div>
          )}
        </div>

        <div
          className="px-6 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--divider)" }}
        >
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={save}
            disabled={saving || !form.name?.trim()}
            className="gap-1.5"
          >
            <Save size={14} /> {saving ? "保存中…" : isNew ? "创建" : "保存"}
          </Button>
        </div>
      </div>

      <ImageCropperModal
        isOpen={cropperOpen}
        imageSrc={cropperSrc}
        circular
        onCrop={onAvatarCropConfirm}
        onCancel={() => setCropperOpen(false)}
        title="裁剪智能体头像"
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
