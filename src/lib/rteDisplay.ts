import { composeBynderImageUrl } from "../delivery/composeBynderImageUrl";
import { DOCUMENT_THUMB_ASPECT } from "./bynder/assetUi";
import { documentThumbnailUrl, isDocumentAsset, isVideoAsset } from "./bynder/parseAsset";
import { parseSavedSettings, persistedPayload } from "./settings";

export const RTE_ELEMENT_TYPE = "bynder";

export const RTE_ALIGNMENTS = ["left", "center", "right", "floatLeft", "floatRight"] as const;

export type RteAlignment = (typeof RTE_ALIGNMENTS)[number];

export interface RteDisplay {
  width?: number;
  height?: number;
  alignment?: RteAlignment;
  caption?: string;
  link?: string;
  linkNewTab?: boolean;
  inline?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function positive(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.round(number);
}

function asAlignment(value: unknown): RteAlignment | undefined {
  return RTE_ALIGNMENTS.includes(value as RteAlignment) ? (value as RteAlignment) : undefined;
}

export function isFloatAlignment(alignment?: RteAlignment): boolean {
  return alignment === "floatLeft" || alignment === "floatRight";
}

/** Drop empty presentation fields. Floats force inline. Clearing inline clears a float. */
export function normalizeRteDisplay(display: RteDisplay): RteDisplay {
  const next: RteDisplay = {};
  const width = positive(display.width);
  const height = positive(display.height);
  if (width) next.width = width;
  if (height) next.height = height;
  let alignment = asAlignment(display.alignment);
  let inline = display.inline === true || isFloatAlignment(alignment);
  if (display.inline === false) {
    inline = false;
    if (isFloatAlignment(alignment)) alignment = "left";
  }
  if (alignment) next.alignment = alignment;
  if (display.caption?.trim()) next.caption = display.caption.trim();
  if (display.link?.trim()) next.link = display.link.trim();
  if (display.linkNewTab) next.linkNewTab = true;
  if (inline) next.inline = true;
  return next;
}

export function parseRteDisplay(value: unknown): RteDisplay {
  const record = asRecord(value);
  if (!record) return {};
  return normalizeRteDisplay({
    width: positive(record.width),
    height: positive(record.height),
    alignment: asAlignment(record.alignment),
    caption: typeof record.caption === "string" ? record.caption : undefined,
    link: typeof record.link === "string" ? record.link : undefined,
    linkNewTab: record.linkNewTab === true,
    inline: record.inline === true,
  });
}

export function splitRteAttrs(attrs: unknown): { payload: Record<string, unknown>; display: RteDisplay } {
  const record = asRecord(attrs) ?? {};
  const { display, ...payload } = record;
  return { payload, display: parseRteDisplay(display) };
}

export function joinRteAttrs(payload: Record<string, unknown>, display: RteDisplay): Record<string, unknown> {
  const next = { ...payload };
  delete next.display;
  const clean = normalizeRteDisplay(display);
  if (Object.keys(clean).length) next.display = clean;
  return next;
}

export function payloadWithAlt(payload: Record<string, unknown>, alt: string): Record<string, unknown> {
  const settings = parseSavedSettings(payload);
  const assets = (settings.assets ?? []).map((asset, index) => (index === 0 ? { ...asset, alt } : asset));
  return persistedPayload({ ...settings, assets });
}

export function assetAlt(payload: Record<string, unknown>): string {
  return parseSavedSettings(payload).assets?.[0]?.alt ?? "";
}

/** Width / height ratio used while the author drags the scale handle. */
export function displayAspect(payload: Record<string, unknown>): number {
  const settings = parseSavedSettings(payload);
  const asset = settings.assets?.[0];
  if (!asset) return 16 / 9;
  if (isDocumentAsset(asset)) return DOCUMENT_THUMB_ASPECT.w / DOCUMENT_THUMB_ASPECT.h;
  if (isVideoAsset(asset) && asset.origWidth && asset.origHeight) return asset.origWidth / asset.origHeight;
  const desktop = settings.profileSettings?.desktop;
  if (desktop && desktop.includes(":")) {
    const [width, height] = desktop.split(":").map((part) => Number(part));
    if (width > 0 && height > 0) return width / height;
  }
  if (asset.origWidth && asset.origHeight) return asset.origWidth / asset.origHeight;
  return 16 / 9;
}

export function rtePreviewUrl(payload: Record<string, unknown>): string {
  const settings = parseSavedSettings(payload);
  const asset = settings.assets?.[0];
  if (!asset) return "";
  if (isDocumentAsset(asset)) {
    return asset.thumbnail || documentThumbnailUrl({ url: asset.url, name: asset.name }) || "";
  }
  if (isVideoAsset(asset)) return asset.webImage?.url ?? "";
  return composeBynderImageUrl(payload, { viewport: "desktop", assetId: asset.id });
}

export function rteOpenUrl(payload: Record<string, unknown>): string {
  const asset = parseSavedSettings(payload).assets?.[0];
  if (!asset) return "";
  if (isDocumentAsset(asset)) return asset.url ?? "";
  if (isVideoAsset(asset)) return asset.webImage?.url ?? "";
  return asset.webImage?.url || asset.transformBaseUrl || rtePreviewUrl(payload);
}
