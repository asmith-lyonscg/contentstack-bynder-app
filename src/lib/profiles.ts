import { parseAspect } from "./bynder/composeDatUrl";
import {
  DEFAULT_FORMAT,
  DEFAULT_MAX_DIMENSION,
  DEFAULT_MAX_WIDTHS,
  DEFAULT_QUALITY,
  type CropFieldConfig,
  type DatFormat,
  type DatOperation,
  type MaxWidths,
  type OriginalAssetSize,
  type ProfileSettings,
  type ProfileViewportSettings,
  type RenderProfile,
  type RenderProfileViewport,
  type SavedBynderAsset,
  type TransformSettings,
  type ViewportKind,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function pickRaw(config: unknown, key: string): unknown {
  const record = asRecord(config);
  if (!record) return undefined;
  if (record[key] !== undefined) return record[key];
  return asRecord(record.custom_settings)?.[key];
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export function parseDatFormat(value: unknown): DatFormat | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "jpeg") return "jpg";
  if (normalized === "jpg" || normalized === "png" || normalized === "webp" || normalized === "avif") {
    return normalized;
  }
  return undefined;
}

export const PROFILE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** App Config `maxDesktopWidth` / `maxMobileWidth`, or 2000 / 960. */
export function resolveMaxWidths(appConfig: unknown): MaxWidths {
  return {
    desktop: positiveInt(pickRaw(appConfig, "maxDesktopWidth")) ?? DEFAULT_MAX_WIDTHS.desktop,
    mobile: positiveInt(pickRaw(appConfig, "maxMobileWidth")) ?? DEFAULT_MAX_WIDTHS.mobile,
  };
}

/** App Config `maxDimension`, or 2000. Bynder's limit on either side of a transform. */
export function resolveMaxDimension(appConfig: unknown): number {
  return positiveInt(pickRaw(appConfig, "maxDimension")) ?? DEFAULT_MAX_DIMENSION;
}

/**
 * Largest width at `aspectRatio` whose width and height are both within `maxDimension`.
 * Without an aspect, only the width is capped.
 */
export function widthWithinMaxDimension(width: number, aspectRatio: string | undefined, maxDimension: number): number {
  const max = Math.max(1, Math.round(maxDimension));
  let next = Math.max(1, Math.min(Math.round(width), max));
  if (!aspectRatio || heightForWidth(aspectRatio, next) <= max) return next;
  const parsed = parseAspect(aspectRatio);
  if (!parsed) return next;
  next = Math.max(1, Math.floor((max * parsed.w) / parsed.h));
  while (next > 1 && heightForWidth(aspectRatio, next) > max) next -= 1;
  return next;
}

/**
 * Dotted paths of object keys that appear more than once in JSON `text`. `JSON.parse` silently keeps
 * the last one, so this reads the raw text. Top-level paths are profile names.
 */
export function duplicateJsonKeys(text: string): string[] {
  const found: string[] = [];
  const stack: { object: boolean; keys: Set<string>; path: string }[] = [];
  let lastKey: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      const frame = stack[stack.length - 1];
      if (frame?.object && text[k] === ":") {
        let key = text.slice(i + 1, j);
        try {
          key = JSON.parse(`"${key}"`) as string;
        } catch {
          // Keep the raw spelling.
        }
        const path = frame.path ? `${frame.path}.${key}` : key;
        if (frame.keys.has(key)) found.push(path);
        else frame.keys.add(key);
        lastKey = path;
      }
      i = j;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push({ object: ch === "{", keys: new Set(), path: lastKey ?? stack[stack.length - 1]?.path ?? "" });
      lastKey = undefined;
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      lastKey = undefined;
    } else if (ch === ",") {
      lastKey = undefined;
    }
  }
  return found;
}

function parseProfileViewport(
  raw: unknown,
  where: string,
  cap: { width: number; key: string } | undefined,
  maxDimension: number,
  errors: string[]
): RenderProfileViewport | undefined {
  const record = asRecord(raw);
  if (!record) {
    errors.push(`${where} is required: an object with "aspectRatio" and "maxWidth".`);
    return undefined;
  }
  const aspectRatio = typeof record.aspectRatio === "string" ? record.aspectRatio.trim() : "";
  const maxWidth = positiveInt(record.maxWidth);
  if (record.aspectRatio === undefined) errors.push(`${where}.aspectRatio is required, e.g. "16:9".`);
  else if (!parseAspect(aspectRatio)) errors.push(`${where}.aspectRatio must look like "16:9".`);
  if (record.maxWidth === undefined) errors.push(`${where}.maxWidth is required, in pixels.`);
  else if (!maxWidth) errors.push(`${where}.maxWidth must be a positive number of pixels.`);
  if (!parseAspect(aspectRatio) || !maxWidth) return undefined;
  if (maxWidth > maxDimension) {
    errors.push(`${where}.maxWidth (${maxWidth}) is above maxDimension (${maxDimension}).`);
  }
  let width = maxWidth;
  if (cap && width > cap.width) {
    errors.push(`${where}.maxWidth (${width}) is above ${cap.key} (${cap.width}).`);
    width = cap.width;
  }
  const height = heightForWidth(aspectRatio, width);
  if (height > maxDimension && width <= maxDimension) {
    errors.push(
      `${where} would be ${width}×${height}, above the Bynder max dimension of ${maxDimension}. Bynder returns the original file when either side is larger.`
    );
  }
  return { aspectRatio, maxWidth: width };
}

