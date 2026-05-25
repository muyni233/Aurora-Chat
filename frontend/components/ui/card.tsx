"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "solid" | "outline" | "glow";
  hoverable?: boolean;
  as?: keyof React.JSX.IntrinsicElements;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "glass", hoverable, as = "div", ...rest }, ref) => {
    const Comp = as as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "relative rounded-2xl",
          variant === "glass" && "glass",
          variant === "solid" &&
            "bg-surface-1 border border-outline-variant shadow-sm",
          variant === "outline" &&
            "border border-outline-variant bg-surface-1/40",
          variant === "glow" && "glass glass-iris-shadow",
          hoverable &&
            "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
          className,
        )}
        {...rest}
      />
    );
  },
);
Card.displayName = "Card";

export function CardHeader({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-6 pb-3", className)}
      {...rest}
    />
  );
}

export function CardTitle({
  className,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-display text-lg font-bold tracking-tight text-ink-primary leading-tight",
        className,
      )}
      {...rest}
    />
  );
}

export function CardDescription({
  className,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-ink-secondary leading-relaxed", className)}
      {...rest}
    />
  );
}

export function CardContent({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-3", className)} {...rest} />;
}

export function CardFooter({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 p-6 pt-0", className)}
      {...rest}
    />
  );
}
