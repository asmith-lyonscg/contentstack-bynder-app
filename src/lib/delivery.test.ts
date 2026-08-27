import { describe, expect, it } from "vitest";
import { composeBynderImageUrl, focalPointToObjectPosition } from "../delivery/composeBynderImageUrl";
import { emptySettings } from "./settings";

describe("composeBynderImageUrl", () => {
  it("applies breakpoint overrides while keeping focal point", () => {
    const settings = emptySettings("hero_image");
    settings.datEnabled = true;
    settings.transformBaseUrl = "https://portal.bynder.com/transform/abc/hero.jpg";
    settings.focalPoint = { x: 0.25, y: 0.75 };
    settings.transform.width = 1200;
    settings.transform.height = 675;

    const url = composeBynderImageUrl(settings, { width: 400 });
    expect(url).toContain("width:400");
    expect(url).toContain("height:225");
    expect(url).toContain("focuspoint=0.25,0.75");
  });

  it("maps focal point to CSS object-position", () => {
    expect(focalPointToObjectPosition({ x: 0.35, y: 0.42 })).toBe("35% 42%");
  });

  it("returns sourceUrl when DAT is disabled", () => {
    const settings = emptySettings("hero_image");
    settings.datEnabled = false;
    settings.sourceUrl = "https://cdn.example/web.jpg";
    settings.transformBaseUrl = "https://portal.bynder.com/transform/abc/hero.jpg";
    expect(composeBynderImageUrl(settings, { width: 400 })).toBe("https://cdn.example/web.jpg");
  });
});
