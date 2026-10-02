export type DatOperation = "fill" | "fit" | "crop";
export type DatFormat = "webp" | "avif" | "jpg" | "png";

export interface FocalPoint {
  x: number;
  y: number;
}

export interface TransformSettings {
  operation: DatOperation;
  width?: number | null;
  height?: number | null;
  aspect?: string | null;
  format?: DatFormat | null;
  quality?: number | null;
  extraQuery?: string | null;
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

export interface DatQueries {
  "1x": string;
  "2x": string;
}

export interface ViewportCropSettings {
  focalPoint: FocalPoint;
  transform: TransformSettings;
  /**
   * DAT query strings for this viewport. Join with the asset `transformBaseUrl`.
   * `2x` is the single static image. A different mobile file uses `mobile.transformBaseUrl`.
   */
  dat?: DatQueries;
  /** @deprecated Older saves stored a full URL. New saves use `dat` plus `transformBaseUrl`. */
  url?: string;
}

/**
 * Mobile crop. When mobile is a different Bynder file, `id`, `name`, `type`,
 * and `transformBaseUrl` sit here in the same shape as the desktop asset.
 * When those are omitted, mobile uses the desktop file.
 */
export interface MobileViewportSettings extends ViewportCropSettings {
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

/** Entry JSON for one picked asset: identity + crop + composed DAT URL. */
export interface SavedBynderAsset extends AssetCropSettings {
  id: string;
  name?: string;
  /** Compact View media type, e.g. IMAGE or VIDEO. Always saved so video UI survives reopen. */
  type?: string;
  transformBaseUrl?: string;
  /** Original file extension. Saved only when `persistAssetKeys` includes `fileType`. */
  fileType?: string;
  /** Original file size in bytes. Saved only when `persistAssetKeys` includes `fileSize`. */
  fileSize?: number;
  /** Original pixel width. Saved only when `persistAssetKeys` includes `width`. Not the CSS crop width. */
  width?: number;
  /** Original pixel height. Saved only when `persistAssetKeys` includes `height`. Not the CSS crop height. */
  height?: number;
  /** Original/web image. Only persisted when DAT is off or the asset has no transformBaseUrl. */
  webImage?: { url: string };
  description?: string;
  originalUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  tags?: string[];
  /** Web playback flags. Present on video assets. */
  video?: VideoPlayback;
  /**
   * Values for `additionalFields` config entries, keyed by `property`.
   * Nested under `additional` so they do not collide with identity/crop keys.
   */
  additional?: Record<string, string | number | boolean>;
}

export interface BynderImageSettings {
  v: 1;
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

export interface ViewportCropPreset {
  aspect?: string;
  width?: number;
  height?: number;
  lockAspect: boolean;
  lockWidth: boolean;
  lockHeight: boolean;
}

export interface CropFieldConfig {
  aspect?: string;
  width?: number;
  height?: number;
  /** Dual-mode mobile presets. Omitted values inherit the desktop/single fields. */
  mobileAspect?: string;
  mobileWidth?: number;
  mobileHeight?: number;
  format?: DatFormat;
  lockAspect: boolean;
  lockWidth: boolean;
  lockHeight: boolean;
  /** Dual-mode mobile locks. `false` is distinct from omitted (omitted inherits desktop). */
  lockAspectMobile?: boolean;
  lockWidthMobile?: boolean;
  lockHeightMobile?: boolean;
  lockFormat: boolean;
  hideFormat: boolean;
  showOperation: boolean;
  showAspect: boolean;
  showWidth: boolean;
  showHeight: boolean;
  showQuality: boolean;
  showAdvancedQuery: boolean;
  showDatPreset: boolean;
  aspectPresets: string[];
  /** Dual desktop/mobile crops. Default true. Set false for a single crop per asset. */
  desktopMobileMode?: boolean;
}

export interface AppInstallationConfig {
  /** Bynder portal host, e.g. acme.getbynder.com */
  bynderPortalUrl?: string;
  compactLanguage?: string;
  /** @deprecated Ignored. Compact View mode follows `maxNumberOfAssets`. Stripped on App Config save. */
  compactMode?: CompactSelectionMode;
  bynderFieldUid?: string;
  /** @deprecated Static/Pages build. Stripped on App Config save. */
  loginBypass?: boolean;
  /** @deprecated Static/Pages build. Stripped on App Config save. */
  oauthClientId?: string;
  /** When false, DAT is unavailable and authors only get CSS crop. Default true. */
  enableDat?: boolean;
  /** @deprecated Static/Pages build. Stripped on App Config save. */
  enableAssetTracker?: boolean;
  /** Extra Bynder keys to keep on the entry JSON. Required keys are always saved. */
  persistAssetKeys?: string[];
  /** Dual desktop/mobile crops. Default true. */
  desktopMobileMode?: boolean;
  /** @deprecated Use `desktopMobileMode`. Still read from field/app JSON. */
  desktopMobile?: boolean;
  /** Cap on assets in this field. Default 1. Values above 1 use Compact View MultiSelect. */
  maxNumberOfAssets?: number;
  aspect?: string | { desktop?: string; mobile?: string };
  width?: number | { desktop?: number; mobile?: number };
  height?: number | { desktop?: number; mobile?: number };
  /** DAT output file type. Default `webp`. */
  format?: DatFormat;
  lockAspect?: boolean | { desktop?: boolean; mobile?: boolean };
  lockWidth?: boolean | { desktop?: boolean; mobile?: boolean };
  lockHeight?: boolean | { desktop?: boolean; mobile?: boolean };
  lockFormat?: boolean;
  /** Hide the DAT file-type control. The configured `format` is still applied. */
  hideFormat?: boolean;
  /** Dropdown options. Omit to use the built-in list (16:9, 1:1, 4:3, 4:5). */
  aspectPresets?: string[];
}

export interface VideoPlayback {
  autoplay: boolean;
  muted: boolean;
  controls: boolean;
  loop: boolean;
}

/** Which video playback checkboxes the editor shows. Defaults are all on. */
export interface VideoFieldVisibility {
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

export const ASPECT_PRESETS = ["16:9", "1:1", "4:3", "4:5"] as const;

export const DAT_FILE_TYPES: { value: Extract<DatFormat, "jpg" | "png" | "webp">; label: string }[] = [
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
];

export const DEFAULT_COMPACT_ASSET_TYPES: CompactAssetType[] = ["IMAGE", "VIDEO"];

export const DEFAULT_FOCAL_POINT: FocalPoint = { x: 0.5, y: 0.5 };

export const DEFAULT_TRANSFORM: TransformSettings = {
  operation: "fill",
  width: 1200,
  height: 675,
  aspect: "16:9",
  format: "webp",
  quality: 80,
  extraQuery: "",
};
