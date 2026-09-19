export const OAUTH_MESSAGE_TYPE = "bynder-oauth";

export function oauthRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text };
  }
}

function errorMessage(body: Record<string, unknown>, fallback: string): string {
  const error = body.error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export interface OAuthStatus {
  hasSecret: boolean;
  validated: boolean;
  clientId: string;
  portalUrl: string;
}

export async function fetchOAuthStatus(installationUid: string): Promise<OAuthStatus> {
  const response = await fetch(`/api/oauth/status?installationUid=${encodeURIComponent(installationUid)}`);
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not load OAuth status"));
  return {
    hasSecret: Boolean(body.hasSecret),
    validated: Boolean(body.validated),
    clientId: typeof body.clientId === "string" ? body.clientId : "",
    portalUrl: typeof body.portalUrl === "string" ? body.portalUrl : "",
  };
}

export async function saveOAuthCredentials(input: {
  installationUid: string;
  portalUrl: string;
  clientId: string;
  clientSecret?: string;
}): Promise<OAuthStatus> {
  const response = await fetch("/api/oauth/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not save OAuth credentials"));
  return {
    hasSecret: Boolean(body.hasSecret),
    validated: Boolean(body.validated),
    clientId: typeof body.clientId === "string" ? body.clientId : "",
    portalUrl: typeof body.portalUrl === "string" ? body.portalUrl : "",
  };
}

export async function startOAuthAuthorize(installationUid: string): Promise<string> {
  const response = await fetch("/api/oauth/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationUid, redirectUri: oauthRedirectUri() }),
  });
  const body = await readJson(response);
  if (!response.ok || typeof body.url !== "string") {
    throw new Error(errorMessage(body, "Could not start Bynder authorization"));
  }
  return body.url;
}

export async function completeOAuth(code: string, state: string): Promise<void> {
  const response = await fetch("/api/oauth/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(errorMessage(body, "Could not complete Bynder authorization"));
}

export async function fetchBypassAccessToken(installationUid: string): Promise<string> {
  const response = await fetch(`/api/oauth/token?installationUid=${encodeURIComponent(installationUid)}`);
  const body = await readJson(response);
  if (!response.ok || typeof body.accessToken !== "string") {
    throw new Error(errorMessage(body, "Could not get a Bynder access token"));
  }
  return body.accessToken;
}

export async function reportAssetUsage(input: {
  installationUid: string;
  assetIds: string[];
  uri: string;
}): Promise<void> {
  const response = await fetch("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.ok) return;
  const body = await readJson(response);
  throw new Error(errorMessage(body, "Could not report Bynder asset usage"));
}
