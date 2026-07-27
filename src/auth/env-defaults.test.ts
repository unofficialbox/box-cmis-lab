import { describe, expect, it } from "vitest";
import {
  authFromLabEnv,
  overlayAuthFromEnv,
  parseAuthMode,
  resolveConnectionSeed,
  type LabEnv,
} from "./env-defaults.js";
import { emptyAuth } from "./types.js";

const sampleJwt = JSON.stringify({
  boxAppSettings: {
    clientID: "jwt-client",
    clientSecret: "jwt-secret",
    appAuth: {
      publicKeyID: "kid",
      privateKey: "-----BEGIN ENCRYPTED PRIVATE KEY-----\\nabc\\n-----END ENCRYPTED PRIVATE KEY-----\\n",
      passphrase: "pass",
    },
  },
  enterpriseID: "ent-1",
});

describe("parseAuthMode", () => {
  it("accepts common aliases", () => {
    expect(parseAuthMode("oauth")).toBe("oauth");
    expect(parseAuthMode("CCG")).toBe("ccg");
    expect(parseAuthMode("jwt")).toBe("jwt");
    expect(parseAuthMode("nope")).toBeNull();
  });
});

describe("authFromLabEnv", () => {
  it("builds CCG credentials", () => {
    const env: LabEnv = {
      VITE_BOX_CLIENT_ID: "cid",
      VITE_BOX_CLIENT_SECRET: "sec",
      VITE_BOX_SUBJECT_TYPE: "user",
      VITE_BOX_SUBJECT_ID: "u1",
    };
    expect(authFromLabEnv(env, "ccg")).toEqual({
      ...emptyAuth("ccg"),
      clientId: "cid",
      clientSecret: "sec",
      boxSubjectType: "user",
      boxSubjectId: "u1",
    });
  });

  it("parses JWT config JSON", () => {
    const auth = authFromLabEnv({ VITE_JWT_CONFIG_JSON: sampleJwt }, "jwt");
    expect(auth.mode).toBe("jwt");
    if (auth.mode !== "jwt") {
      throw new Error("expected jwt");
    }
    expect(auth.clientId).toBe("jwt-client");
    expect(auth.enterpriseId).toBe("ent-1");
    expect(auth.configJson).toContain("\n");
  });
});

describe("resolveConnectionSeed", () => {
  it("uses env when nothing is stored", () => {
    const seed = resolveConnectionSeed(null, {
      VITE_AUTH_MODE: "oauth",
      VITE_CMIS_SERVICE_URL: "http://example.test/cmis",
      VITE_BOX_CLIENT_ID: "cid",
      VITE_BOX_CLIENT_SECRET: "secret",
    });
    expect(seed.serviceUrl).toBe("http://example.test/cmis");
    expect(seed.auth).toMatchObject({
      mode: "oauth",
      clientId: "cid",
      clientSecret: "secret",
    });
  });

  it("keeps stored prefs and fills secrets from env", () => {
    const seed = resolveConnectionSeed(
      {
        serviceUrl: "http://stored/cmis",
        succinct: true,
        auth: {
          authMode: "ccg",
          clientId: "stored-cid",
          boxSubjectType: "enterprise",
          boxSubjectId: "ent",
        },
      },
      {
        VITE_AUTH_MODE: "oauth",
        VITE_BOX_CLIENT_SECRET: "from-env",
        VITE_BOX_SUBJECT_TYPE: "enterprise",
      },
    );
    expect(seed.serviceUrl).toBe("http://stored/cmis");
    expect(seed.succinct).toBe(true);
    expect(seed.auth).toMatchObject({
      mode: "ccg",
      clientId: "stored-cid",
      clientSecret: "from-env",
      boxSubjectId: "ent",
    });
  });
});

describe("overlayAuthFromEnv", () => {
  it("prefers env JWT config JSON when present", () => {
    const base = emptyAuth("jwt");
    const fromEnv = authFromLabEnv({ VITE_JWT_CONFIG_JSON: sampleJwt }, "jwt");
    const merged = overlayAuthFromEnv(base, fromEnv);
    expect(merged.mode).toBe("jwt");
    if (merged.mode !== "jwt") {
      throw new Error("expected jwt");
    }
    expect(merged.clientId).toBe("jwt-client");
    expect(merged.configJson.trim().startsWith("{")).toBe(true);
  });
});
