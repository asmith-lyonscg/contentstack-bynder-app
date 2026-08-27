import { describe, expect, it } from "vitest";
import { buildSettingsPayload, emptySettings } from "./settings";

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
});
