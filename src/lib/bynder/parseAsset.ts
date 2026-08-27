import type { ParsedBynderAsset } from "../types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function pickUrl(value: unknown): string | undefined {
  const direct = pickString(value);
  if (direct) return direct;
  const record = asRecord(value);
  if (!record) return undefined;
  return pickString(record.url) ?? pickString(record.src);
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function firstAsset(raw: unknown): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  if (Array.isArray(raw)) {
    return asRecord(raw[0]);
  }
  return asRecord(raw);
}

export function inferTransformBaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes("/transform/")) return undefined;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function filesMap(asset: Record<string, unknown>): Record<string, unknown> {
  return asRecord(asset.files) ?? {};
}

function additionalInfo(asset: Record<string, unknown>): Record<string, unknown> {
  return asRecord(asset.additionalInfo) ?? {};
}

/**
 * Normalizes official Bynder Marketplace field JSON (object or array)
 * into the subset this companion app needs.
 */
export function parseBynderAsset(raw: unknown): ParsedBynderAsset | null {
  const asset = firstAsset(raw);
  if (!asset) return null;

  const files = filesMap(asset);
  const extra = additionalInfo(asset);
  const selectedFile = asRecord(extra.selectedFile);

  const id =
    pickString(asset.databaseId) ??
    pickString(asset.id) ??
    pickString(asset.assetId);
  if (!id) return null;

  const webImage = files.webImage ?? files.webimage;
  const webImageUrl = pickUrl(webImage);
  const webImageRecord = asRecord(webImage);

  const transformBaseUrl =
    pickUrl(files.transformBaseUrl) ??
    pickUrl(files.transformBaseURL) ??
    inferTransformBaseUrl(pickUrl(selectedFile)) ??
    inferTransformBaseUrl(pickString(asset.url));

  const previewUrls = Array.isArray(asset.previewUrls)
    ? asset.previewUrls.map((item) => pickUrl(item)).filter((item): item is string => Boolean(item))
    : [];

  const sourceUrl =
    webImageUrl ??
    previewUrls[0] ??
    pickUrl(selectedFile) ??
    transformBaseUrl ??
    pickString(asset.url);

  if (!sourceUrl) return null;

  return {
    id,
    databaseId: pickString(asset.databaseId),
    name: pickString(asset.name) ?? pickString(asset.title),
    type: pickString(asset.type),
    transformBaseUrl,
    sourceUrl,
    width:
      pickNumber(webImageRecord?.width) ??
      pickNumber(selectedFile?.width) ??
      pickNumber(asset.width),
    height:
      pickNumber(webImageRecord?.height) ??
      pickNumber(selectedFile?.height) ??
      pickNumber(asset.height),
  };
}
