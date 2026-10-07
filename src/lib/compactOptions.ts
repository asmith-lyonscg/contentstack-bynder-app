import type {
  CompactAssetFilter,
  CompactAssetType,
  CompactTheme,
  CompactViewConfig,
  DatPresetSettings,
} from "./types";
import { DEFAULT_COMPACT_ASSET_TYPES } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickBool(record: Record<string, unknown> | null, key: string): boolean | undefined {
  const value = record?.[key];
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return undefined;
}

function pickNumber(record: Record<string, unknown> | null, key: string): number | undefined {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

function compactViewOptionsFrom(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  const custom = asRecord(record.custom_settings);
  return (
    asRecord(record.compactViewConfig) ??
    asRecord(custom?.compactViewConfig) ??
    asRecord(record.compact_view_options) ??
    asRecord(custom?.compact_view_options)
  );
}

function datSettingsFrom(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  return asRecord(record.dat_settings) ?? asRecord(asRecord(record.custom_settings)?.dat_settings);
}

const ASSET_TYPES: CompactAssetType[] = ["AUDIO", "DOCUMENT", "IMAGE", "VIDEO", "ARCHIVE"];

function asAssetType(value: unknown): CompactAssetType | undefined {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  return ASSET_TYPES.includes(raw as CompactAssetType) ? (raw as CompactAssetType) : undefined;
}

function acceptAssetTypes(record: Record<string, unknown> | null): CompactAssetType[] | undefined {
  const raw = pickString(record, "accept") ?? pickString(record, "media");
  if (!raw) return undefined;
  const key = raw.toLowerCase().replace(/\s+/g, "");
  if (key === "image") return ["IMAGE"];
  if (key === "video") return ["VIDEO"];
  if (key === "pdf" || key === "document") return ["DOCUMENT"];
  if (key === "image/video" || key === "image,video" || key === "video/image") return ["IMAGE", "VIDEO"];
  return undefined;
}

function pickAssetTypes(record: Record<string, unknown> | null): CompactAssetType[] | undefined {
  const raw = record?.assetTypes ?? record?.assetType;
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;]/) : [];
  const types = items.map(asAssetType).filter((item): item is CompactAssetType => Boolean(item));
  return types.length ? types : undefined;
}

