import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSFORM } from "../types";
import { bynderMediaUrl, formatFileSize, listThumbForAsset, moveAsset, thumbCaption } from "./assetUi";

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
      },
    });
    expect(thumb.url).toBe(asset.sourceUrl);
    expect(thumb.height).toBe(200);
    expect(thumb.width).toBe(200);
    expect(thumb.objectPosition).toBe("20% 80%");
    expect(thumb.aspectW).toBe(16);
    expect(thumb.aspectH).toBe(9);
    expect(thumb.caption).toBe("16:9 · WebP");
  });

  it("falls back to the original image when there is no transform URL", () => {
    const thumb = listThumbForAsset({
      asset: { ...asset, transformBaseUrl: undefined },
      datAllowed: true,
      live: {
        focalPoint: { x: 0.25, y: 0.75 },
        transform: { ...DEFAULT_TRANSFORM, width: 800, height: 1000, aspect: "4:5" },
      },
    });
    expect(thumb.url).toBe(asset.sourceUrl);
    expect(thumb.width).toBe(200);
    expect(thumb.height).toBe(200);
    expect(thumb.objectPosition).toBe("25% 75%");
  });

  it("frames a manual URL image at the file's natural aspect, ignoring any profile transform", () => {
    const thumb = listThumbForAsset({
      asset: {
        id: "url-a",
        source: "url",
        type: "IMAGE",
        sourceUrl: "https://cdn.example/hero.jpg",
        width: 1200,
        height: 1200,
      },
      datAllowed: false,
      live: {
        transform: { ...DEFAULT_TRANSFORM, aspect: "16:9" },
      },
      slot: { width: 300, height: 200 },
      naturalSize: { width: 1200, height: 1200 },
    });
    expect(thumb.aspectW).toBe(1);
    expect(thumb.aspectH).toBe(1);
    expect(thumb.caption).toBe("1:1");
  });

  it("frames a video at the file's natural aspect, ignoring any profile transform", () => {
    const thumb = listThumbForAsset({
      asset: {
        id: "clip",
        type: "VIDEO",
        sourceUrl: "https://cdn.example/clip.mp4",
        fileType: "mp4",
        fileSize: 4_000_000,
        width: 1920,
        height: 1080,
      },
      datAllowed: false,
      live: {
        transform: { ...DEFAULT_TRANSFORM, aspect: "1:1" },
      },
      slot: { width: 300, height: 200 },
      naturalSize: { width: 1080, height: 1920 },
    });
    expect(thumb.aspectW).toBe(9);
    expect(thumb.aspectH).toBe(16);
    expect(thumb.caption).toBe("9:16 · MP4 · 3.8 MB");
  });

  it("uses a YouTube poster image instead of the watch URL", () => {
    const thumb = listThumbForAsset({
      asset: {
        id: "yt",
        type: "VIDEO",
        source: "url",
        sourceUrl: "https://www.youtube.com/watch?v=FezVApPddqU",
      },
      datAllowed: false,
      slot: { width: 300, height: 200 },
    });
    expect(thumb.url).toBe("https://img.youtube.com/vi/FezVApPddqU/hqdefault.jpg");
    expect(thumb.aspectW).toBe(16);
    expect(thumb.aspectH).toBe(9);
  });

  it("frames a document as a letter page and does not use the image profile", () => {
    const thumb = listThumbForAsset({
      asset: { id: "pdf", type: "DOCUMENT", sourceUrl: "https://cdn.example/spec.pdf" },
      datAllowed: false,
      live: {
        focalPoint: { x: 0.5, y: 0.5 },
        transform: { ...DEFAULT_TRANSFORM, aspect: "21:9" },
      },
      slot: { width: 300, height: 200 },
    });
    expect(thumb.aspectW).toBe(17);
    expect(thumb.aspectH).toBe(22);
    expect(thumb.objectPosition).toBe("0% 0%");
    expect(thumb.caption).toBeUndefined();
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

describe("thumbCaption", () => {
  it("joins aspect, type, and file size when they exist", () => {
    expect(thumbCaption({ aspect: "16:9", format: "webp" })).toBe("16:9 · WebP");
    expect(thumbCaption({ aspect: "4:3", fileType: "jpg", fileSize: 2 * 1024 * 1024 })).toBe("4:3 · JPG · 2.0 MB");
    expect(thumbCaption({})).toBeUndefined();
  });

  it("shows the file type with DAT and the file size without it", () => {
    const asset = { id: "a", sourceUrl: "https://x/a.jpg", fileType: "jpg", fileSize: 1024 };
    const transform = { ...DEFAULT_TRANSFORM, width: 960, height: 720, aspect: "4:3" };
    expect(listThumbForAsset({ asset, live: { transform }, datAllowed: false }).caption).toBe("4:3 · JPG · 1.0 KB");
    expect(
      listThumbForAsset({ asset: { ...asset, transformBaseUrl: "https://x/t" }, live: { transform }, datAllowed: true })
        .caption
    ).toBe("4:3 · WebP");
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
