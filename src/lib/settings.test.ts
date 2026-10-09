import { describe, expect, it } from "vitest";
import { buildSettingsPayload, emptySettings, parseSavedSettings, persistedPayload, stashActiveCrop } from "./settings";
import { DEFAULT_TRANSFORM, type ProfileSettings } from "./types";

const HERO: ProfileSettings = {
  desktop: { aspectRatio: "16:9", targetWidth: 2000 },
  mobile: { aspectRatio: "4:3", targetWidth: 960 },
  quality: 80,
  format: "webp",
};

describe("buildSettingsPayload", () => {
  it("persists v2: profile, profileSettings, and per-asset focal point and mode only", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "earth",
        name: "Earth",
        transformBaseUrl: "https://portal.bynder.com/transform/earth.jpg",
        webImage: { url: "https://cdn.example/earth.jpg" },
        originalAssetWidth: 4000,
        originalAssetHeight: 2667,
        focalPoint: { x: 0.35, y: 0.42 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675, aspect: "16:9" },
      },
    ];
    const next = buildSettingsPayload(current, {
      assets: current.assets,
      enableDat: true,
      profile: "hero",
      profileSettings: HERO,
    });
    expect(persistedPayload(next)).toEqual({
      v: 2,
      profile: { id: "hero", settings: HERO },
      assets: [
        {
          id: "earth",
          name: "Earth",
          transformBaseUrl: "https://portal.bynder.com/transform/earth.jpg",
          originalAssetWidth: 4000,
          originalAssetHeight: 2667,
          aspectRatio: "4000:2667",
          focalPoint: { x: 0.35, y: 0.42 },
          operation: "fill",
        },
      ],
    });
    expect(next.assets?.[0].transform).toMatchObject({ width: 2000, height: 1125, aspect: "16:9" });
    expect(next.transform).toMatchObject({ width: 2000, aspect: "16:9" });
  });

  it("drops a legacy Scale zoom and saves letterbox only for Fit", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "a",
        transformBaseUrl: "https://x/t/a",
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM, operation: "scale", extendBackground: "black" },
        mobile: {
          focalPoint: { x: 0.5, y: 0.5 },
          transform: { ...DEFAULT_TRANSFORM, operation: "fit", extendBackground: "custom", extendBackgroundColor: "#112233" },
        },
      },
    ];
    const saved = persistedPayload(buildSettingsPayload(current, { assets: current.assets, profileSettings: HERO })) as {
      assets: Record<string, unknown>[];
    };
    expect(saved.assets[0]).toMatchObject({ operation: "fill" });
    expect(saved.assets[0]).not.toHaveProperty("zoom");
    expect(saved.assets[0]).not.toHaveProperty("extendBackground");
    expect(saved.assets[0].mobile).toEqual({
      focalPoint: { x: 0.5, y: 0.5 },
      operation: "fit",
      extendBackground: "custom",
      extendBackgroundColor: "#112233",
    });
    expect(saved.assets[0]).not.toHaveProperty("transform");
    expect(saved.assets[0]).not.toHaveProperty("dat");
  });

  it("reads a legacy profile string and saves profile.id plus profile.settings", () => {
    const legacy = {
      v: 2,
      profile: "hero",
      profileSettings: HERO,
      assets: [
        {
          id: "a",
          name: "A",
          type: "IMAGE",
          transformBaseUrl: "https://x/t/a",
          alt: "Alt",
          originalAssetWidth: 3000,
          originalAssetHeight: 2000,
          aspectRatio: "3:2",
          focalPoint: { x: 0.3, y: 0.7 },
          operation: "fill",
          mobile: { focalPoint: { x: 0.6, y: 0.4 }, operation: "fill" },
        },
      ],
    };
    const parsed = parseSavedSettings(legacy);
    expect(parsed.profile).toBe("hero");
    expect(parsed.profileSettings).toEqual(HERO);
    expect(persistedPayload(buildSettingsPayload(parsed, { assets: parsed.assets }))).toEqual({
      v: 2,
      profile: { id: "hero", settings: HERO },
      assets: legacy.assets,
    });
  });

  it("round-trips profile: { id, settings } and keeps settings when there is no id", () => {
    const raw = {
      v: 2,
      profile: { id: "hero", settings: HERO },
      assets: [
        {
          id: "a",
          name: "A",
          type: "IMAGE",
          transformBaseUrl: "https://x/t/a",
          alt: "Alt",
          originalAssetWidth: 3000,
          originalAssetHeight: 2000,
          aspectRatio: "3:2",
          focalPoint: { x: 0.3, y: 0.7 },
          operation: "fill",
          mobile: { focalPoint: { x: 0.6, y: 0.4 }, operation: "fill" },
        },
      ],
    };
    const parsed = parseSavedSettings(raw);
    expect(persistedPayload(buildSettingsPayload(parsed, { assets: parsed.assets }))).toEqual(raw);

    const original = parseSavedSettings({
      v: 2,
      profile: {
        settings: { desktop: { targetWidth: 2000 }, mobile: { targetWidth: 960 }, quality: 80, format: "webp" },
      },
      assets: raw.assets,
    });
    expect(original.profile).toBeUndefined();
    expect(original.profileSettings?.desktop).toEqual({ targetWidth: 2000 });
  });

  it("keeps webImage and omits url when DAT is disabled or missing", () => {
    const current = emptySettings();
    const assets = [
      {
        id: "a",
        name: "Hero",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM },
      },
    ];
    const next = buildSettingsPayload(current, { assets, enableDat: true });
    expect(next.assets?.[0].webImage).toEqual({ url: "https://cdn.example/a.jpg" });

    const withDat = [
      {
        id: "b",
        transformBaseUrl: "https://portal.bynder.com/transform/b.jpg",
        webImage: { url: "https://cdn.example/b.jpg" },
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM },
      },
    ];
    const cssOnly = buildSettingsPayload(current, { assets: withDat, enableDat: false });
    expect(cssOnly.assets?.[0].webImage).toEqual({ url: "https://cdn.example/b.jpg" });
    expect(cssOnly.assets?.[0].transformBaseUrl).toBe("https://portal.bynder.com/transform/b.jpg");
  });

  it("strips bulky Bynder files maps so the field stays under Contentstack's 10KB JSON cap", () => {
    const fat = {
      id: "a",
      name: "Hero",
      files: {
        webImage: { url: "https://cdn.example/web.jpg" },
        original: { url: "https://cdn.example/original.jpg", fileSize: 9_000_000 },
        transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
      },
      metaproperties: { brand: { options: ["delta"] } },
    };
    const next = buildSettingsPayload(emptySettings(), { assets: [fat, fat, fat, fat], enableDat: true });
    expect(JSON.stringify(persistedPayload(next)).length).toBeLessThan(10_000);
    expect(next.assets?.[0]).not.toHaveProperty("metaproperties");
    expect(next.assets?.[0]).not.toHaveProperty("files");
    expect(next.assets?.[0].webImage).toBeUndefined();
    expect(next.assets?.[0].transformBaseUrl).toContain("/transform/");
  });

  it("sizes each viewport from the profile and keeps a mobile block only when it differs", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "linked",
        transformBaseUrl: "https://portal.bynder.com/transform/linked.jpg",
        focalPoint: { x: 0.35, y: 0.42 },
        transform: { ...DEFAULT_TRANSFORM },
        mobile: { focalPoint: { x: 0.35, y: 0.42 }, transform: { ...DEFAULT_TRANSFORM, width: 390, aspect: "9:16" } },
      },
      {
        id: "hero",
        transformBaseUrl: "https://portal.bynder.com/transform/hero.jpg",
        focalPoint: { x: 0.4, y: 0.3 },
        transform: { ...DEFAULT_TRANSFORM },
        mobile: { focalPoint: { x: 0.62, y: 0.28 }, transform: { ...DEFAULT_TRANSFORM } },
      },
    ];
    const next = buildSettingsPayload(current, { assets: current.assets, profileSettings: HERO });
    expect(next.assets?.[0].mobile).toBeUndefined();
    expect(next.assets?.[1].transform).toMatchObject({ width: 2000, height: 1125, aspect: "16:9" });
    expect(next.assets?.[1].mobile?.transform).toMatchObject({ width: 960, height: 720, aspect: "4:3" });
  });

  it("drops webImage from a different mobile file that has a transform base", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "desk",
        transformBaseUrl: "https://portal.bynder.com/transform/desk.jpg",
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675 },
        differentMobileAsset: true,
        mobile: {
          id: "mob",
          transformBaseUrl: "https://portal.bynder.com/transform/mob.jpg",
          webImage: { url: "https://cdn.example/mob.jpg" },
          focalPoint: { x: 0.5, y: 0.5 },
          transform: { ...DEFAULT_TRANSFORM, width: 400, height: 400 },
        },
      },
    ];
    const next = buildSettingsPayload(current, { assets: current.assets, enableDat: true });
    expect(next.assets?.[0].mobile?.transformBaseUrl).toContain("mob.jpg");
    expect(next.assets?.[0].mobile?.webImage).toBeUndefined();
    expect(next.assets?.[0].mobile).not.toHaveProperty("asset");
  });

  it("saves configured additionalFields under additional", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "desk",
        transformBaseUrl: "https://portal.bynder.com/transform/desk.jpg",
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675 },
        additional: { uniqueId: true },
      },
    ];
    const next = buildSettingsPayload(current, {
      assets: current.assets,
      enableDat: true,
      authorFields: [{ property: "uniqueId", type: "boolean" }],
    });
    expect(next.assets?.[0]).toMatchObject({ additional: { uniqueId: true } });
    expect(next.assets?.[0]).not.toHaveProperty("uniqueId");
  });
});

