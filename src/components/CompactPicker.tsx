import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { bynderMediaUrl, moveAsset, type AssetListThumbs, type ListThumb } from "../lib/bynder/assetUi";
import { frameLayout, offsetForOperation } from "../lib/bynder/coverLayout";
import { compactAssetIds, isDocumentAsset, isVideoAsset } from "../lib/bynder/parseAsset";
import { compactPreselectFromParsed } from "../lib/bynder/preselect";
import { ImageSpinner } from "./ImageSpinner";
import {
  isSameOrigin,
  PICKER_INIT,
  PICKER_READY,
  PICKER_RESULT,
  type PickerReadyMessage,
  type PickerResultMessage,
} from "../lib/picker/protocol";
import { appHref } from "../lib/appBase";
import type { CompactViewConfig, DatOperation, FocalPoint, ParsedBynderAsset, ViewportKind } from "../lib/types";
import "./CompactPicker.css";

function thumbScaleStyle(desktop?: ListThumb, mobile?: ListThumb): CSSProperties | undefined {
  const dw = desktop?.aspectW;
  const dh = desktop?.aspectH;
  if (!dw || !dh) return undefined;
  return {
    ["--desk-crop-w" as string]: String(dw),
    ["--desk-crop-h" as string]: String(dh),
    ["--mob-crop-w" as string]: String(mobile?.aspectW || dw),
    ["--mob-crop-h" as string]: String(mobile?.aspectH || dh),
  };
}

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
  /** Drop the separate mobile file and go back to the desktop asset. */
  onRemoveMobile?: (id: string) => void;
  onReorder: (ids: string[]) => void;
  desktopMobileMode?: boolean;
  /** Row ids whose mobile thumb is a separate Bynder file (or an empty chooser). */
  separateMobileIds?: string[];
  /** Row ids whose desktop and mobile file and crop still match. */
  linkedIds?: string[];
  /** Separate mobile slots that do not have a file yet. */
  emptyMobileIds?: string[];
  /** Bump `nonce` to open Compact View for that row's mobile file only. */
  mobilePickRequest?: { id: string; nonce: number };
  /** Bump `nonce` to replace that row's desktop file. */
  desktopPickRequest?: { id: string; nonce: number };
  onSelectMobile?: (id: string, assets: unknown[], additionalInfo?: unknown) => void;
  /** Replace one row's desktop file. The row's mobile file stays. */
  onReplaceDesktop?: (id: string, assets: unknown[], additionalInfo?: unknown) => void;
  /** Separate mobile files keyed by the desktop row id. */
  mobileFiles?: Record<string, { id: string; name?: string; type?: string; sourceUrl?: string }>;
}

function focalFromPosition(value: string): FocalPoint {
  const match = /^([\d.]+)%\s+([\d.]+)%$/.exec(value.trim());
  if (!match) return { x: 0.5, y: 0.5 };
  return { x: Number(match[1]) / 100, y: Number(match[2]) / 100 };
}

