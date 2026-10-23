export type DatOperation = "fill";
export type DatFormat = "webp" | "avif" | "jpg" | "png";

export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * Editor-side transform for one viewport. Fill is the only operation.
 * `width`, `height`, `aspect`, `format`, and `quality` come from the render profile and are not saved per asset.
 */
export interface TransformSettings {
  operation: DatOperation;
  width?: number | null;
  height?: number | null;
  aspect?: string | null;
  format?: DatFormat | null;
  quality?: number | null;
}

/** App Config `profiles.<name>`. `desktop` and `mobile` are aspect ratios, e.g. `"16:9"`. */
export interface RenderProfile {
  desktop: string;
  mobile: string;
  quality: number;
  format: DatFormat;
}

/**
 * Snapshot of the resolved profile, saved on the entry so the site needs no App Config.
 * `desktop` and `mobile` are the aspect ratios. Omitted when that viewport uses the file's own pixels.
 */
export interface ProfileSettings {
  desktop?: string;
  mobile?: string;
  quality: number;
  format: DatFormat;
  /**
   * Bynder limit on either side, copied from App Config so delivery can cap requests
   * without App Config. Omitted when it is the default 2000.
   */
  maxDimension?: number;
}

export type CompactSelectionMode = "SingleSelect" | "SingleSelectFile" | "MultiSelect";

export type CompactAssetType = "AUDIO" | "DOCUMENT" | "IMAGE" | "VIDEO" | "ARCHIVE";

export interface CompactTheme {
  colorPrimary?: string;
  colorButtonPrimary?: string;
  colorButtonPrimaryLabel?: string;
  colorButtonPrimaryActive?: string;
  colorButtonPrimaryHover?: string;
  colorButtonPrimaryHoverLabel?: string;
}

export interface CompactAssetFilter {
  predefinedAssetType?: CompactAssetType[];
  collectionId?: string;
  predefinedMetapropertiesOptions?: Record<string, Record<string, string>>;
  searchTerm?: string;
  predefinedTagNames?: string[];
  isLimitedUse?: boolean;
  showToolbar?: boolean;
}

export interface DatPresetSettings {
  options: string[];
  default?: string;
  transformationOptions: Record<string, string>;
}

export interface CompactViewConfig {
  portalUrl?: string;
  language: string;
  mode: CompactSelectionMode;
  assetTypes: CompactAssetType[];
  defaultSearchTerm?: string;
  theme?: CompactTheme;
  hideExternalAccess?: boolean;
  hideLimitedUse?: boolean;
  hideSwitch?: boolean;
  noCache?: boolean;
  selectAllOption?: boolean;
  defaultImageDerivativeName?: string;
  defaultVideoDerivativeName?: string;
  isPersonal?: boolean;
  enableDASH?: boolean;
  embedType?: "script" | "iframe";
  assetFilter?: CompactAssetFilter;
  maxLimit?: number;
  datPresets?: DatPresetSettings;
}

export type ViewportKind = "desktop" | "mobile";

export interface ViewportCropSettings {
  /** Omitted on document assets (no crop editor). */
  focalPoint?: FocalPoint;
  /** In memory only. The entry saves `operation` flat on the asset instead. */
  transform?: TransformSettings;
}

/** Original file size from Bynder, saved so the site can lay out without an API call. */
export interface OriginalAssetSize {
  origWidth?: number;
  origHeight?: number;
}

/**
 * Mobile crop. When mobile is a different Bynder file, `id`, `name`, `type`,
 * and `transformBaseUrl` sit here in the same shape as the desktop asset.
 * When those are omitted, mobile uses the desktop file.
 */
export interface MobileViewportSettings extends ViewportCropSettings, OriginalAssetSize {
  id?: string;
  name?: string;
  type?: string;
  transformBaseUrl?: string;
  webImage?: { url: string };
  /** Alt text for the separate mobile file. Omitted when mobile uses the desktop image. */
  alt?: string;
}

export interface AssetCropSettings extends ViewportCropSettings {
  /**
   * Present only when mobile has been edited away from desktop.
   * When omitted, mobile follows desktop — do not duplicate the crop.
   */
  mobile?: MobileViewportSettings;
  /** Switch off: mobile is a different Bynder file. Kept even before that file is picked. */
  differentMobileAsset?: boolean;
  /** Author-facing alt text for this asset. Prefills from Bynder, then can be overwritten. */
  alt?: string;
}

