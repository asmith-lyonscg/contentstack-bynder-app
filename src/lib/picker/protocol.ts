export const PICKER_READY = "bynder-picker-ready";
export const PICKER_INIT = "bynder-picker-init";
export const PICKER_RESULT = "bynder-picker-result";

export interface PickerInitPayload {
  portalUrl: string;
  compact: import("../types").CompactViewConfig;
  selectedAssets: string[];
  preselect?: import("../bynder/preselect").CompactPreselectAsset[];
}

export type PickerReadyMessage = { type: typeof PICKER_READY; id: string };
export type PickerInitMessage = { type: typeof PICKER_INIT; id: string; payload: PickerInitPayload };
export type PickerResultMessage =
  | { type: typeof PICKER_RESULT; id: string; ok: true; assets: unknown[]; additionalInfo?: unknown }
  | { type: typeof PICKER_RESULT; id: string; ok: false };

export function isSameOrigin(event: MessageEvent): boolean {
  return event.origin === window.location.origin;
}

export function httpOrigin(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.hostname) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** Contentstack's JSON RTE host, including regional app hosts. */
export function isContentstackOrigin(origin: string): boolean {
  const parsed = httpOrigin(origin);
  if (!parsed) return false;
  return /(^|\.)contentstack\.(com|io)$/i.test(new URL(parsed).hostname);
}

export function isPickerReady(data: unknown, id: string): data is PickerReadyMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as PickerReadyMessage;
  return message.type === PICKER_READY && message.id === id;
}

export function isPickerInit(data: unknown, id: string): data is PickerInitMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as PickerInitMessage;
  const payload = message.payload;
  return (
    message.type === PICKER_INIT &&
    message.id === id &&
    !!payload &&
    typeof payload.portalUrl === "string" &&
    payload.portalUrl.length > 0 &&
    !!payload.compact &&
    typeof payload.compact === "object" &&
    Array.isArray(payload.selectedAssets)
  );
}

export function isPickerResult(data: unknown, id: string): data is PickerResultMessage {
  if (!data || typeof data !== "object") return false;
  const message = data as PickerResultMessage;
  if (message.type !== PICKER_RESULT || message.id !== id) return false;
  if (message.ok === true) return Array.isArray(message.assets);
  return message.ok === false;
}

/**
 * Origin the picker window posts back to.
 * The RTE plugin and this popup are different sites, so the opener is passed in the query.
 * Only Contentstack hosts are accepted from that query. Every other opener stays on this page.
 */
export function pickerReplyOrigin(openerParam: string | null, pageOrigin: string): string {
  const requested = httpOrigin(openerParam);
  if (requested && isContentstackOrigin(requested)) return requested;
  return pageOrigin;
}
