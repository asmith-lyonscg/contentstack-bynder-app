import { describe, expect, it } from "vitest";
import {
  applyPickerSelection,
  assetFromSettings,
  assetPixelSize,
  compactAssetIds,
  inferTransformBaseUrl,
  isVideoAsset,
  isDocumentAsset,
  normalizeCompactAssets,
  parseBynderAsset,
  parseBynderAssets,
  slimPersistedAsset,
  pickBynderAltText,
  pickBynderAsset,
  withBynderDownloadParam,
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
          original: { fileSize: 2457600 },
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
      fileSize: 2457600,
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

describe("assetPixelSize", () => {
  it("reads original pixel size ahead of the web image", () => {
    expect(
      assetPixelSize(
        {
          id: "a",
          files: {
            webImage: { url: "https://cdn.example/web.jpg", width: 800, height: 600 },
            original: { url: "https://cdn.example/original.jpg", width: 4000, height: 3000 },
          },
        },
        { selectedFile: { url: "https://cdn.example/selected.jpg", width: 100, height: 100 } }
      )
    ).toEqual({ width: 4000, height: 3000 });
  });

  it("prefers the asset's original width over the selected derivative", () => {
    expect(
      assetPixelSize(
        { id: "a", width: 4000, height: 2667 },
        { selectedFile: { url: "https://cdn.example/web.jpg", width: 800, height: 600 } }
      )
    ).toEqual({ width: 4000, height: 2667 });
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

  it("keeps only media id, name, webImage URL, transformBaseUrl, and the original pixel size", () => {
    const [normalized] = normalizeCompactAssets([
      {
        id: "graphql-id",
        databaseId: "asset-guid",
        name: "Hero",
        type: "IMAGE",
        extensions: [".jpg"],
        previewUrls: ["https://cdn.example/preview.jpg"],
        additionalInfo: { selectedFile: { url: "https://cdn.example/selected.jpg" } },
        derivatives: { webImage: "https://cdn.example/web.jpg", thumbnail: "https://cdn.example/thumb.jpg" },
        files: {
          webImage: { url: "https://cdn.example/web.jpg", width: 800, height: 600 },
          original: { url: "https://cdn.example/original.jpg", fileSize: 4_000_000, width: 4000, height: 3000 },
          mini: { url: "https://cdn.example/mini.jpg" },
          transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
        },
      },
    ]);
    expect(normalized).toEqual({
      id: "asset-guid",
      name: "Hero",
      type: "IMAGE",
      transformBaseUrl: "https://portal.bynder.com/transform/abc/hero.jpg",
      webImage: { url: "https://cdn.example/web.jpg" },
      originalAssetWidth: 4000,
      originalAssetHeight: 3000,
      aspectRatio: "4:3",
    });
    expect(JSON.stringify(normalized).length).toBeLessThan(500);
  });

  it("stores GraphQL width and height when the original file object is absent", () => {
    const [normalized] = normalizeCompactAssets([
      {
        id: "gql",
        databaseId: "guid",
        name: "Photo",
        type: "IMAGE",
        width: 4000,
        height: 3000,
        derivatives: { webImage: "https://cdn.example/web.jpg" },
        files: { transformBaseUrl: "https://portal.bynder.com/transform/abc/photo" },
      },
    ]);
    expect(normalized).toMatchObject({
      originalAssetWidth: 4000,
      originalAssetHeight: 3000,
      aspectRatio: "4:3",
    });
  });

  it("keeps a PDF as a document when the Bynder badge is pdf and the preview is webp", () => {
    const [normalized] = normalizeCompactAssets([
      {
        id: "pdf-1",
        databaseId: "pdf-guid",
        name: "T342703-CZLHD_IntegratedDiverter_Infographic",
        type: "IMAGE",
        extensions: ["pdf"],
        originalUrl: "https://assets.example/m/pdf-guid/original/T342703-CZLHD_IntegratedDiverter_Infographic.pdf",
        derivatives: { webImage: "https://assets.example/asset/pdf-guid/webimage-T342703.webp" },
      },
    ]);
    expect(normalized).toMatchObject({
      id: "pdf-guid",
      name: "T342703-CZLHD_IntegratedDiverter_Infographic",
      type: "DOCUMENT",
      url: "https://assets.example/m/pdf-guid/original/T342703-CZLHD_IntegratedDiverter_Infographic.pdf",
      downloadUrl:
        "https://assets.example/m/pdf-guid/original/T342703-CZLHD_IntegratedDiverter_Infographic.pdf?download=true",
    });
    expect(normalized).not.toHaveProperty("extensions");
    expect(normalized).not.toHaveProperty("webImage");
    expect(normalized).not.toHaveProperty("transform");
    expect(normalized).not.toHaveProperty("focalPoint");
    expect(isDocumentAsset(parseBynderAsset(normalized))).toBe(true);
  });
});

describe("withBynderDownloadParam", () => {
  it("adds download=true with ? or &", () => {
    expect(withBynderDownloadParam("https://cdn.example/m/hash/original/file.pdf")).toBe(
      "https://cdn.example/m/hash/original/file.pdf?download=true"
    );
    expect(withBynderDownloadParam("https://cdn.example/m/hash/original/file.pdf?foo=1")).toBe(
      "https://cdn.example/m/hash/original/file.pdf?foo=1&download=true"
    );
  });
});

describe("pickBynderAltText", () => {
  it("prefers alt_text, then alttext, then alt, then description", () => {
    expect(
      pickBynderAltText({
        id: "a",
        description: "fallback",
        alt: "alt field",
        alttext: "alttext field",
        alt_text: "canonical",
        files: { webImage: { url: "https://cdn.example/a.jpg" } },
      })
    ).toBe("canonical");
    expect(
      pickBynderAltText({
        id: "a",
        description: "fallback",
        textMetaproperties: { AltText: "from meta" },
        files: { webImage: { url: "https://cdn.example/a.jpg" } },
      })
    ).toBe("from meta");
    expect(
      pickBynderAltText({
        id: "a",
        description: "from description",
        files: { webImage: { url: "https://cdn.example/a.jpg" } },
      })
    ).toBe("from description");
    expect(
      pickBynderAltText({
        id: "a",
        textMetaproperties: [{ name: "alt_text", value: "named meta" }],
        files: { webImage: { url: "https://cdn.example/a.jpg" } },
      })
    ).toBe("named meta");
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
});

describe("applyPickerSelection", () => {
  const asset = (id: string) => ({ id, files: { webImage: { url: `https://cdn.example/${id}.jpg` } } });

  it("keeps the current selection when Compact View returns nothing (cancel)", () => {
    expect(
      applyPickerSelection({
        current: [asset("a")],
        incoming: [],
        mode: "SingleSelectFile",
        focusedId: "a",
      })
    ).toEqual([asset("a")]);
  });

  it("replaces the focused asset in single-select switch", () => {
    expect(
      applyPickerSelection({
        current: [asset("a")],
        incoming: [asset("b")],
        mode: "SingleSelect",
        focusedId: "a",
      })
    ).toEqual([asset("b")]);
  });

  it("replaces the full set in MultiSelect and honors max_limit", () => {
    expect(
      applyPickerSelection({
        current: [asset("a")],
        incoming: [asset("b"), asset("c"), asset("d")],
        mode: "MultiSelect",
        maxLimit: 2,
      })
    ).toEqual([asset("b"), asset("c")]);
  });

  it("replaces only the focused item when several assets exist", () => {
    expect(
      applyPickerSelection({
        current: [asset("a"), asset("b")],
        incoming: [asset("c")],
        mode: "SingleSelectFile",
        focusedId: "b",
      })
    ).toEqual([asset("a"), asset("c")]);
  });
});

describe("compactAssetIds", () => {
  it("sends Compact View the media UUID, not the GraphQL id", () => {
    expect(
      compactAssetIds([
        {
          id: "database-guid",
          databaseId: "2DC52E62-5FB1-4938-BF689857EF9B51E2",
          pickerId: "QXNFAKESECRET_s3t4u5v6w7x8y9z0a1b2",
          sourceUrl: "https://cdn.example/a.jpg",
        },
      ])
    ).toEqual(["2DC52E62-5FB1-4938-BF689857EF9B51E2"]);
  });

  it("keeps Bynder 8-4-4-16 media ids (does not RFC-hyphen them)", () => {
    expect(
      compactAssetIds([
        {
          id: "119C4B1D-4B7F-4870-9B66A1D4B2298427",
          sourceUrl: "https://cdn.example/a.jpg",
        },
      ])
    ).toEqual(["119C4B1D-4B7F-4870-9B66A1D4B2298427"]);
  });

  it("decodes a GraphQL Asset_id when databaseId is missing", () => {
    const graphqlId = btoa("(Asset_id 2DC52E62-5FB1-4938-BF689857EF9B51E2)");
    expect(
      compactAssetIds([
        {
          id: graphqlId,
          pickerId: graphqlId,
          sourceUrl: "https://cdn.example/a.jpg",
        },
      ])
    ).toEqual(["2DC52E62-5FB1-4938-BF689857EF9B51E2"]);
  });

  it("does not pass a GraphQL id through when it cannot be decoded", () => {
    expect(
      compactAssetIds([
        {
          id: "A".repeat(48),
          pickerId: "%%%",
          sourceUrl: "https://cdn.example/a.jpg",
        },
      ])
    ).toEqual([]);
  });

  it("decodes URL-safe GraphQL ids without padding", () => {
    const graphqlId = btoa("(Asset_id 2DC52E62-5FB1-4938-BF689857EF9B51E2)")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(
      compactAssetIds([
        {
          id: graphqlId,
          sourceUrl: "https://cdn.example/a.jpg",
        },
      ])
    ).toEqual(["2DC52E62-5FB1-4938-BF689857EF9B51E2"]);
  });
});

describe("parseBynderAssets", () => {
  it("returns every parseable asset", () => {
    expect(
      parseBynderAssets([
        { id: "a", files: { webImage: { url: "https://cdn.example/a.jpg" } } },
        { id: "b", files: { webImage: { url: "https://cdn.example/b.jpg" } } },
      ]).map((item) => item.id)
    ).toEqual(["a", "b"]);
  });
});

describe("isVideoAsset", () => {
  it("treats Compact View VIDEO type as video", () => {
    expect(isVideoAsset({ type: "VIDEO", sourceUrl: "https://cdn.example/a.jpg" })).toBe(true);
    expect(isVideoAsset({ type: "IMAGE", sourceUrl: "https://cdn.example/a.jpg" })).toBe(false);
  });

  it("falls back to file type and URL when type is missing", () => {
    expect(isVideoAsset({ sourceUrl: "https://cdn.example/clip.mp4" })).toBe(true);
    expect(isVideoAsset({ fileType: "webm", sourceUrl: "https://cdn.example/file" })).toBe(true);
    expect(isVideoAsset({ sourceUrl: "https://cdn.example/hero.jpg" })).toBe(false);
  });
});

describe("isDocumentAsset", () => {
  it("treats Compact View DOCUMENT type as a document (PDFs and office files)", () => {
    expect(isDocumentAsset({ type: "DOCUMENT", sourceUrl: "https://cdn.example/a.pdf" })).toBe(true);
    expect(isDocumentAsset({ type: "IMAGE", sourceUrl: "https://cdn.example/a.jpg" })).toBe(false);
    expect(isDocumentAsset({ type: "VIDEO", sourceUrl: "https://cdn.example/a.mp4" })).toBe(false);
  });

  it("falls back to pdf and office extensions when type is missing", () => {
    expect(isDocumentAsset({ sourceUrl: "https://cdn.example/brief.pdf" })).toBe(true);
    expect(isDocumentAsset({ fileType: "docx", sourceUrl: "https://cdn.example/file" })).toBe(true);
    expect(isDocumentAsset({ name: "deck.pptx", sourceUrl: "https://cdn.example/file" })).toBe(true);
    expect(isDocumentAsset({ sourceUrl: "https://cdn.example/hero.jpg" })).toBe(false);
  });
});

describe("slimPersistedAsset", () => {
  it("never saves optional DAM metadata", () => {
    const raw = {
      id: "asset-1",
      name: "Hero",
      type: "IMAGE",
      fileType: "jpg",
      fileSize: 2457600,
      width: 4000,
      height: 3000,
      description: "A hero",
      tags: ["bottle"],
      files: { webImage: { url: "https://cdn.example/hero.jpg" } },
    };
    const slim = slimPersistedAsset(raw);
    expect(slim).toMatchObject({ id: "asset-1", name: "Hero", type: "IMAGE" });
    expect(slim).not.toHaveProperty("fileType");
    expect(slim).not.toHaveProperty("width");
    expect(slim).not.toHaveProperty("description");
    expect(slim).not.toHaveProperty("tags");
  });

  it("keeps video playback and additional author values", () => {
    const video = slimPersistedAsset({
      id: "clip-1",
      name: "Launch",
      type: "VIDEO",
      url: "https://cdn.example/launch.mp4",
      video: { autoplay: true, muted: "yes", controls: false, extra: 1 },
      additional: { uniqueId: true, note: "hero", rank: 2, nested: { a: 1 } },
    });
    expect(video).toMatchObject({
      video: { autoplay: true, muted: false, controls: false, loop: false },
      additional: { uniqueId: true, note: "hero", rank: 2 },
    });
    expect(video).not.toHaveProperty("uniqueId");

    const image = slimPersistedAsset(
      {
        id: "img-1",
        type: "IMAGE",
        url: "https://cdn.example/hero.jpg",
        video: { autoplay: true, controls: true },
        uniqueId: false,
      },
      { additionalProperties: ["uniqueId"] }
    );
    expect(image).not.toHaveProperty("video");
    expect(image).toMatchObject({ additional: { uniqueId: false } });
    expect(image).not.toHaveProperty("uniqueId");
  });
});
