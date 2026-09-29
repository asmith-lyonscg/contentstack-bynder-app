/**
 * Contentstack JSON custom fields cap payloads at 10KB. The official Bynder
 * app lets authors pick a large "Bynder Keys" set, including the full `files`
 * derivative map — that is what blows the limit once DAT URLs and crops are
 * also stored.
 *
 * This app always persists a slim required set. Optional keys are extra
 * scalars/lists the author can opt into from App Config.
 */

export const REQUIRED_PERSIST_KEYS = ["id", "name", "type", "transformBaseUrl"] as const;

export const OPTIONAL_PERSIST_KEYS = [
  "description",
  "originalUrl",
  "publishedAt",
  "updatedAt",
  "tags",
  "fileType",
  "fileSize",
  "width",
  "height",
] as const;

/** Field Config Parameter flags. Each one opts that Bynder value into the saved JSON. */
export const INCLUDE_FIELD_FLAGS = {
  includeFieldDescription: "description",
  includeFieldOriginalUrl: "originalUrl",
  includeFieldPublishedAt: "publishedAt",
  includeFieldUpdatedAt: "updatedAt",
  includeFieldTags: "tags",
  includeFieldFileType: "fileType",
  includeFieldFileSize: "fileSize",
  includeFieldWidth: "width",
  includeFieldHeight: "height",
} as const satisfies Record<string, OptionalPersistKey>;

export type RequiredPersistKey = (typeof REQUIRED_PERSIST_KEYS)[number];
export type OptionalPersistKey = (typeof OPTIONAL_PERSIST_KEYS)[number];
export type PersistAssetKey = RequiredPersistKey | OptionalPersistKey;

export const SKIPPED_OOTB_KEYS: { key: string; reason: string }[] = [
  { key: "databaseId", reason: "Same media UUID as id. Compact View selectedAssets uses this one value." },
  { key: "GraphQL id", reason: "Long base64. Compact View encodes the media UUID itself." },
  {
    key: "width / height / fileSize / fileType",
    reason: "Original file pixels and type. Saved only when includeFieldWidth, includeFieldHeight, includeFieldFileSize, or includeFieldFileType is true. Crop size stays on transform.",
  },
  { key: "extensions", reason: "Read once to tell a PDF from its WebP preview, then dropped. type DOCUMENT is what we save." },
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

const SUPPRESSED_PERSIST_KEYS: PersistAssetKey[] = ["id", "type", "transformBaseUrl"];

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

function applyIncludeFlags(
  keys: PersistAssetKey[],
  record: Record<string, unknown> | null,
  onlyFlags?: ReadonlySet<string>
): PersistAssetKey[] {
  let next = keys;
  for (const [flag, key] of Object.entries(INCLUDE_FIELD_FLAGS) as [string, OptionalPersistKey][]) {
    if (onlyFlags && !onlyFlags.has(flag)) continue;
    const enabled = configFlag(record, flag);
    if (enabled === true && !next.includes(key)) next = [...next, key];
    if (enabled === false) next = next.filter((item) => item !== key);
  }
  return next;
}

/** Field config wins. `suppressMetadata` keeps only id, type, and the DAT base URL. */
export function resolvePersistPolicy(
  fieldConfig: unknown,
  appConfig: unknown
): { keys: PersistAssetKey[]; omitWebImage: boolean } {
  const field = configRecord(fieldConfig);
  const app = configRecord(appConfig);
  const suppress = configFlag(field, "suppressMetadata") ?? configFlag(app, "suppressMetadata") ?? false;
  if (suppress) return { keys: SUPPRESSED_PERSIST_KEYS, omitWebImage: true };
  const fieldOwnsList = Boolean(field && "persistAssetKeys" in field);
  const selected = fieldOwnsList ? field?.persistAssetKeys : app?.persistAssetKeys;
  const fieldFlags = new Set(
    Object.keys(INCLUDE_FIELD_FLAGS).filter((flag) => configFlag(field, flag) !== undefined)
  );
  const base = resolvePersistKeys(selected);
  const withAppFlags = fieldOwnsList ? base : applyIncludeFlags(base, app);
  const keys = applyIncludeFlags(
    withAppFlags,
    field,
    fieldFlags.size ? fieldFlags : undefined
  );
  return { keys, omitWebImage: false };
}

export function includeFlagFor(key: OptionalPersistKey): string {
  const found = (Object.entries(INCLUDE_FIELD_FLAGS) as [string, OptionalPersistKey][]).find(
    ([, value]) => value === key
  );
  return found?.[0] ?? key;
}

export function optionalKeySelected(selected: unknown, key: OptionalPersistKey): boolean {
  return Array.isArray(selected) && selected.includes(key);
}
