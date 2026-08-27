import type { CropFieldConfig, ParsedBynderAsset, TransformSettings } from "./types";
import { ASPECT_PRESETS } from "./types";
import { lockToAspect, parseAspect, resolveDimensions } from "./bynder/composeDatUrl";
import { parseBynderAsset } from "./bynder/parseAsset";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
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

function pickNumber(value: unknown, key: string): number | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const from = (source: Record<string, unknown> | null): number | undefined => {
    if (!source) return undefined;
    const raw = source[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    return undefined;
  };
  return from(record) ?? from(asRecord(record.custom_settings));
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

export function resolveBynderFieldUid(fieldConfig: unknown, appConfig: unknown): string | undefined {
  return pickUid(fieldConfig) ?? pickUid(appConfig);
}

/** Field Config Parameter wins over App Configuration. Default: DAT off. */
export function resolveEnableDat(fieldConfig: unknown, appConfig: unknown): boolean {
  return pickBool(fieldConfig, "enableDat") ?? pickBool(appConfig, "enableDat") ?? false;
}

export function resolveCropConfig(fieldConfig: unknown, appConfig: unknown): CropFieldConfig {
  return {
    aspect: firstDefined(pickString(fieldConfig, "aspect"), pickString(appConfig, "aspect")),
    width: firstDefined(pickNumber(fieldConfig, "width"), pickNumber(appConfig, "width")),
    height: firstDefined(pickNumber(fieldConfig, "height"), pickNumber(appConfig, "height")),
    lockAspect: pickBool(fieldConfig, "lockAspect") ?? pickBool(appConfig, "lockAspect") ?? false,
    lockWidth: pickBool(fieldConfig, "lockWidth") ?? pickBool(appConfig, "lockWidth") ?? false,
    lockHeight: pickBool(fieldConfig, "lockHeight") ?? pickBool(appConfig, "lockHeight") ?? false,
    aspectPresets:
      pickAspectPresets(fieldConfig) ?? pickAspectPresets(appConfig) ?? [...ASPECT_PRESETS],
  };
}

export function applyCropLocks(transform: TransformSettings, crop: CropFieldConfig): TransformSettings {
  let next: TransformSettings = { ...transform };

  if (crop.lockAspect && crop.aspect) {
    next = lockToAspect(next, crop.aspect);
  }
  if (crop.lockWidth && crop.width != null) {
    next.width = crop.width;
    if (parseAspect(next.aspect) && !crop.lockHeight) {
      next.height = resolveDimensions({ ...next, height: null }).height ?? next.height;
    }
  }
  if (crop.lockHeight && crop.height != null) {
    next.height = crop.height;
    if (parseAspect(next.aspect) && !crop.lockWidth) {
      next.width = resolveDimensions({ ...next, width: null }).width ?? next.width;
    }
  }
  if (crop.lockAspect && crop.lockWidth && parseAspect(next.aspect) && next.width) {
    next.height = resolveDimensions({ ...next, height: null }).height ?? next.height;
  }
  if (crop.lockAspect && crop.lockHeight && parseAspect(next.aspect) && next.height) {
    next.width = resolveDimensions({ ...next, width: null }).width ?? next.width;
  }

  return next;
}

/** Unlocked presets fill in a new field. Locks always win. */
export function applyCropConfig(
  transform: TransformSettings,
  crop: CropFieldConfig,
  mode: "defaults" | "locks" = "locks"
): TransformSettings {
  let next: TransformSettings = { ...transform };
  if (mode === "defaults") {
    if (crop.width != null) next.width = crop.width;
    if (crop.height != null) next.height = crop.height;
    if (crop.aspect) next = lockToAspect(next, crop.aspect);
  }
  return applyCropLocks(next, crop);
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
