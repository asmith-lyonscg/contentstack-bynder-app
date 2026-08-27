import { useContext } from "react";
import { MarketplaceAppContext } from "../contexts/marketplaceContext";

export function useAppSdk() {
  const { appSdk } = useContext(MarketplaceAppContext);
  return appSdk;
}

export function useAppConfig() {
  const { appConfig } = useContext(MarketplaceAppContext);
  return appConfig;
}
