import { describe, expect, it } from "vitest";
import { applyCropConfig, resolveBynderFieldUid, resolveBynderPortalUrl, resolveCompactViewConfig, resolveCropConfig, resolveEnableDat, resolveSiblingAsset } from "./fieldConfig";

describe("resolveBynderFieldUid", () => {
  it("prefers per-field config over app config", () => {
    expect(
      resolveBynderFieldUid({ bynderFieldUid: "hero_image" }, { bynderFieldUid: "fallback" })
    ).toBe("hero_image");
  });

  it("reads nested custom_settings and falls back to app config", () => {
    expect(
      resolveBynderFieldUid({ custom_settings: { bynderFieldUid: " grouped.hero " } }, {})
    ).toBe("grouped.hero");
    expect(resolveBynderFieldUid({}, { bynderFieldUid: "og_image" })).toBe("og_image");
    expect(resolveBynderFieldUid({}, {})).toBeUndefined();
  });
});

describe("resolveBynderPortalUrl", () => {
  it("strips protocol and trailing slash, and prefers field config", () => {
    expect(resolveBynderPortalUrl({ bynderPortalUrl: "https://acme.getbynder.com/" }, {})).toBe(
      "acme.getbynder.com"
    );
    expect(
      resolveBynderPortalUrl(
        { bynderPortalUrl: "field.getbynder.com" },
        { bynderPortalUrl: "https://app.getbynder.com" }
      )
    ).toBe("field.getbynder.com");
    expect(resolveBynderPortalUrl({}, { bynderPortalUrl: "https://app.getbynder.com" })).toBe(
      "app.getbynder.com"
    );
    expect(resolveBynderPortalUrl({}, {})).toBeUndefined();
  });
});

describe("resolveCompactViewConfig", () => {
  it("defaults to SingleSelectFile and en_US", () => {
    expect(resolveCompactViewConfig({}, { bynderPortalUrl: "acme.getbynder.com" })).toEqual({
      portalUrl: "acme.getbynder.com",
      language: "en_US",
      mode: "SingleSelectFile",
    });
  });

  it("accepts SingleSelect and language overrides from field config", () => {
    expect(
      resolveCompactViewConfig(
        { compactMode: "SingleSelect", compactLanguage: "nl_NL" },
        { bynderPortalUrl: "acme.getbynder.com", compactMode: "SingleSelectFile" }
      )
    ).toMatchObject({
      portalUrl: "acme.getbynder.com",
      language: "nl_NL",
      mode: "SingleSelect",
    });
  });
});

describe("resolveEnableDat", () => {
  it("defaults to off", () => {
    expect(resolveEnableDat({}, {})).toBe(false);
  });

  it("prefers field config over app config", () => {
    expect(resolveEnableDat({ enableDat: false }, { enableDat: true })).toBe(false);
    expect(resolveEnableDat({ enableDat: true }, { enableDat: false })).toBe(true);
    expect(resolveEnableDat({}, { enableDat: true })).toBe(true);
    expect(resolveEnableDat({ custom_settings: { enableDat: "true" } }, {})).toBe(true);
  });
});

describe("resolveCropConfig", () => {
  it("merges presets and locks with field config winning", () => {
    expect(
      resolveCropConfig(
        { aspect: "1:1", lockAspect: true, width: 800 },
        { aspect: "16:9", height: 675, lockWidth: true }
      )
    ).toEqual({
      aspect: "1:1",
      width: 800,
      height: 675,
      lockAspect: true,
      lockWidth: true,
      lockHeight: false,
      aspectPresets: ["16:9", "1:1", "4:3", "4:5"],
    });
  });

  it("uses configured aspect presets when provided", () => {
    expect(resolveCropConfig({ aspectPresets: ["21:9", "1:1"] }, {}).aspectPresets).toEqual([
      "21:9",
      "1:1",
    ]);
    expect(resolveCropConfig({ aspectPresets: "3:2, 9:16" }, {}).aspectPresets).toEqual([
      "3:2",
      "9:16",
    ]);
    expect(
      resolveCropConfig({ aspectPresets: ["4:5"] }, { aspectPresets: ["21:9"] }).aspectPresets
    ).toEqual(["4:5"]);
    expect(resolveCropConfig({}, {}).aspectPresets).toEqual(["16:9", "1:1", "4:3", "4:5"]);
  });
});

describe("applyCropConfig", () => {
  it("applies unlocked presets only in defaults mode", () => {
    const current = { operation: "fill" as const, width: 1200, height: 675, aspect: "16:9" };
    const crop = {
      aspect: "1:1",
      width: 600,
      lockAspect: false,
      lockWidth: false,
      lockHeight: false,
      aspectPresets: ["16:9", "1:1"],
    };
    expect(applyCropConfig(current, crop, "locks").aspect).toBe("16:9");
    expect(applyCropConfig(current, crop, "defaults")).toMatchObject({
      aspect: "1:1",
      width: 600,
      height: 600,
    });
  });

  it("forces locked values", () => {
    const current = { operation: "fill" as const, width: 1200, height: 675, aspect: "16:9" };
    expect(
      applyCropConfig(current, {
        aspect: "4:5",
        lockAspect: true,
        lockWidth: false,
        lockHeight: false,
        aspectPresets: ["16:9", "1:1", "4:3", "4:5"],
      })
    ).toMatchObject({ aspect: "4:5", width: 1200, height: 1500 });
  });
});

describe("resolveSiblingAsset", () => {
  const image = {
    id: "a",
    files: { webImage: { url: "https://cdn.example/a.jpg" } },
  };
  const current = {
    id: "a",
    sourceUrl: "https://cdn.example/a.jpg",
  };

  it("reads a dotted path from the live entry", () => {
    const parsed = resolveSiblingAsset({
      uid: "hero_group.hero_image",
      liveEntry: { hero_group: { hero_image: [image] } },
    });
    expect(parsed).toMatchObject({ type: "apply", asset: { id: "a", sourceUrl: "https://cdn.example/a.jpg" } });
  });

  it("keeps a visible image when live entry is empty", () => {
    expect(
      resolveSiblingAsset({
        uid: "hero_image",
        liveEntry: { hero_image: [] },
        fieldData: [image],
        current,
      })
    ).toMatchObject({ type: "apply", asset: { id: "a" } });
  });

  it("keeps a visible image when both snapshots look empty", () => {
    expect(
      resolveSiblingAsset({
        uid: "hero_image",
        liveEntry: { hero_image: [] },
        fieldData: [],
        current,
      })
    ).toEqual({ type: "keep" });
  });

  it("does not clear during our own setData even if the sibling event is empty", () => {
    expect(
      resolveSiblingAsset({
        uid: "hero_image",
        fieldEventData: [],
        fieldData: [image],
        writingSelf: true,
        current,
      })
    ).toMatchObject({ type: "apply", asset: { id: "a" } });
  });

  it("trusts a direct sibling field onChange payload", () => {
    expect(
      resolveSiblingAsset({
        uid: "hero_image",
        fieldEventData: [],
        current,
      })
    ).toEqual({ type: "clear" });
  });

  it("falls back to field data when the live entry has no path", () => {
    expect(
      resolveSiblingAsset({
        uid: "hero_image",
        liveEntry: { title: "x" },
        fieldData: [image],
      })
    ).toMatchObject({ type: "apply", asset: { id: "a" } });
  });

  it("clears only on first load when there is no current asset", () => {
    expect(
      resolveSiblingAsset({
        uid: "hero_image",
        liveEntry: { hero_image: [] },
        fieldData: [],
      })
    ).toEqual({ type: "clear" });
  });
});
