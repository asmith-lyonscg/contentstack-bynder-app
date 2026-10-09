import type { DatOperation, ExtendBackgroundMode, FocalPoint, ProfileSettings, ViewportKind } from "../lib/types";
import { datQueryForWidth, joinDatUrl, normalizeFocalPoint } from "../lib/bynder/composeDatUrl";
import {
  asProfileSettings,
  originalProfileSettings,
  srcsetWidths,
  viewportImageSize,
  type ViewportImageSize,
} from "../lib/profiles";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export interface BynderImageOptions {
  viewport?: ViewportKind;
  /** Pick an asset by id. Defaults to the first asset. */
  assetId?: string;
}

export interface BynderSourcesOptions extends BynderImageOptions {
  /** srcset steps. Cut at, and always ending with, the viewport `targetWidth`. */
  widths?: readonly number[];
}

export interface BynderSources {
  src: string;
  /** `url 640w, url 960w, …`. Omitted when DAT is off (one `webImage` URL). */
  srcset?: string;
  /**
   * Widest image and its height. Set `width`/`height` attributes from these. Without a profile this is
   * the original aspect ratio, never wider than the original file.
   */
  width?: number;
  height?: number;
  /** CSS `object-position` from the focal point. */
  objectPosition: string;
}

interface ResolvedSlice {
  base?: string;
  webImage?: string;
  focalPoint: FocalPoint;
  operation: DatOperation;
  extendBackground?: ExtendBackgroundMode;
  extendBackgroundColor?: string;
  profile: ProfileSettings;
  image: ViewportImageSize;
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function resolveSlice(value: unknown, options?: BynderImageOptions): ResolvedSlice | undefined {
  const root = asRecord(value);
  const assets = Array.isArray(root?.assets) ? root.assets : [];
  const asset =
    (options?.assetId ? assets.map(asRecord).find((item) => item?.id === options.assetId) : undefined) ??
    asRecord(assets[0]);
  if (!asset) return undefined;

  const viewport = options?.viewport ?? "desktop";
  const mobile = viewport === "mobile" ? asRecord(asset.mobile) : undefined;
  const crop = mobile && (mobile.operation || mobile.focalPoint) ? mobile : asset;
  const file = mobile?.id ? mobile : asset;
  const point = asRecord(crop.focalPoint);
  const operation = crop.operation === "fit" ? "fit" : "fill";
  const nested = asRecord(root?.profile);
  const profile =
    asProfileSettings(nested?.settings) ?? asProfileSettings(root?.profileSettings) ?? originalProfileSettings();
  const image = viewportImageSize(profile[viewport], {
    originalAssetWidth: positive(file.originalAssetWidth),
    originalAssetHeight: positive(file.originalAssetHeight),
    aspectRatio: asString(file.aspectRatio),
  });
  return {
    base: asString(file.transformBaseUrl),
    webImage: asString(asRecord(file.webImage)?.url),
    focalPoint: normalizeFocalPoint({ x: Number(point?.x ?? 0.5), y: Number(point?.y ?? 0.5) }),
    operation,
    extendBackground: asString(crop.extendBackground) as ExtendBackgroundMode | undefined,
    extendBackgroundColor: asString(crop.extendBackgroundColor),
    profile,
    image,
  };
}

/** DAT is used when the file has a `transformBaseUrl` and no `webImage` (the entry saves `webImage` only without DAT). */
function urlForWidth(slice: ResolvedSlice, width: number): string | undefined {
  if (!slice.base || slice.webImage) return undefined;
  return joinDatUrl(
    slice.base,
    datQueryForWidth(
      {
        focalPoint: slice.focalPoint,
        operation: slice.operation,
        extendBackground: slice.extendBackground,
        extendBackgroundColor: slice.extendBackgroundColor,
      },
      { aspectRatio: slice.image.aspectRatio, format: slice.profile.format, quality: slice.profile.quality },
      width
    )
  );
}

/**
 * One image URL `width` pixels wide (default: the widest image for the viewport), from saved field JSON.
 * Without DAT this returns the `webImage` URL.
 */
export function composeBynderImageUrl(value: unknown, options?: BynderImageOptions & { width?: number }): string {
  const slice = resolveSlice(value, options);
  if (!slice) return "";
  const width = options?.width ?? slice.image.width;
  return urlForWidth(slice, width) ?? slice.webImage ?? "";
}

/**
 * `src`, `srcset`, and intrinsic size for one viewport. Default widths are 640, 960, 1280, 1600, 1920, …
 * up to and including the widest image: the profile `targetWidth`, or without a profile the smaller of
 * `targetWidth` and the original width. `src` is that widest image.
 */
export function buildBynderSources(value: unknown, options?: BynderSourcesOptions): BynderSources | undefined {
  const slice = resolveSlice(value, options);
  if (!slice) return undefined;
  const objectPosition = focalPointToObjectPosition(slice.focalPoint);
  const src = urlForWidth(slice, slice.image.width);
  if (!src) {
    return slice.webImage ? { src: slice.webImage, objectPosition } : undefined;
  }
  const srcset = srcsetWidths(slice.image.width, options?.widths)
    .map((width) => `${urlForWidth(slice, width)} ${width}w`)
    .join(", ");
  return {
    src,
    srcset,
    width: slice.image.width,
    ...(slice.image.height ? { height: slice.image.height } : {}),
    objectPosition,
  };
}

export function focalPointToObjectPosition(focalPoint: FocalPoint | null | undefined): string {
  const point = normalizeFocalPoint(focalPoint);
  return `${point.x * 100}% ${point.y * 100}%`;
}
