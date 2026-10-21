import { buildBynderSources } from "../src/delivery";
import field from "./bynder-field-large-hero.json";

/**
 * Art-directed `<picture>` for one saved Bynder image.
 *
 * Copy `src/delivery/` (and the `src/lib/` files it imports) into the website,
 * then import `buildBynderSources` from there. This sample imports the app copy
 * and renders `samples/bynder-field-large-hero.json`. The filled-in markup is
 * `samples/bynder-picture-large-hero.html` (`sizes="100vw"`).
 * `samples/bynder-field-split-left-right.json` is the same Bynder files with a
 * splitLeftRight snapshot, rendered in `samples/bynder-picture-split-left-right.html`
 * at `sizes="40vw"`. `width` and `height` are the desktop request size. `sizes`
 * is the displayed width the browser uses to pick a candidate.
 *
 * The profile stores `targetWidth` and `aspectRatio`. It does not store a
 * target height. The request height is that width at the aspect ratio. Bynder
 * rejects a transform when either side is over `maxDimension` (2000 when the
 * snapshot omits it) and returns the original file instead, so the helper
 * shrinks the request until both sides fit. A 9:16 image with targetWidth 2000
 * is requested at 1125×2000.
 *
 * For this sample, largeHero asks for:
 * - desktop 16:9 at targetWidth 2000 → 2000×1125
 * - mobile 5:3 at targetWidth 960 → 960×576, from the separate mobile file
 *
 * Each URL is `{transformBaseUrl}?io=transform:fill,width:{w},height:{h}&focuspoint={x},{y}&format=webp&quality=80`.
 * `srcset` uses 640, 960, 1280, 1600, 1920, … and always ends on that capped width.
 * `src` is the capped image. `width` and `height` are that same size.
 */
export function BynderPicture({
  value = field,
  assetId,
  alt,
  sizes = "100vw",
  mobileMaxWidth = 767,
}: {
  value?: unknown;
  assetId?: string;
  /** Saved `alt` when omitted. An empty string stays empty. */
  alt?: string;
  sizes?: string;
  mobileMaxWidth?: number;
}) {
  const desktop = buildBynderSources(value, { assetId });
  const mobile = buildBynderSources(value, { assetId, viewport: "mobile" });
  if (!desktop) return null;

  const altText = alt ?? savedAlt(value, assetId);

  return (
    <picture>
      {mobile ? (
        <source media={`(max-width: ${mobileMaxWidth}px)`} srcSet={mobile.srcset ?? mobile.src} sizes={sizes} />
      ) : null}
      <img
        src={desktop.src}
        srcSet={desktop.srcset}
        sizes={sizes}
        width={desktop.width}
        height={desktop.height}
        alt={altText}
        style={{ width: "100%", height: "auto", objectPosition: desktop.objectPosition }}
      />
    </picture>
  );
}

function savedAlt(value: unknown, assetId?: string): string {
  const root = asRecord(value);
  const assets = Array.isArray(root?.assets) ? root.assets : [];
  const asset =
    (assetId ? assets.map(asRecord).find((item) => item?.id === assetId) : undefined) ?? asRecord(assets[0]);
  return typeof asset?.alt === "string" ? asset.alt : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
