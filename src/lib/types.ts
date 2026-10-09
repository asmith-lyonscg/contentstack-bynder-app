export type DatOperation = "fill" | "fit" | "crop" | "scale";
export type DatFormat = "webp" | "avif" | "jpg" | "png";
/** Letterbox fill for Fit (`transform:extend`). Always emitted as DAT `background:` (Bynder defaults to white without it). */
export type ExtendBackgroundMode = "auto" | "transparent" | "black" | "white" | "custom";

export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * Editor-side transform for one viewport. `operation` and `extend*` are the author's choice.
 * `width`, `height`, `aspect`, `format`, and `quality` come from the render profile and are not saved per asset.
 */
export interface TransformSettings {
  operation: DatOperation;
  width?: number | null;
  height?: number | null;
  aspect?: string | null;
  /** Fit/extend letterbox color mode. */
  extendBackground?: ExtendBackgroundMode | null;
  /** Hex for `extendBackground: "custom"` (with or without `#`). */
  extendBackgroundColor?: string | null;
  format?: DatFormat | null;
  quality?: number | null;
}

/** One viewport of an App Config render profile. */
export interface RenderProfileViewport {
  aspectRatio: string;
  maxWidth: number;
}

/** App Config `profiles.<name>`. */
export interface RenderProfile {
  desktop: RenderProfileViewport;
  mobile: RenderProfileViewport;
  quality: number;
  format: DatFormat;
}

/**
 * Saved per viewport. `targetWidth` is the widest image the site should request.
 * No `aspectRatio` means no profile: use the asset's own aspect ratio, never wider than the original.
 */
export interface ProfileViewportSettings {
  aspectRatio?: string;
  targetWidth: number;
}

/** App Config caps on `maxWidth`, and the target width when no profile applies. */
export interface MaxWidths {
  desktop: number;
  mobile: number;
}

/** Snapshot of the resolved profile, saved on the entry so the site needs no App Config. */
export interface ProfileSettings {
  desktop: ProfileViewportSettings;
  mobile: ProfileViewportSettings;
  quality: number;
  format: DatFormat;
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
  /** In memory only. The entry saves `operation` and `extend*` flat on the asset instead. */
  transform?: TransformSettings;
}

/**
 * Original file size from Bynder, saved so the site can lay out without an API call.
 * `aspectRatio` is that size reduced (4000×3000 → `"4:3"`), recalled when no profile sets one.
 */
export interface OriginalAssetSize {
  originalAssetWidth?: number;
  originalAssetHeight?: number;
  aspectRatio?: string;
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
  /** Original/web image. Only persisted when DAT is off or the asset has no transformBaseUrl. */
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
  /** Valid App Config profiles. May be empty. */
  profiles: Record<string, RenderProfile>;
  /** Profiles authors may pick, in dropdown order. */
  allowedProfiles: string[];
  /** Field `profile` or `defaultProfile`. Undefined means new entries use the original aspect ratio. */
  defaultProfile?: string;
  /** Authors may choose "Original aspect ratio". True unless the field sets `defaultProfile`. */
  allowOriginal: boolean;
  maxWidths: MaxWidths;
  /** Profile the editor is applying right now. Undefined: original aspect ratio. */
  profile?: string;
  /** Resolved sizes for `profile`. A profile missing from App Config keeps the entry's saved snapshot. */
  active: ProfileSettings;
  showOperation: boolean;
  /** Authors may choose Fit (letterbox). Default false, so Transform type stays hidden. */
  allowFit: boolean;
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
  /** Dual desktop/mobile crops. Default true. */
  desktopMobileMode?: boolean;
  /** @deprecated Use `desktopMobileMode`. Still read from field/app JSON. */
  desktopMobile?: boolean;
  /** Cap on assets in this field. Default 1. Values above 1 use Compact View MultiSelect. */
  maxNumberOfAssets?: number;
  /** Widest desktop image any profile may request. Default 2000. */
  maxDesktopWidth?: number;
  /** Widest mobile image any profile may request. Default 960. */
  maxMobileWidth?: number;
  /** Named render profiles. Without one, assets keep their original aspect ratio. */
  profiles?: Record<string, RenderProfile>;
  /** Show Transform type. Default true. Field Config Parameter can override. Hidden anyway when Fit is off. */
  showFieldOperation?: boolean;
  /** Offer Fit (letterbox) as well as Fill. Default false. */
  allowFit?: boolean;
  /** Video playback checkboxes. Default true. */
  showFieldAutoplay?: boolean;
  showFieldMuted?: boolean;
  showFieldControls?: boolean;
  showFieldLoop?: boolean;
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

export const DEFAULT_COMPACT_ASSET_TYPES: CompactAssetType[] = ["IMAGE", "VIDEO"];

export const DEFAULT_FOCAL_POINT: FocalPoint = { x: 0.5, y: 0.5 };

export const DEFAULT_MAX_WIDTHS: MaxWidths = { desktop: 2000, mobile: 960 };
export const DEFAULT_QUALITY = 80;
export const DEFAULT_FORMAT: DatFormat = "webp";

export const DEFAULT_TRANSFORM: TransformSettings = {
  operation: "fill",
  width: DEFAULT_MAX_WIDTHS.desktop,
  format: DEFAULT_FORMAT,
  quality: DEFAULT_QUALITY,
};
