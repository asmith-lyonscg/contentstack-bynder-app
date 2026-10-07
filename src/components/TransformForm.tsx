import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DatPresetSettings } from "../lib/types";
import { ASPECT_PRESETS, DAT_FILE_TYPES, type DatFormat, type DatOperation, type TransformSettings } from "../lib/types";
import { parseAspect, lockToAspect } from "../lib/bynder/composeDatUrl";
import { clampZoom } from "../lib/bynder/coverLayout";
import { applyProportionPin, type ProportionPin } from "../lib/proportionPin";
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
  showWidth?: boolean;
  showHeight?: boolean;
  /**
   * When true (≥2 of width/height/aspect locked), options are Fill / Fit / Scale.
   * When false, options are Fill / Fit / Crop — no zoom slider.
   */
  scaleMode?: boolean;
  showQuality?: boolean;
  showAdvancedQuery?: boolean;
  showDatPreset?: boolean;
  datPresets?: DatPresetSettings;
  /** Changes when the edited asset or viewport changes, which clears the ratio link. */
  ratioScope?: string;
}

const FILL_FIT: { value: DatOperation; label: string }[] = [
  { value: "fill", label: "Fill — cover the box" },
  { value: "fit", label: "Fit — whole image in the box" },
];

const SCALE_OPERATIONS: { value: DatOperation; label: string }[] = [
  ...FILL_FIT,
  { value: "scale", label: "Scale — zoom into the box" },
];

