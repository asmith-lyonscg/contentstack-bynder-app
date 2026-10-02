import { resolveCompactViewConfig as resolveCompactViewOptions } from "./compactOptions";
import type {
  AdditionalFieldDefinition,
  AssetCropSettings,
  CompactViewConfig,
  CropFieldConfig,
  DatFormat,
  ParsedBynderAsset,
  SavedBynderAsset,
  TransformSettings,
  VideoFieldVisibility,
  VideoPlayback,
  ViewportCropPreset,
  ViewportKind,
} from "./types";
import { ASPECT_PRESETS, DEFAULT_FOCAL_POINT, DEFAULT_TRANSFORM } from "./types";
import { lockToAspect, parseAspect, resolveDimensions } from "./bynder/composeDatUrl";
import { parseBynderAsset } from "./bynder/parseAsset";
import { stripMatchingMobile, viewportCropsEqual } from "./viewportCrop";

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

function pickRaw(value: unknown, key: string): unknown {
  const record = asRecord(value);
  if (!record) return undefined;
  if (record[key] !== undefined) return record[key];
  const custom = asRecord(record.custom_settings);
  if (custom && custom[key] !== undefined) return custom[key];
  return undefined;
}

function coercePositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

function coerceAspect(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

interface ViewportPair<T> {
  desktop?: T;
  mobile?: T;
}

function parseViewportPair<T>(
  raw: unknown,
  dualMode: boolean,
  coerce: (value: unknown) => T | undefined
): ViewportPair<T> {
  const direct = coerce(raw);
  if (direct !== undefined) {
    return dualMode ? { desktop: direct, mobile: direct } : { desktop: direct };
  }
  const record = asRecord(raw);
  if (!record) return {};
  const desktop = coerce(record.desktop);
  const mobile = coerce(record.mobile);
  if (!dualMode) return desktop !== undefined ? { desktop } : {};
  return { desktop, mobile };
}

function firstViewportPair<T>(
  fieldConfig: unknown,
  appConfig: unknown,
  key: string,
  dualMode: boolean,
  coerce: (value: unknown) => T | undefined
): ViewportPair<T> {
  const field = parseViewportPair(pickRaw(fieldConfig, key), dualMode, coerce);
  const app = parseViewportPair(pickRaw(appConfig, key), dualMode, coerce);
  return {
    desktop: firstDefined(field.desktop, app.desktop),
    mobile: dualMode ? firstDefined(field.mobile, app.mobile) : undefined,
  };
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function parseAspectList(value: unknown): string[] | undefined {
  const fromArray = (items: unknown[]): string[] =>
    items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

  if (Array.isArray(value)) {
    const items = fromArray(value);
    return items.length ? items : undefined;
  }
  if (typeof value === "string" && value.trim()) {
    const items = fromArray(value.split(/[,;]/));
    return items.length ? items : undefined;
  }
  return undefined;
}

function pickAspectPresets(value: unknown): string[] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return parseAspectList(record.aspectPresets) ?? parseAspectList(asRecord(record.custom_settings)?.aspectPresets);
}

export function parseDatFormat(value: unknown): DatFormat | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "jpeg") return "jpg";
  if (normalized === "jpg" || normalized === "png" || normalized === "webp" || normalized === "avif") {
    return normalized;
  }
  return undefined;
}

function pickFormat(value: unknown): DatFormat | undefined {
  return (
    parseDatFormat(pickString(value, "format")) ??
    parseDatFormat(pickString(value, "fileType")) ??
    parseDatFormat(pickString(value, "datFormat"))
  );
}

function pickHideFormat(value: unknown): boolean | undefined {
  const show =
    pickBool(value, "showFieldFileType") ??
    pickBool(value, "showFormat") ??
    pickBool(value, "showFileType");
  if (show !== undefined) return !show;
  const hide = pickBool(value, "hideFormat") ?? pickBool(value, "hideFileType");
  if (hide !== undefined) return hide;
  return undefined;
}

