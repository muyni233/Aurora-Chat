import type { Metadata } from "next";
import { cookies } from "next/headers";
// 已移除 next/font/google 的导入以支持离线/受限构建环境。
// 系统后备字体在 globals.css 中定义。
import { Toaster } from "sonner";
import GlassThemeProvider, {
  readCookieSpec,
  THEME_COOKIE,
} from "@/components/theme/GlassThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { DEFAULT_THEME_SPEC } from "@/components/theme/presets";
import { GLASS_CSS } from "@/components/theme/glassCss";
import "./globals.css";

const geist = { variable: "" };
const geistMono = { variable: "" };
const instrument = { variable: "" };

const PUBLIC_BACKEND =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PublicBranding {
  branding: {
    appName: string;
    appTagline: string;
    logoUrl: string;
    faviconUrl: string;
  };
}

export async function generateMetadata(): Promise<Metadata> {
  let appName = "Aurora Chat";
  let tagline = "Intelligent Conversations";
  let favicon = "";
  try {
    const res = await fetch(`${PUBLIC_BACKEND}/api/public/appearance`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as PublicBranding;
      appName = data.branding.appName || appName;
      tagline = data.branding.appTagline || tagline;
      favicon = data.branding.faviconUrl || "";
    }
  } catch {
    // 后端不可达 — 使用默认值即可
  }
  const meta: Metadata = {
    title: `${appName} · ${tagline}`,
    description: "Aether OS",
  };
  if (favicon) {
    const fullFavicon = favicon.startsWith("http")
      ? favicon
      : `${PUBLIC_BACKEND}${favicon}`;
    meta.icons = { icon: fullFavicon };
  }
  return meta;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(THEME_COOKIE)?.value;
  const seed = rawCookie
    ? readCookieSpec(`${THEME_COOKIE}=${rawCookie}`)
    : null;
  const ssrMode = seed?.mode === "dark" ? "dark" : "light";

  let defaults = DEFAULT_THEME_SPEC;
  try {
    const res = await fetch(`${PUBLIC_BACKEND}/api/public/appearance`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        defaults: typeof DEFAULT_THEME_SPEC;
      };
      defaults = data.defaults || DEFAULT_THEME_SPEC;
    }
  } catch {
    // 后端不可达 — 使用默认主题配置即可
  }

  const initialSpec = seed
    ? { ...defaults, mode: seed.mode, preset: seed.preset ?? "aether" }
    : defaults;

  return (
    <html
      lang="zh-CN"
      data-theme={ssrMode}
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}
    >
      <head>
        {/* 玻璃态基础样式直接注入 — 参见 components/theme/glassCss.ts。
            绕过 lightningcss 的前缀合并，否则会移除不带前缀的 `backdrop-filter`
            导致 Chrome/Edge 中的毛玻璃效果失效。 */}
        <style dangerouslySetInnerHTML={{ __html: GLASS_CSS }} />
        {/* 运行时配置（window.__AURORA__） — 必须在任何 React 代码之前执行。
            使用普通的 <script> 标签以便浏览器在 head 处理期间解析并执行；
            此处避免使用 next/script，因为 Next 16/Turbopack 会就放置在
            React 树内部的脚本发出警告。 */}
        <script src="/aurora.config.js" async={false} />
        {/* 系统模式探测 — 在水合之前应用暗色模式以避免闪烁。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              var raw = document.cookie.match(/${THEME_COOKIE}=([^;]+)/);
              var savedMode = null;
              if (raw) { try { savedMode = JSON.parse(decodeURIComponent(raw[1])).mode; } catch(e) {} }
              if (savedMode === 'system' || savedMode === null || savedMode === undefined) {
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  document.documentElement.dataset.theme = 'dark';
                }
              } else {
                document.documentElement.dataset.theme = savedMode;
              }
            } catch (e) {}`,
          }}
        />
      </head>
      <body className="font-sans">
        <GlassThemeProvider initialSpec={initialSpec}>
          <AuthProvider>
            {children}
            <Toaster
              position="top-right"
              duration={3200}
              toastOptions={{
                style: {
                  background: "var(--glass-bg-strong)",
                  backdropFilter: "blur(30px) saturate(180%)",
                  border: "1px solid var(--glass-border)",
                  color: "var(--ink-primary)",
                  boxShadow: "var(--shadow-pop)",
                },
              }}
            />
          </AuthProvider>
        </GlassThemeProvider>
      </body>
    </html>
  );
}
