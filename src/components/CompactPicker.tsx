import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { bynderMediaUrl, moveAsset, type AssetListThumbs } from "../lib/bynder/assetUi";
import { compactAssetIds } from "../lib/bynder/parseAsset";
import { compactPreselectFromParsed } from "../lib/bynder/preselect";
import {
  isSameOrigin,
  PICKER_INIT,
  PICKER_READY,
  PICKER_RESULT,
  type PickerReadyMessage,
  type PickerResultMessage,
} from "../lib/picker/protocol";
import type { CompactViewConfig, ParsedBynderAsset, ViewportKind } from "../lib/types";
import "./CompactPicker.css";

interface CompactPickerProps {
  compact: CompactViewConfig;
  portalUrl: string;
  assets: ParsedBynderAsset[];
  thumbs?: Record<string, AssetListThumbs>;
  focusedId?: string;
  activeViewport?: ViewportKind;
  onFocus: (id: string, viewport?: ViewportKind) => void;
  onSelect: (assets: unknown[], additionalInfo?: unknown) => void;
  onRemove: (id: string) => void;
  onReorder: (ids: string[]) => void;
  getAccessToken?: () => Promise<string>;
  desktopMobileMode?: boolean;
}

function ThumbImage({ src, fallback, objectPosition }: { src: string; fallback: string; objectPosition: string }) {
  const [shown, setShown] = useState(src);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (src === shownRef.current) return undefined;
    const timer = window.setTimeout(() => setShown(src), 280);
    return () => window.clearTimeout(timer);
  }, [src]);

  return (
    <img
      src={shown}
      alt=""
      draggable={false}
      style={{ objectPosition }}
      onError={(event) => {
        if (fallback && event.currentTarget.src !== fallback) {
          event.currentTarget.src = fallback;
          setShown(fallback);
        }
      }}
    />
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={danger ? "thumb-action is-danger" : "thumb-action"}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </button>
  );
}

