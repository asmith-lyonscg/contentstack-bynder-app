import { parseBynderAsset, slimPersistedAssets } from "./bynder/parseAsset";
import { composeDatUrl, normalizeFocalPoint } from "./bynder/composeDatUrl";
import { REQUIRED_PERSIST_KEYS, type PersistAssetKey } from "./persistKeys";
import {
  DEFAULT_FOCAL_POINT,
  DEFAULT_TRANSFORM,
  type BynderImageSettings,
  type DatFormat,
  type DatOperation,
  type FocalPoint,
  type SavedBynderAsset,
  type TransformSettings,
  type ViewportCropSettings,
} from "./types";
import {
  resolveActiveViewport,
  savedAssetById,
  stripMatchingMobile,
  viewportCropsEqual,
} from "./viewportCrop";

const OPERATIONS: DatOperation[] = ["fill", "fit", "crop"];
const FORMATS: DatFormat[] = ["webp", "avif", "jpg", "png"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asOperation(value: unknown): DatOperation {
  return OPERATIONS.includes(value as DatOperation) ? (value as DatOperation) : DEFAULT_TRANSFORM.operation;
}

function asFormat(value: unknown): DatFormat | null {
  if (value == null || value === "" || value === "auto") return null;
  if (typeof value === "string" && value.trim().toLowerCase() === "jpeg") return "jpg";
  return FORMATS.includes(value as DatFormat) ? (value as DatFormat) : DEFAULT_TRANSFORM.format ?? "webp";
}

function asOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asFocalPoint(value: unknown): FocalPoint {
  if (!isRecord(value)) return { ...DEFAULT_FOCAL_POINT };
  return normalizeFocalPoint({
    x: typeof value.x === "number" ? value.x : Number(value.x),
    y: typeof value.y === "number" ? value.y : Number(value.y),
  });
}

function asTransform(value: unknown): TransformSettings {
  const transformRaw = isRecord(value) ? value : {};
  return {
    operation: asOperation(transformRaw.operation),
    width: asOptionalNumber(transformRaw.width) ?? DEFAULT_TRANSFORM.width,
    height: asOptionalNumber(transformRaw.height) ?? DEFAULT_TRANSFORM.height,
    aspect: typeof transformRaw.aspect === "string" ? transformRaw.aspect : DEFAULT_TRANSFORM.aspect,
    format: asFormat(transformRaw.format) ?? DEFAULT_TRANSFORM.format,
    quality: asOptionalNumber(transformRaw.quality) ?? DEFAULT_TRANSFORM.quality,
    extraQuery: typeof transformRaw.extraQuery === "string" ? transformRaw.extraQuery : "",
  };
}

function asViewportCrop(value: unknown): ViewportCropSettings | undefined {
  if (!isRecord(value)) return undefined;
  if (!isRecord(value.focalPoint) && !isRecord(value.transform)) return undefined;
  return {
    focalPoint: asFocalPoint(value.focalPoint),
    transform: asTransform(value.transform),
    url: typeof value.url === "string" && value.url.includes("io=") ? value.url : undefined,
  };
}

function asWebImage(value: unknown, fallback?: string): { url: string } | undefined {
  if (isRecord(value) && typeof value.url === "string" && value.url) return { url: value.url };
  if (typeof value === "string" && value) return { url: value };
  if (fallback) return { url: fallback };
  return undefined;
}

export function asSavedAsset(raw: unknown): SavedBynderAsset | null {
  const parsed = parseBynderAsset(raw);
  if (!parsed) return null;
  const record = isRecord(raw) ? raw : {};
  const files = isRecord(record.files) ? record.files : {};
  const crop = asViewportCrop(record);
  const mobile = isRecord(record.mobile) ? asViewportCrop(record.mobile) : undefined;
  const webImage =
    asWebImage(record.webImage) ??
    asWebImage(files.webImage, parsed.transformBaseUrl ? undefined : parsed.sourceUrl);
  const transformBaseUrl =
    (typeof record.transformBaseUrl === "string" && record.transformBaseUrl) ||
    (typeof files.transformBaseUrl === "string" && files.transformBaseUrl) ||
    parsed.transformBaseUrl;
  const next: SavedBynderAsset = {
    id: parsed.id,
    name: parsed.name,
    alt: typeof record.alt === "string" ? record.alt : parsed.alt,
    transformBaseUrl,
    webImage,
    focalPoint: crop?.focalPoint ?? { ...DEFAULT_FOCAL_POINT },
    transform: crop?.transform ?? { ...DEFAULT_TRANSFORM },
    url: crop?.url,
    mobile,
  };
  if (typeof record.description === "string" && record.description) next.description = record.description;
  if (typeof record.originalUrl === "string" && record.originalUrl) next.originalUrl = record.originalUrl;
  if (typeof record.publishedAt === "string" && record.publishedAt) next.publishedAt = record.publishedAt;
  if (typeof record.updatedAt === "string" && record.updatedAt) next.updatedAt = record.updatedAt;
  if (Array.isArray(record.tags)) {
    const tags = record.tags.filter((item): item is string => typeof item === "string" && Boolean(item));
    if (tags.length) next.tags = tags;
  }
  return stripMatchingMobile(next) as SavedBynderAsset;
}

export function asSavedAssets(value: unknown): SavedBynderAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.map((item) => asSavedAsset(item)).filter((item): item is SavedBynderAsset => Boolean(item));
  return assets;
}

