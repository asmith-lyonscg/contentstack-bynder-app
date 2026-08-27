import type { ChangeEvent } from "react";
import { ASPECT_PRESETS, type DatFormat, type DatOperation, type TransformSettings } from "../lib/types";
import { parseAspect, lockToAspect, resolveDimensions } from "../lib/bynder/composeDatUrl";
import { InfoTooltip } from "./InfoTooltip";
import "./TransformForm.css";

interface TransformFormProps {
  value: TransformSettings;
  onChange: (next: TransformSettings) => void;
  datEnabled?: boolean;
  aspectPresets?: readonly string[];
  locks?: {
    aspect?: boolean;
    width?: boolean;
    height?: boolean;
  };
}

const OPERATIONS: { value: DatOperation; label: string }[] = [
  { value: "fill", label: "Fill (crop to box)" },
  { value: "fit", label: "Fit (no crop)" },
  { value: "crop", label: "Crop" },
];

const FORMATS: { value: DatFormat; label: string }[] = [
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
  { value: "jpg", label: "JPEG" },
  { value: "png", label: "PNG" },
];

function toInt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function TransformForm({
  value,
  onChange,
  datEnabled = true,
  aspectPresets = ASPECT_PRESETS,
  locks,
}: TransformFormProps) {
  const presets = aspectPresets.length ? aspectPresets : ASPECT_PRESETS;
  const aspectIsPreset = Boolean(value.aspect && presets.includes(value.aspect));
  const aspectMode = value.aspect ? (aspectIsPreset ? value.aspect : "custom") : "";

  const aspectLocked = Boolean(locks?.aspect);
  const widthLocked = Boolean(locks?.width || (locks?.aspect && locks?.height));
  const heightLocked = Boolean(locks?.height || (locks?.aspect && locks?.width));

  const patch = (partial: Partial<TransformSettings>) => {
    onChange({ ...value, ...partial });
  };

  const applyAspect = (aspect: string | null, source: TransformSettings = value) => {
    onChange(lockToAspect(source, aspect));
  };

  const onWidth = (event: ChangeEvent<HTMLInputElement>) => {
    const width = toInt(event.target.value);
    const next = { ...value, width };
    if (parseAspect(value.aspect) && width) {
      const dims = resolveDimensions({ ...next, height: null });
      onChange({ ...next, height: dims.height ?? next.height });
      return;
    }
    onChange(next);
  };

  const onHeight = (event: ChangeEvent<HTMLInputElement>) => {
    const height = toInt(event.target.value);
    const next = { ...value, height };
    if (parseAspect(value.aspect) && height) {
      const dims = resolveDimensions({ ...next, width: null });
      onChange({ ...next, width: dims.width ?? next.width });
      return;
    }
    onChange(next);
  };

  return (
    <div className="transform-form">
      {datEnabled && (
        <label className="field">
          <span>Operation</span>
          <select
            value={value.operation}
            onChange={(event) => patch({ operation: event.target.value as DatOperation })}
          >
            {OPERATIONS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Aspect{aspectLocked ? " (locked)" : ""}</span>
        <select
          value={aspectMode}
          disabled={aspectLocked}
          onChange={(event) => {
            const selected = event.target.value;
            if (!selected) {
              patch({ aspect: null });
              return;
            }
            if (selected === "custom") {
              patch({ aspect: value.aspect && !aspectIsPreset ? value.aspect : "16:9" });
              return;
            }
            applyAspect(selected);
          }}
        >
          <option value="">None</option>
          {presets.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>

      {aspectMode === "custom" && (
        <label className="field">
          <span>Custom</span>
          <input
            type="text"
            placeholder="16:9"
            value={value.aspect ?? ""}
            disabled={aspectLocked}
            onChange={(event) => applyAspect(event.target.value || null)}
          />
        </label>
      )}

      <label className="field">
        <span>Width{widthLocked ? " (locked)" : ""}</span>
        <input type="number" min={1} value={value.width ?? ""} disabled={widthLocked} onChange={onWidth} />
      </label>

      <label className="field">
        <span>Height{heightLocked ? " (locked)" : ""}</span>
        <input type="number" min={1} value={value.height ?? ""} disabled={heightLocked} onChange={onHeight} />
      </label>

      {datEnabled && (
        <>
          <label className="field">
            <span>Format</span>
            <select
              value={value.format ?? "webp"}
              onChange={(event) => patch({ format: event.target.value as DatFormat })}
            >
              {FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Quality {value.quality ?? 80}</span>
            <input
              type="range"
              min={1}
              max={100}
              value={value.quality ?? 80}
              disabled={value.format === "png"}
              onChange={(event) => patch({ quality: Number(event.target.value) })}
            />
          </label>

          <div className="advanced">
            <span className="advanced-label">
              Advanced query
              <InfoTooltip>
                Extra Bynder DAT fragments, e.g. <code>io=filter:grayscale</code>
              </InfoTooltip>
            </span>
            <textarea
              rows={2}
              value={value.extraQuery ?? ""}
              onChange={(event) => patch({ extraQuery: event.target.value })}
              placeholder="io=filter:grayscale"
            />
          </div>
        </>
      )}
    </div>
  );
}
