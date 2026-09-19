import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** @typedef {{ portalUrl: string, clientId: string, clientSecret: string, refreshToken?: string, accessToken?: string, accessTokenExpiresAt?: number, validatedAt?: string }} InstallationSecret */
/** @typedef {{ installationUid: string, redirectUri: string, createdAt: number }} PendingAuth */

const PENDING_TTL_MS = 15 * 60 * 1000;

function storePath() {
  return process.env.OAUTH_STORE_PATH || join(process.cwd(), "data", "oauth-store.json");
}

function emptyStore() {
  return { installations: {}, pending: {} };
}

async function load() {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      installations: parsed.installations && typeof parsed.installations === "object" ? parsed.installations : {},
      pending: parsed.pending && typeof parsed.pending === "object" ? parsed.pending : {},
    };
  } catch {
    return emptyStore();
  }
}

async function save(store) {
  const file = storePath();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store, null, 2), "utf8");
}

export async function getInstallation(uid) {
  if (!uid) return undefined;
  const store = await load();
  return store.installations[uid];
}

export async function upsertInstallation(uid, patch) {
  const store = await load();
  const current = store.installations[uid] ?? {};
  store.installations[uid] = { ...current, ...patch };
  await save(store);
  return store.installations[uid];
}

export async function putPending(state, pending) {
  const store = await load();
  store.pending[state] = pending;
  await save(store);
}

export async function takePending(state) {
  const store = await load();
  const pending = store.pending[state];
  if (!pending) return undefined;
  delete store.pending[state];
  await save(store);
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) return undefined;
  return pending;
}

export function publicStatus(record) {
  if (!record) {
    return { hasSecret: false, validated: false, clientId: "", portalUrl: "" };
  }
  return {
    hasSecret: Boolean(record.clientSecret),
    validated: Boolean(record.refreshToken),
    clientId: record.clientId ?? "",
    portalUrl: record.portalUrl ?? "",
  };
}