export function defaultTransform(): TransformSettings {
  return { ...DEFAULT_TRANSFORM };
}

export function emptySettings(): BynderImageSettings {
  return {
    v: 1,
    focalPoint: { ...DEFAULT_FOCAL_POINT },
    transform: defaultTransform(),
  };
}

function liveFromAsset(asset: SavedBynderAsset | undefined, viewport: "desktop" | "mobile"): Pick<
  BynderImageSettings,
  "focalPoint" | "transform" | "alt" | "activeAssetId"
> {
  const slice = viewport === "mobile" ? asset?.mobile ?? asset : asset;
  return {
    activeAssetId: asset?.id,
    focalPoint: slice?.focalPoint ?? { ...DEFAULT_FOCAL_POINT },
    transform: slice?.transform ?? defaultTransform(),
    alt: typeof asset?.alt === "string" ? asset.alt : undefined,
  };
}

export function parseSavedSettings(raw: unknown): BynderImageSettings {
  const base = emptySettings();
  if (!isRecord(raw) || Object.keys(raw).length === 0) return base;

  const assets = asSavedAssets(raw.assets);

  return {
    v: 1,
    assets,
    focalPoint: { ...DEFAULT_FOCAL_POINT },
    transform: defaultTransform(),
  };
}

export function persistedPayload(settings: BynderImageSettings): Pick<BynderImageSettings, "v" | "assets"> {
  const next: Pick<BynderImageSettings, "v" | "assets"> = { v: 1 };
  if (settings.assets?.length) next.assets = settings.assets;
  return next;
}

export function buildSettingsPayload(
  settings: BynderImageSettings,
  extras?: Partial<Pick<BynderImageSettings, "activeAssetId" | "activeViewport">> & {
    assets?: unknown[];
    persistAssetKeys?: readonly PersistAssetKey[];
    enableDat?: boolean;
  }
): BynderImageSettings {
  const pick = <K extends "activeAssetId" | "activeViewport">(
    key: K,
    fallback: BynderImageSettings[K]
  ) => (extras && Object.prototype.hasOwnProperty.call(extras, key) ? extras[key] : fallback);

  const enableDat = extras?.enableDat !== false;
  const persistKeys = extras?.persistAssetKeys ?? REQUIRED_PERSIST_KEYS;
  const activeAssetId = pick("activeAssetId", settings.activeAssetId) || undefined;
  const activeViewport = pick("activeViewport", settings.activeViewport) === "mobile" ? "mobile" : undefined;
  const incoming = extras && Object.prototype.hasOwnProperty.call(extras, "assets") ? extras.assets : settings.assets;
  const slimIdentity = Array.isArray(incoming) && incoming.length ? slimPersistedAssets(incoming, persistKeys) : undefined;
  const merged = mergeIdentityAndCrops(slimIdentity, incoming);
  const stashed = stashActiveCrop(
    {
      ...settings,
      assets: merged,
      activeAssetId,
      activeViewport,
    },
    activeAssetId
  );
  const assets = attachAssetUrls(stashed.assets, enableDat);
  const focused = savedAssetById({ assets }, activeAssetId);
  const live = focused
    ? liveFromAsset(focused, activeViewport === "mobile" ? "mobile" : "desktop")
    : {
        focalPoint: settings.focalPoint,
        transform: settings.transform,
        alt: settings.alt,
      };

  const next: BynderImageSettings = {
    v: 1,
    assets,
    activeAssetId: focused?.id,
    activeViewport,
    focalPoint: live.focalPoint,
    transform: live.transform,
    alt: live.alt,
  };

  if (!next.assets?.length) delete next.assets;
  if (!next.activeAssetId) delete next.activeAssetId;
  if (!next.activeViewport) delete next.activeViewport;
  if (next.alt == null) delete next.alt;

  return next;
}

