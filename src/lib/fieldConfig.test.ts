import { describe, expect, it } from "vitest";
import { applyCropConfig, cropPreset, readFieldConfig, resolveBynderFieldUid, resolveBynderPortalUrl, resolveCompactViewConfig, resolveCropConfig, resolveEnableDat, resolveSiblingAsset, seedAssetCrop } from "./fieldConfig";

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
  it("defaults to SingleSelect, en_US, and image plus video", () => {
    expect(resolveCompactViewConfig({}, { bynderPortalUrl: "acme.getbynder.com" })).toMatchObject({
      portalUrl: "acme.getbynder.com",
      language: "en_US",
      mode: "SingleSelect",
      loginBypass: false,
      assetTypes: ["IMAGE", "VIDEO"],
      maxLimit: 1,
    });
    expect(resolveCompactViewConfig({}, { bynderPortalUrl: "acme.getbynder.com" }).assetFilter).toBeUndefined();
  });

  it("defaults showToolbar on when a custom assetFilter is present", () => {
    expect(
      resolveCompactViewConfig(
        { compactViewConfig: { assetFilter: { predefinedTagNames: ["hero"] } } },
        { bynderPortalUrl: "acme.getbynder.com" }
      ).assetFilter
    ).toMatchObject({ predefinedTagNames: ["hero"], showToolbar: true });
    expect(
      resolveCompactViewConfig(
        { compactViewConfig: { assetFilter: { showToolbar: false, predefinedAssetType: ["IMAGE"] } } },
        { bynderPortalUrl: "acme.getbynder.com" }
      ).assetFilter
    ).toMatchObject({ showToolbar: false, predefinedAssetType: ["IMAGE"] });
  });

  it("ignores compactMode and uses maxNumberOfAssets for Single vs Multi", () => {
    expect(
      resolveCompactViewConfig(
        { compactLanguage: "nl_NL", loginBypass: true },
        { bynderPortalUrl: "acme.getbynder.com", compactMode: "SingleSelectFile" }
      )
    ).toMatchObject({
      portalUrl: "acme.getbynder.com",
      language: "nl_NL",
      mode: "SingleSelect",
      loginBypass: true,
    });
    expect(
      resolveCompactViewConfig(
        { compactMode: "SingleSelectFile", compactViewConfig: { mode: "SingleSelectFile" } },
        { bynderPortalUrl: "acme.getbynder.com", compactMode: "MultiSelect" }
      ).mode
    ).toBe("SingleSelect");
  });

  it("reads compactViewConfig with camelCase keys, and still accepts compact_view_options", () => {
    expect(
      resolveCompactViewConfig(
        {
          compactViewConfig: {
            mode: "MultiSelect",
            language: "de_DE",
            assetTypes: ["IMAGE"],
            defaultSearchTerm: "hero",
            assetFilter: { showToolbar: true, predefinedTagNames: ["bottle"] },
          },
        },
        { bynderPortalUrl: "acme.getbynder.com" }
      )
    ).toMatchObject({
      mode: "SingleSelect",
      language: "de_DE",
      defaultSearchTerm: "hero",
      assetTypes: ["IMAGE"],
      assetFilter: {
        showToolbar: true,
        predefinedTagNames: ["bottle"],
      },
    });
  });

  it("reads compact_view_options, DAT presets, max_limit, and MultiSelect", () => {
    expect(
      resolveCompactViewConfig(
        {
          advanced: { max_limit: 4 },
          custom_settings: {
            dat_settings: {
              options: ["webImage", "mini"],
              default: "webImage",
              transformation_options: { crop: "io=transform:crop,width:300" },
            },
            compact_view_options: {
              defaultSearchTerm: "hero",
              hideSwitch: true,
              assetFilter: {
                showToolbar: true,
                predefinedAssetType: ["IMAGE"],
                predefinedTagNames: ["bottle"],
              },
            },
          },
        },
        { bynderPortalUrl: "acme.getbynder.com" }
      )
    ).toMatchObject({
      mode: "MultiSelect",
      maxLimit: 4,
      defaultSearchTerm: "hero",
      hideSwitch: true,
      defaultImageDerivativeName: "webImage",
      assetFilter: {
        showToolbar: true,
        predefinedAssetType: ["IMAGE"],
        predefinedTagNames: ["bottle"],
      },
      datPresets: {
        options: ["webImage", "mini"],
        default: "webImage",
        transformationOptions: { crop: "io=transform:crop,width:300" },
      },
    });
  });

  it("reads max_limit from JSON strings and Contentstack schema wrappers", () => {
    expect(
      resolveCompactViewConfig('{"advanced":{"max_limit":4}}', {
        bynderPortalUrl: "acme.getbynder.com",
      }).maxLimit
    ).toBe(4);
    expect(
      resolveCompactViewConfig(
        {
          data_type: "json",
          uid: "hero",
          field_metadata: {},
          config: { advanced: { max_limit: 4 } },
        },
        { bynderPortalUrl: "acme.getbynder.com" }
      ).maxLimit
    ).toBe(4);
    expect(
      resolveCompactViewConfig(
        { custom_settings: { advanced: { max_limit: "4" } } },
        { bynderPortalUrl: "acme.getbynder.com" }
      ).maxLimit
    ).toBe(4);
  });

  it("reads maxNumberOfAssets and infers MultiSelect when the cap is above 1", () => {
    expect(
      resolveCompactViewConfig(
        { maxNumberOfAssets: 3 },
        { bynderPortalUrl: "acme.getbynder.com" }
      )
    ).toMatchObject({ maxLimit: 3, mode: "MultiSelect" });
    expect(
      resolveCompactViewConfig(
        { maxNumberOfAssets: 1 },
        { bynderPortalUrl: "acme.getbynder.com" }
      )
    ).toMatchObject({ maxLimit: 1, mode: "SingleSelect" });
    expect(
      resolveCompactViewConfig(
        { maxNumberOfAssets: 3, compactMode: "SingleSelectFile" },
        { bynderPortalUrl: "acme.getbynder.com" }
      )
    ).toMatchObject({ maxLimit: 3, mode: "MultiSelect" });
  });
});

