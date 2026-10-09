import { describe, expect, it } from "vitest";
import { mergeOriginalSizes, missingOriginalSizeIds, originalPixelSizeFromNode } from "./originalDimensions";
import type { SavedBynderAsset } from "../types";

describe("originalPixelSizeFromNode", () => {
  it("prefers the original file over the asset and the web image", () => {
    expect(
      originalPixelSizeFromNode({
        width: 2000,
        height: 1500,
        files: {
          webImage: { url: "https://cdn.example/web.jpg", width: 800, height: 600 },
          original: { url: "https://cdn.example/original.jpg", width: 4000, height: 3000 },
        },
      })
    ).toEqual({ width: 4000, height: 3000 });
  });

  it("reads original pixels when Bynder returns files as a JSON string", () => {
    expect(
      originalPixelSizeFromNode({
        width: 2000,
        height: 1500,
        files: JSON.stringify({
          original: { url: "https://cdn.example/original.jpg", width: 5472, height: 3648 },
        }),
      })
    ).toEqual({ width: 5472, height: 3648 });
  });
});

describe("mergeOriginalSizes", () => {
  const asset: SavedBynderAsset = {
    id: "09C73413-5F93-4D0D-B1594DDB817E06CA",
    type: "IMAGE",
    transformBaseUrl: "https://assets.example/transform/abc/photo",
    focalPoint: { x: 0.5, y: 0.5 },
  };

  it("lists images that have no original size and skips ones that already do", () => {
    expect(missingOriginalSizeIds([asset, { ...asset, id: "known", originalAssetWidth: 10, originalAssetHeight: 10 }])).toEqual([
      asset.id,
    ]);
  });

  it("fills missing pixels and leaves an existing size alone", () => {
    const sizes = new Map([
      [asset.id, { width: 5472, height: 3648 }],
      ["known", { width: 1, height: 1 }],
    ]);
    const merged = mergeOriginalSizes(
      [asset, { ...asset, id: "known", originalAssetWidth: 10, originalAssetHeight: 20, aspectRatio: "1:2" }],
      sizes
    );
    expect(merged?.[0]).toMatchObject({ originalAssetWidth: 5472, originalAssetHeight: 3648, aspectRatio: "3:2" });
    expect(merged?.[1]).toMatchObject({ originalAssetWidth: 10, originalAssetHeight: 20 });
  });
});
