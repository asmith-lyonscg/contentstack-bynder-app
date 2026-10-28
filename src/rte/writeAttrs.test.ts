import { describe, expect, it, vi } from "vitest";
import type { IRteParam } from "@contentstack/app-sdk/dist/src/RTE/types";
import { writeRteAttrs } from "./writeAttrs";

describe("writeRteAttrs", () => {
  it("replaces the node attrs and drops a nested attrs copy", () => {
    const setNodes = vi.fn();
    const setAttrs = vi.fn();
    const rte = {
      _adv: { editor: {}, Transforms: { setNodes } },
      setAttrs,
    } as unknown as IRteParam;
    writeRteAttrs(rte, [0, 1], {
      v: 2,
      assets: [{ id: "earth" }],
      attrs: { v: 1 },
      display: { width: 200 },
    });
    expect(setNodes).toHaveBeenCalledWith(
      rte._adv.editor,
      { attrs: { v: 2, assets: [{ id: "earth" }], display: { width: 200 } } },
      { at: [0, 1] }
    );
    expect(setAttrs).not.toHaveBeenCalled();
  });

  it("falls back to setAttrs with the attribute object itself", () => {
    const setAttrs = vi.fn();
    const rte = { setAttrs } as unknown as IRteParam;
    writeRteAttrs(rte, [1], { v: 2, display: { inline: true } });
    expect(setAttrs).toHaveBeenCalledWith({ v: 2, display: { inline: true } }, { at: [1] });
  });
});
