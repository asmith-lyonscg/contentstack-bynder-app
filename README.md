# Bynder Image Settings

A Contentstack Marketplace **Custom Field** that embeds Bynder Universal Compact View so authors pick an image, then set a focal point and crop frame (aspect / width / height), in **one JSON field**. Optional Bynder DAT transforms are off by default.

This field does **not** require the official Bynder Marketplace app. The official picker can remain on a content type as leftover, but this app no longer reads a sibling Bynder field.

## Install

1. **Build or run the app**
   - Local: `npm install` then `npm run dev` (Vite at `http://localhost:3000`). Contentstack iframes need HTTPS, so tunnel that origin (ngrok, Cloudflare Tunnel, etc.).
   - Production: `npm run build` and host `dist` (Contentstack Launch, or any static host).
2. **Developer Hub** → create a Standard / private app.
3. **Hosting:** Custom Hosting → your origin, or Launch pointing at this repo’s `dist`.
4. **UI Locations**
   - Custom Field: name `Bynder Image Settings`, path `/custom-field`, data type **JSON**
   - App Configuration: path `/app-configuration`
5. Install the app on the stack.
6. Open **App Configuration** and set the Bynder **portal URL** (host only, e.g. `acme.getbynder.com`). Leave DAT unchecked unless the Bynder portal has Dynamic Asset Transformation.

Authors sign in to Bynder inside Compact View. This app does not reuse Contentstack’s official Bynder OAuth callback.

| Location | Path |
|---|---|
| Custom Field | `/custom-field` |
| App Configuration | `/app-configuration` |

```bash
npm test
npm run typecheck
npm run build
```

## Configure the content type

Add **one** JSON Custom Field (this app). A Group is optional.

On **Bynder Image Settings**, set the field **Config Parameter** if you need to override App Configuration (field config wins):

```json
{
  "bynderPortalUrl": "acme.getbynder.com",
  "compactMode": "SingleSelectFile",
  "compactLanguage": "en_US",
  "enableDat": false,
  "aspect": "16:9",
  "width": 1200,
  "height": 675,
  "lockAspect": true,
  "lockWidth": false,
  "lockHeight": false,
  "aspectPresets": ["16:9", "1:1", "4:3", "4:5"]
}
```

Until an image is chosen, the field shows Compact View chrome (**+ Choose Asset(s)**), not a sibling-field prompt.

### Config keys

| Key | Meaning |
|---|---|
| `bynderPortalUrl` | Bynder portal host (`acme.getbynder.com`). Required. Field config overrides App Configuration |
| `compactMode` | `SingleSelectFile` (default) or `SingleSelect` |
| `compactLanguage` | Compact View locale, default `en_US` |
| `enableDat` | `false` by default. Focal point still works from the Compact View thumbnail / URL |
| `aspect`, `width`, `height` | Presets for **new** entries. Also forced when the matching lock is true |
| `lockAspect`, `lockWidth`, `lockHeight` | Disable those inputs so authors cannot change them |
| `aspectPresets` | Aspect dropdown options. Omit to keep `16:9`, `1:1`, `4:3`, `4:5`. Array or comma-separated string |

If aspect and width are both locked, height is derived and locked in the UI.

### DAT (optional)

When the portal has DAT, set `"enableDat": true`. Prefer **SingleSelectFile** so Compact View can return a DAT URL as `selectedFile`; this app maps that onto `files.transformBaseUrl`. A **DAT transforms** checkbox then appears.

If DAT is enabled in config but the selected asset has no `transformBaseUrl`, the field shows a warning and stays in CSS crop mode (`datEnabled: false`) until that URL is present.

**Same width / height / aspect fields either way.** There is no second DAT-only size mapping. They always live on `transform` in the saved JSON:

- DAT on: they become Bynder DAT query params (`io=transform:fill,width:1200,height:675` plus `focuspoint`). Aspect is not sent as a DAT param; it is used to derive the missing side.
- DAT off: the same values ship for your site’s CSS crop box (`width` / `height` / `aspect-ratio` with `object-fit: cover` and `object-position` from `focalPoint`).

## Author UI

- Compact View strip: selected thumbnail, remove, **+ Choose Asset(s)**.
- Controls (focal X/Y, aspect, width, height) are stacked to the left of the crop preview.
- The preview is a crop-shape reference, labeled **Not to scale**.
- Click or drag the red dot (or anywhere on the image) to set the focal point. The crop slides to match.

## Saved JSON

Stored on the entry and returned by CDA / GraphQL. Crop settings and the Bynder asset live together:

```json
{
  "v": 1,
  "assets": [
    {
      "id": "2DC52E62-5FB1-4938-BF689857EF9B51E2",
      "name": "Earth",
      "files": {
        "webImage": { "url": "https://portal.bynder.com/m/.../webimage.jpg" }
      }
    }
  ],
  "assetId": "2DC52E62-5FB1-4938-BF689857EF9B51E2",
  "sourceUrl": "https://portal.bynder.com/m/.../webimage.jpg",
  "datEnabled": false,
  "focalPoint": { "x": 0.35, "y": 0.42 },
  "transform": {
    "operation": "fill",
    "width": 1200,
    "height": 675,
    "aspect": "16:9",
    "format": "webp",
    "quality": 80
  }
}
```

`assets` is the Compact View `onSuccess` array (normalized so `parseBynderAsset` can read `files.webImage`). Frontends should use `focalPoint` with CSS `object-fit: cover` and `object-position` whenever `datEnabled` is false.

## Delivery

Sites that today read an official Bynder field (for example `bynder_logo`) **and** a separate settings field (for example `bynder_focal_point_dat`) need to switch to this combined field: prefer `assets[0]` (or `sourceUrl`) plus `focalPoint`. This branch does not migrate old two-field entries.

Copy [`src/delivery/composeBynderImageUrl.ts`](src/delivery/composeBynderImageUrl.ts) (and [`src/lib/bynder/composeDatUrl.ts`](src/lib/bynder/composeDatUrl.ts) / [`src/lib/types.ts`](src/lib/types.ts) / [`src/lib/bynder/parseAsset.ts`](src/lib/bynder/parseAsset.ts)) into the website:

```ts
import { composeBynderImageUrl, focalPointToObjectPosition } from "./delivery";

const src = composeBynderImageUrl(entry.hero_image_settings, { width: 800 });
const objectPosition = focalPointToObjectPosition(entry.hero_image_settings.focalPoint);
```

`composeBynderImageUrl` uses `sourceUrl` when DAT is off, and falls back to `assets[0]` if `sourceUrl` is missing.

## Project layout

```
src/
  locations/CustomField/     Custom Field UI (picker + crop)
  locations/AppConfig/       Install-time portal URL and DAT default
  components/                Compact picker, crop + focal-point editor, transform form
  lib/bynder/                Parse Compact View JSON + compose DAT URLs
  delivery/                  Website helper
```

Built from the [Marketplace App Boilerplate](https://github.com/contentstack/marketplace-app-boilerplate) (Vite, React, `@contentstack/app-sdk` ^2.4, `@bynder/compact-view`).
