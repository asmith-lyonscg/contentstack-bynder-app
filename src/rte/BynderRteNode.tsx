import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { IRteParam } from "@contentstack/app-sdk/dist/src/RTE/types";
import type { AppInstallationConfig } from "../lib/types";
import {
  assetAlt,
  displayAspect,
  editDisplayScale,
  imageViewportsDiffer,
  joinRteAttrs,
  resetDisplayScale,
  rteOpenUrl,
  rtePreviewUrl,
  scaleDisplaySize,
  scaleFor,
  scaleIsCustom,
  splitRteAttrs,
  type RteDisplay,
} from "../lib/rteDisplay";
import type { ViewportKind } from "../lib/types";
import { openAssetEditor } from "./AssetEditorModal";
import { ensureEditorStyles } from "./editorStyles";

function saveNode(rte: IRteParam | undefined, path: number[], previous: RteDisplay, attrs: Record<string, unknown>) {
  if (!rte || !path.length) return;
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
  attributes,
  slateChildren,
}: {
  attrs: Record<string, unknown>;
  path: number[];
  rte?: IRteParam;
  attributes?: HTMLAttributes<HTMLElement>;
  slateChildren?: ReactNode;
}) {
  ensureEditorStyles();
  const [appConfig, setAppConfig] = useState<AppInstallationConfig>({});
  let fieldConfig: unknown = {};
  if (rte && typeof rte.getConfig === "function") {
    try {
      fieldConfig = rte.getConfig();
    } catch {
      fieldConfig = {};
    }
  }
  useEffect(() => {
    if (!rte?.sdk || typeof rte.sdk.getConfig !== "function") return undefined;
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
  const editing = useRef(false);
  const dragging = useRef(false);
  const dragCleanup = useRef<(() => void) | undefined>(undefined);
  const display = split.display;
  const canToggle = imageViewportsDiffer(split.payload, display);
  const [showMobile, setShowMobile] = useState(false);
  const previewViewport: ViewportKind = canToggle && showMobile ? "mobile" : "desktop";
  const aspect = displayAspect(split.payload, previewViewport);
  const savedBox = scaleFor(display, previewViewport, aspect);
  const width = savedBox.width;
  const height = savedBox.height;
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const shownWidth = box?.width ?? width;
  const shownHeight = box?.height ?? height;
  useEffect(() => {
    if (!dragging.current && box && box.width === width && box.height === height) setBox(null);
  }, [box, width, height]);
  useEffect(() => () => dragCleanup.current?.(), []);
  const preview = rtePreviewUrl(split.payload, previewViewport);
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

  const scale = (event: ReactPointerEvent<HTMLButtonElement>, axis: "x" | "y") => {
    event.preventDefault();
    event.stopPropagation();
    dragCleanup.current?.();
    dragging.current = true;
    const handle = event.currentTarget;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // The pointer can already be gone. Window listeners still follow the drag.
    }
    const origin = axis === "x" ? event.clientX : event.clientY;
    const start = { width: shownWidth, height: shownHeight };
    let latest = start;
    const pointOf = (move: PointerEvent) => (axis === "x" ? move.clientX : move.clientY);
    const onMove = (move: PointerEvent) => {
      latest = scaleDisplaySize(start, pointOf(move) - origin, axis);
      setBox(latest);
    };
    const finish = (end: PointerEvent) => {
      dragCleanup.current = undefined;
      dragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (end.type !== "pointercancel") latest = scaleDisplaySize(start, pointOf(end) - origin, axis);
      try {
        if (handle.hasPointerCapture(end.pointerId)) handle.releasePointerCapture(end.pointerId);
      } catch {
        // The pointer was already released.
      }
      if (latest.width === start.width && latest.height === start.height) {
        setBox(null);
        return;
      }
      setBox(latest);
      saveNode(
        rte,
        path,
        display,
        joinRteAttrs(split.payload, editDisplayScale(display, previewViewport, latest))
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    dragCleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  };

  const editImage = () => {
    if (editing.current) return;
    editing.current = true;
    const open = (config: AppInstallationConfig) =>
      openAssetEditor({
        appConfig: config,
        fieldConfig,
        initialValue: split.payload,
        display,
        title: "Edit Image Properties",
        confirmLabel: "Save",
      }).then((next) => {
        if (next) saveNode(rte, path, display, next);
      });
    let pending: Promise<unknown>;
    try {
      pending =
        rte?.sdk && typeof rte.sdk.getConfig === "function"
          ? rte.sdk
              .getConfig()
              .then((config) => open((config ?? appConfig) as AppInstallationConfig))
              .catch(() => open(appConfig))
          : open(appConfig);
    } catch {
      editing.current = false;
      return;
    }
    void Promise.resolve(pending).finally(() => {
      editing.current = false;
    });
  };

  const { className: slateClassName, ...slateAttributes } = attributes ?? {};
  const slateClass = typeof slateClassName === "string" ? slateClassName : "";

  return (
    <span {...slateAttributes} className={[slateClass, className].filter(Boolean).join(" ")}>
      <span contentEditable={false}>
      <span className="bynder-rte-box" style={{ width: shownWidth, aspectRatio: `${shownWidth} / ${shownHeight}` }}>
        <span className="bynder-rte-frame">
          {preview ? <img src={preview} alt={assetAlt(split.payload)} /> : null}
        </span>
        <button
          type="button"
          className="bynder-rte-handle is-east"
          aria-label="Drag the right edge to scale"
          title="Drag the right edge to scale"
          onPointerDown={(event) => scale(event, "x")}
        />
        <button
          type="button"
          className="bynder-rte-handle is-south"
          aria-label="Drag the bottom edge to scale"
          title="Drag the bottom edge to scale"
          onPointerDown={(event) => scale(event, "y")}
        />
        <span className="bynder-rte-toolbar">
          <button
            type="button"
            aria-label="Preview"
            title="Preview"
            data-tip="Preview"
            onClick={() => preview && window.open(preview, "_blank", "noopener")}
          >
            <EyeIcon />
          </button>
          <button
            type="button"
            aria-label="Open file"
            title="Open file"
            data-tip="Open file"
            onClick={() => {
              const url = rteOpenUrl(split.payload, previewViewport);
              if (url) window.open(url, "_blank", "noopener");
            }}
          >
            <ExternalIcon />
          </button>
          <button type="button" aria-label="Edit image properties" title="Edit image properties" data-tip="Edit image properties" onClick={editImage}>
            <ImageIcon />
          </button>
          {canToggle ? (
            <button
              type="button"
              className={previewViewport === "mobile" ? "is-active" : ""}
              aria-label={previewViewport === "mobile" ? "Show desktop image" : "Show mobile image"}
              aria-pressed={previewViewport === "mobile"}
              title={previewViewport === "mobile" ? "Show desktop image" : "Show mobile image"}
              data-tip={previewViewport === "mobile" ? "Show desktop image" : "Show mobile image"}
              onClick={() => {
                setBox(null);
                setShowMobile((current) => !current);
              }}
            >
              <PhoneIcon />
            </button>
          ) : null}
          {scaleIsCustom(display, previewViewport) ? (
            <button
              type="button"
              aria-label="Revert to original scale"
              title="Revert to original scale"
              data-tip="Revert to original scale"
              onClick={() => {
                setBox(null);
                saveNode(rte, path, display, joinRteAttrs(split.payload, resetDisplayScale(display)));
              }}
            >
              <ResetIcon />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Remove"
            title="Remove"
            data-tip="Remove"
            onClick={() => {
              if (!rte || !path.length) return;
              const entry = rte.getNode(path);
              if (entry?.[0]) rte.removeNode(entry[0]);
            }}
          >
            <MinusIcon />
          </button>
        </span>
      </span>
      {display.caption ? <span className="bynder-rte-caption">{display.caption}</span> : null}
      </span>
      {slateChildren}
    </span>
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

function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M6 1.5h4c.6 0 1 .4 1 1v11c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-11c0-.6.4-1 1-1zm.3 1.3v.5h3.4v-.5H6.3zM8 12.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path fill="currentColor" d="M8 2.2V.6L4.8 3.2 8 5.8V4.2a3.8 3.8 0 1 1-3.3 1.9l-1.3-.7A5.2 5.2 0 1 0 8 2.2z" />
    </svg>
  );
}
