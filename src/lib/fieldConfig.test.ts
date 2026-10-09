import { describe, expect, it } from "vitest";
import {
  applyCropConfig,
  readFieldConfig,
  resolveBynderFieldUid,
  resolveBynderPortalUrl,
  resolveCompactViewConfig,
  resolveCropConfig,
  resolveEnableDat,
  resolveSiblingAsset,
  seedAssetCrop,
  withActiveProfile,
} from "./fieldConfig";
import { duplicateJsonKeys, originalProfileSettings, parseRenderProfiles, profileCropsCanMatch, profileSettingsFrom, srcsetWidths } from "./profiles";
import { DEFAULT_TRANSFORM } from "./types";

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
      assetTypes: ["IMAGE", "VIDEO"],
      maxLimit: 1,
    });
    expect(resolveCompactViewConfig({}, { bynderPortalUrl: "acme.getbynder.com" }).assetFilter).toBeUndefined();
  });

  it("maps accept to Compact View asset types", () => {
    expect(resolveCompactViewConfig({ accept: "image" }, {}).assetTypes).toEqual(["IMAGE"]);
    expect(resolveCompactViewConfig({ accept: "video" }, {}).assetTypes).toEqual(["VIDEO"]);
    expect(resolveCompactViewConfig({ accept: "pdf" }, {}).assetTypes).toEqual(["DOCUMENT"]);
    expect(resolveCompactViewConfig({ accept: "image/video" }, {}).assetTypes).toEqual(["IMAGE", "VIDEO"]);
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
        { compactLanguage: "nl_NL" },
        { bynderPortalUrl: "acme.getbynder.com", compactMode: "SingleSelectFile" }
      )
    ).toMatchObject({
      portalUrl: "acme.getbynder.com",
      language: "nl_NL",
      mode: "SingleSelect",
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

const APP_PROFILES = {
  profiles: {
    hero: { desktop: { aspectRatio: "16:9", maxWidth: 2000 }, mobile: { aspectRatio: "4:3", maxWidth: 960 }, quality: 80, format: "webp" },
    largeHero: { desktop: { aspectRatio: "21:9", maxWidth: 1800 }, mobile: { aspectRatio: "4:5", maxWidth: 960 } },
    card: { desktop: { aspectRatio: "1:1", maxWidth: 800 }, mobile: { aspectRatio: "1:1", maxWidth: 600 } },
  },
};

describe("parseRenderProfiles", () => {
  it("fills quality and format defaults", () => {
    const { profiles, errors } = parseRenderProfiles(APP_PROFILES.profiles);
    expect(errors).toEqual([]);
    expect(profiles.largeHero).toEqual({
      desktop: { aspectRatio: "21:9", maxWidth: 1800 },
      mobile: { aspectRatio: "4:5", maxWidth: 960 },
      quality: 80,
      format: "webp",
    });
  });

  it("requires desktop and mobile, each with aspectRatio and maxWidth", () => {
    const { profiles, errors } = parseRenderProfiles({
      ok: { desktop: { aspectRatio: "16:9", maxWidth: 1600 }, mobile: { aspectRatio: "4:3", maxWidth: 800 } },
      noMobile: { desktop: { aspectRatio: "16:9", maxWidth: 1600 } },
      partial: { desktop: { maxWidth: 1600 }, mobile: { aspectRatio: "4:3" } },
      bad: {
        desktop: { aspectRatio: "wide", maxWidth: 0 },
        mobile: { aspectRatio: "1:1", maxWidth: 100 },
        quality: 200,
        format: "gif",
      },
      "9lives": { desktop: { aspectRatio: "1:1", maxWidth: 100 }, mobile: { aspectRatio: "1:1", maxWidth: 100 } },
    });
    const text = errors.join(" ");
    expect(Object.keys(profiles)).toEqual(["ok"]);
    expect(text).toContain("profiles.noMobile.mobile is required");
    expect(text).toContain("profiles.partial.desktop.aspectRatio is required");
    expect(text).toContain("profiles.partial.mobile.maxWidth is required");
    expect(text).toContain("profiles.bad.desktop.aspectRatio");
    expect(text).toContain("profiles.bad.desktop.maxWidth");
    expect(text).toContain("profiles.bad.quality");
    expect(text).toContain("profiles.bad.format");
    expect(text).toContain('"9lives"');
    expect(parseRenderProfiles("[1]").errors).toHaveLength(1);
    expect(parseRenderProfiles(undefined)).toEqual({ profiles: {}, errors: [] });
  });

  it("reports widths above the App Config maximums and clamps them", () => {
    const { profiles, errors } = parseRenderProfiles(
      {
        wide: { desktop: { aspectRatio: "16:9", maxWidth: 2560 }, mobile: { aspectRatio: "4:3", maxWidth: 1200 } },
      },
      { desktop: 2000, mobile: 960 }
    );
    expect(errors).toEqual([
      "profiles.wide.desktop.maxWidth (2560) is above maxDesktopWidth (2000).",
      "profiles.wide.mobile.maxWidth (1200) is above maxMobileWidth (960).",
    ]);
    expect(profiles.wide.desktop.maxWidth).toBe(2000);
    expect(profiles.wide.mobile.maxWidth).toBe(960);
  });

  it("rejects a profile name used twice in the JSON text", () => {
    const text = `{
      "hero": { "desktop": { "aspectRatio": "16:9", "maxWidth": 2000 }, "mobile": { "aspectRatio": "4:3", "maxWidth": 960 } },
      "hero": { "desktop": { "aspectRatio": "1:1", "maxWidth": 800, "maxWidth": 900 }, "mobile": { "aspectRatio": "1:1", "maxWidth": 600 } }
    }`;
    expect(parseRenderProfiles(text).errors).toEqual([
      'Profile name "hero" is used more than once. Each profile needs a unique name.',
      '"hero.desktop.maxWidth" is set more than once.',
    ]);
    expect(duplicateJsonKeys('{"a": {"b": 1}, "c": [{"b": 1}, {"b": 2}], "s": "\\"a\\": 1"}')).toEqual([]);
  });
});

describe("resolveCropConfig", () => {
  it("uses the original aspect ratio and default max widths when App Config has no profiles", () => {
    const crop = resolveCropConfig({}, {});
    expect(crop.allowedProfiles).toEqual([]);
    expect(crop.profile).toBeUndefined();
    expect(crop.allowOriginal).toBe(true);
    expect(crop.profileLocked).toBe(false);
    expect(crop.maxWidths).toEqual({ desktop: 2000, mobile: 960 });
    expect(crop.active).toEqual({
      desktop: { targetWidth: 2000 },
      mobile: { targetWidth: 960 },
      quality: 80,
      format: "webp",
    });
    expect(crop.showOperation).toBe(true);
    expect(crop.allowFit).toBe(false);
    expect(crop.desktopMobileMode).toBe(true);
  });

  it("reads maxDesktopWidth and maxMobileWidth from App Config", () => {
    const crop = resolveCropConfig({}, { maxDesktopWidth: 2400, maxMobileWidth: "1080" });
    expect(crop.maxWidths).toEqual({ desktop: 2400, mobile: 1080 });
    expect(crop.active.desktop).toEqual({ targetWidth: 2400 });
  });

  it("offers every App Config profile with no default unless the field sets one", () => {
    const crop = resolveCropConfig({}, APP_PROFILES);
    expect(crop.allowedProfiles).toEqual(["hero", "largeHero", "card"]);
    expect(crop.defaultProfile).toBeUndefined();
    expect(crop.profile).toBeUndefined();
    expect(crop.allowOriginal).toBe(true);
  });

  it("locks the field to one profile when config sets profile", () => {
    const crop = resolveCropConfig({ profile: "hero" }, APP_PROFILES);
    expect(crop.allowedProfiles).toEqual(["hero"]);
    expect(crop.profile).toBe("hero");
    expect(crop.defaultProfile).toBe("hero");
    expect(crop.allowOriginal).toBe(false);
    expect(crop.profileLocked).toBe(true);
    expect(crop.active.desktop).toEqual({ aspectRatio: "16:9", targetWidth: 2000 });
    expect(resolveCropConfig({ profile: " hero " }, APP_PROFILES).profile).toBe("hero");
    expect(resolveCropConfig({ profile: "missing", profiles: ["card"] }, APP_PROFILES).allowedProfiles).toEqual(["card"]);
    expect(resolveCropConfig({ profile: "missing", profiles: ["card"] }, APP_PROFILES).profileLocked).toBe(false);
  });

  it("narrows to the field's list and default, ignoring unknown names", () => {
    const crop = resolveCropConfig({ profiles: ["card", "nope", "largeHero"], defaultProfile: "largeHero" }, APP_PROFILES);
    expect(crop.allowedProfiles).toEqual(["card", "largeHero"]);
    expect(crop.profile).toBe("largeHero");
    expect(crop.allowOriginal).toBe(false);
    expect(crop.profileLocked).toBe(false);
    expect(crop.active.desktop).toEqual({ aspectRatio: "21:9", targetWidth: 1800 });
    expect(resolveCropConfig({ profiles: "card, hero", defaultProfile: "largeHero" }, APP_PROFILES).defaultProfile).toBeUndefined();
    expect(resolveCropConfig({ custom_settings: { profiles: ["card"] } }, APP_PROFILES).allowedProfiles).toEqual(["card"]);
  });

  it("clamps an App Config profile above the max widths", () => {
    const crop = resolveCropConfig({ defaultProfile: "hero" }, { ...APP_PROFILES, maxDesktopWidth: 1500 });
    expect(crop.active.desktop).toEqual({ aspectRatio: "16:9", targetWidth: 1500 });
  });

  it("keeps Fit only when allowFit is on, with the field winning", () => {
    const transform = { ...DEFAULT_TRANSFORM, operation: "fit" as const };
    const allowed = resolveCropConfig({ allowFit: true, defaultProfile: "hero" }, APP_PROFILES);
    expect(allowed.allowFit).toBe(true);
    expect(applyCropConfig(transform, allowed).operation).toBe("fit");
    expect(resolveCropConfig({ allowFit: false }, { allowFit: true }).allowFit).toBe(false);
    expect(resolveCropConfig({}, { allowFit: true }).allowFit).toBe(true);
  });

  it("shares a crop only when desktop and mobile aspects match, or there is no profile", () => {
    expect(profileCropsCanMatch(originalProfileSettings())).toBe(true);
    const { profiles } = parseRenderProfiles(APP_PROFILES.profiles);
    expect(profileCropsCanMatch(profileSettingsFrom(profiles.card))).toBe(true);
    expect(profileCropsCanMatch(profileSettingsFrom(profiles.hero))).toBe(false);
    expect(
      profileCropsCanMatch(
        profileSettingsFrom({
          desktop: { aspectRatio: "16:9", maxWidth: 2000 },
          mobile: { aspectRatio: "32:18", maxWidth: 960 },
          quality: 80,
          format: "webp",
        })
      )
    ).toBe(true);
  });

  it("reads showFieldOperation with field config winning", () => {
    expect(resolveCropConfig({ showFieldOperation: false }, { showFieldOperation: true }).showOperation).toBe(false);
    expect(resolveCropConfig({}, { showFieldOperation: false }).showOperation).toBe(false);
  });
});

describe("withActiveProfile", () => {
  it("switches to a defined profile, back to the original aspect, or keeps a saved snapshot for a missing one", () => {
    const crop = resolveCropConfig({ defaultProfile: "hero" }, APP_PROFILES);
    expect(withActiveProfile(crop, "card").active.desktop).toEqual({ aspectRatio: "1:1", targetWidth: 800 });
    const original = withActiveProfile(crop, undefined);
    expect(original.profile).toBeUndefined();
    expect(original.active.desktop).toEqual({ targetWidth: 2000 });
    const snapshot = { ...crop.active, quality: 55 };
    expect(withActiveProfile(crop, "gone", snapshot)).toMatchObject({ profile: "gone", active: snapshot });
    expect(withActiveProfile(crop, "gone")).toBe(crop);
  });
});

describe("applyCropConfig", () => {
  const crop = resolveCropConfig({ defaultProfile: "hero" }, APP_PROFILES);

  it("sets size, aspect, format, and quality from the profile per viewport", () => {
    const transform = { ...DEFAULT_TRANSFORM, operation: "fit" as const, width: 10, height: 10, aspect: "9:9", quality: 5 };
    expect(applyCropConfig(transform, crop, "desktop")).toMatchObject({
      operation: "fill",
      width: 2000,
      height: 1125,
      aspect: "16:9",
      format: "webp",
      quality: 80,
    });
    expect(applyCropConfig(transform, crop, "mobile")).toMatchObject({ width: 960, height: 720, aspect: "4:3" });
  });

  it("uses desktop sizes for mobile when desktopMobileMode is off", () => {
    const single = resolveCropConfig({ desktopMobileMode: false, defaultProfile: "hero" }, APP_PROFILES);
    expect(applyCropConfig(DEFAULT_TRANSFORM, single, "mobile")).toMatchObject({ width: 2000, aspect: "16:9" });
  });

  it("uses the asset's own aspect ratio without a profile, never wider than the original", () => {
    const original = resolveCropConfig({}, {});
    const size = { originalAssetWidth: 1500, originalAssetHeight: 1000 };
    expect(applyCropConfig(DEFAULT_TRANSFORM, original, "desktop", size)).toMatchObject({
      width: 1500,
      height: 1000,
      aspect: "3:2",
    });
    expect(applyCropConfig(DEFAULT_TRANSFORM, original, "mobile", size)).toMatchObject({ width: 960, height: 640 });
    expect(applyCropConfig(DEFAULT_TRANSFORM, original, "desktop")).toMatchObject({ width: 2000, height: null, aspect: null });
  });

  it("turns a legacy Crop into Fill", () => {
    expect(applyCropConfig({ ...DEFAULT_TRANSFORM, operation: "crop" }, crop).operation).toBe("fill");
  });

  it("seeds a new asset at the center with Fill and no mobile override", () => {
    const seeded = seedAssetCrop(crop);
    expect(seeded.focalPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(seeded.transform).toMatchObject({ operation: "fill", width: 2000, aspect: "16:9" });
    expect(seeded.mobile).toBeUndefined();
  });
});

describe("srcsetWidths", () => {
  it("cuts the steps at targetWidth and always ends with it", () => {
    expect(srcsetWidths(2000)).toEqual([640, 960, 1280, 1600, 1920, 2000]);
    expect(srcsetWidths(960)).toEqual([640, 960]);
    expect(srcsetWidths(500)).toEqual([500]);
    expect(srcsetWidths(1000, [1200, 400, 400])).toEqual([400, 1000]);
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

describe("resolveVideoDefaults", () => {
  it("defaults to controls on and the other playback flags off", async () => {
    const { resolveVideoDefaults } = await import("./fieldConfig");
    expect(resolveVideoDefaults({}, {})).toEqual({
      autoplay: false,
      muted: false,
      controls: true,
      loop: false,
    });
  });

  it("prefers the field video object, then flat field keys, then app config", async () => {
    const { resolveVideoDefaults } = await import("./fieldConfig");
    expect(
      resolveVideoDefaults(
        { video: { autoplay: true, muted: true }, videoLoop: true },
        { video: { autoplay: false, controls: false, loop: true }, videoMuted: true }
      )
    ).toEqual({ autoplay: true, muted: true, controls: false, loop: true });
  });
});

describe("resolveVideoFieldVisibility", () => {
  it("shows every playback checkbox unless a showField flag turns it off", async () => {
    const { resolveVideoFieldVisibility } = await import("./fieldConfig");
    expect(resolveVideoFieldVisibility({}, {})).toEqual({
      autoplay: true,
      muted: true,
      controls: true,
      loop: true,
    });
    expect(
      resolveVideoFieldVisibility(
        { showFieldAutoplay: false, showFieldMute: false },
        { showFieldMuted: true, showFieldLoop: false, showFieldControls: false }
      )
    ).toEqual({
      autoplay: false,
      muted: false,
      controls: false,
      loop: false,
    });
  });
});

describe("resolveAdditionalFields", () => {
  it("reads an array of additionalField objects", async () => {
    const { resolveAdditionalFields } = await import("./fieldConfig");
    expect(
      resolveAdditionalFields(
        {
          additionalFields: [
            { property: "uniqueId", type: "boolean", label: "some label" },
            { property: "caption", type: "string", label: "Caption" },
            { property: "rank", type: "number", label: "Rank" },
          ],
        },
        { additionalFields: [{ property: "fromApp", type: "boolean", label: "App" }] }
      )
    ).toEqual({
      fields: [
        { property: "uniqueId", type: "boolean", label: "some label" },
        { property: "caption", type: "string", label: "Caption" },
        { property: "rank", type: "number", label: "Rank" },
      ],
    });
  });

  it("uses app config when the field does not set additionalFields", async () => {
    const { resolveAdditionalFields } = await import("./fieldConfig");
    expect(
      resolveAdditionalFields({}, { additionalFields: [{ property: "featured", type: "boolean", label: "Featured" }] })
    ).toEqual({ fields: [{ property: "featured", type: "boolean", label: "Featured" }] });
    expect(resolveAdditionalFields({}, {})).toEqual({ fields: [] });
  });

  it("fails closed when the list is not an array of valid additionalField objects", async () => {
    const { resolveAdditionalFields } = await import("./fieldConfig");
    expect(resolveAdditionalFields({ additionalField: { property: "uniqueId", type: "boolean", label: "some label" } }, {})).toEqual({
      fields: [],
      error:
        'Use "additionalFields", an array of additionalField objects. Each item needs "property", "type", and "label".',
    });
    expect(
      resolveAdditionalFields(
        {
          additionalFields: [
            { property: "caption", type: "string" },
            { property: "id", type: "string", label: "Reserved" },
            { property: "rank", type: "object", label: "Rank" },
            "nope",
          ],
        },
        { additionalFields: [{ property: "fromApp", type: "boolean", label: "App" }] }
      ).error
    ).toMatch(/additionalFields\[0\].label/);
    expect(resolveAdditionalFields({ additionalFields: { property: "uniqueId" } }, {}).error).toMatch(/must be an array/);
  });
});
