import { describe, expect, it } from "vitest";
import { inferTransformBaseUrl, parseBynderAsset } from "./parseAsset";

describe("inferTransformBaseUrl", () => {
  it("strips query params from a DAT URL", () => {
    expect(
      inferTransformBaseUrl(
        "https://portal.bynder.com/transform/abc/hero.jpg?io=transform:fill,width:800"
      )
    ).toBe("https://portal.bynder.com/transform/abc/hero.jpg");
  });

  it("returns undefined for non-DAT URLs", () => {
    expect(inferTransformBaseUrl("https://portal.bynder.com/m/hash/webimage.jpg")).toBeUndefined();
  });
});

describe("parseBynderAsset", () => {
  it("reads the first item from an array and transformBaseUrl string", () => {
    const parsed = parseBynderAsset([
      {
        id: "encoded-id",
        databaseId: "2DC52E62-5FB1-4938-BF689857EF9B51E2",
        name: "Earth",
        type: "IMAGE",
        files: {
          webImage: { url: "https://cdn.example/web.jpg", width: 800, height: 600 },
          transformBaseUrl: "https://portal.bynder.com/transform/abc/earth.jpg",
        },
      },
    ]);

    expect(parsed).toMatchObject({
      id: "2DC52E62-5FB1-4938-BF689857EF9B51E2",
      name: "Earth",
      transformBaseUrl: "https://portal.bynder.com/transform/abc/earth.jpg",
      sourceUrl: "https://cdn.example/web.jpg",
      width: 800,
      height: 600,
    });
  });

  it("accepts transformBaseUrl as an object and infers DAT base from selectedFile", () => {
    const parsed = parseBynderAsset({
      id: "only-id",
      files: {
        transformBaseUrl: { url: "https://portal.bynder.com/transform/xyz/file.jpg" },
      },
      additionalInfo: {
        selectedFile: {
          url: "https://portal.bynder.com/transform/xyz/file.jpg?io=transform:fill,width:100",
        },
      },
    });

    expect(parsed?.id).toBe("only-id");
    expect(parsed?.transformBaseUrl).toBe("https://portal.bynder.com/transform/xyz/file.jpg");
  });

  it("parses a non-DAT asset using webImage / url", () => {
    const parsed = parseBynderAsset({
      id: "asset-1",
      name: "Hero",
      url: "https://cdn.example/original.jpg",
      files: {
        webImage: { url: "https://cdn.example/web.jpg", width: 800, height: 600 },
      },
    });

    expect(parsed).toMatchObject({
      id: "asset-1",
      sourceUrl: "https://cdn.example/web.jpg",
    });
    expect(parsed?.transformBaseUrl).toBeUndefined();
  });

  it("returns null for empty payloads", () => {
    expect(parseBynderAsset(null)).toBeNull();
    expect(parseBynderAsset([])).toBeNull();
    expect(parseBynderAsset({})).toBeNull();
  });
});
