import {
  parseBynderAsset,
  assetPixelSize,
  cleanAdditionalValues,
  cleanVideoPlayback,
  isDocumentAsset,
  isVideoAsset,
  resolveDocumentFileUrl,
  slimPersistedAssets,
  withBynderDownloadParam,
} from "./bynder/parseAsset";
import { normalizeFocalPoint, parseAspect } from "./bynder/composeDatUrl";
import {
  applyProfileTransform,
  aspectRatioFromPixels,
  asProfileSettings,
  originalProfileSettings,
  profileOperation,
  viewportAssetSize,
} from "./profiles";
import {
  DEFAULT_FOCAL_POINT,
  DEFAULT_TRANSFORM,
  type AdditionalFieldDefinition,
  type BynderImageSettings,
  type FocalPoint,
  type MobileViewportSettings,
  type OriginalAssetSize,
  type ProfileSettings,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asPositiveInt(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function asFocalPoint(value: unknown): FocalPoint {
  if (!isRecord(value)) return { ...DEFAULT_FOCAL_POINT };
  return normalizeFocalPoint({
    x: typeof value.x === "number" ? value.x : Number(value.x),
    y: typeof value.y === "number" ? value.y : Number(value.y),
  });
}

function asExtendBackground(value: unknown): TransformSettings["extendBackground"] {
  if (value === "auto" || value === "transparent" || value === "black" || value === "white" || value === "custom") {
    return value;
  }
  return null;
}

/**
 * Author choices from an in-memory `transform` or the flat v2 keys. Size, aspect, format, and
 * quality start at the defaults; `buildSettingsPayload` replaces them with the profile's.
 */
function asTransform(value: unknown): TransformSettings {
  const raw = isRecord(value) ? value : {};
  const operation = profileOperation(
    typeof raw.operation === "string" ? (raw.operation as TransformSettings["operation"]) : null
  );
  const extendBackground = operation === "fit" ? asExtendBackground(raw.extendBackground) : null;
  const extendBackgroundColor = typeof raw.extendBackgroundColor === "string" ? raw.extendBackgroundColor : null;
  return {
    ...DEFAULT_TRANSFORM,
    operation,
    ...(extendBackground && extendBackground !== "auto" ? { extendBackground } : {}),
    ...(extendBackground === "custom" && extendBackgroundColor ? { extendBackgroundColor } : {}),
  };
}

function asViewportCrop(value: unknown): ViewportCropSettings | undefined {
  if (!isRecord(value)) return undefined;
  const nested = isRecord(value.transform) ? value.transform : undefined;
  if (!isRecord(value.focalPoint) && !nested && typeof value.operation !== "string") return undefined;
  return {
    focalPoint: asFocalPoint(value.focalPoint),
    transform: asTransform(nested ?? value),
  };
}

function asOriginalSize(record: Record<string, unknown>, raw?: unknown): OriginalAssetSize {
  const measured = raw === undefined ? {} : assetPixelSize(raw);
  const width = asPositiveInt(record.originalAssetWidth) ?? asPositiveInt(measured.width);
  const height = asPositiveInt(record.originalAssetHeight) ?? asPositiveInt(measured.height);
  const stored = typeof record.aspectRatio === "string" ? record.aspectRatio.trim() : "";
  const aspectRatio = aspectRatioFromPixels(width, height) ?? (parseAspect(stored) ? stored : undefined);
  const next: OriginalAssetSize = {};
  if (width) next.originalAssetWidth = width;
  if (height) next.originalAssetHeight = height;
  if (aspectRatio) next.aspectRatio = aspectRatio;
  return next;
}

type MobileIdentity = Pick<
  MobileViewportSettings,
  "id" | "name" | "type" | "transformBaseUrl" | "webImage"
> &
  OriginalAssetSize;

function asMobileIdentity(value: unknown): MobileIdentity | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return undefined;
  const webImage = asWebImage(value.webImage);
  const next: MobileIdentity = { id: value.id };
  if (typeof value.name === "string" && value.name) next.name = value.name;
  if (typeof value.type === "string" && value.type) next.type = value.type;
  if (typeof value.transformBaseUrl === "string" && value.transformBaseUrl) next.transformBaseUrl = value.transformBaseUrl;
  if (webImage && !next.transformBaseUrl) next.webImage = webImage;
  Object.assign(next, asOriginalSize(value));
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

  if (isDocumentAsset(parsed) || isDocumentAsset(record as unknown as SavedBynderAsset)) {
    const fileUrl =
      (typeof record.url === "string" && record.url) ||
      resolveDocumentFileUrl(raw) ||
      undefined;
    const next: SavedBynderAsset = {
      id: parsed.id,
      name: parsed.name,
      type: "DOCUMENT",
    };
    if (fileUrl) {
      next.url = fileUrl;
      next.downloadUrl =
        (typeof record.downloadUrl === "string" && record.downloadUrl) || withBynderDownloadParam(fileUrl);
    }
    copyAuthorProperties(next, record, additionalProperties);
    return next;
  }

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
    ...asOriginalSize(record, raw),
    focalPoint: crop?.focalPoint ?? { ...DEFAULT_FOCAL_POINT },
    transform: crop?.transform ?? { ...DEFAULT_TRANSFORM },
    mobile,
    differentMobileAsset: record.differentMobileAsset === true ? true : undefined,
  };
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
    v: 2,
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

  const next: BynderImageSettings = {
    ...base,
    assets: asSavedAssets(raw.assets),
  };
  const savedProfile = readSavedProfile(raw);
  if (savedProfile.profile) next.profile = savedProfile.profile;
  if (savedProfile.profileSettings) next.profileSettings = savedProfile.profileSettings;
  return next;
}

