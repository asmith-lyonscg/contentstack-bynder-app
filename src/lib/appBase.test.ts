import { describe, expect, it } from "vitest";
import { isPickerPath, joinAppPath, routerBasenameFrom, withTrailingSlash } from "./appBase";

describe("appBase", () => {
  it("normalizes Vite base to a trailing slash", () => {
    expect(withTrailingSlash("/")).toBe("/");
    expect(withTrailingSlash("/contentstack-bynder-app")).toBe("/contentstack-bynder-app/");
    expect(withTrailingSlash("/contentstack-bynder-app/")).toBe("/contentstack-bynder-app/");
  });

  it("strips the trailing slash for React Router basename", () => {
    expect(routerBasenameFrom("/")).toBe("");
    expect(routerBasenameFrom("/contentstack-bynder-app/")).toBe("/contentstack-bynder-app");
  });

  it("recognizes the picker popup path", () => {
    expect(isPickerPath("/picker")).toBe(true);
    expect(isPickerPath("/picker.html")).toBe(true);
    expect(isPickerPath("/picker/")).toBe(true);
    expect(isPickerPath("/contentstack-bynder-app/picker.html")).toBe(true);
    expect(isPickerPath("/custom-field.html")).toBe(false);
    expect(isPickerPath("/picker.html/extra")).toBe(false);
  });

  it("joins app routes under the public base", () => {
    expect(joinAppPath("/", "picker.html?id=abc")).toBe("/picker.html?id=abc");
    expect(joinAppPath("/contentstack-bynder-app/", "/picker.html?id=abc")).toBe(
      "/contentstack-bynder-app/picker.html?id=abc"
    );
    expect(joinAppPath("/contentstack-bynder-app/", "app-icon.svg")).toBe(
      "/contentstack-bynder-app/app-icon.svg"
    );
  });
});
