import { describe, expect, it } from "vitest";
import { applyProportionPin } from "./proportionPin";
import type { TransformSettings } from "./types";

const base: TransformSettings = { operation: "fill", width: 1200, height: 675, aspect: "16:9" };

describe("applyProportionPin", () => {
  it("keeps a pinned width and updates height when aspect changes", () => {
    expect(applyProportionPin(base, "width", { aspect: "4:5" })).toMatchObject({
      width: 1200,
      height: 1500,
      aspect: "4:5",
    });
  });

  it("keeps a pinned width and rewrites aspect when height changes", () => {
    expect(applyProportionPin(base, "width", { height: 600 })).toMatchObject({
      width: 1200,
      height: 600,
      aspect: "2:1",
    });
  });

  it("keeps a pinned aspect and updates the other side", () => {
    expect(applyProportionPin(base, "aspect", { width: 800 })).toMatchObject({
      width: 800,
      height: 450,
      aspect: "16:9",
    });
    expect(applyProportionPin(base, "aspect", { height: 450 })).toMatchObject({
      width: 800,
      height: 450,
      aspect: "16:9",
    });
  });

  it("keeps a pinned height when aspect changes", () => {
    expect(applyProportionPin(base, "height", { aspect: "1:1" })).toMatchObject({
      width: 675,
      height: 675,
      aspect: "1:1",
    });
  });

  it("does not invent a size when aspect is cleared", () => {
    expect(applyProportionPin(base, "width", { aspect: null })).toMatchObject({
      width: 1200,
      height: 675,
      aspect: null,
    });
  });
});
