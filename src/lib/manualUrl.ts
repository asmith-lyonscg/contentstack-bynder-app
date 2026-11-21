import { aspectRatioFromPixels, sameAspect } from "./profiles";
import type { SavedBynderAsset, VideoPlayback } from "./types";

export type ManualAssetType = "IMAGE" | "VIDEO" | "DOCUMENT";

/** Delta Bynder public asset CDN — video files here become Compact-like assets. */
export const BYNDER_ASSET_CDN_HOST = "assets.deltafaucet.com";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|m3u8)(?:$|\?)/i;
const DOCUMENT_EXT = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|pages|key|numbers|rtf|txt|odt|ods|odp)(?:$|\?)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?)(?:$|\?)/i;
const ASSET_PATH = /^\/asset\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;
const IFRAME_SRC = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i;

export type VideoInputKind = "bynder" | "embed" | "reject";

export type ClassifiedVideoInput =
  | { kind: "bynder"; id: string; url: string; name: string }
  | { kind: "embed"; url: string; name: string }
  | { kind: "reject"; reason: string };

/** http(s) absolute URL. Relative paths and non-http schemes are rejected. */
export function parseManualUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/** Pull a URL from plain text or an iframe embed snippet. */
function extractUrlCandidate(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const iframe = IFRAME_SRC.exec(trimmed);
  if (iframe?.[1]) return iframe[1].trim();
  return trimmed;
}

function youtubeVideoId(url: URL): string | undefined {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id || undefined;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v") || undefined;
    const embed = /^\/(?:embed|shorts|live)\/([^/?#]+)/i.exec(url.pathname);
    if (embed?.[1]) return embed[1];
  }
  return undefined;
}

function vimeoVideoId(url: URL): string | undefined {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "player.vimeo.com") {
    const match = /^\/video\/(\d+)/i.exec(url.pathname);
    return match?.[1];
  }
  if (host === "vimeo.com") {
    const match = /^\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/i.exec(url.pathname);
    return match?.[1];
  }
  return undefined;
}

/** True when the URL is a YouTube or Vimeo watch/embed link. */
export function isYouTubeOrVimeoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return Boolean(youtubeVideoId(parsed) || vimeoVideoId(parsed));
  } catch {
    return false;
  }
}

/** Alias for embed hosts (YouTube / Vimeo) — not playable as `<video src>`. */
export function isVideoEmbedUrl(url: string): boolean {
  return isYouTubeOrVimeoUrl(url);
}

/**
 * Poster image for list thumbs. YouTube has a public thumbnail CDN; Vimeo does not
 * expose a stable URL without an API call, so it returns undefined.
 */
export function embedPosterUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const yt = youtubeVideoId(parsed);
    if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** @deprecated Prefer isYouTubeOrVimeoUrl / isVideoEmbedUrl. */
export function isBlockedVideoHost(url: string): boolean {
  return isYouTubeOrVimeoUrl(url);
}

/**
 * Normalize a YouTube/Vimeo link or iframe embed to a canonical https URL.
 * Returns undefined when the input is not a recognized embed.
 */
export function parseVideoInput(raw: string): string | undefined {
  const candidate = extractUrlCandidate(raw);
  if (!candidate) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;

  const yt = youtubeVideoId(parsed);
  if (yt) return `https://www.youtube.com/watch?v=${yt}`;

  const vimeo = vimeoVideoId(parsed);
  if (vimeo) return `https://vimeo.com/${vimeo}`;

  return undefined;
}

/** Parse `https://assets.deltafaucet.com/asset/{uuid}/…` into id + file URL. */
export function parseBynderAssetCdnUrl(url: string): { id: string; url: string; name: string } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  if (parsed.hostname.replace(/^www\./i, "").toLowerCase() !== BYNDER_ASSET_CDN_HOST) return undefined;
  const match = ASSET_PATH.exec(parsed.pathname);
  if (!match?.[1]) return undefined;
  const id = match[1].toLowerCase();
  const clean = new URL(parsed.toString());
  clean.hash = "";
  return { id, url: clean.toString(), name: nameFromManualUrl(clean.toString()) };
}

/**
 * Classify pasted video input: Bynder CDN file, YouTube/Vimeo embed, or reject.
 * Accepts a bare URL or iframe embed HTML.
 */
