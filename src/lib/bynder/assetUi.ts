import {
  DEFAULT_FOCAL_POINT,
  DEFAULT_TRANSFORM,
  type AssetCropSettings,
  type FocalPoint,
  type ParsedBynderAsset,
  type TransformSettings,
} from "../types";
import { composeDatUrl, normalizeFocalPoint } from "./composeDatUrl";

export const LIST_THUMB_MOBILE = { width: 200, height: 200 };
export const LIST_THUMB_DESKTOP = { width: 300, height: 200 };
export const LIST_THUMB_SLOT = LIST_THUMB_MOBILE;

export interface ListThumb {
  url: string;
  width: number;
  height: number;
  objectPosition: string;
  caption?: string;
}

export interface AssetListThumbs {
  desktop: ListThumb;
  mobile: ListThumb;
}

function objectPosition(focal: FocalPoint): string {
  const point = normalizeFocalPoint(focal);
  return `${point.x * 100}% ${point.y * 100}%`;
}

/** List-row thumbnail: DAT URL when available, otherwise the original. */
export function listThumbForAsset(input: {
  asset: ParsedBynderAsset;
  crop?: AssetCropSettings;
  live?: {
    focalPoint: FocalPoint;
    transform: TransformSettings;
    datEnabled?: boolean;
    url?: string;
  };
  datAllowed: boolean;
  fallbackTransform?: TransformSettings;
  slot?: { width: number; height: number };
}): ListThumb {
  const transform = input.live?.transform ?? input.crop?.transform ?? input.fallbackTransform;
  const focal = input.live?.focalPoint ?? input.crop?.focalPoint ?? DEFAULT_FOCAL_POINT;
  const datOn = Boolean(input.datAllowed && input.asset.transformBaseUrl);
  const size = input.slot ?? LIST_THUMB_SLOT;
  const caption = thumbCaption({
    width: transform?.width ?? input.asset.width,
    height: transform?.height ?? input.asset.height,
    format: datOn ? transform?.format : input.asset.fileType,
    fileType: input.asset.fileType,
    fileSize: input.asset.fileSize,
  });

  if (datOn && input.asset.transformBaseUrl) {
    const url =
      input.live?.url ||
      composeDatUrl(input.asset.transformBaseUrl, {
        focalPoint: focal,
        transform: transform ?? DEFAULT_TRANSFORM,
      });
    return { ...size, url, objectPosition: "50% 50%", caption };
  }

  return {
    ...size,
    url: input.asset.sourceUrl,
    objectPosition: objectPosition(focal),
    caption,
  };
}

export function formatFileType(value?: string | null): string | undefined {
  if (!value) return undefined;
  const raw = value.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "jpeg") return "JPG";
  if (raw === "jpg") return "JPG";
  if (raw === "png") return "PNG";
  if (raw === "webp") return "WebP";
  if (raw === "avif") return "AVIF";
  if (raw === "gif") return "GIF";
  return raw.toUpperCase();
}

export function thumbCaption(input: {
  width?: number | null;
  height?: number | null;
  format?: string | null;
  fileType?: string | null;
  fileSize?: number;
}): string | undefined {
  const parts: string[] = [];
  if (input.width && input.height) parts.push(`${Math.round(input.width)} × ${Math.round(input.height)}`);
  const type = formatFileType(input.format) ?? formatFileType(input.fileType);
  if (type) parts.push(type);
  const size = formatFileSize(input.fileSize);
  if (size) parts.push(size);
  return parts.length ? parts.join(" · ") : undefined;
}

export function moveAsset<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  const from = list.findIndex((item) => item.id === fromId);
  const to = list.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function bynderMediaUrl(portalUrl: string, asset: Pick<ParsedBynderAsset, "id" | "databaseId">): string {
  const mediaId = asset.databaseId ?? asset.id;
  const host = portalUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${host}/media/?mediaId=${encodeURIComponent(mediaId)}`;
}

export function formatFileSize(bytes?: number): string | undefined {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
