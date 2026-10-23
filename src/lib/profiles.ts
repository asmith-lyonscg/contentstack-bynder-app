import { parseAspect } from "./bynder/composeDatUrl";
import {
  DEFAULT_FORMAT,
  DEFAULT_MAX_DIMENSION,
  DEFAULT_QUALITY,
  type CropFieldConfig,
  type DatFormat,
  type OriginalAssetSize,
  type ProfileSettings,
  type RenderProfile,
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

function parseProfileViewport(raw: unknown, where: string, errors: string[]): string | undefined {
  const aspectRatio = typeof raw === "string" ? raw.trim() : "";
  if (raw === undefined) errors.push(`${where} is required, e.g. "16:9".`);
  else if (!parseAspect(aspectRatio)) errors.push(`${where} must look like "16:9".`);
  if (!parseAspect(aspectRatio)) return undefined;
  return aspectRatio;
}

function parseProfile(
  raw: unknown,
  name: string,
  errors: string[],
  label = "profiles"
): RenderProfile | undefined {
  const where = `${label}.${name}`;
  const record = asRecord(raw);
  if (!record) {
    errors.push(`${where} must be an object with "desktop" and "mobile".`);
    return undefined;
  }
  const desktop = parseProfileViewport(record.desktop, `${where}.desktop`, errors);
  const mobile = parseProfileViewport(record.mobile, `${where}.mobile`, errors);

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

  let displayName: string | undefined;
  let validName = true;
  if (record.name !== undefined) {
    const label = typeof record.name === "string" ? record.name.trim() : "";
    if (!label) {
      errors.push(`${where}.name must be a non-empty string.`);
      validName = false;
    } else displayName = label;
  }

  if (!desktop || !mobile || !validQuality || !validFormat || !validName) return undefined;
  return { ...(displayName ? { name: displayName } : {}), desktop, mobile, quality, format };
}

export interface ParsedRenderProfiles {
  profiles: Record<string, RenderProfile>;
  /** Empty when every profile is valid. */
  errors: string[];
}

/**
 * Validates App Config or field `profiles`. Malformed profiles are dropped.
 * Duplicate names are only detectable when `raw` is the JSON text.
 */
export function parseRenderProfiles(raw: unknown, label = "profiles"): ParsedRenderProfiles {
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
    const profile = parseProfile(item, name, errors, label);
    if (profile) profiles[name] = profile;
  }
  const seenLabels = new Map<string, string>();
  for (const [key, profile] of Object.entries(profiles)) {
    const label = profile.name?.toLowerCase();
    if (!label) continue;
    const previous = seenLabels.get(label);
    if (previous) errors.push(`Display name "${profile.name}" is used by both "${previous}" and "${key}".`);
    else seenLabels.set(label, key);
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
  const appProfiles = parseRenderProfiles(pickRaw(appConfig, "profiles")).profiles;
  const fieldParsed = parseRenderProfiles(pickRaw(fieldConfig, "fieldProfiles"), "fieldProfiles");
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
    fieldProfileErrors: fieldParsed.errors,
  };
}

function withMaxDimension(settings: ProfileSettings, maxDimension: number): ProfileSettings {
  if (maxDimension === DEFAULT_MAX_DIMENSION) return settings;
  return { ...settings, maxDimension };
}

/** No profile: each asset keeps its own aspect ratio. The site chooses the request widths. */
export function originalProfileSettings(maxDimension = DEFAULT_MAX_DIMENSION): ProfileSettings {
  return withMaxDimension(
    {
      quality: DEFAULT_QUALITY,
      format: DEFAULT_FORMAT,
    },
    maxDimension
  );
}

export function profileSettingsFrom(profile: RenderProfile, maxDimension = DEFAULT_MAX_DIMENSION): ProfileSettings {
  return withMaxDimension(
    {
      desktop: profile.desktop,
      mobile: profile.mobile,
      quality: profile.quality,
      format: profile.format,
    },
    maxDimension
  );
}

/** A viewport aspect ratio, or undefined when that viewport uses the file's own pixels. Null when the value is present but not a ratio. */
function asViewportAspect(raw: unknown): string | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return null;
  const aspectRatio = raw.trim();
  return parseAspect(aspectRatio) ? aspectRatio : null;
}

/** Reads a saved `profile.settings` snapshot. Undefined when it is missing or malformed. */
export function asProfileSettings(raw: unknown): ProfileSettings | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const desktop = asViewportAspect(record.desktop);
  const mobile = asViewportAspect(record.mobile);
  if (desktop === null || mobile === null) return undefined;
  const quality = positiveInt(record.quality);
  const format = parseDatFormat(record.format);
  const maxDimension = positiveInt(record.maxDimension);
  return {
    ...(desktop ? { desktop } : {}),
    ...(mobile ? { mobile } : {}),
    quality: quality && quality <= 100 ? quality : DEFAULT_QUALITY,
    format: format ?? DEFAULT_FORMAT,
    ...(maxDimension ? { maxDimension } : {}),
  };
}

