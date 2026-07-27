import { describe, expect, it } from "vitest";
import {
  authModeLabel,
  authorizationHeader,
  emptyAuth,
  toStoredAuthPrefs,
} from "./types.js";

describe("authorizationHeader", () => {
  it("returns Bearer for OAuth access tokens", () => {
    expect(
      authorizationHeader({
        ...emptyAuth("oauth"),
        accessToken: " tok_123 ",
      }),
    ).toBe("Bearer tok_123");
  });

  it("returns undefined for CCG and JWT", () => {
    expect(authorizationHeader(emptyAuth("ccg"))).toBeUndefined();
    expect(authorizationHeader(emptyAuth("jwt"))).toBeUndefined();
  });
});

describe("auth helpers", () => {
  it("labels modes", () => {
    expect(authModeLabel("oauth")).toBe("OAuth 2.0");
    expect(authModeLabel("ccg")).toBe("Client Credentials Grant");
    expect(authModeLabel("jwt")).toBe("JWT");
  });

  it("stores non-secret prefs only", () => {
    expect(
      toStoredAuthPrefs({
        ...emptyAuth("ccg"),
        clientId: "cid",
        clientSecret: "secret",
        boxSubjectType: "enterprise",
        boxSubjectId: "ent",
      }),
    ).toEqual({
      authMode: "ccg",
      clientId: "cid",
      boxSubjectType: "enterprise",
      boxSubjectId: "ent",
    });
  });
});
