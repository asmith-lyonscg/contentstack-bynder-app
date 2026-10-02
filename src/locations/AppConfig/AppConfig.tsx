import { useEffect, useState } from "react";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { normalizeBynderPortalUrl } from "../../lib/fieldConfig";
import {
  OPTIONAL_PERSIST_KEYS,
  REQUIRED_PERSIST_KEYS,
  SKIPPED_OOTB_KEYS,
  optionalKeySelected,
} from "../../lib/persistKeys";
import type { AppInstallationConfig } from "../../lib/types";
import "./AppConfig.css";

interface InstallationData {
  configuration?: AppInstallationConfig;
  serverConfiguration?: Record<string, unknown>;
}

export default function AppConfig() {
  const sdk = useAppSdk();
  const location = sdk?.location.AppConfigWidget;
  const [portalUrl, setPortalUrl] = useState("");
  const [compactLanguage, setCompactLanguage] = useState("en_US");
  const [enableDat, setEnableDat] = useState(true);
  const [persistAssetKeys, setPersistAssetKeys] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);

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
        setPersistAssetKeys(
          Array.isArray(config.persistAssetKeys)
            ? config.persistAssetKeys.filter((key) => typeof key === "string")
            : []
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [location]);

  const onSave = async () => {
    const nextPortal = normalizeBynderPortalUrl(portalUrl) ?? portalUrl.trim();
    if (!nextPortal || !location?.installation) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const current: InstallationData = await location.installation.getInstallationData();
      const configuration: AppInstallationConfig = {
        ...(current.configuration ?? {}),
        bynderPortalUrl: nextPortal,
        compactLanguage: compactLanguage.trim() || "en_US",
        enableDat,
        persistAssetKeys,
      };
      delete configuration.compactMode;
      delete configuration.loginBypass;
      delete configuration.oauthClientId;
      delete configuration.enableAssetTracker;
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
        Authors pick a Bynder asset inside this field, then set crop and focal point. Each author
        signs into Bynder in the picker. This build is static and can be hosted on GitHub Pages.
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
      <p className="help">Host only, without <code>https://</code>.</p>
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

      <h3>Bynder keys to save in the entry</h3>
      <p className="help">
        Contentstack JSON fields cap at <strong>10KB</strong>. This app always saves a slim required set
        and never persists bulky DAM blobs.
      </p>
      <ul className="key-list">
        {REQUIRED_PERSIST_KEYS.map((key) => (
          <li key={key} className="is-required">
            <label className="checkbox">
              <input type="checkbox" checked disabled />
              <code>{key}</code>
              <span className="key-flag">required</span>
            </label>
          </li>
        ))}
        {OPTIONAL_PERSIST_KEYS.map((key) => (
          <li key={key}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={optionalKeySelected(persistAssetKeys, key)}
                onChange={(event) => {
                  setPersistAssetKeys((current) =>
                    event.target.checked
                      ? [...current.filter((item) => item !== key), key]
                      : current.filter((item) => item !== key)
                  );
                }}
              />
              <code>{key}</code>
            </label>
          </li>
        ))}
      </ul>
      <p className="help">
        Not saved unless an include flag is on: {SKIPPED_OOTB_KEYS.map((item) => item.key).join(", ")}.{" "}
        <code>transformBaseUrl</code> is required because DAT URLs are composed from it.{" "}
        <code>webImage</code> is stored only when DAT is unavailable.
      </p>

      <p className="help">
        Per-field override in the content type builder. Optional saved values use{" "}
        <code>persistAssetKeys</code>. Editor inputs use <code>showField…</code> flags:
        <code className="example">{`{ "maxNumberOfAssets": 3, "persistAssetKeys": ["fileType", "tags"], "showFieldFileType": true, "showFieldWidth": false }`}</code>
      </p>
      <button type="button" disabled={status === "saving" || !portalUrl.trim()} onClick={() => void onSave()}>
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "saved" && <span className="status ok">Saved</span>}
      {status === "error" && <span className="status err">Could not save</span>}
    </div>
  );
}
