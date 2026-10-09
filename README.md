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

### Maximum image widths (App Configuration)

App Configuration → **Maximum image widths** sets `maxDesktopWidth` (default `2000`) and `maxMobileWidth` (default `960`). They are the widest images the site may request:

- No profile's `maxWidth` may be above them. App Configuration will not save a profile that is.
- An asset without a profile uses them as its `targetWidth`, at the asset's original aspect ratio, and never wider than the original file.

### Render profiles (App Configuration)

Image sizes come from named **render profiles**, defined once in App Configuration → **Render profiles**:

```json
{
  "hero": {
    "desktop": { "aspectRatio": "16:9", "maxWidth": 2000 },
    "mobile": { "aspectRatio": "4:3", "maxWidth": 960 },
    "quality": 80,
    "format": "webp"
  },
  "largeHero": {
    "desktop": { "aspectRatio": "21:9", "maxWidth": 2000 },
    "mobile": { "aspectRatio": "4:5", "maxWidth": 960 }
  }
}
```

- Every profile needs `desktop` and `mobile`, each with `aspectRatio` (`"W:H"`) and `maxWidth` (pixels).
- `desktop.maxWidth` may not be above `maxDesktopWidth`, and `mobile.maxWidth` may not be above `maxMobileWidth`.
- `quality` (1–100) defaults to `80`; `format` (`webp`, `avif`, `jpg`, `png`) defaults to `webp`.
- `maxWidth` is the widest image the site will request. The entry saves it as `targetWidth`, and the site builds `srcset` from 640w up to and including it.
- Profile names must be unique, start with a letter, and use letters, numbers, `_`, or `-`.
- The editor validates as you type and will not save invalid JSON, a duplicate name, or an invalid profile.
- There is no built-in profile. With no profiles, or when neither the field nor the author picks one, each asset keeps the aspect ratio of its original pixel size. That ratio is reduced (`4000×3000` → `4:3`) and saved on the asset as `aspectRatio`, next to `originalAssetWidth` and `originalAssetHeight`, so the editor and the site recall the same value.

Authors never type a width, height, aspect, format, or quality. The profile locks them. Authors set the focal point. **Fill** is the only transform type unless Fit is turned on.

### Field Config Parameter

Example field **Config Parameter** (field config wins over App Configuration):

```json
{
  "bynderPortalUrl": "acme.getbynder.com",
  "accept": "image/video",
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "enableDat": true,
  "allowFit": false,
  "profiles": ["hero", "largeHero"],
  "defaultProfile": "hero"
}
```

`"profile": "hero"` locks this field to that one App Config profile. Authors do not get a dropdown, and every asset uses it. `profiles` limits which App Config profiles this field offers when `profile` is omitted (all of them when that is omitted too; unknown names are ignored). `defaultProfile` is used for new entries and makes a profile required. Without `profile` or `defaultProfile`, new entries keep the original aspect ratio, and the **Render profile** dropdown also offers **Original aspect ratio**. The dropdown shows when there are two or more choices; the choice applies to every asset in the field.