function ThumbImage({
  src,
  fallback,
  objectPosition,
  operation = "fill",
  cropW,
  cropH,
}: {
  src: string;
  fallback: string;
  objectPosition: string;
  operation?: DatOperation;
  cropW?: number;
  cropH?: number;
}) {
  const [shown, setShown] = useState(src);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (src === shownRef.current) return undefined;
    const timer = window.setTimeout(() => setShown(src), 280);
    return () => window.clearTimeout(timer);
  }, [src]);

  useEffect(() => {
    setNatural({ w: 0, h: 0 });
    setFailed(false);
  }, [shown]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !shown || !img.complete || img.naturalWidth <= 0) return;
    setLoadedSrc(shown);
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, [shown]);

  useLayoutEffect(() => {
    const parent = imgRef.current?.parentElement;
    if (!parent || operation !== "crop") return undefined;
    const sync = () => setFrame({ w: parent.clientWidth, h: parent.clientHeight });
    sync();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(sync);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [operation, shown]);

  const cropLayout =
    operation === "crop" && natural.w > 0 && natural.h > 0 && frame.w > 0 && frame.h > 0 && cropW && cropH
      ? frameLayout("crop", natural.w, natural.h, frame.w, frame.h, cropW, cropH)
      : null;
  const cropOffset = cropLayout
    ? offsetForOperation("crop", focalFromPosition(objectPosition), cropLayout, frame.w, frame.h)
    : null;

  const loading = Boolean(shown) && loadedSrc !== shown && !failed;

  return (
    <>
      {loading ? <ImageSpinner /> : null}
      <img
        ref={imgRef}
        src={shown}
        alt=""
        draggable={false}
        className={[operation === "fit" ? "is-fit" : "", cropLayout ? "is-crop" : "", loading ? "is-loading" : ""]
          .filter(Boolean)
          .join(" ") || undefined}
        style={
          cropLayout && cropOffset
            ? {
                width: cropLayout.dispW,
                height: cropLayout.dispH,
                transform: `translate(${cropOffset.x}px, ${cropOffset.y}px)`,
              }
            : { objectPosition: operation === "fit" ? "50% 50%" : objectPosition }
        }
        onLoad={(event) => {
          setLoadedSrc(shown);
          setFailed(false);
          setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight });
        }}
        onError={(event) => {
          if (fallback && event.currentTarget.src !== fallback) {
            event.currentTarget.src = fallback;
            setShown(fallback);
            return;
          }
          setFailed(true);
        }}
      />
    </>
  );
}

export function AssetToolbar({
  previewUrl,
  bynderUrl,
  changeLabel,
  removeLabel,
  onChange,
  onRemove,
}: {
  previewUrl?: string;
  bynderUrl?: string;
  changeLabel: string;
  removeLabel: string;
  onChange: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="asset-icon-set">
      <AssetIconSet previewUrl={previewUrl} bynderUrl={bynderUrl} changeLabel={changeLabel} onChange={onChange} />
      <IconButton label={removeLabel} danger onClick={onRemove}>
        <MinusIcon />
      </IconButton>
    </span>
  );
}

function AssetIconSet({
  previewUrl,
  bynderUrl,
  changeLabel,
  onChange,
}: {
  previewUrl?: string;
  bynderUrl?: string;
  changeLabel: string;
  onChange: () => void;
}) {
  return (
    <span className="asset-icon-set">
      <IconButton
        label="Preview"
        onClick={() => {
          if (previewUrl) window.open(previewUrl, "_blank", "noopener");
        }}
      >
        <EyeIcon />
      </IconButton>
      <IconButton
        label="Open in Bynder"
        onClick={() => {
          if (bynderUrl) window.open(bynderUrl, "_blank", "noopener");
        }}
      >
        <ExternalIcon />
      </IconButton>
      <IconButton label={changeLabel} onClick={onChange}>
        <SwapIcon />
      </IconButton>
    </span>
  );
}

