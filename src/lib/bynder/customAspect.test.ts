import { describe, expect, it } from "vitest";
import { resolveCropConfig } from "../fieldConfig";
import {
  CUSTOM_PROFILE_ID,
  customProfileSettings,
  profileSelectOptions,
} from "../profiles";
import {
  aspectRatioForConceptual,
  conceptualWidthForRatio,
  customAspectFrame,
  customCanvasHeight,
} from "./customAspect";

const APP = {
  profiles: {
    hero: { desktop: "16:9", mobile: "4:3" },
  },
};

describe("custom aspect frame", () => {
  const canvasWidth = 280;
  const canvasHeight = customCanvasHeight(canvasWidth);

  it("starts a portrait ratio inset from the right edge, at the full canvas height", () => {
    const conceptual = conceptualWidthForRatio(3 / 4, canvasHeight);
    const frame = customAspectFrame(conceptual, canvasWidth, canvasHeight);
    expect(frame.height).toBe(canvasHeight);
    expect(frame.width).toBeLessThan(canvasWidth);
    expect(frame.width / frame.height).toBeCloseTo(3 / 4, 1);
  });

  it("fills the canvas when the ratio is exactly the canvas shape", () => {
    const conceptual = conceptualWidthForRatio(canvasWidth / canvasHeight, canvasHeight);
    const frame = customAspectFrame(conceptual, canvasWidth, canvasHeight);
    expect(frame.width).toBe(canvasWidth);
    expect(frame.height).toBe(canvasHeight);
  });

  it("shrinks the preview once the drag passes the canvas edge", () => {
    const extra = 40;
    const conceptual = canvasWidth + extra;
    const frame = customAspectFrame(conceptual, canvasWidth, canvasHeight);
    expect(frame.width).toBe(canvasWidth);
    expect(frame.height).toBeLessThan(canvasHeight);
    expect(frame.width / frame.height).toBeCloseTo(conceptual / canvasHeight, 1);
    expect(aspectRatioForConceptual(conceptual, canvasHeight)).toBe(
      aspectRatioForConceptual(canvasWidth + extra, canvasHeight)
    );
  });

  it("turns the canvas-edge drag into a reduced ratio", () => {
    expect(aspectRatioForConceptual(280, 210)).toBe("4:3");
    expect(aspectRatioForConceptual(320, 210)).toBe("32:21");
  });
});

describe("Customize profile", () => {
  it("seeds each viewport from that file and keeps quality and format", () => {
    const current = resolveCropConfig({ defaultProfile: "hero" }, APP).active;
    const next = customProfileSettings(
      current,
      { origWidth: 4000, origHeight: 3000 },
      { origWidth: 900, origHeight: 1600 }
    );
    expect(next.desktop).toBe("4:3");
    expect(next.mobile).toBe("9:16");
    expect(next.quality).toBe(current.quality);
    expect(next.format).toBe(current.format);
  });

  it("hides Customize unless the field config allows it", () => {
    const open = resolveCropConfig({ profiles: ["hero"] }, APP);
    const labels = profileSelectOptions(open, true).map((option) => option.label);
    expect(labels[0]).toBe("Original aspect ratio");
    expect(labels).not.toContain("Customize");
    expect(labels.some((label) => label.startsWith("hero"))).toBe(true);

    const allowed = resolveCropConfig({ profiles: ["hero"], allowCustomAspect: true }, APP);
    expect(profileSelectOptions(allowed, true).map((option) => option.value)).toContain(CUSTOM_PROFILE_ID);

    const locked = resolveCropConfig({ profile: "hero", allowCustomAspect: true }, APP);
    expect(profileSelectOptions(locked, true)).toEqual([]);

    const required = resolveCropConfig({ defaultProfile: "hero", profiles: ["hero"], allowCustomAspect: true }, APP);
    const values = profileSelectOptions(required, true).map((option) => option.value);
    expect(values).not.toContain("");
    expect(values).toContain(CUSTOM_PROFILE_ID);

    const saved = { ...open, profile: CUSTOM_PROFILE_ID };
    expect(profileSelectOptions(saved, true).map((option) => option.value)).toContain(CUSTOM_PROFILE_ID);
  });
});
