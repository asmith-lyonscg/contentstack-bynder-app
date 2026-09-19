# Bynder Image Settings

A Contentstack Marketplace **Custom Field** that embeds Bynder Universal Compact View so authors pick an image, then set a focal point and crop frame (aspect / width / height), in **one JSON field**. Bynder DAT transforms are on by default when the asset has a DAT URL (`transformBaseUrl`). Set `"enableDat": false` on App Config or the field to force CSS crop for everyone.

This field does **not** require the official Bynder Marketplace app. The official picker can remain on a content type as leftover, but this app no longer reads a sibling Bynder field.

## Install

1. **Build or run the app**
   - Local (typical while developing): `npm install` then `npm run dev` (Vite at `http://localhost:3000`). Contentstack iframes need HTTPS, so tunnel that origin (ngrok, Cloudflare Tunnel, etc.).
   - **Author Bynder login** (default, **Enable login bypass** off): any static host of `dist` is enough, including a tunnel to Vite. No Launch project and no Bynder OAuth app.
   - **Login bypass** on: the process must also serve `/api/oauth` (`npm run dev`, or `npm run build` then `npm run start`). Register the Bynder OAuth redirect as that **public HTTPS** origin + `/oauth/callback`, not `localhost`.
2. **Developer Hub** → create a Standard / private app.
3. **Hosting:** Custom Hosting → your tunnel or Node origin.
4. **UI Locations**
   - Custom Field: name `Bynder Image Settings`, path `/custom-field`, data type **JSON**
   - App Configuration: path `/app-configuration`
5. Install the app on the stack.
6. Open **App Configuration**, set the Bynder **portal URL**, leave **Show login-bypass setup** off, **Save**. Authors sign into Bynder in Compact View.