/** Entry JSON for one picked asset: identity + crop + composed DAT URL (or document links). */
export interface SavedBynderAsset extends AssetCropSettings, OriginalAssetSize {
  id: string;
  name?: string;
  /** Compact View media type, e.g. IMAGE, VIDEO, or DOCUMENT. Always saved. */
  type?: string;
  transformBaseUrl?: string;
  /** Original/web image. Persisted only when the asset has no transform URL. */
  webImage?: { url: string };
  /** Document / PDF: public file URL for viewing (no `download` param). */
  url?: string;
  /**
   * Document / PDF: same as `url` with Bynder `download=true` so the browser downloads the file.
   * Omitted for images and videos.
   */
  downloadUrl?: string;
  /** Web playback flags. Present on video assets. */
  video?: VideoPlayback;
  /**
   * Values for `additionalFields` config entries, keyed by `property`.
   * Nested under `additional` so they do not collide with identity/crop keys.
   */
  additional?: Record<string, string | number | boolean>;
}

export interface BynderImageSettings {
  v: 2;
  /** Render profile name from App Config. Saved as `profile.id`. */
  profile?: string;
  /** Resolved values of `profile` at save time. Saved as `profile.settings`. */
  profileSettings?: ProfileSettings;
  assets?: SavedBynderAsset[];
  /** UI-only: which thumb is focused. Not persisted; reopen has none selected. */
  activeAssetId?: string;
  /** UI-only: Desktop vs Mobile tab. Not persisted. */
  activeViewport?: ViewportKind;
  /** UI-only live editor snapshot for the focused asset + viewport. */
  focalPoint: FocalPoint;
  transform: TransformSettings;
  alt?: string;
}

export interface ParsedBynderAsset {
  id: string;
  databaseId?: string;
  /** Compact View GraphQL `id`. Do not pass this as `selectedAssets` — UCV base64-encodes media UUIDs itself. */
  pickerId?: string;
  name?: string;
  type?: string;
  transformBaseUrl?: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  fileSize?: number;
  /** Original file type (jpg, png, webp) when Bynder exposes it. */
  fileType?: string;
  /** Resolved Bynder alt candidate (alt_text → alttext → alt → description). */
  alt?: string;
}

export interface CropFieldConfig {
  /** Profiles this field can use: App Config, plus any `fieldProfiles` on the field. */
  profiles: Record<string, RenderProfile>;
  /** Profiles authors may pick, in dropdown order. */
  allowedProfiles: string[];
  /** Field `profile` or `defaultProfile`. Undefined means new entries use the original aspect ratio. */
  defaultProfile?: string;
  /** Authors may choose "Original aspect ratio". True unless the field sets `defaultProfile`. */
  allowOriginal: boolean;
  /** Field Config Parameter `"profile"` names one profile. The dropdown stays hidden. */
  profileLocked: boolean;
  /** Bynder limit on either side of a transformed image. Default 2000. */
  maxDimension: number;
  /** Profile the editor is applying right now. Undefined: original aspect ratio. */
  profile?: string;
  /** Resolved profile for the editor. A name App Config no longer defines keeps the entry's saved snapshot. */
  active: ProfileSettings;
  /** Authors may drag a custom aspect ratio. Default false. Field Config Parameter only. */
  allowCustomAspect: boolean;
  /** Problems in this field's `fieldProfiles`. Valid profiles are still offered. */
  fieldProfileErrors: string[];
  /** Dual desktop/mobile crops. Default true. Set false for a single crop per asset. */
  desktopMobileMode?: boolean;
}

export interface AppInstallationConfig {
  /** Bynder portal host, e.g. acme.getbynder.com */
  bynderPortalUrl?: string;
  compactLanguage?: string;
  bynderFieldUid?: string;
  /** Dual desktop/mobile crops. Default true. */
  desktopMobileMode?: boolean;
  /** Cap on assets in this field. Default 1. Values above 1 use Compact View MultiSelect. */
  maxNumberOfAssets?: number;
  /**
   * Bynder DAT limit on either side of a transformed image. Default 2000.
   * A request above this comes back as the original file.
   */
  maxDimension?: number;
  /** Named render profiles. Without one, assets keep their original aspect ratio. */
  profiles?: Record<string, RenderProfile>;
}

export interface VideoPlayback {
  autoplay: boolean;
  muted: boolean;
  controls: boolean;
  loop: boolean;
}

export type AdditionalFieldType = "string" | "number" | "boolean";

export interface AdditionalFieldDefinition {
  property: string;
  type: AdditionalFieldType;
  label: string;
}

export const DEFAULT_COMPACT_ASSET_TYPES: CompactAssetType[] = ["IMAGE", "VIDEO"];

export const DEFAULT_FOCAL_POINT: FocalPoint = { x: 0.5, y: 0.5 };

/** Bynder returns the original file when a transform is larger than this on either side. */
export const DEFAULT_MAX_DIMENSION = 2000;
export const DEFAULT_QUALITY = 80;
export const DEFAULT_FORMAT: DatFormat = "webp";

export const DEFAULT_TRANSFORM: TransformSettings = {
  operation: "fill",
  format: DEFAULT_FORMAT,
  quality: DEFAULT_QUALITY,
};
