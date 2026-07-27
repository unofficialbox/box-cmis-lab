import {
  defaultRedirectUri,
  refreshAccessToken,
  runOAuthAuthorizationCodeFlow,
} from "./oauth.js";
import {
  clearOAuthSession,
  isAccessTokenFresh,
  loadOAuthSession,
  oauthCredentialsFromSession,
  persistOAuthCredentials,
} from "./oauth-session.js";
import type { OAuthCredentials } from "./types.js";

/**
 * Return usable OAuth credentials: reuse a fresh access token, refresh when
 * possible, or run the authorization-code popup as a last resort.
 */
export async function ensureValidOAuthCredentials(
  input: OAuthCredentials,
  options: { allowPopup?: boolean } = {},
): Promise<OAuthCredentials> {
  const allowPopup = options.allowPopup !== false;
  let auth = oauthCredentialsFromSession(input);
  const stored = loadOAuthSession();

  if (auth.accessToken.trim() && isAccessTokenFresh(stored?.expiresAt)) {
    persistOAuthCredentials(auth);
    return auth;
  }

  if (auth.refreshToken.trim() && auth.clientId.trim() && auth.clientSecret) {
    try {
      const tokens = await refreshAccessToken({
        clientId: auth.clientId.trim(),
        clientSecret: auth.clientSecret,
        refreshToken: auth.refreshToken.trim(),
      });
      auth = {
        ...auth,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || auth.refreshToken,
        redirectUri: auth.redirectUri || defaultRedirectUri(),
      };
      persistOAuthCredentials(auth, tokens.expiresIn);
      return auth;
    } catch {
      clearOAuthSession();
      auth = { ...auth, accessToken: "", refreshToken: "" };
    }
  }

  if (!allowPopup) {
    throw new Error("OAuth access token expired and could not be refreshed.");
  }

  const tokens = await runOAuthAuthorizationCodeFlow(auth);
  auth = {
    ...auth,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || auth.refreshToken,
    redirectUri: auth.redirectUri || defaultRedirectUri(),
  };
  persistOAuthCredentials(auth, tokens.expiresIn);
  return auth;
}
