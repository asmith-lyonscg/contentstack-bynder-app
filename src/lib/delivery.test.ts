import { describe, expect, it } from "vitest";
import {
  buildBynderSources,
  composeBynderImageUrl,
  focalPointToObjectPosition,
} from "../delivery/composeBynderImageUrl";

const base = "https://portal.bynder.com/transform/abc/hero.jpg";

const profileSettings = {
  desktop: "16:9",
  mobile: "4:3",
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
      origWidth: 4000,
      origHeight: 2667,
      focalPoint: { x: 0.25, y: 0.75 },
      operation: "fill",
    },
  ],
};

describe("composeBynderImageUrl", () => {
  it("defaults to the largest srcset step at the profile aspect", () => {
    expect(composeBynderImageUrl(entry)).toBe(
      `${base}?io=transform:fill,width:2000,height:1125&focuspoint=0.25,0.75&format=webp&quality=80`
    );
    expect(composeBynderImageUrl(entry, { viewport: "mobile" })).toContain("width:2000,height:1500&focuspoint=0.25,0.75");
  });

  it("limits a request so neither side passes the Bynder max dimension", () => {
    const tall = {
      ...entry,
      profile: {
        id: "poster",
        settings: {
          ...profileSettings,
          desktop: "9:16",
          maxDimension: 2000,
        },
      },
    };
    expect(composeBynderImageUrl(tall)).toContain("width:1125,height:2000");
    expect(composeBynderImageUrl(entry, { width: 4000 })).toContain("width:2000,height:1125");
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
          mobile: { focalPoint: { x: 0.8, y: 0.8 }, operation: "fill", id: "phone", transformBaseUrl: "https://x/t/phone" },
        },
      ],
    };
    const mobile = composeBynderImageUrl(split, { viewport: "mobile" });
    expect(mobile).toContain("https://x/t/phone?io=transform:fill,width:2000,height:1500");
    expect(composeBynderImageUrl(split)).toContain(`${base}?io=transform:fill,width:2000`);
  });

  it("uses DAT when a transform URL is saved, and webImage only when it is not", () => {
    const both = { ...entry, assets: [{ ...entry.assets[0], webImage: { url: "https://cdn.example/web.jpg" } }] };
    expect(composeBynderImageUrl(both, { width: 400 })).toContain("io=transform:fill,width:400,height:225");
    const css = {
      ...entry,
      assets: [{ ...entry.assets[0], transformBaseUrl: undefined, webImage: { url: "https://cdn.example/web.jpg" } }],
    };
    expect(composeBynderImageUrl(css, { width: 400 })).toBe("https://cdn.example/web.jpg");
  });

  it("maps focal point to CSS object-position", () => {
    expect(focalPointToObjectPosition({ x: 0.35, y: 0.42 })).toBe("35% 42%");
  });
});

describe("buildBynderSources", () => {
  it("builds a srcset from the default ladder, capped at maxDimension", () => {
    const sources = buildBynderSources(entry);
    expect(sources?.width).toBe(2000);
    expect(sources?.height).toBe(1125);
    expect(sources?.src).toContain("width:2000,height:1125");
    const widths = sources?.srcset?.split(", ").map((part) => part.split(" ")[1]);
    expect(widths).toEqual(["640w", "960w", "1280w", "1600w", "1920w", "2000w"]);
    expect(sources?.objectPosition).toBe("25% 75%");
  });

  it("mirrors left to right after the crop and flips the CSS position", () => {
    const mirrored = {
      ...entry,
      assets: [{ ...entry.assets[0], mirror: true }],
    };
    const sources = buildBynderSources(mirrored);
    expect(sources?.src).toContain("io=transform:fill,width:2000,height:1125&io=transform:mirror&focuspoint=0.25,0.75");
    expect(sources?.objectPosition).toBe("75% 75%");
  });

  it("caps a caller width list and uses the mobile aspect", () => {
    const mobile = buildBynderSources(entry, { viewport: "mobile" });
    expect(mobile?.width).toBe(2000);
    expect(mobile?.height).toBe(1500);
    const custom = buildBynderSources(entry, { widths: [320, 3000] });
    expect(custom?.srcset?.split(", ").map((part) => part.split(" ")[1])).toEqual(["320w", "2000w"]);
  });

  it("returns a single webImage when the file has no transform URL", () => {
    const css = {
      ...entry,
      assets: [{ ...entry.assets[0], transformBaseUrl: undefined, webImage: { url: "https://cdn.example/web.jpg" } }],
    };
    expect(buildBynderSources(css)).toEqual({ src: "https://cdn.example/web.jpg", objectPosition: "25% 75%" });
  });

  it("uses the original aspect ratio without a profile, capped only by maxDimension", () => {
    const original = {
      v: 2,
      profile: {
        settings: { quality: 80, format: "webp" },
      },
      assets: [{ ...entry.assets[0], origWidth: 1500, origHeight: 1000 }],
    };
    const desktop = buildBynderSources(original);
    expect(desktop).toMatchObject({ width: 2000, height: 1333 });
    expect(desktop?.src).toContain("io=transform:fill,width:2000,height:1333");
    expect(desktop?.srcset?.split(", ").map((part) => part.split(" ")[1])).toEqual([
      "640w",
      "960w",
      "1280w",
      "1600w",
      "1920w",
      "2000w",
    ]);

    const unknownSize = { ...original, assets: [{ ...entry.assets[0], origWidth: undefined, origHeight: undefined }] };
    const scaled = buildBynderSources(unknownSize);
    expect(scaled?.width).toBe(2000);
    expect(scaled).not.toHaveProperty("height");
    expect(scaled?.src).toBe(`${base}?io=transform:scale,width:2000&format=webp&quality=80`);
  });
});
