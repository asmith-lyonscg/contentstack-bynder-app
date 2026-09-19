import { describe, expect, it } from "vitest";
import { composeBynderImageUrl, focalPointToObjectPosition } from "../delivery/composeBynderImageUrl";
import { emptySettings } from "./settings";
import { DEFAULT_TRANSFORM } from "./types";

describe("composeBynderImageUrl", () => {
  it("applies breakpoint overrides while keeping focal point", () => {
    const settings = emptySettings();
    settings.assets = [
      {
        id: "hero",
        transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
        focalPoint: { x: 0.25, y: 0.75 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675 },
        url: "https://portal.bynder.com/transform/abc/hero.jpg?io=transform:fill,width:1200,height:675",
      },
    ];
    settings.activeAssetId = "hero";
    settings.focalPoint = { x: 0.25, y: 0.75 };
    settings.transform = { ...DEFAULT_TRANSFORM, width: 1200, height: 675 };

    const url = composeBynderImageUrl(settings, { width: 400 });
    expect(url).toContain("width:400");
    expect(url).toContain("height:225");
    expect(url).toContain("focuspoint=0.25,0.75");
  });

  it("maps focal point to CSS object-position", () => {
    expect(focalPointToObjectPosition({ x: 0.35, y: 0.42 })).toBe("35% 42%");
  });

  it("falls back to webImage when DAT was not saved", () => {
    const settings = emptySettings();
    settings.assets = [
      {
        id: "a",
        webImage: { url: "https://cdn.example/from-assets.jpg" },
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM },
      },
    ];
    expect(composeBynderImageUrl(settings)).toBe("https://cdn.example/from-assets.jpg");
  });

  it("returns webImage when transformBaseUrl exists but url was omitted (enableDat false)", () => {
    const settings = emptySettings();
    settings.assets = [
      {
        id: "hero",
        webImage: { url: "https://cdn.example/web.jpg" },
        transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675 },
      },
    ];
    expect(composeBynderImageUrl(settings, { width: 400 })).toBe("https://cdn.example/web.jpg");
  });

  it("composes the mobile crop when requested", () => {
    const settings = emptySettings();
    settings.activeAssetId = "a";
    settings.transform = { ...DEFAULT_TRANSFORM, width: 1200, height: 675 };
    settings.assets = [
      {
        id: "a",
        transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
        focalPoint: { x: 0.2, y: 0.2 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675 },
        url: "https://portal.bynder.com/transform/abc/hero.jpg?io=width:1200",
        mobile: {
          focalPoint: { x: 0.8, y: 0.8 },
          transform: { ...DEFAULT_TRANSFORM, width: 390, height: 844, aspect: "9:19" },
          url: "https://portal.bynder.com/transform/abc/hero.jpg?io=width:390",
        },
      },
    ];
    const mobile = composeBynderImageUrl(settings, { viewport: "mobile" });
    expect(mobile).toContain("width:390");
    expect(mobile).toContain("focuspoint=0.8,0.8");
    const desktop = composeBynderImageUrl(settings);
    expect(desktop).toContain("width:1200");
  });
});