export function classifyVideoInput(raw: string): ClassifiedVideoInput {
  const candidate = extractUrlCandidate(raw);
  if (!candidate) {
    return { kind: "reject", reason: "Enter a YouTube or Vimeo link, embed code, or a Bynder asset URL." };
  }

  const embed = parseVideoInput(candidate);
  if (embed) {
    return { kind: "embed", url: embed, name: nameFromManualUrl(embed) };
  }

  const asUrl = parseManualUrl(candidate);
  if (!asUrl) {
    return {
      kind: "reject",
      reason: "Enter a YouTube or Vimeo link, embed code, or a Bynder asset URL from assets.deltafaucet.com.",
    };
  }

  const bynder = parseBynderAssetCdnUrl(asUrl);
  if (bynder && VIDEO_EXT.test(bynder.url)) {
    return { kind: "bynder", id: bynder.id, url: bynder.url, name: bynder.name };
  }
  if (bynder) {
    return {
      kind: "reject",
      reason: "That Bynder URL does not look like a video file. Use a .mp4 (or similar) asset link.",
    };
  }

  return {
    kind: "reject",
    reason:
      "Videos must be a YouTube or Vimeo link/embed, or a direct file on assets.deltafaucet.com.",
  };
}

export function inferManualAssetType(urlOrRaw: string): ManualAssetType {
  const embed = parseVideoInput(urlOrRaw);
  if (embed) return "VIDEO";
  const candidate = extractUrlCandidate(urlOrRaw) ?? urlOrRaw;
  if (VIDEO_EXT.test(candidate) || isYouTubeOrVimeoUrl(candidate)) return "VIDEO";
  if (DOCUMENT_EXT.test(candidate)) return "DOCUMENT";
  if (IMAGE_EXT.test(candidate)) return "IMAGE";
  const bynder = parseBynderAssetCdnUrl(candidate);
  if (bynder && VIDEO_EXT.test(bynder.url)) return "VIDEO";
  return "IMAGE";
}

export function nameFromManualUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (isYouTubeOrVimeoUrl(url)) {
      const yt = youtubeVideoId(parsed);
      if (yt) return `YouTube ${yt}`;
      const vimeo = vimeoVideoId(parsed);
      if (vimeo) return `Vimeo ${vimeo}`;
    }
    const leaf = parsed.pathname.split("/").filter(Boolean).pop();
    if (leaf) return decodeURIComponent(leaf);
  } catch {
    /* ignore */
  }
  return "Linked file";
}

