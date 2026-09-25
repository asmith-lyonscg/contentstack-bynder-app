import { REQUIRED_PERSIST_KEYS, type PersistAssetKey } from "../persistKeys";
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

function normalizeMetaKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function extensionFromName(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.split(/[?#]/)[0] ?? value;
  const match = /\.([a-z0-9]{2,5})$/i.exec(cleaned);
  if (!match) return undefined;
  const ext = match[1].toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

const VIDEO_FILE = /^(mp4|webm|mov|m4v|m3u8)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mkv|m3u8)(?:$|\?)/i;
const DOCUMENT_FILE = /^(pdf|doc|docx|ppt|pptx|xls|xlsx|pages|key|numbers|rtf|txt|odt|ods|odp)$/i;
const DOCUMENT_EXT = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|pages|key|numbers|rtf|txt|odt|ods|odp)(?:$|\?)/i;

function extensionToken(value?: string): string | undefined {
  if (!value) return undefined;
  const fromName = extensionFromName(value);
  if (fromName) return fromName;
  const cleaned = value.replace(/^\./, "").toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(cleaned)) return cleaned === "jpeg" ? "jpg" : cleaned;
  return undefined;
}

/** Original-file extensions only. WebP/JPG previews of a PDF are not the file Bynder badges. */
function originalFileExtensions(
  asset: Record<string, unknown>,
  files: Record<string, unknown>,
  selectedFile: Record<string, unknown> | null
): string[] {
  const found: string[] = [];
  const pushToken = (token?: string) => {
    if (token && !found.includes(token)) found.push(token);
  };
  const pushExt = (value?: string) => pushToken(extensionToken(value));
  const pushName = (value?: string) => pushToken(extensionFromName(value));
  const rawList = asset.extensions ?? asset.extension;
  const items = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
  for (const item of items) pushExt(pickString(item));
  const original = asRecord(files.original) ?? asRecord(files.Original);
  pushExt(pickString(original?.extension));
  pushName(pickString(original?.fileName));
  pushName(pickString(original?.filename));
  pushName(pickString(original?.name));
  pushName(pickUrl(original));
  pushName(pickString(asset.originalUrl));
  pushExt(pickString(selectedFile?.extension));
  pushName(pickString(selectedFile?.fileName));
  pushName(pickString(selectedFile?.filename));
  pushName(pickString(selectedFile?.name));
  pushName(pickString(asset.name));
  return found;
}

function resolveAssetType(
  asset: Record<string, unknown>,
  files: Record<string, unknown>,
  selectedFile: Record<string, unknown> | null
): string | undefined {
  const declared = pickString(asset.type);
  const extensions = originalFileExtensions(asset, files, selectedFile);
  if (declared?.toUpperCase() === "DOCUMENT" || extensions.some((ext) => DOCUMENT_FILE.test(ext))) {
    return "DOCUMENT";
  }
  if (declared?.toUpperCase() === "VIDEO" || extensions.some((ext) => VIDEO_FILE.test(ext))) {
    return declared?.toUpperCase() === "IMAGE" ? declared : "VIDEO";
  }
  return declared;
}

function pickFileType(
  asset: Record<string, unknown>,
  files: Record<string, unknown>,
  sourceUrl?: string
): string | undefined {
  const original = asRecord(files.original) ?? asRecord(files.Original);
  const webImage = asRecord(files.webImage ?? files.webimage);
  const fromExtList = Array.isArray(asset.extensions)
    ? asset.extensions.map((item) => pickString(item)?.replace(/^\./, "")).find(Boolean)
    : pickString(asset.extensions)?.replace(/^\./, "");
  const candidates = [
    fromExtList,
    pickString(original?.fileName),
    pickString(original?.filename),
    pickString(original?.name),
    pickUrl(original),
    pickUrl(webImage),
    pickString(asset.name),
    sourceUrl,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const fromName = extensionFromName(candidate);
    if (fromName) return fromName;
    const cleaned = candidate.replace(/^\./, "").toLowerCase();
    if (/^[a-z0-9]{2,5}$/.test(cleaned)) return cleaned === "jpeg" ? "jpg" : cleaned;
  }
  return undefined;
}

function collectMetaBags(asset: Record<string, unknown>): Record<string, unknown>[] {
  const bags: Record<string, unknown>[] = [asset];
  const extra = additionalInfo(asset);
  if (Object.keys(extra).length) bags.push(extra);

  const pushNamed = (value: unknown) => {
    if (Array.isArray(value)) {
      const mapped: Record<string, unknown> = {};
      for (const item of value) {
        const rec = asRecord(item);
        if (!rec) continue;
        const name = pickString(rec.name) ?? pickString(rec.label) ?? pickString(rec.key);
        const option = rec.value ?? rec.text ?? rec.displayName;
        if (name) mapped[name] = option;
      }
      if (Object.keys(mapped).length) bags.push(mapped);
      return;
    }
    const record = asRecord(value);
    if (record) bags.push(record);
  };

  pushNamed(asset.textMetaproperties ?? asset.text_metaproperties ?? extra.textMetaproperties);
  pushNamed(asset.metaproperties ?? asset.propertyOptions ?? extra.metaproperties);
  return bags;
}