export function CompactPicker({
  compact,
  portalUrl,
  assets,
  thumbs,
  focusedId,
  activeViewport = "desktop",
  onFocus,
  onSelect,
  onRemove,
  onReorder,
  getAccessToken,
  desktopMobileMode = true,
}: CompactPickerProps) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string>();
  const [dragId, setDragId] = useState<string>();
  const [ordered, setOrdered] = useState(assets);
  const popupRef = useRef<Window | null>(null);
  const orderedRef = useRef(ordered);
  const skipClickRef = useRef(false);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const listRef = useRef<HTMLUListElement>(null);
  const firstRectsRef = useRef<Map<string, DOMRect>>(new Map());
  orderedRef.current = ordered;

  const captureRects = () => {
    const rects = new Map<string, DOMRect>();
    itemRefs.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect()));
    firstRectsRef.current = rects;
  };

  useLayoutEffect(() => {
    const first = firstRectsRef.current;
    if (!first.size) return;
    firstRectsRef.current = new Map();
    playFlip(itemRefs.current, first, dragId);
  }, [ordered, dragId]);

  useEffect(() => {
    if (dragId) return;
    setOrdered(assets);
  }, [assets, dragId]);

  useEffect(() => {
    return () => {
      popupRef.current?.close();
    };
  }, []);

  const rowIdAtClientY = (clientY: number): string | undefined => {
    const list = listRef.current;
    if (!list) return undefined;
    const listTop = list.getBoundingClientRect().top;
    const rows = orderedRef.current;
    for (const row of rows) {
      const el = itemRefs.current.get(row.id);
      if (!el) continue;
      const top = listTop + el.offsetTop - list.scrollTop;
      if (clientY < top + el.offsetHeight / 2) return row.id;
    }
    return rows[rows.length - 1]?.id;
  };

  const onListDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!dragId) return;
    const targetId = rowIdAtClientY(event.clientY);
    if (!targetId || targetId === dragId) return;
    const next = moveAsset(orderedRef.current, dragId, targetId);
    if (next === orderedRef.current) return;
    captureRects();
    setOrdered(next);
  };

  const onRowActivate = (id: string) => {
    if (skipClickRef.current) return;
    onFocus(id);
  };

  const beginReorder = (event: DragEvent, id: string) => {
    skipClickRef.current = true;
    setDragId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const endReorder = () => {
    commitReorder(orderedRef.current);
    setDragId(undefined);
    window.setTimeout(() => {
      skipClickRef.current = false;
    }, 0);
  };

  const openPicker = async () => {
    setOpenError(undefined);
    let accessToken: string | undefined;
    if (getAccessToken) {
      setOpening(true);
      try {
        accessToken = await getAccessToken();
      } catch {
        setOpenError("Login bypass is unavailable, so the Bynder sign-in screen will appear.");
      }
      setOpening(false);
    }

    const id = crypto.randomUUID();
    const url = `${window.location.origin}/picker?id=${encodeURIComponent(id)}`;
    const width = 1280;
    const height = 860;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);

    const selectedAssets = compactAssetIds(assets);
    const preselect = compactPreselectFromParsed(assets);
    console.info("[bynder-picker] opening Compact View selectedAssets", selectedAssets);
    const sendInit = (target: Window) => {
      target.postMessage(
        {
          type: PICKER_INIT,
          id,
          payload: {
            portalUrl,
            compact,
            selectedAssets,
            preselect,
            accessToken,
          },
        },
        window.location.origin
      );
    };

    let popup: Window | null = null;
    let closedTimer = 0;
    let initTimer = 0;

    const cleanup = () => {
      window.clearInterval(closedTimer);
      window.clearInterval(initTimer);
      window.removeEventListener("message", onMessage);
      if (popupRef.current === popup) popupRef.current = null;
    };

    const onMessage = (event: MessageEvent) => {
      if (!isSameOrigin(event)) return;
      const data = event.data as PickerReadyMessage | PickerResultMessage | null;
      if (data?.id !== id) return;
      if (data.type === PICKER_READY) {
        const target =
          event.source && "postMessage" in event.source ? (event.source as Window) : popup;
        if (target && !target.closed) sendInit(target);
        window.clearInterval(initTimer);
        return;
      }
      if (data.type !== PICKER_RESULT) return;
      cleanup();
      if (data.ok && data.assets.length) {
        console.info(
          "[bynder-picker] Compact View confirm ids",
          data.assets.map((raw) => {
            const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
            return { id: record.id, databaseId: record.databaseId };
          })
        );
        onSelect(data.assets, data.additionalInfo);
      }
    };

    window.addEventListener("message", onMessage);
    popupRef.current?.close();
    popup = window.open(
      url,
      `bynder-compact-picker-${id}`,
      `popup=yes,width=${width},height=${height},left=${left},top=${top}`
    );
    if (!popup) {
      window.removeEventListener("message", onMessage);
      setOpenError("Allow popups for this site to open the Bynder picker.");
      return;
    }
    popupRef.current = popup;
    sendInit(popup);
    initTimer = window.setInterval(() => {
      if (!popup || popup.closed) {
        cleanup();
        return;
      }
      sendInit(popup);
    }, 250);
    closedTimer = window.setInterval(() => {
      if (popup?.closed) cleanup();
    }, 400);
  };

  const commitReorder = (next: ParsedBynderAsset[]) => {
    setOrdered(next);
    const ids = next.map((item) => item.id);
    if (ids.join() === assets.map((item) => item.id).join()) return;
    onReorder(ids);
  };

  const countLabel = `${ordered.length} Asset${ordered.length === 1 ? "" : "s"}`;
  const canPickMultiple = (compact.maxLimit ?? 1) > 1;
  const assetWord = canPickMultiple ? "Asset(s)" : "Asset";
  const reselectLabel = `Change ${assetWord}`;
  const canReorder = ordered.length > 1;
  const boardClass = [
    "compact-board",
    canReorder ? "is-multi" : "",
    desktopMobileMode ? "" : "is-single-viewport",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="compact-picker">
      {ordered.length === 0 ? (
        <>
          <p className="compact-empty">No assets have been added</p>
          <button type="button" className="compact-choose" onClick={() => void openPicker()} disabled={opening}>
            {opening ? "Connecting…" : `+ Choose ${assetWord}`}
          </button>
        </>
      ) : (
        <div className={boardClass}>
          <div className="compact-board-title">{countLabel}</div>
          <div className="asset-list-head">
            {canReorder ? <span className="asset-grab is-spacer" aria-hidden /> : null}
            {desktopMobileMode ? (
              <>
                <span className="asset-col-desktop">Desktop</span>
                <span className="asset-col-mobile">Mobile</span>
              </>
            ) : (
              <span className="asset-col-desktop">Preview</span>
            )}
            <span className="asset-col-name">Name</span>
            <span className="asset-col-type">Type</span>
            <span className="asset-actions-label">Actions</span>
          </div>
          <ul
            className="compact-assets"
            ref={listRef}
            onDragOver={onListDragOver}
            onDrop={(event) => {
              event.preventDefault();
              setDragId(undefined);
            }}
          >
            {ordered.map((asset) => {
              const focused = asset.id === focusedId;
              const typeLabel = formatAssetType(asset.type);
              const pair = thumbs?.[asset.id];
              const desktopThumb = pair?.desktop;
              const mobileThumb = pair?.mobile;
              return (
                <li
                  key={asset.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(asset.id, el);
                    else itemRefs.current.delete(asset.id);
                  }}
                  className={[
                    focused ? "is-focused" : "",
                    dragId === asset.id ? "is-dragging" : "",
                    dragId && dragId !== asset.id ? "is-droppable" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button, .asset-grab")) return;
                    onRowActivate(asset.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowActivate(asset.id);
                    }
                  }}
                  role="button"
                  tabIndex={focused ? -1 : 0}
                  aria-pressed={focused}
                  title={asset.name ?? "Bynder image"}
                >
                  {canReorder ? (
                  <span
                    className="asset-grab"
                    title="Reorder"
                    aria-label="Reorder"
                    draggable
                    onDragStart={(event) => beginReorder(event, asset.id)}
                    onDragEnd={endReorder}
                  >
                    <GripIcon />
                  </span>
                  ) : null}
                  <figure
                    className="asset-preview is-desktop"
                    onClick={(event) => {
                      event.stopPropagation();
                      onFocus(asset.id, desktopMobileMode ? "desktop" : undefined);
                    }}
                  >
                    <span
                      className={["asset-thumb", focused && (!desktopMobileMode || activeViewport === "desktop") ? "is-active" : ""]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <ThumbImage
                        src={desktopThumb?.url ?? asset.sourceUrl}
                        fallback={asset.sourceUrl}
                        objectPosition={desktopThumb?.objectPosition ?? "50% 50%"}
                      />
                    </span>
                    {desktopThumb?.caption ? <figcaption className="asset-caption">{desktopThumb.caption}</figcaption> : null}
                  </figure>
                  {desktopMobileMode ? (
                  <figure
                    className="asset-preview is-mobile"
                    onClick={(event) => {
                      event.stopPropagation();
                      onFocus(asset.id, "mobile");
                    }}
                  >
                    <span
                      className={[
                        "asset-thumb",
                        focused && activeViewport === "mobile" ? "is-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <ThumbImage
                        src={mobileThumb?.url ?? asset.sourceUrl}
                        fallback={asset.sourceUrl}
                        objectPosition={mobileThumb?.objectPosition ?? "50% 50%"}
                      />
                    </span>
                    {mobileThumb?.caption ? <figcaption className="asset-caption">{mobileThumb.caption}</figcaption> : null}
                  </figure>
                  ) : null}
                  <span className="asset-name">{asset.name ?? "Bynder image"}</span>
                  <span className="asset-type">{typeLabel}</span>
                  <div className="asset-actions">
                    <IconButton
                      label="Preview"
                      onClick={() => window.open(asset.sourceUrl, "_blank", "noopener")}
                    >
                      <EyeIcon />
                    </IconButton>
                    <IconButton
                      label="Open in Bynder"
                      onClick={() => window.open(bynderMediaUrl(portalUrl, asset), "_blank", "noopener")}
                    >
                      <ExternalIcon />
                    </IconButton>
                    <IconButton label={reselectLabel} onClick={() => void openPicker()}>
                      <SwapIcon />
                    </IconButton>
                    <IconButton label="Remove" danger onClick={() => onRemove(asset.id)}>
                      <MinusIcon />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {canPickMultiple ? (
        <p className="compact-limit-hint">
          Up to {compact.maxLimit} asset{compact.maxLimit === 1 ? "" : "s"}
        </p>
      ) : null}
      {openError ? <p className="compact-open-error">{openError}</p> : null}
      {opening && ordered.length ? <p className="compact-limit-hint">Opening Bynder…</p> : null}
    </div>
  );
}

function formatAssetType(type?: string): string {
  if (!type) return "Image";
  const label = type.trim().toLowerCase();
  if (!label) return "Image";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="6" cy="4" r="1.2" fill="currentColor" />
      <circle cx="10" cy="4" r="1.2" fill="currentColor" />
      <circle cx="6" cy="8" r="1.2" fill="currentColor" />
      <circle cx="10" cy="8" r="1.2" fill="currentColor" />
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
      <circle cx="10" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M6 3.5H3.5v9h9V10" />
      <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M8.5 3.5H12.5V7.5M12.5 3.5 7 9" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M5 3.5 2.5 6 5 8.5M2.5 6h8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.4" d="M11 7.5 13.5 10 11 12.5M13.5 10h-8" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path stroke="currentColor" strokeWidth="1.4" d="M5.2 8h5.6" />
    </svg>
  );
}

const FLIP_MS = 150;

function playFlip(
  nodes: Map<string, HTMLElement>,
  first: Map<string, DOMRect>,
  skipId?: string
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const moving: HTMLElement[] = [];
  nodes.forEach((el, id) => {
    el.style.transition = "none";
    el.style.transform = "none";
    if (id === skipId) return;
    const origin = first.get(id);
    if (!origin) return;
    const last = el.getBoundingClientRect();
    const dx = origin.left - last.left;
    const dy = origin.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    moving.push(el);
  });
  if (!moving.length) return;

  requestAnimationFrame(() => {
    for (const el of moving) {
      el.style.transition = `transform ${FLIP_MS}ms ease-out`;
      el.style.transform = "translate(0px, 0px)";
      const clear = (event: TransitionEvent) => {
        if (event.propertyName !== "transform") return;
        el.style.transition = "";
        el.style.transform = "";
        el.removeEventListener("transitionend", clear);
      };
      el.addEventListener("transitionend", clear);
    }
  });
}
