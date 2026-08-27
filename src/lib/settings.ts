import {
  DEFAULT_FOCAL_POINT,
  DEFAULT_TRANSFORM,
  type BynderImageSettings,
  type DatFormat,
  type DatOperation,
  type FocalPoint,
  type TransformSettings,
} from "./types";
import { composeDatUrl, normalizeFocalPoint } from "./bynder/composeDatUrl";

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

export function defaultTransform(): TransformSettings {
  return { ...DEFAULT_TRANSFORM };
}

export function emptySettings(sourceFieldUid = ""): BynderImageSettings {
  const next: BynderImageSettings = {
    v: 1,
    datEnabled: false,
    focalPoint: { ...DEFAULT_FOCAL_POINT },
    transform: defaultTransform(),
  };
  if (sourceFieldUid) next.sourceFieldUid = sourceFieldUid;
  return next;
}

export function parseSavedSettings(raw: unknown, sourceFieldUid = ""): BynderImageSettings {
  const base = emptySettings(sourceFieldUid);
  if (!isRecord(raw) || Object.keys(raw).length === 0) return base;

  const transformRaw = isRecord(raw.transform) ? raw.transform : {};
  const transform: TransformSettings = {
    operation: asOperation(transformRaw.operation),
    width: asOptionalNumber(transformRaw.width) ?? DEFAULT_TRANSFORM.width,
    height: asOptionalNumber(transformRaw.height) ?? DEFAULT_TRANSFORM.height,
    aspect: typeof transformRaw.aspect === "string" ? transformRaw.aspect : DEFAULT_TRANSFORM.aspect,
    format: asFormat(transformRaw.format) ?? DEFAULT_TRANSFORM.format,
    quality: asOptionalNumber(transformRaw.quality) ?? DEFAULT_TRANSFORM.quality,
    extraQuery: typeof transformRaw.extraQuery === "string" ? transformRaw.extraQuery : "",
  };

  return {
    v: 1,
    sourceFieldUid: typeof raw.sourceFieldUid === "string" && raw.sourceFieldUid ? raw.sourceFieldUid : sourceFieldUid || undefined,
    assetId: typeof raw.assetId === "string" ? raw.assetId : undefined,
    transformBaseUrl: typeof raw.transformBaseUrl === "string" ? raw.transformBaseUrl : undefined,
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : undefined,
    datEnabled: typeof raw.datEnabled === "boolean" ? raw.datEnabled : false,
    assets: Array.isArray(raw.assets) ? raw.assets : undefined,
    focalPoint: asFocalPoint(raw.focalPoint),
    transform,
    url: typeof raw.url === "string" ? raw.url : undefined,
  };
}

export function buildSettingsPayload(
  settings: BynderImageSettings,
  extras?: Partial<
    Pick<BynderImageSettings, "assetId" | "transformBaseUrl" | "sourceFieldUid" | "sourceUrl" | "datEnabled" | "assets">
  >
): BynderImageSettings {
  type ExtraKey = "assetId" | "transformBaseUrl" | "sourceFieldUid" | "sourceUrl" | "datEnabled" | "assets";
  const pick = <K extends ExtraKey>(key: K, fallback: BynderImageSettings[K]) =>
    extras && Object.prototype.hasOwnProperty.call(extras, key) ? extras[key] : fallback;

  const datEnabled = Boolean(pick("datEnabled", settings.datEnabled ?? false));
  const transformBaseUrl = pick("transformBaseUrl", settings.transformBaseUrl) || undefined;
  const sourceUrl = pick("sourceUrl", settings.sourceUrl) || undefined;
  const assetId = pick("assetId", settings.assetId) || undefined;
  const assets = pick("assets", settings.assets);
  const sourceFieldUid = pick("sourceFieldUid", settings.sourceFieldUid) || undefined;

  const next: BynderImageSettings = {
    v: 1,
    sourceFieldUid,
    assetId,
    transformBaseUrl,
    sourceUrl,
    datEnabled,
    assets: Array.isArray(assets) && assets.length ? assets : undefined,
    focalPoint: normalizeFocalPoint(settings.focalPoint),
    transform: { ...settings.transform },
  };

  if (datEnabled && transformBaseUrl) {
    next.url = composeDatUrl(transformBaseUrl, {
      focalPoint: next.focalPoint,
      transform: next.transform,
    });
  } else {
    delete next.url;
  }

  if (!next.assetId) delete next.assetId;
  if (!next.transformBaseUrl) delete next.transformBaseUrl;
  if (!next.sourceUrl) delete next.sourceUrl;
  if (!next.sourceFieldUid) delete next.sourceFieldUid;
  if (!next.assets?.length) delete next.assets;

  return next;
}
