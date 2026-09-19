import { useEffect, useState } from "react";
import { useAppSdk } from "../../common/hooks/useAppSdk";
import { normalizeBynderPortalUrl } from "../../lib/fieldConfig";
import {
  fetchOAuthStatus,
  OAUTH_MESSAGE_TYPE,
  oauthRedirectUri,
  saveOAuthCredentials,
  startOAuthAuthorize,
} from "../../lib/oauth/client";
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
  const installationUid = sdk?.ids?.installationUID ?? "";
  const [portalUrl, setPortalUrl] = useState("");
  const [compactLanguage, setCompactLanguage] = useState("en_US");
  const [enableDat, setEnableDat] = useState(true);
  const [enableAssetTracker, setEnableAssetTracker] = useState(false);
  const [persistAssetKeys, setPersistAssetKeys] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [validated, setValidated] = useState(false);
  const [loginBypass, setLoginBypass] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<"idle" | "working" | "ok" | "error">("idle");
  const [oauthMessage, setOauthMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const redirectUri = typeof window !== "undefined" ? oauthRedirectUri() : "";

  useEffect(() => {
    if (!location?.installation) {
      setLoading(false);
      return;
    }
    location.installation
      .getInstallationData()
      .then(async (data: InstallationData) => {
        const config = data?.configuration ?? {};
        setPortalUrl(config.bynderPortalUrl ?? "");
        setCompactLanguage(config.compactLanguage ?? "en_US");
        setEnableDat(config.enableDat !== false);
        setEnableAssetTracker(Boolean(config.enableAssetTracker));
        setPersistAssetKeys(Array.isArray(config.persistAssetKeys) ? config.persistAssetKeys.filter((key) => typeof key === "string") : []);
        setClientId(config.oauthClientId ?? "");
        setLoginBypass(Boolean(config.loginBypass));
        setAdvanced(Boolean(config.loginBypass || config.oauthClientId));
        if (installationUid) {
          try {
            const oauth = await fetchOAuthStatus(installationUid);
            setHasSecret(oauth.hasSecret);
            setValidated(oauth.validated);
            if (oauth.clientId) setClientId(oauth.clientId);
            if (oauth.hasSecret || oauth.validated) setAdvanced(true);
          } catch {
            /* Token server is optional when login bypass is off. */
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [location, installationUid]);

  const persistInstallation = async (next: {
    portalUrl: string;
    loginBypass: boolean;
    oauthClientId: string;
  }) => {
    if (!location?.installation) return;
    const current: InstallationData = await location.installation.getInstallationData();
    const configuration: AppInstallationConfig = {
      ...(current.configuration ?? {}),
      bynderPortalUrl: next.portalUrl,
      compactLanguage: compactLanguage.trim() || "en_US",
      enableDat,
      enableAssetTracker: Boolean(enableAssetTracker && next.loginBypass),
      persistAssetKeys,
      loginBypass: next.loginBypass,
      oauthClientId: next.oauthClientId,
    };
    delete configuration.compactMode;
    await location.installation.setInstallationData({
      configuration,
      serverConfiguration: current.serverConfiguration ?? {},
    });
  };

  const onSave = async () => {
    const nextPortal = normalizeBynderPortalUrl(portalUrl) ?? portalUrl.trim();
    if (!nextPortal) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    try {
      const bypass = Boolean((loginBypass || enableAssetTracker) && validated);
      if (bypass && clientId.trim() && (clientSecret.trim() || hasSecret)) {
        await saveOAuthCredentials({
          installationUid,
          portalUrl: nextPortal,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim() || undefined,
        });
      }
      await persistInstallation({
        portalUrl: nextPortal,
        loginBypass: bypass,
        oauthClientId: advanced ? clientId.trim() : "",
      });
      setPortalUrl(nextPortal);
      setLoginBypass(bypass);
      setClientSecret("");
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  };

  const onValidate = async () => {
    const nextPortal = normalizeBynderPortalUrl(portalUrl) ?? portalUrl.trim();
    if (!installationUid || !nextPortal || !clientId.trim() || (!clientSecret.trim() && !hasSecret)) {
      setOauthStatus("error");
      setOauthMessage("Portal URL, Client ID, and Client Secret are required to validate.");
      return;
    }
    setOauthStatus("working");
    setOauthMessage("Opening Bynder…");
    try {
      await saveOAuthCredentials({
        installationUid,
        portalUrl: nextPortal,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
      });
      const url = await startOAuthAuthorize(installationUid);
      const popup = window.open(url, "bynder-oauth", "width=720,height=780");
      if (!popup) {
        setOauthStatus("error");
        setOauthMessage(`Popup blocked. Allow popups, or open this URL: ${url}`);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          window.removeEventListener("message", onMessage);
          reject(new Error("Timed out waiting for Bynder authorization"));
        }, 5 * 60 * 1000);

        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          const data = event.data as { type?: string; ok?: boolean; error?: string } | null;
          if (data?.type !== OAUTH_MESSAGE_TYPE) return;
          window.clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          if (data.ok) resolve();
          else reject(new Error(data.error || "Bynder authorization was denied"));
        };

        window.addEventListener("message", onMessage);
      });

      setValidated(true);
      setHasSecret(true);
      setClientSecret("");
      setOauthStatus("ok");
      setOauthMessage("Validated. You can now enable Login Bypass.");
    } catch (error) {
      setOauthStatus("error");
      setOauthMessage(error instanceof Error ? error.message : "Could not validate with Bynder");
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
        Authors pick a Bynder asset inside this field, then set crop and focal point. Default: each
        author signs into Bynder in the picker. That works with local hosting and does not need a
        Bynder OAuth app.
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

      <label className="checkbox">
        <input
          type="checkbox"
          checked={enableAssetTracker}
          disabled={!validated}
          onChange={(event) => {
            const on = event.target.checked;
            setEnableAssetTracker(on);
            if (on) {
              setAdvanced(true);
              setLoginBypass(true);
            }
          }}
        />
        Enable Asset Tracker {validated ? "" : "(validate OAuth first)"}
      </label>
      <p className="help">
        Bynder-side usage tracking, not a Contentstack feature. When an entry is saved, this app posts
        the selected asset IDs to Bynder <code>/api/media/usage</code> using the Contentstack integration
        id, so the asset’s Usage tab can link back to the entry. Needs login bypass (shared token) and a
        Bynder user with the <strong>STATISTICS</strong> permission. Turning this on also turns on login
        bypass after Validate.
      </p>

      <h3>Bynder keys to save in the entry</h3>
      <p className="help">
        Contentstack JSON fields cap at <strong>10KB</strong>. The official Bynder app’s 12-key picker
        often stores the full <code>files</code> derivative map and GraphQL extras, which is what tripped
        that limit. This app always saves a slim required set and never persists bulky DAM blobs.
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
        Official-app keys we skip on purpose (OOTB marks some as mandatory, but this editor does not
        need them): {SKIPPED_OOTB_KEYS.map((item) => item.key).join(", ")}. <code>transformBaseUrl</code>{" "}
        is required here because DAT URLs are composed from it. <code>webImage</code> is stored only when
        DAT is unavailable.
      </p>

      <h3>Advanced settings</h3>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(event) => {
            const on = event.target.checked;
            setAdvanced(on);
            if (!on) setLoginBypass(false);
          }}
        />
        Show login-bypass setup (OAuth Client ID / Secret)
      </label>
      <p className="help">
        Same idea as the official Bynder marketplace app: Client ID / Secret and{" "}
        <strong>Enable login bypass</strong> are optional. Leave this off for local development.
      </p>

      {advanced && (
        <div className="advanced">
          <p className="help">
            Needs a <strong>new</strong> Bynder OAuth app whose redirect is this host (HTTPS tunnel or
            production), not <code>localhost</code> and not Contentstack’s{" "}
            <code>bynder.contentstackmarket.com</code> callback. Also needs this app’s token server (
            <code>npm run dev</code> locally, or <code>npm run start</code> in production).
          </p>
          <p className="help">
            Redirect URL to register in Bynder:
            <code className="example">{redirectUri}</code>
          </p>
          <label>
            Client ID
            <input
              type="text"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoComplete="off"
            />
          </label>
          <label>
            Client Secret
            <input
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={hasSecret ? "Saved on the server — leave blank to keep" : "Paste the secret once"}
              autoComplete="new-password"
            />
          </label>
          <div className="actions">
            <button type="button" disabled={oauthStatus === "working"} onClick={() => void onValidate()}>
              {oauthStatus === "working" ? "Waiting for Bynder…" : "Fetch Code and Validate"}
            </button>
            {oauthStatus === "ok" && <span className="status ok">{oauthMessage}</span>}
            {oauthStatus === "error" && <span className="status err">{oauthMessage}</span>}
            {oauthStatus === "working" && <span className="status">{oauthMessage}</span>}
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={loginBypass}
              disabled={!validated}
              onChange={(event) => setLoginBypass(event.target.checked)}
            />
            Enable login bypass {validated ? "" : "(validate first)"}
          </label>
          <p className="help">
            Off: each author signs into Bynder in the picker. On: authors skip Bynder login (shared
            token from Validate). You can turn this off later without deleting the OAuth app. Asset
            Tracker also uses this shared token.
          </p>
        </div>
      )}

      <p className="help">
        Per-field override in the content type builder:
        <code className="example">{`{ "maxNumberOfAssets": 3, "desktopMobileMode": false, "aspect": "16:9" }`}</code>
      </p>
      <button type="button" disabled={status === "saving"} onClick={() => void onSave()}>
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "saved" && <span className="status ok">Saved</span>}
      {status === "error" && <span className="status err">Could not save</span>}
    </div>
  );
}
