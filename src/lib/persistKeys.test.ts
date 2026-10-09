import { describe, expect, it } from "vitest";
import { resolvePersistPolicy, REQUIRED_PERSIST_KEYS } from "./persistKeys";

describe("REQUIRED_PERSIST_KEYS", () => {
  it("is the fixed slim identity set", () => {
    expect([...REQUIRED_PERSIST_KEYS]).toEqual(["id", "name", "type", "transformBaseUrl"]);
  });
});

describe("resolvePersistPolicy", () => {
  it("defaults to keeping name and webImage", () => {
    expect(resolvePersistPolicy({}, {})).toEqual({ omitWebImage: false, omitName: false });
  });

  it("suppressMetadata drops name and webImage", () => {
    expect(resolvePersistPolicy({ suppressMetadata: true }, {})).toEqual({
      omitWebImage: true,
      omitName: true,
    });
  });
});
