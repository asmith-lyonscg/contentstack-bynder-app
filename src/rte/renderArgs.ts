import type { ReactNode } from "react";
import type { IRteParam } from "@contentstack/app-sdk/dist/src/RTE/types";

export interface RteRenderModel {
  attrs: Record<string, unknown>;
  path: number[];
  rte?: IRteParam;
  attributes?: Record<string, unknown>;
  children?: ReactNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRte(value: unknown): value is IRteParam {
  return isRecord(value) && typeof value.getConfig === "function";
}

function pathOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.every((item) => typeof item === "number") ? value : [];
}

/**
 * Contentstack calls `render` with one props object (`element`, `attrs`, `attributes`, `children`, `rte`).
 * Older call sites pass those values as separate arguments.
 */
export function readRteRenderArgs(...args: unknown[]): RteRenderModel {
  const first = args[0];
  if (isRecord(first) && ("attributes" in first || "element" in first || "rte" in first || "path" in first)) {
    const element = isRecord(first.element) ? first.element : undefined;
    const attrs = isRecord(first.attrs) ? first.attrs : isRecord(element?.attrs) ? element.attrs : {};
    const rte = isRte(first.rte) ? first.rte : isRte(args[3]) ? (args[3] as IRteParam) : undefined;
    let path = pathOf(first.path);
    if (!path.length && rte && element && typeof rte.getPath === "function") {
      try {
        path = pathOf(rte.getPath(element as never));
      } catch {
        path = [];
      }
    }
    return {
      attrs,
      path,
      rte,
      attributes: isRecord(first.attributes) ? first.attributes : undefined,
      children: first.children as ReactNode,
    };
  }

  const element = isRecord(first) ? first : undefined;
  const attrs = isRecord(args[1]) ? args[1] : isRecord(element?.attrs) ? element.attrs : {};
  const rte = isRte(args[3]) ? args[3] : undefined;
  let path = pathOf(args[2]);
  if (!path.length && rte && element && typeof rte.getPath === "function") {
    try {
      path = pathOf(rte.getPath(element as never));
    } catch {
      path = [];
    }
  }
  return { attrs, path, rte };
}
