import { assetPixelSize, isDocumentAsset, isVideoAsset } from "./parseAsset";
import { compactViewGraphqlId } from "./preselect";
import { aspectRatioFromPixels } from "../profiles";
import type { SavedBynderAsset } from "../types";

/** Compact View's public OAuth client. Same id the picker uses to refresh a session. */
const COMPACT_VIEW_CLIENT_ID = "42b1eefa-d754-4802-b9c4-bf80d6ab6052";
/** Compact View stores the refresh token here. It survives closing the picker. */
const REFRESH_TOKEN_KEY = "cvrt";
const ACCOUNT_DOMAIN_KEY = "cvad";
/** Older Compact View builds stored a short-lived access token under this key. */
const COMPACT_VIEW_TOKEN_KEY = "jwt";
/** Kept after Compact View drops `jwt`, so an open entry can still read original pixels. */
const TOKEN_KEY = "bynder-image-settings.jwt";

let cachedAccess: { token: string; expiresAt: number } | undefined;

export interface OriginalPixelSize {
  width: number;
  height: number;
}

function portalOrigin(portalUrl: string): string {
  const trimmed = portalUrl.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function rememberToken(token: string | null): void {
  if (!token?.trim()) return;
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    /* private mode */
  }
}

function stored(key: string): string | undefined {
  try {
    const value = localStorage.getItem(key)?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

/** A Bynder session this browser can refresh, from Compact View's stored login. */
export function hasBynderSession(): boolean {
  return Boolean(stored(REFRESH_TOKEN_KEY) || stored(TOKEN_KEY) || stored(COMPACT_VIEW_TOKEN_KEY));
}

/** Bynder session token, if this browser has logged into Compact View. */
export function readBynderToken(): string | undefined {
  const own = stored(TOKEN_KEY);
  if (own) return own;
  const live = stored(COMPACT_VIEW_TOKEN_KEY);
  if (live) {
    rememberToken(live);
    return live;
  }
  return undefined;
}

/**
 * Access token for Bynder GraphQL. Refreshes Compact View's stored login so an
 * entry can be opened later without picking the asset again.
 */
export async function bynderAccessToken(portalUrl: string): Promise<string | undefined> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 30_000) return cachedAccess.token;
  const refresh = stored(REFRESH_TOKEN_KEY);
  const domain = stored(ACCOUNT_DOMAIN_KEY) || portalUrl;
  if (refresh && domain.trim()) {
    try {
      const response = await fetch(`${portalOrigin(domain)}/v6/authentication/oauth2/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          client_id: COMPACT_VIEW_CLIENT_ID,
          refresh_token: refresh,
          grant_type: "refresh_token",
        }),
      });
      if (response.ok) {
        const json: unknown = await response.json();
        const record = asRecord(json);
        const token = typeof record?.access_token === "string" ? record.access_token.trim() : "";
        const expiresIn = Number(record?.expires_in);
        if (token) {
          cachedAccess = {
            token,
            expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300) * 1000,
          };
          if (typeof record?.refresh_token === "string" && record.refresh_token.trim()) {
            try {
              localStorage.setItem(REFRESH_TOKEN_KEY, record.refresh_token.trim());
            } catch {
              /* private mode */
            }
          }
          return token;
        }
      }
    } catch {
      /* fall through to a stored access token */
    }
  }
  return readBynderToken();
}

/** Copy Compact View's token into our key, including when the picker popup sets it. */
export function rememberBynderSession(onToken: () => void): () => void {
  if (hasBynderSession()) onToken();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COMPACT_VIEW_TOKEN_KEY && event.key !== TOKEN_KEY && event.key !== REFRESH_TOKEN_KEY) return;
    if (event.key === COMPACT_VIEW_TOKEN_KEY) rememberToken(event.newValue);
    if (hasBynderSession()) onToken();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function pair(size: { width?: number; height?: number }): OriginalPixelSize | undefined {
  if (!size.width || !size.height) return undefined;
  return { width: Math.round(size.width), height: Math.round(size.height) };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * Original file pixels from a Bynder asset node. `files.original` wins, then the
 * asset's own `width` / `height` (the untransformed file, not a DAT derivative).
 */
export function originalPixelSizeFromNode(node: unknown): OriginalPixelSize | undefined {
  return pair(assetPixelSize(node));
}

/** Image ids (and a different mobile file) that do not yet have both original dimensions. */
export function missingOriginalSizeIds(assets: SavedBynderAsset[] | undefined): string[] {
  const ids: string[] = [];
  const push = (asset?: { id?: string; type?: string; name?: string; url?: string; originalAssetWidth?: number; originalAssetHeight?: number }) => {
    if (!asset?.id || isDocumentAsset(asset) || isVideoAsset(asset)) return;
    if (asset.originalAssetWidth && asset.originalAssetHeight) return;
    ids.push(asset.id);
  };
  for (const asset of assets ?? []) {
    push(asset);
    if (asset.mobile?.id) push(asset.mobile);
  }
  return [...new Set(ids)];
}

function lookup(sizes: ReadonlyMap<string, OriginalPixelSize>, id?: string): OriginalPixelSize | undefined {
  if (!id) return undefined;
  return sizes.get(id) ?? sizes.get(id.toUpperCase()) ?? sizes.get(id.toLowerCase());
}

/** Writes original pixels onto assets that do not have them yet. Undefined when nothing changed. */
export function mergeOriginalSizes(
  assets: SavedBynderAsset[] | undefined,
  sizes: ReadonlyMap<string, OriginalPixelSize>
): SavedBynderAsset[] | undefined {
  if (!assets?.length || !sizes.size) return undefined;
  let changed = false;
  const next = assets.map((asset) => {
    let current = asset;
    const size = lookup(sizes, asset.id);
    if (size && (!asset.originalAssetWidth || !asset.originalAssetHeight)) {
      changed = true;
      current = {
        ...current,
        originalAssetWidth: size.width,
        originalAssetHeight: size.height,
        aspectRatio: aspectRatioFromPixels(size.width, size.height) ?? current.aspectRatio,
      };
    }
    const mobileSize = lookup(sizes, current.mobile?.id);
    if (current.mobile?.id && mobileSize && (!current.mobile.originalAssetWidth || !current.mobile.originalAssetHeight)) {
      changed = true;
      current = {
        ...current,
        mobile: {
          ...current.mobile,
          originalAssetWidth: mobileSize.width,
          originalAssetHeight: mobileSize.height,
          aspectRatio: aspectRatioFromPixels(mobileSize.width, mobileSize.height) ?? current.mobile.aspectRatio,
        },
      };
    }
    return current;
  });
  return changed ? next : undefined;
}

/**
 * Asks Bynder for the original file's width and height. The transform URL is a
 * derivative, so it is not measured. Requires a Compact View login on this origin.
 */
export async function fetchOriginalPixelSizes(
  portalUrl: string,
  mediaIds: readonly string[]
): Promise<Map<string, OriginalPixelSize>> {
  const found = new Map<string, OriginalPixelSize>();
  const token = await bynderAccessToken(portalUrl);
  const ids = [...new Set(mediaIds.map((id) => id.trim()).filter(Boolean))];
  if (!token || !portalUrl.trim() || !ids.length) return found;

  let json: unknown;
  try {
    const response = await fetch(`${portalOrigin(portalUrl)}/v7/api/graphql`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `query OriginalAssetSize($ids: [ID!]!) {
          nodes(ids: $ids) {
            __typename
            ... on Asset {
              databaseId
              files
              ... on Image {
                width
                height
              }
            }
          }
        }`,
        variables: { ids: ids.map((id) => compactViewGraphqlId(id)) },
      }),
    });
    if (!response.ok) return found;
    json = await response.json();
  } catch {
    return found;
  }

  const nodes = asRecord(asRecord(json)?.data)?.nodes;
  if (!Array.isArray(nodes)) return found;
  nodes.forEach((node, index) => {
    const size = originalPixelSizeFromNode(node);
    if (!size) return;
    const databaseId = asRecord(node)?.databaseId;
    const key = typeof databaseId === "string" && databaseId.trim() ? databaseId.trim() : ids[index];
    if (key) found.set(key, size);
    const asked = ids[index];
    if (asked) found.set(asked, size);
  });
  return found;
}
