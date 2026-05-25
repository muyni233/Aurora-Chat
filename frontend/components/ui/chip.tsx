"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const chip = cva(
  "inline-flex items-center gap-1.5 rounded-full transition-all duration-150 select-none",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-ink-secondary hover:bg-surface-3",
        glass: "glass text-ink-primary hover:-translate-y-px",
        primary: "bg-primary/10 text-primary-deep hover:bg-primary/15",
        outline:
          "border border-outline text-ink-secondary hover:border-primary/50 hover:text-primary",
      },
      size: {
        sm: "h-6 px-2 text-[11px] font-medium",
        md: "h-7 px-3 text-xs font-semibold",
        lg: "h-9 px-4 text-sm font-semibold",
      },
      interactive: {
        true: "cursor-pointer active:scale-95",
        false: "",
      },
    },
    defaultVariants: { variant: "default", size: "md", interactive: false },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chip> {
  as?: "span" | "button";
}

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant, size, interactive, as = "span", ...rest }, ref) => {
    const Tag = as as React.ElementType;
    return (
      <Tag
        ref={ref}
        className={cn(
          chip({ variant, size, interactive: interactive || as === "button" }),
          className,
        )}
        {...rest}
      />
    );
  },
);
Chip.displayName = "Chip";
