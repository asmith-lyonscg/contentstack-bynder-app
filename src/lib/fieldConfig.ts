import { resolveCompactViewConfig as resolveCompactViewOptions } from "./compactOptions";
import type {
  AdditionalFieldDefinition,
  AssetCropSettings,
  CompactViewConfig,
  CropFieldConfig,
  OriginalAssetSize,
  ParsedBynderAsset,
  ProfileSettings,
  SavedBynderAsset,
  TransformSettings,
  VideoFieldVisibility,
  VideoPlayback,
  ViewportKind,
} from "./types";
import { DEFAULT_FOCAL_POINT, DEFAULT_TRANSFORM } from "./types";
import { isDocumentAsset, parseBynderAsset } from "./bynder/parseAsset";
import {
  applyProfileTransform,
  originalProfileSettings,
  profileSettingsFrom,
  resolveProfiles,
  viewportAssetSize,
} from "./profiles";
import { stripMatchingMobile } from "./viewportCrop";

export { parseDatFormat } from "./profiles";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string" && value.trim()) {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

/**
 * Contentstack may give the Config Parameter as a JSON string, or nest it on
 * the field schema (`config` / `field_metadata.config`) instead of at the root.
 */
export function normalizeFieldConfig(raw: unknown): Record<string, unknown> | undefined {
  const record = parseJsonObject(raw);
  if (!record) return undefined;

  const inner =
    parseJsonObject(record.config) ??
    parseJsonObject(asRecord(record.field_metadata)?.config) ??
    parseJsonObject(record.fieldConfig);

  const looksLikeSchema = Boolean(
    record.data_type || record.extension_uid || (record.uid && record.field_metadata)
  );
  if (inner && looksLikeSchema) return inner;
  if (!inner) return record;
  return {
    ...inner,
    ...record,
    advanced: asRecord(record.advanced) ?? asRecord(inner.advanced),
    custom_settings: asRecord(record.custom_settings) ?? asRecord(inner.custom_settings),
  };
}

export function readFieldConfig(customField: unknown): Record<string, unknown> | undefined {
  if (!customField || typeof customField !== "object") return undefined;
  const location = customField as Record<string, unknown>;
  const field = location.field as Record<string, unknown> | undefined;
  const schema = field?.schema as Record<string, unknown> | undefined;
  const metadata = asRecord(schema?.field_metadata) ?? asRecord(field?.field_metadata);
  const parts = [
    schema?.config,
    metadata?.config,
    field?.config,
    location.fieldConfig,
  ]
    .map(normalizeFieldConfig)
    .filter((part): part is Record<string, unknown> => Boolean(part));
  if (!parts.length) return undefined;
  return Object.assign({}, ...parts);
}

function pickUid(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.bynderFieldUid === "string" && record.bynderFieldUid.trim()) {
    return record.bynderFieldUid.trim();
  }
  const custom = asRecord(record.custom_settings);
  if (custom && typeof custom.bynderFieldUid === "string" && custom.bynderFieldUid.trim()) {
    return custom.bynderFieldUid.trim();
  }
  return undefined;
}

function pickBool(value: unknown, key: string): boolean | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const direct = coerceBool(record[key]);
  if (direct !== undefined) return direct;
  const custom = asRecord(record.custom_settings);
  if (custom) return coerceBool(custom[key]);
  return undefined;
}

function coerceBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return undefined;
}

