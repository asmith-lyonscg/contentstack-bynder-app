import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CustomField from "../locations/CustomField/CustomField";
import type { AppInstallationConfig } from "../lib/types";
import { ensureEditorStyles } from "./editorStyles";

export function openAssetEditor(options: {
  appConfig: AppInstallationConfig;
  fieldConfig?: unknown;
  initialValue: unknown;
  title: string;
  confirmLabel: string;
}): Promise<Record<string, unknown> | null> {
  ensureEditorStyles();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise((resolve) => {
    const close = (value: Record<string, unknown> | null) => {
      root.unmount();
      host.remove();
      resolve(value);
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
  title,
  confirmLabel,
  onCancel,
  onSave,
}: {
  appConfig: AppInstallationConfig;
  fieldConfig?: unknown;
  initialValue: unknown;
  title: string;
  confirmLabel: string;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const draft = useRef<Record<string, unknown>>({});
  const [empty, setEmpty] = useState(false);
  return (
    <div className="bynder-rte-modal" role="presentation">
      <div className="bynder-rte-dialog" role="dialog" aria-modal="true" aria-labelledby="bynder-rte-editor-title">
        <header>
          <h2 id="bynder-rte-editor-title">{title}</h2>
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
              },
            }}
          />
          {empty ? <p className="notice">Choose an asset before inserting it.</p> : null}
        </div>
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
              onSave(draft.current);
            }}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
