import { describe, expect, it } from "vitest";
import {
  buildBynderSources,
  composeBynderImageUrl,
  focalPointToObjectPosition,
} from "../delivery/composeBynderImageUrl";

const base = "https://portal.bynder.com/transform/abc/hero.jpg";

const profileSettings = {
  desktop: { aspectRatio: "16:9", targetWidth: 2000 },
  mobile: { aspectRatio: "4:3", targetWidth: 960 },
  quality: 80,
  format: "webp",
};

const entry = {
  v: 2,
  profile: { id: "hero", settings: profileSettings },
  assets: [
    {
      id: "hero",
      transformBaseUrl: base,
      originalAssetWidth: 4000,
      originalAssetHeight: 2667,
      focalPoint: { x: 0.25, y: 0.75 },
      operation: "fill",
    },
  ],
};

describe("composeBynderImageUrl", () => {
  it("defaults to the viewport targetWidth at the profile aspect", () => {
    expect(composeBynderImageUrl(entry)).toBe(
      `${base}?io=transform:fill,width:2000,height:1125&focuspoint=0.25,0.75&format=webp&quality=80`
    );
    expect(composeBynderImageUrl(entry, { viewport: "mobile" })).toContain("width:960,height:720&focuspoint=0.25,0.75");
  });

  it("composes any width and keeps the focal point", () => {
    const url = composeBynderImageUrl(entry, { width: 400 });
    expect(url).toContain("width:400,height:225");
    expect(url).toContain("focuspoint=0.25,0.75");
  });

  it("uses the mobile crop and the mobile file when they are saved", () => {
    const split = {
      ...entry,
      assets: [
        {
          ...entry.assets[0],
          mobile: { focalPoint: { x: 0.8, y: 0.8 }, operation: "fit", id: "phone", transformBaseUrl: "https://x/t/phone" },
        },
      ],
    };
    const mobile = composeBynderImageUrl(split, { viewport: "mobile" });
    expect(mobile).toContain("https://x/t/phone?io=transform:extend,width:960,height:720,background:auto");
    expect(composeBynderImageUrl(split)).toContain(`${base}?io=transform:fill,width:2000`);
  });

  it("returns webImage when DAT was off at save time", () => {
    const css = { ...entry, assets: [{ ...entry.assets[0], webImage: { url: "https://cdn.example/web.jpg" } }] };
    expect(composeBynderImageUrl(css, { width: 400 })).toBe("https://cdn.example/web.jpg");
  });

  it("maps focal point to CSS object-position", () => {
    expect(focalPointToObjectPosition({ x: 0.35, y: 0.42 })).toBe("35% 42%");
  });
});

describe("buildBynderSources", () => {
  it("builds srcset from 640w up to and including targetWidth", () => {
    const sources = buildBynderSources(entry);
    expect(sources?.width).toBe(2000);
    expect(sources?.height).toBe(1125);
    expect(sources?.src).toContain("width:2000,height:1125");
    const widths = sources?.srcset?.split(", ").map((part) => part.split(" ")[1]);
    expect(widths).toEqual(["640w", "960w", "1280w", "1600w", "1920w", "2000w"]);
    expect(sources?.objectPosition).toBe("25% 75%");
  });

  it("stops at the mobile targetWidth and accepts custom widths", () => {
    const mobile = buildBynderSources(entry, { viewport: "mobile" });
    expect(mobile?.srcset?.split(", ").map((part) => part.split(" ")[1])).toEqual(["640w", "960w"]);
    expect(mobile?.height).toBe(720);
    const custom = buildBynderSources(entry, { widths: [320, 3000] });
    expect(custom?.srcset?.split(", ").map((part) => part.split(" ")[1])).toEqual(["320w", "2000w"]);
  });

  it("ignores a legacy zoom and returns a single webImage without DAT", () => {
    const scaled = { ...entry, assets: [{ ...entry.assets[0], operation: "scale", zoom: 1.4 }] };
    const sources = buildBynderSources(scaled);
    expect(sources).not.toHaveProperty("zoom");
    expect(sources?.src).toContain("io=transform:fill");
    const css = { ...entry, assets: [{ ...entry.assets[0], webImage: { url: "https://cdn.example/web.jpg" } }] };
    expect(buildBynderSources(css)).toEqual({ src: "https://cdn.example/web.jpg", objectPosition: "25% 75%" });
  });

  it("still reads a legacy profile string and profileSettings sibling", () => {
    const legacy = { ...entry, profile: "hero", profileSettings };
    expect(composeBynderImageUrl(legacy)).toBe(composeBynderImageUrl(entry));
  });

  it("uses the original aspect ratio without a profile, never wider than the original", () => {
    const original = {
      v: 2,
      profile: {
        settings: { desktop: { targetWidth: 2000 }, mobile: { targetWidth: 960 }, quality: 80, format: "webp" },
      },
      assets: [{ ...entry.assets[0], originalAssetWidth: 1500, originalAssetHeight: 1000 }],
    };
    const desktop = buildBynderSources(original);
    expect(desktop).toMatchObject({ width: 1500, height: 1000 });
    expect(desktop?.src).toContain("io=transform:fill,width:1500,height:1000");
    expect(desktop?.srcset?.split(", ").map((part) => part.split(" ")[1])).toEqual(["640w", "960w", "1280w", "1500w"]);
    expect(buildBynderSources(original, { viewport: "mobile" })).toMatchObject({ width: 960, height: 640 });

    const unknownSize = { ...original, assets: [{ ...entry.assets[0], originalAssetWidth: undefined, originalAssetHeight: undefined }] };
    const scaled = buildBynderSources(unknownSize);
    expect(scaled?.width).toBe(2000);
    expect(scaled).not.toHaveProperty("height");
    expect(scaled?.src).toBe(`${base}?io=transform:scale,width:2000&format=webp&quality=80`);
  });
});