function ThumbCaption({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figcaption className="asset-caption" title={caption || undefined}>
      <span className="asset-caption-text">{caption}</span>
      <span className="asset-caption-actions">{children}</span>
    </figcaption>
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
  onRemoveMobile,
  onReorder,
  desktopMobileMode = true,
  separateMobileIds,
  linkedIds,
  emptyMobileIds,
  mobilePickRequest,
  desktopPickRequest,
  onSelectMobile,
  onReplaceDesktop,
  mobileFiles,
}: CompactPickerProps) {
  const [openError, setOpenError] = useState<string>();
  const [confirm, setConfirm] = useState<{ message: string; confirmLabel: string; action: () => void }>();
  const [dragId, setDragId] = useState<string>();
  const [ordered, setOrdered] = useState(assets);
  const popupRef = useRef<Window | null>(null);
  const orderedRef = useRef(ordered);
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

  const beginReorder = (event: DragEvent, id: string) => {
    setDragId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const endReorder = () => {
    commitReorder(orderedRef.current);
    setDragId(undefined);
  };

  const openPicker = (mobileForId?: string, replaceDesktopId?: string) => {
    setOpenError(undefined);

    const id = crypto.randomUUID();
    const url = appHref(`picker?id=${encodeURIComponent(id)}`);
    const width = 1280;
    const height = 860;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);

    const pickingOne = Boolean(mobileForId || replaceDesktopId);
    const selectedAssets = pickingOne ? [] : compactAssetIds(assets);
    const preselect = pickingOne ? [] : compactPreselectFromParsed(assets);
    const compactPayload = pickingOne ? { ...compact, mode: "SingleSelect" as const, maxLimit: 1 } : compact;
    console.info("[bynder-picker] opening Compact View selectedAssets", selectedAssets);
    const sendInit = (target: Window) => {
      target.postMessage(
        {
          type: PICKER_INIT,
          id,
          payload: {
            portalUrl,
            compact: compactPayload,
            selectedAssets,
            preselect,
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
        if (mobileForId && onSelectMobile) onSelectMobile(mobileForId, data.assets, data.additionalInfo);
        else if (replaceDesktopId && onReplaceDesktop) onReplaceDesktop(replaceDesktopId, data.assets, data.additionalInfo);
        else onSelect(data.assets, data.additionalInfo);
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

  const confirmRemove = (message: string, action: () => void, confirmLabel = "Remove") => {
    setConfirm({ message, confirmLabel, action });
  };

  const mobilePickNonce = mobilePickRequest?.nonce ?? 0;
  const seenMobilePick = useRef(0);
  useEffect(() => {
    if (!mobilePickRequest || mobilePickNonce === seenMobilePick.current) return;
    seenMobilePick.current = mobilePickNonce;
    openPicker(mobilePickRequest.id);
  }, [mobilePickNonce, mobilePickRequest]);

  const desktopPickNonce = desktopPickRequest?.nonce ?? 0;
  const seenDesktopPick = useRef(0);
  useEffect(() => {
    if (!desktopPickRequest || desktopPickNonce === seenDesktopPick.current) return;
    seenDesktopPick.current = desktopPickNonce;
    openPicker(undefined, desktopPickRequest.id);
  }, [desktopPickNonce, desktopPickRequest]);

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
  const hasImage = ordered.some((asset) => !isVideoAsset(asset) && !isDocumentAsset(asset));
  const acceptsImages = compact.assetTypes.includes("IMAGE");
  const showMobileColumn = desktopMobileMode && (hasImage || (ordered.length === 0 && acceptsImages));
  const boardClass = [
    "compact-board",
    canReorder ? "is-multi" : "",
    showMobileColumn ? "" : "is-single-viewport",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="compact-picker">
      <div className={boardClass}>
        <div className="compact-board-title">{countLabel}</div>
        <div className="asset-list-head">
          {canReorder ? <span className="asset-grab is-spacer" aria-hidden /> : null}
          {showMobileColumn ? (
            <>
              <span className="asset-col-desktop">Desktop</span>
              <span className="asset-col-mobile">Mobile</span>
            </>
          ) : (
            <span className="asset-col-desktop">Thumbnail</span>
          )}
          <span className="asset-col-name">Name</span>
          <span className="asset-col-type">Type</span>
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
          {ordered.length === 0 ? (
            <li className="is-empty">
              <button type="button" className="asset-choose" onClick={() => openPicker()}>
                <span className="asset-choose-icon" aria-hidden>
                  +
                </span>
                {`Choose ${assetWord}`}
              </button>
            </li>
          ) : (
          ordered.map((asset) => {
              const focused = asset.id === focusedId;
              const typeLabel = formatAssetType(asset.type);
              const pair = thumbs?.[asset.id];
              const desktopThumb = pair?.desktop;
              const mobileThumb = pair?.mobile;
              const video = isVideoAsset(asset);
              const document = isDocumentAsset(asset);
              const selectable = !video && !document;
              const rowFocused = focused && selectable;
              const showMobile = showMobileColumn && !document && !video;
              const videoSharesAsset = showMobileColumn && video;
              const separateMobile = Boolean(separateMobileIds?.includes(asset.id));
              const linked = Boolean(showMobile && !separateMobile && linkedIds?.includes(asset.id));
              const emptyMobile = Boolean(emptyMobileIds?.includes(asset.id));
              const mobileFile = mobileFiles?.[asset.id];
              const pairActions = Boolean(separateMobile && !emptyMobile && mobileFile);
              const desktopName = asset.name ?? "Bynder image";
              const mobileName = mobileFile?.name || mobileFile?.id || "Mobile image";
              const thumbMark = video ? (
                <span className="asset-dat-warn is-video" title="Bynder video asset">
                  Video
                </span>
              ) : document ? (
                <span className="asset-dat-warn is-document" title="Bynder document asset">
                  Document
                </span>
              ) : !asset.transformBaseUrl ? (
                <span className="asset-dat-warn" title="This image is not DAT capable">
                  No DAT
                </span>
              ) : null;
              return (
                <li
                  key={asset.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(asset.id, el);
                    else itemRefs.current.delete(asset.id);
                  }}
                  className={[
                    focused && selectable ? "is-focused" : "",
                    selectable ? "" : "is-static",
                    document ? "is-document" : "",
                    dragId === asset.id ? "is-dragging" : "",
                    dragId && dragId !== asset.id ? "is-droppable" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={thumbScaleStyle(desktopThumb, mobileThumb)}
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
                  <figure className="asset-preview is-desktop">
                    <span
                      className={["asset-thumb", rowFocused && (!showMobile || activeViewport === "desktop") ? "is-active" : ""]
                        .filter(Boolean)
                        .join(" ")}
                      role={selectable ? "button" : undefined}
                      tabIndex={selectable ? 0 : undefined}
                      aria-pressed={selectable ? rowFocused && (!showMobile || activeViewport === "desktop") : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!selectable) return;
                        onFocus(asset.id, showMobile ? "desktop" : undefined);
                      }}
                      onKeyDown={(event) => {
                        if (!selectable) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onFocus(asset.id, showMobile ? "desktop" : undefined);
                        }
                      }}
                    >
                      <ThumbImage
                        src={desktopThumb?.url ?? asset.sourceUrl}
                        fallback={asset.sourceUrl}
                        objectPosition={desktopThumb?.objectPosition ?? "50% 50%"}
                        operation={desktopThumb?.operation}
                        cropW={desktopThumb?.aspectW}
                        cropH={desktopThumb?.aspectH}
                      />
                      {thumbMark}
                    </span>
                    {linked ? (
                      <span className="thumb-link" title="Desktop and mobile match">
                        <HorizontalLinkIcon />
                      </span>
                    ) : null}
                    <ThumbCaption caption={desktopThumb?.caption}>
                      <AssetIconSet
                        previewUrl={asset.sourceUrl}
                        bynderUrl={bynderMediaUrl(portalUrl, asset)}
                        changeLabel={pairActions ? "Change desktop asset" : reselectLabel}
                        onChange={() => (pairActions ? openPicker(undefined, asset.id) : openPicker())}
                      />
                      <IconButton
                        label={pairActions ? "Remove desktop and mobile assets" : "Remove"}
                        danger
                        onClick={() =>
                          pairActions
                            ? confirmRemove(
                                "This will remove both the desktop and mobile asset. Are you sure you want to remove both?",
                                () => onRemove(asset.id),
                                "Remove Both"
                              )
                            : confirmRemove("Are you sure you want to remove this asset?", () => onRemove(asset.id))
                        }
                      >
                        <MinusIcon />
                      </IconButton>
                    </ThumbCaption>
                  </figure>
                  {showMobile && emptyMobile ? (
                    <button
                      type="button"
                      className="asset-preview is-mobile mobile-choose"
                      onClick={(event) => {
                        event.stopPropagation();
                        openPicker(asset.id);
                      }}
                    >
                      Choose mobile image
                    </button>
                  ) : showMobile ? (
                  <figure className="asset-preview is-mobile">
                    <span
                      className={[
                        "asset-thumb",
                        focused && activeViewport === "mobile" ? "is-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role={selectable ? "button" : undefined}
                      tabIndex={selectable ? 0 : undefined}
                      aria-pressed={selectable ? focused && activeViewport === "mobile" : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        onFocus(asset.id, "mobile");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onFocus(asset.id, "mobile");
                        }
                      }}
                    >
                      <ThumbImage
                        src={mobileThumb?.url ?? asset.sourceUrl}
                        fallback={asset.sourceUrl}
                        objectPosition={mobileThumb?.objectPosition ?? "50% 50%"}
                        operation={mobileThumb?.operation}
                        cropW={mobileThumb?.aspectW}
                        cropH={mobileThumb?.aspectH}
                      />
                      {thumbMark}
                    </span>
                    <ThumbCaption caption={mobileThumb?.caption}>
                      {separateMobile ? (
                        <>
                          <AssetIconSet
                            previewUrl={mobileFile?.sourceUrl}
                            bynderUrl={mobileFile ? bynderMediaUrl(portalUrl, { id: mobileFile.id }) : undefined}
                            changeLabel="Change mobile asset"
                            onChange={() => openPicker(asset.id)}
                          />
                          <IconButton
                            label="Remove mobile asset"
                            danger
                            onClick={() =>
                              confirmRemove(
                                "Are you sure you want to remove the mobile asset? This will revert to using the same asset for both desktop and mobile.",
                                () => onRemoveMobile?.(asset.id)
                              )
                            }
                          >
                            <MinusIcon />
                          </IconButton>
                        </>
                      ) : (
                        <IconButton label="Change mobile asset" onClick={() => openPicker(asset.id)}>
                          <SwapIcon />
                        </IconButton>
                      )}
                    </ThumbCaption>
                  </figure>
                  ) : videoSharesAsset ? (
                    <p className="asset-preview is-mobile asset-same-note">Same as desktop</p>
                  ) : showMobileColumn ? (
                    <span className="asset-preview is-mobile is-absent" aria-hidden />
                  ) : null}
                  {pairActions ? (
                    <span className="asset-name is-pair">
                      <span className="pair-line">
                        <span className="pair-label">Desktop:</span>
                        <span className="pair-value">{desktopName}</span>
                      </span>
                      <span className="pair-line">
                        <span className="pair-label">Mobile:</span>
                        <span className="pair-value">{mobileName}</span>
                      </span>
                    </span>
                  ) : (
                    <span className="asset-name">{desktopName}</span>
                  )}
                  <span className={pairActions ? "asset-type is-pair" : "asset-type"}>
                    {pairActions ? (
                      <>
                        <span className="pair-line">
                          <span className="pair-value">{typeLabel}</span>
                        </span>
                        <span className="pair-line">
                          <span className="pair-value">{formatAssetType(mobileFile?.type)}</span>
                        </span>
                      </>
                    ) : (
                      typeLabel
                    )}
                  </span>
                </li>
              );
            }))}
          </ul>
        </div>
      {canPickMultiple ? (
        <p className="compact-limit-hint">
          Up to {compact.maxLimit} asset{compact.maxLimit === 1 ? "" : "s"}
        </p>
      ) : null}
      {openError ? <p className="compact-open-error">{openError}</p> : null}
      {confirm ? (
        <div className="confirm-backdrop" role="presentation" onClick={() => setConfirm(undefined)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-confirm-message"
            onClick={(event) => event.stopPropagation()}
          >
            <p id="remove-confirm-message">{confirm.message}</p>
            <div className="confirm-actions">
              <button type="button" onClick={() => setConfirm(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  const action = confirm.action;
                  setConfirm(undefined);
                  action();
                }}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatAssetType(type?: string): string {
  if (!type) return "Image";
  const label = type.trim().toLowerCase();
  if (!label) return "Image";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function HorizontalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M9 8H7.5a4 4 0 0 0 0 8H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 8h1.5a4 4 0 0 1 0 8H15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
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
