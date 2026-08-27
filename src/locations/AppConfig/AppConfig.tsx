import { useEffect, useState } from "react";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { normalizeBynderPortalUrl } from "../../lib/fieldConfig";
import type { AppInstallationConfig, CompactSelectionMode } from "../../lib/types";
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
  const [compactMode, setCompactMode] = useState<CompactSelectionMode>("SingleSelectFile");
  const [enableDat, setEnableDat] = useState(false);
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
        setPortalUrl(data?.configuration?.bynderPortalUrl ?? "");
        setCompactLanguage(data?.configuration?.compactLanguage ?? "en_US");
        setCompactMode(
          data?.configuration?.compactMode === "SingleSelect" ? "SingleSelect" : "SingleSelectFile"
        );
        setEnableDat(Boolean(data?.configuration?.enableDat));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [location]);

  const onSave = async () => {
    if (!location?.installation) return;
    const nextPortal = normalizeBynderPortalUrl(portalUrl) ?? portalUrl.trim();
    if (!nextPortal) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const current: InstallationData = await location.installation.getInstallationData();
      await location.installation.setInstallationData({
        configuration: {
          ...(current.configuration ?? {}),
          bynderPortalUrl: nextPortal,
          compactLanguage: compactLanguage.trim() || "en_US",
          compactMode,
          enableDat,
        },
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
        Authors pick a Bynder asset inside this field (Universal Compact View), then set crop and
        focal point. Each Custom Field instance can override these defaults with a Config Parameter.
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
      <p className="help">Host only, without <code>https://</code>. Authors sign in to this portal in the picker.</p>
      <label>
        Compact View language
        <input
          type="text"
          value={compactLanguage}
          onChange={(event) => setCompactLanguage(event.target.value)}
          placeholder="en_US"
        />
      </label>
      <label>
        Selection mode
        <select
          value={compactMode}
          onChange={(event) => setCompactMode(event.target.value as CompactSelectionMode)}
        >
          <option value="SingleSelectFile">SingleSelectFile (DAT file / derivative)</option>
          <option value="SingleSelect">SingleSelect</option>
        </select>
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={enableDat} onChange={(event) => setEnableDat(event.target.checked)} />
        Enable Bynder DAT transforms
      </label>
      <p className="help">
        Leave DAT off to author focal point with a CSS crop preview. Turn it on when the portal has
        Dynamic Asset Transformation. File mode can return a DAT URL as <code>selectedFile</code>.
      </p>
      <p className="help">
        Per-field override in the content type builder:
        <code className="example">{`{ "bynderPortalUrl": "acme.getbynder.com", "enableDat": false, "aspectPresets": ["16:9", "1:1"] }`}</code>
      </p>
      <button type="button" disabled={status === "saving"} onClick={() => void onSave()}>
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "saved" && <span className="status ok">Saved</span>}
      {status === "error" && <span className="status err">Could not save</span>}
    </div>
  );
}
