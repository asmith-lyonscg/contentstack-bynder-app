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
  const { mobile: _mobile, differentMobileAsset: _flag, ...desktop } = crop;
  return desktop;
}

/** Only the author's choices. Size, aspect, format, and quality come from the profile per viewport. */
function normalizeTransform(transform: TransformSettings): Record<string, unknown> {
  const operation = transform.operation === "fit" ? "fit" : "fill";
  const fit = operation === "fit";
  const background = fit ? transform.extendBackground || "auto" : null;
  return {
    operation,
    background,
    color: background === "custom" ? transform.extendBackgroundColor ?? "" : null,
  };
}

/** True when mobile still follows desktop (no separate mobile crop). */
export function viewportCropsEqual(a: ViewportCropSettings, b: ViewportCropSettings): boolean {
  const ax = a.focalPoint?.x ?? 0.5;
  const ay = a.focalPoint?.y ?? 0.5;
  const bx = b.focalPoint?.x ?? 0.5;
  const by = b.focalPoint?.y ?? 0.5;
  if (!a.transform || !b.transform) return !a.transform && !b.transform && ax === bx && ay === by;
  return (
    Math.round(ax * 1000) === Math.round(bx * 1000) &&
    Math.round(ay * 1000) === Math.round(by * 1000) &&
    JSON.stringify(normalizeTransform(a.transform)) === JSON.stringify(normalizeTransform(b.transform))
  );
}

/**
 * Drop `mobile` when it still matches desktop. Presence of `mobile` means unmatched.
 * A "different" mobile file that is the desktop file with the same crop and alt is relinked.
 */
export function stripMatchingMobile<T extends AssetCropSettings & { id?: string }>(crop: T): T {
  const mobile = crop.mobile;
  if (!mobile) return crop;
  const sameFile = mobile.id ? mobile.id === crop.id : !crop.differentMobileAsset;
  if (!sameFile || !viewportCropsEqual(crop, mobile)) return crop;
  if (mobile.id && mobile.alt && mobile.alt !== (crop.alt ?? "")) return crop;
  const { mobile: _mobile, differentMobileAsset: _flag, ...desktop } = crop;
  return desktop as T;
}

/** Drop desktop/mobile split so the payload is one crop per asset. */
export function withoutDesktopMobile(settings: BynderImageSettings): BynderImageSettings {
  const next: BynderImageSettings = { ...settings };
  delete next.activeViewport;
  if (!settings.assets?.length) return next;
  next.assets = settings.assets.map((asset) => {
    const { mobile: _mobile, differentMobileAsset: _flag, ...rest } = asset;
    return rest;
  });
  return next;
}
