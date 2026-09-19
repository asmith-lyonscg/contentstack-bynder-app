import { CompactView, Login } from "@bynder/compact-view";
import { useEffect } from "react";
import { COMPACT_ASSET_FIELD_SELECTION } from "../lib/bynder/compactView";
import { installCompactViewGraphqlPatch } from "../lib/bynder/patchCompactViewGraphql";
import type { CompactPreselectAsset } from "../lib/bynder/preselect";
import type { CompactViewConfig } from "../lib/types";

interface CompactViewHostProps {
  compact: CompactViewConfig;
  portalUrl: string;
  accessToken?: string;
  selectedAssets?: string[];
  preselect?: CompactPreselectAsset[];
  onSuccess: (assets: unknown[], additionalInfo?: unknown) => void;
}

export function CompactViewHost({
  compact,
  portalUrl,
  accessToken,
  selectedAssets,
  preselect,
  onSuccess,
}: CompactViewHostProps) {
  useEffect(() => installCompactViewGraphqlPatch(), []);
  useEffect(() => {
    if (!preselect?.length) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import("./restoreCompactSelection")
        .then(({ restoreCompactSelection }) => {
          if (!cancelled) return restoreCompactSelection(preselect);
        })
        .catch((error) => {
          console.warn("[bynder-picker] selection restore skipped", error);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [preselect]);

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
    <Login
      portal={{ url: portalUrl, editable: false }}
      language={compact.language}
      authentication={
        accessToken ? { getAccessToken: () => accessToken, hideLogout: true } : undefined
      }
    >
      <CompactView
        language={compact.language}
        mode={compact.mode}
        assetTypes={compact.assetTypes}
        assetFilter={compact.assetFilter}
        defaultSearchTerm={compact.defaultSearchTerm}
        theme={compact.theme}
        hideExternalAccess={compact.hideExternalAccess}
        hideLimitedUse={compact.hideLimitedUse}
        hideSwitch={compact.hideSwitch}
        noCache={compact.noCache}
        selectAllOption={(compact.maxLimit ?? 1) > 1 ? false : compact.selectAllOption}
        defaultImageDerivativeName={compact.defaultImageDerivativeName}
        defaultVideoDerivativeName={compact.defaultVideoDerivativeName}
        isPersonal={compact.isPersonal}
        enableDASH={compact.enableDASH}
        embedType={compact.embedType}
        assetFieldSelection={COMPACT_ASSET_FIELD_SELECTION}
        selectedAssets={selectedAssets?.length ? selectedAssets : undefined}
        isContainerMode
        resetStoreOnMount
        onSuccess={(nextAssets, additionalInfo) => {
          if (!nextAssets.length) {
            onSuccess([]);
            return;
          }
          const limit = compact.maxLimit;
          const capped =
            typeof limit === "number" && limit > 0 ? nextAssets.slice(0, limit) : nextAssets;
          onSuccess(capped, additionalInfo);
        }}
      />
    </Login>
    </div>
  );
}

export default CompactViewHost;
