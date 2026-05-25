"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

interface EmptyProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  variant?: "plain" | "card";
}

export function Empty({
  icon,
  title = "空空如也",
  description,
  action,
  className,
  variant = "plain",
}: EmptyProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 24 }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center py-14 px-6",
        variant === "card" && "glass rounded-3xl",
        className,
      )}
    >
      <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-iris-soft text-primary shadow-sm">
        {icon ?? <Sparkles className="h-6 w-6 opacity-80" />}
      </div>
      <div className="space-y-1">
        <h3 className="font-display text-base font-bold tracking-tight text-ink-primary">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-ink-secondary leading-relaxed max-w-sm mx-auto">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}
