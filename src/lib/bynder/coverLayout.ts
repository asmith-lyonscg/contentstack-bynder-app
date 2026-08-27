import type { FocalPoint } from "../types";
import { clamp01 } from "./composeDatUrl";

export interface CoverLayout {
  dispW: number;
  dispH: number;
  overflowX: number;
  overflowY: number;
  canPanX: boolean;
  canPanY: boolean;
}

export function coverLayout(
  naturalW: number,
  naturalH: number,
  frameW: number,
  frameH: number
): CoverLayout {
  if (!naturalW || !naturalH || !frameW || !frameH) {
    return { dispW: frameW, dispH: frameH, overflowX: 0, overflowY: 0, canPanX: false, canPanY: false };
  }
  const scale = Math.max(frameW / naturalW, frameH / naturalH);
  const dispW = naturalW * scale;
  const dispH = naturalH * scale;
  const overflowX = dispW - frameW;
  const overflowY = dispH - frameH;
  return {
    dispW,
    dispH,
    overflowX,
    overflowY,
    canPanX: overflowX > 0.5,
    canPanY: overflowY > 0.5,
  };
}

export function offsetFromFocal(
  focal: FocalPoint,
  layout: CoverLayout,
  frameW: number,
  frameH: number
): { x: number; y: number } {
  return {
    x: (frameW - layout.dispW) * clamp01(focal.x),
    y: (frameH - layout.dispH) * clamp01(focal.y),
  };
}

export function clampOffset(
  offset: { x: number; y: number },
  layout: CoverLayout
): { x: number; y: number } {
  const minX = Math.min(0, -layout.overflowX);
  const minY = Math.min(0, -layout.overflowY);
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

export function focalFromOffset(
  offset: { x: number; y: number },
  layout: CoverLayout,
  frameW: number,
  frameH: number,
  previous?: FocalPoint
): FocalPoint {
  const dx = frameW - layout.dispW;
  const dy = frameH - layout.dispH;
  return {
    x: layout.canPanX && Math.abs(dx) >= 0.5 ? clamp01(offset.x / dx) : previous?.x ?? 0.5,
    y: layout.canPanY && Math.abs(dy) >= 0.5 ? clamp01(offset.y / dy) : previous?.y ?? 0.5,
  };
}

export function imagePointFromPointer(
  clientX: number,
  clientY: number,
  imageRect: { left: number; top: number; width: number; height: number }
): FocalPoint {
  if (!imageRect.width || !imageRect.height) return { x: 0.5, y: 0.5 };
  return {
    x: clamp01((clientX - imageRect.left) / imageRect.width),
    y: clamp01((clientY - imageRect.top) / imageRect.height),
  };
}
