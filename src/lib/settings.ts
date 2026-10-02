import { parseBynderAsset, cleanAdditionalValues, cleanVideoPlayback, slimPersistedAssets } from "./bynder/parseAsset";
import { datQueriesForSlice, normalizeFocalPoint } from "./bynder/composeDatUrl";
import { REQUIRED_PERSIST_KEYS, type PersistAssetKey } from "./persistKeys";
import {
  DEFAULT_FOCAL_POINT,
  DEFAULT_TRANSFORM,
  type AdditionalFieldDefinition,
  type BynderImageSettings,
  type DatFormat,
  type DatOperation,
  type FocalPoint,
  type MobileViewportSettings,
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

function asDatQueries(value: unknown): { "1x": string; "2x": string } | undefined {
  if (!isRecord(value)) return undefined;
  const one = typeof value["1x"] === "string" ? value["1x"] : undefined;
  const two = typeof value["2x"] === "string" ? value["2x"] : undefined;
  if (!one || !two) return undefined;
  return { "1x": one, "2x": two };
}

function asViewportCrop(value: unknown): ViewportCropSettings | undefined {
  if (!isRecord(value)) return undefined;
  if (!isRecord(value.focalPoint) && !isRecord(value.transform)) return undefined;
  return {
    focalPoint: asFocalPoint(value.focalPoint),
    transform: asTransform(value.transform),
    dat: asDatQueries(value.dat),
  };
}

function asMobileIdentity(
  value: unknown
): Pick<MobileViewportSettings, "id" | "name" | "type" | "transformBaseUrl" | "webImage"> | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return undefined;
  const webImage = asWebImage(value.webImage);
  const next: Pick<MobileViewportSettings, "id" | "name" | "type" | "transformBaseUrl" | "webImage"> = {
    id: value.id,
  };
  if (typeof value.name === "string" && value.name) next.name = value.name;
  if (typeof value.type === "string" && value.type) next.type = value.type;
  if (typeof value.transformBaseUrl === "string" && value.transformBaseUrl) next.transformBaseUrl = value.transformBaseUrl;
  if (webImage && !next.transformBaseUrl) next.webImage = webImage;
  return next;
}

function asMobileViewport(value: unknown): MobileViewportSettings | undefined {
  if (!isRecord(value)) return undefined;
  const crop = asViewportCrop(value);
  const identity = asMobileIdentity(value) ?? asMobileIdentity(value.asset);
  if (!crop && !identity) return undefined;
  return {
    focalPoint: crop?.focalPoint ?? { ...DEFAULT_FOCAL_POINT },
    transform: crop?.transform ?? { ...DEFAULT_TRANSFORM },
    dat: crop?.dat,
    ...identity,
    alt: typeof value.alt === "string" ? value.alt : undefined,
  };
}

function asWebImage(value: unknown, fallback?: string): { url: string } | undefined {
  if (isRecord(value) && typeof value.url === "string" && value.url) return { url: value.url };
  if (typeof value === "string" && value) return { url: value };
  if (fallback) return { url: fallback };
  return undefined;
}

export function asSavedAsset(raw: unknown, additionalProperties?: readonly string[]): SavedBynderAsset | null {
  const parsed = parseBynderAsset(raw);
  if (!parsed) return null;
  const record = isRecord(raw) ? raw : {};
  const files = isRecord(record.files) ? record.files : {};
  const crop = asViewportCrop(record);
  const mobile = isRecord(record.mobile) ? asMobileViewport(record.mobile) : undefined;
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
    type: parsed.type,
    alt: typeof record.alt === "string" ? record.alt : parsed.alt,
    transformBaseUrl,
    webImage,
    focalPoint: crop?.focalPoint ?? { ...DEFAULT_FOCAL_POINT },
    transform: crop?.transform ?? { ...DEFAULT_TRANSFORM },
    dat: crop?.dat,
    mobile,
    differentMobileAsset: record.differentMobileAsset === true ? true : undefined,
  };
  if (typeof record.description === "string" && record.description) next.description = record.description;
  if (typeof record.originalUrl === "string" && record.originalUrl) next.originalUrl = record.originalUrl;
  if (typeof record.publishedAt === "string" && record.publishedAt) next.publishedAt = record.publishedAt;
  if (typeof record.updatedAt === "string" && record.updatedAt) next.updatedAt = record.updatedAt;
  if (Array.isArray(record.tags)) {
    const tags = record.tags.filter((item): item is string => typeof item === "string" && Boolean(item));
    if (tags.length) next.tags = tags;
  }
  if (typeof record.fileType === "string" && record.fileType) next.fileType = record.fileType;
  if (typeof record.fileSize === "number" && record.fileSize > 0) next.fileSize = record.fileSize;
  if (typeof record.width === "number" && record.width > 0) next.width = record.width;
  if (typeof record.height === "number" && record.height > 0) next.height = record.height;
  const video = cleanVideoPlayback(record.video);
  if (video) next.video = video;
  copyAuthorProperties(next, record, additionalProperties);
  return stripMatchingMobile(next) as SavedBynderAsset;
}

function isAuthorValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function copyAuthorProperties(
  next: SavedBynderAsset,
  record: Record<string, unknown>,
  names?: readonly string[]
) {
  const nested = cleanAdditionalValues(record.additional) ?? {};
  const keys = names ?? Object.keys(nested);
  const additional: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const direct = record[key];
    const value = isAuthorValue(direct) ? direct : nested[key];
    if (typeof value === "string" && value === "") continue;
    if (isAuthorValue(value)) additional[key] = value;
  }
  if (Object.keys(additional).length) next.additional = additional;
  else delete next.additional;
}

/** Puts configured additionalFields under `additional`. Booleans default to false so the key is saved. */
export function applyAuthorFields(
  asset: SavedBynderAsset,
  fields: readonly Pick<AdditionalFieldDefinition, "property" | "type">[]
): SavedBynderAsset {
  if (!fields.length) return asset;
  const root = asset as unknown as Record<string, unknown>;
  const nested = cleanAdditionalValues(asset.additional) ?? {};
  const additional: Record<string, string | number | boolean> = {};
  for (const field of fields) {
    const direct = root[field.property];
    const value = isAuthorValue(direct) ? direct : nested[field.property];
    if (typeof value === "string" && value === "") continue;
    else if (isAuthorValue(value)) additional[field.property] = value;
    else if (field.type === "boolean") additional[field.property] = false;
  }
  const next: SavedBynderAsset = { ...asset };
  for (const field of fields) delete (next as unknown as Record<string, unknown>)[field.property];
  if (Object.keys(additional).length) next.additional = additional;
  else delete next.additional;
  return next;
}

export function asSavedAssets(value: unknown, additionalProperties?: readonly string[]): SavedBynderAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value
    .map((item) => asSavedAsset(item, additionalProperties))
    .filter((item): item is SavedBynderAsset => Boolean(item));
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
    alt:
      viewport === "mobile" && asset?.mobile?.id
        ? typeof asset.mobile.alt === "string"
          ? asset.mobile.alt
          : undefined
        : typeof asset?.alt === "string"
          ? asset.alt
          : undefined,
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
    omitWebImage?: boolean;
    enableDat?: boolean;
    authorFields?: readonly Pick<AdditionalFieldDefinition, "property" | "type">[];
  }
): BynderImageSettings {
  const pick = <K extends "activeAssetId" | "activeViewport">(
    key: K,
    fallback: BynderImageSettings[K]
  ) => (extras && Object.prototype.hasOwnProperty.call(extras, key) ? extras[key] : fallback);

  const enableDat = extras?.enableDat !== false;
  const persistKeys = extras?.persistAssetKeys ?? REQUIRED_PERSIST_KEYS;
  const additionalProperties = extras?.authorFields?.map((field) => field.property);
  const activeAssetId = pick("activeAssetId", settings.activeAssetId) || undefined;
  const activeViewport = pick("activeViewport", settings.activeViewport) === "mobile" ? "mobile" : undefined;
  const incoming = extras && Object.prototype.hasOwnProperty.call(extras, "assets") ? extras.assets : settings.assets;
  const slimIdentity = Array.isArray(incoming) && incoming.length
    ? slimPersistedAssets(incoming, persistKeys, { omitWebImage: extras?.omitWebImage, additionalProperties })
    : undefined;
  const merged = mergeIdentityAndCrops(slimIdentity, incoming, additionalProperties);
  const stashed = stashActiveCrop(
    {
      ...settings,
      assets: merged,
      activeAssetId,
      activeViewport,
    },
    activeAssetId
  );
  const assets = extras?.authorFields?.length
    ? attachAssetUrls(stashed.assets, enableDat)?.map((asset) => applyAuthorFields(asset, extras.authorFields ?? []))
    : attachAssetUrls(stashed.assets, enableDat);
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
  previous: SavedBynderAsset[] | unknown[] | undefined,
  additionalProperties?: readonly string[]
): SavedBynderAsset[] | undefined {
  if (!slim?.length) return undefined;
  const previousSaved = asSavedAssets(previous, additionalProperties) ?? [];
  const byId = new Map(previousSaved.map((asset) => [asset.id, asset]));
  const next: SavedBynderAsset[] = [];
  for (const raw of slim) {
    const identity = asSavedAsset(raw, additionalProperties);
    if (!identity) continue;
    const existing = byId.get(identity.id);
    next.push(
      existing
        ? {
            ...existing,
            id: identity.id,
            name: identity.name ?? existing.name,
            type: identity.type ?? existing.type,
            transformBaseUrl: identity.transformBaseUrl ?? existing.transformBaseUrl,
            webImage: identity.webImage ?? existing.webImage,
            alt: existing.alt ?? identity.alt,
            additional: existing.additional ?? identity.additional,
          }
        : identity
    );
  }
  return next.length ? next : undefined;
}

