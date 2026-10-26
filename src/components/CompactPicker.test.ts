import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompactViewConfig, ParsedBynderAsset } from "../lib/types";
import { CompactPicker } from "./CompactPicker";

const compact: CompactViewConfig = {
  language: "en_US",
  mode: "SingleSelect",
  assetTypes: ["IMAGE", "VIDEO", "DOCUMENT"],
  portalUrl: "https://acme.getbynder.com",
};

const image: ParsedBynderAsset = {
  id: "desk",
  name: "Hero",
  type: "IMAGE",
  sourceUrl: "https://cdn.example/hero.jpg",
};

function render(props: Partial<ComponentProps<typeof CompactPicker>> = {}) {
  return renderToStaticMarkup(
    createElement(CompactPicker, {
      compact,
      portalUrl: "https://acme.getbynder.com",
      assets: [image],
      onFocus: () => undefined,
      onSelect: () => undefined,
      onRemove: () => undefined,
      onReorder: () => undefined,
      ...props,
    })
  );
}

function rowActionLabels(html: string): string[] {
  const start = html.search(/class="asset-row-actions(?: is-pair)?"/);
  const block = html.slice(start, html.indexOf("</li>", start));
  return [...block.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]);
}

describe("CompactPicker actions column", () => {
  it("shows change, open in Bynder, and remove when desktop and mobile share an asset", () => {
    const html = render({ desktopMobileMode: true });
    expect(html).toContain("Actions");
    expect(rowActionLabels(html)).toEqual(["Change Asset", "Open in Bynder", "Remove"]);
  });

  it("shows a desktop row and a mobile row of hover actions when the viewports use different assets", () => {
    const html = render({
      desktopMobileMode: true,
      separateMobileIds: ["desk"],
      mobileFiles: {
        desk: { id: "mob", name: "Mobile hero", type: "IMAGE", sourceUrl: "https://cdn.example/mobile.jpg" },
      },
    });
    const start = html.indexOf('class="asset-row-actions is-pair"');
    const block = html.slice(start, html.indexOf("</li>", start));
    expect(block.split('class="pair-line"')).toHaveLength(3);
    expect(rowActionLabels(html)).toEqual([
      "Edit desktop crop",
      "Preview",
      "Open in Bynder",
      "Change desktop asset",
      "Remove desktop and mobile assets",
      "Edit mobile crop",
      "Preview",
      "Open in Bynder",
      "Change mobile asset",
      "Remove mobile asset (Use desktop for both.)",
    ]);
  });

  it("offers Add Asset(s) under the list until the field limit is reached", () => {
    const multi = { ...compact, mode: "MultiSelect" as const, maxLimit: 3 };
    const second = { ...image, id: "two", name: "Second" };
    const third = { ...image, id: "three", name: "Third" };
    expect(render({ compact: multi, assets: [image] }).match(/Add Asset\(s\)/g)).toHaveLength(1);
    expect(render({ compact: multi, assets: [image, second] }).match(/Add Asset\(s\)/g)).toHaveLength(1);
    expect(render({ compact: multi, assets: [image, second, third] })).not.toContain("Add Asset(s)");
    expect(render({ compact: multi, assets: [] }).match(/Choose Asset\(s\)/g)).toHaveLength(1);
    expect(render({ compact: multi, assets: [] })).not.toContain("Add Asset(s)");
    expect(render({ assets: [image] })).not.toContain("Add Asset");
  });

  it("loads a Bynder thumbnail for an /asset PDF and keeps an icon when the URL cannot be built", () => {
    const shaped = render({
      assets: [
        {
          ...image,
          id: "brief",
          name: "T342703-CZLHD_IntegratedDiverter_Infographic",
          type: "DOCUMENT",
          sourceUrl:
            "https://assets.deltafaucet.com/asset/24c6fbf2-3b38-4307-b2b8-da43a35bdf24/T342703-CZLHD_IntegratedDiverter_Infographic.pdf",
        },
      ],
    });
    expect(shaped).toContain(
      'src="https://assets.deltafaucet.com/asset/24c6fbf2-3b38-4307-b2b8-da43a35bdf24/thumbnail/thul-T342703-CZLHD_IntegratedDiverter_Infographic"'
    );
    const plain = render({
      assets: [{ ...image, id: "brief", name: "Brief", type: "DOCUMENT", sourceUrl: "https://cdn.example/brief.pdf" }],
    });
    expect(plain).toContain('class="asset-doc-icon"');
    expect(plain).not.toContain('src="https://cdn.example/brief.pdf"');
  });

  it("draws a document icon instead of the PDF preview", () => {
    const html = render({
      assets: [{ ...image, id: "brief", name: "Brief", type: "DOCUMENT", sourceUrl: "https://cdn.example/brief.pdf" }],
    });
    expect(html).toContain('class="asset-doc-icon"');
    expect(html).toContain('width="32"');
    expect(html).not.toContain('src="https://cdn.example/brief.pdf"');
  });

  it("says a separate mobile asset is not supported for video and documents", () => {
    const video = render({
      desktopMobileMode: true,
      assets: [
        image,
        { ...image, id: "clip", name: "Clip", type: "VIDEO", sourceUrl: "https://cdn.example/clip.mp4" },
      ],
    });
    const document = render({
      desktopMobileMode: true,
      assets: [
        image,
        { ...image, id: "brief", name: "Brief", type: "DOCUMENT", sourceUrl: "https://cdn.example/brief.pdf" },
      ],
    });
    expect(video).toContain("(Separate mobile asset not supported.)");
    expect(video).not.toContain("Same as desktop");
    expect(document).toContain("(Separate mobile asset not supported.)");
    expect(document).not.toContain("Same as desktop");
  });

  it("shows the thumbnail hover actions in desktop-only mode", () => {
    expect(rowActionLabels(render({ desktopMobileMode: false }))).toEqual([
      "Edit",
      "Preview",
      "Open in Bynder",
      "Change Asset",
      "Remove",
    ]);
    expect(
      rowActionLabels(
        render({
          desktopMobileMode: false,
          assets: [{ ...image, id: "clip", type: "VIDEO", sourceUrl: "https://cdn.example/clip.mp4" }],
        })
      )
    ).toEqual(["Edit", "Preview", "Open in Bynder", "Change Asset", "Remove"]);
    expect(
      rowActionLabels(
        render({
          desktopMobileMode: false,
          assets: [{ ...image, id: "brief", type: "DOCUMENT", sourceUrl: "https://cdn.example/brief.pdf" }],
        })
      )
    ).toEqual(["Document settings", "Preview", "Open in Bynder", "Change Asset", "Remove"]);
  });
});