function pickString(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const direct = record[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const custom = asRecord(record.custom_settings);
  if (custom && typeof custom[key] === "string" && custom[key].trim()) {
    return (custom[key] as string).trim();
  }
  return undefined;
}

function pickShowFlag(
  fieldConfig: unknown,
  appConfig: unknown,
  showKeys: string[],
  hideKeys: string[],
  defaultShow: boolean
): boolean {
  for (const source of [fieldConfig, appConfig]) {
    for (const key of showKeys) {
      const value = pickBool(source, key);
      if (value !== undefined) return value;
    }
    for (const key of hideKeys) {
      const value = pickBool(source, key);
      if (value !== undefined) return !value;
    }
  }
  return defaultShow;
}

export function resolveBynderFieldUid(fieldConfig: unknown, appConfig: unknown): string | undefined {
  return pickUid(fieldConfig) ?? pickUid(appConfig);
}

export function normalizeBynderPortalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

export function resolveBynderPortalUrl(fieldConfig: unknown, appConfig: unknown): string | undefined {
  return (
    normalizeBynderPortalUrl(pickString(fieldConfig, "bynderPortalUrl")) ??
    normalizeBynderPortalUrl(pickString(appConfig, "bynderPortalUrl"))
  );
}

export function resolveCompactViewConfig(fieldConfig: unknown, appConfig: unknown): CompactViewConfig {
  return {
    ...resolveCompactViewOptions(fieldConfig, appConfig),
    portalUrl: resolveBynderPortalUrl(fieldConfig, appConfig),
  };
}

/** Field Config Parameter wins over App Configuration. Default: DAT on. */
export function resolveEnableDat(fieldConfig: unknown, appConfig: unknown): boolean {
  return pickBool(fieldConfig, "enableDat") ?? pickBool(appConfig, "enableDat") ?? true;
}

export function resolveCropConfig(fieldConfig: unknown, appConfig: unknown): CropFieldConfig {
  const desktopMobileMode =
    pickBool(fieldConfig, "desktopMobileMode") ??
    pickBool(fieldConfig, "desktopMobile") ??
    pickBool(appConfig, "desktopMobileMode") ??
    pickBool(appConfig, "desktopMobile") ??
    true;
  const { profiles, allowed, defaultProfile, allowOriginal, profileLocked, maxWidths } = resolveProfiles(
    fieldConfig,
    appConfig
  );
  return {
    profiles,
    allowedProfiles: allowed,
    defaultProfile,
    allowOriginal,
    profileLocked,
    maxWidths,
    profile: defaultProfile,
    active: defaultProfile ? profileSettingsFrom(profiles[defaultProfile]) : originalProfileSettings(maxWidths),
    showOperation: pickShowFlag(
      fieldConfig,
      appConfig,
      ["showFieldOperation", "showOperation"],
      ["hideOperation"],
      true
    ),
    allowFit: pickBool(fieldConfig, "allowFit") ?? pickBool(appConfig, "allowFit") ?? false,
    desktopMobileMode,
  };
}

/**
 * Point the config at the entry's profile. Undefined means the original aspect ratio. A name App
 * Config no longer defines keeps `snapshot` (the entry's saved `profileSettings`) so existing crops
 * keep their size.
 */
export function withActiveProfile(
  crop: CropFieldConfig,
  name: string | undefined,
  snapshot?: ProfileSettings
): CropFieldConfig {
  if (!name) return { ...crop, profile: undefined, active: originalProfileSettings(crop.maxWidths) };
  const defined = crop.profiles[name];
  if (defined) return { ...crop, profile: name, active: profileSettingsFrom(defined) };
  if (snapshot) return { ...crop, profile: name, active: snapshot };
  return crop;
}

/**
 * The profile sets size, aspect, format, and quality. The author keeps operation and letterbox.
 * `size` is the original file size, used when there is no profile aspect ratio.
 */
export function applyCropConfig(
  transform: TransformSettings,
  crop: CropFieldConfig,
  viewport: ViewportKind = "desktop",
  size?: OriginalAssetSize
): TransformSettings {
  return applyProfileTransform(
    transform,
    crop.active,
    viewport,
    crop.desktopMobileMode !== false,
    size,
    crop.allowFit
  );
}

/** New asset: centered focal point, Fill. Mobile follows desktop until edited. */
export function seedAssetCrop(crop: CropFieldConfig, size?: OriginalAssetSize): AssetCropSettings {
  return {
    focalPoint: { ...DEFAULT_FOCAL_POINT },
    transform: applyCropConfig({ ...DEFAULT_TRANSFORM }, crop, "desktop", size),
  };
}

export function applyCropConfigToAssetCrop<T extends AssetCropSettings & OriginalAssetSize & { id?: string }>(
  assetCrop: T,
  crop: CropFieldConfig
): T {
  if (isDocumentAsset(assetCrop as unknown as SavedBynderAsset)) return assetCrop;
  const next: T = {
    ...assetCrop,
    transform: applyCropConfig(assetCrop.transform ?? DEFAULT_TRANSFORM, crop, "desktop", assetCrop),
  };
  if (crop.desktopMobileMode === false) {
    const { mobile: _mobile, differentMobileAsset: _flag, ...desktop } = next;
    return desktop as T;
  }
  if (assetCrop.mobile) {
    next.mobile = {
      ...assetCrop.mobile,
      transform: applyCropConfig(
        assetCrop.mobile.transform ?? DEFAULT_TRANSFORM,
        crop,
        "mobile",
        viewportAssetSize(assetCrop, "mobile")
      ),
    };
  }
  return stripMatchingMobile(next);
}

export function applyCropConfigToAssets(
  assets: SavedBynderAsset[] | undefined,
  crop: CropFieldConfig
): SavedBynderAsset[] | undefined {
  if (!assets?.length) return undefined;
  return assets.map((asset) => (isDocumentAsset(asset) ? asset : applyCropConfigToAssetCrop(asset, crop)));
}

export function readValueAtUid(data: unknown, uid: string): unknown {
  if (!data || !uid) return undefined;
  const parts = uid.split(".").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    const record = asRecord(current);
    if (!record || !Object.prototype.hasOwnProperty.call(record, part)) return undefined;
    current = record[part];
  }
  return current;
}

