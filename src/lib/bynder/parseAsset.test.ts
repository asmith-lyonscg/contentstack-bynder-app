import { describe, expect, it } from "vitest";
import {
  assetFromSettings,
  inferTransformBaseUrl,
  normalizeCompactAssets,
  parseBynderAsset,
  pickBynderAsset,
} from "./parseAsset";

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

  it("reads Compact View derivatives.webImage as a string", () => {
    const parsed = parseBynderAsset({
      id: "ucv-1",
      name: "UCV",
      derivatives: {
        webImage: "https://cdn.example/web.jpg",
        thumbnail: "https://cdn.example/thumb.jpg",
      },
    });
    expect(parsed).toMatchObject({
      id: "ucv-1",
      sourceUrl: "https://cdn.example/web.jpg",
    });
  });

  it("returns null for empty payloads", () => {
    expect(parseBynderAsset(null)).toBeNull();
    expect(parseBynderAsset([])).toBeNull();
    expect(parseBynderAsset({})).toBeNull();
  });
});

describe("pickBynderAsset", () => {
  const asset = (id: string, name: string) => ({
    id,
    name,
    files: { webImage: { url: `https://cdn.example/${id}.jpg` } },
  });

  it("prefers the replacement when the previous asset is still in the array", () => {
    const picked = pickBynderAsset([asset("a", "Old"), asset("b", "New")], "a");
    expect(picked).toMatchObject({ id: "b", name: "New" });
  });

  it("uses the first asset when replacing in a single-item payload", () => {
    expect(pickBynderAsset([asset("b", "New")], "a")).toMatchObject({ id: "b", name: "New" });
  });

  it("returns null for an empty assets array", () => {
    expect(pickBynderAsset([])).toBeNull();
  });
});

describe("normalizeCompactAssets", () => {
  it("maps UCV derivatives and selectedFile onto files.webImage / transformBaseUrl", () => {
    const [normalized] = normalizeCompactAssets(
      [
        {
          id: "ucv-1",
          name: "UCV",
          derivatives: { webImage: "https://cdn.example/web.jpg" },
        },
      ],
      {
        selectedFile: {
          url: "https://portal.bynder.com/transform/abc/hero.jpg?io=transform:fill,width:100",
        },
      }
    );
    expect(parseBynderAsset(normalized)).toMatchObject({
      id: "ucv-1",
      sourceUrl: "https://cdn.example/web.jpg",
      transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
    });
  });
});

describe("assetFromSettings", () => {
  it("reads assets[] and treats empty assets as no selection", () => {
    expect(
      assetFromSettings({
        assets: [
          { id: "a", files: { webImage: { url: "https://cdn.example/a.jpg" } } },
        ],
      })
    ).toMatchObject({ id: "a", sourceUrl: "https://cdn.example/a.jpg" });
    expect(assetFromSettings({ assets: [] })).toBeNull();
    expect(assetFromSettings({})).toBeNull();
  });

  it("falls back to companion-era sourceUrl", () => {
    expect(
      assetFromSettings({
        assetId: "legacy",
        sourceUrl: "https://cdn.example/legacy.jpg",
      })
    ).toMatchObject({ id: "legacy", sourceUrl: "https://cdn.example/legacy.jpg" });
  });
});