function parseProfile(
  raw: unknown,
  name: string,
  maxWidths: MaxWidths | undefined,
  maxDimension: number,
  errors: string[],
  label = "profiles"
): RenderProfile | undefined {
  const where = `${label}.${name}`;
  const record = asRecord(raw);
  if (!record) {
    errors.push(`${where} must be an object with "desktop" and "mobile".`);
    return undefined;
  }
  const desktop = parseProfileViewport(
    record.desktop,
    `${where}.desktop`,
    maxWidths && { width: maxWidths.desktop, key: "maxDesktopWidth" },
    maxDimension,
    errors
  );
  const mobile = parseProfileViewport(
    record.mobile,
    `${where}.mobile`,
    maxWidths && { width: maxWidths.mobile, key: "maxMobileWidth" },
    maxDimension,
    errors
  );

  let quality = DEFAULT_QUALITY;
  let validQuality = true;
  if (record.quality !== undefined) {
    const q = positiveInt(record.quality);
    if (!q || q > 100) {
      errors.push(`${where}.quality must be 1–100.`);
      validQuality = false;
    } else quality = q;
  }

  let format = DEFAULT_FORMAT;
  let validFormat = true;
  if (record.format !== undefined) {
    const f = parseDatFormat(record.format);
    if (!f) {
      errors.push(`${where}.format must be "webp", "avif", "jpg", or "png".`);
      validFormat = false;
    } else format = f;
  }

  if (!desktop || !mobile || !validQuality || !validFormat) return undefined;
  return { desktop, mobile, quality, format };
}

export interface ParsedRenderProfiles {
  profiles: Record<string, RenderProfile>;
  /** Empty when every profile is valid. */
  errors: string[];
}

/**
 * Validates App Config `profiles`. Malformed profiles are dropped; a `maxWidth` above the App Config
 * cap or above `maxDimension` is reported. Duplicate names are only detectable when `raw` is the JSON text.
 */
export function parseRenderProfiles(
  raw: unknown,
  maxWidths?: MaxWidths,
  maxDimension = DEFAULT_MAX_DIMENSION,
  label = "profiles"
): ParsedRenderProfiles {
  const value = parseJson(raw);
  if (value === undefined || value === null || value === "") return { profiles: {}, errors: [] };
  const record = asRecord(value);
  if (!record) return { profiles: {}, errors: [`"${label}" must be an object keyed by profile name.`] };

  const errors: string[] = [];
  if (typeof raw === "string") {
    for (const path of duplicateJsonKeys(raw)) {
      errors.push(
        path.includes(".")
          ? `"${path}" is set more than once.`
          : `Profile name "${path}" is used more than once. Each profile needs a unique name.`
      );
    }
  }
  const profiles: Record<string, RenderProfile> = {};
  for (const [name, item] of Object.entries(record)) {
    if (name === CUSTOM_PROFILE_ID) {
      errors.push(`Profile name "${CUSTOM_PROFILE_ID}" is reserved for the custom aspect ratio option.`);
      continue;
    }
    if (!PROFILE_NAME.test(name)) {
      errors.push(`Profile name "${name}" must start with a letter and use only letters, numbers, "_", or "-".`);
      continue;
    }
    const profile = parseProfile(item, name, maxWidths, maxDimension, errors, label);
    if (profile) profiles[name] = profile;
  }
  return { profiles, errors };
}

function parseNameList(value: unknown): string[] | undefined {
  const parsed = parseJson(value);
  const items = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "string"
      ? parsed.split(/[,;]/)
      : undefined;
  if (!items) return undefined;
  const names = items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return names.length ? names : undefined;
}

