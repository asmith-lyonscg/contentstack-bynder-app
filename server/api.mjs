import { randomBytes } from "node:crypto";
import {
  getInstallation,
  putPending,
  publicStatus,
  takePending,
  upsertInstallation,
} from "./store.mjs";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  reportAssetUsage,
  tokenStillValid,
} from "./bynder.mjs";

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

async function accessTokenFor(record, uid) {
  if (!record?.refreshToken || !record.clientSecret) return "";
  if (record.accessToken && tokenStillValid(record.accessTokenExpiresAt)) return record.accessToken;
  const tokens = await refreshAccessToken({
    portalUrl: record.portalUrl,
    clientId: record.clientId,
    clientSecret: record.clientSecret,
    refreshToken: record.refreshToken,
  });
  await upsertInstallation(uid, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || record.refreshToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
  });
  return tokens.accessToken;
}

export async function handleApiRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

  try {
    if (req.method === "GET" && url.pathname === "/api/oauth/status") {
      const uid = url.searchParams.get("installationUid") || "";
      const record = await getInstallation(uid);
      sendJson(res, 200, publicStatus(record));
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/oauth/credentials") {
      const body = await parseJsonBody(req);
      const uid = String(body.installationUid || "").trim();
      const portalUrl = String(body.portalUrl || "").trim();
      const clientId = String(body.clientId || "").trim();
      const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
      if (!uid || !portalUrl || !clientId) {
        sendJson(res, 400, { error: "installationUid, portalUrl, and clientId are required" });
        return true;
      }
      const current = await getInstallation(uid);
      const nextSecret = clientSecret || current?.clientSecret;
      if (!nextSecret) {
        sendJson(res, 400, { error: "Client secret is required the first time" });
        return true;
      }
      const sameApp = current?.clientId === clientId && current?.portalUrl === portalUrl;
      await upsertInstallation(uid, {
        portalUrl,
        clientId,
        clientSecret: nextSecret,
        ...(sameApp ? {} : { refreshToken: "", accessToken: "", accessTokenExpiresAt: 0, validatedAt: "" }),
      });
      sendJson(res, 200, publicStatus(await getInstallation(uid)));
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/oauth/authorize") {
      const body = await parseJsonBody(req);
      const uid = String(body.installationUid || "").trim();
      const redirectUri = String(body.redirectUri || "").trim();
      const record = await getInstallation(uid);
      if (!record?.clientId || !record?.clientSecret || !record?.portalUrl) {
        sendJson(res, 400, { error: "Save Client ID and Client Secret first" });
        return true;
      }
      if (!redirectUri) {
        sendJson(res, 400, { error: "redirectUri is required" });
        return true;
      }
      const state = randomBytes(16).toString("hex");
      await putPending(state, { installationUid: uid, redirectUri, createdAt: Date.now() });
      sendJson(res, 200, {
        url: buildAuthorizeUrl({
          portalUrl: record.portalUrl,
          clientId: record.clientId,
          redirectUri,
          state,
        }),
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/oauth/complete") {
      const body = await parseJsonBody(req);
      const code = String(body.code || "").trim();
      const state = String(body.state || "").trim();
      const pending = await takePending(state);
      if (!code || !pending) {
        sendJson(res, 400, { error: "Invalid or expired OAuth state" });
        return true;
      }
      const record = await getInstallation(pending.installationUid);
      if (!record?.clientSecret) {
        sendJson(res, 400, { error: "Missing OAuth credentials for this installation" });
        return true;
      }
      const tokens = await exchangeAuthorizationCode({
        portalUrl: record.portalUrl,
        clientId: record.clientId,
        clientSecret: record.clientSecret,
        code,
        redirectUri: pending.redirectUri,
      });
      await upsertInstallation(pending.installationUid, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || record.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        validatedAt: new Date().toISOString(),
      });
      sendJson(res, 200, { ok: true, validated: true });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/oauth/token") {
      const uid = url.searchParams.get("installationUid") || "";
      const record = await getInstallation(uid);
      const accessToken = await accessTokenFor(record, uid);
      if (!accessToken) {
        sendJson(res, 404, { error: "Login bypass is not validated for this installation" });
        return true;
      }
      sendJson(res, 200, { accessToken });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/usage") {
      const body = await parseJsonBody(req);
      const uid = String(body.installationUid || "").trim();
      const uri = String(body.uri || "").trim();
      const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
      if (!uid || !uri || !assetIds.length) {
        sendJson(res, 400, { error: "installationUid, uri, and assetIds are required" });
        return true;
      }
      const record = await getInstallation(uid);
      const accessToken = await accessTokenFor(record, uid);
      if (!record?.portalUrl || !accessToken) {
        sendJson(res, 409, { error: "Asset Tracker needs a validated Bynder OAuth token (login bypass)" });
        return true;
      }
      const errors = [];
      for (const assetId of assetIds) {
        try {
          await reportAssetUsage({
            portalUrl: record.portalUrl,
            accessToken,
            assetId,
            uri,
          });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      sendJson(res, errors.length ? 207 : 200, { ok: errors.length < assetIds.length, errors });
      return true;
    }

    sendJson(res, 404, { error: "Not found" });
    return true;
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "OAuth request failed" });
    return true;
  }
}
