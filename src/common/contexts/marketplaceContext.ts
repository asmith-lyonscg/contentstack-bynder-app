import { createContext } from "react";
import type UiLocation from "@contentstack/app-sdk/dist/src/uiLocation";
import type { AppInstallationConfig } from "../../lib/types";

export interface MarketplaceAppContextValue {
  appSdk: UiLocation | null;
  appConfig: AppInstallationConfig | null;
}

export const MarketplaceAppContext = createContext<MarketplaceAppContextValue>({
  appSdk: null,
  appConfig: null,
});
