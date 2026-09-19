import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DatPresetSettings } from "../lib/types";
import { ASPECT_PRESETS, DAT_FILE_TYPES, type DatFormat, type DatOperation, type TransformSettings } from "../lib/types";
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
    format?: boolean;
  };
  hideFormat?: boolean;
  showOperation?: boolean;
  showAspect?: boolean;
  showQuality?: boolean;
  showAdvancedQuery?: boolean;
  showDatPreset?: boolean;
  datPresets?: DatPresetSettings;
}

const OPERATIONS: { value: DatOperation; label: string }[] = [
  { value: "fill", label: "Fill (crop to box)" },
  { value: "fit", label: "Fit (no crop)" },
  { value: "crop", label: "Crop" },
];

const FORMATS = DAT_FILE_TYPES;

function toInt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function formatDim(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function isTypedNumberInput(event: { nativeEvent: Event }): boolean {
  const inputType = (event.nativeEvent as InputEvent).inputType;
  return (
    inputType === "insertText" ||
    inputType === "insertCompositionText" ||
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward" ||
    inputType === "deleteContent" ||
    inputType === "deleteByCut"
  );
}

function CommitNumberInput({
  value,
  disabled,
  onCommit,
}: {
  value: number | null | undefined;
  disabled?: boolean;
  onCommit: (next: number | null) => void;
}) {
  const committed = formatDim(value);
  const [draft, setDraft] = useState(committed);
  const [status, setStatus] = useState<"idle" | "dirty" | "applied" | "fading">("idle");
  const skipReset = useRef(false);

  useEffect(() => {
    setDraft(committed);
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
    setStatus((current) => (current === "applied" || current === "fading" ? current : "idle"));
  }, [committed]);

  useEffect(() => {
    if (status !== "applied") return undefined;
    const fade = window.setTimeout(() => setStatus("fading"), 1000);
    return () => window.clearTimeout(fade);
  }, [status]);

  useEffect(() => {
    if (status !== "fading") return undefined;
    const done = window.setTimeout(() => setStatus("idle"), 400);
    return () => window.clearTimeout(done);
  }, [status]);

  const dirty = draft !== committed;

  const commit = (raw: string = draft) => {
    if (disabled) return;
    const parsed = toInt(raw);
    const nextDraft = formatDim(parsed);
    setDraft(nextDraft);
    if (parsed === (value ?? null) || (parsed == null && (value == null || value === undefined))) {
      setStatus("idle");
      return;
    }
    skipReset.current = true;
    onCommit(parsed);
    setStatus("applied");
  };

  return (
    <span className="field-commit">
      <input
        type="number"
        min={1}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (isTypedNumberInput(event)) {
            setStatus("dirty");
            return;
          }
          commit(next);
        }}
        onBlur={() => commit()}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      <span className="field-commit-status" aria-live="polite">
        {!dirty && (status === "applied" || status === "fading") ? (
          <span className={status === "fading" ? "field-commit-check is-fading" : "field-commit-check"} aria-label="Applied">
            <CheckIcon />
          </span>
        ) : null}
      </span>
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M3.2 8.4 6.3 11.4 12.8 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TransformForm({
  value,
  onChange,
  datEnabled = true,
  aspectPresets = ASPECT_PRESETS,
  locks,
  hideFormat = true,
  showOperation = false,
  showAspect = false,
  showQuality = false,
  showAdvancedQuery = false,
  showDatPreset = false,
  datPresets,
}: TransformFormProps) {
  const presets = aspectPresets.length ? aspectPresets : ASPECT_PRESETS;
  const aspectIsPreset = Boolean(value.aspect && presets.includes(value.aspect));
  const [customAspect, setCustomAspect] = useState(false);
  const usingCustom = customAspect || Boolean(value.aspect && !aspectIsPreset);
  const aspectMode = usingCustom ? "custom" : (value.aspect ?? "");

  const aspectLocked = Boolean(locks?.aspect);
  const coupleToAspect = Boolean(parseAspect(value.aspect) && (aspectLocked || showAspect));
  const widthLocked = Boolean(locks?.width || (aspectLocked && locks?.height));
  const heightLocked = Boolean(locks?.height || (aspectLocked && locks?.width));
  const formatLocked = Boolean(locks?.format);
  const formatOptions =
    value.format && !FORMATS.some((item) => item.value === value.format)
      ? [...FORMATS, { value: value.format, label: value.format.toUpperCase() }]
      : FORMATS;

  const patch = (partial: Partial<TransformSettings>) => {
    onChange({ ...value, ...partial });
  };

  const applyAspect = (aspect: string | null, source: TransformSettings = value) => {
    onChange(lockToAspect(source, aspect));
  };

  const commitWidth = (width: number | null) => {
    const next = { ...value, width };
    if (coupleToAspect && width) {
      const dims = resolveDimensions({ ...next, height: null });
      onChange({ ...next, height: dims.height ?? next.height });
      return;
    }
    onChange(next);
  };

  const commitHeight = (height: number | null) => {
    const next = { ...value, height };
    if (coupleToAspect && height) {
      const dims = resolveDimensions({ ...next, width: null });
      onChange({ ...next, width: dims.width ?? next.width });
      return;
    }
    onChange(next);
  };

  return (
    <div className="transform-form">
      {datEnabled && showOperation && (
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

      {showAspect && (
        <label className="field">
          <span>Aspect{aspectLocked ? " (locked)" : ""}</span>
        <select
          value={aspectMode}
          disabled={aspectLocked}
          onChange={(event) => {
            const selected = event.target.value;
            if (!selected) {
              setCustomAspect(false);
              patch({ aspect: null });
              return;
            }
            if (selected === "custom") {
              setCustomAspect(true);
              return;
            }
            setCustomAspect(false);
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
      )}

      {showAspect && usingCustom && (
        <label className="field">
          <span>Custom ratio</span>
          <input
            type="text"
            placeholder="21:9"
            value={value.aspect ?? ""}
            disabled={aspectLocked}
            autoFocus
            onChange={(event) => {
              const next = event.target.value.trim() ? event.target.value : null;
              if (next && parseAspect(next)) {
                applyAspect(next);
                return;
              }
              patch({ aspect: next });
            }}
          />
        </label>
      )}

      <label className="field">
        <span>Width{widthLocked ? " (locked)" : ""}</span>
        <CommitNumberInput value={value.width} disabled={widthLocked} onCommit={commitWidth} />
      </label>

      <label className="field">
        <span>Height{heightLocked ? " (locked)" : ""}</span>
        <CommitNumberInput value={value.height} disabled={heightLocked} onCommit={commitHeight} />
      </label>

      {datEnabled && !hideFormat && (
        <label className="field">
          <span>File type{formatLocked ? " (locked)" : ""}</span>
          <select
            value={value.format ?? "webp"}
            disabled={formatLocked}
            onChange={(event) => patch({ format: event.target.value as DatFormat })}
          >
            {formatOptions.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {datEnabled && showQuality && (
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
      )}

      {datEnabled &&
        showDatPreset &&
        datPresets &&
        Object.keys(datPresets.transformationOptions).length > 0 && (
          <label className="field">
            <span>DAT preset</span>
            <select
              value={
                Object.entries(datPresets.transformationOptions).find(
                  ([, query]) => query === (value.extraQuery ?? "")
                )?.[0] ?? ""
              }
              onChange={(event) => {
                const key = event.target.value;
                patch({ extraQuery: key ? datPresets.transformationOptions[key] ?? "" : "" });
              }}
            >
              <option value="">None</option>
              {Object.keys(datPresets.transformationOptions).map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        )}

      {datEnabled && showAdvancedQuery && (
        <div className="advanced">
          <span className="advanced-label">
            Advanced query
            <InfoTooltip>
              Optional extra DAT URL fragments when a named preset is not enough, for example{" "}
              <code>io=filter:grayscale</code>.
            </InfoTooltip>
          </span>
          <textarea
            rows={2}
            value={value.extraQuery ?? ""}
            onChange={(event) => patch({ extraQuery: event.target.value })}
            placeholder="io=filter:grayscale"
          />
        </div>
      )}
    </div>
  );
}
