/**
 * Contentstack JSON custom fields cap payloads at 10KB. This app always
 * persists a slim identity set plus crop / DAT fields — never the full Bynder
 * Compact View payload. Optional DAM metadata is not stored; delivery can
 * re-fetch Bynder by asset id.
 */

export const REQUIRED_PERSIST_KEYS = ["id", "name", "type", "transformBaseUrl"] as const;

export type PersistAssetKey = (typeof REQUIRED_PERSIST_KEYS)[number];

export const SKIPPED_OOTB_KEYS: { key: string; reason: string }[] = [
  { key: "databaseId", reason: "Same media UUID as id. Compact View selectedAssets uses this one value." },
  { key: "GraphQL id", reason: "Long base64. Compact View encodes the media UUID itself." },
  {
    key: "width / height / fileSize / fileType",
    reason: "Original file pixels and type. Delivery can re-fetch Bynder. Crop size stays on transform.",
  },
  { key: "description / tags / dates / originalUrl", reason: "DAM metadata; re-fetch by id at render time." },
  { key: "extensions", reason: "Read once to tell a PDF from its WebP preview, then dropped. type DOCUMENT is what we save." },
  { key: "previewUrls", reason: "Duplicates webImage and can be a long URL list." },
  { key: "_typename / __typename", reason: "GraphQL noise; not read by this field." },
  { key: "files (full map)", reason: "Only transformBaseUrl is kept. webImage is stored at the asset root when DAT is unavailable." },
  { key: "derivatives", reason: "Covered by webImage when DAT is off." },
  { key: "metaproperties / textMetaproperties", reason: "Nested DAM metadata, often large." },
];

function configRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function configFlag(record: Record<string, unknown> | null, key: string): boolean | undefined {
  const value = record?.[key];
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

/** Field config wins. `suppressMetadata` also drops `webImage` / `name` for the tightest payload. */
export function resolvePersistPolicy(
  fieldConfig: unknown,
  appConfig: unknown
): { omitWebImage: boolean; omitName: boolean } {
  const field = configRecord(fieldConfig);
  const app = configRecord(appConfig);
  const suppress = configFlag(field, "suppressMetadata") ?? configFlag(app, "suppressMetadata") ?? false;
  if (suppress) return { omitWebImage: true, omitName: true };
  return { omitWebImage: false, omitName: false };
}
