# Bynder Image Settings

A Contentstack Marketplace **Custom Field** that sits next to the official Bynder picker. Authors set a focal point and crop frame (aspect / width / height). Optional Bynder DAT transforms are off by default.

This does not replace the official Bynder app.

## Install

1. **Build or run the app**
   - Local: `npm install` then `npm run dev` (Vite at `http://localhost:3000`). Contentstack iframes need HTTPS, so tunnel that origin (ngrok, Cloudflare Tunnel, etc.).
   - Production: `npm run build` and host `dist` (Contentstack Launch, or any static host).
2. **Developer Hub** → create a Standard / private app.
3. **Hosting:** Custom Hosting → your origin, or Launch pointing at this repo’s `dist`.
4. **UI Locations**
   - Custom Field: name `Bynder Image Settings`, path `/custom-field`, data type **JSON**
   - App Configuration: path `/app-configuration`
5. Install the app on the stack. The official **Bynder** Marketplace app must already be installed.
6. Optional: open **App Configuration** after install and set a default `bynderFieldUid`. Leave DAT unchecked unless the Bynder portal has Dynamic Asset Transformation.

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

Put both fields in a **Group** so they stay together:

| Field | Type |
|---|---|
| `hero_image` | Official Bynder Custom Field (Single Select or Single Select File) |
| `hero_image_settings` | This app (JSON) |

On **Bynder Image Settings**, set the field **Config Parameter** (this wins over App Configuration):

```json
{
  "bynderFieldUid": "hero_image",
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

Inside a group, use a dotted UID:

```json
{
  "bynderFieldUid": "hero_group.hero_image"
}
```

Until an image is selected on that Bynder field, this companion field only shows: *You must first assign an image to `path.to.the.field`.*

### Config keys

| Key | Meaning |
|---|---|
| `bynderFieldUid` | UID of the sibling Bynder field (`group.field` if nested) |
| `enableDat` | `false` by default. Focal point still works from the Bynder thumbnail / `url` |
| `aspect`, `width`, `height` | Presets for **new** entries. Also forced when the matching lock is true |
| `lockAspect`, `lockWidth`, `lockHeight` | Disable those inputs so authors cannot change them |
| `aspectPresets` | Aspect dropdown options. Omit to keep `16:9`, `1:1`, `4:3`, `4:5`. Array or comma-separated string |

If aspect and width are both locked, height is derived and locked in the UI.

### DAT (optional)

When the portal has DAT, set `"enableDat": true` and add `files.transformBaseUrl` to the official Bynder saved keys. A **DAT transforms** checkbox then appears.

If DAT is enabled in config but the selected asset has no `transformBaseUrl`, the field shows an error and stays in CSS crop mode (`datEnabled: false`) until that key is present.

**Same width / height / aspect fields either way.** There is no second DAT-only size mapping. They always live on `transform` in the saved JSON:

- DAT on: they become Bynder DAT query params (`io=transform:fill,width:1200,height:675` plus `focuspoint`). Aspect is not sent as a DAT param; it is used to derive the missing side.
- DAT off: the same values ship for your site’s CSS crop box (`width` / `height` / `aspect-ratio` with `object-fit: cover` and `object-position` from `focalPoint`).

## Author UI

- Controls (focal X/Y, aspect, width, height) are stacked to the left of the crop preview.
- The preview is a crop-shape reference, labeled **Not to scale**.
- Click or drag the red dot (or anywhere on the image) to set the focal point. The crop slides to match.

## Saved JSON

Stored on the entry and returned by CDA / GraphQL:

```json
{
  "v": 1,
  "sourceFieldUid": "hero_image",
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

Frontends should use `focalPoint` with CSS `object-fit: cover` and `object-position` whenever `datEnabled` is false. If the Bynder field is multi-select, this app uses the **first** asset only.

## Delivery helper

Copy [`src/delivery/composeBynderImageUrl.ts`](src/delivery/composeBynderImageUrl.ts) (and [`src/lib/bynder/composeDatUrl.ts`](src/lib/bynder/composeDatUrl.ts) / [`src/lib/types.ts`](src/lib/types.ts)) into the website:

```ts
import { composeBynderImageUrl, focalPointToObjectPosition } from "./delivery";

const src = composeBynderImageUrl(entry.hero_image_settings, { width: 800 });
const objectPosition = focalPointToObjectPosition(entry.hero_image_settings.focalPoint);
```

## Project layout

```
src/
  locations/CustomField/     Custom Field UI
  locations/AppConfig/       Install-time default bynderFieldUid
  components/                Crop + focal-point editor, transform form
  lib/bynder/                Parse official Bynder JSON + compose DAT URLs
  delivery/                  Website helper
```

Built from the [Marketplace App Boilerplate](https://github.com/contentstack/marketplace-app-boilerplate) (Vite, React, `@contentstack/app-sdk` ^2.4).
