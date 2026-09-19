export const PICKER_READY = "bynder-picker-ready";
export const PICKER_INIT = "bynder-picker-init";
export const PICKER_RESULT = "bynder-picker-result";

export interface PickerInitPayload {
  portalUrl: string;
  compact: import("../types").CompactViewConfig;
  selectedAssets: string[];
  preselect?: import("../bynder/preselect").CompactPreselectAsset[];
  accessToken?: string;
}

export type PickerReadyMessage = { type: typeof PICKER_READY; id: string };
export type PickerInitMessage = { type: typeof PICKER_INIT; id: string; payload: PickerInitPayload };
export type PickerResultMessage =
  | { type: typeof PICKER_RESULT; id: string; ok: true; assets: unknown[]; additionalInfo?: unknown }
  | { type: typeof PICKER_RESULT; id: string; ok: false };

export function isSameOrigin(event: MessageEvent): boolean {
  return event.origin === window.location.origin;
}
