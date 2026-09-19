import { describe, expect, it } from "vitest";
import { buildSettingsPayload, emptySettings, parseSavedSettings, persistedPayload, stashActiveCrop } from "./settings";
import { DEFAULT_TRANSFORM } from "./types";

describe("buildSettingsPayload", () => {
  it("persists only v + assets, with crop and DAT url on each asset", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "earth",
        name: "Earth",
        transformBaseUrl: "https://portal.bynder.com/transform/earth.jpg",
        webImage: { url: "https://cdn.example/earth.jpg" },
        focalPoint: { x: 0.35, y: 0.42 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675, aspect: "16:9" },
      },
    ];
    const next = buildSettingsPayload(current, { assets: current.assets, enableDat: true });
    expect(persistedPayload(next)).toEqual({
      v: 1,
      assets: next.assets,
    });
    expect(next.assets?.[0]).toMatchObject({
      id: "earth",
      name: "Earth",
      transformBaseUrl: "https://portal.bynder.com/transform/earth.jpg",
      focalPoint: { x: 0.35, y: 0.42 },
    });
    expect(next.assets?.[0].url).toContain("transform/earth.jpg");
    expect(next.assets?.[0].webImage).toBeUndefined();
    expect(next).not.toHaveProperty("crops");
    expect(next).not.toHaveProperty("datEnabled");
    expect(next).not.toHaveProperty("assetId");
    expect(next).not.toHaveProperty("sourceUrl");
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
    expect(next.assets?.[0].url).toBeUndefined();
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
    expect(cssOnly.assets?.[0].url).toBeUndefined();
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

  it("writes a composed DAT URL onto every asset, including unmatched mobile", () => {
    const current = emptySettings();
    current.assets = [
      {
        id: "earth",
        name: "Earth",
        transformBaseUrl: "https://portal.bynder.com/transform/earth.jpg",
        focalPoint: { x: 0.35, y: 0.42 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675, aspect: "16:9" },
      },
      {
        id: "bottle",
        name: "Bottle",
        transformBaseUrl: "https://portal.bynder.com/transform/bottle.jpg",
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675, aspect: "16:9" },
      },
      {
        id: "hero",
        name: "Hero",
        transformBaseUrl: "https://portal.bynder.com/transform/hero.jpg",
        focalPoint: { x: 0.4, y: 0.3 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675, aspect: "16:9" },
        mobile: {
          focalPoint: { x: 0.62, y: 0.28 },
          transform: { ...DEFAULT_TRANSFORM, width: 390, height: 693, aspect: "9:16" },
        },
      },
    ];
    const next = buildSettingsPayload(current, { assets: current.assets, enableDat: true });
    expect(next.assets?.[0].url).toContain("transform/earth.jpg");
    expect(next.assets?.[0].mobile).toBeUndefined();
    expect(next.assets?.[1].url).toContain("transform/bottle.jpg");
    expect(next.assets?.[2].url).toContain("width:1200");
    expect(next.assets?.[2].mobile?.url).toContain("width:390");
    expect(next.assets?.[2].mobile?.url).not.toBe(next.assets?.[2].url);
    expect(next.assets?.[2]).not.toHaveProperty("mobileLinked");
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
    expect(next.assets?.[0].transform.width).toBe(1200);
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

  it("does not unsync mobile just because extraQuery serialization differs", () => {
    const settings = emptySettings();
    settings.activeViewport = "mobile";
    settings.focalPoint = { x: 0.1, y: 0.9 };
    settings.transform = { ...DEFAULT_TRANSFORM, width: 1200 };
    delete settings.transform.extraQuery;
    settings.assets = [
      {
        id: "asset-a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.1, y: 0.9 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, extraQuery: "" },
      },
    ];
    expect(stashActiveCrop(settings, "asset-a").assets?.[0].mobile).toBeUndefined();
  });
});
