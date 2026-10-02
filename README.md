# Bynder Image Settings

A Contentstack Marketplace **Custom Field** that embeds Bynder Universal Compact View so authors pick an image, then set a focal point and crop frame (aspect / width / height), in **one JSON field**. Bynder DAT transforms are on by default when the asset has a DAT URL (`transformBaseUrl`). Set `"enableDat": false` on App Config or the field to force CSS crop for everyone.

This field does **not** require the official Bynder Marketplace app. The official picker can remain on a content type as leftover, but this app no longer reads a sibling Bynder field.

__________________________

## Install in Contentstack

The hosted app is [https://asmith-lyonscg.github.io/contentstack-bynder-app](https://asmith-lyonscg.github.io/contentstack-bynder-app) (no trailing slash). Authors sign into Bynder inside Compact View. You do not need to build or host it yourself.

1. **Developer Hub** → create a Standard / private app (or open the existing one).
2. **Hosting → Custom Hosting → App URL:** `https://asmith-lyonscg.github.io/contentstack-bynder-app`
3. **UI Locations**
   - Custom Field: name `Bynder Asset Settings`, path `/custom-field`, data type **JSON**
   - App Configuration: path `/app-configuration`
4. Install the app on the stack.
5. Open **App Configuration**, set the Bynder **portal URL** (`acme.getbynder.com`, no `https://`), **Save**.
6. On a content type, add this app’s JSON Custom Field. Paste a [Config Parameter](#field-config-parameter-samples) if the field should differ from App Configuration. Field config wins.

### GitHub Pages

This branch is static. `npm run build` writes `dist/404.html` (copy of `index.html`) and `dist/.nojekyll` so `/custom-field`, `/app-configuration`, and `/picker` work.

A GitHub **project** site lives at `https://<user>.github.io/<repo>/`. This app’s Vite `base` and React Router basename follow that path in GitHub Actions (`GITHUB_REPOSITORY`). Local and Launch builds stay at `/`.

Target for this repo: [https://asmith-lyonscg.github.io/contentstack-bynder-app/](https://asmith-lyonscg.github.io/contentstack-bynder-app/)

1. Commit this branch and push it to `https://github.com/asmith-lyonscg/contentstack-bynder-app` (`main` or `feature/github-pages`).
2. Repo **Settings → Pages → Build and deployment → Source:** GitHub Actions.
3. The **Deploy GitHub Pages** workflow (`.github/workflows/pages.yml`) builds `dist` with base `/contentstack-bynder-app/` and publishes it.
4. Developer Hub → **Hosting → Custom Hosting → App URL:** `https://asmith-lyonscg.github.io/contentstack-bynder-app` (no trailing slash).
5. UI location paths stay `/custom-field` and `/app-configuration`. Contentstack loads `https://asmith-lyonscg.github.io/contentstack-bynder-app/custom-field`.

Local check of the Pages base: `npm run build:pages`, then `$env:VITE_BASE_PATH="/contentstack-bynder-app/"; npm run preview` and open `/contentstack-bynder-app/`.

A custom domain on Pages can use base `/` again (leave `VITE_BASE_PATH` unset). Bitbucket `*.bitbucket.io` sends `X-Frame-Options: DENY` and cannot be iframed by Contentstack. GitHub Pages does not.

| Location | Path |
|---|---|
| Custom Field | `/custom-field` |
| App Configuration | `/app-configuration` |

```bash
npm test
npm run typecheck
npm run build
npm run package:launch
```

`npm run package:launch` writes `launch/bynder-image-settings.zip` (source, no `node_modules`) for Developer Hub → Hosting with Launch → upload zip. In Launch, use build `npm run build` and output `./dist`.

## Configure the content type

Add **one** JSON Custom Field (this app). A Group is optional.

On **Bynder Image Settings**, set the field **Config Parameter** if you need to override App Configuration (field config wins):

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

`accept` is the simple media filter. Use `"image"`, `"video"`, `"pdf"`, or `"image/video"` (the default). `"desktopMobileMode": false` turns off the desktop/mobile split. `"suppressMetadata": true` stores only `id`, `type`, and `transformBaseUrl` (plus crop fields, alt, video playback, and `additional` author values) so a large Bynder payload can stay under Contentstack’s 10KB field limit.

With `"desktopMobileMode": false`, `aspect`, `width`, `height`, and the lock flags must be scalars (`"16:9"`, `1200`, `true`). Dual `{ "desktop", "mobile" }` objects are ignored except for the `desktop` value.

Until an image is chosen, the field shows **+ Choose Asset(s)**. If an image is already selected, the row action is **Change Asset(s)**. Closing Compact View without confirming a new selection leaves the current asset in place. Compact View 6.0.1 encodes `selectedAssets` with `btoa("(Asset_id " + mediaUUID + ")")` and loads them via GraphQL `nodes(ids:)`. This app passes the Bynder media UUID (`id` / `databaseId`, including the 8-4-4-16 form). Do not pass Compact View’s GraphQL `id` — that double-encodes and preselect is empty. Compact View also treats any GraphQL `errors` key as a total miss even when `data.nodes` has the asset; this app keeps those nodes and writes the current selection into Compact View’s store so the footer can restore.

Marketplace-style Compact View / DAT options can live on the same Config Parameter. Prefer the camelCase `compactViewConfig` namespace (the marketplace `custom_settings.compact_view_options` key is still accepted). Locales and multiple app configurations (`config_label`) are ignored.

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
| `aspect` | `string` or `{ desktop?: string, mobile?: string }` | omitted | | Preset for **new** entries; forced when `lockAspect` is true. In `desktopMobileMode`, an object sets desktop and mobile separately. A scalar applies to both (and is the only allowed form when `desktopMobileMode` is `false`). Example: `"16:9"` or `{ "desktop": "16:9", "mobile": "9:16" }` |
| `width` | `number` or `{ desktop?: number, mobile?: number }` | omitted | | Same as `aspect`. Dual objects are only used when `desktopMobileMode` is `true`. Omit to seed from the file’s pixel size. Example: `1200` or `{ "desktop": 1200, "mobile": 390 }` |
| `height` | `number` or `{ desktop?: number, mobile?: number }` | omitted | | Same as `width`. If omitted, height is derived from aspect + width, or from the file. Example: `675` or `{ "desktop": 675, "mobile": 844 }` |
| `lockAspect`, `lockWidth`, `lockHeight` | `boolean` or `{ desktop?: boolean, mobile?: boolean }` | `false` | | Disable those inputs. A scalar locks both viewports. An object can lock one viewport only (`desktopMobileMode: true`). Hiding a field does not lock its value: `showFieldAspectRatio: false` still lets width and height set the crop independently. When `desktopMobileMode` is `false`, only a boolean is used. Example: `true` or `{ "desktop": true, "mobile": false }` |
| `format` | `"webp"` \| `"jpg"` \| `"png"` | `webp` | `fileType` | DAT output format for **new** entries. This is the delivery format, not the original Bynder extension (`persistAssetKeys` includes `fileType` for that). Example: `"jpg"` |
| `showFieldFileType` | `boolean` | `false` | `showFormat`, `showFileType`, `hideFormat: false` | Show the DAT file-type control. Example: `true` |
| `showFieldOperation` | `boolean` | `true` | `showOperation` | Show **Transform type** (Fill, Fit, Crop). Example: `false` |
| `showFieldAspectRatio` | `boolean` | `false` | `showAspect` | Show the aspect-ratio dropdown. Defaults to `true` when `lockWidth` or `lockHeight` is set, unless you set this flag yourself. When aspect, width, and height are all shown and unlocked, one padlock stays locked at a time and the other two fields adjust around it. Example: `true` |
| `showFieldWidth` | `boolean` | `true` | `showWidth` | Show **Layout Width**. With height shown, aspect hidden, and neither side locked, **Constrain Proportions** can keep the current ratio. Example: `false` |
| `showFieldHeight` | `boolean` | `true` | `showHeight` | Show **Layout Height**. Example: `false` |
| `showFieldQuality` | `boolean` | `false` | `showQuality` | Show the DAT quality control. Example: `true` |
| `showFieldAdvancedQuery` | `boolean` | `false` | `showAdvancedQuery`, `showExtraQuery` | Show the extra DAT query field. Example: `true` |
| `showFieldDatPreset` | `boolean` | `false` | `showDatPreset` | Show the DAT preset control. Example: `true` |
| `video` | `object` | controls on; autoplay, mute, and loop off | `videoAutoplay`, `videoMuted`, `videoControls`, `videoLoop` | Default playback for a newly picked video. Each flag is a boolean: `autoplay`, `muted`, `controls`, `loop`. Field config wins over App Config, and the nested object wins over the flat aliases. Saved on the asset as `video`. Hiding a checkbox does not change this default. Example: `{ "autoplay": false, "muted": true, "controls": true, "loop": false }` |
| `showFieldAutoplay` | `boolean` | `true` | | Show the Autoplay checkbox. Example: `false` |
| `showFieldMuted` | `boolean` | `true` | `showFieldMute` | Show the Mute checkbox. Example: `false` |
| `showFieldControls` | `boolean` | `true` | | Show the Show controls checkbox. Example: `false` |
| `showFieldLoop` | `boolean` | `true` | | Show the Loop checkbox. Example: `false` |
| `additionalFields` | `additionalField[]` | none | | Extra author inputs in the editor. Each additionalField is `{ "property", "type", "label" }`. `type` is `"string"`, `"number"`, or `"boolean"`. `property` starts with a letter and then uses only letters, numbers, and underscores, and cannot reuse a saved asset key such as `id` or `type`. `label` is required. Values are saved on `additional`, keyed by `property`. A field that sets this replaces the App Config list. An invalid list replaces the custom field with a red error. Example: `[{ "property": "uniqueId", "type": "boolean", "label": "some label" }]` |
| `lockFormat` | `boolean` | `false` | `lockFileType` | Show the file-type control but disable it. Example: `true` |
| `aspectPresets` | `string[]` or comma-separated `string` | `16:9`, `1:1`, `4:3`, `4:5` | | Aspect dropdown options. Example: `["16:9","1:1"]` |
| `compactViewConfig` | `object` | images and videos | `custom_settings.compact_view_options` | [Universal Compact View](https://developers.bynder.com/universal-compact-view) props we pass through: `language`, `assetTypes`, `assetFilter`, `theme`, `hideExternalAccess`, `hideLimitedUse`, `hideSwitch`, `noCache`, `selectAllOption`, `defaultSearchTerm`, `defaultImageDerivativeName`, `defaultVideoDerivativeName`, `isPersonal`, `enableDASH`, `embedType`. Portal URL, callbacks, and `mode` are not taken from here. Example: `{ "assetTypes": ["IMAGE","VIDEO"], "defaultSearchTerm": "hero" }` |
| `custom_settings.dat_settings` | `object` | omitted | | Marketplace DAT presets. `default` becomes Compact View `defaultImageDerivativeName`. Example: `{ "default": "webImage", "transformation_options": { "crop": "io=transform:crop,width:300" } }` |
| `advanced.max_limit` | `number` | `1` | | Same as `maxNumberOfAssets`. Example: `4` |

If aspect and width are both locked for a viewport, height is derived and locked in the UI for that viewport.

A scalar `"aspect": "16:9"` in dual mode still works: both desktop and mobile start at 16:9 and stay linked until mobile is edited. Use `{ "desktop": "16:9", "mobile": "9:16" }` when new assets should open unmatched.

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

New picks open unmatched (desktop 1200×675, mobile 390×693). Height is derived from aspect + width.

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

**Extra author fields** — string, number, and boolean inputs in the crop / video editor

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

Author values for those inputs are saved on each asset under `additional` (see Saved JSON below).

**PDF only**

```json
{ "accept": "pdf", "desktopMobileMode": false, "maxNumberOfAssets": 1 }
```

**Save the original file type and tags**

`persistAssetKeys` stores extra Bynder values. `width` and `height` in that list are the original pixel size. Layout size stays on `transform`. `suppressMetadata: true` drops these extras.

```json
{
  "accept": "image/video",
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "persistAssetKeys": ["fileType", "fileSize", "width", "height", "description", "tags"]
}
```

**Show the file-type and aspect inputs, and hide layout width**

Width and height are shown unless you turn them off. Aspect and file type stay hidden unless you turn them on.

```json
{
  "showFieldFileType": true,
  "showFieldAspectRatio": true,
  "showFieldWidth": false
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
  "lockAspect": true,
  "showFieldAspectRatio": true
}
```

**No size presets — crop fields start at the selected file’s dimensions**

```json
{
  "desktopMobileMode": true,
  "maxNumberOfAssets": 4,
  "showFieldAspectRatio": true,
  "compactViewConfig": {
    "assetTypes": ["IMAGE"],
    "language": "en_US"
  }
}
```

**Mobile-only size override; desktop uses native pixels**

```json
{
  "desktopMobileMode": true,
  "maxNumberOfAssets": 2,
  "aspect": { "mobile": "9:16" },
  "width": { "mobile": 390 },
  "lockAspect": { "mobile": true },
  "lockWidth": { "mobile": true }
}
```

Desktop seeds from the asset. Mobile starts at 390×693, 9:16, unmatched.

**Images only, DAT off (CSS crop), extra Bynder keys from App Config**

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

DAT is **on by default** when the selected asset has `transformBaseUrl`. Compact View always selects the **asset** (Single Select when max is 1, Multi Select when max is above 1), never a derivative file. There is no author toggle: DAT vs CSS is detected from `transformBaseUrl` (and from `"enableDat": false` on App Config or the field, which forces CSS for everyone).

If DAT is allowed but the selected asset has no `transformBaseUrl`, the field shows a warning and stores `webImage` plus crop fields so the site can CSS-crop. The composed DAT `url` is omitted.

**Same width / height / aspect fields either way.** There is no second DAT-only size mapping. They always live on `transform` in the saved JSON:

- DAT on: they become Bynder DAT query params. The saved field stores `transformBaseUrl` once, plus `dat["1x"]` and `dat["2x"]` as query strings (1× is the layout size, 2× is the single static image). Aspect is not a DAT param; it derives the missing side. `webImage` is omitted when `transformBaseUrl` exists.
- DAT off / unavailable: the same values ship for your site’s CSS crop box (`width` / `height` / `aspect-ratio` with `object-fit: cover` and `object-position` from `focalPoint`). `webImage.url` is the source.

## Author UI

- Compact View strip: desktop and mobile thumbs share one scale, fitted inside a **320×200** box, with a **40px** minimum on each side. Mobile thumbs are at least **160px** wide so the caption can show its action icons and the start of the size label. Hovering a caption shows that caption in full. Below about **760px** (the Contentstack live preview panel), desktop and mobile thumbs stack, and the crop fields stack above the editor image. With `desktopMobileMode` (the default), each image row has Desktop and Mobile thumbs. A list of only videos and/or PDFs uses one **Thumbnail** column. Desktop and Mobile headers stay only when that list also contains an image; a video in that mixed list shows **Same as desktop** under Mobile. With `"desktopMobileMode": false`, one **Thumbnail** column and one crop per asset.
- An empty list is a dashed placeholder with a plus. Click it to open Compact View. Each thumbnail’s caption row shows the layout size and file type on the left and the action icons on the right. **Change Asset(s)** matches the plurality of `maxNumberOfAssets`. When the mobile file is the same as desktop, the mobile caption shows only the change icon. When the desktop and mobile file and crop match, a horizontal link sits between the two thumbnails.
- Compact View allows images and videos unless `accept` (or `compactViewConfig.assetTypes`) says otherwise. `accept` may be `image`, `video`, `pdf`, or `image/video`.
- Cancel / close Compact View without a new confirm does not clear the current selection. Reopening Compact View passes the current media UUIDs as `selectedAssets` and restores them in Compact View’s footer. A checkmark in the grid only appears if that asset is on the current search page. If **Add asset** switches to **Retry**, leave the picker and report it — that means Compact View re-encoded ids on confirm.
- Crop and focal controls appear only while an image thumbnail is selected. PDFs are not selectable. A video thumbnail opens **Video settings** (autoplay, mute, show controls, and loop, unless a `showField…` flag hides one, plus any `additionalFields`). **Edit Crop** under that panel explains that video crops are prepared in Bynder. With nothing selected the editor is hidden — expanding an empty panel would have nothing to edit, and it does not auto-select the first asset. Click the same thumbnail again to collapse the editor while keeping that asset selected. Use the accordion chevron to collapse/expand, or the × to close and deselect. Confirming a picker selection expands the editor on the first newly added image or video. An invalid `additionalFields` list replaces this whole field with a red error.
- The editor starts with no thumbnail selected whenever the entry opens. Confirming an **image** expands the crop editor. Confirming a **video** expands **Video settings** and saves the configured playback defaults (`controls` on unless config says otherwise). **Documents** (including PDFs) stay in the list with a **Document** badge and are not selectable. Videos show a **Video** badge and never show **No DAT**. Images with `transformBaseUrl` show **DAT capable**; images without it show **Not DAT capable**, a **No DAT** mark on both thumbs, and a red CSS-crop note.
- **Use a different asset for mobile** is off by default: one Bynder file, two crops. Turn the switch on to pick a different file for mobile. That file’s `id`, `name`, `type`, and `transformBaseUrl` sit on `assets[n].mobile` in the same shape as the desktop asset and do not count toward `maxNumberOfAssets`. Turning the switch off drops it from the saved entry; it stays in memory only until reload.
- When dual viewports are on, click a desktop or mobile thumb to edit that crop. Desktop|Mobile stay one pill. A link icon sits just left of **Mobile**; it stays linked until you change a field on the Mobile tab. Then it becomes a broken link, the hint says **Mobile does not match desktop**, and **Revert mobile to match desktop** restores the pair. Switching tabs without edits does not unsync them. Unmatched mobile is stored as `assets[n].mobile`; matching mobile is omitted.
- **Transform type** defaults to Fill. Fill covers the width and height and crops the overflow around the focal point. Fit keeps the whole image inside the box. Crop extracts a rectangle of that width and height from the original; the focal point picks the region (center, top-left, and the other Bynder gravity positions).
- Width and height commit on Enter or blur. Enter keeps focus in the same field so you can keep typing. If the field config omits aspect/width/height for a viewport, those inputs start at the selected asset’s pixel size. When aspect is hidden and both width and height are editable, **Constrain Proportions** sits under the height input, aligned with the inputs, and starts unchecked. Checking it draws a link bracket in the padding beside the two inputs and keeps the current pixel ratio. It is not saved. When aspect, width, and height are all visible and unlocked, that checkbox is replaced by a padlock in the same padding beside each field. One padlock is locked at a time (aspect starts locked). The locked value stays put, and the other field updates on commit and shows a green check, including the custom aspect field. A field locked in config shows a padlock and no proportion controls. Locking width or height in config also shows the aspect field unless `showFieldAspectRatio` is set explicitly.
- Crop fields sit to the left of the editor image. Below about **760px** they stack above the image, which shrinks to the panel.
- The preview is a crop-shape reference, labeled **Not to scale**.
- Click or drag the red dot (or anywhere on the image) to set the focal point. The crop slides to match.

## Saved JSON

Stored on the entry and returned by CDA / GraphQL. One `assets` array: identity (`id`, `name`, `type`, `transformBaseUrl`), crop fields, and DAT query strings. A video also stores `video` (`autoplay`, `muted`, `controls`, `loop`). Configured `additionalFields` values are stored on `additional` as strings, numbers, or booleans. GraphQL ids, `databaseId`, the `extensions` array, and Bynder’s files map are dropped. `webImage` is stored only when that file has no `transformBaseUrl`. Optional Bynder values (`fileType`, `fileSize`, original `width` / `height`, `description`, `originalUrl`, `publishedAt`, `updatedAt`, `tags`) are saved only when `persistAssetKeys` lists them. Matching mobile is omitted; a different mobile file or crop is `assets[n].mobile` with the same identity keys as desktop when the mobile file differs. Focused thumb and Desktop|Mobile tab are UI-only. Video playback and `additional` are kept when `suppressMetadata` is on.

A single image URL is `transformBaseUrl + "?" + dat["2x"]`. `dat["1x"]` is the layout size for srcset. Bases differ only when mobile is a different file.

```json
{
  "v": 1,
  "assets": [
    {
      "id": "2DC52E62-5FB1-4938-BF689857EF9B51E2",
      "name": "Earth",
      "type": "IMAGE",
      "alt": "The Earth from space",
      "fileType": "jpg",
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
      },
      "additional": {
        "uniqueId": true,
        "caption": "Earth from orbit",
        "rank": 1
      }
    },
    {
      "id": "9F8E7D6C-5B4A-3210-FEDCBA9876543210",
      "name": "Hero",
      "type": "IMAGE",
      "alt": "Desktop hero",
      "transformBaseUrl": "https://portal.bynder.com/transform/hero.jpg",
      "focalPoint": { "x": 0.4, "y": 0.3 },
      "transform": {
        "operation": "fill",
        "width": 1200,
        "height": 675,
        "aspect": "16:9",
        "format": "webp",
        "quality": 80
      },
      "dat": {
        "1x": "io=transform:fill,width:1200,height:675&focuspoint=0.4,0.3&format=webp&quality=80",
        "2x": "io=transform:fill,width:2400,height:1350&focuspoint=0.4,0.3&format=webp&quality=80"
      },
      "additional": {
        "uniqueId": false,
        "caption": "Hero banner",
        "rank": 2
      },
      "differentMobileAsset": true,
      "mobile": {
        "id": "AABBCCDD-EEFF-0011-2233445566778899",
        "name": "Hero mobile",
        "type": "IMAGE",
        "alt": "Mobile hero",
        "transformBaseUrl": "https://portal.bynder.com/transform/hero-mobile.jpg",
        "focalPoint": { "x": 0.62, "y": 0.28 },
        "transform": {
          "operation": "fill",
          "width": 390,
          "height": 693,
          "aspect": "9:16",
          "format": "webp",
          "quality": 80
        },
        "dat": {
          "1x": "io=transform:fill,width:390,height:693&focuspoint=0.62,0.28&format=webp&quality=80",
          "2x": "io=transform:fill,width:780,height:1386&focuspoint=0.62,0.28&format=webp&quality=80"
        }
      }
    }
  ]
}
```

`fileType` in that sample is present only because `persistAssetKeys` includes `"fileType"`. `additional` is present only when the field Config Parameter (or App Config) lists matching `additionalFields`; each key is that field’s `property`. Join `transformBaseUrl` with `dat["2x"]` for the image `src`. If `dat` is missing, use `webImage.url` with CSS `object-fit` and `object-position` from `focalPoint`. `composeBynderImageUrl(settings, { viewport: "mobile" })` does that join and can override width or height.

## Delivery

Sites that today read an official Bynder field and a separate settings field need to switch to this combined field: join `assets[n].transformBaseUrl` with `assets[n].dat["2x"]`, or use `assets[n].webImage.url` when DAT was not saved. This app does not migrate old two-field entries.

Copy [`src/delivery/composeBynderImageUrl.ts`](src/delivery/composeBynderImageUrl.ts) (and [`src/lib/bynder/composeDatUrl.ts`](src/lib/bynder/composeDatUrl.ts) / [`src/lib/types.ts`](src/lib/types.ts) / [`src/lib/bynder/parseAsset.ts`](src/lib/bynder/parseAsset.ts)) into the website:

```ts
import { composeBynderImageUrl, focalPointToObjectPosition } from "./delivery";

const src = composeBynderImageUrl(entry.hero_image_settings, { width: 800 });
const mobileSrc = composeBynderImageUrl(entry.hero_image_settings, { viewport: "mobile", width: 400 });
const objectPosition = focalPointToObjectPosition(entry.hero_image_settings.assets?.[0]?.focalPoint);
```

`composeBynderImageUrl` joins `transformBaseUrl` and `dat["2x"]` when DAT was saved, and returns `webImage.url` when it was not. An explicit `{ width: 400 }` is a DAT pixel width, not doubled.

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