const CROP_OPERATIONS: { value: DatOperation; label: string }[] = [
  ...FILL_FIT,
  { value: "crop", label: "Crop — portion of the image" },
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
  id,
  value,
  disabled,
  onCommit,
  appliedTick = 0,
}: {
  id?: string;
  value: number | null | undefined;
  disabled?: boolean;
  onCommit: (next: number | null) => void;
  /** Bumps when another field writes this value, so the check shows here too. */
  appliedTick?: number;
}) {
  const committed = formatDim(value);
  const [draft, setDraft] = useState(committed);
  const [status, setStatus] = useState<"idle" | "dirty" | "applied" | "fading">("idle");
  const skipReset = useRef(false);
  const seenAppliedTick = useRef(appliedTick);

  useEffect(() => {
    setDraft(committed);
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
    if (seenAppliedTick.current !== appliedTick) return;
    setStatus((current) => (current === "applied" || current === "fading" ? current : "idle"));
  }, [committed, appliedTick]);

  useEffect(() => {
    if (seenAppliedTick.current === appliedTick) return;
    seenAppliedTick.current = appliedTick;
    setDraft(committed);
    setStatus("applied");
  }, [appliedTick, committed]);

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
        id={id}
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

function PadlockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      {locked ? (
        <path d="M5 7.2V5.1a3 3 0 0 1 6 0v2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M5.2 7.2V5.1a3 3 0 0 1 5.1-2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
      <rect x="3.2" y="7.1" width="9.6" height="6.4" rx="1.2" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M6.6 5.1H4.7a2.4 2.4 0 0 0 0 4.8h1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M9.4 10.9h1.9a2.4 2.4 0 0 0 0-4.8H9.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M6.3 8h3.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FieldLock({
  kind,
  locked,
  label,
  onLock,
}: {
  kind: "radio" | "static";
  locked?: boolean;
  label: string;
  onLock?: () => void;
}) {
  if (kind === "static") {
    return (
      <span className="field-lock is-locked is-static" title={`${label} is locked`}>
        <PadlockIcon locked />
      </span>
    );
  }
  return (
    <button
      type="button"
      className={locked ? "field-lock is-locked" : "field-lock"}
      aria-pressed={locked}
      aria-label={locked ? `${label} is locked` : `Lock ${label}`}
      title={locked ? `${label} stays fixed when another field changes` : `Lock ${label}`}
      onClick={() => {
        if (!locked) onLock?.();
      }}
    >
      <PadlockIcon locked={Boolean(locked)} />
    </button>
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

function AppliedMark({ status }: { status: "off" | "on" | "fading" }) {
  if (status === "off") return null;
  return (
    <span className="field-commit-status">
      <span className={status === "fading" ? "field-commit-check is-fading" : "field-commit-check"} aria-label="Applied">
        <CheckIcon />
      </span>
    </span>
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
  showWidth = true,
  showHeight = true,
  scaleMode = false,
  showQuality = false,
  showAdvancedQuery = false,
  showDatPreset = false,
  datPresets,
  ratioScope,
}: TransformFormProps) {
  const zoom = clampZoom(value.zoom);
  const operations = scaleMode ? SCALE_OPERATIONS : CROP_OPERATIONS;
  const showZoom = scaleMode && value.operation === "scale";
  const presets = aspectPresets.length ? aspectPresets : ASPECT_PRESETS;
  const aspectIsPreset = Boolean(value.aspect && presets.includes(value.aspect));
  const [customAspect, setCustomAspect] = useState(false);
  const usingCustom = customAspect || Boolean(value.aspect && !aspectIsPreset);
  const aspectMode = usingCustom ? "custom" : (value.aspect ?? "");

  const aspectLocked = Boolean(locks?.aspect);
  const widthConfigLocked = Boolean(locks?.width);
  const heightConfigLocked = Boolean(locks?.height);
  const widthLocked = widthConfigLocked || (aspectLocked && heightConfigLocked);
  const heightLocked = heightConfigLocked || (aspectLocked && widthConfigLocked);
  const showConstrain = showWidth && showHeight && !showAspect && !widthLocked && !heightLocked;
  const showPinLocks = showAspect && showWidth && showHeight && !aspectLocked && !widthLocked && !heightLocked;
  const [constrained, setConstrained] = useState(false);
  const [pin, setPin] = useState<ProportionPin>("aspect");
  const [linkedEcho, setLinkedEcho] = useState({ width: 0, height: 0 });
  const [aspectMark, setAspectMark] = useState<"off" | "on" | "fading">("off");

  useEffect(() => {
    setConstrained(false);
    setPin("aspect");
    setAspectMark("off");
  }, [ratioScope]);

  useEffect(() => {
    if (!showConstrain) setConstrained(false);
  }, [showConstrain]);

  useEffect(() => {
    if (!showPinLocks) setPin("aspect");
  }, [showPinLocks]);

  useEffect(() => {
    if (aspectMark !== "on") return undefined;
    const fade = window.setTimeout(() => setAspectMark("fading"), 1000);
    return () => window.clearTimeout(fade);
  }, [aspectMark]);

  useEffect(() => {
    if (aspectMark !== "fading") return undefined;
    const done = window.setTimeout(() => setAspectMark("off"), 400);
    return () => window.clearTimeout(done);
  }, [aspectMark]);
  const formatLocked = Boolean(locks?.format);
  const formatOptions =
    value.format && !FORMATS.some((item) => item.value === value.format)
      ? [...FORMATS, { value: value.format, label: value.format.toUpperCase() }]
      : FORMATS;

  const patch = (partial: Partial<TransformSettings>) => {
    onChange({ ...value, ...partial });
  };

  const echoLinked = (next: TransformSettings, edited: "aspect" | "width" | "height") => {
    setLinkedEcho((current) => ({
      width: edited !== "width" && next.width !== value.width ? current.width + 1 : current.width,
      height: edited !== "height" && next.height !== value.height ? current.height + 1 : current.height,
    }));
    if (edited !== "aspect" && (next.aspect ?? "") !== (value.aspect ?? "")) {
      setAspectMark("on");
      if (next.aspect && presets.includes(next.aspect)) setCustomAspect(false);
    }
  };

  const respectConfigLocks = (next: TransformSettings): TransformSettings => ({
    ...next,
    aspect: aspectLocked ? value.aspect : next.aspect,
    width: widthConfigLocked ? value.width : next.width,
    height: heightConfigLocked ? value.height : next.height,
  });

  const configPin = (): ProportionPin | null => {
    const pins = [
      aspectLocked ? "aspect" : null,
      widthConfigLocked ? "width" : null,
      heightConfigLocked ? "height" : null,
    ].filter((item): item is ProportionPin => item !== null);
    return pins.length === 1 ? pins[0] : null;
  };

  const publishPinned = (edited: { aspect?: string | null; width?: number | null; height?: number | null }, which: "aspect" | "width" | "height", activePin: ProportionPin) => {
    const next = respectConfigLocks(applyProportionPin(value, activePin, edited));
    onChange(next);
    echoLinked(next, which);
  };

  const coupleToAspect = Boolean(
    showAspect && !showPinLocks && !configPin() && parseAspect(value.aspect) && !widthConfigLocked && !heightConfigLocked
  );

  const commitAspect = (aspect: string | null) => {
    if (showPinLocks) {
      publishPinned({ aspect }, "aspect", pin);
      return;
    }
    const lockedPin = showAspect ? configPin() : null;
    if (lockedPin) {
      publishPinned({ aspect }, "aspect", lockedPin);
      return;
    }
    if (aspect && parseAspect(aspect) && !widthConfigLocked && !heightConfigLocked) {
      const next = respectConfigLocks(lockToAspect({ ...value, aspect }, aspect));
      onChange(next);
      echoLinked(next, "aspect");
      return;
    }
    onChange(respectConfigLocks({ ...value, aspect }));
  };

  const commitWidth = (width: number | null) => {
    if (showPinLocks) {
      publishPinned({ width }, "width", pin);
      return;
    }
    const lockedPin = showAspect ? configPin() : null;
    if (lockedPin) {
      publishPinned({ width }, "width", lockedPin);
      return;
    }
    if (constrained && width && value.width && value.height) {
      const next = { ...value, width, height: Math.max(1, Math.round((width * value.height) / value.width)) };
      onChange(next);
      echoLinked(next, "width");
      return;
    }
    if (coupleToAspect && width) {
      const next = respectConfigLocks(lockToAspect({ ...value, width }, value.aspect ?? null));
      onChange(next);
      echoLinked(next, "width");
      return;
    }
    onChange({ ...value, width });
  };

  const commitHeight = (height: number | null) => {
    if (showPinLocks) {
      publishPinned({ height }, "height", pin);
      return;
    }
    const lockedPin = showAspect ? configPin() : null;
    if (lockedPin) {
      publishPinned({ height }, "height", lockedPin);
      return;
    }
    if (constrained && height && value.width && value.height) {
      const next = { ...value, height, width: Math.max(1, Math.round((height * value.width) / value.height)) };
      onChange(next);
      echoLinked(next, "height");
      return;
    }
    if (coupleToAspect && height) {
      const parsed = parseAspect(value.aspect);
      const next = respectConfigLocks({
        ...value,
        height,
        width: parsed ? Math.max(1, Math.round((height * parsed.w) / parsed.h)) : value.width,
      });
      onChange(next);
      echoLinked(next, "height");
      return;
    }
    onChange({ ...value, height });
  };

  const lockKind = (configLocked: boolean): "radio" | "static" | null => {
    if (showPinLocks) return "radio";
    if (configLocked) return "static";
    return null;
  };

  return (
    <div className="transform-form">
      {datEnabled && showOperation && (
        <label className="field">
          <span>
            Transform type
            <InfoTooltip>
              <strong>Fill</strong>, <strong>Fit</strong>, and{" "}
              {scaleMode ? <strong>Scale</strong> : <strong>Crop</strong>} are mutually exclusive. Fill covers
              the box and trims overflow. Fit shows the whole image (letterbox).{" "}
              {scaleMode ? (
                <>
                  Scale covers the box like Fill, then the Zoom slider pulls in closer. Use the focal point to
                  choose what stays.
                </>
              ) : (
                <>
                  Crop cuts a Width×Height portion out of the original file. Change width/height/aspect to
                  choose how large that portion is.
                </>
              )}
            </InfoTooltip>
          </span>
          <select
            value={value.operation}
            onChange={(event) => patch({ operation: event.target.value as DatOperation })}
          >
            {operations.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {showZoom && (
        <label className="field field-range">
          <span>
            Zoom {Math.round(zoom * 100)}%
            <InfoTooltip>
              Pull in closer on the fixed crop box. Move the focal point after zooming to choose what stays in
              view.
            </InfoTooltip>
          </span>
          <input
            type="range"
            min={100}
            max={300}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(event) => {
              const next = clampZoom(Number(event.target.value) / 100);
              patch({ zoom: next === 1 ? null : next });
            }}
          />
        </label>
      )}

      {showAspect && (
        <div className="field">
          <label htmlFor="crop-aspect">Aspect{aspectLocked ? " (locked)" : ""}</label>
          <span className="field-commit is-select">
            <select
              id="crop-aspect"
              value={aspectMode}
              disabled={aspectLocked}
              onChange={(event) => {
                const selected = event.target.value;
                if (!selected) {
                  setCustomAspect(false);
                  commitAspect(null);
                  return;
                }
                if (selected === "custom") {
                  setCustomAspect(true);
                  return;
                }
                setCustomAspect(false);
                commitAspect(selected);
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
            {usingCustom ? null : <AppliedMark status={aspectMark} />}
          </span>
          {lockKind(aspectLocked) ? (
            <FieldLock
              kind={lockKind(aspectLocked) ?? "static"}
              locked={showPinLocks ? pin === "aspect" : true}
              label="Aspect"
              onLock={() => setPin("aspect")}
            />
          ) : null}
        </div>
      )}

      {showAspect && usingCustom && (
        <label className="field">
          <span>Custom ratio</span>
          <span className="field-commit">
            <input
              type="text"
              placeholder="21:9"
              value={value.aspect ?? ""}
              disabled={aspectLocked}
              autoFocus
              onChange={(event) => {
                const next = event.target.value.trim() ? event.target.value : null;
                commitAspect(next);
              }}
            />
            <AppliedMark status={aspectMark} />
          </span>
        </label>
      )}

      {(showWidth || showHeight) && (
        <div className={constrained ? "dimension-fields is-constrained" : "dimension-fields"}>
          {showWidth && (
            <div className="field">
              <label htmlFor="crop-width">Layout Width (CSS Pixels){widthLocked ? " (locked)" : ""}</label>
              <CommitNumberInput
                id="crop-width"
                value={value.width}
                disabled={widthLocked}
                appliedTick={linkedEcho.width}
                onCommit={commitWidth}
              />
              {lockKind(widthLocked) ? (
                <FieldLock
                  kind={lockKind(widthLocked) ?? "static"}
                  locked={showPinLocks ? pin === "width" : true}
                  label="Width"
                  onLock={() => setPin("width")}
                />
              ) : null}
            </div>
          )}
          {constrained ? (
            <span className="proportion-link" aria-hidden>
              <ChainIcon />
            </span>
          ) : null}
          {showHeight && (
            <div className="field">
              <label htmlFor="crop-height">Layout Height (CSS Pixels){heightLocked ? " (locked)" : ""}</label>
              <CommitNumberInput
                id="crop-height"
                value={value.height}
                disabled={heightLocked}
                appliedTick={linkedEcho.height}
                onCommit={commitHeight}
              />
              {lockKind(heightLocked) ? (
                <FieldLock
                  kind={lockKind(heightLocked) ?? "static"}
                  locked={showPinLocks ? pin === "height" : true}
                  label="Height"
                  onLock={() => setPin("height")}
                />
              ) : null}
            </div>
          )}
        </div>
      )}

      {showConstrain && (
        <label className="constrain-toggle">
          <span />
          <span className="constrain-toggle-control">
            <input
              type="checkbox"
              checked={constrained}
              onChange={(event) => setConstrained(event.target.checked)}
            />
            <span>Constrain Proportions</span>
          </span>
        </label>
      )}

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
