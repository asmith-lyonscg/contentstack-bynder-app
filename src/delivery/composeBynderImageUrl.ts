import type { BynderImageSettings, DatFormat, FocalPoint, TransformSettings, ViewportKind } from "../lib/types";
import { composeDatUrl, joinDatUrl, normalizeFocalPoint, physicalTransform } from "../lib/bynder/composeDatUrl";
import { pickBynderAsset } from "../lib/bynder/parseAsset";
import { cropSliceForAsset, savedAssetById } from "../lib/viewportCrop";

export interface ComposeOverrides {
  width?: number;
  height?: number;
  format?: DatFormat | null;
  quality?: number | null;
  viewport?: ViewportKind;
}

/**
 * Recompose a Bynder DAT URL from saved field JSON, optionally overriding
 * width/height/format for a specific breakpoint.
 *
 * Copy this helper into a website codebase, or import the same logic from
 * `src/lib/bynder/composeDatUrl.ts`.
 *
 * Defaults to the desktop crop (`assets[0]`). Pass `{ viewport: "mobile" }` for
 * `assets[n].mobile` when present, otherwise the desktop crop.
 *
 * Presence of `url` means DAT was used at save time. If `url` is omitted, this
 * returns `webImage.url` for CSS crop even when `transformBaseUrl` exists
 * (`enableDat: false` on the field).
 */
export function composeBynderImageUrl(
  settings: BynderImageSettings,
  overrides?: ComposeOverrides,
  transformBaseUrl?: string
): string {
  const viewport = overrides?.viewport ?? "desktop";
  const asset =
    savedAssetById(settings, settings.activeAssetId) ??
    settings.assets?.[0];
  const slice = cropSliceForAsset(
    settings,
    asset?.id,
    viewport,
    settings.transform
  );
  const mobileAsset = viewport === "mobile" ? asset?.mobile?.asset : undefined;
  const base =
    transformBaseUrl ??
    mobileAsset?.transformBaseUrl ??
    (mobileAsset ? undefined : asset?.transformBaseUrl);
  const cssFallback =
    mobileAsset?.webImage?.url ??
    asset?.webImage?.url ??
    pickBynderAsset(settings.assets)?.sourceUrl ??
    "";
  const rawCrop = viewport === "mobile" ? asset?.mobile : asset;
  const legacyUrl = rawCrop && typeof (rawCrop as { url?: unknown }).url === "string";
  const datSaved = Boolean(slice.dat || legacyUrl);
  if (!base || !datSaved) return cssFallback;

  const widthOverridden = overrides?.width != null;
  const heightOverridden = overrides?.height != null;
  const formatOverridden = overrides?.format !== undefined;
  const qualityOverridden = overrides?.quality !== undefined;
  if (!widthOverridden && !heightOverridden && !formatOverridden && !qualityOverridden && slice.dat?.["2x"]) {
    return joinDatUrl(base, slice.dat["2x"]);
  }

  const transform: TransformSettings = {
    ...slice.transform,
    format: overrides?.format !== undefined ? overrides.format : slice.transform.format,
    quality: overrides?.quality !== undefined ? overrides.quality : slice.transform.quality,
  };

  if (widthOverridden && !heightOverridden) {
    transform.width = overrides.width;
    transform.height = null;
  } else if (heightOverridden && !widthOverridden) {
    transform.height = overrides.height;
    transform.width = null;
  } else if (widthOverridden || heightOverridden) {
    if (widthOverridden) transform.width = overrides.width;
    if (heightOverridden) transform.height = overrides.height;
  } else {
    const retina = physicalTransform(transform, 2);
    transform.width = retina.width;
    transform.height = retina.height;
  }

  return composeDatUrl(base, {
    focalPoint: slice.focalPoint,
    transform,
  });
}

export function focalPointToObjectPosition(focalPoint: FocalPoint | null | undefined): string {
  const point = normalizeFocalPoint(focalPoint);
  return `${point.x * 100}% ${point.y * 100}%`;
}
