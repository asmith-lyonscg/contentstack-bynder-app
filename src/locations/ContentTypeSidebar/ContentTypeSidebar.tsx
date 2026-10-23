import { useState } from "react";
import "./ContentTypeSidebar.css";

/**
 * Field-configuration reference for the Content Type Sidebar.
 * Contentstack opens this at `/content-type-sidebar` from Content Models → a content type → Apps.
 * https://www.contentstack.com/docs/developer-hub/content-type-sidebar-location
 */

const README_URL =
  "https://github.com/asmith-lyonscg/contentstack-bynder-app/blob/main/README.md#custom-field-configs";

const SIMPLE_FIELD = `{
  "type": ["image"],
  "maxNumberOfAssets": 4,
  "profile": "tileImage"
}`;

const COMPLEX_FIELD = `{
  "type": ["image", "video"],
  "desktopMobileMode": true,
  "maxNumberOfAssets": 4,
  "fieldProfiles": {
    "banner": {
      "name": "Banner",
      "desktop": "21:9",
      "mobile": "4:5",
      "quality": 75,
      "format": "webp"
    }
  },
  "profiles": ["banner", "heroLarge"],
  "defaultProfile": "banner",
  "allowCustomAspect": true,
  "video": {
    "autoplay": false,
    "muted": true,
    "controls": true,
    "loop": false
  },
  "additionalFields": [
    {
      "property": "caption",
      "type": "string",
      "label": "Caption"
    },
    {
      "property": "rank",
      "type": "number",
      "label": "Rank"
    },
    {
      "property": "featured",
      "type": "boolean",
      "label": "Featured"
    }
  ],
  "suppressMetadata": true,
  "compactViewConfig": {
    "language": "en_US",
    "defaultSearchTerm": "campaign",
    "hideLimitedUse": true,
    "assetFilter": {
      "showToolbar": true,
      "predefinedTagNames": ["campaign"]
    }
  }
}`;

const KEYS: { key: string; type: string; defaultValue: string }[] = [
  { key: "bynderPortalUrl", type: "string", defaultValue: "—" },
  { key: "profile", type: "string", defaultValue: "—" },
  { key: "fieldProfiles", type: "object", defaultValue: "—" },
  { key: "profiles", type: "string[]", defaultValue: "all" },
  { key: "defaultProfile", type: "string", defaultValue: "—" },
  { key: "allowCustomAspect", type: "boolean", defaultValue: "false" },
  { key: "type", type: "string[]", defaultValue: '["image", "video"]' },
  { key: "desktopMobileMode", type: "boolean", defaultValue: "true" },
  { key: "maxNumberOfAssets", type: "number", defaultValue: "1" },
  { key: "suppressMetadata", type: "boolean", defaultValue: "false" },
  { key: "compactLanguage", type: "string", defaultValue: "en_US" },
  { key: "video", type: "object", defaultValue: "controls: true" },
  { key: "additionalFields", type: "object[]", defaultValue: "—" },
  { key: "compactViewConfig", type: "object", defaultValue: "—" },
];

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = code;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      ok = document.execCommand("copy");
      area.remove();
    }
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <figure className="snippet">
      <figcaption>
        <span>{title}</span>
        <button type="button" onClick={copy} aria-label={`Copy ${title}`}>
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre>{code}</pre>
    </figure>
  );
}

export default function ContentTypeSidebar() {
  return (
    <div className="content-type-sidebar">
      <h2>Bynder DAT Info</h2>
      <p className="readme-link">
        <a href={README_URL} target="_blank" rel="noopener noreferrer">
          Online README Documentation
        </a>
      </p>
      <h3>Advanced configuration</h3>
      <p className="sub">Paste into the custom field's advanced settings &gt; Config Parameter.</p>

      <h3>Examples</h3>
      <Snippet title="Common" code={SIMPLE_FIELD} />
      <Snippet title="More options" code={COMPLEX_FIELD} />

      <h3>Keys</h3>
      <table className="keys">
        <thead>
          <tr>
            <th>Key</th>
            <th>Type</th>
            <th>Default</th>
          </tr>
        </thead>
        <tbody>
          {KEYS.map((row) => (
            <tr key={row.key}>
              <td>
                <code>{row.key}</code>
              </td>
              <td>{row.type}</td>
              <td>{row.defaultValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
