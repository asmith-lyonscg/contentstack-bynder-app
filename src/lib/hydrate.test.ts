import { describe, expect, it } from "vitest";
import { applyCropConfigToAssets, resolveCropConfig } from "./fieldConfig";
import { hydrateFieldValue } from "./hydrate";
import { CUSTOM_PROFILE_ID, aspectRatioFromPixels, customProfileSettings } from "./profiles";
import { buildSettingsPayload, emptySettings, persistedPayload } from "./settings";
import { DEFAULT_TRANSFORM, type CropFieldConfig, type SavedBynderAsset } from "./types";

const APP = {
  profiles: {
    hero: { desktop: "16:9", mobile: "4:3" },
    card: { desktop: "1:1", mobile: "1:1", quality: 70 },
  },
};

/** Mirrors CustomField `persist` for the field's default profile. */
function savedBy(
  assets: SavedBynderAsset[],
  options: Parameters<typeof buildSettingsPayload>[1] = {},
  crop: CropFieldConfig = resolveCropConfig({ defaultProfile: "hero" }, APP)
) {
  const current = emptySettings();
  const sized = applyCropConfigToAssets(assets, crop);
  current.assets = sized;
  return JSON.parse(
    JSON.stringify(
      persistedPayload(
        buildSettingsPayload(current, {
          assets: sized,
          profile: crop.profile,
          profileSettings: crop.active,
          ...options,
        })
      )
    )
  );
}

const image: SavedBynderAsset = {
  id: "earth",
  name: "Earth",
  type: "IMAGE",
  transformBaseUrl: "https://portal.bynder.com/transform/earth.jpg",
  origWidth: 4000,
  origHeight: 2667,
  focalPoint: { x: 0.35, y: 0.42 },
  transform: { ...DEFAULT_TRANSFORM },
};