describe("readFieldConfig", () => {
  it("unwraps Config Parameter from the Custom Field location and schema", () => {
    expect(
      readFieldConfig({
        fieldConfig: { data_type: "json", uid: "hero", field_metadata: {}, config: { advanced: { max_limit: 4 } } },
      })
    ).toEqual({ advanced: { max_limit: 4 } });
    expect(
      readFieldConfig({
        field: { schema: { field_metadata: { config: '{"advanced":{"max_limit":4}}' } } },
      })
    ).toEqual({ advanced: { max_limit: 4 } });
  });
});

describe("resolveEnableDat", () => {
  it("defaults to on", () => {
    expect(resolveEnableDat({}, {})).toBe(true);
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
      format: undefined,
      lockAspect: true,
      lockWidth: true,
      lockHeight: false,
      lockFormat: false,
      hideFormat: true,
      showOperation: false,
      showAspect: false,
      showQuality: false,
      showAdvancedQuery: false,
      showDatPreset: false,
      aspectPresets: ["16:9", "1:1", "4:3", "4:5"],
      desktopMobileMode: true,
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

  it("reads DAT file type default, hide, and lock from field config", () => {
    expect(resolveCropConfig({}, {}).format).toBeUndefined();
    expect(resolveCropConfig({}, {}).hideFormat).toBe(true);
    expect(resolveCropConfig({ showFormat: true }, {}).hideFormat).toBe(false);
    expect(
      resolveCropConfig({ format: "jpg", hideFormat: true }, {})
    ).toMatchObject({ format: "jpg", hideFormat: true, lockFormat: false });
    expect(
      resolveCropConfig({ fileType: "JPEG", hideFileType: true }, { format: "png" })
    ).toMatchObject({ format: "jpg", hideFormat: true });
    expect(
      resolveCropConfig({ showFormat: false, lockFormat: true }, {})
    ).toMatchObject({ hideFormat: true, lockFormat: true });
    expect(resolveCropConfig({ format: "webp" }, { format: "png" }).format).toBe("webp");
    expect(resolveCropConfig({ showOperation: true, showAspect: true }, {})).toMatchObject({
      showOperation: true,
      showAspect: true,
      showQuality: false,
    });
    expect(resolveCropConfig({}, {}).desktopMobileMode).toBe(true);
    expect(resolveCropConfig({ desktopMobileMode: false }, {}).desktopMobileMode).toBe(false);
    expect(resolveCropConfig({ desktopMobile: false }, {}).desktopMobileMode).toBe(false);
  });

  it("reads per-viewport aspect, width, height, and locks in desktopMobileMode", () => {
    expect(
      resolveCropConfig(
        {
          desktopMobileMode: true,
          aspect: { desktop: "16:9", mobile: "9:16" },
          width: { desktop: 1200, mobile: 390 },
          height: { desktop: 675, mobile: 844 },
          lockAspect: { desktop: true, mobile: false },
          lockWidth: true,
        },
        {}
      )
    ).toMatchObject({
      desktopMobileMode: true,
      aspect: "16:9",
      mobileAspect: "9:16",
      width: 1200,
      mobileWidth: 390,
      height: 675,
      mobileHeight: 844,
      lockAspect: true,
      lockAspectMobile: false,
      lockWidth: true,
    });
    expect(resolveCropConfig({ desktopMobileMode: true, aspect: "1:1", width: 800 }, {}).mobileAspect).toBeUndefined();
    const single = resolveCropConfig(
      { desktopMobileMode: false, aspect: { desktop: "16:9", mobile: "9:16" }, width: { desktop: 1200, mobile: 390 } },
      {}
    );
    expect(single).toMatchObject({ desktopMobileMode: false, aspect: "16:9", width: 1200 });
    expect(single.mobileAspect).toBeUndefined();
    expect(single.mobileWidth).toBeUndefined();
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
      lockFormat: false,
      hideFormat: false,
      showOperation: false,
      showAspect: false,
      showQuality: false,
      showAdvancedQuery: false,
      showDatPreset: false,
      aspectPresets: ["16:9", "1:1"],
    };
    expect(applyCropConfig(current, crop, "locks").aspect).toBe("16:9");
    expect(applyCropConfig(current, crop, "defaults")).toMatchObject({
      aspect: "1:1",
      width: 600,
      height: 600,
    });
  });

  it("applies DAT file type on new fields and forces it when hidden or locked", () => {
    const current = { operation: "fill" as const, width: 1200, height: 675, aspect: "16:9", format: "webp" as const };
    const crop = {
      format: "png" as const,
      lockAspect: false,
      lockWidth: false,
      lockHeight: false,
      lockFormat: false,
      hideFormat: false,
      showOperation: false,
      showAspect: false,
      showQuality: false,
      showAdvancedQuery: false,
      showDatPreset: false,
      aspectPresets: ["16:9"],
    };
    expect(applyCropConfig(current, crop, "locks").format).toBe("webp");
    expect(applyCropConfig(current, crop, "defaults").format).toBe("png");
    expect(applyCropConfig(current, { ...crop, hideFormat: true }).format).toBe("png");
    expect(applyCropConfig(current, { ...crop, format: undefined, hideFormat: true }).format).toBe("webp");
    expect(applyCropConfig(current, { ...crop, lockFormat: true, format: "jpg" }).format).toBe("jpg");
  });

  it("forces locked values", () => {
    const current = { operation: "fill" as const, width: 1200, height: 675, aspect: "16:9" };
    expect(
      applyCropConfig(current, {
        aspect: "4:5",
        lockAspect: true,
        lockWidth: false,
        lockHeight: false,
        lockFormat: false,
        hideFormat: false,
        showOperation: false,
        showAspect: false,
        showQuality: false,
        showAdvancedQuery: false,
        showDatPreset: false,
        aspectPresets: ["16:9", "1:1", "4:3", "4:5"],
      })
    ).toMatchObject({ aspect: "4:5", width: 1200, height: 1500 });
  });

  it("applies desktop vs mobile presets and locks", () => {
    const current = { operation: "fill" as const, width: 800, height: 800, aspect: "1:1" };
    const crop = resolveCropConfig(
      {
        desktopMobileMode: true,
        aspect: { desktop: "16:9", mobile: "9:16" },
        width: { desktop: 1200, mobile: 390 },
        lockAspect: true,
        lockWidth: true,
      },
      {}
    );
    expect(applyCropConfig(current, crop, "defaults", "desktop")).toMatchObject({
      aspect: "16:9",
      width: 1200,
      height: 675,
    });
    expect(applyCropConfig(current, crop, "defaults", "mobile")).toMatchObject({
      aspect: "9:16",
      width: 390,
      height: 693,
    });
    expect(cropPreset(crop, "mobile")).toMatchObject({ aspect: "9:16", width: 390, lockAspect: true });
    const seeded = seedAssetCrop(crop);
    expect(seeded.transform).toMatchObject({ aspect: "16:9", width: 1200, height: 675 });
    expect(seeded.mobile?.transform).toMatchObject({ aspect: "9:16", width: 390, height: 693 });
    expect(seeded.mobile).toBeDefined();
    expect(seeded).not.toHaveProperty("mobileLinked");
  });

  it("uses the selected asset's pixel size when the field has no aspect/width/height", () => {
    const crop = resolveCropConfig({ desktopMobileMode: true }, {});
    expect(crop.aspect).toBeUndefined();
    expect(crop.width).toBeUndefined();
    expect(crop.height).toBeUndefined();
    const seeded = seedAssetCrop(crop, { width: 1920, height: 1080 });
    expect(seeded.transform).toMatchObject({ width: 1920, height: 1080, aspect: "16:9" });
    expect(seeded.mobile).toBeUndefined();
  });

  it("keeps field presets over native size, per viewport", () => {
    const crop = resolveCropConfig(
      {
        desktopMobileMode: true,
        aspect: { desktop: "16:9", mobile: "9:16" },
        width: { desktop: 1200, mobile: 390 },
      },
      {}
    );
    const seeded = seedAssetCrop(crop, { width: 4000, height: 3000 });
    expect(seeded.transform).toMatchObject({ aspect: "16:9", width: 1200, height: 675 });
    expect(seeded.mobile?.transform).toMatchObject({ aspect: "9:16", width: 390, height: 693 });
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
