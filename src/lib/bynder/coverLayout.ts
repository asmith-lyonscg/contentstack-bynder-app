import type { DatOperation, FocalPoint } from "../types";
import { clamp01 } from "./composeDatUrl";

export interface CoverLayout {
  dispW: number;
  dispH: number;
  overflowX: number;
  overflowY: number;
  canPanX: boolean;
  canPanY: boolean;
}

export function clampZoom(zoom: number | null | undefined): number {
  if (zoom == null || !Number.isFinite(zoom)) return 1;
  return Math.min(3, Math.max(1, Math.round(zoom * 100) / 100));
}

export function coverLayout(
  naturalW: number,
  naturalH: number,
  frameW: number,
  frameH: number,
  zoom = 1
): CoverLayout {
  if (!naturalW || !naturalH || !frameW || !frameH) {
    return { dispW: frameW, dispH: frameH, overflowX: 0, overflowY: 0, canPanX: false, canPanY: false };
  }
  const scale = Math.max(frameW / naturalW, frameH / naturalH) * clampZoom(zoom);
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

/** Whole image inside the frame. Leftover space is letterbox, not a crop. */
export function containLayout(
  naturalW: number,
  naturalH: number,
  frameW: number,
  frameH: number,
  zoom = 1
): CoverLayout {
  if (!naturalW || !naturalH || !frameW || !frameH) {
    return { dispW: frameW, dispH: frameH, overflowX: 0, overflowY: 0, canPanX: false, canPanY: false };
  }
  const scale = Math.min(frameW / naturalW, frameH / naturalH) * clampZoom(zoom);
  const dispW = naturalW * scale;
  const dispH = naturalH * scale;
  return {
    dispW,
    dispH,
    overflowX: dispW - frameW,
    overflowY: dispH - frameH,
    canPanX: false,
    canPanY: false,
  };
}

/**
 * Width and height are a window in the loaded image's pixels.
 * The frame shows that window; the rest of the file sits outside it.
 */
export function cropWindowLayout(
  naturalW: number,
  naturalH: number,
  frameW: number,
  frameH: number,
  cropW: number,
  cropH: number,
  zoom = 1
): CoverLayout {
  if (!naturalW || !naturalH || !frameW || !frameH || !cropW || !cropH) {
    return coverLayout(naturalW, naturalH, frameW, frameH, zoom);
  }
  const scale = Math.min(frameW / cropW, frameH / cropH) * clampZoom(zoom);
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

export function frameLayout(
  operation: DatOperation,
  naturalW: number,
  naturalH: number,
  frameW: number,
  frameH: number,
  cropW?: number | null,
  cropH?: number | null,
  zoom = 1
): CoverLayout {
  // Fit / Fill / Crop do not use zoom. Scale is cover + zoom (mutually exclusive with Fill).
  if (operation === "fit") return containLayout(naturalW, naturalH, frameW, frameH, 1);
  if (operation === "crop" && cropW && cropH) {
    return cropWindowLayout(naturalW, naturalH, frameW, frameH, cropW, cropH, 1);
  }
  if (operation === "scale") return coverLayout(naturalW, naturalH, frameW, frameH, zoom);
  return coverLayout(naturalW, naturalH, frameW, frameH, 1);
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

function clampCropOffset(
  offset: { x: number; y: number },
  layout: CoverLayout,
  frameW: number,
  frameH: number
): { x: number; y: number } {
  const clampAxis = (value: number, displayed: number, frame: number) => {
    if (displayed <= frame + 0.5) return (frame - displayed) / 2;
    return Math.min(0, Math.max(frame - displayed, value));
  };
  return {
    x: clampAxis(offset.x, layout.dispW, frameW),
    y: clampAxis(offset.y, layout.dispH, frameH),
  };
}

/** Fill/Scale slide the covered image. Fit stays centered. Crop keeps the focal point in the window. */
export function offsetForOperation(
  operation: DatOperation,
  focal: FocalPoint,
  layout: CoverLayout,
  frameW: number,
  frameH: number
): { x: number; y: number } {
  if (operation === "fit") {
    return { x: (frameW - layout.dispW) / 2, y: (frameH - layout.dispH) / 2 };
  }
  if (operation === "crop") {
    return clampCropOffset(
      {
        x: frameW / 2 - clamp01(focal.x) * layout.dispW,
        y: frameH / 2 - clamp01(focal.y) * layout.dispH,
      },
      layout,
      frameW,
      frameH
    );
  }
  return offsetFromFocal(focal, layout, frameW, frameH);
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