export function profileSettingsEqual(a: ProfileSettings | undefined, b: ProfileSettings | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.desktop === b.desktop &&
    a.mobile === b.mobile &&
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
 * even if the focal point is still copied.
 */
export function profileCropsCanMatch(settings: ProfileSettings): boolean {
  return sameAspect(settings.desktop, settings.mobile);
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
  return aspectRatioFromPixels(size?.origWidth, size?.origHeight);
}

/** The original size of the file shown in `viewport`: the separate mobile file when there is one. */
export function viewportAssetSize(
  asset: Pick<SavedBynderAsset, "origWidth" | "origHeight" | "mobile"> | undefined,
  viewport: ViewportKind
): OriginalAssetSize | undefined {
  if (!asset) return undefined;
  return viewport === "mobile" && asset.mobile?.id ? asset.mobile : asset;
}

export interface ViewportImageSize {
  /** Undefined when there is no profile and the original size is unknown. */
  aspectRatio?: string;
}

/** Profile aspect, or the asset's own pixels when the profile has none. */
export function viewportImageSize(aspect: string | undefined, size?: OriginalAssetSize): ViewportImageSize {
  if (aspect && parseAspect(aspect)) return { aspectRatio: aspect };
  const aspectRatio = assetAspectRatio(size);
  return aspectRatio ? { aspectRatio } : {};
}

/** The profile sets aspect, format, and quality. The site chooses the request widths. */
export function applyProfileTransform(
  transform: TransformSettings,
  profile: ProfileSettings,
  viewport: ViewportKind,
  desktopMobileMode = true,
  size?: OriginalAssetSize
): TransformSettings {
  const slice = profile[desktopMobileMode && viewport === "mobile" ? "mobile" : "desktop"];
  const image = viewportImageSize(slice, size);
  return {
    ...transform,
    operation: "fill",
    aspect: image.aspectRatio ?? null,
    width: null,
    height: null,
    format: profile.format,
    quality: profile.quality,
  };
}

/** Default srcset steps. Each step is capped so neither side passes `maxDimension`. */
export const SRCSET_WIDTHS = [640, 960, 1280, 1600, 1920, 2560, 3200, 3840] as const;

/** Saved `profile.id` when the author drags a custom aspect ratio. Not an App Config profile name. */
export const CUSTOM_PROFILE_ID = "custom";

export function isCustomProfile(name: string | undefined): boolean {
  return name === CUSTOM_PROFILE_ID;
}

function viewportWithAspect(size: OriginalAssetSize | undefined): string | undefined {
  return assetAspectRatio(size);
}

/**
 * Customize starts at each file's own aspect ratio. Quality and format stay as they
 * were. Desktop and mobile each keep the file shown in that viewport.
 */
export function customProfileSettings(
  current: ProfileSettings,
  desktop?: OriginalAssetSize,
  mobile?: OriginalAssetSize
): ProfileSettings {
  const desktopAspect = viewportWithAspect(desktop);
  const mobileAspect = viewportWithAspect(mobile);
  return {
    ...current,
    ...(desktopAspect ? { desktop: desktopAspect } : { desktop: undefined }),
    ...(mobileAspect ? { mobile: mobileAspect } : { mobile: undefined }),
  };
}

export function withViewportAspect(
  settings: ProfileSettings,
  viewport: ViewportKind,
  aspectRatio: string
): ProfileSettings {
  const key = viewport === "mobile" ? "mobile" : "desktop";
  return { ...settings, [key]: aspectRatio };
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
      ? `${profile.desktop} desktop · ${profile.mobile} mobile`
      : profile.desktop;
    options.push({ value: name, label: `${profile.name || name} (${sizes})` });
  }
  if (crop.profile && !isCustomProfile(crop.profile) && !crop.allowedProfiles.includes(crop.profile)) {
    options.push({ value: crop.profile, label: `${crop.profile} (no longer available)` });
  }
  if (crop.allowCustomAspect || isCustomProfile(crop.profile)) {
    options.push({ value: CUSTOM_PROFILE_ID, label: "Customize" });
  }
  return options;
}

/**
 * Request widths, each shrunk so width and height stay within `maxDimension`. Duplicates from that
 * shrink are dropped. The last width is the largest file.
 */
export function srcsetWidths(
  aspectRatio?: string,
  maxDimension = DEFAULT_MAX_DIMENSION,
  widths: readonly number[] = SRCSET_WIDTHS
): number[] {
  const capped = widths
    .map((width) => widthWithinMaxDimension(Math.round(width), aspectRatio, maxDimension))
    .filter((width) => width > 0);
  return [...new Set(capped)].sort((a, b) => a - b);
}
