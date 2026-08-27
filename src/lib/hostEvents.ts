import { liveSiblingRaw, readValueAtUid } from "./fieldConfig";
import { parseBynderAsset } from "./bynder/parseAsset";
import type { ParsedBynderAsset } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Our saved JSON always has v:1 and a focalPoint. Bynder field values do not. */
export function isOwnSettingsPayload(data: unknown): boolean {
  const record = asRecord(data);
  if (!record || record.v !== 1) return false;
  return Boolean(asRecord(record.focalPoint));
}

export function isEmptyBynderValue(data: unknown): boolean {
  if (data == null || data === "") return true;
  return Array.isArray(data) && data.length === 0;
}

/**
 * True for official Bynder picker JSON (assigned or cleared). False for this
 * app’s own setData payload and unrelated extension values.
 */
export function shouldApplyHostFieldData(data: unknown): boolean {
  if (isOwnSettingsPayload(data)) return false;
  if (parseBynderAsset(data)) return true;
  return isEmptyBynderValue(data);
}

export function parseExtensionFieldChange(event: Event): { extensionUid?: string; data: unknown } | null {
  const detail = asRecord((event as CustomEvent).detail);
  if (!detail) return null;
  if (detail.eventName && detail.eventName !== "extensionFieldChange") return null;
  return {
    extensionUid: typeof detail.extensionUid === "string" ? detail.extensionUid : undefined,
    data: "data" in detail ? detail.data : undefined,
  };
}

export function parseAutoUpdateEntry(event: Event): Record<string, unknown> | null {
  const detail = asRecord((event as CustomEvent).detail);
  if (!detail) return null;
  return asRecord(detail.data);
}

export function siblingFromEntryData(
  entryData: unknown,
  fieldUid: string
): { present: boolean; value: unknown } {
  return liveSiblingRaw(fieldUid, entryData);
}

export function parseSiblingValue(raw: unknown): ParsedBynderAsset | null {
  return parseBynderAsset(raw);
}

export { readValueAtUid };
