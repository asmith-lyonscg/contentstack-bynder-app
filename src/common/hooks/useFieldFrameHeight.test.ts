import { describe, expect, it } from "vitest";
import { measureFieldHeight } from "./useFieldFrameHeight";

describe("measureFieldHeight", () => {
  it("uses the taller of the field root and the document body", () => {
    const root = {
      scrollHeight: 820,
      offsetHeight: 400,
    } as HTMLElement;
    expect(measureFieldHeight(root)).toBeGreaterThanOrEqual(820);
  });
});
