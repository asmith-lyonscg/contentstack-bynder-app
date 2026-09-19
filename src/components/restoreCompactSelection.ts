import {
  compactViewPreselectAsset,
  type CompactPreselectAsset,
} from "../lib/bynder/preselect";

/**
 * Compact View’s `selectedAssets` fetch can succeed in Network and still leave
 * the footer empty. Push the current assets into Compact View’s selection store
 * after StoreInitializer’s mount reset.
 */
export async function restoreCompactSelection(assets: CompactPreselectAsset[]): Promise<void> {
  if (!assets.length) return;
  const { useSelectionStore } = await import("@bynder/compact-view/useSelectionStore.js");
  const stubs = assets.map(compactViewPreselectAsset);
  const apply = () => {
    const state = useSelectionStore.getState();
    if (state.selection.length) return false;
    state.selectAssets(stubs);
    console.info(
      "[bynder-picker] restored Compact View selection",
      stubs.map((item) => item.databaseId)
    );
    return true;
  };
  if (apply()) return;
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  apply();
}
