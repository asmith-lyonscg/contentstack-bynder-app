import { useEffect, useState } from "react";
import { completeOAuth, OAUTH_MESSAGE_TYPE } from "../../lib/oauth/client";

export default function OAuthCallback() {
  const [message, setMessage] = useState("Completing Bynder authorization…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error_description") || params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    const notify = (ok: boolean, detail?: string) => {
      window.opener?.postMessage({ type: OAUTH_MESSAGE_TYPE, ok, error: detail }, window.location.origin);
      window.setTimeout(() => window.close(), 400);
    };

    if (error) {
      setMessage(error);
      notify(false, error);
      return;
    }
    if (!code || !state) {
      const detail = "Missing authorization code";
      setMessage(detail);
      notify(false, detail);
      return;
    }

    void completeOAuth(code, state)
      .then(() => {
        setMessage("Bynder authorization saved. You can close this window.");
        notify(true);
      })
      .catch((reason) => {
        const detail = reason instanceof Error ? reason.message : "Authorization failed";
        setMessage(detail);
        notify(false, detail);
      });
  }, []);

  return (
    <div className="app-loading">
      <h3>Bynder authorization</h3>
      <p>{message}</p>
    </div>
  );
}
