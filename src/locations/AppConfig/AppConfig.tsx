import { useEffect, useMemo, useState } from "react";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { normalizeBynderPortalUrl } from "../../lib/fieldConfig";
import { parseRenderProfiles } from "../../lib/profiles";
import { DEFAULT_MAX_WIDTHS, type AppInstallationConfig, type MaxWidths } from "../../lib/types";
import "./AppConfig.css";

interface InstallationData {
  configuration?: AppInstallationConfig;
  serverConfiguration?: Record<string, unknown>;
}

type ShowKey = "showFieldOperation" | "showFieldAutoplay" | "showFieldMuted" | "showFieldControls" | "showFieldLoop";

interface EditorRow {
  showKey: ShowKey;
  label: string;
  /** Must match the runtime default in `resolveCropConfig` / `resolveVideoFieldVisibility`. */
  defaultShow: boolean;
}

const VIDEO_ROWS: EditorRow[] = [
  { showKey: "showFieldAutoplay", label: "Autoplay", defaultShow: true },
  { showKey: "showFieldMuted", label: "Mute", defaultShow: true },
  { showKey: "showFieldControls", label: "Show controls", defaultShow: true },
  { showKey: "showFieldLoop", label: "Loop", defaultShow: true },
];

const ALL_ROWS = VIDEO_ROWS;

/** Size, lock, and format keys that render profiles replaced. Removed on save. */
const RETIRED_KEYS = [
  "aspect",
  "width",
  "height",
  "format",
  "lockAspect",
  "lockWidth",
  "lockHeight",
  "lockFormat",
  "hideFormat",
  "aspectPresets",
  "showFieldAspectRatio",
  "showFieldWidth",
  "showFieldHeight",
  "showFieldFileType",
  "showFieldQuality",
  "showFieldAdvancedQuery",
  "showFieldDatPreset",
  "desktopMaxWidth",
  "mobileMaxWidth",
  "compactMode",
  "loginBypass",
  "oauthClientId",
  "enableAssetTracker",
  "persistAssetKeys",
] as const;

const EXAMPLE_PROFILES = {
  hero: {
    desktop: { aspectRatio: "16:9", maxWidth: 2000 },
    mobile: { aspectRatio: "4:3", maxWidth: 960 },
    quality: 80,
    format: "webp",
  },
  largeHero: {
    desktop: { aspectRatio: "21:9", maxWidth: 2000 },
    mobile: { aspectRatio: "4:5", maxWidth: 960 },
    quality: 75,
    format: "webp",
  },
};

type FlagState = Record<ShowKey, boolean>;

function readBool(config: Record<string, unknown>, key: string): boolean | undefined {
  const value = config[key];
  return typeof value === "boolean" ? value : undefined;
}

function initialFlags(config: Record<string, unknown>): FlagState {
  const flags = {} as FlagState;
  for (const row of ALL_ROWS) flags[row.showKey] = readBool(config, row.showKey) ?? row.defaultShow;
  return flags;
}

function profilesText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

