import { buildBynderSources } from "../src/delivery";
import field from "./bynder-field-large-hero.json";

/**
 * React `<picture>` for one image in a saved Bynder field.
 *
 * `value` is the custom field JSON (`samples/bynder-field-*.json`).
 * Copy this component with the delivery modules, and keep
 * their layout so the imports resolve:
 * `src/delivery/`, `src/lib/types.ts`, `src/lib/profiles.ts`, and
 * `src/lib/bynder/composeDatUrl.ts`. Import `buildBynderSources` from that
 * copy. Every URL comes from `buildBynderSources`.
 *
 * `sizes` is the CSS width of the slot. `widths` is the file widths to request
 * for that slot. Widths come from the slot. Leave `maxDimension`
 * unset (2000 when the snapshot omits it). largeHero and custom use
 * `STANDARD_WIDTHS` at `sizes="100vw"`. splitLeftRight passes
 * `[480, 640, 800, 960, 1280]` at `sizes="40vw"`.
 *
 * The HTML files beside this one are the markup this component returns.
 * `width` and `height` on the `img` are the largest desktop request.
 * largeHero is 16:9, so that file is 2000×1125, and its mobile file (5:3) is
 * 2000×1200. custom (`profile.id` `"custom"`) is desktop 2:1 → 2000×1000 and
 * mobile 3:2 → 2000×1333. splitLeftRight is desktop 7:4 → 1280×731 and mobile
 * 16:9 → 1280×720. A 9:16 image on the standard ladder is 1125×2000.
 * Bynder returns the original file when either side passes `maxDimension`, so
 * the helper shrinks the step first.
 *
 * Each URL is `{transformBaseUrl}?io=transform:fill,width:{w},height:{h}&focuspoint={x},{y}&format=webp&quality=80`.
 * A missing focal point is `0.5,0.5`. `src` is the largest remaining step.
 */
export const STANDARD_WIDTHS = [640, 960, 1280, 1600, 1920, 2560, 3200, 3840] as const;

export function BynderPicture({
  value = field,
  assetId,
  alt,
  sizes = "100vw",
  widths = STANDARD_WIDTHS,
  mobileMaxWidth = 767,
}: {
  value?: unknown;
  assetId?: string;
  /** Saved `alt` when omitted. An empty string stays empty. */
  alt?: string;
  sizes?: string;
  /** Request widths. Each is capped so neither side passes `maxDimension`. */
  widths?: readonly number[];
  mobileMaxWidth?: number;
}) {
  const desktop = buildBynderSources(value, { assetId, widths });
  const mobile = buildBynderSources(value, { assetId, viewport: "mobile", widths });
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
