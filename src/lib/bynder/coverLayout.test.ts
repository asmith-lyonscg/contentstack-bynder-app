import { describe, expect, it } from "vitest";
import {
  clampOffset,
  coverLayout,
  focalFromOffset,
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
