import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSFORM } from "./types";
import {
  cropSliceForAsset,
  resolveActiveViewport,
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
    expect(viewportCrop(crop, "desktop")?.transform.width).toBe(1200);
    expect(viewportCrop(crop, "mobile")?.transform.width).toBe(1200);
    expect(
      viewportCrop(
        {
          ...crop,
          mobile: { focalPoint: { x: 0.5, y: 0.5 }, transform: { ...DEFAULT_TRANSFORM, width: 400 } },
        },
        "mobile"
      )?.transform.width
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

    expect(cropSliceForAsset(settings, "a", "mobile", DEFAULT_TRANSFORM).transform.width).toBe(390);
    expect(cropSliceForAsset(settings, "a", "desktop", DEFAULT_TRANSFORM).transform.width).toBe(1200);
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
  it("treats empty extraQuery as the same crop", () => {
    const desktop = {
      focalPoint: { x: 0.2, y: 0.3 },
      transform: { ...DEFAULT_TRANSFORM, extraQuery: "" },
    };
    const live = {
      focalPoint: { x: 0.2, y: 0.3 },
      transform: { ...DEFAULT_TRANSFORM },
    };
    delete live.transform.extraQuery;
    expect(viewportCropsEqual(desktop, live)).toBe(true);
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
