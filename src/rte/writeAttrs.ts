import type { IRteParam } from "@contentstack/app-sdk/dist/src/RTE/types";

/**
 * Replace the node's `attrs`.
 *
 * `setAttrs` merges the object you pass onto the attributes already stored.
 * Passing `{ attrs: payload }` therefore saved a nested copy and left the real
 * `v` / `profile` / `assets` value in place, so the next open still looked unsaved.
 * Setting the `attrs` property through the editor replaces that object.
 */
export function writeRteAttrs(rte: IRteParam, path: number[], attrs: Record<string, unknown>): void {
  const clean = { ...attrs };
  delete clean.attrs;
  const adv = rte._adv;
  if (adv?.Transforms && adv.editor && path.length) {
    try {
      adv.Transforms.setNodes(adv.editor, { attrs: clean }, { at: path });
      return;
    } catch {
      // A stale path throws while the editor is re-rendering. Fall through.
    }
  }
  rte.setAttrs(clean, { at: path });
}
