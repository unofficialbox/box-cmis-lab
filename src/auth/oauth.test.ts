import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, createOAuthState } from "./oauth.js";

describe("buildAuthorizeUrl", () => {
  it("builds the Box authorize URL", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "abc123",
        redirectUri: "http://127.0.0.1:5173/oauth/callback.html",
        state: "state-1",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://account.box.com/api/oauth2/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:5173/oauth/callback.html",
    );
    expect(url.searchParams.get("state")).toBe("state-1");
  });
});

describe("createOAuthState", () => {
  it("returns a non-empty hex string", () => {
    const state = createOAuthState();
    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });
});
