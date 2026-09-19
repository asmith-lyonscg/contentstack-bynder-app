import { useEffect, type RefObject } from "react";
import type UiLocation from "@contentstack/app-sdk/dist/src/uiLocation";

/** Content height of the custom field, not the iframe viewport. */
export function measureFieldHeight(root?: HTMLElement | null): number {
  const node = root ?? (typeof document === "undefined" ? null : document.getElementById("root"));
  const bodyHeight = typeof document === "undefined" ? 0 : document.body?.scrollHeight ?? 0;
  const height = Math.max(node?.scrollHeight ?? 0, node?.offsetHeight ?? 0, bodyHeight);
  return Math.max(1, Math.ceil(height));
}

/**
 * Contentstack’s `enableAutoResizing` measures on DOM mutations, which fires
 * when the crop editor class toggles — before the expand animation finishes.
 * Keep the iframe height in sync with the field’s actual content box.
 */
export function useFieldFrameHeight(
  sdk: UiLocation | null,
  rootRef: RefObject<HTMLElement | null>,
  ...resetWhen: unknown[]
) {
  useEffect(() => {
    const frame = sdk?.location.CustomField?.frame;
    if (!frame) return undefined;

    let measureRaf = 0;
    let pulseRaf = 0;
    let running = true;
    const update = () => {
      if (!running) return;
      window.cancelAnimationFrame(measureRaf);
      measureRaf = window.requestAnimationFrame(() => {
        if (!running) return;
        void frame.updateHeight(measureFieldHeight(rootRef.current));
      });
    };

    frame.enableAutoResizing();
    update();

    const node = rootRef.current ?? document.body;
    const observer = new ResizeObserver(update);
    observer.observe(node);

    const started = performance.now();
    const tick = (now: number) => {
      update();
      if (running && now - started < 280) pulseRaf = window.requestAnimationFrame(tick);
    };
    pulseRaf = window.requestAnimationFrame(tick);

    node.addEventListener("transitionend", update);
    return () => {
      running = false;
      window.cancelAnimationFrame(measureRaf);
      window.cancelAnimationFrame(pulseRaf);
      observer.disconnect();
      node.removeEventListener("transitionend", update);
    };
    // resetWhen re-runs the pulse after select / deselect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, rootRef, ...resetWhen]);
}
