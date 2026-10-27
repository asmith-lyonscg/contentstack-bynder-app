import { describe, expect, it } from "vitest";
import { isPickerInit, isPickerResult, pickerReplyOrigin } from "./protocol";

describe("pickerReplyOrigin", () => {
  const page = "https://asmith-lyonscg.github.io";

  it("replies to the Contentstack editor that opened the picker", () => {
    expect(pickerReplyOrigin("https://rte-extension.contentstack.com", page)).toBe(
      "https://rte-extension.contentstack.com"
    );
    expect(pickerReplyOrigin("https://eu-app.contentstack.com/#!/stack", page)).toBe("https://eu-app.contentstack.com");
  });

  it("keeps a same-site custom field on this page", () => {
    expect(pickerReplyOrigin(page, page)).toBe(page);
    expect(pickerReplyOrigin(null, page)).toBe(page);
  });

  it("does not post the selection to an unrelated opener", () => {
    expect(pickerReplyOrigin("https://evil.example", page)).toBe(page);
    expect(pickerReplyOrigin("https://notcontentstack.com", page)).toBe(page);
    expect(pickerReplyOrigin("https://contentstack.com.evil.com", page)).toBe(page);
    expect(pickerReplyOrigin("javascript:alert(1)", page)).toBe(page);
  });

  it("accepts a complete init and a result that actually carries assets", () => {
    const init = {
      type: "bynder-picker-init",
      id: "one",
      payload: { portalUrl: "https://acme.getbynder.com", compact: { mode: "SingleSelect" }, selectedAssets: [] },
    };
    expect(isPickerInit(init, "one")).toBe(true);
    expect(isPickerInit({ ...init, id: "two" }, "one")).toBe(false);
    expect(isPickerInit({ ...init, payload: { portalUrl: "", compact: {}, selectedAssets: [] } }, "one")).toBe(false);
    expect(isPickerResult({ type: "bynder-picker-result", id: "one", ok: true, assets: [{}] }, "one")).toBe(true);
    expect(isPickerResult({ type: "bynder-picker-result", id: "one", ok: true }, "one")).toBe(false);
    expect(isPickerResult({ type: "bynder-picker-result", id: "one", ok: false }, "one")).toBe(true);
  });
});