function explicitShowChoice(
  fieldConfig: unknown,
  appConfig: unknown,
  showKeys: string[],
  hideKeys: string[]
): boolean {
  for (const source of [fieldConfig, appConfig]) {
    for (const key of [...showKeys, ...hideKeys]) {
      if (pickBool(source, key) !== undefined) return true;
    }
  }
  return false;
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
  const aspect = firstViewportPair(fieldConfig, appConfig, "aspect", desktopMobileMode, coerceAspect);
  const width = firstViewportPair(fieldConfig, appConfig, "width", desktopMobileMode, coercePositiveInt);
  const height = firstViewportPair(fieldConfig, appConfig, "height", desktopMobileMode, coercePositiveInt);
  const lockAspect = firstViewportPair(fieldConfig, appConfig, "lockAspect", desktopMobileMode, coerceBool);
  const lockWidth = firstViewportPair(fieldConfig, appConfig, "lockWidth", desktopMobileMode, coerceBool);
  const lockHeight = firstViewportPair(fieldConfig, appConfig, "lockHeight", desktopMobileMode, coerceBool);
  const aspectShowKeys = ["showFieldAspectRatio", "showAspect"];
  const aspectHideKeys = ["hideAspect"];
  const dimensionLocked = Boolean(
    lockWidth.desktop || lockHeight.desktop || lockWidth.mobile || lockHeight.mobile
  );

  const config: CropFieldConfig = {
    aspect: aspect.desktop,
    width: width.desktop,
    height: height.desktop,
    format: firstDefined(pickFormat(fieldConfig), pickFormat(appConfig)),
    lockAspect: lockAspect.desktop ?? false,
    lockWidth: lockWidth.desktop ?? false,
    lockHeight: lockHeight.desktop ?? false,
    lockFormat:
      pickBool(fieldConfig, "lockFormat") ??
      pickBool(fieldConfig, "lockFileType") ??
      pickBool(appConfig, "lockFormat") ??
      pickBool(appConfig, "lockFileType") ??
      false,
    hideFormat: pickHideFormat(fieldConfig) ?? pickHideFormat(appConfig) ?? true,
    showOperation: pickShowFlag(
      fieldConfig,
      appConfig,
      ["showFieldOperation", "showOperation"],
      ["hideOperation"],
      true
    ),
    showAspect: explicitShowChoice(fieldConfig, appConfig, aspectShowKeys, aspectHideKeys)
      ? pickShowFlag(fieldConfig, appConfig, aspectShowKeys, aspectHideKeys, false)
      : dimensionLocked,
    showWidth: pickShowFlag(fieldConfig, appConfig, ["showFieldWidth", "showWidth"], ["hideWidth"], true),
    showHeight: pickShowFlag(fieldConfig, appConfig, ["showFieldHeight", "showHeight"], ["hideHeight"], true),
    showQuality: pickShowFlag(fieldConfig, appConfig, ["showFieldQuality", "showQuality"], ["hideQuality"], false),
    showAdvancedQuery: pickShowFlag(
      fieldConfig,
      appConfig,
      ["showFieldAdvancedQuery", "showAdvancedQuery", "showExtraQuery"],
      ["hideAdvancedQuery"],
      false
    ),
    showDatPreset: pickShowFlag(
      fieldConfig,
      appConfig,
      ["showFieldDatPreset", "showDatPreset"],
      ["hideDatPreset"],
      false
    ),
    aspectPresets:
      pickAspectPresets(fieldConfig) ?? pickAspectPresets(appConfig) ?? [...ASPECT_PRESETS],
    desktopMobileMode,
  };

  if (desktopMobileMode) {
    if (aspect.mobile !== undefined && aspect.mobile !== aspect.desktop) config.mobileAspect = aspect.mobile;
    if (width.mobile !== undefined && width.mobile !== width.desktop) config.mobileWidth = width.mobile;
    if (height.mobile !== undefined && height.mobile !== height.desktop) config.mobileHeight = height.mobile;
    if (lockAspect.mobile !== undefined && lockAspect.mobile !== (lockAspect.desktop ?? false)) {
      config.lockAspectMobile = lockAspect.mobile;
    }
    if (lockWidth.mobile !== undefined && lockWidth.mobile !== (lockWidth.desktop ?? false)) {
      config.lockWidthMobile = lockWidth.mobile;
    }
    if (lockHeight.mobile !== undefined && lockHeight.mobile !== (lockHeight.desktop ?? false)) {
      config.lockHeightMobile = lockHeight.mobile;
    }
  }

  return config;
}

export function cropPreset(crop: CropFieldConfig, viewport: ViewportKind = "desktop"): ViewportCropPreset {
  const mobile = crop.desktopMobileMode !== false && viewport === "mobile";
  return {
    aspect: mobile ? crop.mobileAspect ?? crop.aspect : crop.aspect,
    width: mobile ? crop.mobileWidth ?? crop.width : crop.width,
    height: mobile ? crop.mobileHeight ?? crop.height : crop.height,
    lockAspect: mobile ? crop.lockAspectMobile ?? crop.lockAspect : crop.lockAspect,
    lockWidth: mobile ? crop.lockWidthMobile ?? crop.lockWidth : crop.lockWidth,
    lockHeight: mobile ? crop.lockHeightMobile ?? crop.lockHeight : crop.lockHeight,
  };
}

