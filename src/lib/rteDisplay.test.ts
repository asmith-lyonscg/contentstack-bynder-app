import { describe, expect, it } from "vitest";
import {
  displayAspect,
  editDisplayPlacement,
  editDisplayScale,
  imageViewportsDiffer,
  joinRteAttrs,
  relinkDisplayPlacement,
  resetDisplayScale,
  scaleDisplaySize,
  scaleFor,
  scaleIsCustom,
  normalizeRteDisplay,
  payloadWithAlt,
  splitRteAttrs,
} from "./rteDisplay";

const imagePayload = {
  v: 2,
  profile: { id: "largeHero", settings: { desktop: "16:9", mobile: "5:3", quality: 80, format: "webp" } },
  assets: [
    {
      id: "asset-1",
      type: "IMAGE",
      alt: "",
      origWidth: 8000,
      origHeight: 6000,
      operation: "fill",
      transformBaseUrl: "https://assets.deltafaucet.com/transform/asset-1/Hero",
    },
  ],
};

describe("normalizeRteDisplay", () => {
  it("stores both pixel sizes and forces inline for a float", () => {
    expect(normalizeRteDisplay({ width: 276.4, height: 155, alignment: "floatRight", caption: "  " })).toEqual({
      width: 276,
      height: 155,
      alignment: "floatRight",
      inline: true,
    });
  });

  it("clears a float when inline is turned off", () => {
    expect(normalizeRteDisplay({ alignment: "floatLeft", inline: false }).alignment).toBe("left");
    expect(normalizeRteDisplay({ alignment: "floatLeft", inline: false }).inline).toBeUndefined();
  });
});

describe("splitRteAttrs", () => {
  it("keeps the field payload separate from display", () => {
    const attrs = joinRteAttrs(imagePayload, {
      width: 276,
      height: 155,
      alignment: "floatLeft",
      caption: "Caption",
      link: "https://www.deltafaucet.com",
      linkNewTab: true,
    });
    const split = splitRteAttrs(attrs);
    expect(split.payload).not.toHaveProperty("display");
    expect(split.payload).toMatchObject({ v: 2, assets: [{ id: "asset-1" }] });
    expect(split.display).toMatchObject({
      width: 276,
      height: 155,
      alignment: "floatLeft",
      inline: true,
      caption: "Caption",
      linkNewTab: true,
    });
  });

  it("writes alt on the asset, not on display", () => {
    const next = payloadWithAlt(imagePayload, "Office");
    expect(next.assets).toEqual([expect.objectContaining({ alt: "Office" })]);
    expect(next).not.toHaveProperty("display");
  });

  it("uses the desktop profile ratio for the scale handle", () => {
    expect(displayAspect(imagePayload)).toBeCloseTo(16 / 9);
  });
});

describe("scaleDisplaySize", () => {
  it("scales from the right edge and the bottom edge by the same proportion", () => {
    expect(scaleDisplaySize({ width: 200, height: 100 }, 50, "x")).toEqual({ width: 250, height: 125 });
    expect(scaleDisplaySize({ width: 200, height: 100 }, 40, "y")).toEqual({ width: 280, height: 140 });
  });

  it("stops at the smallest box that keeps the current proportion", () => {
    expect(scaleDisplaySize({ width: 200, height: 100 }, -500, "x")).toEqual({ width: 96, height: 48 });
    expect(scaleDisplaySize({ width: 200, height: 100 }, -500, "y")).toEqual({ width: 96, height: 48 });
    expect(scaleDisplaySize({ width: 100, height: 200 }, -500, "x")).toEqual({ width: 80, height: 160 });
    expect(scaleDisplaySize({ width: 100, height: 200 }, -500, "y")).toEqual({ width: 80, height: 160 });
  });
});

describe("desktop and mobile display", () => {
  const shared = { alignment: "left" as const, caption: "Caption" };

  it("lets a desktop scale change both viewports until mobile is scaled", () => {
    const desktop = editDisplayScale(shared, "desktop", { width: 400, height: 225 });
    expect(desktop).toMatchObject({ width: 400, height: 225 });
    expect(desktop.mobile).toBeUndefined();
    expect(scaleFor(desktop, "mobile", 5 / 3)).toEqual({ width: 400, height: 240 });
    const diverged = editDisplayScale(desktop, "mobile", { width: 180, height: 108 });
    expect(editDisplayScale(diverged, "desktop", { width: 500, height: 281 }).mobile).toEqual({
      width: 180,
      height: 108,
    });
  });

  it("reverts both viewport scales and keeps alignment", () => {
    const sized = editDisplayScale(
      editDisplayScale({ alignment: "right" }, "desktop", { width: 400, height: 225 }),
      "mobile",
      { width: 180, height: 108 }
    );
    expect(resetDisplayScale(sized)).toEqual({ alignment: "right" });
    expect(scaleIsCustom(sized, "desktop")).toBe(true);
    expect(scaleIsCustom(sized, "mobile")).toBe(true);
    expect(scaleIsCustom(resetDisplayScale(sized), "mobile")).toBe(false);
  });

  it("keeps alignment and inline linked until mobile is edited", () => {
    const linked = editDisplayPlacement({}, "desktop", { alignment: "floatLeft" });
    expect(linked).toMatchObject({ alignment: "floatLeft", inline: true });
    expect(linked.mobile).toBeUndefined();
    const mobile = editDisplayPlacement(linked, "mobile", { alignment: "center", inline: false });
    expect(mobile.alignment).toBe("floatLeft");
    expect(mobile.mobile).toMatchObject({ alignment: "center", inline: false });
    const desktopAgain = editDisplayPlacement(mobile, "desktop", { alignment: "right" });
    expect(desktopAgain.alignment).toBe("right");
    expect(desktopAgain.mobile).toMatchObject({ alignment: "center", inline: false });
  });

  it("drops mobile alignment and inline when the mobile asset returns to desktop", () => {
    const split = editDisplayPlacement(
      editDisplayScale({ alignment: "left" }, "mobile", { width: 120, height: 80 }),
      "mobile",
      { alignment: "right", inline: true }
    );
    const relinked = relinkDisplayPlacement(split);
    expect(relinked.mobile).toEqual({ width: 120, height: 80 });
    expect(relinked.alignment).toBe("left");
  });

  it("asks for a mobile preview when the image itself differs", () => {
    expect(imageViewportsDiffer(imagePayload)).toBe(true);
    const same = {
      ...imagePayload,
      profile: { id: "card", settings: { desktop: "1:1", mobile: "1:1", quality: 80, format: "webp" } },
    };
    expect(imageViewportsDiffer(same)).toBe(false);
    expect(
      imageViewportsDiffer({
        ...same,
        assets: [
          {
            ...same.assets[0],
            differentMobileAsset: true,
            mobile: { id: "mobile-asset", type: "IMAGE", operation: "fill" },
          },
        ],
      })
    ).toBe(true);
    expect(
      imageViewportsDiffer({
        ...same,
        assets: [{ ...same.assets[0], mobile: { operation: "fill", focalPoint: { x: 0.2, y: 0.2 } } }],
      })
    ).toBe(true);
    expect(imageViewportsDiffer(same, { mobile: { width: 140, height: 140 } })).toBe(true);
    expect(displayAspect(imagePayload, "mobile")).toBeCloseTo(5 / 3);
  });
});