`accept` is the simple media filter: `"image"`, `"video"`, `"pdf"`, or `"image/video"` (default). `"desktopMobileMode": false` turns off the desktop/mobile split; the editor then uses the profile's desktop values. `"suppressMetadata": true` stores only `id`, `type`, and `transformBaseUrl` (plus crop fields, alt, video playback, and `additional` author values) so a large Bynder payload can stay under Contentstack’s 10KB field limit.

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
| `maxDesktopWidth` (App Config) | `number` | `2000` | | Widest desktop image. Caps every profile, and is the width for assets without a profile. |
| `maxMobileWidth` (App Config) | `number` | `960` | | Widest mobile image. Caps every profile, and is the width for assets without a profile. |
| `profiles` (App Config) | `object` | none | | Named render profiles, see above. |
| `profile` (field) | `string` | none | | Lock this field to one App Config profile. No dropdown. Example: `"hero"` |
| `profiles` (field) | `string[]` or comma-separated `string` | all App Config profiles | | Profiles this field allows, in dropdown order. Ignored when `profile` names a real profile. Example: `["hero","card"]` |
| `defaultProfile` | `string` | none (original aspect ratio) | | Profile for new entries, and for entries whose saved profile this field no longer allows. Setting it makes a profile required. Ignored when `profile` is set. Example: `"hero"` |
| `accept` | `"image"` \| `"video"` \| `"pdf"` \| `"image/video"` | `image/video` | `media` | Which Bynder types Compact View can select. Field config wins over `compactViewConfig.assetTypes`. Example: `"image"` |
| `desktopMobileMode` | `boolean` | `true` | `desktopMobile` | Dual desktop/mobile crops. `false` = one crop per asset; the UI never says desktop or mobile. Example: `false` |
| `suppressMetadata` | `boolean` | `false` | | Drop `name` and `webImage` from the saved JSON. Keeps `id`, `type`, `transformBaseUrl`, crop fields, and alt text. Use this when an entry will not save because the JSON field is over 10KB. Example: `true` |
| `maxNumberOfAssets` | `number` | `1` | `advanced.max_limit` | Cap on selected assets. `1` is Single Select. Values above 1 use Multi Select. Example: `3` |
| `compactLanguage` | `string` | `en_US` | | Compact View locale. Example: `"en_US"` |
| `enableDat` | `boolean` | `true` | | `false` forces CSS crop only (no DAT). Example: `false` |
| `allowFit` | `boolean` | `false` | | Offer **Fit** (letterbox) as well as Fill. Off by default, so **Transform type** is hidden. Example: `true` |
| `showFieldOperation` | `boolean` | `true` | `showOperation` | Hide **Transform type** even when `allowFit` is on. The menu only appears when DAT is active and there are two choices. Example: `false` |
| `video` | `object` | controls on; autoplay, mute, and loop off | `videoAutoplay`, `videoMuted`, `videoControls`, `videoLoop` | Default playback for a newly picked video. Saved on the asset as `video`. Example: `{ "autoplay": false, "muted": true, "controls": true, "loop": false }` |
| `showFieldAutoplay` | `boolean` | `true` | | Show the Autoplay checkbox. Example: `false` |
| `showFieldMuted` | `boolean` | `true` | `showFieldMute` | Show the Mute checkbox. Example: `false` |
| `showFieldControls` | `boolean` | `true` | | Show the Show controls checkbox. Example: `false` |
| `showFieldLoop` | `boolean` | `true` | | Show the Loop checkbox. Example: `false` |
| `additionalFields` | `additionalField[]` | none | | Extra author inputs. Each item is `{ "property", "type", "label" }` with `type` `"string"`, `"number"`, or `"boolean"`. Values save under `additional`. An invalid list replaces the custom field with a red error. |
| `compactViewConfig` | `object` | images and videos | `custom_settings.compact_view_options` | [Universal Compact View](https://developers.bynder.com/universal-compact-view) props we pass through. Portal URL, callbacks, and `mode` are not taken from here. |
| `custom_settings.dat_settings` | `object` | omitted | | Marketplace DAT presets. `default` becomes Compact View `defaultImageDerivativeName`. |
| `advanced.max_limit` | `number` | `1` | | Same as `maxNumberOfAssets`. Example: `4` |

The old size keys (`aspect`, `width`, `height`, the `lock*` flags, `format`, `aspectPresets`, `showFieldWidth` / `Height` / `AspectRatio` / `FileType` / `Quality` / `AdvancedQuery` / `DatPreset`, and the old `desktopMaxWidth` / `mobileMaxWidth` spellings) are no longer read. Saving App Configuration removes them.

### Field Config Parameter samples

Paste one of these into the custom field’s **Config Parameter**. App Config still supplies `bynderPortalUrl` and `profiles` unless you override them here.

**Hero banner: two profiles, up to 3 assets**

```json
{
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "profiles": ["hero", "largeHero"],
  "defaultProfile": "hero"
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

**PDF / documents**

```json
{ "accept": "pdf", "desktopMobileMode": false, "maxNumberOfAssets": 1 }
```

Documents save as identity plus two public file links — no crop, DAT, alt, or desktop/mobile:

```json
{
  "id": "…",
  "name": "Spec sheet",
  "type": "DOCUMENT",
  "url": "https://portal.bynder.com/m/…/original/spec.pdf",
  "downloadUrl": "https://portal.bynder.com/m/…/original/spec.pdf?download=true"
}
```

`url` opens/views the file; `downloadUrl` is the same with Bynder’s `download=true` so the browser downloads it.

**Images and videos (default), metadata stripped so the entry can save**

```json
{
  "accept": "image/video",
  "desktopMobileMode": true,
  "suppressMetadata": true,
  "maxNumberOfAssets": 5
}
```

**One crop for every viewport (no desktop/mobile UI), card profile only**

```json
{
  "desktopMobileMode": false,
  "maxNumberOfAssets": 1,
  "profiles": ["card"]
}
```

**Images only, DAT off (CSS crop)**

```json
{
  "desktopMobileMode": false,
  "maxNumberOfAssets": 1,
  "enableDat": false,
  "compactViewConfig": {
    "assetTypes": ["IMAGE"],
    "hideLimitedUse": true
  }
}
```

### DAT

DAT is **on by default** when the selected asset has `transformBaseUrl`. Compact View always selects the **asset** (never a derivative file). There is no author toggle: DAT vs CSS is detected from `transformBaseUrl` (and from `"enableDat": false`, which forces CSS for everyone).

**Transform type** appears only when Fit is enabled (`allowFit`) and DAT applies to the image. With Fit off, Fill is the only type, so the menu is hidden.

Fit also requires:

1. `enableDat` is on (App Config or field), and
2. The selected image has a Bynder DAT URL (`transformBaseUrl` in the saved JSON).

If DAT is allowed but the asset has no `transformBaseUrl`, the field shows a warning (“not DAT capable”), stores `webImage` plus crop fields, and hides Transform type. Fix that in Bynder (enable Dynamic Asset Transformation for the asset) or pick a different image. Videos never get DAT.

- The entry stores no DAT URLs. It stores the profile snapshot and each asset's focal point and mode; the site composes every URL it needs (see [Delivery](#delivery)).
- **Fill** composes `io=transform:fill,width:W,height:H&focuspoint=x,y`. **Fit** composes `io=transform:extend,…,background:…` (Bynder defaults to white without `background`, so it is always sent, including `background:auto`). A saved `operation: "scale"` from an older entry is Fill.
- DAT off / unavailable: the entry keeps `webImage`, and the site uses CSS `object-fit` / `object-position` from `focalPoint`.

## Author UI

- Compact View strip with desktop/mobile thumbs (unless `desktopMobileMode: false`). Each thumb has the profile aspect ratio for its viewport.
- Crop and focal controls appear only while an image thumbnail is selected. Videos open **Video settings**. Documents stay in the list but are not selectable.
- **Render profile** dropdown when there are two or more choices (allowed profiles, plus **Original aspect ratio** when the field sets no `profile` or `defaultProfile`). A field config `"profile": "hero"` assigns that profile and shows no dropdown. Changing a profile resizes every asset's crop frame and updates the saved snapshot.
- **Transform type** is hidden while Fill is the only choice. `allowFit` adds Fit and shows the menu. Fit offers a letterbox fill (auto / transparent / black / white / custom hex). A new pick starts with a centered focal point and Fill. A saved Fit on a field that does not allow it becomes Fill, and the field shows **Unsaved changes** until you save.
- Fit does not use a focal point: Bynder `extend` always shows the whole image. The focal-point circle and X/Y fields are hidden, and the preview loads the real transform URL so the letterbox color (including Auto) is Bynder’s. Fill keeps the full image in the editor so moving the focal point does not reload it.
- The crop editor header shows **Profile:** and the assigned name, or **Original aspect ratio** when none is assigned, plus the desktop and mobile aspect ratios. A profile uses its own ratios. Original uses each file’s ratio once the original pixel size is known.
- The Mobile tab link icon, and the link between the desktop and mobile thumbnails, mean those viewports are the same asset with the same crop: the same aspect ratio (or both Original), focal point, and transform type. A profile with different desktop and mobile aspects shows neither icon, even after **Match desktop**. When those crops can be the same, a broken link on the Mobile tab means the focal point or transform type differs. **Match desktop** appears next to **Reset center** on the Mobile tab and copies the desktop focal point and transform type onto mobile. **Match mobile** appears on the Desktop tab and copies the other way. Both hide once those choices already match. **Reset center** hides when the focal point is already 50%, 50%. A different mobile asset hides the icons and both match actions.
- If the author uses a different asset for mobile but picks the desktop file again with the same crop and alt text, the pair goes back to linked (no `mobile` in the saved JSON).
- Hovering a thumbnail shows its caption bar: the aspect ratio (e.g. `16:9 · WebP · 2000w` with DAT, `4:3 · WebP · 1500w` for an asset’s own ratio, or `16:9 · JPG · 2.1 MB` for a CSS crop) and the actions. **Edit** opens the crop editor for that thumbnail, the same as clicking it. A Fit thumbnail loads the transform URL, so its letterbox matches Bynder.
- The Transforms / Crop frame group is left out when it has nothing to show.
- The editor’s preview and copy-URL buttons compose the active tab's URL at the profile `targetWidth` with the same code the site uses, so the copied link matches what the site requests for its largest image.
- Click or drag the red dot (or anywhere on the image) to set the focal point.
- App Configuration → **Editor field defaults** has Show checkboxes for Transform type and the four video playback toggles.

### Loading an entry and "Unsaved changes"

On load the field runs the stored value through the same normalization as a save and compares the result (ignoring key order). If nothing differs, the field does not write, so opening an entry no longer marks it dirty in Contentstack. If something differs, the field writes the updated value and shows **Unsaved changes** until the entry is saved.

These config changes can change the saved value of an existing entry on its next load:

- Editing the entry's profile in App Config (new `profile.settings` snapshot).
- Changing `maxDesktopWidth` / `maxMobileWidth` on an entry without a profile.
- Removing the entry's profile from the field's `profiles` list (the entry switches to `defaultProfile`, or the original aspect ratio).
- `enableDat` off (keeps `webImage` when the asset has one).
- `desktopMobileMode: false` (drops `mobile`).
- `suppressMetadata` (drops `name` / `webImage`).
- A new boolean in `additionalFields` (its `false` default is added).
- A legacy or raw Bynder JSON value from an older build, including a saved `zoom` or `operation: "scale"` (both become Fill, and `zoom` is dropped).

If App Config no longer defines the entry's profile at all, the entry keeps its saved `profile.settings` and the field shows a warning until the author picks another profile.

## Saved JSON

Stored on the entry and returned by CDA / GraphQL:

- `profile` is `{ id, settings }`. `id` is the profile name. `settings` is the snapshot of that profile's resolved values. App Configuration is not available to the website, so the snapshot is what the site reads.
- Without a profile, `id` is omitted and `settings` has only `targetWidth` per viewport (the max widths), e.g. `{ "desktop": { "targetWidth": 2000 }, "mobile": { "targetWidth": 960 }, "quality": 80, "format": "webp" }`. The site uses each asset’s saved `aspectRatio`.
- One `assets` array. Each asset has its identity (`id`, `name`, `type`, `transformBaseUrl`, `alt`), the original file size (`originalAssetWidth` / `originalAssetHeight`), the `focalPoint`, and `operation`. Those pixels are the Bynder original file (`files.original`, or the asset `width` / `height`), not a DAT derivative. An older entry that is missing them is filled in when the field opens, using the Compact View sign-in already stored in this browser, and the field shows **Unsaved changes** until you save.
- `extendBackground` / `extendBackgroundColor` are saved only for Fit. `zoom` is not saved.
- Each asset also stores `originalAssetWidth`, `originalAssetHeight`, and `aspectRatio` (the original size reduced, e.g. `"4:3"`). A profile’s aspect ratio wins while one is selected. **Original aspect ratio** uses the stored `aspectRatio`.
- A video also stores `video`. Configured `additionalFields` values are stored on `additional`.
- Mobile that still matches desktop is omitted. A mobile with its own focal point or mode, or a different file, is `assets[n].mobile`. A different file also carries its own `id`, `transformBaseUrl`, `originalAssetWidth` / `Height`, and `alt`.

```json
{
  "v": 2,
  "profile": {
    "id": "hero",
    "settings": {
      "desktop": { "aspectRatio": "16:9", "targetWidth": 2000 },
      "mobile": { "aspectRatio": "4:3", "targetWidth": 960 },
      "quality": 80,
      "format": "webp"
    }
  },
  "assets": [
    {
      "id": "2DC52E62-5FB1-4938-BF689857EF9B51E2",
      "name": "Earth",
      "type": "IMAGE",
      "alt": "The Earth from space",
      "transformBaseUrl": "https://portal.bynder.com/transform/earth.jpg",
      "originalAssetWidth": 4000,
      "originalAssetHeight": 2667,
      "aspectRatio": "4000:2667",
      "focalPoint": { "x": 0.35, "y": 0.42 },
      "operation": "fill",
      "mobile": { "focalPoint": { "x": 0.6, "y": 0.4 }, "operation": "fill" }
    }
  ]
}
```

`webImage` is saved only without DAT. When it is present, use `webImage.url` with CSS `object-fit` and `object-position` from `focalPoint` instead of DAT.

## Delivery

Copy [`src/delivery/composeBynderImageUrl.ts`](src/delivery/composeBynderImageUrl.ts) (and the helpers it imports from `src/lib/`) into the website:

```ts
import { buildBynderSources, composeBynderImageUrl } from "./delivery";

const desktop = buildBynderSources(entry.hero_image_settings);
const mobile = buildBynderSources(entry.hero_image_settings, { viewport: "mobile" });
// desktop.src     → the 2000w image
// desktop.srcset  → "…width:640… 640w, …960w, …1280w, …1600w, …1920w, …2000w"
// desktop.width / desktop.height → 2000 × 1125, for the <img> width/height attributes
// desktop.objectPosition → "35% 42%"

const thumb = composeBynderImageUrl(entry.hero_image_settings, { width: 400 });
```

- Pass `{ assetId }` to pick an asset other than the first.
- Pass `{ widths: [...] }` to change the srcset steps. They are always cut at, and end with, the viewport `targetWidth`.
- Without a profile, the image uses the asset’s saved `aspectRatio` (or, if that was never stored, the ratio of `originalAssetWidth` / `originalAssetHeight`). The widest image is the smaller of `targetWidth` and `originalAssetWidth`. If neither the ratio nor the original size was recorded, the helper requests a proportional resize (`io=transform:scale,width:W`) and returns no `height`.
- Without DAT, `buildBynderSources` returns only `src` (the `webImage` URL) and `objectPosition`. Fit has no focal point.


## Project layout

```
src/
  locations/CustomField/     Custom Field UI (picker + crop)
  locations/AppConfig/       Portal URL, DAT, render profiles, editor field defaults
  components/                Compact picker, crop + focal-point editor, transform form
  lib/bynder/                Parse Compact View JSON + compose DAT URLs
  delivery/                  Website helper
```

Built from the [Marketplace App Boilerplate](https://github.com/contentstack/marketplace-app-boilerplate) (Vite, React, `@contentstack/app-sdk` ^2.4, `@bynder/compact-view`).
