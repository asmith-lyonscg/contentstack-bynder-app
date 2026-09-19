const DEFAULT_SCOPES =
  process.env.OAUTH_SCOPES || "offline asset:read collection:read meta.assetbank:read transformations:read";

export function portalOrigin(portalUrl) {
  const host = String(portalUrl || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!host) throw new Error("Portal URL is required");
  return `https://${host}`;
}

export function buildAuthorizeUrl({ portalUrl, clientId, redirectUri, state, scope = DEFAULT_SCOPES }) {
  const url = new URL("/v6/authentication/oauth2/auth", portalOrigin(portalUrl));
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  return url.toString();
}

async function postForm(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { error: text };
  }
  return { ok: response.ok, status: response.status, json };
}

function asTokens(json) {
  const accessToken = json?.access_token;
  if (!accessToken) {
    const message = json?.error_description || json?.error || json?.message || "Bynder token request failed";
    throw new Error(typeof message === "string" ? message : "Bynder token request failed");
  }
  const expiresIn = Number(json.expires_in);
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    accessTokenExpiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 3600 * 1000),
  };
}

export async function exchangeAuthorizationCode({ portalUrl, clientId, clientSecret, code, redirectUri }) {
  const origin = portalOrigin(portalUrl);
  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };
  const urls = [`${origin}/v6/authentication/oauth2/token/authorization`, `${origin}/v6/authentication/oauth2/token`];
  let lastError = "Bynder token exchange failed";
  for (const url of urls) {
    const result = await postForm(url, body);
    if (result.ok) return asTokens(result.json);
    lastError = result.json?.error_description || result.json?.error || lastError;
  }
  throw new Error(lastError);
}

export async function refreshAccessToken({ portalUrl, clientId, clientSecret, refreshToken }) {
  const origin = portalOrigin(portalUrl);
  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  const urls = [`${origin}/v6/authentication/oauth2/token/refresh`, `${origin}/v6/authentication/oauth2/token`];
  let lastError = "Bynder token refresh failed";
  for (const url of urls) {
    const result = await postForm(url, body);
    if (result.ok) return asTokens(result.json);
    lastError = result.json?.error_description || result.json?.error || lastError;
  }
  throw new Error(lastError);
}

export function tokenStillValid(expiresAt, skewMs = 60_000) {
  return typeof expiresAt === "number" && expiresAt - skewMs > Date.now();
}

/** Contentstack’s Bynder integration id, used by the official app’s Asset Tracker. */
export const CONTENTSTACK_USAGE_INTEGRATION_ID = "c778dee0-637a-11ee-81e7-325096b39f47";

export async function reportAssetUsage({ portalUrl, accessToken, assetId, uri, timestamp }) {
  const origin = portalOrigin(portalUrl);
  const body = new URLSearchParams({
    asset_id: String(assetId),
    uri: String(uri),
    integration_id: CONTENTSTACK_USAGE_INTEGRATION_ID,
    timestamp: timestamp || new Date().toISOString(),
  });
  const response = await fetch(`${origin}/api/media/usage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
  if (response.ok) return;
  const text = await response.text();
  let message = `Bynder usage tracking failed (${response.status})`;
  try {
    const json = text ? JSON.parse(text) : null;
    message = json?.message || json?.error || json?.error_description || message;
  } catch {
    if (text) message = text;
  }
  throw new Error(typeof message === "string" ? message : "Bynder usage tracking failed");
}
