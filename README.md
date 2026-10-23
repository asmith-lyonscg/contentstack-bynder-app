# Bynder Image Settings

Contentstack Marketplace **Custom Field** for Bynder Universal Compact View: pick an asset, set focal point and crop, save everything in **one JSON field**.

Written by **Anthony Smith**. Owned by **Capgemini**.

Bynder DAT is used whenever the asset has a DAT URL (`transformBaseUrl`).

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
   | Content Type Sidebar | Bynder field setup | `/content-type-sidebar` | — |

5. Install the app on your stack.
6. Open **App Configuration**, enter your Bynder portal host (example: `acme.getbynder.com`, no `https://`), then use Contentstack’s **Save**. The form sends the configuration as you edit, so there is no second save button inside the form.
7. On a content type, add this app’s JSON Custom Field. Optional: paste a [Config Parameter](#field-config-parameter-samples) on the field. Field config wins over App Configuration.

The Content Type Sidebar location shows two Config Parameter examples and a key table (key, type, default). Open a content type and choose **Apps** in the right panel. See [Content Type Sidebar Location](https://www.contentstack.com/docs/developer-hub/content-type-sidebar-location).

That’s it. Authors sign into Bynder inside Compact View.

The field stores one JSON object (`v`, `profile`, `assets`). The Delivery API returns that object on the field’s UID. The website renders that object. Each entry already holds a copy of the profile it used, so rendering needs nothing else from this app. See [On the website](#on-the-website).

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

6. Keep the UI location paths as `/custom-field`, `/app-configuration`, and `/content-type-sidebar`.
7. Reload the entry editor in Contentstack. Your local build is what runs inside the iframe.

### Useful commands

```bash
npm test
npm run typecheck
npm run build
```

`npm run build` writes a production `dist/` folder (including `404.html`, `.nojekyll`, and HTML shells for `/custom-field`, `/app-configuration`, `/content-type-sidebar`, and `/picker`).

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
2. UI locations stay `/custom-field`, `/app-configuration`, and `/content-type-sidebar`.
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

### Bynder max dimension (App Configuration)

Bynder returns the original file when a DAT transform is larger than the account limit on **either** side. That limit defaults to 2000px and can be raised in Bynder. App Configuration → **Bynder max dimension** sets `maxDimension` (default `2000`) to the same number.

- The site chooses the request widths. Delivery shrinks any step, keeping its aspect ratio, so neither side passes `maxDimension`.

### Render profiles (App Configuration)

Image sizes come from named **render profiles**, defined once in App Configuration → **Render profiles**:

```json
{
  "hero": {
    "desktop": "16:9",
    "mobile": "4:3",
    "quality": 80,
    "format": "webp"
  },
  "largeHero": {
    "desktop": "21:9",
    "mobile": "4:5"
  }
}
```

- Every profile needs `desktop` and `mobile` aspect ratios (`"W:H"`).
- `quality` (1–100) defaults to `80`; `format` (`webp`, `avif`, `jpg`, `png`) defaults to `webp`.
- The site passes the widths it needs. Delivery caps each one so neither side passes `maxDimension`.
- Profile names must be unique, start with a letter, and use letters, numbers, `_`, or `-`.
- The editor validates as you type and will not save invalid JSON, a duplicate name, or an invalid profile.
- There is no built-in profile. With no profiles, or when neither the field nor the author picks one, each asset keeps the aspect ratio of its original pixel size. That ratio is reduced (`4000×3000` → `4:3`) from `origWidth` and `origHeight`.

Authors never type a width, height, aspect, format, or quality. The profile locks the aspect, format, and quality. Authors set the focal point. **Fill** is the only transform type.

### Field Config Parameter

Example field **Config Parameter** (field config wins over App Configuration):

```json
{
  "bynderPortalUrl": "acme.getbynder.com",
  "type": ["image", "video"],
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "profiles": ["hero", "largeHero"],
  "defaultProfile": "hero"
}
```

`"profile": "hero"` locks this field to that one profile. Authors do not get a dropdown, and every asset uses it. Omit `profile` and the **Render profile** dropdown stays visible, including after a profile is selected. `profiles` limits which profiles this field offers when `profile` is omitted. With no list, the dropdown offers every App Config profile and every profile defined on this field. Unknown names are ignored. `defaultProfile` is used for new entries and makes a profile required. Without `profile` or `defaultProfile`, new entries keep the original aspect ratio, and the dropdown also offers **Original aspect ratio**.

`fieldProfiles` defines one or more profiles on this field, in the same shape as App Config `profiles`. A matching name replaces the App Config profile for this field only. List that name in `profiles` to offer it beside App Config profiles, or omit `profiles` to offer it with all of them.

**Customize** (a dragged aspect ratio, saved as `profile.id` `"custom"`) is off unless this field sets `"allowCustomAspect": true`. It starts each viewport at that file’s own aspect ratio. Dragging the right edge of the preview sets a new ratio; once the edge reaches the canvas, further dragging shrinks the preview so the ratio can keep getting wider. The choice applies to every asset in the field. Do not name a profile `custom`.

```json
{
  "fieldProfiles": {
    "banner": {
      "desktop": "21:9",
      "mobile": "4:3"
    }
  },
  "profiles": ["banner", "hero"],
  "allowCustomAspect": true
}
```

`type` lists the files Compact View can select: `"image"`, `"video"`, and `"pdf"`. Example: `["image", "video"]`. Omit `type` and the field allows images and videos. `"desktopMobileMode": false` turns off the desktop/mobile split; the editor then uses the profile's desktop values. `"suppressMetadata": true` stores only `id`, the asset `type`, and `transformBaseUrl` (plus crop fields, alt, video playback, and `additional` author values) so a large Bynder payload can stay under Contentstack’s 10KB field limit.

Until an image is chosen, the field shows **+ Choose Asset(s)**. If an image is already selected, the row action is **Change Asset(s)**. When the field allows more than one asset, **Add Asset(s)** stays under the list until that limit is reached. It opens Compact View with the current assets selected. A newly added asset uses the same file for desktop and mobile until the author picks a different mobile file. Closing Compact View without confirming leaves the current assets in place.

Marketplace-style Compact View / DAT options can live on the same Config Parameter. Prefer the camelCase `compactViewConfig` namespace (the marketplace `custom_settings.compact_view_options` key is still accepted).

By default Compact View allows **images and videos**. A document field sets `"type": ["pdf"]`. `compactViewConfig.assetTypes` applies only when `type` is omitted. We do **not** set `assetFilter.predefinedAssetType` by default: Bynder hides search and filters whenever `assetFilter` is present unless `showToolbar` is true.

```json
{
  "maxNumberOfAssets": 5,
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
| `maxDimension` (App Config) | `number` | `2000` | | Bynder’s limit on either side of a transformed image. The site chooses the widths, and delivery shrinks any step that would pass this. Example: `4000` |
| `profiles` (App Config) | `object` | none | | Named render profiles, see above. |
| `profile` (field) | `string` | none | | Lock this field to one App Config profile. No dropdown. Example: `"hero"` |
| `fieldProfiles` (field) | `object` | none | | Profiles defined on this field, same shape as App Config `profiles`. Offered with the App Config profiles unless `profiles` lists a smaller set. A matching name replaces the App Config profile on this field. Example: `{ "banner": { "desktop": "21:9", "mobile": "4:3" } }` |
| `profiles` (field) | `string[]` or comma-separated `string` | every App Config profile and every `fieldProfiles` name | | Profiles this field allows, in dropdown order. Names may be App Config profiles or `fieldProfiles` keys. Ignored when `profile` names a real profile. Example: `["banner","hero"]` |
| `defaultProfile` | `string` | none (original aspect ratio) | | Profile for new entries, and for entries whose saved profile this field no longer allows. Setting it makes a profile required. Ignored when `profile` is set. Example: `"hero"` |
| `allowCustomAspect` (field) | `boolean` | `false` | | Offer **Customize**, the dragged aspect ratio. Off unless this field sets it. Example: `true` |
| `type` | `("image" \| "video" \| "pdf")[]` | images and videos | | Files Compact View can select. Field config wins over App Configuration and over `compactViewConfig.assetTypes`. Example: `["image", "video"]` |
| `desktopMobileMode` | `boolean` | `true` | | Dual desktop/mobile crops. `false` = one crop per asset; the UI never says desktop or mobile. Example: `false` |
| `suppressMetadata` | `boolean` | `false` | | Drop `name` and `webImage` from the saved JSON. Keeps `id`, `type`, `transformBaseUrl`, crop fields, and alt text. Use this when an entry will not save because the JSON field is over 10KB. Example: `true` |
| `maxNumberOfAssets` | `number` | `1` | `advanced.max_limit` | Cap on selected assets. `1` is Single Select. Values above 1 use Multi Select. Example: `3` |
| `compactLanguage` | `string` | `en_US` | | Compact View locale. Example: `"en_US"` |
| `video` | `object` | controls on; autoplay, mute, and loop off | `videoAutoplay`, `videoMuted`, `videoControls`, `videoLoop` | Default checked state for Autoplay, Mute, Controls, and Loop. Those four checkboxes always show. Saved on the asset as `video`. Example: `{ "autoplay": false, "muted": true, "controls": true, "loop": false }` |
| `additionalFields` | `additionalField[]` | none | | Extra author inputs. Each item is `{ "property", "type", "label" }` with `type` `"string"`, `"number"`, or `"boolean"`. Values save under `additional`. An invalid list replaces the custom field with a red error. |
| `compactViewConfig` | `object` | images and videos | `custom_settings.compact_view_options` | [Universal Compact View](https://developers.bynder.com/universal-compact-view) props we pass through. Portal URL, callbacks, and `mode` are not taken from here. |
| `custom_settings.dat_settings` | `object` | omitted | | Marketplace DAT presets. `default` becomes Compact View `defaultImageDerivativeName`. |
| `advanced.max_limit` | `number` | `1` | | Same as `maxNumberOfAssets`. Example: `4` |

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
{ "type": ["image"], "desktopMobileMode": true }
```

**Video only** — one thumbnail, playback options, no mobile crop

```json
{
  "type": ["video"],
  "desktopMobileMode": false,
  "video": { "autoplay": false, "muted": true, "controls": true, "loop": false }
}
```

**Extra author fields**

```json
{
  "type": ["image", "video"],
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
{ "type": ["pdf"], "desktopMobileMode": false, "maxNumberOfAssets": 1 }
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

`url` opens/views the file; `downloadUrl` is the same with Bynder’s `download=true` so the browser downloads it. The authoring list does not store a thumbnail. For an `/asset/{id}/{file}.pdf` URL it requests `/asset/{id}/thumbnail/thul-{file}` while the field is open, and shows a document icon if that image fails.

**Images and videos (default), metadata stripped so the entry can save**

```json
{
  "type": ["image", "video"],
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

**Images only, Compact View limited to images**

```json
{
  "type": ["image"],
  "desktopMobileMode": false,
  "maxNumberOfAssets": 1,
  "compactViewConfig": {
    "hideLimitedUse": true
  }
}
```

### DAT

DAT is used when the selected asset has `transformBaseUrl`. Compact View always selects the **asset** (never a derivative file). Videos never get DAT.

If the asset has no `transformBaseUrl`, the entry keeps `webImage` and the site uses CSS `object-fit` / `object-position` from `focalPoint`. Fix that in Bynder (enable Dynamic Asset Transformation for the asset) or pick a different image.

- The entry stores no DAT URLs. It stores the profile snapshot and each asset's focal point and Fill; the site composes every URL it needs (see [On the website](#on-the-website)).
- **Fill** composes `io=transform:fill,width:W,height:H&focuspoint=x,y`. A missing focal point is the center, `0.5,0.5`.

## Author UI

- Compact View strip with desktop/mobile thumbs (unless `desktopMobileMode: false`). Each thumb has the profile aspect ratio for its viewport.
- Crop and focal controls appear only while an image thumbnail is selected. Videos open **Video settings**. Documents stay in the list but are not selectable.
- **Render profile** dropdown whenever the field Config Parameter does not set `"profile"`. It stays visible after a profile is selected. **Original aspect ratio** is one of the choices when the field sets no `defaultProfile`. The other choices are every App Config profile plus any `fieldProfiles` on this field, unless `profiles` lists a smaller set. **Customize** is not one of them unless the field sets `allowCustomAspect`. A field config `"profile": "hero"` assigns that profile and shows no dropdown. Changing a profile updates the crop frame's aspect ratio and the saved snapshot.
- The crop editor header shows **Profile:** and the assigned name, or **Original aspect ratio** when none is assigned, then **Aspect Ratio:** for the viewport you are editing. Desktop shows the desktop ratio and mobile shows the mobile ratio. A profile uses its own ratio. Original uses that file’s ratio once the original pixel size is known.
- The Mobile tab link icon, and the link between the desktop and mobile thumbnails, mean those viewports are the same asset with the same crop: the same aspect ratio (or both Original) and focal point. A profile with different desktop and mobile aspects shows neither icon, even after **Match desktop**. When those crops can be the same, a broken link on the Mobile tab means the focal point differs. **Match desktop** appears next to **Reset center** on the Mobile tab and copies the desktop focal point onto mobile. **Match mobile** appears on the Desktop tab and copies the other way. Both hide once those choices already match. **Reset center** hides when the focal point is already 50%, 50%. A different mobile asset hides the icons and both match actions.
- If the author uses a different asset for mobile but picks the desktop file again with the same crop and alt text, the pair goes back to linked (no `mobile` in the saved JSON).
- Hovering a thumbnail shows its caption bar: the aspect ratio and file type (e.g. `16:9 · WebP` with DAT, or `16:9 · JPG · 2.1 MB` when the file has no transform URL) and the actions. **Edit** opens the crop editor for that thumbnail, the same as clicking it.
- The Render profile group is left out when the field is locked to one profile.
- The editor’s preview shows the source image in the profile aspect ratio. Copy URL composes the active tab's largest default srcset step with the same code the site uses.
- Click or drag the red dot (or anywhere on the image) to set the focal point.
- Autoplay, Mute, Controls, and Loop always show on a video. Their default checked state comes from the `video` config.

### Loading an entry and "Unsaved changes"

On load the field runs the stored value through the same normalization as a save and compares the result (ignoring key order). When nothing differs, the field does not write, so opening an entry leaves it clean in Contentstack. When something differs, the field writes the updated value and shows **Unsaved changes** until the entry is saved.

These config changes can change the saved value of an existing entry on its next load:

- Editing the entry's profile in App Config (new `profile.settings` snapshot).
- Removing the entry's profile from the field's `profiles` list (the entry switches to `defaultProfile`, or the original aspect ratio).
- `desktopMobileMode: false` (drops `mobile`).
- `suppressMetadata` (drops `name` / `webImage`).
- A new boolean in `additionalFields` (its `false` default is added).
- Original pixel size filled in after the field opens, when the saved asset did not include `origWidth` and `origHeight`.

If App Config no longer defines the entry's profile at all, the entry keeps its saved `profile.settings` and the field shows a warning until the author picks another profile.

## Saved JSON

Stored on the entry and returned by CDA / GraphQL:

- `profile` is `{ id, settings }`. `id` is the profile name. `settings.desktop` and `settings.mobile` are the aspect ratios (`"16:9"`). `settings` also stores `quality` and `format`. App Configuration is not available to the website, so the snapshot is what the site reads. **Customize** saves `id: "custom"` and writes the dragged ratios as those two strings.
- Without a profile, `id` is omitted and so are `desktop` and `mobile`, e.g. `{ "quality": 80, "format": "webp" }`. The site uses each asset’s `origWidth` / `origHeight`. `maxDimension` is included only when it is not 2000.
- One `assets` array. Each asset has its identity (`id`, `name`, `type`, `transformBaseUrl`, `alt`), the original file size (`origWidth` / `origHeight`), and `operation` (`"fill"`). `focalPoint` is saved only when it is not the center (`0.5`, `0.5`). Those pixels are the Bynder original file (`files.original`, or the asset `width` / `height`), not a DAT derivative. If they are missing when the field opens, the field fills them in from the Compact View sign-in already stored in this browser and shows **Unsaved changes** until you save.
- A video also stores `video`. Configured `additionalFields` values are stored on `additional`.
- Mobile that still matches desktop is omitted. A mobile with its own focal point, or a different file, is `assets[n].mobile`. A different file also carries its own `id`, `transformBaseUrl`, `origWidth`, `origHeight`, and `alt`.

```json
{
  "v": 2,
  "profile": {
    "id": "hero",
    "settings": {
      "desktop": "16:9",
      "mobile": "4:3",
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
      "origWidth": 4000,
      "origHeight": 2667,
      "focalPoint": { "x": 0.35, "y": 0.42 },
      "operation": "fill",
      "mobile": { "focalPoint": { "x": 0.6, "y": 0.4 }, "operation": "fill" }
    }
  ]
}
```

`webImage` is saved only when the file has no `transformBaseUrl`. When it is present, use `webImage.url` with CSS `object-fit` and `object-position` from `focalPoint`.

## On the website

Read the custom field from the entry. Its UID is whatever you named it on the content type. `hero_image_settings` in the example below is only a name. The value is the object in [`samples/bynder-field-large-hero.json`](samples/bynder-field-large-hero.json): `v`, `profile`, and `assets`. Those sample files are that field value. The Delivery API returns the object. When a client gives you a string, parse it once and pass the object through.

Copy these files and keep this layout, so the imports still resolve:

```
delivery/index.ts                    ← src/delivery/index.ts
delivery/composeBynderImageUrl.ts    ← src/delivery/composeBynderImageUrl.ts
lib/types.ts                         ← src/lib/types.ts
lib/profiles.ts                      ← src/lib/profiles.ts
lib/bynder/composeDatUrl.ts          ← src/lib/bynder/composeDatUrl.ts
```

`buildBynderSources` is the function that builds every image URL. [`samples/BynderPicture.tsx`](samples/BynderPicture.tsx) is the React `<picture>` that calls it. Copy that component and point its import at your `delivery` folder. The HTML files next to it are the markup that component returns for the three sample payloads. Match that markup, including `width`, `height`, and `sizes`.

```tsx
import { BynderPicture } from "./BynderPicture";

const value = entry.hero_image_settings;

export function Hero() {
  const firstId = value?.assets?.[0]?.id;
  return <BynderPicture value={value} assetId={firstId} sizes="100vw" />;
}
```

```ts
import { buildBynderSources, composeBynderImageUrl } from "./delivery";

const value = entry.hero_image_settings;
const desktop = buildBynderSources(value, { widths: [640, 960, 1280, 1600, 1920, 2560, 3200, 3840] });
const mobile = buildBynderSources(value, { viewport: "mobile", widths: [640, 960, 1280, 1600, 1920, 2560, 3200, 3840] });
// desktop.src             → the 2000w image
// desktop.srcset          → "…width:640… 640w, …960w, …1280w, …1600w, …1920w, …2000w"
// desktop.width / height  → 2000 × 1125, for the <img> width and height
// desktop.objectPosition  → "50% 50%" when the JSON omits focalPoint

const thumb = composeBynderImageUrl(value, { width: 400 });
```

Render one picture per image. Pass that asset’s `id` as `assetId` when the field holds more than one. `BynderPicture` requests both viewports. An asset with no `mobile` object uses the same file for both, and the mobile source uses `profile.settings.mobile`.

`sizes` is the CSS width of the slot (`"100vw"` for a full-bleed hero, `"40vw"` for a split column). `widths` is the list of file widths to request for that slot. Widths come from the slot. The default list is 640, 960, 1280, 1600, 1920, 2560, 3200, 3840. A narrower slot passes a shorter list. Leave `maxDimension` unset: the helper reads `profile.settings.maxDimension`, or 2000 when the snapshot omits it, and drops any step that would make either side larger. `src` and the `img` `width` / `height` are the largest remaining desktop step. Omit `width` on `composeBynderImageUrl` to get that same step.

`alt` is `assets[].alt`. An empty string stays empty. `objectPosition` is the focal point. The DAT URL already crops to that point. Set CSS `object-position` from `objectPosition` so an asset that only has `webImage` (no `transformBaseUrl`) uses the same point. With no `transformBaseUrl`, `buildBynderSources` returns `src` and `objectPosition` only.

Without a profile, the image uses the ratio of `origWidth` / `origHeight`. When those pixels were never recorded, the helper requests `io=transform:scale,width:W` and returns no `height`.

Use the helper for `type: "IMAGE"`. A video stores `video` (`autoplay`, `muted`, `controls`, `loop`) and no focal point. Play `webImage.url` when it is present, with those flags, and leave the URL unchanged. A document stores `url` (view) and `downloadUrl` (download).

The three fixtures are the same two Bynder files under three profiles:

| Sample | Profile | Slot | Desktop `img` | Mobile source |
|---|---|---|---|---|
| [`bynder-field-large-hero.json`](samples/bynder-field-large-hero.json) | `largeHero`, desktop `16:9`, mobile `5:3` | `sizes="100vw"`, standard widths | 2000×1125 | 2000×1200, separate file |
| [`bynder-field-split-left-right.json`](samples/bynder-field-split-left-right.json) | `splitLeftRight`, desktop `7:4`, mobile `16:9` | `sizes="40vw"`, widths 480, 640, 800, 960, 1280 | 1280×731 | 1280×720, separate file |
| [`bynder-field-custom.json`](samples/bynder-field-custom.json) | `id` `"custom"`, desktop `2:1`, mobile `3:2` | `sizes="100vw"`, standard widths | 2000×1000 | 2000×1333, separate file |

[`bynder-picture-large-hero.html`](samples/bynder-picture-large-hero.html), [`bynder-picture-split-left-right.html`](samples/bynder-picture-split-left-right.html), and [`bynder-picture-custom.html`](samples/bynder-picture-custom.html) are the `<picture>` for those three values. The centered focal point is omitted in the JSON and comes back as `focuspoint=0.5,0.5`.


## Project layout

```
samples/                       Field JSON, the React <picture>, and the markup it returns
src/
  locations/CustomField/     Custom Field UI (picker + crop)
  locations/AppConfig/       Portal URL, max dimension, render profiles
  locations/ContentTypeSidebar/  Field Config Parameter guide
  components/                Compact picker, crop + focal-point editor, transform form
  lib/bynder/                Parse Compact View JSON + compose DAT URLs
  delivery/                  Website helper
```

Built from the [Marketplace App Boilerplate](https://github.com/contentstack/marketplace-app-boilerplate) (Vite, React, `@contentstack/app-sdk` ^2.4, `@bynder/compact-view`).