describe("hydrateFieldValue", () => {
  const options = { cropConfig: resolveCropConfig({ defaultProfile: "hero" }, APP) };

  it("ignores JSON RTE display and other sibling keys", () => {
    const stored = savedBy([image]);
    const wrapped = {
      ...stored,
      display: { width: 276, height: 155, alignment: "floatLeft", inline: true },
      style: { float: "left" },
      attrs: { v: 1 },
    };
    expect(hydrateFieldValue(wrapped, options).changed).toBe(false);
  });

  it("is a no-op for a payload the app saved itself", () => {
    const stored = savedBy([image]);
    expect(stored).toMatchObject({
      v: 2,
      profile: { id: "hero", settings: { desktop: "16:9" } },
    });
    expect(stored).not.toHaveProperty("profileSettings");
    const { changed, settings } = hydrateFieldValue(stored, options);
    expect(changed).toBe(false);
    expect(settings.assets?.[0].transform).toMatchObject({ width: null, aspect: "16:9" });
  });

  it("ignores key order", () => {
    const stored = savedBy([image]);
    const reordered = {
      assets: stored.assets.map((a: Record<string, unknown>) => Object.fromEntries(Object.entries(a).reverse())),
      profile: stored.profile,
      v: 2,
    };
    expect(hydrateFieldValue(reordered, options).changed).toBe(false);
  });

  it("is a no-op for empty fields and saved documents", () => {
    expect(hydrateFieldValue(undefined, options).changed).toBe(false);
    expect(hydrateFieldValue({ v: 2 }, options).changed).toBe(false);
    const doc = savedBy([{ id: "pdf", name: "Spec", type: "DOCUMENT", url: "https://cdn.example/m/h/original/spec.pdf" }]);
    expect(hydrateFieldValue(doc, options).changed).toBe(false);
  });

  it("is a no-op for a mobile crop, video, and author fields", () => {
    const authorFields = [{ property: "featured", type: "boolean" as const }];
    const stored = savedBy(
      [
        {
          ...image,
          alt: "Planet",
          additional: { featured: true },
          mobile: { focalPoint: { x: 0.2, y: 0.8 }, transform: { ...DEFAULT_TRANSFORM } },
        },
        {
          id: "clip",
          name: "Clip",
          type: "VIDEO",
          webImage: { url: "https://cdn.example/clip.mp4" },
          video: { autoplay: true, muted: true, controls: false, loop: true },
        } as SavedBynderAsset,
      ],
      { authorFields }
    );
    expect(stored.assets).toHaveLength(2);
    expect(stored.assets[1]).not.toHaveProperty("focalPoint");
    expect(hydrateFieldValue(stored, { ...options, authorFields }).changed).toBe(false);
  });

  it("saves Fill and drops fields the payload does not use", () => {
    const stored = savedBy([image]);
    stored.assets[0].zoom = 1.4;
    stored.assets[0].operation = "scale";
    const result = hydrateFieldValue(stored, options);
    expect(result.changed).toBe(true);
    expect(persistedPayload(result.settings).assets).toEqual([
      expect.objectContaining({ operation: "fill" }),
    ]);
    expect(JSON.stringify(persistedPayload(result.settings))).not.toContain("zoom");
  });

  it("keeps an allowed saved profile and falls back to the default otherwise", () => {
    const card = savedBy([image], {}, resolveCropConfig({ defaultProfile: "card" }, APP));
    expect(card.profile.id).toBe("card");
    const kept = hydrateFieldValue(card, options);
    expect(kept.changed).toBe(false);
    expect(kept.cropConfig.profile).toBe("card");

    const narrowed = hydrateFieldValue(card, {
      ...options,
      cropConfig: resolveCropConfig({ profiles: ["hero"], defaultProfile: "hero" }, APP),
    });
    expect(narrowed.changed).toBe(true);
    expect(narrowed.settings.profile).toBe("hero");

    const noDefault = hydrateFieldValue(card, { ...options, cropConfig: resolveCropConfig({ profiles: ["hero"] }, APP) });
    expect(noDefault.changed).toBe(true);
    expect(noDefault.settings.profile).toBeUndefined();
    expect(noDefault.settings.profileSettings?.desktop).toBeUndefined();
  });

  it("saves no profile and the original aspect ratio when nothing assigns one", () => {
    const original = resolveCropConfig({}, APP);
    const stored = savedBy([image], {}, original);
    expect(stored.profile).toEqual({
      settings: {
        quality: 80,
        format: "webp",
      },
    });
    const result = hydrateFieldValue(stored, { ...options, cropConfig: original });
    expect(result.changed).toBe(false);
    expect(result.settings.assets?.[0].transform).toMatchObject({ width: null, height: null, aspect: "4000:2667" });

    const withDefault = hydrateFieldValue(stored, options);
    expect(withDefault.changed).toBe(true);
    expect(withDefault.settings.profile).toBe("hero");
  });

  it("reports a change when the profile's aspect ratio changes in App Config", () => {
    const stored = savedBy([image]);
    const wider = {
      profiles: { ...APP.profiles, hero: { ...APP.profiles.hero, desktop: "2:1" } },
    };
    const result = hydrateFieldValue(stored, { ...options, cropConfig: resolveCropConfig({ defaultProfile: "hero" }, wider) });
    expect(result.changed).toBe(true);
    expect(result.settings.profileSettings?.desktop).toBe("2:1");

    const original = savedBy([image], {}, resolveCropConfig({}, APP));
    const leftoverWidth = hydrateFieldValue(original, {
      ...options,
      cropConfig: resolveCropConfig({}, { ...APP, maxDesktopWidth: 1600 }),
    });
    expect(leftoverWidth.changed).toBe(false);
    expect(leftoverWidth.settings.profileSettings?.desktop).toBeUndefined();
  });

  it("keeps the saved snapshot when App Config no longer defines the profile", () => {
    const stored = savedBy([image], {}, resolveCropConfig({ defaultProfile: "card" }, APP));
    const result = hydrateFieldValue(stored, { ...options, cropConfig: resolveCropConfig({}, { profiles: { hero: APP.profiles.hero } }) });
    expect(result.missingProfile).toBe("card");
    expect(result.changed).toBe(false);
    expect(result.settings.profileSettings).toEqual(stored.profile.settings);
  });

  it("keeps a dragged custom ratio and does not warn that the profile is missing", () => {
    const base = resolveCropConfig({}, APP);
    const settings = customProfileSettings(base.active, image, image);
    const crop = { ...base, profile: CUSTOM_PROFILE_ID, active: settings };
    const stored = savedBy([image], {}, crop);
    const result = hydrateFieldValue(stored, { ...options, cropConfig: base });
    expect(result.missingProfile).toBeUndefined();
    expect(result.changed).toBe(false);
    expect(result.settings.profile).toBe(CUSTOM_PROFILE_ID);
    expect(result.settings.profileSettings?.desktop).toBe(
      aspectRatioFromPixels(image.origWidth, image.origHeight)
    );
    expect(stored.profile.id).toBe("custom");
  });
});
