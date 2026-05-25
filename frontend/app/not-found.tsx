"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorShell } from "@/components/os/ErrorShell";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <ErrorShell
      maxWidth="sm"
      mascotSrc="/not-found-mascot.png"
      mascotAlt="404 Mascot"
      title="404 · 页面未找到"
      description="抱歉，您访问的页面不存在或已被删除。"
      actions={
        <Button
          asChild
          variant="glass"
          size="sm"
          className="w-full justify-center gap-1.5"
        >
          <Link href="/">
            <Home size={14} /> 返回桌面
          </Link>
        </Button>
      }
    />
  );
}