function mergeIdentityAndCrops(
  slim: unknown[] | undefined,
  previous: SavedBynderAsset[] | unknown[] | undefined
): SavedBynderAsset[] | undefined {
  if (!slim?.length) return undefined;
  const previousSaved = asSavedAssets(previous) ?? [];
  const byId = new Map(previousSaved.map((asset) => [asset.id, asset]));
  const next: SavedBynderAsset[] = [];
  for (const raw of slim) {
    const identity = asSavedAsset(raw);
    if (!identity) continue;
    const existing = byId.get(identity.id);
    next.push(
      existing
        ? {
            ...existing,
            id: identity.id,
            name: identity.name ?? existing.name,
            transformBaseUrl: identity.transformBaseUrl ?? existing.transformBaseUrl,
            webImage: identity.webImage ?? existing.webImage,
            alt: existing.alt ?? identity.alt,
          }
        : identity
    );
  }
  return next.length ? next : undefined;
}

function composeViewportUrl(baseUrl: string | undefined, slice: ViewportCropSettings, enableDat: boolean): string | undefined {
  if (!enableDat || !baseUrl) return undefined;
  return composeDatUrl(baseUrl, slice) || undefined;
}

function attachAssetUrls(assets: SavedBynderAsset[] | undefined, enableDat: boolean): SavedBynderAsset[] | undefined {
  if (!assets?.length) return undefined;
  return assets.map((asset) => {
    const datOn = Boolean(enableDat && asset.transformBaseUrl);
    const url = composeViewportUrl(asset.transformBaseUrl, asset, datOn);
    const mobileUrl = asset.mobile ? composeViewportUrl(asset.transformBaseUrl, asset.mobile, datOn) : undefined;
    const next: SavedBynderAsset = { ...asset };
    if (url) next.url = url;
    else delete next.url;
    if (next.mobile) {
      if (mobileUrl) next.mobile = { ...next.mobile, url: mobileUrl };
      else {
        const { url: _drop, ...mobile } = next.mobile;
        next.mobile = mobile;
      }
    }
    if (datOn) delete next.webImage;
    else if (!next.webImage && asset.webImage) next.webImage = asset.webImage;
    const transform = { ...next.transform };
    if (!transform.extraQuery) delete transform.extraQuery;
    next.transform = transform;
    if (next.mobile) {
      const mobileTransform = { ...next.mobile.transform };
      if (!mobileTransform.extraQuery) delete mobileTransform.extraQuery;
      next.mobile = { ...next.mobile, transform: mobileTransform };
    }
    return stripMatchingMobile(next) as SavedBynderAsset;
  });
}

export function stashActiveCrop(settings: BynderImageSettings, assetId?: string): BynderImageSettings {
  if (!assetId || !settings.assets?.length) return settings;
  const live: ViewportCropSettings = {
    focalPoint: { ...settings.focalPoint },
    transform: { ...settings.transform },
  };
  const viewport = resolveActiveViewport(settings);
  const assets = settings.assets.map((asset) => {
    if (asset.id !== assetId) return asset;
    const existing = asset;
    const desktop: ViewportCropSettings =
      viewport === "mobile"
        ? { focalPoint: existing.focalPoint, transform: existing.transform, url: existing.url }
        : live;
    const withLive: SavedBynderAsset =
      viewport === "mobile"
        ? viewportCropsEqual(live, desktop)
          ? { ...existing, ...desktop }
          : { ...existing, ...desktop, mobile: live }
        : { ...existing, ...live, mobile: existing.mobile };
    withLive.alt = typeof settings.alt === "string" ? settings.alt : existing.alt;
    return stripMatchingMobile(withLive);
  });
  return { ...settings, assets };
}