export function newManualAssetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `url-${crypto.randomUUID()}`;
  }
  return `url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Compact-like VIDEO from an assets.deltafaucet.com file URL (no `source: "url"`). */
export function createBynderVideoFromCdn(
  input: { id: string; url: string; name?: string },
  videoDefaults?: VideoPlayback
): SavedBynderAsset {
  return {
    id: input.id,
    name: input.name?.trim() || nameFromManualUrl(input.url),
    type: "VIDEO",
    webImage: { url: input.url },
    video: {
      autoplay: videoDefaults?.autoplay ?? false,
      muted: videoDefaults?.muted ?? false,
      controls: videoDefaults?.controls ?? true,
      loop: videoDefaults?.loop ?? false,
    },
  };
}

export function createManualUrlAsset(input: {
  url: string;
  type: ManualAssetType;
  name?: string;
  videoDefaults?: VideoPlayback;
}): SavedBynderAsset | null {
  if (input.type === "VIDEO") {
    const classified = classifyVideoInput(input.url);
    if (classified.kind === "reject") return null;
    if (classified.kind === "bynder") {
      return createBynderVideoFromCdn(classified, input.videoDefaults);
    }
    return {
      id: newManualAssetId(),
      name: input.name?.trim() || classified.name,
      type: "VIDEO",
      source: "url",
      webImage: { url: classified.url },
    };
  }

  const url = parseManualUrl(input.url);
  if (!url) return null;

  const id = newManualAssetId();
  const name = input.name?.trim() || nameFromManualUrl(url);
  const base: SavedBynderAsset = {
    id,
    name,
    type: input.type,
    source: "url",
    alt: "",
  };

  if (input.type === "DOCUMENT") {
    return { ...base, url };
  }

  return { ...base, webImage: { url } };
}

export function manualFileUrl(
  asset?: { webImage?: { url?: string }; url?: string; transformBaseUrl?: string } | null
): string | undefined {
  if (!asset) return undefined;
  return asset.webImage?.url || asset.url || asset.transformBaseUrl || undefined;
}

/** Load an image URL to read its natural pixel size. */
export function measureImageUrl(url: string): Promise<{ width: number; height: number } | undefined> {
  const parsed = parseManualUrl(url);
  if (!parsed) return Promise.resolve(undefined);
  if (isVideoEmbedUrl(parsed)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      resolve(width > 0 && height > 0 ? { width, height } : undefined);
    };
    img.onerror = () => resolve(undefined);
    img.src = parsed;
  });
}

function aspectWarningMessage(viewport: "Desktop" | "Mobile", expected: string, actual?: string): string {
  if (actual) {
    return `${viewport} media is ${actual}, but this field expects ${expected}. The website may crop the edges so the layout stays consistent.`;
  }
  return `This linked ${viewport.toLowerCase()} media may not match the ${expected} aspect ratio this field expects. The website may crop the edges so the layout stays consistent.`;
}

/**
 * Warn when a linked file’s natural ratio does not match the field profile’s
 * expected desktop or mobile aspect, or when size cannot be measured (embeds).
 * Exact matches stay quiet. Call only for URL-sourced viewports; omit `expected*`
 * when that viewport is not a manual URL. Original-aspect profiles skip the check.
 */
export function manualAspectWarnings(input: {
  desktop?: { width?: number; height?: number };
  mobile?: { width?: number; height?: number };
  separateMobile: boolean;
  expectedDesktop?: string;
  expectedMobile?: string;
}): string[] {
  const warnings: string[] = [];

  if (input.expectedDesktop) {
    const deskActual = aspectRatioFromPixels(input.desktop?.width, input.desktop?.height);
    if (deskActual) {
      if (!sameAspect(input.expectedDesktop, deskActual)) {
        warnings.push(aspectWarningMessage("Desktop", input.expectedDesktop, deskActual));
      }
    } else {
      warnings.push(aspectWarningMessage("Desktop", input.expectedDesktop));
    }
  }

  if (input.expectedMobile) {
    const mobileSize = input.separateMobile ? input.mobile : input.desktop;
    const mobActual = aspectRatioFromPixels(mobileSize?.width, mobileSize?.height);
    if (mobActual) {
      if (!sameAspect(input.expectedMobile, mobActual)) {
        warnings.push(aspectWarningMessage("Mobile", input.expectedMobile, mobActual));
      }
    } else {
      warnings.push(aspectWarningMessage("Mobile", input.expectedMobile));
    }
  }

  return warnings;
}

/** Replace the desktop or mobile file URL on a manual asset. */
export function withManualFileUrl(
  asset: SavedBynderAsset,
  url: string,
  viewport: "desktop" | "mobile"
): SavedBynderAsset | null {
  const type = (asset.type?.toUpperCase() === "VIDEO"
    ? "VIDEO"
    : asset.type?.toUpperCase() === "DOCUMENT"
      ? "DOCUMENT"
      : "IMAGE") as ManualAssetType;

  if (type === "VIDEO") {
    const classified = classifyVideoInput(url);
    if (classified.kind === "reject") return null;

    if (classified.kind === "bynder") {
      // Promoting a pasted Bynder CDN URL onto a manual row replaces identity.
      if (viewport === "desktop") {
        const promoted = createBynderVideoFromCdn(classified, asset.video);
        return {
          ...promoted,
          differentMobileAsset: asset.differentMobileAsset,
          mobile: asset.mobile,
        };
      }
      return {
        ...asset,
        differentMobileAsset: true,
        mobile: {
          id: classified.id,
          name: classified.name,
          type: "VIDEO",
          webImage: { url: classified.url },
          video: asset.mobile?.video ?? asset.video,
        },
      };
    }

    // Embed: keep source url, drop playback flags.
    if (viewport === "desktop") {
      const next = { ...asset, source: "url" as const, webImage: { url: classified.url }, name: asset.name || classified.name };
      delete next.video;
      return next;
    }
    const mobileBase = {
      ...(asset.mobile ?? {}),
      id: asset.mobile?.id ?? newManualAssetId(),
      source: "url" as const,
      type: "VIDEO" as const,
      name: asset.mobile?.name || classified.name,
      webImage: { url: classified.url },
    };
    const { video: _drop, ...mobileWithoutVideo } = mobileBase as typeof mobileBase & { video?: VideoPlayback };
    void _drop;
    return {
      ...asset,
      differentMobileAsset: true,
      mobile: mobileWithoutVideo,
    };
  }

  const nextUrl = parseManualUrl(url);
  if (!nextUrl) return null;

  if (viewport === "desktop") {
    if (type === "DOCUMENT") {
      return { ...asset, source: "url", url: nextUrl, name: asset.name || nameFromManualUrl(nextUrl) };
    }
    return {
      ...asset,
      source: "url",
      webImage: { url: nextUrl },
      name: asset.name || nameFromManualUrl(nextUrl),
    };
  }

  const mobileType = asset.mobile?.type ?? asset.type;
  const mobileBase = {
    ...(asset.mobile ?? {}),
    id: asset.mobile?.id ?? newManualAssetId(),
    source: "url" as const,
    type: mobileType,
    name: asset.mobile?.name || nameFromManualUrl(nextUrl),
  };
  if (type === "DOCUMENT" || mobileType?.toUpperCase() === "DOCUMENT") {
    return {
      ...asset,
      differentMobileAsset: true,
      mobile: { ...mobileBase, url: nextUrl },
    };
  }
  return {
    ...asset,
    differentMobileAsset: true,
    mobile: {
      ...mobileBase,
      webImage: { url: nextUrl },
    },
  };
}
