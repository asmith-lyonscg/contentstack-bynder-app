import { useEffect, useState } from "react";
import "./LivePreview.css";

interface LivePreviewProps {
  url?: string;
  loading?: boolean;
  warning?: string;
  mode?: "dat" | "css";
  objectPosition?: string;
  frameWidth?: number;
  frameHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  aspectLabel?: string | null;
}

export function LivePreview({
  url,
  loading,
  warning,
  mode = "dat",
  objectPosition = "50% 50%",
  frameWidth,
  frameHeight,
  sourceWidth,
  sourceHeight,
  aspectLabel,
}: LivePreviewProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const emptyMessage =
    mode === "css"
      ? "Crop preview appears here after a Bynder image is selected."
      : "Transformed preview appears here after a Bynder image is selected.";

  const failMessage =
    mode === "css"
      ? "Image failed to load. Check that the Bynder thumbnail URL is publicly reachable."
      : "Transformed image failed to load. Confirm the asset URL is public.";

  const cssFrameStyle =
    mode === "css" && frameWidth && frameHeight
      ? {
          width: frameWidth,
          height: frameHeight,
          ["--object-position" as string]: objectPosition,
        }
      : undefined;

  return (
    <div className="live-preview">
      <div className={`preview-frame${mode === "css" ? " is-css" : ""}`} style={cssFrameStyle}>
        {url && !failed ? (
          <img
            key={`${mode}:${url}:${frameWidth}x${frameHeight}`}
            src={url}
            alt={mode === "css" ? "CSS crop preview" : "Transformed image preview"}
            style={mode === "css" ? { objectPosition } : undefined}
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        ) : (
          <p className="preview-empty">{failed ? failMessage : emptyMessage}</p>
        )}
        {loading && <div className="preview-badge">Updating…</div>}
      </div>
      {warning && <p className="preview-warning">{warning}</p>}
      {url && mode === "dat" && (
        <div className="preview-url">
          <code title={url}>{url}</code>
          <button type="button" onClick={copy}>
            {copied ? "Copied" : "Copy URL"}
          </button>
        </div>
      )}
      {mode === "css" && sourceWidth && sourceHeight && (
        <p className="preview-css-hint">
          Scaled preview of the saved crop box ({sourceWidth} × {sourceHeight}
          {aspectLabel ? ` · ${aspectLabel}` : ""}). Use this size (or aspect-ratio) on the site with{" "}
          <code>object-fit: cover</code> and <code>object-position: {objectPosition}</code>.
        </p>
      )}
    </div>
  );
}
