import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { FocalPoint, TransformSettings } from "../lib/types";
import {
  aspectRatioForConceptual,
  clampConceptualWidth,
  conceptualWidthForRatio,
  customAspectFrame,
  customCanvasHeight,
  ratioNumber,
} from "../lib/bynder/customAspect";
import { fitPreviewBox } from "../lib/bynder/composeDatUrl";
import { coverLayout, focalPointFromFramePointer, offsetFromFocal } from "../lib/bynder/coverLayout";
import { ImageSpinner } from "./ImageSpinner";
import "./FocalPointCanvas.css";
import "./CropFocalEditor.css";

interface CropFocalEditorProps {
  src: string;
  alt?: string;
  focalPoint: FocalPoint;
  transform: TransformSettings;
  /** Left-right mirror. The stored focal point stays in the original file's coordinates. */
  mirror?: boolean;
  onChange: (point: FocalPoint) => void;
  /** Right-edge drag sets the aspect ratio. The bottom edge stays fixed. */
  customAspect?: boolean;
  onAspectChange?: (aspectRatio: string) => void;
}

export function CropFocalEditor({
  src,
  alt,
  focalPoint,
  transform,
  mirror = false,
  onChange,
  customAspect = false,
  onAspectChange,
}: CropFocalEditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const placingRef = useRef(false);
  const edgeDrag = useRef<{ startX: number; startW: number; canvasWidth: number; canvasHeight: number } | null>(null);
  const onAspectChangeRef = useRef(onAspectChange);
  onAspectChangeRef.current = onAspectChange;
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [maxWidth, setMaxWidth] = useState(520);
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

  const layout = coverLayout(natural.w, natural.h, frameW, frameH);
  const offset = offsetFromFocal(focalPoint, layout, frameW, frameH);

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

  const placeFocal = (event: PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    onChange(
      focalPointFromFramePointer(
        event.clientX,
        event.clientY,
        frame.getBoundingClientRect(),
        layout,
        frameW,
        frameH,
        offset,
        mirror
      )
    );
  };

  const onMarkerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    placingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    placeFocal(event);
  };

  const onFrameDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    placingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    placeFocal(event);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!placingRef.current) return;
    placeFocal(event);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    placingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

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
        className="crop-editor"
        style={{
          width: frameW,
          height: frameH,
        }}
        onPointerDown={onFrameDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {src && !loaded ? <ImageSpinner /> : null}
        <div className={mirror ? "crop-mirror is-mirrored" : "crop-mirror"}>
        <div
          className={`crop-image-layer${loaded ? "" : " is-loading"}`}
          style={{
            width: layout.dispW,
            height: layout.dispH,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt ?? "Bynder image"}
            draggable={false}
            onLoad={(event) => {
              setLoaded(true);
              setNatural({
                w: event.currentTarget.naturalWidth,
                h: event.currentTarget.naturalHeight,
              });
            }}
            onError={() => setLoaded(true)}
          />
          <div
            className="focal-crosshair is-handle"
            style={{ left: `${focalPoint.x * 100}%`, top: `${focalPoint.y * 100}%` }}
            onPointerDown={onMarkerDown}
            aria-hidden
          />
        </div>
        </div>
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
