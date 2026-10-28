import { describe, expect, it } from "vitest";
import { composeDatUrl, cssCropBox, datQueryForWidth, fitPreviewBox, parseAspect, resolveDimensions } from "./composeDatUrl";
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
    expect(fitPreviewBox({ operation: "fill", width: 320, height: 180, aspect: "16:9" }, 520, 360)).toMatchObject({
      width: 320,
      height: 180,
    });
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

  it("adds a horizontal mirror after the fill", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 0.5, y: 0.5 },
      mirror: true,
      transform: { ...DEFAULT_TRANSFORM, operation: "fill", width: 1600, height: 900, format: "webp", quality: 80 },
    });
    expect(url).toBe(
      "https://portal.bynder.com/transform/abc123/hero.jpg?io=transform:fill,width:1600,height:900&io=transform:mirror&focuspoint=0.5,0.5&format=webp&quality=80"
    );
  });

  it("omits quality for png", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 0.5, y: 0.5 },
      transform: { operation: "fill", width: 800, height: 600, format: "png", quality: 80 },
    });
    expect(url).toContain("io=transform:fill,width:800,height:600");
    expect(url).toContain("format=png");
    expect(url).toContain("focuspoint=0.5,0.5");
    expect(url).not.toContain("quality=");
  });

  it("clamps focal point into 0-1", () => {
    const url = composeDatUrl(base, {
      focalPoint: { x: 2, y: -1 },
      transform: { operation: "fill", width: 100, height: 100 },
    });
    expect(url).toContain("focuspoint=1,0");
  });

});

describe("datQueryForWidth", () => {
  const profile = { aspectRatio: "16:9", format: "webp" as const, quality: 80 };

  it("sizes one query to the requested width at the profile aspect", () => {
    expect(datQueryForWidth({ focalPoint: { x: 0.25, y: 0.75 } }, profile, 640)).toBe(
      "io=transform:fill,width:640,height:360&focuspoint=0.25,0.75&format=webp&quality=80"
    );
  });

  it("mirrors a proportional scale when there is no aspect ratio", () => {
    expect(datQueryForWidth({ mirror: true }, { format: "webp", quality: 80 }, 640)).toContain(
      "io=transform:scale,width:640&io=transform:mirror&format=webp"
    );
  });

  it("uses the center when the focal point is missing", () => {
    expect(datQueryForWidth({}, profile, 1280)).toContain("io=transform:fill,width:1280,height:720&focuspoint=0.5,0.5");
  });
});
