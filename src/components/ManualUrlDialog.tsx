import { useEffect, useId, useState } from "react";
import { InfoTooltip } from "./InfoTooltip";
import {
  classifyVideoInput,
  inferManualAssetType,
  parseManualUrl,
  parseVideoInput,
  type ManualAssetType,
} from "../lib/manualUrl";
import "./ManualUrlDialog.css";

export type ManualUrlDialogMode = "add" | "replace-desktop" | "mobile";

export interface ManualUrlDialogResult {
  url: string;
  type: ManualAssetType;
}

interface ManualUrlDialogProps {
  open: boolean;
  mode: ManualUrlDialogMode;
  /** Lock the type when replacing or assigning mobile for an existing asset. */
  lockedType?: ManualAssetType;
  initialUrl?: string;
  onCancel: () => void;
  onConfirm: (result: ManualUrlDialogResult) => void;
}

const TYPE_LABELS: Record<ManualAssetType, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  DOCUMENT: "Document",
};

const LIMITATIONS =
  "Paste a direct http(s) file URL for images and documents. Videos must be a YouTube or Vimeo link or embed code, or a Bynder file on assets.deltafaucet.com (saved like a Compact View pick). Linked URL images/documents have no Bynder crop, focal point, or render profiles. Videos do not store alt text; YouTube and Vimeo also omit presentation and playback settings.";

export function ManualUrlDialog({
  open,
  mode,
  lockedType,
  initialUrl = "",
  onCancel,
  onConfirm,
}: ManualUrlDialogProps) {
  const titleId = useId();
  const urlId = useId();
  const typeId = useId();
  const [url, setUrl] = useState(initialUrl);
  const [type, setType] = useState<ManualAssetType>(lockedType ?? "IMAGE");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setType(lockedType ?? (initialUrl ? inferManualAssetType(initialUrl) : "IMAGE"));
    setError(undefined);
  }, [open, initialUrl, lockedType]);

  if (!open) return null;

  const title =
    mode === "mobile"
      ? "Mobile file URL"
      : mode === "replace-desktop"
        ? "Change file URL"
        : "Add by URL";

  const effectiveType = lockedType ?? type;

  const submit = () => {
    const nextType = effectiveType;
    if (nextType === "VIDEO") {
      const classified = classifyVideoInput(url);
      if (classified.kind === "reject") {
        setError(classified.reason);
        return;
      }
      onConfirm({ url: classified.url, type: "VIDEO" });
      return;
    }

    const parsed = parseManualUrl(url);
    if (!parsed) {
      setError("Enter a full http or https URL.");
      return;
    }
    onConfirm({ url: parsed, type: nextType });
  };

  const onInputChange = (next: string) => {
    setUrl(next);
    setError(undefined);
    if (lockedType) return;
    const embed = parseVideoInput(next);
    if (embed) {
      setType("VIDEO");
      return;
    }
    const parsed = parseManualUrl(next.trim());
    if (parsed) setType(inferManualAssetType(parsed));
  };

  return (
    <div className="manual-url-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="manual-url-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="manual-url-header">
          <h2 id={titleId}>{title}</h2>
          <InfoTooltip>{LIMITATIONS}</InfoTooltip>
        </header>
        <p className="manual-url-lead">
          {effectiveType === "VIDEO"
            ? "Paste a YouTube or Vimeo link or embed code, or a Bynder video URL from assets.deltafaucet.com."
            : "Link a file that is not in Bynder. Direct file URLs only — no crop, focal point, or profiles."}
        </p>
        <label className="manual-url-field" htmlFor={urlId}>
          {effectiveType === "VIDEO" ? "Video link or embed" : "File URL"}
          <textarea
            id={urlId}
            rows={effectiveType === "VIDEO" ? 3 : 2}
            value={url}
            autoFocus
            placeholder={
              effectiveType === "VIDEO"
                ? "https://www.youtube.com/watch?v=… or iframe embed, or assets.deltafaucet.com/asset/…"
                : "https://cdn.example.com/path/file.jpg"
            }
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && effectiveType !== "VIDEO") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
        {lockedType ? (
          <p className="manual-url-type-locked">Type: {TYPE_LABELS[lockedType]}</p>
        ) : (
          <label className="manual-url-field" htmlFor={typeId}>
            Type
            <select
              id={typeId}
              value={type}
              onChange={(event) => setType(event.target.value as ManualAssetType)}
            >
              <option value="IMAGE">{TYPE_LABELS.IMAGE}</option>
              <option value="VIDEO">{TYPE_LABELS.VIDEO}</option>
              <option value="DOCUMENT">{TYPE_LABELS.DOCUMENT}</option>
            </select>
          </label>
        )}
        {error ? <p className="manual-url-error">{error}</p> : null}
        <div className="manual-url-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="is-primary" onClick={submit}>
            {mode === "add" ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const MANUAL_URL_LIMITATIONS = LIMITATIONS;
