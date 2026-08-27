import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { FocalPoint } from "../lib/types";
import "./FocalPointCanvas.css";

interface FocalPointCanvasProps {
  src: string;
  alt?: string;
  focalPoint: FocalPoint;
  disabled?: boolean;
  onChange: (point: FocalPoint) => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function displayedImageRect(img: HTMLImageElement): DOMRect {
  const bounds = img.getBoundingClientRect();
  if (!img.naturalWidth || !img.naturalHeight) return bounds;
  const natural = img.naturalWidth / img.naturalHeight;
  const box = bounds.width / bounds.height;
  let width = bounds.width;
  let height = bounds.height;
  if (natural > box) {
    height = bounds.width / natural;
  } else {
    width = bounds.height * natural;
  }
  const left = bounds.left + (bounds.width - width) / 2;
  const top = bounds.top + (bounds.height - height) / 2;
  return new DOMRect(left, top, width, height);
}

function pointFromEvent(img: HTMLImageElement, clientX: number, clientY: number): FocalPoint {
  const rect = displayedImageRect(img);
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function FocalPointCanvas({ src, alt, focalPoint, disabled, onChange }: FocalPointCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragging = useRef(false);
  const [marker, setMarker] = useState({ left: "50%", top: "50%" });

  const syncMarker = useCallback(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;
    const image = displayedImageRect(img);
    const wrapRect = wrap.getBoundingClientRect();
    const x = image.left - wrapRect.left + focalPoint.x * image.width;
    const y = image.top - wrapRect.top + focalPoint.y * image.height;
    setMarker({ left: `${x}px`, top: `${y}px` });
  }, [focalPoint.x, focalPoint.y]);

  useEffect(() => {
    syncMarker();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncMarker());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [syncMarker, src]);

  const updateFromPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const img = imgRef.current;
      if (!img || disabled) return;
      onChange(pointFromEvent(img, event.clientX, event.clientY));
    },
    [disabled, onChange]
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    updateFromPointer(event);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    let { x, y } = focalPoint;
    if (event.key === "ArrowLeft") x -= step;
    else if (event.key === "ArrowRight") x += step;
    else if (event.key === "ArrowUp") y -= step;
    else if (event.key === "ArrowDown") y += step;
    else return;
    event.preventDefault();
    onChange({ x: clamp01(x), y: clamp01(y) });
  };

  return (
    <div
      ref={wrapRef}
      className={`focal-canvas${disabled ? " is-disabled" : ""}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Focal point"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(focalPoint.x * 100)}
      aria-valuetext={`${Math.round(focalPoint.x * 100)}% from left, ${Math.round(focalPoint.y * 100)}% from top`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <img ref={imgRef} src={src} alt={alt ?? "Bynder source image"} draggable={false} onLoad={syncMarker} />
      <div className="focal-crosshair" style={marker} aria-hidden />
    </div>
  );
}
