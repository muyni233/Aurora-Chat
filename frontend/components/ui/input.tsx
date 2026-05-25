"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      iconLeft,
      iconRight,
      invalid,
      size = "md",
      type = "text",
      ...rest
    },
    ref,
  ) => {
    const sizeCls =
      size === "sm"
        ? "h-9 text-xs"
        : size === "lg"
          ? "h-13 text-sm"
          : "h-11 text-sm";
    return (
      <div className={cn("relative w-full", className)}>
        {iconLeft && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          type={type}
          className={cn(
            "w-full rounded-xl border bg-surface-1/60 px-4 py-2 text-ink-primary placeholder:text-ink-tertiary",
            "shadow-[inset_0_1px_2px_rgba(0,0,0,0.025)]",
            "transition-[box-shadow,background-color,border-color] duration-150",
            "outline-none",
            "hover:bg-surface-1",
            "focus:bg-surface-1 focus:border-primary/60 focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.025),0_0_0_4px_color-mix(in_srgb,var(--color-primary)_14%,transparent)]",
            "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-disabled",
            invalid
              ? "border-danger/60 focus:border-danger focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.025),0_0_0_4px_color-mix(in_srgb,var(--color-danger)_18%,transparent)]"
              : "border-outline-variant",
            iconLeft && "pl-10",
            iconRight && "pr-10",
            sizeCls,
          )}
          {...rest}
        />
        {iconRight && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary">
            {iconRight}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