export interface ResolvedProfiles {
  profiles: Record<string, RenderProfile>;
  allowed: string[];
  defaultProfile?: string;
  allowOriginal: boolean;
  /** True only when the field Config Parameter sets `"profile"`. Authors get no dropdown. */
  profileLocked: boolean;
  maxWidths: MaxWidths;
  /** Problems in the field Config Parameter `fieldProfiles` object. Valid profiles are still kept. */
  fieldProfileErrors: string[];
}

/**
 * App Config defines `profiles`. A field may add its own with `fieldProfiles` (same object shape;
 * a matching name replaces the App Config profile for this field only). `"profile": "hero"` locks
 * one profile and hides the dropdown. `"profiles": ["hero", …]` narrows the dropdown. Without that
 * list, every App Config profile and every field profile is offered. Without a lock or a default,
 * entries start at the asset's original aspect ratio, and authors may keep it.
 */
export function resolveProfiles(fieldConfig: unknown, appConfig: unknown): ResolvedProfiles {
  const maxWidths = resolveMaxWidths(appConfig);
  const maxDimension = resolveMaxDimension(appConfig);
  const appProfiles = parseRenderProfiles(pickRaw(appConfig, "profiles"), maxWidths, maxDimension).profiles;
  const fieldParsed = parseRenderProfiles(
    pickRaw(fieldConfig, "fieldProfiles"),
    maxWidths,
    maxDimension,
    "fieldProfiles"
  );
  const profiles = { ...appProfiles, ...fieldParsed.profiles };
  const fieldNames = Object.keys(fieldParsed.profiles);
  const names = [...fieldNames, ...Object.keys(appProfiles).filter((name) => !fieldNames.includes(name))];
  const locked = pickRaw(fieldConfig, "profile");
  const lockedName = typeof locked === "string" ? locked.trim() : "";
  if (lockedName && names.includes(lockedName)) {
    return {
      profiles,
      allowed: [lockedName],
      defaultProfile: lockedName,
      allowOriginal: false,
      profileLocked: true,
      maxWidths,
      fieldProfileErrors: fieldParsed.errors,
    };
  }
  const requested = parseNameList(pickRaw(fieldConfig, "profiles"));
  const allowed = requested
    ? requested.filter((name, index) => names.includes(name) && requested.indexOf(name) === index)
    : names;
  const wanted = pickRaw(fieldConfig, "defaultProfile");
  const defaultProfile =
    typeof wanted === "string" && allowed.includes(wanted.trim()) ? wanted.trim() : undefined;
  return {
    profiles,
    allowed,
    defaultProfile,
    allowOriginal: !defaultProfile,
    profileLocked: false,
    maxWidths,
    fieldProfileErrors: fieldParsed.errors,
  };
}

function withMaxDimension(settings: ProfileSettings, maxDimension: number): ProfileSettings {
  if (maxDimension === DEFAULT_MAX_DIMENSION) return settings;
  return { ...settings, maxDimension };
}

/** No profile: each asset keeps its own aspect ratio, capped at the App Config max widths. */
export function originalProfileSettings(
  maxWidths: MaxWidths = DEFAULT_MAX_WIDTHS,
  maxDimension = DEFAULT_MAX_DIMENSION
): ProfileSettings {
  return withMaxDimension(
    {
      desktop: { targetWidth: maxWidths.desktop },
      mobile: { targetWidth: maxWidths.mobile },
      quality: DEFAULT_QUALITY,
      format: DEFAULT_FORMAT,
    },
    maxDimension
  );
}

export function profileSettingsFrom(profile: RenderProfile, maxDimension = DEFAULT_MAX_DIMENSION): ProfileSettings {
  return withMaxDimension(
    {
      desktop: { aspectRatio: profile.desktop.aspectRatio, targetWidth: profile.desktop.maxWidth },
      mobile: { aspectRatio: profile.mobile.aspectRatio, targetWidth: profile.mobile.maxWidth },
      quality: profile.quality,
      format: profile.format,
    },
    maxDimension
  );
}

function asViewportSettings(raw: unknown): ProfileViewportSettings | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const targetWidth = positiveInt(record.targetWidth);
  if (!targetWidth) return undefined;
  if (record.aspectRatio === undefined) return { targetWidth };
  const aspectRatio = typeof record.aspectRatio === "string" ? record.aspectRatio.trim() : "";
  if (!parseAspect(aspectRatio)) return undefined;
  return { aspectRatio, targetWidth };
}

