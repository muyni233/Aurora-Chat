"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle" | "text";
}

export function Skeleton({
  className,
  variant = "rect",
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface-2",
        variant === "circle" ? "rounded-full" : "rounded-md",
        variant === "text" && "h-4",
        "before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:animate-[shimmer_1.6s_infinite] dark:before:via-white/8",
        className,
      )}
      {...rest}
    />
  );
}
