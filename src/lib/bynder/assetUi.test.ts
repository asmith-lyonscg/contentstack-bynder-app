import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSFORM } from "../types";
import { bynderMediaUrl, formatFileSize, listThumbForAsset, moveAsset, thumbCaption } from "./assetUi";
import { scaleToMinSide } from "./composeDatUrl";

describe("moveAsset", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves an item to the drop target index", () => {
    expect(moveAsset(list, "a", "c").map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(moveAsset(list, "c", "a").map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  it("returns the same list when ids are missing or unchanged", () => {
    expect(moveAsset(list, "a", "a")).toBe(list);
    expect(moveAsset(list, "z", "a")).toBe(list);
  });
});

describe("bynderMediaUrl", () => {
  it("opens the portal media page for the database id", () => {
    expect(
      bynderMediaUrl("https://acme.getbynder.com/", { id: "graphql", databaseId: "ASSET-1" })
    ).toBe("https://acme.getbynder.com/media/?mediaId=ASSET-1");
  });
});

describe("listThumbForAsset", () => {
  const asset = {
    id: "a",
    sourceUrl: "https://cdn.example/original.jpg",
    transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
    width: 1600,
    height: 900,
  };

  it("uses the source image, focal position, and layout size", () => {
    const thumb = listThumbForAsset({
      asset,
      datAllowed: true,
      live: {
        focalPoint: { x: 0.2, y: 0.8 },
        transform: { ...DEFAULT_TRANSFORM, width: 1200, height: 675, aspect: "16:9" },
        datEnabled: true,
      },
    });
    expect(thumb.url).toBe(asset.sourceUrl);
    expect(thumb.height).toBe(200);
    expect(thumb.width).toBe(200);
    expect(thumb.objectPosition).toBe("20% 80%");
    expect(thumb.operation).toBe("fill");
    expect(thumb.aspectW).toBe(1200);
    expect(thumb.aspectH).toBe(675);
    expect(thumb.caption).toBe("16:9 · WebP · 1200w");
  });

  it("falls back to the original image when there is no transform URL", () => {
    const thumb = listThumbForAsset({
      asset: { ...asset, transformBaseUrl: undefined },
      datAllowed: true,
      live: {
        focalPoint: { x: 0.25, y: 0.75 },
        transform: { ...DEFAULT_TRANSFORM, width: 800, height: 1000, aspect: "4:5" },
        datEnabled: true,
      },
    });
    expect(thumb.url).toBe(asset.sourceUrl);
    expect(thumb.width).toBe(200);
    expect(thumb.height).toBe(200);
    expect(thumb.objectPosition).toBe("25% 75%");
  });

  it("uses a 300×200 desktop slot when asked", () => {
    expect(
      listThumbForAsset({
        asset,
        datAllowed: false,
        slot: { width: 300, height: 200 },
      })
    ).toMatchObject({ width: 300, height: 200 });
  });
});

describe("scaleToMinSide", () => {
  it("keeps the short side at 64 and lets the long side grow", () => {
    expect(scaleToMinSide(1200, 675)).toEqual({ width: 114, height: 64 });
    expect(scaleToMinSide(800, 1000)).toEqual({ width: 64, height: 80 });
    expect(scaleToMinSide(500, 500)).toEqual({ width: 64, height: 64 });
  });
});

describe("thumbCaption", () => {
  it("joins aspect, type, target width, and file size when they exist", () => {
    expect(thumbCaption({ aspect: "16:9", format: "webp", targetWidth: 2000 })).toBe("16:9 · WebP · 2000w");
    expect(thumbCaption({ aspect: "4:3", fileType: "jpg", fileSize: 2 * 1024 * 1024 })).toBe("4:3 · JPG · 2.0 MB");
    expect(thumbCaption({})).toBeUndefined();
  });

  it("shows the profile width with DAT and the file size without it", () => {
    const asset = { id: "a", sourceUrl: "https://x/a.jpg", fileType: "jpg", fileSize: 1024 };
    const transform = { ...DEFAULT_TRANSFORM, width: 960, height: 720, aspect: "4:3" };
    expect(listThumbForAsset({ asset, live: { transform }, datAllowed: false }).caption).toBe("4:3 · JPG · 1.0 KB");
    expect(
      listThumbForAsset({ asset: { ...asset, transformBaseUrl: "https://x/t" }, live: { transform }, datAllowed: true })
        .caption
    ).toBe("4:3 · WebP · 960w");
  });
});

describe("formatFileSize", () => {
  it("omits empty or invalid sizes instead of rendering NaN", () => {
    expect(formatFileSize(undefined)).toBeUndefined();
    expect(formatFileSize(Number.NaN)).toBeUndefined();
    expect(formatFileSize(0)).toBeUndefined();
  });

  it("formats bytes through GB", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
