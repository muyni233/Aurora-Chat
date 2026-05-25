"use client";

import * as React from "react";
import { Check, Copy, Terminal } from "lucide-react";

export function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);

  const language = React.useMemo(() => {
    const arr = React.Children.toArray(children);
    for (const c of arr) {
      if (React.isValidElement(c)) {
        const cls =
          (c as React.ReactElement<{ className?: string }>).props?.className ??
          "";
        const m = /language-([\w-]+)/.exec(cls);
        if (m) return m[1];
      }
    }
    return "";
  }, [children]);

  const handleCopy = async () => {
    const text = ref.current?.textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group/code relative my-5 overflow-hidden rounded-2xl border border-outline-variant bg-surface-2">
      {/* Console chrome */}
      <div className="flex h-10 items-center justify-between border-b border-outline-variant bg-surface-3/55 px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#FF5F56]" />
          <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
          <span className="h-3 w-3 rounded-full bg-[#27C93F]" />
          {language && (
            <span className="ml-3 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
              <Terminal className="h-3 w-3" />
              {language}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-1 px-2.5 py-1 text-[11px] font-bold text-ink-secondary opacity-0 shadow-sm transition-all hover:bg-surface-2 group-hover/code:opacity-100"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" />
              <span className="text-success">已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre
        ref={ref}
        className="m-0 overflow-x-auto p-4 font-mono text-xs leading-relaxed text-ink-primary"
      >
        {children}
      </pre>
    </div>
  );
}
