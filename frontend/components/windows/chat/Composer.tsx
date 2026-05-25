"use client";

/**
 * Composer —— ChatWindow 底部的输入栏。
 *
 * 功能：
 *  - 自动扩展高度的文本框
 *  - ⌘↵ / Ctrl↵ 提交
 *  - 点击附件按钮 → 文件选择器（图片 + 文档）
 *  - 拖放文件到输入框
 *  - 直接粘贴图片
 *  - 忙碌时显示停止生成按钮
 *  - 发送前行内附件预览标签
 */

import * as React from "react";
import { apiUploadFiles, type Attachment, API_BASE } from "@/lib/api";
import {
  Paperclip,
  Send,
  Square,
  X,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  uploading?: boolean;
  streaming?: boolean;
  placeholder?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  uploading: _uploading = false,
  streaming = false,
  placeholder,
}: ComposerProps) {
  void _uploading;
  const [pending, setPending] = React.useState<Attachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  // 文本框自动扩展高度
  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [value]);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const atts = await apiUploadFiles(files);
      setPending((prev) => [...prev, ...atts]);
    } catch {
      // 忽略 —— 可以在此处显示错误提示
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void upload(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const files = items
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length > 0) {
      e.preventDefault();
      void upload(files);
    }
  };

  const submit = () => {
    if (streaming) return;
    if (!value.trim() && pending.length === 0) return;
    onSend(value, pending);
    setPending([]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDrag(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void upload(files);
  };

  return (
    <div
      className="px-6 pb-5 pt-3 flex-shrink-0 relative"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <AnimatePresence>
        {drag && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-2 rounded-2xl flex items-center justify-center pointer-events-none z-[10]"
            style={{
              background: "rgba(56, 189, 248, 0.16)",
              border: "2px dashed var(--sky-400)",
              color: "var(--sky-700)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            松开以上传文件
          </motion.div>
        )}
      </AnimatePresence>

      {pending.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {pending.map((a, i) => (
            <PendingChip
              key={i}
              attachment={a}
              onRemove={() =>
                setPending((p) => p.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
      )}

      <div className="composer-shell flex items-end gap-2 px-2.5 pl-3 py-1.5 rounded-[18px] transition-all">
        <button
          type="button"
          title="附件"
          onClick={() => fileRef.current?.click()}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--hover-bg)] flex-shrink-0"
          style={{ color: "var(--ink-secondary)" }}
        >
          <Paperclip size={17} strokeWidth={1.7} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={onFileChange}
          accept="image/*,application/pdf,text/*"
        />
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-0 outline-0 resize-none py-2 text-[14px] leading-[1.55]"
          style={{ color: "var(--ink-primary)", maxHeight: 180 }}
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center flex-shrink-0 text-white transition-transform hover:scale-105 active:scale-95"
            style={{
              background: "var(--color-danger)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 12px rgba(239,68,68,0.45)",
            }}
            title="停止生成"
          >
            <Square size={14} fill="white" strokeWidth={0} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={uploading || (!value.trim() && pending.length === 0)}
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center flex-shrink-0 text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100"
            style={{
              background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 12px rgba(14, 165, 233, 0.45)",
            }}
            title="发送"
          >
            <Send size={15} strokeWidth={1.9} className="-mt-0.5 mr-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function PendingChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  const isImage = attachment.kind === "image";
  const url = attachment.url.startsWith("http")
    ? attachment.url
    : `${API_BASE}${attachment.url}`;
  return (
    <div
      className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md glass-tile text-[11.5px]"
      style={{ color: "var(--ink-secondary)" }}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={attachment.name}
          className="w-5 h-5 rounded object-cover"
        />
      ) : (
        <span
          className="w-5 h-5 rounded inline-flex items-center justify-center"
          style={{
            background: "rgba(14,165,233,0.12)",
            color: "var(--sky-700)",
          }}
        >
          {attachment.kind === "pdf" ? (
            <FileText size={12} />
          ) : (
            <ImageIcon size={12} />
          )}
        </span>
      )}
      <span className="max-w-[140px] truncate">{attachment.name}</span>
      <button
        onClick={onRemove}
        className="p-0.5 rounded hover:bg-[var(--hover-bg)]"
        style={{ color: "var(--ink-tertiary)" }}
      >
        <X size={11} />
      </button>
    </div>
  );
}
