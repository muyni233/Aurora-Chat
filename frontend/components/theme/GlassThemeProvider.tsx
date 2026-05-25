"use client";

/**
 * Aether OS 主题运行时。
 *
 * 优先级：
 *   1. 来自 `/api/public/appearance`（匿名）或 `/api/me/theme`（已登录）的管理员默认值
 *   2. 用户覆盖（浅色/深色/跟随系统）
 *   3. Cookie 种子用于 SSR 预渲染
 */

import * as React from "react";
import { apiGet, apiPut, apiDelete, getToken } from "@/lib/api";
import { buildCssVars, applyCssVars } from "./cssVars";
import {
  DEFAULT_THEME_SPEC,
  resolveEffectiveMode,
  type ThemeSpec,
  type PresetId,
} from "./presets";
import type { EffectiveMode, ThemeMode } from "./tokens";

export const THEME_COOKIE = "aurora-theme";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface BrandingResponse {
  appName: string;
  appTagline: string;
  logoUrl: string;
  faviconUrl: string;
  allowUserOverride: boolean;
}

interface MyThemeResponse {
  user: ThemeSpec | null;
  defaults: ThemeSpec;
  effective: ThemeSpec;
  branding: BrandingResponse;
  allowOverride: boolean;
}

interface PublicAppearanceResponse {
  branding: BrandingResponse;
  defaults: ThemeSpec;
}

interface ThemeContextValue {
  spec: ThemeSpec;
  userSpec: ThemeSpec | null;
  defaults: ThemeSpec;
  systemMode: EffectiveMode;
  effectiveMode: EffectiveMode;
  branding: BrandingResponse;
  setSpec: (next: ThemeSpec) => Promise<void>;
  patchSpec: (patch: Partial<ThemeSpec>) => Promise<void>;
  resetSpec: () => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx)
    throw new Error("useTheme 必须在 <GlassThemeProvider> 内部使用");
  return ctx;
}

interface ShortCookieSpec {
  mode: ThemeMode;
  preset?: PresetId;
}

function writeCookie(spec: ThemeSpec) {
  if (typeof document === "undefined") return;
  const short: ShortCookieSpec = {
    mode: spec.mode,
    preset: spec.preset ?? "aether",
  };
  const value = encodeURIComponent(JSON.stringify(short));
  document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function readCookieSpec(
  cookieHeader: string | undefined,
): ShortCookieSpec | null {
  if (!cookieHeader) return null;
  const m = new RegExp(`${THEME_COOKIE}=([^;]+)`).exec(cookieHeader);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1])) as ShortCookieSpec;
  } catch {
    return null;
  }
}

function getSystemMode(): EffectiveMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function normalizeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function isBackgroundEqual(a: any, b: any): boolean {
  if (!a && !b) return true;
  if (!a) return (b.kind ?? "none") === "none";
  if (!b) return (a.kind ?? "none") === "none";
  return (
    (a.kind ?? "none") === (b.kind ?? "none") &&
    normalizeStr(a.imageUrl) === normalizeStr(b.imageUrl) &&
    normalizeStr(a.imageUrlDark) === normalizeStr(b.imageUrlDark) &&
    (a.blur ?? 0) === (b.blur ?? 0) &&
    Math.abs((a.dim ?? 0) - (b.dim ?? 0)) < 0.001 &&
    (a.extractPalette ?? false) === (b.extractPalette ?? false) &&
    (a.parallaxEnabled ?? true) === (b.parallaxEnabled ?? true)
  );
}

function isThemeSpecEqual(
  a: ThemeSpec | null | undefined,
  b: ThemeSpec | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.mode === b.mode &&
    (a.preset ?? "aether") === (b.preset ?? "aether") &&
    (a.customAccent ?? null) === (b.customAccent ?? null) &&
    (a.customSecondary ?? null) === (b.customSecondary ?? null) &&
    (a.customTertiary ?? null) === (b.customTertiary ?? null) &&
    (a.radius ?? "normal") === (b.radius ?? "normal") &&
    (a.fontScale ?? "md") === (b.fontScale ?? "md") &&
    (a.motion ?? "full") === (b.motion ?? "full") &&
    isBackgroundEqual(a.background, b.background)
  );
}

