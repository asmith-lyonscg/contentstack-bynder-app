import { describe, expect, it } from "vitest";
import { isPickerPath, joinAppPath, pluginRoot, publicRootFromModuleUrl, resolveAppHref, routerBasenameFrom, withTrailingSlash } from "./appBase";

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

  it("uses the plugin script origin when the editor page is Contentstack", () => {
    const moduleUrl = "https://asmith-lyonscg.github.io/contentstack-bynder-app/json-rte.js";
    expect(publicRootFromModuleUrl(moduleUrl)).toBe("https://asmith-lyonscg.github.io/contentstack-bynder-app/");
    expect(publicRootFromModuleUrl("http://localhost:3000/src/lib/appBase.ts")).toBeUndefined();
    expect(
      resolveAppHref(
        "picker.html?id=abc&opener=https%3A%2F%2Frte-extension.contentstack.com",
        moduleUrl,
        "https://rte-extension.contentstack.com",
        "/"
      )
    ).toBe(
      "https://asmith-lyonscg.github.io/contentstack-bynder-app/picker.html?id=abc&opener=https%3A%2F%2Frte-extension.contentstack.com"
    );
  });

  it("keeps the Pages subpath when the editor origin matches the script", () => {
    expect(
      resolveAppHref(
        "picker.html?id=abc",
        "https://pages.example/contentstack-bynder-app/json-rte.js",
        "https://pages.example",
        "/"
      )
    ).toBe("https://pages.example/contentstack-bynder-app/picker.html?id=abc");
  });

  it("uses a loaded json-rte.js URL when the module URL is not the script", () => {
    expect(
      pluginRoot("https://rte-extension.contentstack.com/picker.html", [
        "https://asmith-lyonscg.github.io/contentstack-bynder-app/json-rte.js?t=1",
      ])
    ).toBe("https://asmith-lyonscg.github.io/contentstack-bynder-app/");
    expect(
      resolveAppHref("picker.html?id=abc", "https://pages.example/contentstack-bynder-app/assets/index.js", "https://pages.example", "/contentstack-bynder-app/")
    ).toBe("https://pages.example/contentstack-bynder-app/picker.html?id=abc");
  });

  it("joins app routes under the public base", () => {
    expect(joinAppPath("/", "picker.html?id=abc")).toBe("/picker.html?id=abc");
    expect(joinAppPath("/contentstack-bynder-app/", "/picker.html?id=abc")).toBe(
      "/contentstack-bynder-app/picker.html?id=abc"
    );
    expect(joinAppPath("/contentstack-bynder-app/", "app-icon.png")).toBe(
      "/contentstack-bynder-app/app-icon.png"
    );
  });
});
