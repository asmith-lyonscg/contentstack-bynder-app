import { DEFAULT_FOCAL_POINT } from "./types";
import type {
  AssetCropSettings,
  BynderImageSettings,
  SavedBynderAsset,
  TransformSettings,
  ViewportCropSettings,
  ViewportKind,
} from "./types";

export function resolveActiveViewport(settings: Pick<BynderImageSettings, "activeViewport">): ViewportKind {
  return settings.activeViewport === "mobile" ? "mobile" : "desktop";
}

export function savedAssetById(
  settings: Pick<BynderImageSettings, "assets">,
  assetId?: string
): SavedBynderAsset | undefined {
  if (!assetId || !settings.assets?.length) return undefined;
  return settings.assets.find((asset) => asset.id === assetId);
}

export function viewportCrop(
  crop: AssetCropSettings | undefined,
  viewport: ViewportKind
): ViewportCropSettings | undefined {
  if (!crop) return undefined;
  if (viewport === "mobile") return crop.mobile ?? crop;
  return {
    focalPoint: crop.focalPoint,
    transform: crop.transform,
    url: crop.url,
  };
}

export function cropSliceForAsset(
  settings: BynderImageSettings,
  assetId: string | undefined,
  viewport: ViewportKind,
  fallbackTransform: TransformSettings
): ViewportCropSettings {
  const activeId = settings.activeAssetId;
  const activeViewport = resolveActiveViewport(settings);
  const live: ViewportCropSettings = {
    focalPoint: settings.focalPoint,
    transform: settings.transform,
  };

  if (!assetId) return live;

  if (assetId === activeId && activeViewport === viewport) return live;

  const stored = viewportCrop(savedAssetById(settings, assetId), viewport);
  if (stored) return stored;

  if (viewport === "mobile") {
    return cropSliceForAsset(settings, assetId, "desktop", fallbackTransform);
  }

  if (assetId === activeId) return live;

  return {
    focalPoint: { ...DEFAULT_FOCAL_POINT },
    transform: { ...fallbackTransform },
  };
}

export function withoutMobileCrop(crop: AssetCropSettings | undefined): AssetCropSettings | undefined {
  if (!crop) return undefined;
  const { mobile: _mobile, ...desktop } = crop;
  return desktop;
}

function normalizeTransform(transform: TransformSettings): Record<string, unknown> {
  return {
    operation: transform.operation,
    width: transform.width ?? null,
    height: transform.height ?? null,
    aspect: transform.aspect || null,
    format: transform.format ?? null,
    quality: transform.quality ?? null,
    extraQuery: transform.extraQuery || "",
  };
}

/** True when mobile still follows desktop (no separate mobile crop). */
export function viewportCropsEqual(a: ViewportCropSettings, b: ViewportCropSettings): boolean {
  return (
    Math.round(a.focalPoint.x * 1000) === Math.round(b.focalPoint.x * 1000) &&
    Math.round(a.focalPoint.y * 1000) === Math.round(b.focalPoint.y * 1000) &&
    JSON.stringify(normalizeTransform(a.transform)) === JSON.stringify(normalizeTransform(b.transform))
  );
}

/** Drop `mobile` when it still matches desktop. Presence of `mobile` means unmatched. */
export function stripMatchingMobile<T extends AssetCropSettings>(crop: T): T {
  if (crop.mobile && !viewportCropsEqual(crop, crop.mobile)) return crop;
  const { mobile: _mobile, ...desktop } = crop;
  return desktop as T;
}

/** Drop desktop/mobile split so the payload is one crop per asset. */
export function withoutDesktopMobile(settings: BynderImageSettings): BynderImageSettings {
  const next: BynderImageSettings = { ...settings };
  delete next.activeViewport;
  if (!settings.assets?.length) return next;
  next.assets = settings.assets.map((asset) => {
    const { mobile: _mobile, ...rest } = asset;
    return rest;
  });
  return next;
}
