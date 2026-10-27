import { lazy, Suspense, useEffect, useState } from "react";
import {
  isPickerInit,
  PICKER_READY,
  PICKER_RESULT,
  pickerReplyOrigin,
  type PickerInitPayload,
} from "../../lib/picker/protocol";
import "./PickerPopup.css";

const CompactViewHost = lazy(() => import("../../components/CompactViewHost"));

export default function PickerPopup() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") ?? "";
  const replyOrigin = pickerReplyOrigin(params.get("opener"), window.location.origin);
  const [payload, setPayload] = useState<PickerInitPayload>();
  const [missingOpener, setMissingOpener] = useState(!window.opener || !id);

  useEffect(() => {
    if (!window.opener || !id) {
      setMissingOpener(true);
      return undefined;
    }

    const pingReady = () => {
      window.opener?.postMessage({ type: PICKER_READY, id }, replyOrigin);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.opener || event.origin !== replyOrigin) return;
      const data = event.data;
      if (!isPickerInit(data, id)) return;
      window.clearInterval(readyTimer);
      console.info("[bynder-picker] Compact View selectedAssets", data.payload.selectedAssets);
      setPayload((current) => current ?? data.payload);
    };

    window.addEventListener("message", onMessage);
    pingReady();
    const readyTimer = window.setInterval(pingReady, 250);
    return () => {
      window.clearInterval(readyTimer);
      window.removeEventListener("message", onMessage);
    };
  }, [id, replyOrigin]);

  const finish = (ok: boolean, assets: unknown[] = [], additionalInfo?: unknown) => {
    window.opener?.postMessage(
      ok
        ? { type: PICKER_RESULT, id, ok: true, assets, additionalInfo }
        : { type: PICKER_RESULT, id, ok: false },
      replyOrigin
    );
    window.close();
  };

  if (missingOpener) {
    return (
      <div className="picker-page">
        <p className="picker-status">This Bynder picker window can be closed.</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="picker-page">
        <p className="picker-status">Opening Bynder…</p>
      </div>
    );
  }

  return (
    <div className="picker-page">
      <header className="picker-bar">
        <strong>Choose from Bynder</strong>
        <button type="button" onClick={() => finish(false)}>
          Cancel
        </button>
      </header>
      <div className="picker-body">
        <Suspense fallback={<p className="picker-status">Opening Bynder…</p>}>
          <CompactViewHost
            compact={payload.compact}
            portalUrl={payload.portalUrl}
            selectedAssets={payload.selectedAssets}
            onSuccess={(assets, additionalInfo) => {
              if (!assets.length) {
                finish(false);
                return;
              }
              console.info(
                "[bynder-picker] Compact View confirm ids",
                assets.map((raw) => {
                  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
                  return { id: record.id, databaseId: record.databaseId };
                })
              );
              finish(true, assets, additionalInfo);
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
