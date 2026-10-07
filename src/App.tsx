import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MarketplaceAppProvider } from "./common/providers/MarketplaceAppProvider";

const CustomField = lazy(() => import("./locations/CustomField/CustomField"));
const AppConfig = lazy(() => import("./locations/AppConfig/AppConfig"));
const Home = lazy(() => import("./locations/Home/Home"));
const PickerPopup = lazy(() => import("./locations/PickerPopup/PickerPopup"));

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="app-loading">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/picker" element={<PickerPopup />} />
          <Route path="/picker.html" element={<PickerPopup />} />
          <Route
            path="/custom-field"
            element={
              <MarketplaceAppProvider>
                <CustomField />
              </MarketplaceAppProvider>
            }
          />
          <Route
            path="/custom-field.html"
            element={
              <MarketplaceAppProvider>
                <CustomField />
              </MarketplaceAppProvider>
            }
          />
          <Route
            path="/app-configuration"
            element={
              <MarketplaceAppProvider>
                <AppConfig />
              </MarketplaceAppProvider>
            }
          />
          <Route
            path="/app-configuration.html"
            element={
              <MarketplaceAppProvider>
                <AppConfig />
              </MarketplaceAppProvider>
            }
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
