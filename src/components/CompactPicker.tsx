import { CompactView, Login, Modal } from "@bynder/compact-view";
import { useState } from "react";
import { COMPACT_ASSET_FIELD_SELECTION } from "../lib/bynder/compactView";
import type { CompactSelectionMode, ParsedBynderAsset } from "../lib/types";
import "./CompactPicker.css";

interface CompactPickerProps {
  portalUrl: string;
  language: string;
  mode: CompactSelectionMode;
  selected: ParsedBynderAsset | null;
  onSelect: (assets: unknown[], additionalInfo?: unknown) => void;
  onRemove: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function CompactPicker({
  portalUrl,
  language,
  mode,
  selected,
  onSelect,
  onRemove,
  onOpenChange,
}: CompactPickerProps) {
  const [open, setOpen] = useState(false);

  const setPickerOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const close = () => setPickerOpen(false);

  return (
    <div className="compact-picker">
      {selected ? (
        <div className="compact-selected">
          <img src={selected.sourceUrl} alt={selected.name ?? "Bynder asset"} />
          <div className="compact-selected-meta">
            <strong>{selected.name ?? "Bynder image"}</strong>
            <span>1 asset</span>
          </div>
          <button type="button" className="compact-remove" onClick={onRemove} aria-label="Remove asset">
            Remove
          </button>
        </div>
      ) : (
        <p className="compact-empty">No assets have been added</p>
      )}
      <button type="button" className="compact-choose" onClick={() => setPickerOpen(true)}>
        + Choose Asset(s)
      </button>
      <Modal isOpen={open} onClose={close}>
        <Login portal={{ url: portalUrl, editable: false }} language={language}>
          <CompactView
            language={language}
            mode={mode}
            assetTypes={["IMAGE"]}
            assetFieldSelection={COMPACT_ASSET_FIELD_SELECTION}
            selectedAssets={
              selected?.pickerId ? [selected.pickerId] : selected?.id ? [selected.id] : []
            }
            resetStoreOnMount
            onSuccess={(assets, additionalInfo) => {
              onSelect(assets, additionalInfo);
              close();
            }}
          />
        </Login>
      </Modal>
    </div>
  );
}
