"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  [
    "relative inline-flex items-center justify-center gap-2 select-none",
    "font-medium tracking-tight whitespace-nowrap",
    "transition-[background,box-shadow,transform,filter] duration-200",
    "outline-none focus-visible:iris-ring",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:scale-[0.975]",
  ],
  {
    variants: {
      variant: {
        iris: [
          "text-white shadow-md",
          "bg-gradient-to-r from-sky-400 to-sky-600 hover:from-sky-500 hover:to-sky-700 hover:shadow-lg",
        ],
        solid: [
          "text-white bg-sky-500 hover:bg-sky-600 active:bg-sky-700 shadow-sm hover:shadow-md",
        ],
        glass: [
          "glass text-[var(--ink-primary)]",
          "hover:-translate-y-px hover:shadow-lg",
        ],
        outline: [
          "border border-[var(--divider)] text-[var(--ink-primary)] bg-white/40 dark:bg-black/40",
          "hover:bg-[var(--hover-bg)] hover:border-[var(--divider)]",
        ],
        ghost: [
          "text-[var(--ink-secondary)]",
          "hover:bg-[var(--hover-bg)] hover:text-[var(--ink-primary)]",
        ],
        danger: [
          "text-white bg-red-500 hover:bg-red-600 active:bg-red-700 shadow-sm hover:brightness-110",
        ],
        link: [
          "text-sky-500 hover:text-sky-600 underline-offset-4 hover:underline px-0 h-auto",
        ],
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-md",
        sm: "h-9 px-3.5 text-xs rounded-lg",
        md: "h-11 px-5 text-sm rounded-xl",
        lg: "h-12 px-6 text-sm rounded-xl",
        xl: "h-14 px-7 text-base rounded-2xl",
        icon: "h-10 w-10 rounded-xl",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-xs": "h-7 w-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "solid",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild, loading, disabled, children, ...rest },
    ref,
  ) => {
    const Comp = (asChild ? Slot : "button") as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size }), className)}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <span className="opacity-70">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { button as buttonVariants };
