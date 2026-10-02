import { describe, expect, it } from "vitest";
import { resolvePersistKeys, resolvePersistPolicy, REQUIRED_PERSIST_KEYS } from "./persistKeys";

describe("resolvePersistKeys", () => {
  it("always includes the slim required set", () => {
    expect(resolvePersistKeys()).toEqual([...REQUIRED_PERSIST_KEYS]);
    expect(resolvePersistKeys(["files", "metaproperties", "description"])).toEqual([
      ...REQUIRED_PERSIST_KEYS,
      "description",
    ]);
  });
});

describe("resolvePersistPolicy", () => {
  it("lets field config suppress Bynder metadata", () => {
    expect(resolvePersistPolicy({ suppressMetadata: true }, { persistAssetKeys: ["description"] })).toEqual({
      keys: ["id", "type", "transformBaseUrl"],
      omitWebImage: true,
    });
    expect(resolvePersistPolicy({ persistAssetKeys: ["tags"] }, { persistAssetKeys: ["description"] }).keys).toEqual([
      ...REQUIRED_PERSIST_KEYS,
      "tags",
    ]);
  });
});
