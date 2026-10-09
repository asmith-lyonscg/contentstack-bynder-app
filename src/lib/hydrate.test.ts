import { describe, expect, it } from "vitest";
import { applyCropConfigToAssets, resolveCropConfig } from "./fieldConfig";
import { hydrateFieldValue } from "./hydrate";
import { buildSettingsPayload, emptySettings, persistedPayload } from "./settings";
import { DEFAULT_TRANSFORM, type CropFieldConfig, type SavedBynderAsset } from "./types";

const APP = {
  profiles: {
    hero: { desktop: { aspectRatio: "16:9", maxWidth: 2000 }, mobile: { aspectRatio: "4:3", maxWidth: 960 } },
    card: { desktop: { aspectRatio: "1:1", maxWidth: 800 }, mobile: { aspectRatio: "1:1", maxWidth: 600 }, quality: 70 },
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
          enableDat: true,
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
  originalAssetWidth: 4000,
  originalAssetHeight: 2667,
  focalPoint: { x: 0.35, y: 0.42 },
  transform: { ...DEFAULT_TRANSFORM },
};

describe("hydrateFieldValue", () => {
  const options = { cropConfig: resolveCropConfig({ defaultProfile: "hero" }, APP), enableDat: true };

  it("is a no-op for a payload the app saved itself", () => {
    const stored = savedBy([image]);
    expect(stored).toMatchObject({
      v: 2,
      profile: { id: "hero", settings: { desktop: { targetWidth: 2000 } } },
    });
    expect(stored).not.toHaveProperty("profileSettings");
    const { changed, settings } = hydrateFieldValue(stored, options);
    expect(changed).toBe(false);
    expect(settings.assets?.[0].transform).toMatchObject({ width: 2000, aspect: "16:9" });
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
          mobile: { focalPoint: { x: 0.2, y: 0.8 }, transform: { ...DEFAULT_TRANSFORM, operation: "scale" } },
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

  it("drops a saved zoom and a legacy scale operation", () => {
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
    expect(noDefault.settings.profileSettings?.desktop).toEqual({ targetWidth: 2000 });
  });

  it("saves no profile and the original aspect ratio when nothing assigns one", () => {
    const original = resolveCropConfig({}, APP);
    const stored = savedBy([image], {}, original);
    expect(stored.profile).toEqual({
      settings: {
        desktop: { targetWidth: 2000 },
        mobile: { targetWidth: 960 },
        quality: 80,
        format: "webp",
      },
    });
    const result = hydrateFieldValue(stored, { ...options, cropConfig: original });
    expect(result.changed).toBe(false);
    expect(result.settings.assets?.[0].transform).toMatchObject({ width: 2000, aspect: "4000:2667", height: 1334 });

    const withDefault = hydrateFieldValue(stored, options);
    expect(withDefault.changed).toBe(true);
    expect(withDefault.settings.profile).toBe("hero");
  });

  it("reports a change when the profile's values or the max widths change in App Config", () => {
    const stored = savedBy([image]);
    const wider = {
      maxDesktopWidth: 2560,
      profiles: { ...APP.profiles, hero: { ...APP.profiles.hero, desktop: { aspectRatio: "16:9", maxWidth: 2560 } } },
    };
    const result = hydrateFieldValue(stored, { ...options, cropConfig: resolveCropConfig({ defaultProfile: "hero" }, wider) });
    expect(result.changed).toBe(true);
    expect(result.settings.profileSettings?.desktop.targetWidth).toBe(2560);

    const original = savedBy([image], {}, resolveCropConfig({}, APP));
    const capped = hydrateFieldValue(original, {
      ...options,
      cropConfig: resolveCropConfig({}, { ...APP, maxDesktopWidth: 1600 }),
    });
    expect(capped.changed).toBe(true);
    expect(capped.settings.profileSettings?.desktop).toEqual({ targetWidth: 1600 });
  });

  it("keeps the saved snapshot when App Config no longer defines the profile", () => {
    const stored = savedBy([image], {}, resolveCropConfig({ defaultProfile: "card" }, APP));
    const result = hydrateFieldValue(stored, { ...options, cropConfig: resolveCropConfig({}, { profiles: { hero: APP.profiles.hero } }) });
    expect(result.missingProfile).toBe("card");
    expect(result.changed).toBe(false);
    expect(result.settings.profileSettings).toEqual(stored.profile.settings);
  });
});