/** Reads a saved `profileSettings` snapshot. Undefined when it is missing or malformed. */
export function asProfileSettings(raw: unknown): ProfileSettings | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const desktop = asViewportSettings(record.desktop);
  const mobile = asViewportSettings(record.mobile) ?? desktop;
  const quality = positiveInt(record.quality);
  const format = parseDatFormat(record.format);
  if (!desktop || !mobile) return undefined;
  const maxDimension = positiveInt(record.maxDimension);
  return {
    desktop,
    mobile,
    quality: quality && quality <= 100 ? quality : DEFAULT_QUALITY,
    format: format ?? DEFAULT_FORMAT,
    ...(maxDimension ? { maxDimension } : {}),
  };
}

export function profileSettingsEqual(a: ProfileSettings | undefined, b: ProfileSettings | undefined): boolean {
  if (!a || !b) return a === b;
  const same = (x: ProfileViewportSettings, y: ProfileViewportSettings) =>
    x.aspectRatio === y.aspectRatio && x.targetWidth === y.targetWidth;
  return (
    same(a.desktop, b.desktop) &&
    same(a.mobile, b.mobile) &&
    a.quality === b.quality &&
    a.format === b.format &&
    (a.maxDimension ?? DEFAULT_MAX_DIMENSION) === (b.maxDimension ?? DEFAULT_MAX_DIMENSION)
  );
}

function sameAspect(a?: string, b?: string): boolean {
  if (!a && !b) return true;
  const left = parseAspect(a);
  const right = parseAspect(b);
  if (!left || !right) return false;
  return left.w * right.h === right.w * left.h;
}

/**
 * Desktop and mobile can share one crop when neither viewport has a profile aspect (original),
 * or when the profile uses the same aspect for both. Different aspects are different crops,
 * even if the focal point is still copied. Target width is the output size, not the crop.
 */
export function profileCropsCanMatch(settings: ProfileSettings): boolean {
  return sameAspect(settings.desktop.aspectRatio, settings.mobile.aspectRatio);
}

/** Height for `width` at the profile aspect ratio. */
export function heightForWidth(aspectRatio: string, width: number): number {
  const parsed = parseAspect(aspectRatio);
  if (!parsed) return Math.round(width);
  return Math.max(1, Math.round((width * parsed.h) / parsed.w));
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a || 1;
}

/** `"4:3"` from pixel width and height. Undefined until both sides are known. */
export function aspectRatioFromPixels(width?: number | null, height?: number | null): string | undefined {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w || !h) return undefined;
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

/** The asset's own aspect ratio, from its original pixel size. */
export function assetAspectRatio(size: OriginalAssetSize | undefined): string | undefined {
  return aspectRatioFromPixels(size?.originalAssetWidth, size?.originalAssetHeight);
}

/** The original size of the file shown in `viewport`: the separate mobile file when there is one. */
export function viewportAssetSize(
  asset: Pick<SavedBynderAsset, "originalAssetWidth" | "originalAssetHeight" | "mobile"> | undefined,
  viewport: ViewportKind
): OriginalAssetSize | undefined {
  if (!asset) return undefined;
  return viewport === "mobile" && asset.mobile?.id ? asset.mobile : asset;
}

export interface ViewportImageSize {
  /** Undefined when there is no profile and the original size is unknown. */
  aspectRatio?: string;
  /** Widest image to request. */
  width: number;
  height?: number;
}

/**
 * Profile aspect and `targetWidth`. Without a profile aspect: the asset's own aspect ratio, and never
 * wider than the original file.
 */
export function viewportImageSize(
  slice: ProfileViewportSettings,
  size?: OriginalAssetSize,
  maxDimension = DEFAULT_MAX_DIMENSION
): ViewportImageSize {
  if (slice.aspectRatio) {
    const width = widthWithinMaxDimension(slice.targetWidth, slice.aspectRatio, maxDimension);
    return {
      aspectRatio: slice.aspectRatio,
      width,
      height: heightForWidth(slice.aspectRatio, width),
    };
  }
  const stored = size?.aspectRatio && parseAspect(size.aspectRatio) ? size.aspectRatio.trim() : undefined;
  const aspectRatio = assetAspectRatio(size) ?? stored;
  const original = positiveInt(size?.originalAssetWidth);
  const uncapped = original ? Math.min(slice.targetWidth, original) : slice.targetWidth;
  const width = widthWithinMaxDimension(uncapped, aspectRatio, maxDimension);
  return aspectRatio ? { aspectRatio, width, height: heightForWidth(aspectRatio, width) } : { width };
}

/** Configured size when it would exceed Bynder's max dimension. Delivery still requests `limited`. */
export function viewportSizeBeyondMaxDimension(
  slice: ProfileViewportSettings,
  maxDimension: number,
  size?: OriginalAssetSize
): { configured: ViewportImageSize; limited: ViewportImageSize } | undefined {
  const configured = viewportImageSize(slice, size, Number.MAX_SAFE_INTEGER);
  const limited = viewportImageSize(slice, size, maxDimension);
  if (configured.width === limited.width && configured.height === limited.height) return undefined;
  return { configured, limited };
}

