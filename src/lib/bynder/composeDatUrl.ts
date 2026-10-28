import type { FocalPoint, ProfileSettings, TransformSettings } from "../types";

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

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function appendQuery(baseUrl: string, query: string): string {
  if (!query) return baseUrl;
  const hasQuery = baseUrl.includes("?");
  return `${baseUrl}${hasQuery ? "&" : "?"}${query}`;
}

function buildIoParam(width?: number, height?: number): string {
  const parts = ["transform:fill"];
  if (width) parts.push(`width:${width}`);
  if (height) parts.push(`height:${height}`);
  return `io=${parts.join(",")}`;
}

/** Query string only. Join with `transformBaseUrl` at delivery time. */
export function composeDatQuery(options: {
  focalPoint?: FocalPoint | null;
  transform: TransformSettings;
  /** Left-right mirror, applied after Fill so the focal point still refers to the original. */
  mirror?: boolean;
}): string {
  const { width, height } = resolveDimensions(options.transform);
  const focal = options.focalPoint ? normalizeFocalPoint(options.focalPoint) : null;
  const fragments: string[] = [buildIoParam(width, height)];
  if (options.mirror) fragments.push("io=transform:mirror");
  if (focal) fragments.push(`focuspoint=${focal.x},${focal.y}`);
  const format = options.transform.format;
  if (format) fragments.push(`format=${format}`);
  const quality = POSITIVE(options.transform.quality);
  if (quality && format !== "png") fragments.push(`quality=${Math.min(100, quality)}`);
  return fragments.join("&");
}

/** Focal point for one DAT request. A missing point is the center. */
export interface DatCrop {
  focalPoint?: FocalPoint | null;
  mirror?: boolean;
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
    const fragments = [`io=transform:scale,width:${w}`];
    if (crop.mirror) fragments.push("io=transform:mirror");
    fragments.push(`format=${profile.format}`);
    if (profile.format !== "png") fragments.push(`quality=${Math.min(100, Math.max(1, Math.round(profile.quality)))}`);
    return fragments.join("&");
  }
  return composeDatQuery({
    focalPoint: crop.focalPoint ?? DEFAULT_FOCAL,
    mirror: crop.mirror,
    transform: {
      operation: "fill",
      width: w,
      height: Math.max(1, Math.round((w * parsed.h) / parsed.w)),
      aspect: profile.aspectRatio,
      format: profile.format,
      quality: profile.quality,
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
    mirror?: boolean;
  }
): string {
  const base = stripTrailingSlash(transformBaseUrl.trim());
  if (!base) return "";

  return joinDatUrl(base, composeDatQuery(options));
}