export function hasOwnPath(data: unknown, uid: string): boolean {
  if (!data || !uid) return false;
  const parts = uid.split(".").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    const record = asRecord(current);
    if (!record || !Object.prototype.hasOwnProperty.call(record, part)) return false;
    current = record[part];
  }
  return true;
}

export function liveSiblingRaw(uid: string, liveEntry: unknown): { present: boolean; value: unknown } {
  if (liveEntry == null || !uid) return { present: false, value: undefined };
  if (hasOwnPath(liveEntry, uid)) return { present: true, value: readValueAtUid(liveEntry, uid) };
  const lastSegment = uid.split(".").pop();
  if (lastSegment && lastSegment !== uid && hasOwnPath(liveEntry, lastSegment)) {
    return { present: true, value: readValueAtUid(liveEntry, lastSegment) };
  }
  return { present: false, value: undefined };
}

/**
 * Sibling Bynder JSON is often missing/empty on entry.onChange when THIS
 * custom field saves. Those empties must never unmount an existing preview.
 * Real removes are delivered as $extensionFieldChange / field.onChange.
 */
export type SiblingAssetResult =
  | { type: "apply"; asset: ParsedBynderAsset }
  | { type: "keep" }
  | { type: "clear" };

export function resolveSiblingAsset(options: {
  uid: string;
  liveEntry?: unknown;
  fieldData?: unknown;
  fieldEventData?: unknown;
  writingSelf?: boolean;
  current?: ParsedBynderAsset | null;
}): SiblingAssetResult {
  const { uid, liveEntry, fieldData, fieldEventData, writingSelf, current = null } = options;

  if (fieldEventData !== undefined) {
    if (writingSelf) {
      const parsed = parseBynderAsset(fieldEventData) ?? parseBynderAsset(fieldData);
      if (parsed) return { type: "apply", asset: parsed };
      return current ? { type: "keep" } : { type: "clear" };
    }
    const parsed = parseBynderAsset(fieldEventData);
    return parsed ? { type: "apply", asset: parsed } : { type: "clear" };
  }

  const fromField = parseBynderAsset(fieldData);
  const live = liveSiblingRaw(uid, liveEntry);
  const liveParsed = live.present ? parseBynderAsset(live.value) : null;
  const parsed = liveParsed ?? fromField;

  if (parsed) return { type: "apply", asset: parsed };
  return current ? { type: "keep" } : { type: "clear" };
}

export function readSiblingFieldData(entry: { getField?: (uid: string) => { getData: () => unknown } } | null | undefined, uid: string): unknown {
  if (!entry?.getField || !uid) return undefined;

  const tryUid = (fieldUid: string): unknown => {
    try {
      return entry.getField?.(fieldUid)?.getData();
    } catch {
      return undefined;
    }
  };

  const direct = tryUid(uid);
  if (direct !== undefined) return direct;

  const lastSegment = uid.split(".").pop();
  if (lastSegment && lastSegment !== uid) {
    return tryUid(lastSegment);
  }
  return undefined;
}

const ADDITIONAL_PROPERTY = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED_ADDITIONAL_PROPERTIES = new Set([
  "id",
  "name",
  "type",
  "alt",
  "video",
  "additional",
  "transform",
  "focalPoint",
  "operation",
  "zoom",
  "extendBackground",
  "extendBackgroundColor",
  "originalAssetWidth",
  "originalAssetHeight",
  "aspectRatio",
  "mobile",
  "dat",
  "webImage",
  "transformBaseUrl",
  "differentMobileAsset",
  "description",
  "originalUrl",
  "publishedAt",
  "updatedAt",
  "tags",
  "fileType",
  "fileSize",
  "width",
  "height",
  "url",
  "downloadUrl",
]);