export function applyCropLocks(
  transform: TransformSettings,
  crop: CropFieldConfig,
  viewport: ViewportKind = "desktop"
): TransformSettings {
  const preset = cropPreset(crop, viewport);
  let next: TransformSettings = { ...transform };

  if (preset.lockAspect && preset.aspect) {
    next = lockToAspect(next, preset.aspect);
  }
  if (preset.lockWidth && preset.width != null) {
    next.width = preset.width;
    if (parseAspect(next.aspect) && !preset.lockHeight) {
      next.height = resolveDimensions({ ...next, height: null }).height ?? next.height;
    }
  }
  if (preset.lockHeight && preset.height != null) {
    next.height = preset.height;
    if (parseAspect(next.aspect) && !preset.lockWidth) {
      next.width = resolveDimensions({ ...next, width: null }).width ?? next.width;
    }
  }
  if (preset.lockAspect && preset.lockWidth && parseAspect(next.aspect) && next.width) {
    next.height = resolveDimensions({ ...next, height: null }).height ?? next.height;
  }
  if (preset.lockAspect && preset.lockHeight && parseAspect(next.aspect) && next.height) {
    next.width = resolveDimensions({ ...next, width: null }).width ?? next.width;
  }
  if (crop.lockFormat || crop.hideFormat) {
    next.format = crop.format ?? "webp";
  }

  return next;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const rest = x % y;
    x = y;
    y = rest;
  }
  return x || 1;
}

/** Lowest-terms `width:height` from pixel size, e.g. 1920×1080 → `16:9`. */
export function aspectFromDimensions(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function viewportHasSizePreset(crop: CropFieldConfig, viewport: ViewportKind): boolean {
  const preset = cropPreset(crop, viewport);
  return Boolean(preset.aspect || preset.width != null || preset.height != null);
}

function baseTransformForSeed(
  crop: CropFieldConfig,
  viewport: ViewportKind,
  size?: { width?: number; height?: number }
): TransformSettings {
  const width = size?.width && size.width > 0 ? Math.round(size.width) : undefined;
  const height = size?.height && size.height > 0 ? Math.round(size.height) : undefined;
  if (viewportHasSizePreset(crop, viewport) || (!width && !height)) {
    return { ...DEFAULT_TRANSFORM };
  }
  if (width && height) {
    return {
      ...DEFAULT_TRANSFORM,
      width,
      height,
      aspect: aspectFromDimensions(width, height),
    };
  }
  return {
    ...DEFAULT_TRANSFORM,
    width: width ?? DEFAULT_TRANSFORM.width,
    height: height ?? DEFAULT_TRANSFORM.height,
  };
}

/** Unlocked presets fill in a new field. Locks always win. */
export function applyCropConfig(
  transform: TransformSettings,
  crop: CropFieldConfig,
  mode: "defaults" | "locks" = "locks",
  viewport: ViewportKind = "desktop"
): TransformSettings {
  const preset = cropPreset(crop, viewport);
  let next: TransformSettings = { ...transform };
  if (mode === "defaults") {
    if (preset.width != null) next.width = preset.width;
    if (preset.height != null) next.height = preset.height;
    if (preset.aspect) next = lockToAspect(next, preset.aspect);
    if (crop.format) next.format = crop.format;
  }
  return applyCropLocks(next, crop, viewport);
}

export function seedAssetCrop(
  crop: CropFieldConfig,
  size?: { width?: number; height?: number }
): AssetCropSettings {
  const desktop: AssetCropSettings = {
    focalPoint: { ...DEFAULT_FOCAL_POINT },
    transform: applyCropConfig(baseTransformForSeed(crop, "desktop", size), crop, "defaults", "desktop"),
  };
  if (crop.desktopMobileMode === false) return desktop;
  const mobile = {
    focalPoint: { ...DEFAULT_FOCAL_POINT },
    transform: applyCropConfig(baseTransformForSeed(crop, "mobile", size), crop, "defaults", "mobile"),
  };
  return stripMatchingMobile({ ...desktop, mobile });
}

export function applyCropConfigToAssetCrop<T extends AssetCropSettings>(
  assetCrop: T,
  crop: CropFieldConfig,
  mode: "defaults" | "locks" = "locks"
): T {
  const next: T = {
    ...assetCrop,
    transform: applyCropConfig(assetCrop.transform, crop, mode, "desktop"),
  };
  if (crop.desktopMobileMode === false) {
    const { mobile: _mobile, ...desktop } = next;
    return desktop as T;
  }
  if (assetCrop.mobile) {
    next.mobile = {
      ...assetCrop.mobile,
      transform: applyCropConfig(assetCrop.mobile.transform, crop, mode, "mobile"),
    };
  } else if (mode === "locks") {
    const forced = applyCropConfig(next.transform, crop, "locks", "mobile");
    const desktopSlice = { focalPoint: next.focalPoint, transform: next.transform };
    const mobileSlice = { focalPoint: next.focalPoint, transform: forced };
    if (!viewportCropsEqual(desktopSlice, mobileSlice)) next.mobile = mobileSlice;
  }
  return stripMatchingMobile(next);
}

export function applyCropConfigToAssets(
  assets: SavedBynderAsset[] | undefined,
  crop: CropFieldConfig,
  mode: "defaults" | "locks" = "locks"
): SavedBynderAsset[] | undefined {
  if (!assets?.length) return undefined;
  return assets.map((asset) => ({ ...asset, ...applyCropConfigToAssetCrop(asset, crop, mode) }));
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