function composeViewportUrl(baseUrl: string | undefined, slice: ViewportCropSettings, enableDat: boolean) {
  if (!enableDat || !baseUrl) return undefined;
  return datQueriesForSlice(slice);
}

function attachAssetUrls(assets: SavedBynderAsset[] | undefined, enableDat: boolean): SavedBynderAsset[] | undefined {
  if (!assets?.length) return undefined;
  return assets.map((asset) => {
    const datOn = Boolean(enableDat && asset.transformBaseUrl);
    const url = composeViewportUrl(asset.transformBaseUrl, asset, datOn);
    const mobileBase = asset.mobile?.id
      ? asset.mobile.transformBaseUrl
      : asset.differentMobileAsset
        ? undefined
        : asset.transformBaseUrl;
    const mobileUrl = asset.mobile ? composeViewportUrl(mobileBase, asset.mobile, Boolean(enableDat && mobileBase)) : undefined;
    const next: SavedBynderAsset = { ...asset };
    if (url) next.dat = url;
    else delete next.dat;
    delete next.url;
    if (next.mobile) {
      if (mobileUrl) {
        const { url: _legacy, ...mobile } = next.mobile;
        next.mobile = { ...mobile, dat: mobileUrl };
      } else {
        const { dat: _drop, ...mobile } = next.mobile;
        next.mobile = mobile;
      }
    }
    if (datOn) delete next.webImage;
    else if (!next.webImage && asset.webImage) next.webImage = asset.webImage;
    if (next.mobile?.transformBaseUrl) {
      const { webImage: _mobileWebImage, ...mobileRest } = next.mobile;
      next.mobile = mobileRest;
    }
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
        ? { focalPoint: existing.focalPoint, transform: existing.transform, dat: existing.dat }
        : live;
    const mobileIdentity = existing.mobile?.id
      ? {
          id: existing.mobile.id,
          name: existing.mobile.name,
          type: existing.mobile.type,
          transformBaseUrl: existing.mobile.transformBaseUrl,
          webImage: existing.mobile.webImage,
        }
      : {};
    const mobileLive: MobileViewportSettings = { ...live, ...mobileIdentity };
    const withLive: SavedBynderAsset =
      viewport === "mobile"
        ? existing.differentMobileAsset || existing.mobile?.id || !viewportCropsEqual(live, desktop)
          ? { ...existing, ...desktop, mobile: mobileLive }
          : { ...existing, ...desktop }
        : { ...existing, ...live, mobile: existing.mobile };
    const separateMobile = Boolean(existing.differentMobileAsset || existing.mobile?.id);
    if (viewport === "mobile" && separateMobile) {
      withLive.alt = existing.alt;
      if (withLive.mobile && typeof settings.alt === "string") withLive.mobile = { ...withLive.mobile, alt: settings.alt };
    } else {
      withLive.alt = typeof settings.alt === "string" ? settings.alt : existing.alt;
    }
    return stripMatchingMobile(withLive);
  });
  return { ...settings, assets };
}
