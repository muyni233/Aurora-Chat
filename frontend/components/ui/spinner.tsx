"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export function Spinner({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={cn("relative inline-block", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: "var(--iris-conic)",
          mask: "radial-gradient(closest-side, transparent 64%, #000 66%)",
          WebkitMask:
            "radial-gradient(closest-side, transparent 64%, #000 66%)",
          animation: "conic-rotate 1.2s linear infinite",
          transformOrigin: "center",
        }}
      />
    </span>
  );
}
