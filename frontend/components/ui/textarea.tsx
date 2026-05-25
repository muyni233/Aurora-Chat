"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Auto-grow up to this many px (0 = off). */
  autoGrow?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, autoGrow = 0, onChange, ...rest }, ref) => {
    const localRef = React.useRef<HTMLTextAreaElement | null>(null);
    React.useImperativeHandle(
      ref,
      () => localRef.current as HTMLTextAreaElement,
    );

    const grow = React.useCallback(() => {
      if (!autoGrow || !localRef.current) return;
      const el = localRef.current;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, autoGrow) + "px";
    }, [autoGrow]);

    React.useEffect(() => {
      grow();
    }, [grow, rest.value]);

    return (
      <textarea
        ref={localRef}
        onChange={(e) => {
          grow();
          onChange?.(e);
        }}
        className={cn(
          "w-full rounded-xl border bg-surface-1/60 px-4 py-3 text-sm text-ink-primary placeholder:text-ink-tertiary",
          "shadow-[inset_0_1px_2px_rgba(0,0,0,0.025)] resize-none leading-relaxed",
          "transition-[box-shadow,background-color,border-color] duration-150 outline-none",
          "hover:bg-surface-1",
          "focus:bg-surface-1 focus:border-primary/60 focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.025),0_0_0_4px_color-mix(in_srgb,var(--color-primary)_14%,transparent)]",
          "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-disabled",
          invalid ? "border-danger/60" : "border-outline-variant",
          className,
        )}
        {...rest}
      />
    );
  },
);
Textarea.displayName = "Textarea";
