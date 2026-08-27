import type { FocalPoint, TransformSettings } from "../types";

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

/** Authoritative CSS crop box: aspect wins for shape; width (then height) sets size. */
export function cssCropBox(transform: TransformSettings): { width: number; height: number } {
  const aspect = parseAspect(transform.aspect);
  let width = POSITIVE(transform.width);
  let height = POSITIVE(transform.height);

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

function buildIoParam(operation: string, width?: number, height?: number): string {
  const parts = [`transform:${operation}`];
  if (width) parts.push(`width:${width}`);
  if (height) parts.push(`height:${height}`);
  return `io=${parts.join(",")}`;
}

function sanitizeExtraQuery(extra: string | null | undefined): string {
  if (!extra) return "";
  return extra
    .trim()
    .replace(/^[?&]+/, "")
    .replace(/^\/+/, "");
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

  const { width, height } = resolveDimensions(options.transform);
  const operation = options.transform.operation || "fill";
  const fragments: string[] = [buildIoParam(operation, width, height)];

  const focal = options.focalPoint ? normalizeFocalPoint(options.focalPoint) : null;
  if (focal) {
    fragments.push(`focuspoint=${focal.x},${focal.y}`);
  }

  const format = options.transform.format;
  if (format) {
    fragments.push(`format=${format}`);
  }

  const quality = POSITIVE(options.transform.quality);
  if (quality && format !== "png") {
    fragments.push(`quality=${Math.min(100, quality)}`);
  }

  const extra = sanitizeExtraQuery(options.transform.extraQuery);
  if (extra) {
    fragments.push(extra);
  }

  return appendQuery(base, fragments.join("&"));
}
