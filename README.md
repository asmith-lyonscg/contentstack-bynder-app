# Bynder Image Settings

Contentstack Marketplace **Custom Field** for Bynder Universal Compact View: pick an asset, set focal point and crop, save everything in **one JSON field**.

Written by **Anthony Smith**. Owned by **Capgemini**.

Bynder DAT is on by default when the asset has a DAT URL (`transformBaseUrl`). Set `"enableDat": false` to force CSS crop for everyone.

You do **not** need the official Bynder Marketplace app. This field does not read a sibling Bynder field.

**Already hosted for you:** [https://asmith-lyonscg.github.io/contentstack-bynder-app](https://asmith-lyonscg.github.io/contentstack-bynder-app) (no trailing slash)

Most teams only need that URL. Use the sections below only if you are developing or hosting a fork.

__________________________

# Install in Contentstack (using the hosted app)

1. Open **Developer Hub** → create a Standard / private app (or open an existing one).
2. Go to **Hosting → Custom Hosting**.
3. Set **App URL** to:

   `https://asmith-lyonscg.github.io/contentstack-bynder-app`

   No trailing slash.
4. Add **UI Locations**:

   | Location | Name (suggestion) | Path | Data type |
   |---|---|---|---|
   | Custom Field | Bynder Asset Settings | `/custom-field` | **JSON** |
   | App Configuration | (default) | `/app-configuration` | — |

5. Install the app on your stack.
6. Open **App Configuration**, enter your Bynder portal host (example: `acme.getbynder.com`, no `https://`), **Save**.
7. On a content type, add this app’s JSON Custom Field. Optional: paste a [Config Parameter](#field-config-parameter-samples) on the field. Field config wins over App Configuration.

That’s it. Authors sign into Bynder inside Compact View.

__________________________

# Host locally (development only)

Use this when you are changing the app code. Do **not** point a production Contentstack app at `localhost` for real authors.

### What you need

- Node.js **22+**
- This repo on your machine
- Contentstack Developer Hub access

### Steps

1. Open a terminal in the project folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Leave that terminal open. The app is usually at `http://localhost:3000`.
5. In Developer Hub → **Hosting → Custom Hosting**, set **App URL** to that local URL (no trailing slash), for example:

   `http://localhost:3000`

6. Keep the UI location paths as `/custom-field` and `/app-configuration`.
7. Reload the entry editor in Contentstack. Your local build is what runs inside the iframe.

### Useful commands

```bash
npm test
npm run typecheck
npm run build
```

`npm run build` writes a production `dist/` folder (including `404.html`, `.nojekyll`, and HTML shells for `/custom-field`, `/app-configuration`, and `/picker`).

__________________________

# Host on GitHub Pages

Use this when you want a free public URL for Developer Hub (same idea as the Capgemini-hosted URL above).

### One-time GitHub setup

1. Push this repo to GitHub (example remote: `https://github.com/asmith-lyonscg/contentstack-bynder-app`).
2. In the repo: **Settings → Pages → Build and deployment → Source:** **GitHub Actions**.
3. Push to `main` (or your Pages branch). The **Deploy GitHub Pages** workflow (`.github/workflows/pages.yml`) builds and publishes `dist`.

### Your public App URL

GitHub project sites look like:

`https://<user>.github.io/<repo>`

For this project that is:

[https://asmith-lyonscg.github.io/contentstack-bynder-app](https://asmith-lyonscg.github.io/contentstack-bynder-app)

No trailing slash in Developer Hub.

### Point Contentstack at it

1. Developer Hub → **Hosting → Custom Hosting → App URL:** your Pages URL (no trailing slash).
2. UI locations stay `/custom-field` and `/app-configuration`.
3. Contentstack loads e.g. `https://asmith-lyonscg.github.io/contentstack-bynder-app/custom-field`.

### Check the Pages build on your machine (optional)

```bash
npm run build:pages
```

Then on Windows PowerShell:

```powershell
$env:VITE_BASE_PATH="/contentstack-bynder-app/"; npm run preview
```

Open `/contentstack-bynder-app/` in the browser.

A custom domain on Pages can use base `/` again (leave `VITE_BASE_PATH` unset). Bitbucket `*.bitbucket.io` sends `X-Frame-Options: DENY` and cannot be iframed by Contentstack. GitHub Pages does not.

__________________________

## Configure the content type

Add **one** JSON Custom Field (this app). A Group is optional.

Example field **Config Parameter** (field config wins over App Configuration):

```json
{
  "bynderPortalUrl": "acme.getbynder.com",
  "accept": "image/video",
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "enableDat": true,
  "showFieldOperation": true,
  "aspect": { "desktop": "16:9", "mobile": "9:16" },
  "width": { "desktop": 1200, "mobile": 390 },
  "lockAspect": true,
  "format": "webp"
}
```

`accept` is the simple media filter: `"image"`, `"video"`, `"pdf"`, or `"image/video"` (default). `"desktopMobileMode": false` turns off the desktop/mobile split. `"suppressMetadata": true` stores only `id`, `type`, and `transformBaseUrl` (plus crop fields, alt, video playback, and `additional` author values) so a large Bynder payload can stay under Contentstack’s 10KB field limit.

With `"desktopMobileMode": false`, `aspect`, `width`, `height`, and the lock flags must be scalars (`"16:9"`, `1200`, `true`). Dual `{ "desktop", "mobile" }` objects are ignored except for the `desktop` value.

**Width, height, and aspect are hidden by default.** A hidden field is also locked. Preset pairs derive the third value (width+height → aspect; width+aspect → height; height+aspect → width). When at least two of those three are locked, Transform type is **Fill / Fit / Scale** (mutually exclusive); choosing **Scale** shows a Zoom slider. Otherwise Transform type is **Fill / Fit / Crop** (portion of the image) and there is no Zoom control.

Until an image is chosen, the field shows **+ Choose Asset(s)**. If an image is already selected, the row action is **Change Asset(s)**. Closing Compact View without confirming a new selection leaves the current asset in place.

Marketplace-style Compact View / DAT options can live on the same Config Parameter. Prefer the camelCase `compactViewConfig` namespace (the marketplace `custom_settings.compact_view_options` key is still accepted).

By default Compact View is limited to **images and videos** via `assetTypes`. Documents such as PDFs cannot be selected unless you add `DOCUMENT`. We do **not** set `assetFilter.predefinedAssetType` by default: Bynder hides search and filters whenever `assetFilter` is present unless `showToolbar` is true.

```json
{
  "maxNumberOfAssets": 5,
  "enableDat": true,
  "compactViewConfig": {
    "language": "en_US",
    "defaultSearchTerm": "hero",
    "hideSwitch": true,
    "defaultImageDerivativeName": "webImage",
    "assetTypes": ["IMAGE", "VIDEO"],
    "assetFilter": {
      "showToolbar": true,
      "predefinedAssetType": ["IMAGE", "VIDEO"],
      "predefinedTagNames": ["bottle"]
    }
  },
  "custom_settings": {
    "dat_settings": {
      "options": ["webImage", "mini", "transformBaseUrl"],
      "default": "webImage",
      "transformation_options": {
        "crop": "io=transform:crop,height:400,width:300,path:square"
      }
    }
  }
}
```

### Config keys

Field **Config Parameter** unless marked App Config. Types, defaults, and aliases:

| Key | Type | Default | Alias | Description |
|---|---|---|---|------|
| `bynderPortalUrl` | `string` | required | | Portal host. Field config overrides App Configuration. Example: `"acme.getbynder.com"` |
| `accept` | `"image"` \| `"video"` \| `"pdf"` \| `"image/video"` | `image/video` | `media` | Which Bynder types Compact View can select. Field config wins over `compactViewConfig.assetTypes`. Example: `"image"` |
| `desktopMobileMode` | `boolean` | `true` | `desktopMobile` | Dual desktop/mobile crops. `false` = one crop per asset; the UI never says desktop or mobile. Example: `false` |
| `suppressMetadata` | `boolean` | `false` | | Drop Bynder metadata and `webImage` from the saved JSON. Keeps `id`, `type`, `transformBaseUrl`, crop fields, and alt text. Use this when an entry will not save because the JSON field is over 10KB. Example: `true` |
| `persistAssetKeys` | `string[]` | none | | Extra Bynder values to save: `description`, `originalUrl`, `publishedAt`, `updatedAt`, `tags`, `fileType`, `fileSize`, `width`, `height`. `width` and `height` here are the original file pixels, not the CSS crop (`transform.width` / `transform.height`). A field that sets this array replaces the App Config list. `suppressMetadata: true` ignores it. Example: `["description","tags"]` |
| `maxNumberOfAssets` | `number` | `1` | `advanced.max_limit` | Cap on selected assets. `1` is Single Select. Values above 1 use Multi Select. Example: `3` |
| `compactLanguage` | `string` | `en_US` | | Compact View locale. Example: `"en_US"` |
| `enableDat` | `boolean` | `true` | | `false` forces CSS crop only (no composed DAT query). Example: `false` |
| `aspect` | `string` or `{ desktop?: string, mobile?: string }` | omitted | | Preset for **new** entries; forced when aspect is locked or hidden. In `desktopMobileMode`, an object sets desktop and mobile separately. Example: `"16:9"` or `{ "desktop": "16:9", "mobile": "9:16" }` |
| `width` | `number` or `{ desktop?: number, mobile?: number }` | omitted | | Same as `aspect`. Omit to seed from the file’s pixel size when size fields are shown. Example: `1200` or `{ "desktop": 1200, "mobile": 390 }` |
| `height` | `number` or `{ desktop?: number, mobile?: number }` | omitted | | Same as `width`. If omitted, height is derived from aspect + width, or from the file. Example: `675` |
| `lockAspect`, `lockWidth`, `lockHeight` | `boolean` or `{ desktop?: boolean, mobile?: boolean }` | `false` | | Disable those inputs. **A hidden field is always treated as locked.** A configured pair also locks the third value (width+height → aspect; width+aspect → height; height+aspect → width). Example: `true` or `{ "desktop": true, "mobile": false }` |
| `format` | `"webp"` \| `"jpg"` \| `"png"` | `webp` | `fileType` | DAT output format for **new** entries. Example: `"jpg"` |
| `showFieldFileType` | `boolean` | `false` | `showFormat`, `showFileType`, `hideFormat: false` | Show the DAT file-type control. Example: `true` |
| `showFieldOperation` | `boolean` | `true` | `showOperation` | Show **Transform type** (Fill, Fit, Crop). Only appears when DAT is active for the selected asset (`enableDat` and a `transformBaseUrl`). Example: `false` |
| `showFieldAspectRatio` | `boolean` | `false` | `showAspect` | Show the aspect-ratio dropdown. Example: `true` |
| `showFieldWidth` | `boolean` | `false` | `showWidth` | Show **Layout Width**. Example: `true` |
| `showFieldHeight` | `boolean` | `false` | `showHeight` | Show **Layout Height**. Example: `true` |
| `showFieldQuality` | `boolean` | `false` | `showQuality` | Show the DAT quality control. Example: `true` |
| `showFieldAdvancedQuery` | `boolean` | `false` | `showAdvancedQuery`, `showExtraQuery` | Show the extra DAT query field. Example: `true` |
| `showFieldDatPreset` | `boolean` | `false` | `showDatPreset` | Show the DAT preset control. Example: `true` |
| `video` | `object` | controls on; autoplay, mute, and loop off | `videoAutoplay`, `videoMuted`, `videoControls`, `videoLoop` | Default playback for a newly picked video. Saved on the asset as `video`. Example: `{ "autoplay": false, "muted": true, "controls": true, "loop": false }` |
| `showFieldAutoplay` | `boolean` | `true` | | Show the Autoplay checkbox. Example: `false` |
| `showFieldMuted` | `boolean` | `true` | `showFieldMute` | Show the Mute checkbox. Example: `false` |
| `showFieldControls` | `boolean` | `true` | | Show the Show controls checkbox. Example: `false` |
| `showFieldLoop` | `boolean` | `true` | | Show the Loop checkbox. Example: `false` |
| `additionalFields` | `additionalField[]` | none | | Extra author inputs. Each item is `{ "property", "type", "label" }` with `type` `"string"`, `"number"`, or `"boolean"`. Values save under `additional`. An invalid list replaces the custom field with a red error. |
| `lockFormat` | `boolean` | `false` | `lockFileType` | Show the file-type control but disable it. Example: `true` |
| `aspectPresets` | `string[]` or comma-separated `string` | `16:9`, `1:1`, `4:3`, `4:5` | | Aspect dropdown options. Example: `["16:9","1:1"]` |
| `compactViewConfig` | `object` | images and videos | `custom_settings.compact_view_options` | [Universal Compact View](https://developers.bynder.com/universal-compact-view) props we pass through. Portal URL, callbacks, and `mode` are not taken from here. |
| `custom_settings.dat_settings` | `object` | omitted | | Marketplace DAT presets. `default` becomes Compact View `defaultImageDerivativeName`. |
| `advanced.max_limit` | `number` | `1` | | Same as `maxNumberOfAssets`. Example: `4` |

If a viewport has **no** `aspect`, `width`, or `height` in field or App Config, a newly picked asset seeds that viewport from the file’s own pixel size (and a reduced `width:height` aspect, e.g. 1920×1080 → `16:9`). Config presets always win over native size.

### Field Config Parameter samples

Paste one of these into the custom field’s **Config Parameter**. App Config still supplies `bynderPortalUrl` unless you override it here.

**Desktop 16:9, mobile 9:16, up to 3 assets**

```json
{
  "bynderPortalUrl": "acme.getbynder.com",
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "aspect": { "desktop": "16:9", "mobile": "9:16" },
  "width": { "desktop": 1200, "mobile": 390 },
  "lockAspect": { "desktop": true, "mobile": true },
  "lockWidth": { "desktop": true, "mobile": true },
  "format": "webp",
  "enableDat": true
}
```

New picks open unmatched (desktop 1200×675, mobile 390×693). Height is derived from aspect + width. Size fields stay hidden/locked; authors pick Fill, Fit, or Scale (Zoom only for Scale).

**Show width / height / aspect to authors**

```json
{
  "showFieldWidth": true,
  "showFieldHeight": true,
  "showFieldAspectRatio": true
}
```

**Images only**

```json
{ "accept": "image", "desktopMobileMode": true }
```

**Video only** — one thumbnail, playback options, no mobile crop

```json
{
  "accept": "video",
  "desktopMobileMode": false,
  "video": { "autoplay": false, "muted": true, "controls": true, "loop": false },
  "showFieldAutoplay": false
}
```

**Extra author fields**

```json
{
  "accept": "image/video",
  "desktopMobileMode": true,
  "additionalFields": [
    { "property": "uniqueId", "type": "boolean", "label": "Unique ID" },
    { "property": "caption", "type": "string", "label": "Caption" },
    { "property": "rank", "type": "number", "label": "Rank" }
  ]
}
```

Author values save on each asset under `additional`.

**PDF only**

```json
{ "accept": "pdf", "desktopMobileMode": false, "maxNumberOfAssets": 1 }
```

**Save the original file type and tags**

```json
{
  "accept": "image/video",
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "persistAssetKeys": ["fileType", "fileSize", "width", "height", "description", "tags"]
}
```

**Images and videos (default), metadata stripped so the entry can save**

```json
{
  "accept": "image/video",
  "desktopMobileMode": true,
  "suppressMetadata": true,
  "maxNumberOfAssets": 5
}
```

**Same crop for every viewport (no desktop/mobile UI)**

```json
{
  "desktopMobileMode": false,
  "maxNumberOfAssets": 1,
  "aspect": "4:5",
  "width": 800,
  "showFieldAspectRatio": true
}
```

**Images only, DAT off (CSS crop)**

```json
{
  "desktopMobileMode": false,
  "maxNumberOfAssets": 1,
  "enableDat": false,
  "aspect": "16:9",
  "width": 1600,
  "height": 900,
  "compactViewConfig": {
    "assetTypes": ["IMAGE"],
    "hideLimitedUse": true
  }
}
```

### DAT

DAT is **on by default** when the selected asset has `transformBaseUrl`. Compact View always selects the **asset** (never a derivative file). There is no author toggle: DAT vs CSS is detected from `transformBaseUrl` (and from `"enableDat": false`, which forces CSS for everyone).

**Transform type** (Fill / Fit / Crop) only appears when both are true:

1. `enableDat` is on (App Config or field), and
2. The selected image has a Bynder DAT URL (`transformBaseUrl` in the saved JSON).

If DAT is allowed but the asset has no `transformBaseUrl`, the field shows a warning (“not DAT capable”), stores `webImage` plus crop fields, and hides Transform type. Fix that in Bynder (enable Dynamic Asset Transformation for the asset) or pick a different image. Videos never get DAT.

- DAT on: size fields become Bynder DAT query params. The saved field stores `transformBaseUrl` once, plus `dat["1x"]` and `dat["2x"]` as query strings. `webImage` is omitted when `transformBaseUrl` exists.
- DAT off / unavailable: the same values ship for CSS crop (`object-fit` / `object-position`). When authors chose **Scale**, `transform.operation` is `"scale"` and optional `transform.zoom` (above 1) is for delivery CSS `scale()`; DAT URLs still use `fill`.

## Author UI

- Compact View strip with desktop/mobile thumbs (unless `desktopMobileMode: false`).
- Crop and focal controls appear only while an image thumbnail is selected. Videos open **Video settings**. Documents stay in the list but are not selectable.
- **Transform type** defaults to Fill when DAT is active. Width / height / aspect stay hidden unless you turn them on with `showField…`. With ≥2 of those locked (hidden counts), options are Fill / Fit / Scale; Zoom appears only for Scale. Otherwise options are Fill / Fit / Crop.
- Click or drag the red dot (or anywhere on the image) to set the focal point.

## Saved JSON

Stored on the entry and returned by CDA / GraphQL. One `assets` array: identity (`id`, `name`, `type`, `transformBaseUrl`), crop fields, and DAT query strings. A video also stores `video`. Configured `additionalFields` values are stored on `additional`. Matching mobile is omitted; a different mobile file or crop is `assets[n].mobile`.

A single image URL is `transformBaseUrl + "?" + dat["2x"]`. `dat["1x"]` is the layout size for srcset.

```json
{
  "v": 1,
  "assets": [
    {
      "id": "2DC52E62-5FB1-4938-BF689857EF9B51E2",
      "name": "Earth",
      "type": "IMAGE",
      "alt": "The Earth from space",
      "transformBaseUrl": "https://portal.bynder.com/transform/earth.jpg",
      "focalPoint": { "x": 0.35, "y": 0.42 },
      "transform": {
        "operation": "fill",
        "width": 1200,
        "height": 675,
        "aspect": "16:9",
        "format": "webp",
        "quality": 80
      },
      "dat": {
        "1x": "io=transform:fill,width:1200,height:675&focuspoint=0.35,0.42&format=webp&quality=80",
        "2x": "io=transform:fill,width:2400,height:1350&focuspoint=0.35,0.42&format=webp&quality=80"
      }
    }
  ]
}
```

Join `transformBaseUrl` with `dat["2x"]` for the image `src`. If `dat` is missing, use `webImage.url` with CSS `object-fit` and `object-position` from `focalPoint`.

## Delivery

Copy [`src/delivery/composeBynderImageUrl.ts`](src/delivery/composeBynderImageUrl.ts) (and related helpers under `src/lib/bynder/`) into the website:

```ts
import { composeBynderImageUrl, focalPointToObjectPosition } from "./delivery";

const src = composeBynderImageUrl(entry.hero_image_settings, { width: 800 });
const mobileSrc = composeBynderImageUrl(entry.hero_image_settings, { viewport: "mobile", width: 400 });
const objectPosition = focalPointToObjectPosition(entry.hero_image_settings.assets?.[0]?.focalPoint);
```

When `transform.zoom` is set and greater than 1, apply CSS `transform: scale(zoom)` (with `transform-origin` at the focal point) on top of the DAT or `webImage` result so delivery matches the crop editor.

## Project layout

```
src/
  locations/CustomField/     Custom Field UI (picker + crop)
  locations/AppConfig/       Portal URL, DAT, persist keys
  components/                Compact picker, crop + focal-point editor, transform form
  lib/bynder/                Parse Compact View JSON + compose DAT URLs
  delivery/                  Website helper
```

Built from the [Marketplace App Boilerplate](https://github.com/contentstack/marketplace-app-boilerplate) (Vite, React, `@contentstack/app-sdk` ^2.4, `@bynder/compact-view`).
