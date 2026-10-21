import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { FocalPoint, TransformSettings } from "../lib/types";
import {
  aspectRatioForConceptual,
  clampConceptualWidth,
  conceptualWidthForRatio,
  customAspectFrame,
  customCanvasHeight,
  ratioNumber,
} from "../lib/bynder/customAspect";
import { fitPreviewBox, previewIsToScale } from "../lib/bynder/composeDatUrl";
import {
  clampOffset,
  focalFromOffset,
  frameLayout,
  imagePointFromPointer,
  offsetForOperation,
} from "../lib/bynder/coverLayout";
import { ImageSpinner } from "./ImageSpinner";
import "./FocalPointCanvas.css";
import "./CropFocalEditor.css";

/** Flip to true to let authors pan a cropped image by dragging it. */
const ALLOW_CROP_PAN = false;

function fitLetterboxCss(transform: TransformSettings): string | undefined {
  if ((transform.operation || "fill") !== "fit") return undefined;
  const mode = transform.extendBackground ?? "auto";
  if (mode === "transparent") return "transparent";
  if (mode === "black") return "#000000";
  if (mode === "white") return "#ffffff";
  if (mode === "custom") {
    const raw = (transform.extendBackgroundColor ?? "").trim();
    if (!raw) return "#808080";
    return raw.startsWith("#") ? raw.slice(0, 9) : `#${raw.slice(0, 8)}`;
  }
  return "#dfe3ea";
}

interface CropFocalEditorProps {
  src: string;
  alt?: string;
  focalPoint: FocalPoint;
  transform: TransformSettings;
  onChange: (point: FocalPoint) => void;
  /** `src` is the finished Fit transform, letterbox included. Fill still loads the full image. */
  fitImage?: boolean;
  /** Right-edge drag sets the aspect ratio. The bottom edge stays fixed. */
  customAspect?: boolean;
  onAspectChange?: (aspectRatio: string) => void;
}

