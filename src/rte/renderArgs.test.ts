import { describe, expect, it } from "vitest";
import type { IRteParam } from "@contentstack/app-sdk/dist/src/RTE/types";
import { readRteRenderArgs } from "./renderArgs";

const rte = { getConfig: () => ({ profile: "hero" }), getPath: () => [0, 1] } as unknown as IRteParam;

describe("readRteRenderArgs", () => {
  it("reads the props object Contentstack passes to render", () => {
    const element = { type: "bynder", attrs: { v: 1, alt: "Shelf" }, children: [{ text: "" }] };
    const model = readRteRenderArgs({
      element,
      attributes: { "data-slate-node": "element" },
      children: "anchor",
      rte,
    });
    expect(model.attrs).toEqual({ v: 1, alt: "Shelf" });
    expect(model.path).toEqual([0, 1]);
    expect(model.rte).toBe(rte);
    expect(model.attributes).toEqual({ "data-slate-node": "element" });
    expect(model.children).toBe("anchor");
  });

  it("prefers an explicit path and attrs on the props object", () => {
    const model = readRteRenderArgs({
      attrs: { v: 2 },
      path: [3],
      element: { attrs: { v: 9 } },
      rte,
    });
    expect(model.attrs).toEqual({ v: 2 });
    expect(model.path).toEqual([3]);
  });

  it("reads the older positional arguments", () => {
    const model = readRteRenderArgs({ type: "bynder", attrs: { v: 4 } }, { v: 4 }, [2], rte);
    expect(model.attrs).toEqual({ v: 4 });
    expect(model.path).toEqual([2]);
    expect(model.rte).toBe(rte);
  });

  it("does not treat a missing editor as an rte", () => {
    const model = readRteRenderArgs({ element: { attrs: { v: 1 } }, children: null });
    expect(model.rte).toBeUndefined();
    expect(model.attrs).toEqual({ v: 1 });
    expect(() => model.rte?.getConfig()).not.toThrow();
  });
});