/**
 * Current entries store `profile: { id, settings }`. Older entries stored the name as a string
 * and the snapshot as a sibling `profileSettings`.
 */
function readSavedProfile(raw: Record<string, unknown>): { profile?: string; profileSettings?: ProfileSettings } {
  const nested = isRecord(raw.profile) ? raw.profile : undefined;
  if (nested) {
    const id = typeof nested.id === "string" ? nested.id.trim() : "";
    const profileSettings = asProfileSettings(nested.settings);
    return {
      ...(id ? { profile: id } : {}),
      ...(profileSettings ? { profileSettings } : {}),
    };
  }
  const name = typeof raw.profile === "string" ? raw.profile.trim() : "";
  const profileSettings = asProfileSettings(raw.profileSettings);
  return {
    ...(name ? { profile: name } : {}),
    ...(profileSettings ? { profileSettings } : {}),
  };
}

/** Saved per viewport: focal point and the author's mode. Letterbox only for Fit. */
function persistedCrop(slice: ViewportCropSettings): Record<string, unknown> {
  const transform = slice.transform ?? DEFAULT_TRANSFORM;
  const operation = profileOperation(transform.operation);
  const out: Record<string, unknown> = {
    focalPoint: normalizeFocalPoint(slice.focalPoint),
    operation,
  };
  if (operation === "fit" && transform.extendBackground && transform.extendBackground !== "auto") {
    out.extendBackground = transform.extendBackground;
    if (transform.extendBackground === "custom" && transform.extendBackgroundColor) {
      out.extendBackgroundColor = transform.extendBackgroundColor;
    }
  }
  return out;
}

function persistedIdentity(asset: SavedBynderAsset | MobileViewportSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (asset.id) out.id = asset.id;
  if (asset.name) out.name = asset.name;
  if (asset.type) out.type = asset.type;
  if (asset.transformBaseUrl) out.transformBaseUrl = asset.transformBaseUrl;
  if (asset.webImage?.url) out.webImage = { url: asset.webImage.url };
  if (typeof asset.alt === "string") out.alt = asset.alt;
  if (asset.originalAssetWidth) out.originalAssetWidth = asset.originalAssetWidth;
  if (asset.originalAssetHeight) out.originalAssetHeight = asset.originalAssetHeight;
  const aspectRatio =
    aspectRatioFromPixels(asset.originalAssetWidth, asset.originalAssetHeight) ??
    (asset.aspectRatio && parseAspect(asset.aspectRatio) ? asset.aspectRatio : undefined);
  if (aspectRatio) out.aspectRatio = aspectRatio;
  return out;
}

