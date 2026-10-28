import type { FocalPoint, ProfileSettings, ViewportKind } from "../lib/types";
import { datQueryForWidth, joinDatUrl, normalizeFocalPoint } from "../lib/bynder/composeDatUrl";
import {
  asProfileSettings,
  heightForWidth,
  originalProfileSettings,
  srcsetWidths,
  viewportImageSize,
  widthWithinMaxDimension,
  type ViewportImageSize,
} from "../lib/profiles";
import { DEFAULT_MAX_DIMENSION } from "../lib/types";

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
  /** srcset steps. Each is capped so neither side passes `maxDimension`. Default is the standard ladder. */
  widths?: readonly number[];
}

export interface BynderSources {
  src: string;
  /** `url 640w, url 960w, …`. Omitted when DAT is off (one `webImage` URL). */
  srcset?: string;
  /**
   * Largest requested file after the max-dimension cap, and its height at the aspect ratio.
   * Set the `img` `width` and `height` from these. They are not the CSS display size.
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
  mirror: boolean;
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
  const crop = mobile && (mobile.operation || mobile.focalPoint || mobile.mirror === true) ? mobile : asset;
  const file = mobile?.id ? mobile : asset;
  const point = asRecord(crop.focalPoint);
  const nested = asRecord(root?.profile);
  const profile = asProfileSettings(nested?.settings) ?? originalProfileSettings();
  const image = viewportImageSize(profile[viewport], {
    origWidth: positive(file.origWidth),
    origHeight: positive(file.origHeight),
  });
  return {
    base: asString(file.transformBaseUrl),
    webImage: asString(asRecord(file.webImage)?.url),
    focalPoint: normalizeFocalPoint({ x: Number(point?.x ?? 0.5), y: Number(point?.y ?? 0.5) }),
    mirror: crop.mirror === true,
    profile,
    image,
  };
}

/** DAT is used when the file has a `transformBaseUrl`. `webImage` is only a fallback when it does not. */
function urlForWidth(slice: ResolvedSlice, width: number): string | undefined {
  if (!slice.base) return undefined;
  return joinDatUrl(
    slice.base,
    datQueryForWidth(
      {
        focalPoint: slice.focalPoint,
        mirror: slice.mirror,
      },
      { aspectRatio: slice.image.aspectRatio, format: slice.profile.format, quality: slice.profile.quality },
      width
    )
  );
}

/**
 * One image URL `width` pixels wide, from saved field JSON. The width is capped so neither side
 * passes `maxDimension`. Without a transform URL this returns `webImage`.
 */
export function composeBynderImageUrl(value: unknown, options?: BynderImageOptions & { width?: number }): string {
  const slice = resolveSlice(value, options);
  if (!slice) return "";
  const maxDimension = slice.profile.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const widths = srcsetWidths(slice.image.aspectRatio, maxDimension);
  const requested = options?.width ?? widths[widths.length - 1];
  if (!requested) return slice.webImage ?? "";
  const width = widthWithinMaxDimension(requested, slice.image.aspectRatio, maxDimension);
  return urlForWidth(slice, width) ?? slice.webImage ?? "";
}

/**
 * `src`, `srcset`, and intrinsic size for one viewport. Widths default to 640, 960, 1280, 1600, 1920, …
 * and each is capped so neither side passes `maxDimension`. `src` is the largest of those.
 */
export function buildBynderSources(value: unknown, options?: BynderSourcesOptions): BynderSources | undefined {
  const slice = resolveSlice(value, options);
  if (!slice) return undefined;
  const objectPosition = focalPointToObjectPosition(slice.focalPoint, slice.mirror);
  const maxDimension = slice.profile.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const widths = srcsetWidths(slice.image.aspectRatio, maxDimension, options?.widths);
  const widest = widths[widths.length - 1];
  const src = widest ? urlForWidth(slice, widest) : undefined;
  if (!src || !widest) {
    return slice.webImage ? { src: slice.webImage, objectPosition } : undefined;
  }
  const srcset = widths.map((width) => `${urlForWidth(slice, width)} ${width}w`).join(", ");
  return {
    src,
    srcset,
    width: widest,
    ...(slice.image.aspectRatio
      ? { height: heightForWidth(slice.image.aspectRatio, widest) }
      : {}),
    objectPosition,
  };
}

export function focalPointToObjectPosition(focalPoint: FocalPoint | null | undefined, mirror = false): string {
  const point = normalizeFocalPoint(focalPoint);
  const x = mirror ? 1 - point.x : point.x;
  return `${x * 100}% ${point.y * 100}%`;
}
