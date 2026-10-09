import type { DatOperation, ExtendBackgroundMode, TransformSettings } from "../lib/types";
import { InfoTooltip } from "./InfoTooltip";
import "./TransformForm.css";

export interface ProfileOption {
  value: string;
  label: string;
}

interface TransformFormProps {
  value: TransformSettings;
  onChange: (next: TransformSettings) => void;
  datEnabled?: boolean;
  showOperation?: boolean;
  /** Fit / letterbox. Off by default, which leaves Fill as the only transform type. */
  allowFit?: boolean;
  /** Render profiles the author may pick. */
  profiles?: readonly ProfileOption[];
  /** Show the dropdown. A locked field config `"profile"` leaves this false. */
  showProfile?: boolean;
  profile?: string;
  onProfileChange?: (name: string) => void;
}

const OPERATIONS: { value: DatOperation; label: string }[] = [
  { value: "fill", label: "Fill — cover the box" },
  { value: "fit", label: "Fit — whole image in the box" },
];

const EXTEND_BACKGROUNDS: { value: ExtendBackgroundMode; label: string }[] = [
  { value: "auto", label: "Auto (dominant color)" },
  { value: "transparent", label: "Transparent" },
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "custom", label: "Custom color…" },
];

function normalizeHexInput(raw: string): string {
  const hex = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return `#${hex.toLowerCase()}`;
  return raw;
}

/** Mirrors the render conditions below: false when every control is hidden. */
export function transformFormHasFields(props: Omit<TransformFormProps, "onChange" | "onProfileChange">): boolean {
  const { value, datEnabled = true, showOperation = false, allowFit = false, profiles, showProfile = false } = props;
  if (showProfile && (profiles?.length ?? 0) > 0) return true;
  if (datEnabled && showOperation && allowFit) return true;
  return allowFit && value.operation === "fit";
}

export function TransformForm({
  value,
  onChange,
  datEnabled = true,
  showOperation = false,
  allowFit = false,
  profiles,
  showProfile = false,
  profile,
  onProfileChange,
}: TransformFormProps) {
  const operation = allowFit && value.operation === "fit" ? "fit" : "fill";
  const transformTypes = allowFit ? OPERATIONS : OPERATIONS.filter((op) => op.value === "fill");
  const patch = (partial: Partial<TransformSettings>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <div className="transform-form">
      {showProfile && profiles && profiles.length > 0 && onProfileChange && (
        <label className="field">
          <span>
            Render profile
            <InfoTooltip>
              Sets the aspect ratio, widest image, file type, and quality for desktop and mobile. Applies to
              every asset in this field.
            </InfoTooltip>
          </span>
          <select value={profile ?? profiles[0].value} onChange={(event) => onProfileChange(event.target.value)}>
            {profiles.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {datEnabled && showOperation && transformTypes.length > 1 && (
        <label className="field">
          <span>
            Transform type
            <InfoTooltip>
              <strong>Fill</strong> covers the box and trims overflow. The focal point chooses what stays.{" "}
              <strong>Fit</strong> shows the whole image and letterboxes the rest.
            </InfoTooltip>
          </span>
          <select value={operation} onChange={(event) => patch({ operation: event.target.value as DatOperation })}>
            {transformTypes.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {operation === "fit" && (
        <>
          <label className="field">
            <span>
              Letterbox fill
              <InfoTooltip>
                Fit uses Bynder <code>transform:extend</code>. Auto lets Bynder pick the dominant color.
                Transparent uses <code>00000000</code>. Custom accepts a hex color.
              </InfoTooltip>
            </span>
            <select
              value={value.extendBackground ?? "auto"}
              onChange={(event) => {
                const next = event.target.value as ExtendBackgroundMode;
                patch({
                  extendBackground: next === "auto" ? null : next,
                  extendBackgroundColor: next === "custom" ? value.extendBackgroundColor ?? "#808080" : null,
                });
              }}
            >
              {EXTEND_BACKGROUNDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {(value.extendBackground ?? "auto") === "custom" && (
            <label className="field field-color">
              <span>Custom color</span>
              <span className="field-color-inputs">
                <input
                  type="color"
                  aria-label="Pick letterbox color"
                  value={
                    /^#[0-9a-fA-F]{6}/.test(value.extendBackgroundColor ?? "")
                      ? (value.extendBackgroundColor as string).slice(0, 7)
                      : "#808080"
                  }
                  onChange={(event) => patch({ extendBackgroundColor: event.target.value })}
                />
                <input
                  type="text"
                  spellCheck={false}
                  placeholder="#808080"
                  value={value.extendBackgroundColor ?? ""}
                  onChange={(event) => patch({ extendBackgroundColor: normalizeHexInput(event.target.value) })}
                />
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
