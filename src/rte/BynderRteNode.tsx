import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { IRteParam } from "@contentstack/app-sdk/dist/src/RTE/types";
import type { AppInstallationConfig } from "../lib/types";
import {
  RTE_ALIGNMENTS,
  assetAlt,
  displayAspect,
  isFloatAlignment,
  joinRteAttrs,
  payloadWithAlt,
  rteOpenUrl,
  rtePreviewUrl,
  splitRteAttrs,
  type RteAlignment,
  type RteDisplay,
} from "../lib/rteDisplay";
import { openAssetEditor } from "./AssetEditorModal";
import { closeCmsFullscreen, openCmsFullscreen } from "./cmsModal";
import { ensureEditorStyles } from "./editorStyles";

const ALIGNMENT_LABELS: Record<RteAlignment, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
  floatLeft: "Float left",
  floatRight: "Float right",
};

function saveNode(rte: IRteParam, path: number[], previous: RteDisplay, attrs: Record<string, unknown>) {
  const nextInline = Boolean(splitRteAttrs(attrs).display.inline);
  const wasInline = Boolean(previous.inline);
  rte.setAttrs({ attrs }, { at: path });
  if (nextInline && !wasInline) {
    rte.wrapNode(
      {
        type: "p",
        attrs: { style: { display: "inline-block", overflow: "hidden" }, classname: "bynder" },
        children: [{ text: "" }],
      },
      { at: path }
    );
  } else if (!nextInline && wasInline) {
    rte.unwrapNode({ at: path, match: (node) => (node as { type?: string }).type === "p" });
  }
}

