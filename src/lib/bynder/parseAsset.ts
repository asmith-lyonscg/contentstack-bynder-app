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
 * When the picker replaces an image, the payload may briefly include both
 * the previous asset and the new one. Prefer the asset that is not current.
 */
export function pickBynderAsset(raw: unknown, currentId?: string): ParsedBynderAsset | null {
  const items = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
  const parsed: ParsedBynderAsset[] = [];
  for (const item of items) {
    const next = parseBynderAsset(item);
    if (next) parsed.push(next);
  }
  if (parsed.length === 0) return null;
  if (currentId && parsed.some((item) => item.id === currentId)) {
    return parsed.find((item) => item.id !== currentId) ?? parsed[0];
  }
  return parsed[0];
}

/** Hydrate the editor from saved JSON (`assets[]`, or companion-era sourceUrl). */
export function assetFromSettings(settings: {
  assets?: unknown[];
  assetId?: string;
  sourceUrl?: string;
  transformBaseUrl?: string;
}): ParsedBynderAsset | null {
  const fromAssets = pickBynderAsset(settings.assets);
  if (fromAssets) return fromAssets;
  if (!settings.sourceUrl) return null;
  return {
    id: settings.assetId ?? settings.sourceUrl,
    sourceUrl: settings.sourceUrl,
    transformBaseUrl: settings.transformBaseUrl,
  };
}

/**
 * Compact View often returns `derivatives.webImage` as a string and DAT on
 * `additionalInfo.selectedFile`. Persist a shape `parseBynderAsset` already understands.
 */
export function normalizeCompactAssets(assets: unknown[], additionalInfo?: unknown): unknown[] {
  const extra = asRecord(additionalInfo);
  const selectedFile = extra?.selectedFile;
  return assets.map((raw, index) => {
    const asset = asRecord(raw);
    if (!asset) return raw;
    const files = { ...filesMap(asset) };
    const derivatives = asRecord(asset.derivatives);
    if (!pickUrl(files.webImage)) {
      const fromDeriv = pickUrl(derivatives?.webImage) ?? pickUrl(derivatives?.thumbnail);
      if (fromDeriv) files.webImage = { url: fromDeriv };
    }
    if (index === 0 && selectedFile && !files.transformBaseUrl) {
      const selectedUrl = pickUrl(selectedFile);
      const inferred = inferTransformBaseUrl(selectedUrl);
      if (inferred) files.transformBaseUrl = inferred;
    }
    const next: Record<string, unknown> = { ...asset, files };
    if (index === 0 && selectedFile) {
      next.additionalInfo = { ...(asRecord(asset.additionalInfo) ?? {}), selectedFile };
    }
    return next;
  });
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

  const graphqlId = pickString(asset.id);
  const databaseId = pickString(asset.databaseId);
  const id = databaseId ?? graphqlId ?? pickString(asset.assetId);
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

  const derivatives = asRecord(asset.derivatives);
  const sourceUrl =
    webImageUrl ??
    pickUrl(derivatives?.webImage) ??
    pickUrl(derivatives?.thumbnail) ??
    previewUrls[0] ??
    pickUrl(selectedFile) ??
    transformBaseUrl ??
    pickString(asset.url) ??
    pickString(asset.originalUrl);

  if (!sourceUrl) return null;

  return {
    id,
    databaseId,
    pickerId: graphqlId ?? databaseId ?? id,
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
