import { parseAspect } from "./composeDatUrl";
import { aspectRatioFromPixels } from "../profiles";

/** Narrowest the dragged frame may get, in preview pixels. */
export const MIN_CUSTOM_FRAME = 48;

/** Shortest the preview may shrink once the drag passes the canvas edge. */
export const MIN_CUSTOM_HEIGHT = 32;

/** Canvas slot for a custom ratio. Narrow panels get a shorter slot so the form still fits. */
export function customCanvasHeight(canvasWidth: number): number {
  const width = Math.max(MIN_CUSTOM_FRAME, canvasWidth);
  return Math.min(320, Math.max(140, Math.round(width * 0.75)));
}

export function ratioNumber(aspect: string | null | undefined): number | undefined {
  const parsed = parseAspect(aspect ?? "");
  if (!parsed?.h) return undefined;
  return parsed.w / parsed.h;
}

/** Width in the coordinate system where height is the full canvas height. */
export function conceptualWidthForRatio(ratio: number, canvasHeight: number): number {
  return canvasHeight * (ratio > 0 && Number.isFinite(ratio) ? ratio : 1);
}

export function clampConceptualWidth(
  conceptualWidth: number,
  canvasWidth: number,
  canvasHeight: number
): number {
  const canvas = Math.max(MIN_CUSTOM_FRAME, canvasWidth);
  const height = Math.max(MIN_CUSTOM_HEIGHT, canvasHeight);
  const max = (height * canvas) / MIN_CUSTOM_HEIGHT;
  return Math.min(Math.max(conceptualWidth, MIN_CUSTOM_FRAME), max);
}

export interface CustomAspectFrame {
  width: number;
  height: number;
  conceptualWidth: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The frame starts at the current ratio inside a fixed canvas. Width grows with the drag and height
 * stays at the canvas height until the frame reaches the canvas edge. Drag past that edge adds to
 * the width and shrinks the frame so the wider ratio still fits.
 */
export function customAspectFrame(
  conceptualWidth: number,
  canvasWidth: number,
  canvasHeight: number
): CustomAspectFrame {
  const canvas = Math.max(MIN_CUSTOM_FRAME, Math.round(canvasWidth));
  const height = Math.max(MIN_CUSTOM_HEIGHT, Math.round(canvasHeight));
  const conceptual = clampConceptualWidth(conceptualWidth, canvas, height);
  if (conceptual <= canvas + 0.5) {
    return {
      width: Math.max(MIN_CUSTOM_FRAME, Math.round(conceptual)),
      height,
      conceptualWidth: conceptual,
      canvasWidth: canvas,
      canvasHeight: height,
    };
  }
  return {
    width: canvas,
    height: Math.max(MIN_CUSTOM_HEIGHT, Math.round((height * canvas) / conceptual)),
    conceptualWidth: conceptual,
    canvasWidth: canvas,
    canvasHeight: height,
  };
}

export function aspectRatioForConceptual(
  conceptualWidth: number,
  canvasHeight: number
): string | undefined {
  return aspectRatioFromPixels(Math.round(conceptualWidth), Math.round(canvasHeight));
}
