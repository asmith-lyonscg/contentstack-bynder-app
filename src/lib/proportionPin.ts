import type { TransformSettings } from "./types";
import { parseAspect } from "./bynder/composeDatUrl";

export type ProportionPin = "aspect" | "width" | "height";

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function formatAspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function heightFor(width: number, aspect: { w: number; h: number }): number {
  return Math.max(1, Math.round((width * aspect.h) / aspect.w));
}

function widthFor(height: number, aspect: { w: number; h: number }): number {
  return Math.max(1, Math.round((height * aspect.w) / aspect.h));
}

/**
 * The pinned field stays put when another field is committed.
 * The remaining field is recalculated from the pin and the edit.
 */
export function applyProportionPin(
  current: TransformSettings,
  pin: ProportionPin,
  edited: { aspect?: string | null; width?: number | null; height?: number | null }
): TransformSettings {
  if ("aspect" in edited && !parseAspect(edited.aspect)) {
    return { ...current, aspect: edited.aspect ?? null };
  }
  if ("width" in edited && !positive(edited.width)) {
    return { ...current, width: null };
  }
  if ("height" in edited && !positive(edited.height)) {
    return { ...current, height: null };
  }

  const next = { ...current, ...edited };
  const width = positive(next.width);
  const height = positive(next.height);
  const aspect = parseAspect(next.aspect);
  const pinnedWidth = positive(current.width);
  const pinnedHeight = positive(current.height);

  if (pin === "aspect" && aspect) {
    if ("width" in edited && width) return { ...next, width, height: heightFor(width, aspect) };
    if ("height" in edited && height) return { ...next, width: widthFor(height, aspect), height };
    if ("aspect" in edited && width) return { ...next, width, height: heightFor(width, aspect) };
    if ("aspect" in edited && height) return { ...next, width: widthFor(height, aspect), height };
  }

  if (pin === "width" && pinnedWidth) {
    if ("height" in edited && height) {
      return { ...next, width: pinnedWidth, height, aspect: formatAspectRatio(pinnedWidth, height) };
    }
    if ("aspect" in edited && aspect) {
      return { ...next, width: pinnedWidth, height: heightFor(pinnedWidth, aspect) };
    }
    if ("width" in edited && width && aspect) return { ...next, width, height: heightFor(width, aspect) };
    if ("width" in edited && width && height) {
      return { ...next, width, aspect: formatAspectRatio(width, height) };
    }
  }

  if (pin === "height" && pinnedHeight) {
    if ("width" in edited && width) {
      return { ...next, width, height: pinnedHeight, aspect: formatAspectRatio(width, pinnedHeight) };
    }
    if ("aspect" in edited && aspect) {
      return { ...next, width: widthFor(pinnedHeight, aspect), height: pinnedHeight };
    }
    if ("height" in edited && height && aspect) return { ...next, width: widthFor(height, aspect), height };
    if ("height" in edited && height && width) {
      return { ...next, height, aspect: formatAspectRatio(width, height) };
    }
  }

  return next;
}
