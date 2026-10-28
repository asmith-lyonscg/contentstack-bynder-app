import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CustomField from "../locations/CustomField/CustomField";
import type { AppInstallationConfig } from "../lib/types";
import {
  RTE_ALIGNMENTS,
  assetAlt,
  isFloatAlignment,
  joinRteAttrs,
  payloadWithAlt,
  type RteAlignment,
  type RteDisplay,
} from "../lib/rteDisplay";
import { closeCmsFullscreen, openCmsFullscreen } from "./cmsModal";
import { ensureEditorStyles } from "./editorStyles";

const ALIGNMENT_LABELS: Record<RteAlignment, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
  floatLeft: "Float left",
  floatRight: "Float right",
};

export function openAssetEditor(options: {
  appConfig: AppInstallationConfig;
  fieldConfig?: unknown;
  initialValue: unknown;
  display?: RteDisplay;
  title: string;
  confirmLabel: string;
}): Promise<Record<string, unknown> | null> {
  ensureEditorStyles();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  void openCmsFullscreen(host);
  return new Promise((resolve) => {
    let settled = false;
    const close = (value: Record<string, unknown> | null) => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      void closeCmsFullscreen().finally(() => resolve(value));
    };
    root.render(
      <AssetEditorModal
        {...options}
        onCancel={() => close(null)}
        onSave={(payload) => close(payload)}
      />
    );
  });
}

function AssetEditorModal({
  appConfig,
  fieldConfig,
  initialValue,
  display: initialDisplay,
  title,
  confirmLabel,
  onCancel,
  onSave,
}: {
  appConfig: AppInstallationConfig;
  fieldConfig?: unknown;
  initialValue: unknown;
  display?: RteDisplay;
  title: string;
  confirmLabel: string;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const draft = useRef<Record<string, unknown>>(record(initialValue));
  const altTouched = useRef(false);
  const assetId = useRef<string | undefined>(firstAssetId(record(initialValue)));
  const [empty, setEmpty] = useState(false);
  const [alt, setAlt] = useState(() => assetAlt(record(initialValue)));
  const [display, setDisplay] = useState<RteDisplay>(initialDisplay ?? {});
  const patchDisplay = (patch: Partial<RteDisplay>) => setDisplay((current) => ({ ...current, ...patch }));
  return (
    <div className="bynder-rte-modal" role="presentation">
      <div className="bynder-rte-dialog" role="dialog" aria-modal="true" aria-labelledby="bynder-rte-editor-title">
        <header>
          <h2 id="bynder-rte-editor-title">{title}</h2>
          <button type="button" className="bynder-rte-close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </header>
        <div className="bynder-rte-dialog-body">
          <CustomField
            editorHost={{
              appConfig,
              fieldConfig,
              initialValue,
              singleAsset: true,
              onDraft: (payload) => {
                draft.current = payload;
                const nextId = firstAssetId(payload);
                if (nextId && nextId !== assetId.current) {
                  assetId.current = nextId;
                  altTouched.current = false;
                }
                if (!altTouched.current) setAlt(assetAlt(payload));
              },
            }}
          />
          {empty ? <p className="notice">Choose an asset first.</p> : null}
        </div>
        <section className="bynder-rte-display">
            <h3>Image properties</h3>
            <label>
              Alt text
              <textarea
                rows={2}
                value={alt}
                placeholder="Describe the image"
                onChange={(event) => {
                  altTouched.current = true;
                  setAlt(event.target.value);
                }}
              />
            </label>
            <label>
              Alignment
              <select
                value={display.alignment ?? "left"}
                onChange={(event) => {
                  const alignment = event.target.value as RteAlignment;
                  setDisplay((current) => ({
                    ...current,
                    alignment,
                    inline: isFloatAlignment(alignment) ? true : current.inline,
                  }));
                }}
              >
                {RTE_ALIGNMENTS.map((value) => (
                  <option key={value} value={value}>
                    {ALIGNMENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Caption
              <input value={display.caption ?? ""} onChange={(event) => patchDisplay({ caption: event.target.value })} />
            </label>
            <label>
              Embed link
              <input value={display.link ?? ""} onChange={(event) => patchDisplay({ link: event.target.value })} />
            </label>
            <label className="bynder-rte-check">
              <input
                type="checkbox"
                checked={display.linkNewTab === true}
                onChange={(event) => patchDisplay({ linkNewTab: event.target.checked })}
              />
              Open link in a new tab
            </label>
            <label className="bynder-rte-check">
              <input
                type="checkbox"
                checked={display.inline === true || isFloatAlignment(display.alignment)}
                onChange={(event) => {
                  if (!event.target.checked && isFloatAlignment(display.alignment)) {
                    patchDisplay({ inline: false, alignment: "left" });
                    return;
                  }
                  patchDisplay({ inline: event.target.checked });
                }}
              />
              Inline asset
            </label>
          </section>
        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => {
              const assets = draft.current.assets;
              if (!Array.isArray(assets) || !assets.length) {
                setEmpty(true);
                return;
              }
              onSave(joinRteAttrs(payloadWithAlt(draft.current, alt), display));
            }}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstAssetId(payload: Record<string, unknown>): string | undefined {
  const assets = payload.assets;
  if (!Array.isArray(assets) || !assets[0] || typeof assets[0] !== "object") return undefined;
  const id = (assets[0] as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}
