"use client";

/**
 * 全局错误边界 — 捕获根布局本身中的错误。
 * 必须渲染自己的 <html> 和 <body>。避免使用 next/link（不保证有路由上下文），
 * 改用普通锚点进行导航。
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Home } from "lucide-react";
import { ErrorShell, ErrorDetails } from "@/components/os/ErrorShell";
import "./globals.css";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalErrorPage({ error, reset }: GlobalErrorProps) {
  React.useEffect(() => {
    console.error("Captured Global Layout Error:", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="font-sans m-0 p-0 overflow-hidden">
        <ErrorShell
          mascotSrc="/error-mascot.png"
          mascotAlt="System Error Mascot"
          title="系统加载异常"
          description="Aether OS 核心组件加载失败。您可以尝试重新加载，或检查您的浏览器与网络配置。"
          actions={
            <>
              <Button
                onClick={reset}
                variant="solid"
                size="sm"
                className="flex-1 justify-center gap-1.5"
              >
                <RefreshCw size={14} /> 重新加载
              </Button>
              <Button
                asChild
                variant="glass"
                size="sm"
                className="flex-1 justify-center gap-1.5"
              >
                {/* 普通锚点：global-error 不保证有路由上下文。 */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/">
                  <Home size={14} /> 返回主页
                </a>
              </Button>
            </>
          }
          details={
            <ErrorDetails
              message={error.message}
              digest={error.digest}
              stack={error.stack}
            />
          }
        />
      </body>
    </html>
  );
}
