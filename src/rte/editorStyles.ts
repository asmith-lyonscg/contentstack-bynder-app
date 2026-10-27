import cropCss from "../components/CropFocalEditor.css?inline";
import focalCss from "../components/FocalPointCanvas.css?inline";
import spinnerCss from "../components/ImageSpinner.css?inline";
import tooltipCss from "../components/InfoTooltip.css?inline";
import liveCss from "../components/LivePreview.css?inline";
import pickerCss from "../components/CompactPicker.css?inline";
import transformCss from "../components/TransformForm.css?inline";
import fieldCss from "../locations/CustomField/CustomField.css?inline";
import rteCss from "./rte.css?inline";

const STYLE_ID = "bynder-rte-styles";

export function ensureEditorStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [fieldCss, pickerCss, focalCss, cropCss, transformCss, liveCss, spinnerCss, tooltipCss, rteCss].join(
    "\n"
  );
  document.head.appendChild(style);
}
