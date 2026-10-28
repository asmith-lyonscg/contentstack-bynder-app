import { composeBynderImageUrl } from "../delivery/composeBynderImageUrl";
import { DOCUMENT_THUMB_ASPECT } from "./bynder/assetUi";
import { documentThumbnailUrl, isDocumentAsset, isImageAsset, isVideoAsset } from "./bynder/parseAsset";
import { profileCropsCanMatch } from "./profiles";
import { parseSavedSettings, persistedPayload } from "./settings";
import type { ViewportKind } from "./types";
import { viewportCropsEqual } from "./viewportCrop";

export const RTE_ELEMENT_TYPE = "bynder";

export const RTE_ALIGNMENTS = ["left", "center", "right", "floatLeft", "floatRight"] as const;

export type RteAlignment = (typeof RTE_ALIGNMENTS)[number];

/** Mobile overrides. A missing key still follows desktop. */
export interface RteMobileDisplay {
  width?: number;
  height?: number;
  alignment?: RteAlignment;
  inline?: boolean;
}

export interface RteDisplay {
  width?: number;
  height?: number;
  alignment?: RteAlignment;
  caption?: string;
  link?: string;
  linkNewTab?: boolean;
  inline?: boolean;
  mobile?: RteMobileDisplay;
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
  const mobile = normalizeMobile(display.mobile);
  if (mobile) next.mobile = mobile;
  return next;
}

function normalizeMobile(mobile: RteMobileDisplay | undefined): RteMobileDisplay | undefined {
  if (!mobile) return undefined;
  const next: RteMobileDisplay = {};
  const width = positive(mobile.width);
  const height = positive(mobile.height);
  if (width) next.width = width;
  if (height) next.height = height;
  let alignment = asAlignment(mobile.alignment);
  let inline = mobile.inline;
  if (isFloatAlignment(alignment)) inline = true;
  if (inline === false && isFloatAlignment(alignment)) alignment = "left";
  if (alignment) next.alignment = alignment;
  if (inline === true) next.inline = true;
  if (inline === false) next.inline = false;
  return Object.keys(next).length ? next : undefined;
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
    mobile: asMobile(record.mobile),
  });
}

function asMobile(value: unknown): RteMobileDisplay | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    width: positive(record.width),
    height: positive(record.height),
    alignment: asAlignment(record.alignment),
    inline: record.inline === true ? true : record.inline === false ? false : undefined,
  };
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

const MIN_DISPLAY_WIDTH = 80;
const MIN_DISPLAY_HEIGHT = 48;

/** Dragging either edge keeps the current proportion and stores both pixel sizes. */
export function scaleDisplaySize(
  start: { width: number; height: number },
  delta: number,
  axis: "x" | "y"
): { width: number; height: number } {
  const aspect = start.width / Math.max(1, start.height);
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return { width: MIN_DISPLAY_WIDTH, height: MIN_DISPLAY_HEIGHT };
  }
  const width = axis === "x" ? Math.round(start.width + delta) : Math.round(Math.round(start.height + delta) * aspect);
  const height = axis === "x" ? Math.round(width / aspect) : Math.round(start.height + delta);
  return fitDisplayBox(width, height, aspect);
}

/** Grow the box until both edges clear their minimums without changing the ratio. */
function fitDisplayBox(width: number, height: number, aspect: number): { width: number; height: number } {
  let nextWidth = width;
  let nextHeight = height;
  if (nextWidth < MIN_DISPLAY_WIDTH) {
    nextWidth = MIN_DISPLAY_WIDTH;
    nextHeight = Math.round(nextWidth / aspect);
  }
  if (nextHeight < MIN_DISPLAY_HEIGHT) {
    nextHeight = MIN_DISPLAY_HEIGHT;
    nextWidth = Math.round(nextHeight * aspect);
  }
  if (nextWidth < MIN_DISPLAY_WIDTH) {
    nextWidth = MIN_DISPLAY_WIDTH;
    nextHeight = Math.round(nextWidth / aspect);
  }
  return { width: nextWidth, height: Math.max(1, nextHeight) };
}

/** Pixel box for the viewport. A linked mobile view uses the desktop width and its own aspect. */
export function scaleFor(
  display: RteDisplay,
  viewport: ViewportKind,
  aspect: number
): { width: number; height: number } {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const mobileSized = Boolean(display.mobile?.width || display.mobile?.height);
  if (viewport === "mobile" && mobileSized) {
    const width = display.mobile?.width ?? 320;
    return { width, height: display.mobile?.height ?? Math.max(1, Math.round(width / safeAspect)) };
  }
  const width = display.width ?? 320;
  if (viewport === "mobile") return { width, height: Math.max(1, Math.round(width / safeAspect)) };
  return { width, height: display.height ?? Math.max(1, Math.round(width / safeAspect)) };
}

/** True when this viewport is showing a size the author dragged. */
export function scaleIsCustom(display: RteDisplay, viewport: ViewportKind): boolean {
  const desktopCustom = Boolean(display.width || display.height);
  if (viewport === "desktop") return desktopCustom;
  return Boolean(display.mobile?.width || display.mobile?.height) || desktopCustom;
}

