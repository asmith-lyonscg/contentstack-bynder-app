import { useEffect, useState } from "react";
import { CompactView, Login } from "@bynder/compact-view";
import { COMPACT_ASSET_FIELD_SELECTION } from "../lib/bynder/compactView";
import { installCompactViewGraphqlPatch } from "../lib/bynder/patchCompactViewGraphql";
import type { CompactViewConfig } from "../lib/types";

interface CompactViewHostProps {
  compact: CompactViewConfig;
  portalUrl: string;
  selectedAssets?: string[];
  onSuccess: (assets: unknown[], additionalInfo?: unknown) => void;
}

installCompactViewGraphqlPatch();

/** Compact View renders `.cv-root` inside an open shadow root once login has finished. */
function compactViewMounted(): boolean {
  const hosts = document.querySelectorAll("[data-testid='root']");
  for (const host of hosts) {
    if (host.shadowRoot?.querySelector(".cv-root")) return true;
  }
  return false;
}

export function CompactViewHost({
  compact,
  portalUrl,
  selectedAssets,
  onSuccess,
}: CompactViewHostProps) {
  const wanted = selectedAssets ?? [];
  const wantedKey = wanted.join("\n");
  // 0: pass the raw ids. 1: blank. 2: pass them again.
  // Compact View 6.0.1 drops the lookup when its effect runs twice. A later
  // update runs once, so the second pass is the one that sticks.
  const [pass, setPass] = useState(0);

  useEffect(() => {
    if (!wantedKey) return undefined;
    let cancelled = false;
    let timer = 0;
    const arm = () => {
      if (cancelled) return;
      if (!compactViewMounted()) {
        timer = window.setTimeout(arm, 50);
        return;
      }
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setPass(1);
        timer = window.setTimeout(() => {
          if (!cancelled) setPass(2);
        }, 0);
      }, 0);
    };
    arm();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wantedKey]);

  const shownAssets = pass === 1 ? [] : wanted;

  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
    <Login
      portal={{ url: portalUrl, editable: false }}
      language={compact.language}
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
        selectedAssets={shownAssets}
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
