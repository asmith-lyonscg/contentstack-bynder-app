import { compactAssetIds } from "./parseAsset";
import type { ParsedBynderAsset } from "../types";

export interface CompactPreselectAsset {
  mediaId: string;
  name?: string;
  thumbnail?: string;
  type?: string;
}

/** Compact View 6.0.1: `btoa("(Asset_id " + mediaUUID + ")")`. */
export function compactViewGraphqlId(mediaId: string): string {
  return btoa(`(Asset_id ${mediaId})`);
}

export function compactViewTypename(type?: string): "Image" | "Video" | "Audio" | "Document" | "Archive" {
  const raw = type?.trim().toUpperCase();
  if (raw === "VIDEO") return "Video";
  if (raw === "AUDIO") return "Audio";
  if (raw === "DOCUMENT") return "Document";
  if (raw === "ARCHIVE") return "Archive";
  return "Image";
}

/** Shape Compact View’s footer / grid selection expects. */
export function compactViewPreselectAsset(asset: CompactPreselectAsset) {
  return {
    __typename: compactViewTypename(asset.type),
    id: compactViewGraphqlId(asset.mediaId),
    databaseId: asset.mediaId,
    name: asset.name?.trim() || asset.mediaId,
    derivatives: { thumbnail: asset.thumbnail ?? "" },
    extensions: [] as string[],
    files: {},
    url: asset.thumbnail,
  };
}

export function compactPreselectFromParsed(assets: ParsedBynderAsset[]): CompactPreselectAsset[] {
  const seen = new Set<string>();
  const preselect: CompactPreselectAsset[] = [];
  for (const asset of assets) {
    const mediaId = compactAssetIds([asset])[0];
    if (!mediaId || seen.has(mediaId)) continue;
    seen.add(mediaId);
    preselect.push({
      mediaId,
      name: asset.name,
      thumbnail: asset.sourceUrl,
      type: asset.type,
    });
  }
  return preselect;
}

/**
 * Compact View treats any GraphQL `errors` key as a total failure, even when
 * `data.nodes` has assets. Search uses a different query, so the grid can work
 * while preselect stays empty.
 */
export function keepGraphqlNodesDespiteErrors<T>(json: T): T {
  if (!json || typeof json !== "object") return json;
  const record = json as T & { errors?: unknown; data?: { nodes?: unknown } };
  if (!Array.isArray(record.errors)) return json;
  const nodes = record.data?.nodes;
  if (!Array.isArray(nodes) || !nodes.some(Boolean)) return json;
  const { errors: _errors, ...rest } = record;
  return rest as T;
}
