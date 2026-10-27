import { describe, expect, it } from "vitest";
import {
  displayAspect,
  joinRteAttrs,
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