function pickAssetFilter(record: Record<string, unknown> | null): CompactAssetFilter | undefined {
  const raw = asRecord(record?.assetFilter);
  if (!raw) return undefined;
  const predefinedAssetType = Array.isArray(raw.predefinedAssetType)
    ? raw.predefinedAssetType.map(asAssetType).filter((item): item is CompactAssetType => Boolean(item))
    : undefined;
  const predefinedTagNames = Array.isArray(raw.predefinedTagNames)
    ? raw.predefinedTagNames.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : undefined;
  const filter: CompactAssetFilter = {
    predefinedAssetType: predefinedAssetType?.length ? predefinedAssetType : undefined,
    collectionId: pickString(raw, "collectionId"),
    predefinedMetapropertiesOptions: asRecord(raw.predefinedMetapropertiesOptions) as
      | CompactAssetFilter["predefinedMetapropertiesOptions"]
      | undefined,
    searchTerm: pickString(raw, "searchTerm"),
    predefinedTagNames: predefinedTagNames?.length ? predefinedTagNames : undefined,
    isLimitedUse: pickBool(raw, "isLimitedUse"),
    showToolbar: pickBool(raw, "showToolbar"),
  };
  const cleaned = Object.fromEntries(
    Object.entries(filter).filter(([, item]) => item !== undefined)
  ) as CompactAssetFilter;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function pickTheme(record: Record<string, unknown> | null): CompactTheme | undefined {
  const raw = asRecord(record?.theme);
  if (!raw) return undefined;
  const theme: CompactTheme = {
    colorPrimary: pickString(raw, "colorPrimary"),
    colorButtonPrimary: pickString(raw, "colorButtonPrimary"),
    colorButtonPrimaryLabel: pickString(raw, "colorButtonPrimaryLabel"),
    colorButtonPrimaryActive: pickString(raw, "colorButtonPrimaryActive"),
    colorButtonPrimaryHover: pickString(raw, "colorButtonPrimaryHover"),
    colorButtonPrimaryHoverLabel: pickString(raw, "colorButtonPrimaryHoverLabel"),
  };
  const cleaned = Object.fromEntries(
    Object.entries(theme).filter(([, item]) => Boolean(item))
  ) as CompactTheme;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function pickDatPresets(value: unknown): DatPresetSettings | undefined {
  const raw = datSettingsFrom(value);
  if (!raw) return undefined;
  const options = Array.isArray(raw.options)
    ? raw.options.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  const transformationOptions = asRecord(raw.transformation_options) ?? asRecord(raw.transformationOptions) ?? {};
  const mapped: Record<string, string> = {};
  for (const [key, item] of Object.entries(transformationOptions)) {
    if (typeof item === "string" && item.trim()) mapped[key] = item.trim();
  }
  if (!options.length && !Object.keys(mapped).length && !pickString(raw, "default")) return undefined;
  return {
    options,
    default: pickString(raw, "default"),
    transformationOptions: mapped,
  };
}

function pickMaxLimit(value: unknown, depth = 0): number | undefined {
  if (depth > 5) return undefined;
  let record = asRecord(value);
  if (!record && typeof value === "string" && value.trim()) {
    try {
      record = asRecord(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (!record) return undefined;
  const advanced = asRecord(record.advanced);
  const found =
    pickNumber(record, "maxNumberOfAssets") ??
    pickNumber(record, "max_number_of_assets") ??
    pickNumber(record, "maxAssets") ??
    pickNumber(advanced, "max_limit") ??
    pickNumber(advanced, "maxLimit") ??
    pickNumber(record, "max_limit") ??
    pickNumber(record, "maxLimit");
  if (found) return found;
  for (const nestedValue of [record.config, record.custom_settings, record.field_metadata, record.fieldConfig]) {
    const fromNested = pickMaxLimit(nestedValue, depth + 1);
    if (fromNested) return fromNested;
  }
  return undefined;
}

function firstCompactOptions(fieldConfig: unknown, appConfig: unknown): Record<string, unknown> | null {
  return compactViewOptionsFrom(fieldConfig) ?? compactViewOptionsFrom(appConfig);
}

export function resolveCompactViewConfig(fieldConfig: unknown, appConfig: unknown): CompactViewConfig {
  const options = firstCompactOptions(fieldConfig, appConfig);
  const field = asRecord(fieldConfig);
  const app = asRecord(appConfig);
  const maxLimit = pickMaxLimit(fieldConfig) ?? pickMaxLimit(appConfig) ?? 1;
  // Never SingleSelectFile — DAT uses files.transformBaseUrl on the asset.
  const mode = maxLimit > 1 ? "MultiSelect" : "SingleSelect";
  const pickedFilter = pickAssetFilter(options);
  const datPresets = pickDatPresets(fieldConfig) ?? pickDatPresets(appConfig);
  const assetTypes =
    acceptAssetTypes(field) ??
    acceptAssetTypes(app) ??
    pickAssetTypes(options) ??
    pickedFilter?.predefinedAssetType ??
    [...DEFAULT_COMPACT_ASSET_TYPES];
  // Predefined assetFilter hides UCV search/filters unless showToolbar is true
  // (Bynder default). Restrict types with assetTypes; only pass assetFilter when
  // the field config actually set one.
  const assetFilter = pickedFilter
    ? { ...pickedFilter, showToolbar: pickedFilter.showToolbar ?? true }
    : undefined;

  return {
    language:
      pickString(options, "language") ??
      pickString(field, "compactLanguage") ??
      pickString(app, "compactLanguage") ??
      "en_US",
    mode,
    assetTypes,
    defaultSearchTerm: pickString(options, "defaultSearchTerm") ?? pickedFilter?.searchTerm,
    theme: pickTheme(options),
    hideExternalAccess: pickBool(options, "hideExternalAccess"),
    hideLimitedUse: pickBool(options, "hideLimitedUse"),
    hideSwitch: pickBool(options, "hideSwitch"),
    noCache: pickBool(options, "noCache"),
    selectAllOption: pickBool(options, "selectAllOption"),
    defaultImageDerivativeName:
      pickString(options, "defaultImageDerivativeName") ?? datPresets?.default,
    defaultVideoDerivativeName: pickString(options, "defaultVideoDerivativeName"),
    isPersonal: pickBool(options, "isPersonal"),
    enableDASH: pickBool(options, "enableDASH"),
    embedType: options?.embedType === "iframe" ? "iframe" : options?.embedType === "script" ? "script" : undefined,
    assetFilter,
    maxLimit,
    datPresets,
  };
}
