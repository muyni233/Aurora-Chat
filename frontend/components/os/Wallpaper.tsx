"use client";

/**
 * Wallpaper —— 桌面背景。
 *
 * 图层：
 *   1. 纯色后备颜色
 *   2. 渐变（天空 → 桃色），替代 bg.png 占位图
 *   3. 三个漂浮的发光云朵
 *   4. 光标阳光光晕（跟随鼠标移动，带缓动效果）
 */

import * as React from "react";
import { useTheme } from "@/components/theme/GlassThemeProvider";

export function Wallpaper({ isMobile }: { isMobile?: boolean }) {
  const { spec, effectiveMode } = useTheme();
  const cursorGlowRef = React.useRef<HTMLDivElement | null>(null);
  const wallpaperRef = React.useRef<HTMLDivElement | null>(null);

  const parallaxEnabled = spec?.background?.parallaxEnabled !== false;
  const parallaxRef = React.useRef(parallaxEnabled);
  const [mobileUA, setMobileUA] = React.useState(false);

  React.useEffect(() => {
    parallaxRef.current = parallaxEnabled;
    if (!parallaxEnabled && wallpaperRef.current) {
      wallpaperRef.current.style.transform = "none";
    }
  }, [parallaxEnabled]);

  React.useEffect(() => {
    const checkMobileUA = () => {
      if (typeof window === "undefined") return false;
      const ua = window.navigator.userAgent.toLowerCase();
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        ua,
      );
    };
    setMobileUA(checkMobileUA());
  }, []);

  React.useEffect(() => {
    if (mobileUA) {
      // 移动端清除 transform
      if (wallpaperRef.current) {
        wallpaperRef.current.style.transform = "none";
      }
      return;
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let glowX = mouseX;
    let glowY = mouseY;
    let targetPX = 0;
    let targetPY = 0;
    let currPX = 0;
    let currPY = 0;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (parallaxRef.current) {
        targetPX = (e.clientX / window.innerWidth - 0.5) * 16;
        targetPY = (e.clientY / window.innerHeight - 0.5) * 16;
      } else {
        targetPX = 0;
        targetPY = 0;
      }
    };

    const tick = () => {
      // 光晕缓动
      glowX += (mouseX - glowX) * 0.18;
      glowY += (mouseY - glowY) * 0.18;
      if (cursorGlowRef.current) {
        cursorGlowRef.current.style.left = glowX + "px";
        cursorGlowRef.current.style.top = glowY + "px";
      }

      // 视差缓动
      if (parallaxRef.current) {
        currPX += (targetPX - currPX) * 0.08;
        currPY += (targetPY - currPY) * 0.08;
        if (wallpaperRef.current) {
          wallpaperRef.current.style.transform = `translate3d(${currPX}px, ${currPY}px, 0)`;
        }
      } else {
        if (
          wallpaperRef.current &&
          wallpaperRef.current.style.transform !== "none"
        ) {
          wallpaperRef.current.style.transform = "none";
          currPX = 0;
          currPY = 0;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("mousemove", onMove, { capture: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove, { capture: true });
    };
  }, [mobileUA]);

  const blur = spec?.background?.blur ?? 0;
  const dim = spec?.background?.dim ?? 0;

  const kind = spec?.background?.kind;
  const imageUrl = spec?.background?.imageUrl;
  const imageUrlDark = spec?.background?.imageUrlDark;

  const hasLightImage = kind === "image" && imageUrl;
  const hasDarkImage = kind === "image" && imageUrlDark;
  const hasSeparateImages =
    hasLightImage && !!hasDarkImage && imageUrl !== imageUrlDark;
  const isSingleCustomImage =
    kind === "image" && hasLightImage && !hasSeparateImages;

  return (
    <>
      {/* 隐藏的预加载元素，用于提前缓存自定义壁纸，防止主题切换时的闪烁 */}
      <div
        style={{
          display: "none",
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
        aria-hidden
      >
        {imageUrl && <img src={imageUrl} alt="" />}
        {imageUrlDark && <img src={imageUrlDark} alt="" />}
      </div>
      <div
        ref={wallpaperRef}
        aria-hidden
        className="fixed -inset-[4%] z-0"
        style={{
          willChange: "transform",
          filter: `blur(${blur}px)`,
          transition: "filter 0.4s ease",
        }}
      >
        {isSingleCustomImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${imageUrl})`,
            }}
          />
        ) : (
          <>
            {/* 浅色壁纸图层（始终在底层，完全不透明） */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                ...(hasLightImage
                  ? { backgroundImage: `url(${imageUrl})` }
                  : {
                      background: `
                        radial-gradient(ellipse at 18% 22%, rgba(186, 230, 253, 0.55) 0%, transparent 55%),
                        radial-gradient(ellipse at 82% 78%, rgba(254, 215, 170, 0.45) 0%, transparent 55%),
                        radial-gradient(ellipse at 70% 14%, rgba(165, 243, 252, 0.40) 0%, transparent 50%),
                        linear-gradient(135deg, #E9F1F8 0%, #F2EAD8 65%, #E5DCC5 100%)
                      `,
                    }),
              }}
            />
            {/* 深色壁纸图层（在上层淡入/淡出） */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 ease-in-out"
              style={{
                opacity: effectiveMode === "dark" ? 1 : 0,
                ...(hasDarkImage
                  ? { backgroundImage: `url(${imageUrlDark})` }
                  : hasLightImage
                    ? { backgroundImage: `url(${imageUrl})` }
                    : {
                        background: `
                          radial-gradient(ellipse at 20% 30%, rgba(56, 189, 248, 0.12) 0%, transparent 55%),
                          radial-gradient(ellipse at 80% 70%, rgba(167, 139, 250, 0.12) 0%, transparent 55%),
                          linear-gradient(135deg, #0A1020 0%, #0B1428 50%, #0A0F1E 100%)
                        `,
                      }),
              }}
            />
          </>
        )}
      </div>
      {/* 动态暗色不透明度调暗覆盖层 */}
      <div
        aria-hidden
        className="fixed inset-0 z-[1] pointer-events-none transition-colors duration-300 ease-in-out"
        style={{
          backgroundColor: `rgba(0, 0, 0, ${dim})`,
        }}
      />
      <div
        aria-hidden
        className="fixed z-[1] pointer-events-none rounded-full"
        style={{
          width: 460,
          height: 220,
          left: -100,
          top: "20%",
          background:
            "radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, transparent 65%)",
          filter: "blur(60px)",
          mixBlendMode: "screen",
          opacity: 0.4,
          animation: "drift-a 36s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="fixed z-[1] pointer-events-none rounded-full"
        style={{
          width: 380,
          height: 180,
          right: -90,
          bottom: "20%",
          background:
            "radial-gradient(ellipse, rgba(255,240,220,0.5) 0%, transparent 65%)",
          filter: "blur(60px)",
          mixBlendMode: "screen",
          opacity: 0.4,
          animation: "drift-b 44s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="fixed z-[1] pointer-events-none rounded-full"
        style={{
          width: 320,
          height: 150,
          right: "24%",
          top: -70,
          background:
            "radial-gradient(ellipse, rgba(255,245,225,0.45) 0%, transparent 65%)",
          filter: "blur(60px)",
          mixBlendMode: "screen",
          opacity: 0.4,
          animation: "drift-c 52s ease-in-out infinite",
        }}
      />
      {!mobileUA && (
        <div
          ref={cursorGlowRef}
          aria-hidden
          className="fixed pointer-events-none z-[2] rounded-full"
          style={{
            width: 400,
            height: 400,
            background:
              "radial-gradient(circle, rgba(255,240,200,0.08) 0%, transparent 60%)",
            transform: "translate(-50%, -50%)",
            mixBlendMode: "screen",
          }}
        />
      )}
      {/* 背景遮罩：仅在移动端外壳中显示，在浅色/深色模式之间平滑过渡 */}
      {isMobile && (
        <div
          aria-hidden
          className="fixed inset-0 z-[2] pointer-events-none transition-colors duration-500 ease-in-out"
          style={{
            background:
              effectiveMode === "dark"
                ? "rgba(10, 15, 26, 0.38)" // 柔和的深色遮罩，偏冷色调
                : "rgba(255, 255, 255, 0.22)", // 柔和的浅色磨砂遮罩
          }}
        />
      )}
    </>
  );
}

/* 深色模式覆盖：通过 ::after 对壁纸进行变暗和冷调处理 */
export function DarkWallpaperOverlay() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none transition-opacity"
      style={{
        background: `
          radial-gradient(ellipse at 20% 30%, rgba(56, 189, 248, 0.10) 0%, transparent 55%),
          radial-gradient(ellipse at 80% 70%, rgba(167, 139, 250, 0.10) 0%, transparent 55%),
          linear-gradient(135deg, #0A1020 0%, #0B1428 50%, #0A0F1E 100%)
        `,
        opacity: "var(--dark-overlay-opacity, 0)",
      }}
    />
  );
}
