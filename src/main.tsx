import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { isPickerPath, routerBasename } from "./lib/appBase";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

const basename = routerBasename() || undefined;

const app = (
  <BrowserRouter basename={basename}>
    <App />
  </BrowserRouter>
);

// Compact View 6.0.1 stores its preselect cancel flag in the component body.
// Strict Mode runs that effect twice in development and the lookup is dropped,
// so Change Asset(s) never shows a selection. The picker window opts out.
createRoot(root).render(
  isPickerPath(window.location.pathname) ? app : <StrictMode>{app}</StrictMode>,
);
