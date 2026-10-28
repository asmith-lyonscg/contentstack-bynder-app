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

/** Scale the image so it covers the frame. The overflow is what the focal point slides. */
export function coverLayout(naturalW: number, naturalH: number, frameW: number, frameH: number): CoverLayout {
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

/**
 * Focal point from a click on the crop frame. `mirror` flips the frame across
 * its vertical center, so the stored x stays in the original file's coordinates.
 */
export function focalPointFromFramePointer(
  clientX: number,
  clientY: number,
  frameRect: { left: number; top: number; width: number; height: number },
  layout: CoverLayout,
  frameW: number,
  frameH: number,
  offset: { x: number; y: number },
  mirror = false
): FocalPoint {
  if (!frameRect.width || !frameRect.height || !layout.dispW || !layout.dispH) return { x: 0.5, y: 0.5 };
  const visualX = (clientX - frameRect.left) / frameRect.width;
  const visualY = (clientY - frameRect.top) / frameRect.height;
  const layoutX = mirror ? 1 - visualX : visualX;
  return {
    x: clamp01((layoutX * frameW - offset.x) / layout.dispW),
    y: clamp01((visualY * frameH - offset.y) / layout.dispH),
  };
}