export function CropFocalEditor({
  src,
  alt,
  focalPoint,
  transform,
  onChange,
  fitImage = false,
  customAspect = false,
  onAspectChange,
}: CropFocalEditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const modeRef = useRef<"pan" | "marker" | null>(null);
  const panStart = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });
  const edgeDrag = useRef<{ startX: number; startW: number; canvasWidth: number; canvasHeight: number } | null>(null);
  const onAspectChangeRef = useRef(onAspectChange);
  onAspectChangeRef.current = onAspectChange;
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [maxWidth, setMaxWidth] = useState(520);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [liveConceptual, setLiveConceptual] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const box = fitPreviewBox(transform, maxWidth, 360);
  const canvasHeight = customCanvasHeight(maxWidth);
  const savedRatio =
    ratioNumber(transform.aspect) ?? (natural.w > 0 && natural.h > 0 ? natural.w / natural.h : 1);
  const conceptual = liveConceptual ?? conceptualWidthForRatio(savedRatio, canvasHeight);
  const customFrame = customAspect ? customAspectFrame(conceptual, maxWidth, canvasHeight) : null;
  const frameW = customFrame?.width ?? box.width;
  const frameH = customFrame?.height ?? box.height;
  const toScale = previewIsToScale(box);

  useEffect(() => {
    setNatural({ w: 0, h: 0 });
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    const img = imageRef.current;
    if (!img || !src || !img.complete || img.naturalWidth <= 0) return;
    setLoaded(true);
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, [src]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return undefined;
    const sync = () => setMaxWidth(Math.max(160, shell.clientWidth));
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const operation = transform.operation || "fill";
  const isFit = operation === "fit";
  const layout = frameLayout(
    operation,
    natural.w,
    natural.h,
    frameW,
    frameH,
    transform.width,
    transform.height
  );
  const baseOffset = offsetForOperation(operation, focalPoint, layout, frameW, frameH);
  const offset = dragOffset ?? baseOffset;
  const canPan = ALLOW_CROP_PAN && (layout.canPanX || layout.canPanY);

  const commitOffset = useCallback(
    (next: { x: number; y: number }) => {
      onChange(focalFromOffset(clampOffset(next, layout), layout, frameW, frameH, focalPoint));
    },
    [frameH, frameW, layout, onChange, focalPoint]
  );

  const publishAspect = (next: number, height: number) => {
    const ratio = aspectRatioForConceptual(next, height);
    if (ratio) onAspectChangeRef.current?.(ratio);
  };

  const onEdgeDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const height = customFrame?.canvasHeight ?? canvasHeight;
    const width = customFrame?.canvasWidth ?? maxWidth;
    edgeDrag.current = { startX: event.clientX, startW: conceptual, canvasWidth: width, canvasHeight: height };
    setLiveConceptual(conceptual);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onEdgeMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = edgeDrag.current;
    if (!drag) return;
    const next = clampConceptualWidth(
      drag.startW + (event.clientX - drag.startX),
      drag.canvasWidth,
      drag.canvasHeight
    );
    setLiveConceptual(next);
    publishAspect(next, drag.canvasHeight);
  };

  const onEdgeUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!edgeDrag.current) return;
    edgeDrag.current = null;
    setLiveConceptual(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onEdgeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const height = customFrame?.canvasHeight ?? canvasHeight;
    const width = customFrame?.canvasWidth ?? maxWidth;
    const next = clampConceptualWidth(conceptual + (event.key === "ArrowRight" ? 8 : -8), width, height);
    publishAspect(next, height);
  };

  const onMarkerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    modeRef.current = "marker";
    event.currentTarget.setPointerCapture(event.pointerId);
    const img = imageRef.current;
    if (!img) return;
    onChange(imagePointFromPointer(event.clientX, event.clientY, img.getBoundingClientRect()));
  };

  const onFrameDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isFit || event.button !== 0) return;
    const img = imageRef.current;
    if (!img) return;

    if (!canPan) {
      modeRef.current = "marker";
      event.currentTarget.setPointerCapture(event.pointerId);
      onChange(imagePointFromPointer(event.clientX, event.clientY, img.getBoundingClientRect()));
      return;
    }

    modeRef.current = "pan";
    panStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: baseOffset.x,
      offsetY: baseOffset.y,
    };
    setDragOffset(baseOffset);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!modeRef.current) return;
    const img = imageRef.current;
    if (modeRef.current === "marker") {
      if (!img) return;
      onChange(imagePointFromPointer(event.clientX, event.clientY, img.getBoundingClientRect()));
      return;
    }
    const next = clampOffset(
      {
        x: panStart.current.offsetX + (event.clientX - panStart.current.pointerX),
        y: panStart.current.offsetY + (event.clientY - panStart.current.pointerY),
      },
      layout
    );
    setDragOffset(next);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (modeRef.current === "pan" && dragOffset) {
      commitOffset(dragOffset);
    }
    modeRef.current = null;
    setDragOffset(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const letterbox = fitImage ? undefined : fitLetterboxCss(transform);
  const aspectLabel = customFrame
    ? aspectRatioForConceptual(customFrame.conceptualWidth, customFrame.canvasHeight)
    : undefined;
  const handleInside = Boolean(customFrame && customFrame.width >= customFrame.canvasWidth - 1);

  return (
    <div ref={shellRef} className="crop-editor-shell">
      <div
        className={`crop-editor-canvas${customAspect ? " is-custom" : ""}`}
        style={customFrame ? { height: customFrame.canvasHeight } : undefined}
      >
      <div
        ref={frameRef}
        className={`crop-editor${isFit ? " is-fit" : ""}${canPan ? " is-pannable" : ""}${dragOffset ? " is-panning" : ""}`}
        style={{
          width: frameW,
          height: frameH,
          ...(letterbox ? { background: letterbox } : {}),
        }}
        onPointerDown={onFrameDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {src && !loaded ? <ImageSpinner /> : null}
        <div
          className={`crop-image-layer${loaded ? "" : " is-loading"}`}
          style={
            fitImage
              ? { width: "100%", height: "100%" }
              : {
                  width: layout.dispW,
                  height: layout.dispH,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                }
          }
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt ?? "Bynder image"}
            draggable={false}
            style={fitImage ? { width: "100%", height: "100%", objectFit: "fill" } : undefined}
            onLoad={(event) => {
              setLoaded(true);
              setNatural({
                w: event.currentTarget.naturalWidth,
                h: event.currentTarget.naturalHeight,
              });
            }}
            onError={() => setLoaded(true)}
          />
          {isFit ? null : (
            <div
              className="focal-crosshair is-handle"
              style={{ left: `${focalPoint.x * 100}%`, top: `${focalPoint.y * 100}%` }}
              onPointerDown={onMarkerDown}
              aria-hidden
            />
          )}
        </div>
        {loaded && !customAspect && !toScale ? <div className="crop-scale-note">Not to scale</div> : null}
      </div>
      {customFrame ? (
        <div
          className="crop-aspect-handle"
          style={{ left: handleInside ? frameW - 18 : frameW - 9, height: frameH }}
          role="slider"
          tabIndex={0}
          aria-label="Aspect ratio"
          aria-valuemin={48}
          aria-valuemax={Math.round((customFrame.canvasHeight * customFrame.canvasWidth) / 32)}
          aria-valuenow={Math.round(customFrame.conceptualWidth)}
          aria-valuetext={aspectLabel}
          title="Drag the right edge to set the aspect ratio"
          onPointerDown={onEdgeDown}
          onPointerMove={onEdgeMove}
          onPointerUp={onEdgeUp}
          onPointerCancel={onEdgeUp}
          onKeyDown={onEdgeKey}
        >
          <span />
        </div>
      ) : null}
      </div>
      {customAspect ? <p className="crop-aspect-hint">Drag the right edge to set the aspect ratio.</p> : null}
    </div>
  );
}
