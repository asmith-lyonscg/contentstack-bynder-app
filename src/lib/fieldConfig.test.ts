import { describe, expect, it } from "vitest";
import {
  applyCropConfig,
  readFieldConfig,
  resolveBynderFieldUid,
  resolveBynderPortalUrl,
  resolveCompactViewConfig,
  resolveCropConfig,
  resolveSiblingAsset,
  seedAssetCrop,
  withActiveProfile,
} from "./fieldConfig";
import { duplicateJsonKeys, originalProfileSettings, parseRenderProfiles, profileCropsCanMatch, profileSettingsFrom, srcsetWidths, viewportImageSize, widthWithinMaxDimension } from "./profiles";
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

  it("maps type to Compact View asset types", () => {
    expect(resolveCompactViewConfig({ type: ["image"] }, {}).assetTypes).toEqual(["IMAGE"]);
    expect(resolveCompactViewConfig({ type: ["video"] }, {}).assetTypes).toEqual(["VIDEO"]);
    expect(resolveCompactViewConfig({ type: ["pdf"] }, {}).assetTypes).toEqual(["DOCUMENT"]);
    expect(resolveCompactViewConfig({ type: ["image", "video"] }, {}).assetTypes).toEqual(["IMAGE", "VIDEO"]);
    expect(resolveCompactViewConfig({ type: ["Video", "image", "video"] }, {}).assetTypes).toEqual(["VIDEO", "IMAGE"]);
    expect(resolveCompactViewConfig({ type: ["image", "nope"] }, {}).assetTypes).toEqual(["IMAGE"]);
    expect(resolveCompactViewConfig({ type: "image" }, {}).assetTypes).toEqual(["IMAGE", "VIDEO"]);
    expect(
      resolveCompactViewConfig(
        { type: ["pdf"], compactViewConfig: { assetTypes: ["IMAGE"] } },
        { type: ["video"] }
      ).assetTypes
    ).toEqual(["DOCUMENT"]);
    expect(resolveCompactViewConfig({}, { type: ["image"] }).assetTypes).toEqual(["IMAGE"]);
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

const APP_PROFILES = {
  profiles: {
    hero: { desktop: "16:9", mobile: "4:3", quality: 80, format: "webp" },
    largeHero: { desktop: "21:9", mobile: "4:5" },
    card: { desktop: "1:1", mobile: "1:1" },
  },
};

describe("parseRenderProfiles", () => {
  it("fills quality and format defaults", () => {
    const { profiles, errors } = parseRenderProfiles(APP_PROFILES.profiles);
    expect(errors).toEqual([]);
    expect(profiles.largeHero).toEqual({
      desktop: "21:9",
      mobile: "4:5",
      quality: 80,
      format: "webp",
    });
  });

  it("keeps an optional display name and rejects a blank or repeated one", () => {
    const named = parseRenderProfiles({
      largeHero: { name: "  Hero Large  ", desktop: "21:9", mobile: "4:5" },
    });
    expect(named.errors).toEqual([]);
    expect(named.profiles.largeHero.name).toBe("Hero Large");

    const blank = parseRenderProfiles({
      hero: { name: "  ", desktop: "16:9", mobile: "4:3" },
    });
    expect(blank.profiles.hero).toBeUndefined();
    expect(blank.errors.join(" ")).toContain("profiles.hero.name");

    const repeated = parseRenderProfiles({
      hero: { name: "Hero", desktop: "16:9", mobile: "4:3" },
      heroWide: { name: "hero", desktop: "21:9", mobile: "9:16" },
    });
    expect(repeated.errors.join(" ")).toContain('Display name "hero" is used by both "hero" and "heroWide".');
  });

  it("requires desktop and mobile aspect ratios", () => {
    const { profiles, errors } = parseRenderProfiles({
      ok: { desktop: "16:9", mobile: "4:3" },
      noMobile: { desktop: "16:9" },
      partial: { desktop: "wide", mobile: "4:3" },
      bad: {
        desktop: "16:9",
        mobile: "1:1",
        quality: 200,
        format: "gif",
      },
      "9lives": { desktop: "1:1", mobile: "1:1" },
    });
    const text = errors.join(" ");
    expect(Object.keys(profiles)).toEqual(["ok"]);
    expect(profiles.ok.desktop).toBe("16:9");
    expect(text).toContain("profiles.noMobile.mobile is required");
    expect(text).toContain("profiles.partial.desktop must look like");
    expect(text).toContain("profiles.bad.quality");
    expect(text).toContain("profiles.bad.format");
    expect(text).toContain('"9lives"');
    expect(parseRenderProfiles("[1]").errors).toHaveLength(1);
    expect(parseRenderProfiles(undefined)).toEqual({ profiles: {}, errors: [] });
  });

  it("keeps the aspect ratio when a profile used to be taller than the Bynder max dimension", () => {
    const { profiles, errors } = parseRenderProfiles({
      poster: { desktop: "9:16", mobile: "9:16" },
    });
    expect(errors).toEqual([]);
    expect(profiles.poster.desktop).toBe("9:16");
    expect(viewportImageSize(profileSettingsFrom(profiles.poster).desktop)).toEqual({ aspectRatio: "9:16" });
    expect(widthWithinMaxDimension(2000, "9:16", 2000)).toBe(1125);
  });

  it("rejects a profile name used twice in the JSON text", () => {
    const text = `{
      "hero": { "desktop": "16:9", "mobile": "4:3" },
      "hero": { "desktop": "1:1", "desktop": "2:1", "mobile": "1:1" }
    }`;
    expect(parseRenderProfiles(text).errors).toEqual([
      'Profile name "hero" is used more than once. Each profile needs a unique name.',
      '"hero.desktop" is set more than once.',
    ]);
    expect(duplicateJsonKeys('{"a": {"b": 1}, "c": [{"b": 1}, {"b": 2}], "s": "\\"a\\": 1"}')).toEqual([]);
  });
});

describe("resolveCropConfig", () => {
  it("uses the original aspect ratio when App Config has no profiles", () => {
    const crop = resolveCropConfig({}, {});
    expect(crop.allowedProfiles).toEqual([]);
    expect(crop.profile).toBeUndefined();
    expect(crop.allowOriginal).toBe(true);
    expect(crop.profileLocked).toBe(false);
    expect(crop.maxDimension).toBe(2000);
    expect(crop.active).toEqual({
      quality: 80,
      format: "webp",
    });
    expect(crop.desktopMobileMode).toBe(true);
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
    expect(crop.active.desktop).toBe("16:9");
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
    expect(crop.active.desktop).toBe("21:9");
    expect(resolveCropConfig({ profiles: "card, hero", defaultProfile: "largeHero" }, APP_PROFILES).defaultProfile).toBeUndefined();
    expect(resolveCropConfig({ custom_settings: { profiles: ["card"] } }, APP_PROFILES).allowedProfiles).toEqual(["card"]);
  });

  it("adds a field profile to the dropdown and can mix it with App Config profiles", () => {
    const banner = {
      desktop: "7:4",
      mobile: "16:9",
    };
    const all = resolveCropConfig({ fieldProfiles: { banner } }, APP_PROFILES);
    expect(all.allowedProfiles).toEqual(["banner", "hero", "largeHero", "card"]);
    expect(all.profiles.banner.desktop).toBe("7:4");
    expect(all.allowCustomAspect).toBe(false);
    expect(all.fieldProfileErrors).toEqual([]);

    const mixed = resolveCropConfig({ fieldProfiles: { banner }, profiles: ["banner", "hero", "nope"] }, APP_PROFILES);
    expect(mixed.allowedProfiles).toEqual(["banner", "hero"]);
    expect(resolveCropConfig({ fieldProfiles: { banner }, profile: "banner" }, APP_PROFILES).profileLocked).toBe(true);
    expect(resolveCropConfig({ fieldProfiles: { banner }, defaultProfile: "banner" }, APP_PROFILES).profile).toBe("banner");
  });

  it("lets a field profile replace an App Config profile of the same name", () => {
    const crop = resolveCropConfig(
      { fieldProfiles: { hero: { desktop: "2:1", mobile: "1:1" } } },
      APP_PROFILES
    );
    expect(crop.allowedProfiles.filter((name) => name === "hero")).toEqual(["hero"]);
    expect(crop.profiles.hero.desktop).toBe("2:1");
  });

  it("reports a bad field profile and keeps the valid ones", () => {
    const crop = resolveCropConfig(
      { fieldProfiles: { banner: { desktop: "nope" }, custom: { desktop: "1:1", mobile: "1:1" } } },
      APP_PROFILES
    );
    expect(crop.profiles.banner).toBeUndefined();
    expect(crop.profiles.custom).toBeUndefined();
    expect(crop.fieldProfileErrors.some((error) => error.includes("fieldProfiles.banner"))).toBe(true);
    expect(crop.fieldProfileErrors.some((error) => error.includes('name "custom" is reserved'))).toBe(true);
    expect(crop.allowedProfiles).toEqual(["hero", "largeHero", "card"]);
  });

  it("turns on the custom aspect ratio option only from the field config", () => {
    expect(resolveCropConfig({}, APP_PROFILES).allowCustomAspect).toBe(false);
    expect(resolveCropConfig({ allowCustomAspect: true }, APP_PROFILES).allowCustomAspect).toBe(true);
    expect(resolveCropConfig({}, { allowCustomAspect: true }).allowCustomAspect).toBe(false);
  });

  it("shares a crop only when desktop and mobile aspects match, or there is no profile", () => {
    expect(profileCropsCanMatch(originalProfileSettings())).toBe(true);
    const { profiles } = parseRenderProfiles(APP_PROFILES.profiles);
    expect(profileCropsCanMatch(profileSettingsFrom(profiles.card))).toBe(true);
    expect(profileCropsCanMatch(profileSettingsFrom(profiles.hero))).toBe(false);
    expect(
      profileCropsCanMatch(
        profileSettingsFrom({
          desktop: "16:9",
          mobile: "32:18",
          quality: 80,
          format: "webp",
        })
      )
    ).toBe(true);
  });

});

describe("withActiveProfile", () => {
  it("switches to a defined profile, back to the original aspect, or keeps a saved snapshot for a missing one", () => {
    const crop = resolveCropConfig({ defaultProfile: "hero" }, APP_PROFILES);
    expect(withActiveProfile(crop, "card").active.desktop).toBe("1:1");
    const original = withActiveProfile(crop, undefined);
    expect(original.profile).toBeUndefined();
    expect(original.active.desktop).toBeUndefined();
    const snapshot = { ...crop.active, quality: 55 };
    expect(withActiveProfile(crop, "gone", snapshot)).toMatchObject({ profile: "gone", active: snapshot });
    expect(withActiveProfile(crop, "gone")).toBe(crop);
  });
});

describe("applyCropConfig", () => {
  const crop = resolveCropConfig({ defaultProfile: "hero" }, APP_PROFILES);

  it("sets aspect, format, and quality from the profile per viewport", () => {
    const transform = { ...DEFAULT_TRANSFORM, width: 10, height: 10, aspect: "9:9", quality: 5 };
    expect(applyCropConfig(transform, crop, "desktop")).toMatchObject({
      operation: "fill",
      width: null,
      height: null,
      aspect: "16:9",
      format: "webp",
      quality: 80,
    });
    expect(applyCropConfig(transform, crop, "mobile")).toMatchObject({ aspect: "4:3", width: null, height: null });
  });

  it("uses the desktop aspect for mobile when desktopMobileMode is off", () => {
    const single = resolveCropConfig({ desktopMobileMode: false, defaultProfile: "hero" }, APP_PROFILES);
    expect(applyCropConfig(DEFAULT_TRANSFORM, single, "mobile")).toMatchObject({ aspect: "16:9" });
  });

  it("uses the asset's own aspect ratio without a profile", () => {
    const original = resolveCropConfig({}, {});
    const size = { origWidth: 1500, origHeight: 1000 };
    expect(applyCropConfig(DEFAULT_TRANSFORM, original, "desktop", size)).toMatchObject({
      width: null,
      height: null,
      aspect: "3:2",
    });
    expect(applyCropConfig(DEFAULT_TRANSFORM, original, "desktop")).toMatchObject({
      width: null,
      height: null,
      aspect: null,
    });
  });

  it("seeds a new asset at the center with Fill and no mobile override", () => {
    const seeded = seedAssetCrop(crop);
    expect(seeded.focalPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(seeded.transform).toMatchObject({ operation: "fill", width: null, aspect: "16:9" });
    expect(seeded.mobile).toBeUndefined();
  });
});

describe("srcsetWidths", () => {
  it("caps each step so neither side passes maxDimension and drops duplicates", () => {
    expect(srcsetWidths("16:9", 2000)).toEqual([640, 960, 1280, 1600, 1920, 2000]);
    expect(srcsetWidths("3:2", 2000)).toEqual([640, 960, 1280, 1600, 1920, 2000]);
    expect(srcsetWidths("9:16", 2000)).toEqual([640, 960, 1125]);
    expect(srcsetWidths("16:9", 2000, [1200, 400, 400, 9000])).toEqual([400, 1200, 2000]);
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
      controlsTheme: "light",
    });
  });

  it("prefers the field video object, then flat field keys, then app config", async () => {
    const { resolveVideoDefaults } = await import("./fieldConfig");
    expect(
      resolveVideoDefaults(
        { video: { autoplay: true, muted: true }, videoLoop: true },
        { video: { autoplay: false, controls: false, loop: true }, videoMuted: true }
      )
    ).toEqual({ autoplay: true, muted: true, controls: false, loop: true, controlsTheme: "light" });
  });

  it("defaults control appearance to light and lets the field hide the toggle", async () => {
    const { resolveVideoDefaults, showVideoControlsTheme } = await import("./fieldConfig");
    expect(showVideoControlsTheme({}, {})).toBe(true);
    expect(showVideoControlsTheme({ video: { showControlsTheme: false } }, { showControlsTheme: true })).toBe(false);
    expect(resolveVideoDefaults({ video: { controlsTheme: "dark" } }, {}).controlsTheme).toBe("dark");
    expect(resolveVideoDefaults({ video: { controlsTheme: "sepia" } }, {}).controlsTheme).toBe("light");
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