function pickVideoFlag(
  fieldConfig: unknown,
  appConfig: unknown,
  key: keyof VideoPlayback,
  flatKey: string,
  fallback: boolean
): boolean {
  const fieldVideo = asRecord(asRecord(fieldConfig)?.video);
  const appVideo = asRecord(asRecord(appConfig)?.video);
  return (
    pickBool(fieldVideo, key) ??
    pickBool(fieldConfig, flatKey) ??
    pickBool(appVideo, key) ??
    pickBool(appConfig, flatKey) ??
    fallback
  );
}

/** Defaults for a newly picked video. Field config wins over App Config. */
export function resolveVideoDefaults(fieldConfig: unknown, appConfig: unknown): VideoPlayback {
  return {
    autoplay: pickVideoFlag(fieldConfig, appConfig, "autoplay", "videoAutoplay", false),
    muted: pickVideoFlag(fieldConfig, appConfig, "muted", "videoMuted", false),
    controls: pickVideoFlag(fieldConfig, appConfig, "controls", "videoControls", true),
    loop: pickVideoFlag(fieldConfig, appConfig, "loop", "videoLoop", false),
  };
}

/** Which playback checkboxes to show. Hidden flags still keep their configured default on new videos. */
export function resolveVideoFieldVisibility(fieldConfig: unknown, appConfig: unknown): VideoFieldVisibility {
  return {
    autoplay: pickShowFlag(fieldConfig, appConfig, ["showFieldAutoplay"], [], true),
    muted: pickShowFlag(fieldConfig, appConfig, ["showFieldMuted", "showFieldMute"], [], true),
    controls: pickShowFlag(fieldConfig, appConfig, ["showFieldControls"], [], true),
    loop: pickShowFlag(fieldConfig, appConfig, ["showFieldLoop"], [], true),
  };
}

export interface AdditionalFieldsConfig {
  fields: AdditionalFieldDefinition[];
  /** Set when `additionalFields` is present but not a valid array of additionalField objects. */
  error?: string;
}

function additionalFieldsRecord(config: unknown): Record<string, unknown> | undefined {
  const record = asRecord(config);
  if (!record) return undefined;
  if ("additionalFields" in record || "additionalField" in record) return record;
  const custom = asRecord(record.custom_settings);
  if (custom && ("additionalFields" in custom || "additionalField" in custom)) return custom;
  return undefined;
}

function readAdditionalFields(config: unknown): AdditionalFieldsConfig | undefined {
  const record = additionalFieldsRecord(config);
  if (!record) return undefined;
  if ("additionalField" in record) {
    return {
      fields: [],
      error:
        'Use "additionalFields", an array of additionalField objects. Each item needs "property", "type", and "label".',
    };
  }
  const raw = record.additionalFields;
  if (!Array.isArray(raw)) {
    return { fields: [], error: '"additionalFields" must be an array of additionalField objects.' };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const fields: AdditionalFieldDefinition[] = [];
  raw.forEach((item, index) => {
    const where = `additionalFields[${index}]`;
    const entry = asRecord(item);
    if (!entry) {
      errors.push(`${where} must be an object with "property", "type", and "label".`);
      return;
    }
    const property = typeof entry.property === "string" ? entry.property.trim() : "";
    if (!property) errors.push(`${where}.property must be a non-empty string.`);
    else if (!ADDITIONAL_PROPERTY.test(property)) {
      errors.push(`${where}.property must start with a letter and use only letters, numbers, and underscores.`);
    } else if (RESERVED_ADDITIONAL_PROPERTIES.has(property)) {
      errors.push(`${where}.property "${property}" is reserved.`);
    } else if (seen.has(property)) {
      errors.push(`${where}.property "${property}" is already used.`);
    } else seen.add(property);

    const type = entry.type;
    if (type !== "string" && type !== "number" && type !== "boolean") {
      errors.push(`${where}.type must be "string", "number", or "boolean".`);
    }
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label) errors.push(`${where}.label must be a non-empty string.`);
    if (!errors.length && property && (type === "string" || type === "number" || type === "boolean")) {
      fields.push({ property, type, label });
    }
  });

  if (errors.length) return { fields: [], error: errors.join(" ") };
  return { fields };
}

/**
 * Extra author inputs. A field that sets `additionalFields` replaces the App Config list.
 * An invalid list returns `error` and no fields.
 */
export function resolveAdditionalFields(fieldConfig: unknown, appConfig: unknown): AdditionalFieldsConfig {
  return readAdditionalFields(fieldConfig) ?? readAdditionalFields(appConfig) ?? { fields: [] };
}