function persistedAsset(asset: SavedBynderAsset): Record<string, unknown> {
  if (isDocumentAsset(asset)) return { ...asDocumentAsset(asset) };
  const image = !isVideoAsset(asset);
  const out = persistedIdentity(asset);
  if (image) Object.assign(out, persistedCrop(asset));
  if (asset.mobile) {
    const mobile = {
      ...(image ? persistedCrop(asset.mobile) : {}),
      ...(asset.mobile.id ? persistedIdentity(asset.mobile) : {}),
    };
    if (Object.keys(mobile).length) out.mobile = mobile;
  }
  if (asset.differentMobileAsset) out.differentMobileAsset = true;
  if (asset.video) out.video = asset.video;
  if (asset.additional) out.additional = asset.additional;
  return out;
}

/**
 * Entry JSON. The profile name and its resolved snapshot are one object.
 * No `id` means the original aspect ratio (`settings` then has no `aspectRatio`).
 */
export function persistedPayload(settings: BynderImageSettings): Record<string, unknown> {
  if (!settings.assets?.length) return { v: 2 };
  const snapshot = settings.profileSettings ?? originalProfileSettings();
  return {
    v: 2,
    profile: {
      ...(settings.profile ? { id: settings.profile } : {}),
      settings: snapshot,
    },
    assets: settings.assets.map(persistedAsset),
  };
}

function withProfileSizes(asset: SavedBynderAsset, profile: ProfileSettings): SavedBynderAsset {
  if (isDocumentAsset(asset)) return asset;
  const next: SavedBynderAsset = {
    ...asset,
    transform: applyProfileTransform(asset.transform ?? DEFAULT_TRANSFORM, profile, "desktop", true, asset),
  };
  if (asset.mobile) {
    next.mobile = {
      ...asset.mobile,
      transform: applyProfileTransform(
        asset.mobile.transform ?? DEFAULT_TRANSFORM,
        profile,
        "mobile",
        true,
        viewportAssetSize(asset, "mobile")
      ),
    };
  }
  return next;
}

export function buildSettingsPayload(
  settings: BynderImageSettings,
  extras?: Partial<Pick<BynderImageSettings, "activeAssetId" | "activeViewport" | "profile" | "profileSettings">> & {
    assets?: unknown[];
    omitWebImage?: boolean;
    omitName?: boolean;
    enableDat?: boolean;
    authorFields?: readonly Pick<AdditionalFieldDefinition, "property" | "type">[];
  }
): BynderImageSettings {
  const pick = <K extends "activeAssetId" | "activeViewport">(
    key: K,
    fallback: BynderImageSettings[K]
  ) => (extras && Object.prototype.hasOwnProperty.call(extras, key) ? extras[key] : fallback);

  const enableDat = extras?.enableDat !== false;
  const profile = extras && Object.prototype.hasOwnProperty.call(extras, "profile") ? extras.profile : settings.profile;
  const profileSettings = extras?.profileSettings ?? settings.profileSettings ?? originalProfileSettings();
  const additionalProperties = extras?.authorFields?.map((field) => field.property);
  const activeAssetId = pick("activeAssetId", settings.activeAssetId) || undefined;
  const activeViewport = pick("activeViewport", settings.activeViewport) === "mobile" ? "mobile" : undefined;
  const incoming = extras && Object.prototype.hasOwnProperty.call(extras, "assets") ? extras.assets : settings.assets;
  const slimIdentity = Array.isArray(incoming) && incoming.length
    ? slimPersistedAssets(incoming, {
        omitWebImage: extras?.omitWebImage,
        omitName: extras?.omitName,
        additionalProperties,
      })
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
  const cleaned = cleanAssets(stashed.assets, enableDat)?.map((asset) => withProfileSizes(asset, profileSettings));
  const assets = extras?.authorFields?.length
    ? cleaned?.map((asset) => applyAuthorFields(asset, extras.authorFields ?? []))
    : cleaned;
  const focused = savedAssetById({ assets }, activeAssetId);
  const live = focused
    ? liveFromAsset(focused, activeViewport === "mobile" ? "mobile" : "desktop")
    : {
        focalPoint: settings.focalPoint,
        transform: settings.transform,
        alt: settings.alt,
      };

  const next: BynderImageSettings = {
    v: 2,
    profile,
    profileSettings,
    assets,
    activeAssetId: focused?.id,
    activeViewport,
    focalPoint: live.focalPoint,
    transform: applyProfileTransform(
      live.transform,
      profileSettings,
      activeViewport ?? "desktop",
      true,
      viewportAssetSize(focused, activeViewport ?? "desktop")
    ),
    alt: live.alt,
  };

  if (!next.profile) delete next.profile;
  if (!next.assets?.length) delete next.assets;
  if (!next.activeAssetId) delete next.activeAssetId;
  if (!next.activeViewport) delete next.activeViewport;
  if (next.alt == null) delete next.alt;

  return next;
}

