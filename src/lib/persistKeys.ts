/**
 * Contentstack JSON custom fields cap payloads at 10KB. The official Bynder
 * app lets authors pick a large "Bynder Keys" set, including the full `files`
 * derivative map — that is what blows the limit once DAT URLs and crops are
 * also stored.
 *
 * This app always persists a slim required set. Optional keys are extra
 * scalars/lists the author can opt into from App Config.
 */

export const REQUIRED_PERSIST_KEYS = ["id", "name", "transformBaseUrl"] as const;

export const OPTIONAL_PERSIST_KEYS = [
  "description",
  "originalUrl",
  "publishedAt",
  "updatedAt",
  "tags",
] as const;

export type RequiredPersistKey = (typeof REQUIRED_PERSIST_KEYS)[number];
export type OptionalPersistKey = (typeof OPTIONAL_PERSIST_KEYS)[number];
export type PersistAssetKey = RequiredPersistKey | OptionalPersistKey;

export const SKIPPED_OOTB_KEYS: { key: string; reason: string }[] = [
  { key: "databaseId", reason: "Same media UUID as id. Compact View selectedAssets uses this one value." },
  { key: "GraphQL id", reason: "Long base64. Compact View encodes the media UUID itself." },
  { key: "type", reason: "Authoring does not need IMAGE/VIDEO on the JSON; Compact View already filtered the pick." },
  { key: "width / height / fileSize / fileType", reason: "Crop sizes live on transform. DAT format is on transform too." },
  { key: "extensions", reason: "Not used for picker restore, crop, DAT, or delivery." },
  { key: "previewUrls", reason: "Duplicates webImage and can be a long URL list." },
  { key: "_typename / __typename", reason: "GraphQL noise; not read by this field." },
  { key: "files (full map)", reason: "Only transformBaseUrl is kept. webImage is stored at the asset root when DAT is unavailable." },
  { key: "derivatives", reason: "Covered by webImage when DAT is off." },
  { key: "metaproperties / textMetaproperties", reason: "Nested DAM metadata, often large." },
];

const OPTIONAL_SET = new Set<string>(OPTIONAL_PERSIST_KEYS);

export function resolvePersistKeys(selected?: unknown): PersistAssetKey[] {
  const keys: PersistAssetKey[] = [...REQUIRED_PERSIST_KEYS];
  if (!Array.isArray(selected)) return keys;
  for (const item of selected) {
    if (typeof item === "string" && OPTIONAL_SET.has(item) && !keys.includes(item as PersistAssetKey)) {
      keys.push(item as OptionalPersistKey);
    }
  }
  return keys;
}

export function optionalKeySelected(selected: unknown, key: OptionalPersistKey): boolean {
  return Array.isArray(selected) && selected.includes(key);
}
