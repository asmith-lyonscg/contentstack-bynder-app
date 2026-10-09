import type {
  DatOperation,
  ExtendBackgroundMode,
  FocalPoint,
  ProfileSettings,
  TransformSettings,
} from "../types";

const DEFAULT_FOCAL: FocalPoint = { x: 0.5, y: 0.5 };

const POSITIVE = (n: unknown): number | undefined => {
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
};

export function parseAspect(aspect: string | null | undefined): { w: number; h: number } | null {
  if (!aspect) return null;
  const match = aspect.trim().match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!w || !h) return null;
  return { w, h };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function roundCoord(value: number): number {
  return Math.round(clamp01(value) * 10000) / 10000;
}

export function normalizeFocalPoint(point: FocalPoint | null | undefined): FocalPoint {
  return {
    x: roundCoord(point?.x ?? 0.5),
    y: roundCoord(point?.y ?? 0.5),
  };
}

export function resolveDimensions(transform: TransformSettings): { width?: number; height?: number } {
  const aspect = parseAspect(transform.aspect);
  let width = POSITIVE(transform.width);
  let height = POSITIVE(transform.height);

  if (aspect) {
    if (width && !height) {
      height = Math.round((width * aspect.h) / aspect.w);
    } else if (height && !width) {
      width = Math.round((height * aspect.w) / aspect.h);
    }
  }

  return { width, height };
}

/** Crop box from width × height. Aspect only fills a missing side. */
export function cssCropBox(transform: TransformSettings): { width: number; height: number } {
  const aspect = parseAspect(transform.aspect);
  let width = POSITIVE(transform.width);
  let height = POSITIVE(transform.height);

  if (width && height) {
    return { width, height };
  }

  if (aspect) {
    if (width) {
      height = Math.round((width * aspect.h) / aspect.w);
    } else if (height) {
      width = Math.round((height * aspect.w) / aspect.h);
    } else {
      width = 1200;
      height = Math.round((1200 * aspect.h) / aspect.w);
    }
  } else {
    width = width ?? 1200;
    height = height ?? 675;
  }

  return { width: width as number, height: height as number };
}

export function lockToAspect(transform: TransformSettings, aspect: string | null): TransformSettings {
  const next = { ...transform, aspect };
  if (!aspect) return next;
  const parsed = parseAspect(aspect);
  if (!parsed) return next;
  const width = POSITIVE(next.width);
  const height = POSITIVE(next.height);
  if (width) {
    return { ...next, width, height: Math.round((width * parsed.h) / parsed.w) };
  }
  if (height) {
    return { ...next, width: Math.round((height * parsed.w) / parsed.h), height };
  }
  const defaultWidth = 1200;
  return {
    ...next,
    width: defaultWidth,
    height: Math.round((defaultWidth * parsed.h) / parsed.w),
  };
}

/** Scale a box so the shorter side is at least `minSide`; the longer side stays proportional. */
export function scaleToMinSide(
  width: number,
  height: number,
  minSide = 64
): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = minSide / Math.min(w, h);
  return {
    width: Math.max(minSide, Math.round(w * scale)),
    height: Math.max(minSide, Math.round(h * scale)),
  };
}

export function fitPreviewBox(
  transform: TransformSettings,
  maxWidth = 520,
  maxHeight = 280
): { width: number; height: number; sourceWidth: number; sourceHeight: number } {
  const box = cssCropBox(transform);
  const scale = Math.min(maxWidth / box.width, maxHeight / box.height, 1);
  return {
    width: Math.max(64, Math.round(box.width * scale)),
    height: Math.max(40, Math.round(box.height * scale)),
    sourceWidth: box.width,
    sourceHeight: box.height,
  };
}

