import { describe, expect, it } from "vitest";
import { buildSettingsPayload, emptySettings, parseSavedSettings } from "./settings";

describe("buildSettingsPayload", () => {
  it("clears sibling snapshot fields when extras explicitly pass undefined", () => {
    const current = emptySettings("hero_image");
    current.assetId = "asset-1";
    current.sourceUrl = "https://cdn.example/web.jpg";
    current.transformBaseUrl = "https://portal.bynder.com/transform/abc/hero.jpg";
    current.datEnabled = true;

    const next = buildSettingsPayload(current, {
      assetId: undefined,
      sourceUrl: undefined,
      transformBaseUrl: undefined,
      datEnabled: false,
    });

    expect(next.assetId).toBeUndefined();
    expect(next.sourceUrl).toBeUndefined();
    expect(next.transformBaseUrl).toBeUndefined();
    expect(next.datEnabled).toBe(false);
    expect(next.url).toBeUndefined();
  });

  it("persists Compact View assets and drops an empty array", () => {
    const current = emptySettings();
    const assets = [{ id: "a", files: { webImage: { url: "https://cdn.example/a.jpg" } } }];
    const withAssets = buildSettingsPayload(current, {
      assetId: "a",
      sourceUrl: "https://cdn.example/a.jpg",
      assets,
    });
    expect(withAssets.assets).toEqual(assets);
    expect(buildSettingsPayload(withAssets, { assets: [] }).assets).toBeUndefined();
  });
});

describe("parseSavedSettings", () => {
  it("hydrates assets and treats empty assets as no picker selection", () => {
    const assets = [{ id: "a", files: { webImage: { url: "https://cdn.example/a.jpg" } } }];
    expect(parseSavedSettings({ v: 1, assets, focalPoint: { x: 0.2, y: 0.3 } }).assets).toEqual(assets);
    expect(parseSavedSettings({ v: 1, assets: [] }).assets).toEqual([]);
    expect(parseSavedSettings(null).assets).toBeUndefined();
  });
});
