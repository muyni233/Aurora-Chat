"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badge = cva(
  "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-colors",
  {
    variants: {
      variant: {
        default: "bg-surface-3 text-ink-secondary",
        primary: "bg-primary/12 text-primary-deep",
        success: "bg-success/12 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/12 text-danger",
        info: "bg-info/12 text-info",
        outline: "border border-outline text-ink-secondary",
        iris: "bg-iris text-white shadow-sm",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[9px]",
        md: "px-2 py-0.5 text-[10px]",
        lg: "px-2.5 py-1 text-[11px]",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

export function Badge({ className, variant, size, ...rest }: BadgeProps) {
  return <span className={cn(badge({ variant, size }), className)} {...rest} />;
}
