import { describe, expect, it } from "vitest";
import {
  clampOffset,
  containLayout,
  coverLayout,
  cropWindowLayout,
  focalFromOffset,
  frameLayout,
  offsetForOperation,
  offsetFromFocal,
} from "./coverLayout";

describe("coverLayout", () => {
  it("covers a wide frame by overflowing vertically", () => {
    const layout = coverLayout(4000, 3000, 160, 90);
    expect(layout.canPanX).toBe(false);
    expect(layout.canPanY).toBe(true);
    expect(layout.dispW).toBeCloseTo(160);
    expect(layout.dispH).toBeGreaterThan(90);
  });

  it("round-trips focal point through offset", () => {
    const layout = coverLayout(2000, 1000, 200, 200);
    const focal = { x: 0.2, y: 0.8 };
    const offset = offsetFromFocal(focal, layout, 200, 200);
    const back = focalFromOffset(offset, layout, 200, 200, focal);
    expect(back.x).toBeCloseTo(0.2, 5);
    expect(back.y).toBeCloseTo(0.8, 5);
  });

  it("clamps pan to the overflow", () => {
    const layout = coverLayout(2000, 1000, 200, 200);
    const clamped = clampOffset({ x: 50, y: -9999 }, layout);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBeCloseTo(-layout.overflowY);
  });
});

describe("frameLayout", () => {
  it("fits the whole image inside the frame", () => {
    const layout = containLayout(4000, 3000, 160, 90);
    expect(layout.dispH).toBeCloseTo(90);
    expect(layout.dispW).toBeCloseTo(120);
    expect(layout.dispW).toBeLessThan(160);
  });

  it("crops a source-pixel window instead of covering the frame", () => {
    const fill = frameLayout("fill", 2000, 1000, 200, 100);
    const crop = frameLayout("crop", 2000, 1000, 200, 100, 1000, 500);
    expect(fill.dispW).toBeCloseTo(200);
    expect(crop.dispW).toBeCloseTo(400);
    const offset = offsetForOperation("crop", { x: 0.5, y: 0.5 }, crop, 200, 100);
    expect(offset.x).toBeCloseTo(-100);
    expect(offset.y).toBeCloseTo(-50);
  });

  it("centers a fit and does not slide it with the focal point", () => {
    const layout = cropWindowLayout(100, 100, 160, 160, 100, 100);
    expect(layout.dispW).toBeCloseTo(160);
    const fit = containLayout(4000, 3000, 160, 90);
    const left = offsetForOperation("fit", { x: 0, y: 0 }, fit, 160, 90);
    const right = offsetForOperation("fit", { x: 1, y: 1 }, fit, 160, 90);
    expect(left).toEqual(right);
    expect(left.x).toBeCloseTo((160 - fit.dispW) / 2);
  });
});
