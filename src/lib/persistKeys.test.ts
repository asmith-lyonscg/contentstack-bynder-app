import { describe, expect, it } from "vitest";
import { resolvePersistKeys, REQUIRED_PERSIST_KEYS } from "./persistKeys";

describe("resolvePersistKeys", () => {
  it("always includes the slim required set", () => {
    expect(resolvePersistKeys()).toEqual([...REQUIRED_PERSIST_KEYS]);
    expect(resolvePersistKeys(["files", "metaproperties", "description"])).toEqual([
      ...REQUIRED_PERSIST_KEYS,
      "description",
    ]);
  });
});
