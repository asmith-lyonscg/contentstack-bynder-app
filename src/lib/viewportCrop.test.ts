import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSFORM } from "./types";
import {
  cropSliceForAsset,
  resolveActiveViewport,
  stripMatchingMobile,
  viewportCrop,
  viewportCropsEqual,
  withoutDesktopMobile,
  withoutMobileCrop,
} from "./viewportCrop";
import { emptySettings } from "./settings";

describe("viewportCrop", () => {
  it("uses the desktop crop until mobile has been customized", () => {
    const crop = {
      focalPoint: { x: 0.2, y: 0.3 },
      transform: { ...DEFAULT_TRANSFORM, width: 1200 },
    };
    expect(viewportCrop(crop, "desktop")?.transform?.width).toBe(1200);
    expect(viewportCrop(crop, "mobile")?.transform?.width).toBe(1200);
    expect(
      viewportCrop(
        {
          ...crop,
          mobile: { focalPoint: { x: 0.5, y: 0.5 }, transform: { ...DEFAULT_TRANSFORM, width: 400 } },
        },
        "mobile"
      )?.transform?.width
    ).toBe(400);
  });
});

describe("cropSliceForAsset", () => {
  it("reads live settings for the active viewport and stored assets otherwise", () => {
    const settings = emptySettings();
    settings.activeAssetId = "a";
    settings.activeViewport = "mobile";
    settings.focalPoint = { x: 0.1, y: 0.9 };
    settings.transform = { ...DEFAULT_TRANSFORM, width: 390 };
    settings.assets = [
      {
        id: "a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.2, y: 0.3 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200 },
        mobile: { focalPoint: { x: 0.4, y: 0.4 }, transform: { ...DEFAULT_TRANSFORM, width: 600 } },
      },
    ];

    expect(cropSliceForAsset(settings, "a", "mobile", DEFAULT_TRANSFORM).transform?.width).toBe(390);
    expect(cropSliceForAsset(settings, "a", "desktop", DEFAULT_TRANSFORM).transform?.width).toBe(1200);
  });
});

describe("withoutMobileCrop", () => {
  it("drops the mobile override so the pair is linked again", () => {
    expect(resolveActiveViewport({ activeViewport: "mobile" })).toBe("mobile");
    expect(
      withoutMobileCrop({
        focalPoint: { x: 0.2, y: 0.3 },
        transform: DEFAULT_TRANSFORM,
        mobile: { focalPoint: { x: 0.5, y: 0.5 }, transform: DEFAULT_TRANSFORM },
      })?.mobile
    ).toBeUndefined();
  });
});

describe("viewportCropsEqual", () => {
  const desktop = { focalPoint: { x: 0.2, y: 0.3 }, transform: { ...DEFAULT_TRANSFORM, width: 2000, aspect: "16:9" } };

  it("ignores profile size, aspect, format, and quality", () => {
    const mobile = {
      focalPoint: { x: 0.2, y: 0.3 },
      transform: { ...DEFAULT_TRANSFORM, width: 960, height: 720, aspect: "4:3", quality: 60 },
    };
    expect(viewportCropsEqual(desktop, mobile)).toBe(true);
  });

  it("compares focal point, operation, and letterbox, and ignores a legacy zoom", () => {
    const with_ = (transform: object, focalPoint = desktop.focalPoint) => ({
      focalPoint,
      transform: { ...desktop.transform, ...transform },
    });
    expect(viewportCropsEqual(desktop, with_({}, { x: 0.6, y: 0.3 }))).toBe(false);
    expect(viewportCropsEqual(desktop, with_({ operation: "fit" }))).toBe(false);
    expect(viewportCropsEqual(with_({ operation: "scale" }), with_({ operation: "fill" }))).toBe(true);
    expect(viewportCropsEqual(desktop, with_({ zoom: 2 }))).toBe(true);
    expect(
      viewportCropsEqual(with_({ operation: "fit" }), with_({ operation: "fit", extendBackground: "black" }))
    ).toBe(false);
  });
});

describe("stripMatchingMobile", () => {
  const crop = { focalPoint: { x: 0.2, y: 0.3 }, transform: { ...DEFAULT_TRANSFORM, aspect: "1:1" } };

  it("relinks a 'different' mobile that is the desktop file with the same crop", () => {
    const next = stripMatchingMobile({
      id: "a",
      alt: "Hero",
      ...crop,
      differentMobileAsset: true,
      mobile: { ...crop, id: "a", alt: "Hero" },
    });
    expect(next).not.toHaveProperty("mobile");
    expect(next).not.toHaveProperty("differentMobileAsset");
  });

  it("keeps the split when the file, crop, or alt differs", () => {
    const base = { id: "a", alt: "Hero", ...crop, differentMobileAsset: true as const };
    expect(stripMatchingMobile({ ...base, mobile: { ...crop, id: "b" } }).mobile?.id).toBe("b");
    expect(
      stripMatchingMobile({ ...base, mobile: { ...crop, focalPoint: { x: 0.6, y: 0.3 }, id: "a" } }).mobile
    ).toBeDefined();
    expect(stripMatchingMobile({ ...base, mobile: { ...crop, id: "a", alt: "Phone" } }).mobile).toBeDefined();
  });

  it("keeps a pending different-file switch that has no file yet", () => {
    const next = stripMatchingMobile({ id: "a", ...crop, differentMobileAsset: true, mobile: { ...crop } });
    expect(next.differentMobileAsset).toBe(true);
  });
});

describe("withoutDesktopMobile", () => {
  it("drops mobile crops and viewport", () => {
    const settings = emptySettings();
    settings.activeViewport = "mobile";
    settings.assets = [
      {
        id: "a",
        webImage: { url: "https://cdn.example/a.jpg" },
        focalPoint: { x: 0.2, y: 0.3 },
        transform: DEFAULT_TRANSFORM,
        mobile: { focalPoint: { x: 0.8, y: 0.8 }, transform: DEFAULT_TRANSFORM },
      },
    ];
    const next = withoutDesktopMobile(settings);
    expect(next.activeViewport).toBeUndefined();
    expect(next.assets?.[0].mobile).toBeUndefined();
    expect(next.assets?.[0].focalPoint).toEqual({ x: 0.2, y: 0.3 });
  });
});
