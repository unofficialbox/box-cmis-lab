/** Persist OAuth tokens across page refresh (same tab) without putting them in localStorage prefs. */

import type { OAuthCredentials } from "./types.js";

const OAUTH_SESSION_KEY = "box-cmis-lab.oauth-session";

/** Refresh a minute early so in-flight requests don't race expiry. */
const EXPIRY_SKEW_MS = 60_000;

export interface StoredOAuthSession {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires; null if Box omitted expires_in. */
  expiresAt: number | null;
}

export function loadOAuthSession(): StoredOAuthSession | null {
  try {
    const raw = sessionStorage.getItem(OAUTH_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredOAuthSession;
    if (
      typeof parsed.accessToken !== "string" ||
      !parsed.accessToken ||
      typeof parsed.clientId !== "string"
    ) {
      return null;
    }
    return {
      clientId: parsed.clientId,
      clientSecret: typeof parsed.clientSecret === "string" ? parsed.clientSecret : "",
      redirectUri: typeof parsed.redirectUri === "string" ? parsed.redirectUri : "",
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : "",
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
    };
  } catch {
    return null;
  }
}

export function saveOAuthSession(session: StoredOAuthSession): void {
  sessionStorage.setItem(OAUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearOAuthSession(): void {
  sessionStorage.removeItem(OAUTH_SESSION_KEY);
}

export function isAccessTokenFresh(expiresAt: number | null | undefined): boolean {
  if (expiresAt == null) {
    // Unknown lifetime — treat as usable until an API call fails.
    return true;
  }
  return Date.now() < expiresAt - EXPIRY_SKEW_MS;
}

export function expiresAtFromExpiresIn(expiresIn: number | undefined): number | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return Date.now() + expiresIn * 1000;
}

export function oauthCredentialsFromSession(
  base: OAuthCredentials,
  stored: StoredOAuthSession | null = loadOAuthSession(),
): OAuthCredentials {
  if (!stored) {
    return base;
  }
  const sameClient =
    !base.clientId.trim() || base.clientId.trim() === stored.clientId.trim();
  if (!sameClient) {
    return base;
  }
  return {
    ...base,
    clientId: base.clientId.trim() || stored.clientId,
    clientSecret: base.clientSecret || stored.clientSecret,
    redirectUri: base.redirectUri || stored.redirectUri,
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken || base.refreshToken,
  };
}

export function persistOAuthCredentials(
  auth: OAuthCredentials,
  expiresIn?: number,
): void {
  if (!auth.accessToken.trim()) {
    return;
  }
  const previous = loadOAuthSession();
  saveOAuthSession({
    clientId: auth.clientId.trim(),
    clientSecret: auth.clientSecret || previous?.clientSecret || "",
    redirectUri: auth.redirectUri || previous?.redirectUri || "",
    accessToken: auth.accessToken.trim(),
    refreshToken: auth.refreshToken || previous?.refreshToken || "",
    expiresAt:
      expiresAtFromExpiresIn(expiresIn) ??
      (previous && previous.accessToken === auth.accessToken.trim()
        ? previous.expiresAt
        : null),
  });
}
