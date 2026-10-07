import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { FocalPoint, TransformSettings } from "../lib/types";
import { fitPreviewBox, previewIsToScale } from "../lib/bynder/composeDatUrl";
import {
  clampOffset,
  clampZoom,
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

interface CropFocalEditorProps {
  src: string;
  alt?: string;
  focalPoint: FocalPoint;
  transform: TransformSettings;
  onChange: (point: FocalPoint) => void;
}

export function CropFocalEditor({ src, alt, focalPoint, transform, onChange }: CropFocalEditorProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const modeRef = useRef<"pan" | "marker" | null>(null);
  const panStart = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [maxWidth, setMaxWidth] = useState(520);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const box = fitPreviewBox(transform, maxWidth, 360);
  const toScale = previewIsToScale(box);
  const zoom = clampZoom(transform.zoom);

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
  const layout = frameLayout(
    operation,
    natural.w,
    natural.h,
    box.width,
    box.height,
    transform.width,
    transform.height,
    zoom
  );
  const baseOffset = offsetForOperation(operation, focalPoint, layout, box.width, box.height);
  const offset = dragOffset ?? baseOffset;
  const canPan = ALLOW_CROP_PAN && (layout.canPanX || layout.canPanY);

  const commitOffset = useCallback(
    (next: { x: number; y: number }) => {
      onChange(focalFromOffset(clampOffset(next, layout), layout, box.width, box.height, focalPoint));
    },
    [box.height, box.width, layout, onChange, focalPoint]
  );

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
    if (event.button !== 0) return;
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

  return (
    <div ref={shellRef} className="crop-editor-shell">
      <div
        ref={frameRef}
        className={`crop-editor${canPan ? " is-pannable" : ""}${dragOffset ? " is-panning" : ""}`}
        style={{ width: box.width, height: box.height }}
        onPointerDown={onFrameDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {src && !loaded ? <ImageSpinner /> : null}
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
        {!toScale && <div className="crop-scale-note">Not to scale</div>}
      </div>
    </div>
  );
}