/** Desktop writes the shared size. Mobile writes only its own size. */
export function editDisplayScale(
  display: RteDisplay,
  viewport: ViewportKind,
  size: { width: number; height: number }
): RteDisplay {
  if (viewport === "mobile") {
    return normalizeRteDisplay({ ...display, mobile: { ...display.mobile, width: size.width, height: size.height } });
  }
  return normalizeRteDisplay({ ...display, width: size.width, height: size.height });
}

/** Drop the author size on desktop and mobile. */
export function resetDisplayScale(display: RteDisplay): RteDisplay {
  const mobile = display.mobile ? { ...display.mobile } : undefined;
  if (mobile) {
    delete mobile.width;
    delete mobile.height;
  }
  const next: RteDisplay = { ...display, mobile };
  delete next.width;
  delete next.height;
  return normalizeRteDisplay(next);
}

export function placementExplicit(display: RteDisplay): boolean {
  return display.mobile?.alignment !== undefined || display.mobile?.inline !== undefined;
}

/** Alignment and inline for the tab. Mobile follows desktop until it has its own values. */
export function placementFor(
  display: RteDisplay,
  viewport: ViewportKind
): { alignment?: RteAlignment; inline?: boolean } {
  if (viewport === "mobile" && placementExplicit(display)) {
    return {
      alignment: display.mobile?.alignment ?? display.alignment,
      inline: display.mobile?.inline,
    };
  }
  return { alignment: display.alignment, inline: display.inline };
}

/**
 * Desktop edits the shared alignment and inline while mobile still follows.
 * A mobile edit stores both on `display.mobile` and leaves desktop alone.
 */
export function editDisplayPlacement(
  display: RteDisplay,
  viewport: ViewportKind,
  patch: { alignment?: RteAlignment; inline?: boolean }
): RteDisplay {
  const current = placementFor(display, viewport);
  const alignment = patch.alignment ?? current.alignment;
  const inline = patch.inline !== undefined ? patch.inline : current.inline;
  if (viewport === "mobile") {
    return normalizeRteDisplay({
      ...display,
      mobile: { ...display.mobile, alignment: alignment ?? "left", inline: inline === true },
    });
  }
  return normalizeRteDisplay({ ...display, alignment, inline });
}

/** Drop a mobile alignment and inline so they follow desktop again. Scale stays. */
export function relinkDisplayPlacement(display: RteDisplay): RteDisplay {
  if (!display.mobile) return display;
  const mobile: RteMobileDisplay = { ...display.mobile };
  delete mobile.alignment;
  delete mobile.inline;
  return normalizeRteDisplay({ ...display, mobile });
}

/** True when the mobile image would not match the desktop image. */
export function imageViewportsDiffer(payload: Record<string, unknown>, display?: RteDisplay): boolean {
  const settings = parseSavedSettings(payload);
  const asset = settings.assets?.[0];
  if (!asset || !isImageAsset(asset)) return false;
  if (display?.mobile?.width || display?.mobile?.height) return true;
  if (asset.mobile?.id && asset.mobile.id !== asset.id) return true;
  if (asset.mobile && !viewportCropsEqual(asset, asset.mobile)) return true;
  if (settings.profileSettings && !profileCropsCanMatch(settings.profileSettings)) return true;
  return false;
}

/** Width / height ratio used while the author drags the scale handle. */
export function displayAspect(payload: Record<string, unknown>, viewport: ViewportKind = "desktop"): number {
  const settings = parseSavedSettings(payload);
  const asset = settings.assets?.[0];
  if (!asset) return 16 / 9;
  const file = viewport === "mobile" && asset.mobile?.id ? asset.mobile : asset;
  if (isDocumentAsset(asset)) return DOCUMENT_THUMB_ASPECT.w / DOCUMENT_THUMB_ASPECT.h;
  if (isVideoAsset(asset) && file.origWidth && file.origHeight) return file.origWidth / file.origHeight;
  const ratio = settings.profileSettings?.[viewport];
  if (ratio && ratio.includes(":")) {
    const [width, height] = ratio.split(":").map((part) => Number(part));
    if (width > 0 && height > 0) return width / height;
  }
  if (file.origWidth && file.origHeight) return file.origWidth / file.origHeight;
  return 16 / 9;
}

export function rtePreviewUrl(payload: Record<string, unknown>, viewport: ViewportKind = "desktop"): string {
  const settings = parseSavedSettings(payload);
  const asset = settings.assets?.[0];
  if (!asset) return "";
  if (isDocumentAsset(asset)) {
    return asset.thumbnail || documentThumbnailUrl({ url: asset.url, name: asset.name }) || "";
  }
  if (isVideoAsset(asset)) return asset.webImage?.url ?? "";
  return composeBynderImageUrl(payload, { viewport, assetId: asset.id });
}

export function rteOpenUrl(payload: Record<string, unknown>, viewport: ViewportKind = "desktop"): string {
  const asset = parseSavedSettings(payload).assets?.[0];
  if (!asset) return "";
  const file = viewport === "mobile" && asset.mobile?.id ? asset.mobile : asset;
  if (isDocumentAsset(asset)) return asset.url ?? "";
  if (isVideoAsset(asset)) return file.webImage?.url ?? asset.webImage?.url ?? "";
  return file.webImage?.url || file.transformBaseUrl || rtePreviewUrl(payload, viewport);
}
