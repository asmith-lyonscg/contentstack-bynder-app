import { describe, expect, it } from "vitest";
import { composeDatUrl, cssCropBox, datQueryForWidth, fitPreviewBox, lockToAspect, parseAspect, previewIsToScale, resolveDimensions } from "./composeDatUrl";
import { DEFAULT_TRANSFORM } from "../types";

describe("parseAspect", () => {
  it("parses colon, slash, and x separators", () => {
    expect(parseAspect("16:9")).toEqual({ w: 16, h: 9 });
    expect(parseAspect("4/5")).toEqual({ w: 4, h: 5 });
    expect(parseAspect("1x1")).toEqual({ w: 1, h: 1 });
  });

  it("returns null for empty or invalid values", () => {
    expect(parseAspect("")).toBeNull();
    expect(parseAspect("wide")).toBeNull();
  });
});

describe("resolveDimensions", () => {
  it("computes width from height and aspect", () => {
    expect(resolveDimensions({ operation: "fill", height: 675, aspect: "16:9" })).toEqual({
      width: 1200,
      height: 675,
    });
  });

  it("computes height from width and aspect", () => {
    expect(resolveDimensions({ operation: "fill", width: 400, aspect: "1:1" })).toEqual({
      width: 400,
      height: 400,
    });
  });
});

describe("css crop box", () => {
  it("recomputes height from width when aspect changes", () => {
    const locked = lockToAspect(
      { operation: "fill", width: 1200, height: 675, aspect: "16:9" },
      "1:1"
    );
    expect(locked).toMatchObject({ aspect: "1:1", width: 1200, height: 1200 });
  });

  it("sizes a CSS crop box from aspect and width", () => {
    expect(cssCropBox({ operation: "fill", width: 800, aspect: "16:9" })).toEqual({
      width: 800,
      height: 450,
    });
  });

  it("keeps explicit width and height even when a leftover aspect is present", () => {
    expect(cssCropBox({ operation: "fill", width: 800, height: 1000, aspect: "16:9" })).toEqual({
      width: 800,
      height: 1000,
    });
  });

  it("scales the preview box into the field iframe", () => {
    const tall = fitPreviewBox({ operation: "fill", width: 1200, height: 1200, aspect: "1:1" });
    const wide = fitPreviewBox({ operation: "fill", width: 1200, height: 675, aspect: "16:9" });
    expect(tall.width).toBe(tall.height);
    expect(wide.width).toBeGreaterThan(wide.height);
    expect(tall.sourceWidth).toBe(1200);
    expect(wide.sourceHeight).toBe(675);
    expect(previewIsToScale(wide)).toBe(false);
    expect(
      previewIsToScale(fitPreviewBox({ operation: "fill", width: 320, height: 180, aspect: "16:9" }, 520, 360))
    ).toBe(true);
  });
});

describe("composeDatUrl", () => {
  const base = "https://portal.bynder.com/transform/abc123/hero.jpg";

  it("builds a fill URL with focuspoint, format, and quality", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 0.35, y: 0.42 },
      transform: {
        ...DEFAULT_TRANSFORM,
        operation: "fill",
        width: 1200,
        height: 675,
        format: "webp",
        quality: 80,
      },
    });

    expect(url).toBe(
      "https://portal.bynder.com/transform/abc123/hero.jpg?io=transform:fill,width:1200,height:675&focuspoint=0.35,0.42&format=webp&quality=80"
    );
  });

  it("omits quality for png", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 0.5, y: 0.5 },
      transform: { operation: "fit", width: 800, height: 600, format: "png", quality: 80 },
    });
    expect(url).toContain("io=transform:extend,width:800,height:600");
    expect(url).toContain("format=png");
    expect(url).not.toContain("quality=");
    expect(url).not.toContain("focuspoint=");
  });

  it("adds extend background for Fit letterbox colors", () => {
    expect(
      composeDatUrl(base, {
        transform: {
          operation: "fit",
          width: 110,
          height: 100,
          extendBackground: "transparent",
        },
      })
    ).toContain("io=transform:extend,width:110,height:100,background:00000000");
    expect(
      composeDatUrl(base, {
        transform: {
          operation: "fit",
          width: 110,
          height: 100,
          extendBackground: "custom",
          extendBackgroundColor: "#1a2b3c",
        },
      })
    ).toContain("background:1a2b3c");
    expect(
      composeDatUrl(base, {
        transform: { operation: "fit", width: 110, height: 100, extendBackground: "auto" },
      })
    ).toContain("io=transform:extend,width:110,height:100,background:auto");
  });

  it("positions a crop with gravity from the focal point", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 0.5, y: 0.5 },
      transform: { operation: "crop", width: 50, height: 50 },
    });
    expect(url).toContain("io=transform:crop,width:50,height:50,gravity:center");
  });

  it("clamps focal point into 0-1", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 2, y: -1 },
      transform: { operation: "fill", width: 100, height: 100 },
    });
    expect(url).toContain("focuspoint=1,0");
  });

  it("maps a legacy scale operation to DAT fill", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 0.4, y: 0.6 },
      transform: { operation: "scale", width: 1200, height: 675, format: "webp" },
    });
    expect(url).toContain("io=transform:fill,width:1200,height:675");
    expect(url).not.toContain("scale");
    expect(url).toContain("focuspoint=0.4,0.6");
  });

});

describe("datQueryForWidth", () => {
  const profile = { aspectRatio: "16:9", format: "webp" as const, quality: 80 };

  it("sizes one query to the requested width at the profile aspect", () => {
    expect(datQueryForWidth({ focalPoint: { x: 0.25, y: 0.75 }, operation: "fill" }, profile, 640)).toBe(
      "io=transform:fill,width:640,height:360&focuspoint=0.25,0.75&format=webp&quality=80"
    );
  });

  it("maps Scale to fill and Fit to extend with its letterbox", () => {
    expect(datQueryForWidth({ operation: "scale" }, profile, 1280)).toContain("io=transform:fill,width:1280,height:720");
    const fit = datQueryForWidth({ operation: "fit", extendBackground: "black" }, { ...profile, aspectRatio: "4:3" }, 960);
    expect(fit).toContain("io=transform:extend,width:960,height:720,background:000000");
    expect(fit).not.toContain("focuspoint=");
  });
});
