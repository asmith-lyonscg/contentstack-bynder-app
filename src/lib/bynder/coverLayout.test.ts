import { describe, expect, it } from "vitest";
import { coverLayout, offsetFromFocal } from "./coverLayout";

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
