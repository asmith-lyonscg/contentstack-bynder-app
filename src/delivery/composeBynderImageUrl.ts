import type { BynderImageSettings, DatFormat, FocalPoint, TransformSettings } from "../lib/types";
import { composeDatUrl, normalizeFocalPoint } from "../lib/bynder/composeDatUrl";

export interface ComposeOverrides {
  width?: number;
  height?: number;
  format?: DatFormat | null;
  quality?: number | null;
}

/**
 * Recompose a Bynder DAT URL from saved field JSON, optionally overriding
 * width/height/format for a specific breakpoint.
 *
 * Copy this helper into a website codebase, or import the same logic from
 * `src/lib/bynder/composeDatUrl.ts`.
 */
export function composeBynderImageUrl(
  settings: BynderImageSettings,
  overrides?: ComposeOverrides,
  transformBaseUrl = settings.transformBaseUrl
): string {
  if (settings.datEnabled === false || !transformBaseUrl) {
    return settings.sourceUrl ?? settings.url ?? "";
  }

  const widthOverridden = overrides?.width != null;
  const heightOverridden = overrides?.height != null;

  const transform: TransformSettings = {
    ...settings.transform,
    format: overrides?.format !== undefined ? overrides.format : settings.transform.format,
    quality: overrides?.quality !== undefined ? overrides.quality : settings.transform.quality,
  };

  if (widthOverridden && !heightOverridden) {
    transform.width = overrides.width;
    transform.height = null;
  } else if (heightOverridden && !widthOverridden) {
    transform.height = overrides.height;
    transform.width = null;
  } else {
    if (widthOverridden) transform.width = overrides.width;
    if (heightOverridden) transform.height = overrides.height;
  }

  return composeDatUrl(transformBaseUrl, {
    focalPoint: settings.focalPoint,
    transform,
  });
}

export function focalPointToObjectPosition(focalPoint: FocalPoint | null | undefined): string {
  const point = normalizeFocalPoint(focalPoint);
  return `${point.x * 100}% ${point.y * 100}%`;
}
