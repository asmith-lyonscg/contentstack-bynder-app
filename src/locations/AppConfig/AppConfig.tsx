import { useEffect, useState, type FormEvent } from "react";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import type { AppInstallationConfig } from "../../lib/types";
import "./AppConfig.css";

interface InstallationData {
  configuration?: AppInstallationConfig;
  serverConfiguration?: Record<string, unknown>;
}

export default function AppConfig() {
  const sdk = useAppSdk();
  const location = sdk?.location.AppConfigWidget;
  const [fieldUid, setFieldUid] = useState("");
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
        setFieldUid(data?.configuration?.bynderFieldUid ?? "");
        setEnableDat(Boolean(data?.configuration?.enableDat));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [location]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!location?.installation) return;
    setStatus("saving");
    try {
      const current: InstallationData = await location.installation.getInstallationData();
      await location.installation.setInstallationData({
        configuration: {
          ...(current.configuration ?? {}),
          bynderFieldUid: fieldUid.trim(),
          enableDat,
        },
        serverConfiguration: current.serverConfiguration ?? {},
      });
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
    <form className="app-config" onSubmit={onSubmit}>
      <h2>Bynder Image Settings</h2>
      <p className="lede">
        Default sibling Bynder field UID. Each Custom Field instance can override this with a Config
        Parameter.
      </p>
      <label>
        Default Bynder field UID
        <input
          type="text"
          value={fieldUid}
          onChange={(event) => setFieldUid(event.target.value)}
          placeholder="hero_image or hero_group.hero_image"
        />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={enableDat} onChange={(event) => setEnableDat(event.target.checked)} />
        Enable Bynder DAT transforms
      </label>
      <p className="help">
        Leave DAT off to author focal point with a CSS crop preview (no <code>transformBaseUrl</code>{" "}
        required). Turn it on when the portal has Dynamic Asset Transformation.
      </p>
      <p className="help">
        Per-field override in the content type builder:
        <code>{`{ "bynderFieldUid": "hero_image", "enableDat": false, "aspectPresets": ["16:9", "1:1"] }`}</code>
      </p>
      <button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "saved" && <span className="status ok">Saved</span>}
      {status === "error" && <span className="status err">Could not save</span>}
    </form>
  );
}
