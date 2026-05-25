"use client";

import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { X, ZoomIn, ZoomOut, Move } from "lucide-react";

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string;
  aspectRatio?: number; // e.g. 1 for 1:1, or 1.5 for 3:2. If undefined, free rectangle.
  circular?: boolean; // Circle overlay (for avatars)
  onCrop: (croppedFile: File) => void;
  onCancel: () => void;
  title?: string;
}

export function ImageCropperModal(props: ImageCropperModalProps) {
  // Conditional render + keyed remount means state resets naturally when the
  // modal opens or the source image changes — no setState-in-effect needed.
  if (!props.isOpen) return null;
  return <ImageCropperModalBody key={props.imageSrc} {...props} />;
}

function ImageCropperModalBody({
  imageSrc,
  aspectRatio = 1,
  circular = false,
  onCrop,
  onCancel,
  title = "裁剪图片",
}: ImageCropperModalProps) {
  const [zoom, setZoom] = React.useState<number>(1);
  const [offset, setOffset] = React.useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Natural dimensions of loaded image
  const [naturalSize, setNaturalSize] = React.useState<{
    w: number;
    h: number;
  }>({ w: 0, h: 0 });

  // Determine crop box size inside 320x320 container
  const containerSize = 320;
  let cropWidth = circular ? 220 : 260;
  let cropHeight = circular ? 220 : 260;

  if (!circular && aspectRatio) {
    if (aspectRatio > 1) {
      cropWidth = 260;
      cropHeight = Math.round(260 / aspectRatio);
    } else {
      cropHeight = 260;
      cropWidth = Math.round(260 * aspectRatio);
    }
  }

  // Handle image load to get natural dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  };

  // Dragging handlers (Mouse & Touch)
  const startDrag = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStart.current = { x: clientX - offset.x, y: clientY - offset.y };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setOffset({
      x: clientX - dragStart.current.x,
      y: clientY - dragStart.current.y,
    });
  };

  const endDrag = () => {
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    moveDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  // Global mouseUp / mousemove listeners to make dragging robust.
  // We inline the move logic instead of referencing `moveDrag` to avoid a
  // stale-closure dependency warning (the move logic only depends on the
  // `dragStart` ref + setOffset, both of which are stable).
  React.useEffect(() => {
    if (!isDragging) return;
    const handleGlobalMouseUp = () => setIsDragging(false);
    const handleGlobalMouseMove = (e: MouseEvent) => {
      setOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [isDragging]);

  const handleCrop = () => {
    if (!imgRef.current || naturalSize.w === 0 || naturalSize.h === 0) return;

    const img = imgRef.current;
    const imgRatio = naturalSize.w / naturalSize.h;

    // Fit size calculation
    let rW = containerSize;
    let rH = containerSize;
    if (imgRatio > 1) {
      rH = containerSize / imgRatio;
    } else {
      rW = containerSize * imgRatio;
    }

    // Mathematical mapping of crop frame back to original/natural coordinates
    const nX =
      ((-cropWidth / 2 - offset.x) / zoom + rW / 2) * (naturalSize.w / rW);
    const nY =
      ((-cropHeight / 2 - offset.y) / zoom + rH / 2) * (naturalSize.h / rH);
    const nW = (cropWidth / zoom) * (naturalSize.w / rW);
    const nH = (cropHeight / zoom) * (naturalSize.h / rH);

    // Target cropped file dimensions
    const targetWidth = circular ? 400 : 800;
    const targetHeight = circular
      ? 400
      : aspectRatio
        ? Math.round(targetWidth / aspectRatio)
        : 600;

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      // Support transparent PNG
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, nX, nY, nW, nH, 0, 0, targetWidth, targetHeight);
    }

    canvas.toBlob((blob) => {
      if (blob) {
        const croppedFile = new File([blob], "cropped_image.png", {
          type: "image/png",
        });
        onCrop(croppedFile);
      }
    }, "image/png");
  };

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md transition-opacity"
      style={{ animation: "fade-in 0.2s ease-out" }}
    >
      <div
        className="glass-window w-full max-w-[400px] rounded-[20px] p-6 shadow-window flex flex-col items-center"
        style={{ animation: "zoom-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between mb-4">
          <span
            className="text-[15px] font-semibold"
            style={{ color: "var(--ink-primary)" }}
          >
            {title}
          </span>
          <button
            onClick={onCancel}
            className="p-1 rounded-full hover:bg-[var(--hover-bg)] transition-colors"
            style={{ color: "var(--ink-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Cropping viewport */}
        <div
          ref={containerRef}
          className="w-[320px] h-[320px] relative overflow-hidden bg-slate-950/20 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={endDrag}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop source"
            onLoad={handleImageLoad}
            className="max-w-full max-h-full object-contain pointer-events-none select-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          />

          {/* Crop Mask Overlay */}
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10] border-2 border-sky-400/80 shadow-[0_0_0_9999px_rgba(11,18,32,0.65)] ${
              circular ? "rounded-full" : "rounded-lg"
            }`}
            style={{
              width: cropWidth,
              height: cropHeight,
            }}
          />

          {/* Guidelines inside mask */}
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[11] border border-dashed border-white/20 ${
              circular ? "rounded-full" : "rounded-lg"
            }`}
            style={{
              width: cropWidth,
              height: cropHeight,
            }}
          />

          {/* Move indicator */}
          <div className="absolute bottom-3 right-3 z-20 bg-slate-900/60 backdrop-blur-sm p-1.5 rounded-lg text-white/70 flex items-center gap-1 text-[10px] pointer-events-none">
            <Move size={10} /> 拖拽移动
          </div>
        </div>

        {/* Zoom controls */}
        <div className="w-full flex items-center gap-3 my-5 px-1">
          <ZoomOut size={14} style={{ color: "var(--ink-tertiary)" }} />
          <Slider
            min={1}
            max={4}
            step={0.01}
            value={[zoom]}
            onValueChange={([val]) => setZoom(val)}
            className="flex-1"
          />
          <ZoomIn size={14} style={{ color: "var(--ink-tertiary)" }} />
        </div>

        {/* Action buttons */}
        <div className="w-full flex justify-end gap-2 pt-2 border-t border-[var(--divider)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-[12.5px]"
          >
            取消
          </Button>
          <Button size="sm" onClick={handleCrop} className="text-[12.5px]">
            确认裁剪并上传
          </Button>
        </div>
      </div>
    </div>
  );
}
