/// <reference types="vite/client" />

declare module "@bynder/compact-view/useSelectionStore.js" {
  type SelectionStore = {
    selection: unknown[];
    selectAssets: (assets: unknown[]) => void;
  };
  export const useSelectionStore: (() => SelectionStore) & {
    getState: () => SelectionStore;
  };
}
