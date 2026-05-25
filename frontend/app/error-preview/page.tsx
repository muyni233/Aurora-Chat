"use client";

import * as React from "react";
import GlobalError from "../error";
import NotFound from "../not-found";

export default function ErrorPreviewPage() {
  const [mode, setMode] = React.useState<"404" | "500">("500");

  const mockError = React.useMemo(() => {
    const err = new Error(
      "MOCK_SYSTEM_FAILURE: 数据库连接超时 (Database Connection Timeout)",
    );
    err.stack =
      "Error: 数据库连接超时\n    at Database.connect (db.ts:42:10)\n    at apiRoute (route.ts:18:24)\n    at nextServer (server.js:104:30)\n    at Object.fn (node_modules/next/dist/server/future/route-modules/pages/module.compiled.js:12:45)";
    return err;
  }, []);

  return (
    <div className="relative w-full h-full min-h-screen">
      {/* Floating Mode Switcher */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex p-0.5 rounded-full bg-white/70 dark:bg-black/70 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-lg">
        <button
          onClick={() => setMode("500")}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            mode === "500"
              ? "bg-sky-500 text-white shadow-sm"
              : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          }`}
        >
          500 运行时错误
        </button>
        <button
          onClick={() => setMode("404")}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            mode === "404"
              ? "bg-sky-500 text-white shadow-sm"
              : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          }`}
        >
          404 页面未找到
        </button>
      </div>

      {mode === "500" ? (
        <GlobalError
          error={mockError}
          reset={() => {
            alert("此为系统错误页面预览，重试重置操作已成功模拟触发！");
          }}
        />
      ) : (
        <NotFound />
      )}
    </div>
  );
}
