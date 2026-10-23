import { useEffect, useMemo, useRef, useState } from "react";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { normalizeBynderPortalUrl } from "../../lib/fieldConfig";
import { parseRenderProfiles } from "../../lib/profiles";
import { DEFAULT_MAX_DIMENSION, type AppInstallationConfig } from "../../lib/types";
import "./AppConfig.css";

interface InstallationData {
  configuration?: AppInstallationConfig;
  serverConfiguration?: Record<string, unknown>;
}

const EXAMPLE_PROFILES = {
  hero: {
    name: "Hero",
    desktop: "16:9",
    mobile: "4:3",
    quality: 80,
    format: "webp",
  },
  largeHero: {
    name: "Hero Large",
    desktop: "21:9",
    mobile: "4:5",
    quality: 75,
    format: "webp",
  },
};

function profilesText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

/** Parsed `profiles`, or why it cannot be saved. Empty text or `{}` means no profiles. */
function readProfilesText(text: string): { value?: unknown; errors: string[] } {
  if (!text.trim()) return { errors: [] };
  try {
    JSON.parse(text);
  } catch (error) {
    return { errors: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const parsed = parseRenderProfiles(text);
  if (parsed.errors.length) return { errors: parsed.errors };
  if (!Object.keys(parsed.profiles).length) return { errors: [] };
  return { value: parsed.profiles, errors: [] };
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
  const [profilesDraft, setProfilesDraft] = useState("");
  const [maxDimensionDraft, setMaxDimensionDraft] = useState(String(DEFAULT_MAX_DIMENSION));
  const [loading, setLoading] = useState(true);
  const loadedConfiguration = useRef<Record<string, unknown>>({});
  const serverConfiguration = useRef<Record<string, unknown>>({});
  const stagedOnce = useRef(false);
  const stageQueue = useRef(Promise.resolve());
  const maxDimensionRead = readWidth(maxDimensionDraft, "maxDimension");
  const maxDimension = maxDimensionRead.value ?? DEFAULT_MAX_DIMENSION;
  const widthError = maxDimensionRead.error;
  const profiles = useMemo(() => readProfilesText(profilesDraft), [profilesDraft]);

  useEffect(() => {
    if (!location?.installation) {
      setLoading(false);
      return;
    }
    location.installation
      .getInstallationData()
      .then((data: InstallationData) => {
        const config = data?.configuration ?? {};
        loadedConfiguration.current = { ...config };
        serverConfiguration.current = data?.serverConfiguration ?? {};
        setPortalUrl(config.bynderPortalUrl ?? "");
        setCompactLanguage(config.compactLanguage ?? "en_US");
        setProfilesDraft(profilesText(config.profiles));
        setMaxDimensionDraft(widthText(config.maxDimension, DEFAULT_MAX_DIMENSION));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [location]);

  const profileError = profiles.errors[0];

  useEffect(() => {
    const installation = location?.installation;
    if (loading || !installation) return undefined;
    const invalid = !portalUrl.trim() ? "Enter a Bynder portal URL." : widthError ?? profileError;
    if (invalid) {
      installation.setValidity(false, { message: invalid });
      stagedOnce.current = true;
      return undefined;
    }
    installation.setValidity(true);
    if (!stagedOnce.current) {
      stagedOnce.current = true;
      return undefined;
    }
    const nextPortal = normalizeBynderPortalUrl(portalUrl) ?? portalUrl.trim();
    const configuration: AppInstallationConfig & Record<string, unknown> = {
      ...loadedConfiguration.current,
      bynderPortalUrl: nextPortal,
      compactLanguage: compactLanguage.trim() || "en_US",
      maxDimension,
    };
    if (profiles.value) configuration.profiles = profiles.value as AppInstallationConfig["profiles"];
    else delete configuration.profiles;
    stageQueue.current = stageQueue.current
      .then(() =>
        installation.setInstallationData({
          configuration,
          serverConfiguration: serverConfiguration.current,
        })
      )
      .then((saved) => {
        const next = saved as InstallationData;
        if (next?.configuration) loadedConfiguration.current = { ...next.configuration };
        if (next?.serverConfiguration) serverConfiguration.current = next.serverConfiguration;
      })
      .catch(() => {
        installation.setValidity(false, { message: "Could not update the configuration. Try again." });
      });
    return undefined;
  }, [compactLanguage, loading, location, maxDimension, portalUrl, profileError, profiles.value, widthError]);

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

      <h3>Bynder max dimension</h3>
      <label>
        Either side <code>maxDimension</code>
        <input
          type="number"
          min={1}
          step={1}
          value={maxDimensionDraft}
          aria-invalid={Boolean(maxDimensionRead.error)}
          onChange={(event) => setMaxDimensionDraft(event.target.value)}
        />
      </label>
      <p className="help">
        Bynder’s DAT limit, in pixels. The default account limit is 2000. If a transform is taller or wider
        than this, Bynder ignores it and returns the original file. The site chooses the request widths, and
        delivery shrinks any step that would pass this limit. Raise it here only if Bynder has raised it for
        this portal.
      </p>
      {widthError ? (
        <ul className="profiles-errors" role="alert">
          <li>{widthError}</li>
        </ul>
      ) : null}

      <h3>Render profiles</h3>
      <p className="help">
        Each profile needs a unique key and <code>desktop</code> and <code>mobile</code> aspect ratios,
        such as <code>"16:9"</code>. Optional <code>name</code> is the label authors see, such as{" "}
        <code>&quot;Hero Large&quot;</code>. Optional DAT <code>quality</code> (default 80) and <code>format</code>{" "}
        (default webp). Entries save the profile key and a snapshot of the aspect, quality, and format. The site passes the
        widths it needs, and delivery keeps each one inside <code>maxDimension</code>.
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

      <p className="help">
        Use <strong>Save</strong> in Contentstack to keep this configuration.{" "}
        <a
          href="https://github.com/asmith-lyonscg/contentstack-bynder-app/blob/main/README.md#app-settings"
          target="_blank"
          rel="noopener noreferrer"
        >
          App settings in the README
        </a>
      </p>

      <details className="how-to">
        <summary>How To</summary>
        <div className="how-to-body">
          <pre>{JSON.stringify(EXAMPLE_PROFILES, null, 2)}</pre>
          <p className="help">
            Narrow the list per field with the Config Parameter, e.g.{" "}
            <code className="example">{`{ "profile": "hero" }`}</code> locks the field to one profile, with no dropdown.
            Or offer a list, e.g.{" "}
            <code className="example">{`{ "profiles": ["hero", "largeHero"], "defaultProfile": "hero" }`}</code>
            A field can also define its own profile and offer it beside these, e.g.{" "}
            <code className="example">{`{ "fieldProfiles": { "banner": { "name": "Banner", "desktop": "21:9", "mobile": "4:3", "quality": 80, "format": "webp" } }, "profiles": ["banner", "hero"] }`}</code>
            Without <code>profile</code> or <code>defaultProfile</code>, new assets keep their original aspect ratio until the author picks a
            profile. <code>allowCustomAspect</code> on the field adds a dragged ratio. Changing a profile updates entries that use it; authors see an “Unsaved changes” note until
            they save.
          </p>
          <p className="help">
            Each asset stores a slim identity (<code>id</code>, <code>name</code>, <code>type</code>,{" "}
            <code>transformBaseUrl</code>, <code>origWidth</code> / <code>origHeight</code>) plus
            focal point when it is not centered, and Fill. DAM metadata (tags, description) is not duplicated — delivery can re-fetch
            Bynder by id. Contentstack JSON fields cap at <strong>10KB</strong>.
          </p>
        </div>
      </details>
    </div>
  );
}
