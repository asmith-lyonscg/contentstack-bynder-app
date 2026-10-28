import { describe, expect, it } from "vitest";
import { coverLayout, focalPointFromFramePointer, offsetFromFocal } from "./coverLayout";

describe("coverLayout", () => {
  it("covers a wide frame by overflowing vertically", () => {
    const layout = coverLayout(4000, 3000, 160, 90);
    expect(layout.canPanX).toBe(false);
    expect(layout.canPanY).toBe(true);
    expect(layout.dispW).toBeCloseTo(160);
    expect(layout.dispH).toBeGreaterThan(90);
  });

  it("places the focal point in the overflow", () => {
    const layout = coverLayout(2000, 1000, 200, 200);
    const focal = { x: 0.2, y: 0.8 };
    const offset = offsetFromFocal(focal, layout, 200, 200);
    expect(offset.x).toBeCloseTo((200 - layout.dispW) * 0.2);
    expect(offset.y).toBeCloseTo((200 - layout.dispH) * 0.8);
  });
});

describe("focalPointFromFramePointer", () => {
  it("stores the click in the original file when the frame is mirrored", () => {
    const layout = { dispW: 200, dispH: 100, overflowX: 0, overflowY: 0, canPanX: false, canPanY: false };
    const frame = { left: 0, top: 0, width: 200, height: 100 };
    expect(focalPointFromFramePointer(50, 25, frame, layout, 200, 100, { x: 0, y: 0 }, true)).toEqual({
      x: 0.75,
      y: 0.25,
    });
  });
});