/** Drop legacy optional DAM metadata that used to live behind persistAssetKeys. */
function withoutDamMetadata(asset: SavedBynderAsset): SavedBynderAsset {
  const next = { ...asset } as SavedBynderAsset & Record<string, unknown>;
  delete next.description;
  delete next.originalUrl;
  delete next.publishedAt;
  delete next.updatedAt;
  delete next.tags;
  delete next.fileType;
  delete next.fileSize;
  delete next.width;
  delete next.height;
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
    if (isDocumentAsset(identity) || isDocumentAsset(existing)) {
      next.push(
        asDocumentAsset({
          ...identity,
          name: identity.name ?? existing?.name,
          url: identity.url ?? existing?.url,
          downloadUrl: identity.downloadUrl ?? existing?.downloadUrl,
          additional: identity.additional ?? existing?.additional,
        })
      );
      continue;
    }
    next.push(
      withoutDamMetadata(
        existing
          ? {
              ...existing,
              id: identity.id,
              name: identity.name ?? existing.name,
              type: identity.type ?? existing.type,
              transformBaseUrl: identity.transformBaseUrl ?? existing.transformBaseUrl,
              webImage: identity.webImage ?? existing.webImage,
              originalAssetWidth: existing.originalAssetWidth ?? identity.originalAssetWidth,
              originalAssetHeight: existing.originalAssetHeight ?? identity.originalAssetHeight,
              alt: existing.alt ?? identity.alt,
              additional: existing.additional ?? identity.additional,
            }
          : identity
      )
    );
  }
  return next.length ? next : undefined;
}

function asDocumentAsset(asset: SavedBynderAsset): SavedBynderAsset {
  const fileUrl = asset.url;
  const next: SavedBynderAsset = {
    id: asset.id,
    type: "DOCUMENT",
  };
  if (asset.name) next.name = asset.name;
  if (fileUrl) {
    next.url = fileUrl;
    next.downloadUrl = asset.downloadUrl || withBynderDownloadParam(fileUrl);
  } else if (asset.downloadUrl) {
    next.downloadUrl = asset.downloadUrl;
  }
  if (asset.additional) next.additional = asset.additional;
  return next;
}

/** `webImage` only without DAT; document links only on documents; matching mobile relinked. */
function cleanAssets(assets: SavedBynderAsset[] | undefined, enableDat: boolean): SavedBynderAsset[] | undefined {
  if (!assets?.length) return undefined;
  return assets.map((asset) => {
    if (isDocumentAsset(asset)) return asDocumentAsset(asset);
    const datOn = Boolean(enableDat && asset.transformBaseUrl);
    const next: SavedBynderAsset = { ...asset };
    delete next.url;
    delete next.downloadUrl;
    if (datOn) delete next.webImage;
    if (next.mobile?.transformBaseUrl) {
      const { webImage: _mobileWebImage, ...mobileRest } = next.mobile;
      next.mobile = mobileRest;
    }
    if (!next.originalAssetWidth) delete next.originalAssetWidth;
    if (!next.originalAssetHeight) delete next.originalAssetHeight;
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
      viewport === "mobile" ? { focalPoint: existing.focalPoint, transform: existing.transform } : live;
    const mobileIdentity = existing.mobile?.id
      ? {
          id: existing.mobile.id,
          name: existing.mobile.name,
          type: existing.mobile.type,
          transformBaseUrl: existing.mobile.transformBaseUrl,
          webImage: existing.mobile.webImage,
          originalAssetWidth: existing.mobile.originalAssetWidth,
          originalAssetHeight: existing.mobile.originalAssetHeight,
        }
      : {};
    const mobileLive: MobileViewportSettings = { ...live, ...mobileIdentity };
    const linkedToDesktop = { ...existing, ...desktop };
    delete linkedToDesktop.mobile;
    const withLive: SavedBynderAsset =
      viewport === "mobile"
        ? existing.differentMobileAsset || existing.mobile?.id || !viewportCropsEqual(live, desktop)
          ? { ...existing, ...desktop, mobile: mobileLive }
          : linkedToDesktop
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
