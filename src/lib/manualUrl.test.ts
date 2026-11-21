import { describe, expect, it } from "vitest";
import {
  classifyVideoInput,
  createBynderVideoFromCdn,
  createManualUrlAsset,
  embedPosterUrl,
  inferManualAssetType,
  isVideoEmbedUrl,
  isYouTubeOrVimeoUrl,
  manualAspectWarnings,
  parseBynderAssetCdnUrl,
  parseManualUrl,
  parseVideoInput,
  withManualFileUrl,
} from "./manualUrl";

describe("parseManualUrl", () => {
  it("accepts http(s) absolute URLs", () => {
    expect(parseManualUrl(" https://cdn.example.com/a.jpg ")).toBe("https://cdn.example.com/a.jpg");
    expect(parseManualUrl("http://cdn.example.com/a.mp4")).toBe("http://cdn.example.com/a.mp4");
  });

  it("rejects relative paths and non-http schemes", () => {
    expect(parseManualUrl("/media/a.jpg")).toBeUndefined();
    expect(parseManualUrl("ftp://cdn.example.com/a.jpg")).toBeUndefined();
    expect(parseManualUrl("not a url")).toBeUndefined();
  });
});

describe("parseVideoInput / classifyVideoInput", () => {
  it("normalizes YouTube watch, short, and embed URLs", () => {
    expect(parseVideoInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    expect(parseVideoInput("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    expect(parseVideoInput("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
  });

  it("extracts YouTube from iframe embed HTML", () => {
    expect(
      parseVideoInput(
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>'
      )
    ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("normalizes Vimeo page and player URLs", () => {
    expect(parseVideoInput("https://vimeo.com/76979871")).toBe("https://vimeo.com/76979871");
    expect(parseVideoInput("https://player.vimeo.com/video/76979871")).toBe("https://vimeo.com/76979871");
  });

  it("classifies Bynder CDN video URLs", () => {
    const url =
      "https://assets.deltafaucet.com/asset/a1b2c3d4-e5f6-7890-abcd-ef1234567890/Product-launch.mp4";
    expect(classifyVideoInput(url)).toEqual({
      kind: "bynder",
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      url,
      name: "Product-launch.mp4",
    });
  });

  it("rejects generic CDN mp4 files", () => {
    const result = classifyVideoInput("https://cdn.example.com/clip.mp4");
    expect(result.kind).toBe("reject");
  });

  it("rejects Bynder CDN non-video files for video classify", () => {
    const result = classifyVideoInput(
      "https://assets.deltafaucet.com/asset/a1b2c3d4-e5f6-7890-abcd-ef1234567890/Spec.pdf"
    );
    expect(result.kind).toBe("reject");
  });

  it("builds a YouTube poster URL and skips Vimeo", () => {
    expect(embedPosterUrl("https://www.youtube.com/watch?v=FezVApPddqU&list=RD00gXEn1ehDg")).toBe(
      "https://img.youtube.com/vi/FezVApPddqU/hqdefault.jpg"
    );
    expect(embedPosterUrl("https://vimeo.com/76979871")).toBeUndefined();
  });
});

describe("parseBynderAssetCdnUrl", () => {
  it("parses id and name from assets.deltafaucet.com", () => {
    expect(
      parseBynderAssetCdnUrl(
        "https://assets.deltafaucet.com/asset/24c6fbf2-3b38-4307-b2b8-da43a35bdf24/clip.mp4?t=1"
      )
    ).toMatchObject({
      id: "24c6fbf2-3b38-4307-b2b8-da43a35bdf24",
      name: "clip.mp4",
    });
  });

  it("rejects other hosts", () => {
    expect(
      parseBynderAssetCdnUrl("https://cdn.example.com/asset/24c6fbf2-3b38-4307-b2b8-da43a35bdf24/clip.mp4")
    ).toBeUndefined();
  });
});

describe("inferManualAssetType", () => {
  it("infers from the file extension or embed host", () => {
    expect(inferManualAssetType("https://cdn.example.com/hero.webp")).toBe("IMAGE");
    expect(inferManualAssetType("https://cdn.example.com/clip.mp4")).toBe("VIDEO");
    expect(inferManualAssetType("https://www.youtube.com/watch?v=abc")).toBe("VIDEO");
    expect(inferManualAssetType("https://cdn.example.com/spec.pdf")).toBe("DOCUMENT");
  });
});

describe("createManualUrlAsset", () => {
  it("creates an image with source url and webImage", () => {
    const asset = createManualUrlAsset({
      url: "https://cdn.example.com/hero.jpg",
      type: "IMAGE",
    });
    expect(asset).toMatchObject({
      source: "url",
      type: "IMAGE",
      webImage: { url: "https://cdn.example.com/hero.jpg" },
      alt: "",
    });
    expect(asset?.id.startsWith("url-")).toBe(true);
    expect(asset).not.toHaveProperty("focalPoint");
    expect(asset).not.toHaveProperty("transformBaseUrl");
  });

  it("creates a YouTube embed without playback flags", () => {
    expect(isYouTubeOrVimeoUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    const asset = createManualUrlAsset({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      type: "VIDEO",
    });
    expect(asset).toMatchObject({
      source: "url",
      type: "VIDEO",
      webImage: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect(asset).not.toHaveProperty("video");
    expect(asset).not.toHaveProperty("alt");
  });

  it("rejects generic CDN video files", () => {
    expect(
      createManualUrlAsset({
        url: "https://cdn.example.com/clip.mp4",
        type: "VIDEO",
      })
    ).toBeNull();
  });

  it("promotes Bynder CDN video to a Compact-like asset", () => {
    const url =
      "https://assets.deltafaucet.com/asset/a1b2c3d4-e5f6-7890-abcd-ef1234567890/Product-launch.mp4";
    const asset = createManualUrlAsset({
      url,
      type: "VIDEO",
      videoDefaults: { autoplay: true, muted: true, controls: true, loop: false },
    });
    expect(asset).toMatchObject({
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      type: "VIDEO",
      webImage: { url },
      video: { autoplay: true, muted: true, controls: true, loop: false },
    });
    expect(asset).not.toHaveProperty("source");
  });

  it("createBynderVideoFromCdn matches Compact-like shape", () => {
    const asset = createBynderVideoFromCdn({
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      url: "https://assets.deltafaucet.com/asset/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
      name: "clip.mp4",
    });
    expect(asset.source).toBeUndefined();
    expect(asset.video?.controls).toBe(true);
  });

  it("creates a document with url only", () => {
    const asset = createManualUrlAsset({
      url: "https://cdn.example.com/spec.pdf",
      type: "DOCUMENT",
    });
    expect(asset).toMatchObject({
      source: "url",
      type: "DOCUMENT",
      url: "https://cdn.example.com/spec.pdf",
    });
    expect(asset).not.toHaveProperty("downloadUrl");
    expect(asset).not.toHaveProperty("webImage");
  });
});

describe("withManualFileUrl", () => {
  it("assigns a mobile image URL without crop fields", () => {
    const desktop = createManualUrlAsset({
      url: "https://cdn.example.com/desk.jpg",
      type: "IMAGE",
    });
    expect(desktop).toBeTruthy();
    const next = withManualFileUrl(desktop!, "https://cdn.example.com/mob.jpg", "mobile");
    expect(next).toMatchObject({
      differentMobileAsset: true,
      mobile: {
        source: "url",
        webImage: { url: "https://cdn.example.com/mob.jpg" },
      },
    });
    expect(next?.mobile).not.toHaveProperty("focalPoint");
  });

  it("assigns a mobile Vimeo embed without playback", () => {
    const desktop = createManualUrlAsset({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      type: "VIDEO",
    });
    const next = withManualFileUrl(desktop!, "https://vimeo.com/76979871", "mobile");
    expect(next).toMatchObject({
      differentMobileAsset: true,
      mobile: {
        source: "url",
        webImage: { url: "https://vimeo.com/76979871" },
      },
    });
    expect(next?.mobile).not.toHaveProperty("video");
  });
});

describe("manualAspectWarnings", () => {
  it("flags desktop and mobile mismatches against the profile", () => {
    expect(
      manualAspectWarnings({
        desktop: { width: 1000, height: 1000 },
        separateMobile: false,
        expectedDesktop: "16:9",
        expectedMobile: "16:9",
      })
    ).toEqual([
      "Desktop media is 1:1, but this field expects 16:9. The website may crop the edges so the layout stays consistent.",
      "Mobile media is 1:1, but this field expects 16:9. The website may crop the edges so the layout stays consistent.",
    ]);
  });

  it("uses the mobile file size when a separate mobile URL is assigned", () => {
    expect(
      manualAspectWarnings({
        desktop: { width: 1600, height: 900 },
        mobile: { width: 800, height: 800 },
        separateMobile: true,
        expectedDesktop: "16:9",
        expectedMobile: "4:3",
      })
    ).toEqual([
      "Mobile media is 1:1, but this field expects 4:3. The website may crop the edges so the layout stays consistent.",
    ]);
  });

  it("stays quiet when measured size matches", () => {
    expect(
      manualAspectWarnings({
        desktop: { width: 1600, height: 900 },
        separateMobile: false,
        expectedDesktop: "16:9",
        expectedMobile: "16:9",
      })
    ).toEqual([]);
  });

  it("warns when size cannot be measured but a ratio is prescribed", () => {
    expect(
      manualAspectWarnings({
        desktop: {},
        separateMobile: false,
        expectedDesktop: "16:9",
      })
    ).toEqual([
      "This linked desktop media may not match the 16:9 aspect ratio this field expects. The website may crop the edges so the layout stays consistent.",
    ]);
  });

  it("stays quiet when the profile has no prescribed aspect", () => {
    expect(
      manualAspectWarnings({
        desktop: { width: 1000, height: 1000 },
        separateMobile: false,
      })
    ).toEqual([]);
  });
});