describe("parseSavedSettings", () => {
  it("does not select a thumb or open the crop editor on hydrate", () => {
    const assets = [
      {
        id: "a",
        alt: "Hero bottle",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.2, y: 0.8 },
        transform: { width: 800 },
      },
      { id: "b", webImage: { url: "https://cdn.example/b.jpg" }, focalPoint: { x: 0.1, y: 0.1 }, transform: {} },
    ];
    const saved = parseSavedSettings({ v: 1, assets });
    expect(saved.assets?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(saved.activeAssetId).toBeUndefined();
    expect(saved.activeViewport).toBeUndefined();
    expect(saved.focalPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(saved.alt).toBeUndefined();
    expect(parseSavedSettings({ v: 1, assets: [] }).assets).toEqual([]);
  });
});

describe("stashActiveCrop", () => {
  it("writes the live focal/transform onto the focused asset", () => {
    const settings = emptySettings();
    settings.assets = [
      {
        id: "asset-a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM },
      },
    ];
    settings.focalPoint = { x: 0.1, y: 0.9 };
    settings.transform.width = 800;
    const next = stashActiveCrop(settings, "asset-a");
    expect(next.assets?.[0]).toMatchObject({
      focalPoint: { x: 0.1, y: 0.9 },
      transform: { width: 800 },
    });
    expect(next.assets?.[0].mobile).toBeUndefined();
  });

  it("writes a mobile override when the live viewport is mobile", () => {
    const settings = emptySettings();
    settings.activeViewport = "mobile";
    settings.focalPoint = { x: 0.4, y: 0.6 };
    settings.transform = { ...DEFAULT_TRANSFORM, width: 390 };
    settings.assets = [
      {
        id: "asset-a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.1, y: 0.9 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200 },
      },
    ];
    const next = stashActiveCrop(settings, "asset-a");
    expect(next.assets?.[0].transform?.width).toBe(1200);
    expect(next.assets?.[0].mobile).toMatchObject({
      focalPoint: { x: 0.4, y: 0.6 },
      transform: { width: 390 },
    });
  });

  it("does not store a mobile crop when it still matches desktop", () => {
    const settings = emptySettings();
    settings.activeViewport = "mobile";
    settings.focalPoint = { x: 0.1, y: 0.9 };
    settings.transform = { ...DEFAULT_TRANSFORM, width: 1200 };
    settings.assets = [
      {
        id: "asset-a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.1, y: 0.9 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200 },
      },
    ];
    expect(stashActiveCrop(settings, "asset-a").assets?.[0].mobile).toBeUndefined();
  });

  it("drops a mobile focal override when reset matches the desktop focal", () => {
    const settings = emptySettings();
    settings.activeViewport = "mobile";
    settings.focalPoint = { x: 0.5, y: 0.5 };
    settings.transform = { ...DEFAULT_TRANSFORM };
    settings.assets = [
      {
        id: "asset-a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM },
        mobile: { focalPoint: { x: 0.8, y: 0.2 }, transform: { ...DEFAULT_TRANSFORM } },
      },
    ];
    const next = stashActiveCrop(settings, "asset-a");
    expect(next.assets?.[0].mobile).toBeUndefined();
    expect(next.assets?.[0].focalPoint).toEqual({ x: 0.5, y: 0.5 });
    const saved = buildSettingsPayload(next);
    expect(saved.focalPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(saved.assets?.[0].mobile).toBeUndefined();
  });

  it("centers a different mobile file without relinking it to desktop", () => {
    const settings = emptySettings();
    settings.activeViewport = "mobile";
    settings.focalPoint = { x: 0.5, y: 0.5 };
    settings.transform = { ...DEFAULT_TRANSFORM };
    settings.assets = [
      {
        id: "desk",
        webImage: { url: "https://cdn.example/desk.jpg" },
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM },
        differentMobileAsset: true,
        mobile: {
          id: "mob",
          webImage: { url: "https://cdn.example/mob.jpg" },
          focalPoint: { x: 0.8, y: 0.2 },
          transform: { ...DEFAULT_TRANSFORM },
        },
      },
    ];
    const next = stashActiveCrop(settings, "desk");
    expect(next.assets?.[0].differentMobileAsset).toBe(true);
    expect(next.assets?.[0].mobile).toMatchObject({ id: "mob", focalPoint: { x: 0.5, y: 0.5 } });
  });

  it("does not unsync mobile just because its profile size differs from desktop", () => {
    const settings = emptySettings();
    settings.activeViewport = "mobile";
    settings.focalPoint = { x: 0.1, y: 0.9 };
    settings.transform = { ...DEFAULT_TRANSFORM, width: 960, height: 720, aspect: "4:3" };
    settings.assets = [
      {
        id: "asset-a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.1, y: 0.9 },
        transform: { ...DEFAULT_TRANSFORM, width: 2000, aspect: "16:9" },
      },
    ];
    expect(stashActiveCrop(settings, "asset-a").assets?.[0].mobile).toBeUndefined();
  });

  it("persists documents as url + downloadUrl without crop or DAT", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "pdf-guid",
        name: "Spec sheet",
        type: "DOCUMENT",
        url: "https://cdn.example/m/hash/original/spec.pdf",
      },
    ];
    const next = buildSettingsPayload(current, { assets: current.assets, enableDat: true });
    expect(next.assets?.[0]).toEqual({
      id: "pdf-guid",
      name: "Spec sheet",
      type: "DOCUMENT",
      url: "https://cdn.example/m/hash/original/spec.pdf",
      downloadUrl: "https://cdn.example/m/hash/original/spec.pdf?download=true",
    });
  });
});
