"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RefreshCw, Home } from "lucide-react";
import { ErrorShell, ErrorDetails } from "@/components/os/ErrorShell";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    console.error("Captured Runtime Error:", error);
  }, [error]);

  return (
    <ErrorShell
      mascotSrc="/error-mascot.png"
      mascotAlt="System Error Mascot"
      title="系统运行遇到问题"
      description="系统在处理您的请求时发生了一个运行时错误。您可以尝试重新加载页面或返回桌面，如问题持续存在，请复制下方日志联系管理员。"
      actions={
        <>
          <Button
            onClick={reset}
            variant="solid"
            size="sm"
            className="flex-1 justify-center gap-1.5"
          >
            <RefreshCw size={14} /> 重新尝试
          </Button>
          <Button
            asChild
            variant="glass"
            size="sm"
            className="flex-1 justify-center gap-1.5"
          >
            <Link href="/">
              <Home size={14} /> 返回桌面
            </Link>
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
  );
}