/** Parsed `profiles`, or why it cannot be saved. Empty text or `{}` means no profiles. */
function readProfilesText(text: string, maxWidths: MaxWidths): { value?: unknown; errors: string[] } {
  if (!text.trim()) return { errors: [] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { errors: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const parsed = parseRenderProfiles(text, maxWidths);
  if (!parsed.errors.length && !Object.keys(parsed.profiles).length) return { errors: [] };
  return { value, errors: parsed.errors };
}

function widthText(value: unknown, fallback: number): string {
  return typeof value === "number" && value > 0 ? String(value) : String(fallback);
}

/** A whole number of pixels, or an error. */
function readWidth(text: string, key: string): { value?: number; error?: string } {
  const n = Number(text.trim());
  if (!text.trim() || !Number.isInteger(n) || n <= 0) return { error: `${key} must be a whole number of pixels.` };
  return { value: n };
}

export default function AppConfig() {
  const sdk = useAppSdk();
  const location = sdk?.location.AppConfigWidget;
  const [portalUrl, setPortalUrl] = useState("");
  const [compactLanguage, setCompactLanguage] = useState("en_US");
  const [enableDat, setEnableDat] = useState(true);
  const [allowFit, setAllowFit] = useState(false);
  const [profilesDraft, setProfilesDraft] = useState("");
  const [maxDesktopDraft, setMaxDesktopDraft] = useState(String(DEFAULT_MAX_WIDTHS.desktop));
  const [maxMobileDraft, setMaxMobileDraft] = useState(String(DEFAULT_MAX_WIDTHS.mobile));
  const [flags, setFlags] = useState<FlagState>(() => initialFlags({}));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const maxDesktop = readWidth(maxDesktopDraft, "maxDesktopWidth");
  const maxMobile = readWidth(maxMobileDraft, "maxMobileWidth");
  const widthErrors = [maxDesktop.error, maxMobile.error].filter((error): error is string => Boolean(error));
  const maxDesktopWidth = maxDesktop.value ?? DEFAULT_MAX_WIDTHS.desktop;
  const maxMobileWidth = maxMobile.value ?? DEFAULT_MAX_WIDTHS.mobile;
  const profiles = useMemo(
    () => readProfilesText(profilesDraft, { desktop: maxDesktopWidth, mobile: maxMobileWidth }),
    [profilesDraft, maxDesktopWidth, maxMobileWidth]
  );
  const blocked = profiles.errors.length > 0 || widthErrors.length > 0;

  useEffect(() => {
    if (!location?.installation) {
      setLoading(false);
      return;
    }
    location.installation
      .getInstallationData()
      .then((data: InstallationData) => {
        const config = data?.configuration ?? {};
        setPortalUrl(config.bynderPortalUrl ?? "");
        setCompactLanguage(config.compactLanguage ?? "en_US");
        setEnableDat(config.enableDat !== false);
        setAllowFit(config.allowFit === true);
        setProfilesDraft(profilesText(config.profiles));
        setMaxDesktopDraft(widthText(config.maxDesktopWidth, DEFAULT_MAX_WIDTHS.desktop));
        setMaxMobileDraft(widthText(config.maxMobileWidth, DEFAULT_MAX_WIDTHS.mobile));
        setFlags(initialFlags(config as Record<string, unknown>));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [location]);

  const renderRow = (row: EditorRow) => (
    <li key={row.showKey}>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={flags[row.showKey]}
          onChange={(event) => setFlags((current) => ({ ...current, [row.showKey]: event.target.checked }))}
        />
        Show {row.label}
        <code>{row.showKey}</code>
      </label>
    </li>
  );

  const onSave = async () => {
    const nextPortal = normalizeBynderPortalUrl(portalUrl) ?? portalUrl.trim();
    if (!nextPortal || !location?.installation || blocked) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const current: InstallationData = await location.installation.getInstallationData();
      const configuration: AppInstallationConfig & Record<string, unknown> = {
        ...(current.configuration ?? {}),
        bynderPortalUrl: nextPortal,
        compactLanguage: compactLanguage.trim() || "en_US",
        enableDat,
        allowFit,
        maxDesktopWidth,
        maxMobileWidth,
      };
      if (profiles.value) configuration.profiles = profiles.value as AppInstallationConfig["profiles"];
      else delete configuration.profiles;
      for (const row of ALL_ROWS) configuration[row.showKey] = flags[row.showKey];
      for (const key of RETIRED_KEYS) delete configuration[key];
      await location.installation.setInstallationData({
        configuration,
        serverConfiguration: current.serverConfiguration ?? {},
      });
      setPortalUrl(nextPortal);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  };

  if (!location) {
    return <p className="notice">This view only works as an App Configuration location.</p>;
  }

  if (loading) {
    return <p className="notice">Loading configuration…</p>;
  }

  return (
    <div className="app-config">
      <h2>Bynder Image Settings</h2>
      <p className="lede">
        Authors pick a Bynder asset inside this field, then set crop and focal point. Each author signs into
        Bynder in the picker. This build is static and can be hosted on GitHub Pages.
      </p>
      <label>
        Bynder portal URL
        <input
          type="text"
          value={portalUrl}
          onChange={(event) => setPortalUrl(event.target.value)}
          placeholder="acme.getbynder.com"
        />
      </label>
      <p className="help">
        Host only, without <code>https://</code>.
      </p>
      <label>
        Compact View language
        <input
          type="text"
          value={compactLanguage}
          onChange={(event) => setCompactLanguage(event.target.value)}
          placeholder="en_US"
        />
      </label>
      <p className="help">
        Single vs multi lives on the field Config Parameter (<code>maxNumberOfAssets</code>, default 1). Compact
        View always picks the <strong>asset</strong>, not a derivative file — DAT uses{" "}
        <code>files.transformBaseUrl</code>.
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={enableDat} onChange={(event) => setEnableDat(event.target.checked)} />
        Enable Bynder DAT transforms
      </label>

      <h3>Maximum image widths</h3>
      <p className="help">
        The widest image the site may request. No profile may go above these. Assets without a profile keep
        their original aspect ratio and use these widths (never wider than the original file).
      </p>
      <div className="max-widths">
        <label>
          Desktop <code>maxDesktopWidth</code>
          <input
            type="number"
            min={1}
            step={1}
            value={maxDesktopDraft}
            aria-invalid={Boolean(maxDesktop.error)}
            onChange={(event) => setMaxDesktopDraft(event.target.value)}
          />
        </label>
        <label>
          Mobile <code>maxMobileWidth</code>
          <input
            type="number"
            min={1}
            step={1}
            value={maxMobileDraft}
            aria-invalid={Boolean(maxMobile.error)}
            onChange={(event) => setMaxMobileDraft(event.target.value)}
          />
        </label>
      </div>
      {widthErrors.length ? (
        <ul className="profiles-errors" role="alert">
          {widthErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <h3>Render profiles</h3>
      <p className="help">
        Each profile needs a unique name and <code>desktop</code> and <code>mobile</code>, each with{" "}
        <code>aspectRatio</code> and <code>maxWidth</code> (at most <code>maxDesktopWidth</code> /{" "}
        <code>maxMobileWidth</code>). Optional: DAT <code>quality</code> (default 80) and <code>format</code>{" "}
        (default webp). Entries save the profile name and a snapshot of these values; the site builds{" "}
        <code>srcset</code> from 640w up to <code>maxWidth</code>.
      </p>
      <textarea
        className={profiles.errors.length ? "profiles-editor is-invalid" : "profiles-editor"}
        rows={14}
        spellCheck={false}
        value={profilesDraft}
        placeholder="No profiles: assets keep their original aspect ratio."
        aria-invalid={profiles.errors.length > 0}
        onChange={(event) => setProfilesDraft(event.target.value)}
      />
      {profiles.errors.length ? (
        <ul className="profiles-errors" role="alert">
          {profiles.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <details className="profiles-example">
        <summary>Example with two profiles</summary>
        <pre>{JSON.stringify(EXAMPLE_PROFILES, null, 2)}</pre>
      </details>
      <p className="help">
        Narrow the list per field with the Config Parameter, e.g.{" "}
        <code className="example">{`{ "profile": "hero" }`}</code> locks the field to one profile, with no dropdown.
        Or offer a list, e.g.{" "}
        <code className="example">{`{ "profiles": ["hero", "largeHero"], "defaultProfile": "hero" }`}</code>
        Without <code>profile</code> or <code>defaultProfile</code>, new assets keep their original aspect ratio until the author picks a
        profile. Changing a profile updates entries that use it; authors see an “Unsaved changes” note until
        they save.
      </p>

      <h3>Editor field defaults</h3>
      <p className="help">Stack-wide defaults. A field Config Parameter can override these.</p>
      <h4 className="flag-group-title">Images</h4>
      <ul className="key-list">
        <li>
          <label className="checkbox">
            <input type="checkbox" checked={allowFit} onChange={(event) => setAllowFit(event.target.checked)} />
            Fit (letterbox)
            <code>allowFit</code>
          </label>
        </li>
      </ul>
      <p className="help">
        Off by default. Authors only get Fill, and <strong>Transform type</strong> is hidden. Turn this on to
        also offer Fit, which shows the whole image and letterboxes the rest. A field can override it with{" "}
        <code>{`{ "allowFit": true }`}</code>.
      </p>
      <h4 className="flag-group-title">Video playback</h4>
      <ul className="key-list">{VIDEO_ROWS.map(renderRow)}</ul>

      <p className="help">
        Each asset stores a slim identity (<code>id</code>, <code>name</code>, <code>type</code>,{" "}
        <code>transformBaseUrl</code>, <code>originalAssetWidth</code> / <code>originalAssetHeight</code>) plus
        focal point and transform type. DAM metadata (tags, description) is not duplicated — delivery can re-fetch
        Bynder by id. Contentstack JSON fields cap at <strong>10KB</strong>.
      </p>

      <button
        type="button"
        disabled={status === "saving" || !portalUrl.trim() || blocked}
        onClick={() => void onSave()}
      >
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "saved" && <span className="status ok">Saved</span>}
      {status === "error" && <span className="status err">Could not save</span>}
    </div>
  );
}