function pickFromBag(bag: Record<string, unknown>, wanted: string): string | undefined {
  const target = normalizeMetaKey(wanted);
  for (const [key, value] of Object.entries(bag)) {
    if (normalizeMetaKey(key) !== target) continue;
    const direct = pickString(value);
    if (direct) return direct;
    const rec = asRecord(value);
    if (!rec) continue;
    const nested =
      pickString(rec.value) ??
      pickString(rec.text) ??
      pickString(rec.displayName) ??
      (Array.isArray(rec.options) ? pickString(rec.options[0]) : undefined) ??
      (Array.isArray(rec.value) ? pickString(rec.value[0]) : undefined);
    if (nested) return nested;
  }
  return undefined;
}

/** alt_text → alttext → alt → description, from asset fields or Bynder text metaproperties. */
export function pickBynderAltText(raw: unknown): string | undefined {
  const asset = firstAsset(raw);
  if (!asset) return undefined;
  const bags = collectMetaBags(asset);
  for (const key of ["alt_text", "alttext", "alt"]) {
    for (const bag of bags) {
      const found = pickFromBag(bag, key);
      if (found) return found;
    }
  }
  return pickString(asset.description);
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
 * Parse every Bynder-shaped item in a Compact View payload.
 */
export function parseBynderAssets(raw: unknown): ParsedBynderAsset[] {
  const items = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
  const parsed: ParsedBynderAsset[] = [];
  for (const item of items) {
    const next = parseBynderAsset(item);
    if (next) parsed.push(next);
  }
  return parsed;
}

/**
 * When the picker replaces an image, the payload may briefly include both
 * the previous asset and the new one. Prefer the asset that is not current.
 */
export function pickBynderAsset(raw: unknown, currentId?: string): ParsedBynderAsset | null {
  const parsed = parseBynderAssets(raw);
  if (parsed.length === 0) return null;
  if (currentId && parsed.some((item) => item.id === currentId)) {
    return parsed.find((item) => item.id !== currentId) ?? parsed[0];
  }
  return parsed[0];
}

export function compactAssetIds(assets: ParsedBynderAsset[]): string[] {
  const ids: string[] = [];
  for (const asset of assets) {
    const mediaId = compactViewMediaId(asset);
    if (mediaId && !ids.includes(mediaId)) ids.push(mediaId);
  }
  return ids;
}

/** RFC 4122. */
const RFC_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Bynder media ids are often 8-4-4-16 (one hyphen fewer than RFC). */
const BYNDER_MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{16}$/i;
const HEX32 = /^[0-9a-f]{32}$/i;

function compactViewMediaId(asset: ParsedBynderAsset): string | undefined {
  for (const value of [asset.databaseId, asset.id, asset.pickerId]) {
    const mediaId = asCompactViewMediaId(value);
    if (mediaId) return mediaId;
  }
  return undefined;
}

function asCompactViewMediaId(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (isMediaUuid(trimmed)) return trimmed;
  if (HEX32.test(trimmed)) {
    return `${trimmed.slice(0, 8)}-${trimmed.slice(8, 12)}-${trimmed.slice(12, 16)}-${trimmed.slice(16)}`;
  }
  const fromGraphql = mediaIdFromGraphqlId(trimmed);
  if (fromGraphql) return fromGraphql;
  if (looksLikeGraphqlId(trimmed)) return undefined;
  if (/^[0-9a-f-]{32,40}$/i.test(trimmed)) return trimmed;
  return undefined;
}

function looksLikeGraphqlId(value: string): boolean {
  return /^[A-Za-z0-9+/_=-]+$/.test(value) && value.length > 40 && !value.includes("-");
}

function isMediaUuid(value: string): boolean {
  return RFC_UUID.test(value) || BYNDER_MEDIA_ID.test(value);
}

/**
 * Compact View runs `btoa(\`(Asset_id ${id})\`)` on selectedAssets, then
 * `nodes(ids:)`. Passing a GraphQL `id` double-encodes and preselect is empty.
 */
function mediaIdFromGraphqlId(value: string): string | undefined {
  if (isMediaUuid(value)) return undefined;
  const decoded = decodeGraphqlGlobalId(value);
  if (!decoded) return undefined;
  const match = /\(Asset_id\s+([^)]+)\)/i.exec(decoded) ?? /^Asset[:\s]+(.+)$/i.exec(decoded);
  const mediaId = match?.[1]?.trim();
  if (!mediaId) return undefined;
  return isMediaUuid(mediaId) || HEX32.test(mediaId) ? asCompactViewMediaId(mediaId) : undefined;
}