The official marketplace Bynder app works the same way: **Enable login bypass** is optional and stays off until Client ID / Secret are validated. This app matches that. Do not reuse Contentstack’s callback (`https://bynder.contentstackmarket.com/#/bynder/callback`).

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
  "desktopMobileMode": true,
  "maxNumberOfAssets": 3,
  "enableDat": true,
  "aspect": { "desktop": "16:9", "mobile": "9:16" },
  "width": { "desktop": 1200, "mobile": 390 },
  "lockAspect": true,
  "format": "webp"
}
```

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

Field **Config Parameter** unless marked App Config. Types and examples:

| Key | Type | Example | Meaning |
|---|---|---|---|
| `bynderPortalUrl` | `string` | `"acme.getbynder.com"` | Portal host. Required. Field config overrides App Configuration |
| `desktopMobileMode` | `boolean` | `false` | Dual desktop/mobile crops. Default `true`. `false` = one crop per asset; the UI never says desktop or mobile. Alias: `desktopMobile` |
| `maxNumberOfAssets` | `number` | `3` | Cap on selected assets. Default `1` (Single Select). Values above 1 use Multi Select. Compact View has no max-select prop; this app caps the array Compact View returns. Alias: `advanced.max_limit` |
| `compactLanguage` | `string` | `"en_US"` | Compact View locale. Default `en_US` |
| `enableDat` | `boolean` | `true` | Default `true`. `false` forces CSS crop only (no composed DAT `url`) |
| `loginBypass` | `boolean` | `true` | App Config after Validate. Authors skip Bynder login |
| `enableAssetTracker` | `boolean` | `true` | App Config. Posts selected asset IDs to Bynder Asset Tracker on entry save. Needs login bypass and a STATISTICS-capable Bynder user |
| `persistAssetKeys` | `string[]` | `["description","tags"]` | App Config. Extra Bynder keys besides `id` (media UUID), `name`, and `transformBaseUrl`. `webImage` is stored automatically only when DAT is unavailable. Allowed extras: `description`, `originalUrl`, `publishedAt`, `updatedAt`, `tags` |
| `aspect` | `string` or `{ desktop?: string, mobile?: string }` | `"16:9"` or `{ "desktop": "16:9", "mobile": "9:16" }` | Preset for **new** entries; forced when `lockAspect` is true. In `desktopMobileMode`, an object sets desktop and mobile separately. A scalar applies to both (and is the only allowed form when `desktopMobileMode` is `false`) |
| `width` | `number` or `{ desktop?: number, mobile?: number }` | `1200` or `{ "desktop": 1200, "mobile": 390 }` | Same as `aspect`. Dual objects are only used when `desktopMobileMode` is `true` |
| `height` | `number` or `{ desktop?: number, mobile?: number }` | `675` or `{ "desktop": 675, "mobile": 844 }` | Same as `width`. If omitted, height is derived from aspect + width |
| `lockAspect`, `lockWidth`, `lockHeight` | `boolean` or `{ desktop?: boolean, mobile?: boolean }` | `true` or `{ "desktop": true, "mobile": false }` | Disable those inputs. A scalar locks both viewports. An object can lock one viewport only (`desktopMobileMode: true`). Hidden fields are **not** locked: `showAspect: false` still lets width and height set the crop independently. When `desktopMobileMode` is `false`, only a boolean is used |
| `format` | `"webp"` \| `"jpg"` \| `"png"` | `"webp"` | DAT file type for **new** entries. Default `webp`. Alias: `fileType` |
| `showFormat` | `boolean` | `true` | Show the DAT file-type control. Hidden by default. Aliases: `showFileType`, `hideFormat: false` |
| `showOperation`, `showAspect`, `showQuality`, `showAdvancedQuery`, `showDatPreset` | `boolean` | `true` | Show extra DAT fields. Hidden by default |
| `lockFormat` | `boolean` | `true` | Show the file-type control but disable it. Alias: `lockFileType` |
| `aspectPresets` | `string[]` or comma-separated `string` | `["16:9","1:1"]` | Aspect dropdown options. Omit to keep `16:9`, `1:1`, `4:3`, `4:5` |
| `compactViewConfig` | `object` | `{ "assetTypes": ["IMAGE","VIDEO"], "defaultSearchTerm": "hero" }` | [Universal Compact View](https://developers.bynder.com/universal-compact-view) props we pass through: `language`, `assetTypes`, `assetFilter`, `theme`, `hideExternalAccess`, `hideLimitedUse`, `hideSwitch`, `noCache`, `selectAllOption`, `defaultSearchTerm`, `defaultImageDerivativeName`, `defaultVideoDerivativeName`, `isPersonal`, `enableDASH`, `embedType`. Defaults to images and videos. Portal URL, callbacks, and `mode` are not taken from here. Alias: `custom_settings.compact_view_options` |
| `custom_settings.dat_settings` | `object` | `{ "default": "webImage", "transformation_options": { "crop": "io=transform:crop,width:300" } }` | Marketplace DAT presets. `default` becomes Compact View `defaultImageDerivativeName` |
| `advanced.max_limit` | `number` | `4` | Alias of `maxNumberOfAssets` |

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

**Same crop for every viewport (no desktop/mobile UI)**

```json
{
  "desktopMobileMode": false,
  "maxNumberOfAssets": 1,
  "aspect": "4:5",
  "width": 800,
  "lockAspect": true,
  "showAspect": true
}
```

**No size presets — crop fields start at the selected file’s dimensions**

```json
{
  "desktopMobileMode": true,
  "maxNumberOfAssets": 4,
  "showAspect": true,
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

### Login bypass (optional)

Same control as the official marketplace Bynder app: **Enable login bypass** is a checkbox. **Off** (default) = each author signs into Bynder in the picker. **On** = shared OAuth token after **Fetch Code and Validate**.

You do **not** need this for local hello-world. Leave Advanced settings off.

When you do turn it on later:

1. Host this app on a **public HTTPS** origin (tunnel or Node). Do not register `localhost` as the Bynder redirect.
2. In Bynder: **OAuth Apps** → new app (not the official Contentstack Bynder app).
3. Grant type: **Authorization Code + Refresh Token**.
4. Redirect URL: the value shown under Advanced settings (`https://<this-app-host>/oauth/callback`).
5. Paste Client ID and Secret, **Fetch Code and Validate**, then check **Enable login bypass** and **Save**.

### DAT

DAT is **on by default** when the selected asset has `transformBaseUrl`. Compact View always selects the **asset** (Single Select when max is 1, Multi Select when max is above 1), never a derivative file. There is no author toggle: DAT vs CSS is detected from `transformBaseUrl` (and from `"enableDat": false` on App Config or the field, which forces CSS for everyone).

If DAT is allowed but the selected asset has no `transformBaseUrl`, the field shows a warning and stores `webImage` plus crop fields so the site can CSS-crop. The composed DAT `url` is omitted.

**Same width / height / aspect fields either way.** There is no second DAT-only size mapping. They always live on `transform` in the saved JSON:

- DAT on: they become Bynder DAT query params (`io=transform:fill,width:1200,height:675` plus `focuspoint`). Aspect is not sent as a DAT param; it is used to derive the missing side. `webImage` is omitted.
- DAT off / unavailable: the same values ship for your site’s CSS crop box (`width` / `height` / `aspect-ratio` with `object-fit: cover` and `object-position` from `focalPoint`). `webImage.url` is the source.

## Author UI

- Compact View strip: **300×200** desktop thumbs and **200×200** mobile thumbs. With `desktopMobileMode` (the default), each row has Desktop and Mobile thumbs. With `"desktopMobileMode": false`, one **Preview** column and one crop per asset; the UI never says desktop or mobile.
- **+ Choose Asset** when `maxNumberOfAssets` is 1 (the default); **+ Choose Asset(s)** when the cap is above 1. **Change Asset(s)** matches that plurality.
- Compact View is pre-filtered to images and videos unless `compactViewConfig.assetTypes` says otherwise.
- Cancel / close Compact View without a new confirm does not clear the current selection. Reopening Compact View passes the current media UUIDs as `selectedAssets` and restores them in Compact View’s footer. A checkmark in the grid only appears if that asset is on the current search page. If **Add asset** switches to **Retry**, leave the picker and report it — that means Compact View re-encoded ids on confirm.
- MultiSelect: rows are selectable. Crop and focal controls appear only while a thumbnail is selected. Click the same thumb again to deselect it and collapse the editor.
- The crop editor starts collapsed with no thumbnail selected whenever the entry opens. Confirming a picker selection expands the editor on the first newly added asset (Desktop, when dual viewports are on). The Contentstack field iframe grows and shrinks with that editor.
- When dual viewports are on, click a desktop or mobile thumb to edit that crop. Desktop|Mobile stay one pill. A link icon sits just left of **Mobile**; it stays linked until you change a field on the Mobile tab. Then it becomes a broken link, the hint says **Mobile does not match desktop**, and **Revert mobile to match desktop** restores the pair. Switching tabs without edits does not unsync them. Unmatched mobile is stored as `assets[n].mobile`; matching mobile is omitted.
- Width and height commit on Enter or blur. Enter keeps focus in the same field so you can keep typing. If the field config omits aspect/width/height for a viewport, those inputs start at the selected asset’s pixel size.
- Controls (focal X/Y, aspect, width, height) are stacked to the left of the crop preview in a separate panel below the list.
- The preview is a crop-shape reference, labeled **Not to scale**.
- Click or drag the red dot (or anywhere on the image) to set the focal point. The crop slides to match.

## Saved JSON

Stored on the entry and returned by CDA / GraphQL. One `assets` array: identity, crop editor fields, and the composed DAT `url`. GraphQL ids, `databaseId`, type, dimensions, and Bynder’s files map are dropped. `webImage` is stored only when DAT is unavailable. Matching mobile is omitted; unmatched mobile is `assets[n].mobile`. Focused thumb and Desktop|Mobile tab are UI-only — reopen has no thumb selected and the crop editor collapsed.

Every DAT crop gets a composed `url`. Three images with one unmatched pair is **four URLs**.

```json
{
  "v": 1,
  "assets": [
    {
      "id": "2DC52E62-5FB1-4938-BF689857EF9B51E2",
      "name": "Earth",
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
      "url": "https://portal.bynder.com/transform/earth.jpg?io=transform:fill,width:1200,height:675&io=focuspoint:0.35,0.42&format=webp&quality=80"
    },
    {
      "id": "A1B2C3D4-E5F6-7890-ABCD1234567890EF",
      "name": "Bottle",
      "alt": "Product bottle",
      "transformBaseUrl": "https://portal.bynder.com/transform/bottle.jpg",
      "focalPoint": { "x": 0.5, "y": 0.5 },
      "transform": {
        "operation": "fill",
        "width": 1200,
        "height": 675,
        "aspect": "16:9",
        "format": "webp",
        "quality": 80
      },
      "url": "https://portal.bynder.com/transform/bottle.jpg?io=transform:fill,width:1200,height:675&io=focuspoint:0.5,0.5&format=webp&quality=80"
    },
    {
      "id": "9F8E7D6C-5B4A-3210-FEDCBA9876543210",
      "name": "Hero",
      "alt": "Hero banner",
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
      "url": "https://portal.bynder.com/transform/hero.jpg?io=transform:fill,width:1200,height:675&io=focuspoint:0.4,0.3&format=webp&quality=80",
      "mobile": {
        "focalPoint": { "x": 0.62, "y": 0.28 },
        "transform": {
          "operation": "fill",
          "width": 390,
          "height": 693,
          "aspect": "9:16",
          "format": "webp",
          "quality": 80
        },
        "url": "https://portal.bynder.com/transform/hero.jpg?io=transform:fill,width:390,height:693&io=focuspoint:0.62,0.28&format=webp&quality=80"
      }
    }
  ]
}
```

Read `assets[n].url` for each image. If `assets[n].mobile` is present, also read `assets[n].mobile.url`. Frontends can call `composeBynderImageUrl(settings, { viewport: "mobile" })` to rebuild a URL with breakpoint overrides. When `url` is omitted, use `webImage.url` with CSS `object-fit: cover` and `object-position` from `focalPoint`.

## Delivery

Sites that today read an official Bynder field (for example `bynder_logo`) **and** a separate settings field (for example `bynder_focal_point_dat`) need to switch to this combined field: prefer `assets[n].url` (DAT) or `assets[n].webImage.url` (CSS). This branch does not migrate old two-field entries.

Copy [`src/delivery/composeBynderImageUrl.ts`](src/delivery/composeBynderImageUrl.ts) (and [`src/lib/bynder/composeDatUrl.ts`](src/lib/bynder/composeDatUrl.ts) / [`src/lib/types.ts`](src/lib/types.ts) / [`src/lib/bynder/parseAsset.ts`](src/lib/bynder/parseAsset.ts)) into the website:

```ts
import { composeBynderImageUrl, focalPointToObjectPosition } from "./delivery";

const src = composeBynderImageUrl(entry.hero_image_settings, { width: 800 });
const mobileSrc = composeBynderImageUrl(entry.hero_image_settings, { viewport: "mobile", width: 400 });
const objectPosition = focalPointToObjectPosition(entry.hero_image_settings.assets?.[0]?.focalPoint);
```

`composeBynderImageUrl` uses `assets[n].url` when DAT was saved, and `webImage.url` when it was not.

## Project layout

```
src/
  locations/CustomField/     Custom Field UI (picker + crop)
  locations/AppConfig/       Portal URL, DAT, OAuth validate / login bypass
  locations/OAuthCallback/   Bynder OAuth popup return
  components/                Compact picker, crop + focal-point editor, transform form
  lib/bynder/                Parse Compact View JSON + compose DAT URLs
  delivery/                  Website helper
server/                      Holds Client Secret + refresh token; mints access tokens
```

Built from the [Marketplace App Boilerplate](https://github.com/contentstack/marketplace-app-boilerplate) (Vite, React, `@contentstack/app-sdk` ^2.4, `@bynder/compact-view`).
