import { useEffect, useState, type ReactNode } from "react";
import ContentstackAppSDK from "@contentstack/app-sdk";
import type UiLocation from "@contentstack/app-sdk/dist/src/uiLocation";
import { MarketplaceAppContext } from "../contexts/marketplaceContext";
import type { AppInstallationConfig } from "../../lib/types";

interface ProviderProps {
  children?: ReactNode;
}

export function MarketplaceAppProvider({ children }: ProviderProps) {
  const [failed, setFailed] = useState(false);
  const [appSdk, setAppSdk] = useState<UiLocation | null>(null);
  const [appConfig, setAppConfig] = useState<AppInstallationConfig | null>(null);

  useEffect(() => {
    ContentstackAppSDK.init()
      .then(async (sdk) => {
        setAppSdk(sdk);
        sdk.location.CustomField?.frame?.enableAutoResizing();
        try {
          const config = (await sdk.getConfig()) as AppInstallationConfig;
          setAppConfig(config ?? {});
        } catch {
          setAppConfig({});
        }
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);

  if (failed) {
    return (
      <div className="app-failed">
        <h3>Could not initialize the Contentstack App SDK</h3>
        <p>
          Open this app from a Custom Field or App Configuration location in Contentstack, or check
          that Developer Hub hosting points at this origin.
        </p>
      </div>
    );
  }

  if (!appSdk) {
    return <div className="app-loading">Loading Bynder Image Settings…</div>;
  }

  return (
    <MarketplaceAppContext.Provider value={{ appSdk, appConfig }}>{children}</MarketplaceAppContext.Provider>
  );
}