/** True when the on-screen crop frame is 1:1 with the configured width/height. */
export function previewIsToScale(fitted: {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}): boolean {
  return fitted.width === fitted.sourceWidth && fitted.height === fitted.sourceHeight;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function appendQuery(baseUrl: string, query: string): string {
  if (!query) return baseUrl;
  const hasQuery = baseUrl.includes("?");
  return `${baseUrl}${hasQuery ? "&" : "?"}${query}`;
}

function gravityFromFocal(focal: FocalPoint): string {
  const col = focal.x < 1 / 3 ? "left" : focal.x > 2 / 3 ? "right" : "";
  const row = focal.y < 1 / 3 ? "top" : focal.y > 2 / 3 ? "bottom" : "";
  return `${row}${col}` || "center";
}

/**
 * Map our Transform type to a Bynder DAT `io` operation.
 * Fit uses `extend` (letterbox). Anything else, including a legacy `scale`, uses `fill`.
 */
export function datIoOperation(operation: string | null | undefined): "fill" | "extend" | "crop" {
  if (operation === "fit") return "extend";
  if (operation === "crop") return "crop";
  return "fill";
}

/** DAT `background:` value for Fit/extend. Always set — Bynder defaults to white without it. */
export function resolveExtendBackground(transform: {
  extendBackground?: string | null;
  extendBackgroundColor?: string | null;
}): string {
  const mode = transform.extendBackground ?? "auto";
  if (mode === "transparent") return "00000000";
  if (mode === "black") return "000000";
  if (mode === "white") return "ffffff";
  if (mode === "custom") {
    const hex = String(transform.extendBackgroundColor ?? "")
      .trim()
      .replace(/^#/, "")
      .toLowerCase();
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return hex;
    return "auto";
  }
  return "auto";
}

function buildIoParam(
  operation: string,
  width?: number,
  height?: number,
  gravity?: string,
  background?: string
): string {
  const parts = [`transform:${datIoOperation(operation)}`];
  if (width) parts.push(`width:${width}`);
  if (height) parts.push(`height:${height}`);
  if (gravity) parts.push(`gravity:${gravity}`);
  if (datIoOperation(operation) === "extend") {
    parts.push(`background:${background || "auto"}`);
  }
  return `io=${parts.join(",")}`;
}

/** Query string only. Join with `transformBaseUrl` at delivery time. */
export function composeDatQuery(options: {
  focalPoint?: FocalPoint | null;
  transform: TransformSettings;
}): string {
  const { width, height } = resolveDimensions(options.transform);
  const operation = options.transform.operation || "fill";
  const focal = options.focalPoint ? normalizeFocalPoint(options.focalPoint) : null;
  const gravity = operation === "crop" && focal ? gravityFromFocal(focal) : undefined;
  const background = operation === "fit" ? resolveExtendBackground(options.transform) : undefined;
  const fragments: string[] = [buildIoParam(operation, width, height, gravity, background)];
  if (focal && operation !== "fit") fragments.push(`focuspoint=${focal.x},${focal.y}`);
  const format = options.transform.format;
  if (format) fragments.push(`format=${format}`);
  const quality = POSITIVE(options.transform.quality);
  if (quality && format !== "png") fragments.push(`quality=${Math.min(100, quality)}`);
  return fragments.join("&");
}

/** The author's per-viewport choices, as saved on the entry. */
export interface DatCrop {
  focalPoint?: FocalPoint | null;
  operation?: DatOperation | null;
  extendBackground?: ExtendBackgroundMode | null;
  extendBackgroundColor?: string | null;
}

/**
 * DAT query for one image `width` wide, at the profile aspect ratio, format, and quality.
 * Without an aspect ratio the image is resized proportionally (`transform:scale`).
 */
export function datQueryForWidth(
  crop: DatCrop,
  profile: Pick<ProfileSettings, "format" | "quality"> & { aspectRatio?: string },
  width: number
): string {
  const w = Math.max(1, Math.round(width));
  const parsed = parseAspect(profile.aspectRatio);
  if (!parsed) {
    const fragments = [`io=transform:scale,width:${w}`, `format=${profile.format}`];
    if (profile.format !== "png") fragments.push(`quality=${Math.min(100, Math.max(1, Math.round(profile.quality)))}`);
    return fragments.join("&");
  }
  const operation = crop.operation === "fit" ? "fit" : "fill";
  return composeDatQuery({
    focalPoint: crop.focalPoint ?? DEFAULT_FOCAL,
    transform: {
      operation,
      width: w,
      height: Math.max(1, Math.round((w * parsed.h) / parsed.w)),
      aspect: profile.aspectRatio,
      format: profile.format,
      quality: profile.quality,
      extendBackground: crop.extendBackground,
      extendBackgroundColor: crop.extendBackgroundColor,
    },
  });
}

export function joinDatUrl(transformBaseUrl: string, query: string): string {
  const base = stripTrailingSlash(transformBaseUrl.trim());
  if (!base || !query) return base;
  return appendQuery(base, query);
}

export function composeDatUrl(
  transformBaseUrl: string,
  options: {
    focalPoint?: FocalPoint | null;
    transform: TransformSettings;
  }
): string {
  const base = stripTrailingSlash(transformBaseUrl.trim());
  if (!base) return "";

  return joinDatUrl(base, composeDatQuery(options));
}