export function BynderRteNode({
  attrs,
  path,
  rte,
}: {
  attrs: Record<string, unknown>;
  path: number[];
  rte: IRteParam;
}) {
  ensureEditorStyles();
  const [appConfig, setAppConfig] = useState<AppInstallationConfig>({});
  const fieldConfig = rte.getConfig();
  useEffect(() => {
    let cancelled = false;
    void rte.sdk
      .getConfig()
      .then((config) => {
        if (!cancelled) setAppConfig((config ?? {}) as AppInstallationConfig);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rte]);
  const split = splitRteAttrs(attrs);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [draft, setDraft] = useState<{ alt: string; display: RteDisplay } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const display = split.display;
  const aspect = displayAspect(split.payload);
  const width = display.width ?? 320;
  const height = display.height ?? Math.max(1, Math.round(width / aspect));
  const preview = rtePreviewUrl(split.payload);
  const alignment = display.alignment ?? "left";
  const className = [
    "bynder-rte-node",
    display.inline ? "is-inline" : "",
    alignment === "center" ? "is-center" : "",
    alignment === "right" ? "is-right" : "",
    alignment === "floatLeft" ? "is-float-left" : "",
    alignment === "floatRight" ? "is-float-right" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const scale = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (move: globalThis.PointerEvent) => {
      const nextWidth = Math.max(80, Math.round(startWidth + (move.clientX - startX)));
      const nextHeight = Math.max(1, Math.round(nextWidth / aspect));
      if (frameRef.current) {
        frameRef.current.style.width = `${nextWidth}px`;
        frameRef.current.style.height = `${nextHeight}px`;
      }
    };
    const onUp = (up: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const nextWidth = Math.max(80, Math.round(startWidth + (up.clientX - startX)));
      const nextHeight = Math.max(1, Math.round(nextWidth / aspect));
      saveNode(rte, path, display, joinRteAttrs(split.payload, { ...display, width: nextWidth, height: nextHeight }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const openProperties = () => {
    setDraft({ alt: assetAlt(split.payload), display });
    setPropertiesOpen(true);
  };

  return (
    <span className={className} contentEditable={false}>
      <span className="bynder-rte-frame" ref={frameRef} style={{ width, height }}>
        {preview ? <img src={preview} alt={assetAlt(split.payload)} /> : null}
        <button type="button" className="bynder-rte-handle" aria-label="Scale asset" onPointerDown={scale} />
        <span className="bynder-rte-toolbar">
          <button type="button" aria-label="Preview" onClick={() => preview && window.open(preview, "_blank", "noopener")}>
            <EyeIcon />
          </button>
          <button
            type="button"
            aria-label="Open file"
            onClick={() => {
              const url = rteOpenUrl(split.payload);
              if (url) window.open(url, "_blank", "noopener");
            }}
          >
            <ExternalIcon />
          </button>
          <button type="button" aria-label="Edit image properties" onClick={openProperties}>
            <ImageIcon />
          </button>
          <button
            type="button"
            aria-label="Remove"
            onClick={() => {
              const entry = rte.getNode(path);
              if (entry?.[0]) rte.removeNode(entry[0]);
            }}
          >
            <MinusIcon />
          </button>
        </span>
      </span>
      {display.caption ? <span className="bynder-rte-caption">{display.caption}</span> : null}
      {propertiesOpen && draft
        ? createPortal(
            <PropertiesModal
              preview={preview}
              alt={draft.alt}
              display={draft.display}
              onChange={setDraft}
              onCancel={() => setPropertiesOpen(false)}
              onSave={() => {
                const payload = payloadWithAlt(split.payload, draft.alt);
                saveNode(rte, path, display, joinRteAttrs(payload, draft.display));
                setPropertiesOpen(false);
              }}
              onAssetSettings={() => {
                void openAssetEditor({
                  appConfig,
                  fieldConfig,
                  initialValue: split.payload,
                  title: "Bynder asset",
                  confirmLabel: "Update",
                }).then((payload) => {
                  if (!payload) return;
                  saveNode(rte, path, display, joinRteAttrs(payload, draft.display));
                  setPropertiesOpen(false);
                });
              }}
            />,
            document.body
          )
        : null}
    </span>
  );
}

function PropertiesModal({
  preview,
  alt,
  display,
  onChange,
  onCancel,
  onSave,
  onAssetSettings,
}: {
  preview?: string;
  alt: string;
  display: RteDisplay;
  onChange: (next: { alt: string; display: RteDisplay }) => void;
  onCancel: () => void;
  onSave: () => void;
  onAssetSettings: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    void openCmsFullscreen(host);
    return () => {
      void closeCmsFullscreen();
    };
  }, []);
  const setDisplay = (patch: Partial<RteDisplay>) => onChange({ alt, display: { ...display, ...patch } });
  return (
    <div className="bynder-rte-properties" role="presentation" ref={hostRef}>
      <div className="bynder-rte-properties-card" role="dialog" aria-modal="true" aria-labelledby="bynder-rte-properties-title">
        <header>
          <h2 id="bynder-rte-properties-title">Edit Image Properties</h2>
          <button type="button" className="bynder-rte-close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="bynder-rte-properties-layout">
            <div className="bynder-rte-properties-preview">
              {preview ? <img src={preview} alt={alt} /> : null}
            </div>
            <div className="bynder-rte-properties-fields">
              <label>
                Alt text
                <input value={alt} onChange={(event) => onChange({ alt: event.target.value, display })} />
              </label>
              <label>
                Alignment
                <select
                  value={display.alignment ?? "left"}
                  onChange={(event) => {
                    const alignment = event.target.value as RteAlignment;
                    setDisplay({ alignment, inline: isFloatAlignment(alignment) ? true : display.inline });
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
                <input value={display.caption ?? ""} onChange={(event) => setDisplay({ caption: event.target.value })} />
              </label>
              <label>
                Embed link
                <input value={display.link ?? ""} onChange={(event) => setDisplay({ link: event.target.value })} />
              </label>
              <label className="bynder-rte-check">
                <input
                  type="checkbox"
                  checked={display.linkNewTab === true}
                  onChange={(event) => setDisplay({ linkNewTab: event.target.checked })}
                />
                Open link in a new tab
              </label>
              <label className="bynder-rte-check">
                <input
                  type="checkbox"
                  checked={display.inline === true || isFloatAlignment(display.alignment)}
                  onChange={(event) => setDisplay({ inline: event.target.checked })}
                />
                Inline asset
              </label>
              <button type="button" className="bynder-rte-asset-settings" onClick={onAssetSettings}>
                Asset settings
              </button>
            </div>
          </div>
        </form>
        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="is-primary" onClick={onSave}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M8 3.5C4.5 3.5 2 6.2 1 8c1 1.8 3.5 4.5 7 4.5s6-2.7 7-4.5c-1-1.8-3.5-4.5-7-4.5zm0 7.2A2.7 2.7 0 1 1 8 5.3a2.7 2.7 0 0 1 0 5.4z" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M4 4h4v1.4H5.4V11.6h6.2V8H13v5H4V4zm5 .1h3.1V7.2h-1.4V6.5L7.4 9.8 6.4 8.8l3.3-3.3h-.7V4.1z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M2 3.5h12v9H2v-9zm1.4 7.6h9.2l-2.4-3-1.8 2.2-1.2-1.4-3.8 2.2zM6 7.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M3 7.2h10v1.6H3z" />
    </svg>
  );
}
