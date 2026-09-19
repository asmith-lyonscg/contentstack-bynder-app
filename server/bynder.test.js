import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, portalOrigin, tokenStillValid } from "./bynder.mjs";

describe("Bynder OAuth helpers", () => {
  it("builds the authorize URL on the portal host", () => {
    const url = buildAuthorizeUrl({
      portalUrl: "https://qa.assets.deltafaucet.com/",
      clientId: "client-1",
      redirectUri: "https://app.example.com/oauth/callback",
      state: "abc",
      scope: "offline asset:read",
    });
    expect(url).toContain("https://qa.assets.deltafaucet.com/v6/authentication/oauth2/auth?");
    expect(url).toContain("client_id=client-1");
    expect(url).toContain(encodeURIComponent("https://app.example.com/oauth/callback"));
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=abc");
  });

  it("normalizes portal origin", () => {
    expect(portalOrigin("qa.assets.deltafaucet.com")).toBe("https://qa.assets.deltafaucet.com");
  });

  it("treats tokens inside the skew window as expired", () => {
    expect(tokenStillValid(Date.now() + 10_000, 60_000)).toBe(false);
    expect(tokenStillValid(Date.now() + 120_000, 60_000)).toBe(true);
  });
});
