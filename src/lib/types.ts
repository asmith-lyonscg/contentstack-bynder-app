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

export interface BynderImageSettings {
  v: 1;
  sourceFieldUid: string;
  assetId?: string;
  transformBaseUrl?: string;
  sourceUrl?: string;
  datEnabled?: boolean;
  focalPoint: FocalPoint;
  transform: TransformSettings;
  url?: string;
}

export interface ParsedBynderAsset {
  id: string;
  databaseId?: string;
  name?: string;
  type?: string;
  transformBaseUrl?: string;
  sourceUrl: string;
  width?: number;
  height?: number;
}

export interface CropFieldConfig {
  aspect?: string;
  width?: number;
  height?: number;
  lockAspect: boolean;
  lockWidth: boolean;
  lockHeight: boolean;
  aspectPresets: string[];
}

export interface AppInstallationConfig {
  bynderFieldUid?: string;
  /** When false (default), focal point uses CSS object-position. DAT URL composition is skipped. */
  enableDat?: boolean;
  aspect?: string;
  width?: number;
  height?: number;
  lockAspect?: boolean;
  lockWidth?: boolean;
  lockHeight?: boolean;
  /** Dropdown options. Omit to use the built-in list (16:9, 1:1, 4:3, 4:5). */
  aspectPresets?: string[];
}

export const ASPECT_PRESETS = ["16:9", "1:1", "4:3", "4:5"] as const;

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