function decodeGraphqlGlobalId(value: string): string | undefined {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const decoded = atob(padded);
    if (/\(Asset_id\s/i.test(decoded) || /^Asset[:\s]/i.test(decoded)) return decoded;
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Compact View only calls onSuccess when the author confirms. An empty payload
 * is treated as cancel so the current selection is kept.
 */
export function applyPickerSelection(options: {
  current: unknown[];
  incoming: unknown[];
  mode: "SingleSelect" | "SingleSelectFile" | "MultiSelect";
  focusedId?: string;
  maxLimit?: number;
}): unknown[] {
  const { current, incoming, mode, focusedId, maxLimit } = options;
  if (!incoming.length) return current;

  const limited =
    typeof maxLimit === "number" && maxLimit > 0 ? incoming.slice(0, maxLimit) : incoming;

  if (mode === "MultiSelect") return limited;

  const nextAsset = limited[0];
  if (!nextAsset) return current;
  if (current.length <= 1) return [nextAsset];

  let replaced = false;
  const next = current.map((raw) => {
    const parsed = parseBynderAsset(raw);
    if (!replaced && parsed && (!focusedId || parsed.id === focusedId || parsed.pickerId === focusedId)) {
      replaced = true;
      return nextAsset;
    }
    return raw;
  });
  return replaced ? next : [nextAsset];
}

/** Hydrate the editor from saved JSON (`assets[]`). */
export function assetFromSettings(settings: { assets?: unknown[] }): ParsedBynderAsset | null {
  return pickBynderAsset(settings.assets);
}

/**
 * Compact View often returns `derivatives.webImage` as a string and DAT on
 * `additionalInfo.selectedFile`. Persist a shape `parseBynderAsset` already understands.
 */
export function normalizeCompactAssets(
  assets: unknown[],
  additionalInfo?: unknown,
  keys: readonly PersistAssetKey[] = REQUIRED_PERSIST_KEYS
): unknown[] {
  const extra = asRecord(additionalInfo);
  const selectedFile = extra?.selectedFile;
  return assets.map((raw) => {
    const asset = asRecord(raw);
    if (!asset) return raw;
    const files = { ...filesMap(asset) };
    const derivatives = asRecord(asset.derivatives);
    if (!pickUrl(files.webImage)) {
      const fromDeriv = pickUrl(derivatives?.webImage) ?? pickUrl(derivatives?.thumbnail);
      if (fromDeriv) files.webImage = { url: fromDeriv };
    }
    const next: Record<string, unknown> = { ...asset, files };
    if (selectedFile) {
      const selectedUrl = pickUrl(selectedFile);
      const inferred = inferTransformBaseUrl(selectedUrl);
      if (inferred && !pickUrl(files.transformBaseUrl)) files.transformBaseUrl = inferred;
      next.files = files;
    }
    return slimPersistedAsset(next, keys) ?? next;
  });
}

function slimWebImage(
  files: Record<string, unknown>,
  fallbackUrl?: string
): Record<string, unknown> | undefined {
  const url = pickUrl(files.webImage ?? files.webimage) ?? fallbackUrl;
  if (!url) return undefined;
  return { url };
}

function slimTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((item) => pickString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);
  return tags.length ? tags : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Keep only the fields this editor, DAT, and delivery need. */
export function slimPersistedAsset(
  raw: unknown,
  keys: readonly PersistAssetKey[] = REQUIRED_PERSIST_KEYS,
  options?: { omitWebImage?: boolean }
): Record<string, unknown> | null {
  const parsed = parseBynderAsset(raw);
  if (!parsed) return null;
  const asset = firstAsset(raw) ?? {};
  const filesIn = filesMap(asset);
  const want = new Set<string>(keys);
  const next: Record<string, unknown> = {};
  const mediaId = parsed.databaseId ?? parsed.id;
  if (want.has("id")) next.id = mediaId;
  if (want.has("name") && parsed.name) next.name = parsed.name;
  if (want.has("type") && parsed.type) next.type = parsed.type;
  if (want.has("transformBaseUrl") && parsed.transformBaseUrl) {
    next.transformBaseUrl = parsed.transformBaseUrl;
  }
  const webImage =
    slimWebImage(filesIn, parsed.transformBaseUrl ? undefined : parsed.sourceUrl) ??
    slimWebImage({ webImage: asset.webImage }, parsed.transformBaseUrl ? undefined : parsed.sourceUrl);
  if (webImage && !options?.omitWebImage) next.webImage = webImage;
  if (want.has("description")) {
    const description = pickString(asset.description);
    if (description) next.description = description;
  }
  if (want.has("originalUrl")) {
    const originalUrl = pickString(asset.originalUrl) ?? pickUrl(filesIn.original);
    if (originalUrl) next.originalUrl = originalUrl;
  }
  if (want.has("publishedAt")) {
    const publishedAt = pickString(asset.publishedAt);
    if (publishedAt) next.publishedAt = publishedAt;
  }
  if (want.has("updatedAt")) {
    const updatedAt = pickString(asset.updatedAt);
    if (updatedAt) next.updatedAt = updatedAt;
  }
  if (want.has("tags")) {
    const tags = slimTags(asset.tags);
    if (tags) next.tags = tags;
  }
  if (isRecord(asset.focalPoint)) next.focalPoint = asset.focalPoint;
  if (isRecord(asset.transform)) next.transform = asset.transform;
  if (typeof asset.url === "string" && asset.url) next.url = asset.url;
  if (isRecord(asset.mobile)) next.mobile = asset.mobile;
  if (asset.differentMobileAsset === true) next.differentMobileAsset = true;
  if (typeof asset.alt === "string") next.alt = asset.alt;
  return next;
}

export function slimPersistedAssets(
  assets: unknown[] | undefined,
  keys: readonly PersistAssetKey[] = REQUIRED_PERSIST_KEYS,
  options?: { omitWebImage?: boolean }
): unknown[] | undefined {
  if (!Array.isArray(assets) || !assets.length) return undefined;
  return assets.map((item) => slimPersistedAsset(item, keys, options) ?? item);
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

  const webImage = files.webImage ?? files.webimage ?? asset.webImage;
  const webImageUrl = pickUrl(webImage);
  const webImageRecord = asRecord(webImage);
  const originalRecord = asRecord(files.original) ?? asRecord(files.Original);

  const transformBaseUrl =
    pickUrl(asset.transformBaseUrl) ??
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
    type: resolveAssetType(asset, files, selectedFile),
    transformBaseUrl,
    sourceUrl,
    width:
      pickNumber(webImageRecord?.width) ??
      pickNumber(originalRecord?.width) ??
      pickNumber(selectedFile?.width) ??
      pickNumber(asset.width),
    height:
      pickNumber(webImageRecord?.height) ??
      pickNumber(originalRecord?.height) ??
      pickNumber(selectedFile?.height) ??
      pickNumber(asset.height),
    fileSize:
      pickNumber(asset.fileSize) ??
      pickNumber(originalRecord?.fileSize) ??
      pickNumber(originalRecord?.filesize) ??
      pickNumber(webImageRecord?.fileSize),
    fileType: pickFileType(asset, files, sourceUrl),
    alt: pickBynderAltText(asset),
  };
}

/** Original pixel size when present, otherwise the web image. Not saved on the asset. */
export function assetPixelSize(
  raw: unknown,
  extra?: unknown
): { width?: number; height?: number } {
  const asset = firstAsset(raw);
  if (!asset) return {};
  const passed = asRecord(extra);
  const selected = asRecord(passed?.selectedFile) ?? asRecord(additionalInfo(asset).selectedFile);
  const files = filesMap(asset);
  const records = [
    asRecord(files.original) ?? asRecord(files.Original),
    selected,
    asset,
    asRecord(files.webImage ?? files.webimage),
  ];
  for (const record of records) {
    if (!record) continue;
    const width = pickNumber(record.width);
    const height = pickNumber(record.height);
    if (width || height) return { width, height };
  }
  return {};
}

/** DAT and the crop editor apply to images. Videos need Bynder Studio / derivatives / clip. */
export function isVideoAsset(
  asset?: { type?: string; fileType?: string; sourceUrl?: string; name?: string } | null
): boolean {
  if (!asset) return false;
  if (asset.type?.trim().toUpperCase() === "VIDEO") return true;
  const fileType = asset.fileType?.trim() ?? "";
  if (VIDEO_FILE.test(fileType)) return true;
  return VIDEO_EXT.test(asset.sourceUrl ?? "") || VIDEO_EXT.test(asset.name ?? "");
}

/**
 * Compact View `DOCUMENT` covers PDFs and office files. They have no DAT crop
 * and no desktop/mobile pair.
 */
export function isDocumentAsset(
  asset?: { type?: string; fileType?: string; sourceUrl?: string; name?: string } | null
): boolean {
  if (!asset) return false;
  if (asset.type?.trim().toUpperCase() === "DOCUMENT") return true;
  const fileType = asset.fileType?.trim() ?? "";
  if (DOCUMENT_FILE.test(fileType)) return true;
  return DOCUMENT_EXT.test(asset.sourceUrl ?? "") || DOCUMENT_EXT.test(asset.name ?? "");
}
