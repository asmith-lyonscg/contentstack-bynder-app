import type { TransformSettings } from "../lib/types";
import { InfoTooltip } from "./InfoTooltip";
import "./TransformForm.css";

export interface ProfileOption {
  value: string;
  label: string;
}

interface TransformFormProps {
  value: TransformSettings;
  onChange: (next: TransformSettings) => void;
  /** Render profiles the author may pick. */
  profiles?: readonly ProfileOption[];
  /** Show the dropdown. A locked field config `"profile"` leaves this false. */
  showProfile?: boolean;
  profile?: string;
  onProfileChange?: (name: string) => void;
}

/** True when the profile dropdown is shown. */
export function transformFormHasFields(props: Omit<TransformFormProps, "onChange" | "onProfileChange">): boolean {
  const { profiles, showProfile = false } = props;
  return Boolean(showProfile && (profiles?.length ?? 0) > 0);
}

export function TransformForm({
  profiles,
  showProfile = false,
  profile,
  onProfileChange,
}: TransformFormProps) {
  if (!showProfile || !profiles?.length || !onProfileChange) return null;

  return (
    <div className="transform-form">
      <label className="field">
        <span>
          Render profile
          <InfoTooltip>
            Sets the aspect ratio, file type, and quality for desktop and mobile. Applies to every asset in
            this field. The site chooses the pixel widths. Picking a ratio other than the one prescribed for
            this slot does not make the page render that ratio. The React site decides how the image is drawn
            and at what size, because responsive images are more involved than a single ratio. That is
            especially true for Customize.
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
    </div>
  );
}
