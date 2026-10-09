import { applyCropConfig, applyCropConfigToAssets, withActiveProfile } from "./fieldConfig";
import { buildSettingsPayload, parseSavedSettings, persistedPayload } from "./settings";
import type { AdditionalFieldDefinition, BynderImageSettings, CropFieldConfig } from "./types";
import { withoutDesktopMobile } from "./viewportCrop";

export interface HydrateOptions {
  cropConfig: CropFieldConfig;
  enableDat: boolean;
  omitWebImage?: boolean;
  omitName?: boolean;
  authorFields?: readonly Pick<AdditionalFieldDefinition, "property" | "type">[];
}

export interface HydrateResult {
  settings: BynderImageSettings;
  changed: boolean;
  /** `cropConfig` pointed at the entry's profile. */
  cropConfig: CropFieldConfig;
  /** Saved profile name App Config no longer defines. Its saved snapshot is kept. */
  missingProfile?: string;
}

/** JSON with object keys sorted, so key order never counts as a change. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item as Record<string, unknown>).sort().map((k) => [k, (item as Record<string, unknown>)[k]]));
  });
}

function isEmptyValue(raw: unknown): boolean {
  if (raw == null || raw === "") return true;
  if (Array.isArray(raw)) return raw.length === 0;
  if (typeof raw !== "object") return false;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => key !== "v");
  if (!keys.length) return true;
  return !Array.isArray(record.assets) || record.assets.length === 0;
}

/**
 * The saved profile when this field still allows it. A name App Config dropped keeps the saved
 * snapshot. Anything else falls back to the field's default profile.
 */
export function resolveEntryProfile(
  saved: Pick<BynderImageSettings, "profile" | "profileSettings">,
  crop: CropFieldConfig
): { cropConfig: CropFieldConfig; missingProfile?: string } {
  const name = saved.profile;
  if (name && crop.profiles[name] && crop.allowedProfiles.includes(name)) {
    return { cropConfig: withActiveProfile(crop, name) };
  }
  if (name && !crop.profiles[name] && saved.profileSettings) {
    return { cropConfig: withActiveProfile(crop, name, saved.profileSettings), missingProfile: name };
  }
  return { cropConfig: withActiveProfile(crop, crop.defaultProfile) };
}

/**
 * Normalizes a stored field value exactly the way a save would, and reports
 * whether that differs from what is stored. `changed` is true only when the
 * current field/app config (or a legacy shape) produces a different payload.
 */
export function hydrateFieldValue(raw: unknown, options: HydrateOptions): HydrateResult {
  const saved = parseSavedSettings(raw);
  const { cropConfig, missingProfile } = resolveEntryProfile(saved, options.cropConfig);
  const desktopMobileMode = cropConfig.desktopMobileMode !== false;
  const assets = applyCropConfigToAssets(saved.assets, cropConfig);
  const built = buildSettingsPayload(
    {
      ...saved,
      transform: applyCropConfig(saved.transform, cropConfig, "desktop"),
      assets,
    },
    {
      assets,
      activeAssetId: undefined,
      activeViewport: undefined,
      profile: cropConfig.profile,
      profileSettings: cropConfig.active,
      enableDat: options.enableDat,
      omitWebImage: options.omitWebImage,
      omitName: options.omitName,
      authorFields: options.authorFields,
    }
  );
  const settings = desktopMobileMode ? built : withoutDesktopMobile(built);
  const next = persistedPayload(settings);
  const result: HydrateResult = { settings, changed: false, cropConfig };
  if (missingProfile) result.missingProfile = missingProfile;
  result.changed = isEmptyValue(raw)
    ? Array.isArray(next.assets) && next.assets.length > 0
    : stableStringify(next) !== stableStringify(raw);
  return result;
}
