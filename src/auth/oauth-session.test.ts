import { describe, expect, it } from "vitest";
import {
  expiresAtFromExpiresIn,
  isAccessTokenFresh,
  oauthCredentialsFromSession,
  type StoredOAuthSession,
} from "./oauth-session.js";
import { emptyAuth } from "./types.js";

describe("oauth session helpers", () => {
  it("treats missing expiry as fresh", () => {
    expect(isAccessTokenFresh(null)).toBe(true);
  });

  it("applies skew before expiry", () => {
    expect(isAccessTokenFresh(Date.now() + 120_000)).toBe(true);
    expect(isAccessTokenFresh(Date.now() + 10_000)).toBe(false);
  });

  it("computes expiresAt from expires_in seconds", () => {
    const before = Date.now();
    const expiresAt = expiresAtFromExpiresIn(3600);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3600_000);
    expect(expiresAtFromExpiresIn(undefined)).toBeNull();
  });

  it("merges a stored session into OAuth credentials", () => {
    const stored: StoredOAuthSession = {
      clientId: "cid",
      clientSecret: "sec",
      redirectUri: "http://localhost/cb",
      accessToken: "atok",
      refreshToken: "rtok",
      expiresAt: Date.now() + 60_000,
    };
    expect(oauthCredentialsFromSession(emptyAuth("oauth"), stored)).toMatchObject({
      mode: "oauth",
      clientId: "cid",
      clientSecret: "sec",
      accessToken: "atok",
      refreshToken: "rtok",
    });
  });
});