interface ProviderProps {
  initialSpec?: ThemeSpec;
  initialBranding?: BrandingResponse;
  children: React.ReactNode;
}

const FALLBACK_BRANDING: BrandingResponse = {
  appName: "Aurora Chat",
  appTagline: "智能对话",
  logoUrl: "/logo.png",
  faviconUrl: "",
  allowUserOverride: true,
};

export default function GlassThemeProvider({
  initialSpec,
  initialBranding,
  children,
}: ProviderProps) {
  const [spec, setSpecState] = React.useState<ThemeSpec>(
    initialSpec ?? DEFAULT_THEME_SPEC,
  );
  const [userSpec, setUserSpec] = React.useState<ThemeSpec | null>(null);
  const [defaults, setDefaults] = React.useState<ThemeSpec>(DEFAULT_THEME_SPEC);
  const [branding, setBranding] = React.useState<BrandingResponse>(
    initialBranding ?? FALLBACK_BRANDING,
  );
  const [systemMode, setSystemMode] = React.useState<EffectiveMode>(() =>
    getSystemMode(),
  );
  const [loading, setLoading] = React.useState(true);

  // 保留 ref 引用，以便 setSpec 在闭包过期时仍能读取最新的 defaults/userSpec
  const defaultsRef = React.useRef(defaults);
  React.useEffect(() => {
    defaultsRef.current = defaults;
  }, [defaults]);
  const userSpecRef = React.useRef(userSpec);
  React.useEffect(() => {
    userSpecRef.current = userSpec;
  }, [userSpec]);

  const loadFromServer = React.useCallback(async () => {
    const hasToken = !!getToken();
    try {
      if (hasToken) {
        const data = await apiGet<MyThemeResponse>("/api/me/theme");
        setUserSpec((prev) =>
          isThemeSpecEqual(prev, data.user) ? prev : data.user,
        );
        setDefaults((prev) =>
          isThemeSpecEqual(prev, data.defaults) ? prev : data.defaults,
        );
        setBranding((prev) =>
          JSON.stringify(prev) === JSON.stringify(data.branding)
            ? prev
            : data.branding,
        );
        setSpecState((prev) =>
          isThemeSpecEqual(prev, data.effective) ? prev : data.effective,
        );
        writeCookie(data.effective);
      } else {
        const data = await apiGet<PublicAppearanceResponse>(
          "/api/public/appearance",
        );
        setUserSpec(null);
        setDefaults((prev) =>
          isThemeSpecEqual(prev, data.defaults) ? prev : data.defaults,
        );
        setBranding((prev) =>
          JSON.stringify(prev) === JSON.stringify(data.branding)
            ? prev
            : data.branding,
        );
        setSpecState((prev) =>
          isThemeSpecEqual(prev, data.defaults) ? prev : data.defaults,
        );
        writeCookie(data.defaults);
      }
    } catch {
      // 网络失败 — 保留 SSR 种子
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const hasToken = !!getToken();
      try {
        if (hasToken) {
          const data = await apiGet<MyThemeResponse>("/api/me/theme");
          if (cancelled) return;
          setUserSpec((prev) =>
            isThemeSpecEqual(prev, data.user) ? prev : data.user,
          );
          setDefaults((prev) =>
            isThemeSpecEqual(prev, data.defaults) ? prev : data.defaults,
          );
          setBranding((prev) =>
            JSON.stringify(prev) === JSON.stringify(data.branding)
              ? prev
              : data.branding,
          );
          setSpecState((prev) =>
            isThemeSpecEqual(prev, data.effective) ? prev : data.effective,
          );
          writeCookie(data.effective);
        } else {
          const data = await apiGet<PublicAppearanceResponse>(
            "/api/public/appearance",
          );
          if (cancelled) return;
          setUserSpec(null);
          setDefaults((prev) =>
            isThemeSpecEqual(prev, data.defaults) ? prev : data.defaults,
          );
          setBranding((prev) =>
            JSON.stringify(prev) === JSON.stringify(data.branding)
              ? prev
              : data.branding,
          );
          setSpecState((prev) =>
            isThemeSpecEqual(prev, data.defaults) ? prev : data.defaults,
          );
          writeCookie(data.defaults);
        }
      } catch {
        // 保留 SSR 种子
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "aurora_token") loadFromServer();
    };
    // 焦点处理防抖：快速切换标签页不应频繁请求后端
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => loadFromServer(), 600);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadFromServer]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setSystemMode(e.matches ? "dark" : "light");
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  const effectiveMode = React.useMemo(
    () => resolveEffectiveMode(spec.mode, systemMode),
    [spec.mode, systemMode],
  );

  const resolved = React.useMemo(
    () => buildCssVars(spec, effectiveMode),
    [spec, effectiveMode],
  );

  React.useLayoutEffect(() => {
    applyCssVars(resolved);
  }, [resolved]);

  const setSpec = React.useCallback(
    async (next: ThemeSpec) => {
      // 预合并：镜像后端 _resolve_effective 逻辑，使乐观更新后的 spec 在结构上
      // 与服务端最终响应一致。如果不做这一步，当用户没有自定义壁纸时，服务端会返回
      // effective.background = defaults.background，导致结构差异并触发二次状态更新和可见的双闪。
      const defs = defaultsRef.current;
      let optimistic = next;
      if (
        (!next.background || next.background.kind === "none") &&
        defs.background &&
        defs.background.kind !== "none"
      ) {
        optimistic = { ...next, background: { ...defs.background } };
      }
      const update = () => {
        setSpecState(optimistic);
        writeCookie(optimistic);
      };
      if (
        typeof document !== "undefined" &&
        (document as any).startViewTransition
      ) {
        (document as any).startViewTransition(() => {
          React.startTransition(update);
        });
      } else {
        update();
      }
      if (!getToken()) return;
      if (!branding.allowUserOverride) return;
      try {
        const res = await apiPut<MyThemeResponse>("/api/me/theme", next);
        setUserSpec((prev) =>
          isThemeSpecEqual(prev, res.user) ? prev : res.user,
        );
        setDefaults((prev) =>
          isThemeSpecEqual(prev, res.defaults) ? prev : res.defaults,
        );
        setBranding((prev) =>
          JSON.stringify(prev) === JSON.stringify(res.branding)
            ? prev
            : res.branding,
        );
      } catch {
        // 忽略
      }
    },
    [branding.allowUserOverride],
  );

  const patchSpec = React.useCallback(
    async (patch: Partial<ThemeSpec>) => {
      await setSpec({ ...spec, ...patch });
    },
    [spec, setSpec],
  );

  const resetSpec = React.useCallback(async () => {
    const reset = () => {
      setUserSpec(null);
      setSpecState(defaults);
      writeCookie(defaults);
    };
    if (
      typeof document !== "undefined" &&
      (document as any).startViewTransition
    ) {
      (document as any).startViewTransition(() => {
        React.startTransition(reset);
      });
    } else {
      reset();
    }
    if (!getToken()) return;
    try {
      await apiDelete<MyThemeResponse>("/api/me/theme");
    } catch {
      // 忽略
    }
  }, [defaults]);

  const value: ThemeContextValue = React.useMemo(
    () => ({
      spec,
      userSpec,
      defaults,
      systemMode,
      effectiveMode,
      branding,
      setSpec,
      patchSpec,
      resetSpec,
      reload: loadFromServer,
      loading,
    }),
    [
      spec,
      userSpec,
      defaults,
      systemMode,
      effectiveMode,
      branding,
      setSpec,
      patchSpec,
      resetSpec,
      loadFromServer,
      loading,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