/** Profiles lock size, so authors choose Fill or Fit. Legacy `crop` and `scale` are Fill. Fit stays only when the field allows it. */
export function profileOperation(operation: DatOperation | null | undefined, allowFit = true): DatOperation {
  return allowFit && operation === "fit" ? "fit" : "fill";
}

/** Profile sizes win over anything on the transform. The author keeps operation and letterbox. */
export function applyProfileTransform(
  transform: TransformSettings,
  profile: ProfileSettings,
  viewport: ViewportKind,
  desktopMobileMode = true,
  size?: OriginalAssetSize,
  allowFit = true
): TransformSettings {
  const slice = profile[desktopMobileMode && viewport === "mobile" ? "mobile" : "desktop"];
  const image = viewportImageSize(slice, size, profile.maxDimension ?? DEFAULT_MAX_DIMENSION);
  return {
    ...transform,
    operation: profileOperation(transform.operation, allowFit),
    aspect: image.aspectRatio ?? null,
    width: image.width,
    height: image.height ?? null,
    format: profile.format,
    quality: profile.quality,
  };
}

/** Default srcset steps. Each list is cut at, and ends with, the viewport `targetWidth`. */
export const SRCSET_WIDTHS = [640, 960, 1280, 1600, 1920, 2560, 3200, 3840] as const;

/** Saved `profile.id` when the author drags a custom aspect ratio. Not an App Config profile name. */
export const CUSTOM_PROFILE_ID = "custom";

export function isCustomProfile(name: string | undefined): boolean {
  return name === CUSTOM_PROFILE_ID;
}

function viewportWithAspect(
  slice: ProfileViewportSettings,
  size: OriginalAssetSize | undefined
): ProfileViewportSettings {
  const ratio = assetAspectRatio(size);
  const next = { ...slice };
  if (ratio) next.aspectRatio = ratio;
  else delete next.aspectRatio;
  return next;
}

/**
 * Customize starts at each file's own aspect ratio. Target width, quality, and format stay as they
 * were. Desktop and mobile each keep the file shown in that viewport.
 */
export function customProfileSettings(
  current: ProfileSettings,
  desktop?: OriginalAssetSize,
  mobile?: OriginalAssetSize
): ProfileSettings {
  return {
    ...current,
    desktop: viewportWithAspect(current.desktop, desktop),
    mobile: viewportWithAspect(current.mobile, mobile),
  };
}

export function withViewportAspect(
  settings: ProfileSettings,
  viewport: ViewportKind,
  aspectRatio: string
): ProfileSettings {
  const key = viewport === "mobile" ? "mobile" : "desktop";
  return { ...settings, [key]: { ...settings[key], aspectRatio } };
}

/**
 * Dropdown rows. Empty when the field is locked to one profile.
 * Customize is included only when the field config sets `allowCustomAspect`, or this entry already
 * uses it, so a saved custom ratio can still be seen and changed.
 */
export function profileSelectOptions(
  crop: CropFieldConfig,
  desktopMobileMode: boolean
): { value: string; label: string }[] {
  if (crop.profileLocked) return [];
  const options: { value: string; label: string }[] = [];
  if (crop.allowOriginal || !crop.profile) {
    options.push({ value: "", label: "Original aspect ratio" });
  }
  for (const name of crop.allowedProfiles) {
    if (name === CUSTOM_PROFILE_ID) continue;
    const profile = crop.profiles[name];
    if (!profile) continue;
    const sizes = desktopMobileMode
      ? `${profile.desktop.aspectRatio} desktop · ${profile.mobile.aspectRatio} mobile`
      : profile.desktop.aspectRatio;
    options.push({ value: name, label: `${name} (${sizes})` });
  }
  if (crop.profile && !isCustomProfile(crop.profile) && !crop.allowedProfiles.includes(crop.profile)) {
    options.push({ value: crop.profile, label: `${crop.profile} (no longer available)` });
  }
  if (crop.allowCustomAspect || isCustomProfile(crop.profile)) {
    options.push({ value: CUSTOM_PROFILE_ID, label: "Customize" });
  }
  return options;
}

export function srcsetWidths(targetWidth: number, widths: readonly number[] = SRCSET_WIDTHS): number[] {
  const target = Math.max(1, Math.round(targetWidth));
  const steps = [...new Set(widths.map((w) => Math.round(w)).filter((w) => w > 0 && w < target))].sort(
    (a, b) => a - b
  );
  return [...steps, target];
}
