import { describe, expect, it } from "vitest";
import {
  isOwnSettingsPayload,
  parseAutoUpdateEntry,
  parseExtensionFieldChange,
  shouldApplyHostFieldData,
} from "./hostEvents";

describe("isOwnSettingsPayload", () => {
  it("recognizes this app’s JSON and rejects Bynder arrays", () => {
    expect(
      isOwnSettingsPayload({
        v: 1,
        assets: [{ id: "a", webImage: { url: "https://cdn.example/a.jpg" } }],
      })
    ).toBe(true);
    expect(isOwnSettingsPayload([])).toBe(false);
    expect(
      isOwnSettingsPayload([{ id: "a", files: { webImage: { url: "https://cdn.example/a.jpg" } } }])
    ).toBe(false);
  });
});

describe("parseExtensionFieldChange", () => {
  it("reads empty Bynder data from the host event", () => {
    const event = new CustomEvent("$extensionFieldChange", {
      detail: { data: [], eventName: "extensionFieldChange", extensionUid: "blt-bynder" },
    });
    expect(parseExtensionFieldChange(event)).toEqual({
      extensionUid: "blt-bynder",
      data: [],
    });
  });
});

describe("shouldApplyHostFieldData", () => {
  it("applies Bynder assign and clear, and ignores this app’s JSON", () => {
    expect(shouldApplyHostFieldData([])).toBe(true);
    expect(
      shouldApplyHostFieldData([{ id: "a", files: { webImage: { url: "https://cdn.example/a.jpg" } } }])
    ).toBe(true);
    expect(
      shouldApplyHostFieldData({
        v: 1,
        assets: [{ id: "a", webImage: { url: "https://cdn.example/a.jpg" } }],
      })
    ).toBe(false);
    expect(shouldApplyHostFieldData({ unrelated: true })).toBe(false);
  });
});

describe("parseAutoUpdateEntry", () => {
  it("reads the entry payload including an empty Bynder field", () => {
    const event = new CustomEvent("$autoUpdateEntry", {
      detail: {
        eventName: "entryChange",
        data: { title: "Test", bynder_logo: [], bynder_focal_point_dat: { v: 1, focalPoint: { x: 0.5, y: 0.5 } } },
      },
    });
    expect(parseAutoUpdateEntry(event)).toMatchObject({ bynder_logo: [], title: "Test" });
  });
});
