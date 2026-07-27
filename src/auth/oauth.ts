/** Helpers for OAuth 2.0 authorization-code flow against Box. */

import type { OAuthCredentials } from "./types.js";

export const OAUTH_MESSAGE_TYPE = "box-cmis-lab-oauth";

const BOX_AUTHORIZE_URL = "https://account.box.com/api/oauth2/authorize";
const BOX_TOKEN_PATH = "/box-api/oauth2/token";

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface OAuthCallbackMessage {
  type: typeof OAUTH_MESSAGE_TYPE;
  code?: string | null;
  error?: string | null;
  errorDescription?: string | null;
  state?: string | null;
}

export function defaultRedirectUri(): string {
  return `${window.location.origin}/oauth/callback.html`;
}

export function buildAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(BOX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", options.state);
  return url.toString();
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function exchangeAuthorizationCode(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
  });

  return requestToken(body);
}

/** Exchange a refresh token for a new access token (and rotated refresh token when returned). */
export async function refreshAccessToken(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    client_secret: options.clientSecret,
  });

  return requestToken(body);
}

async function requestToken(body: URLSearchParams): Promise<OAuthTokenResult> {
  const response = await fetch(BOX_TOKEN_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Token exchange returned non-JSON (${response.status})`);
  }

  if (!response.ok) {
    const message =
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json.error === "string"
          ? json.error
          : `Token exchange failed (${response.status})`;
    throw new Error(message);
  }

  const accessToken = json.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Token exchange response did not include access_token.");
  }

  return {
    accessToken,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : "",
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : undefined,
  };
}

/**
 * Opens the Box authorization dialog and exchanges the returned code for tokens.
 */
export async function runOAuthAuthorizationCodeFlow(
  auth: OAuthCredentials,
): Promise<OAuthTokenResult> {
  const clientId = auth.clientId.trim();
  const clientSecret = auth.clientSecret;
  const redirectUri = (auth.redirectUri || defaultRedirectUri()).trim();

  if (!clientId) {
    throw new Error("OAuth 2.0 requires a Client ID.");
  }
  if (!clientSecret) {
    throw new Error("OAuth 2.0 requires a Client secret.");
  }

  const state = createOAuthState();
  const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state });

  const popup = window.open(
    authorizeUrl,
    "box-cmis-lab-oauth",
    "popup=yes,width=560,height=720",
  );
  if (!popup) {
    throw new Error(
      "Could not open the Box authorization dialog. Allow popups for this site and try again.",
    );
  }

  const code = await waitForAuthorizationCode(popup, state);
  return exchangeAuthorizationCode({
    clientId,
    clientSecret,
    code,
    redirectUri,
  });
}

function waitForAuthorizationCode(
  popup: Window,
  expectedState: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedPoll);
    };

    const settle = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      fn();
    };

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as OAuthCallbackMessage | null;
      if (!data || data.type !== OAUTH_MESSAGE_TYPE) {
        return;
      }
      if (data.state !== expectedState) {
        settle(() => reject(new Error("OAuth state mismatch. Try connecting again.")));
        return;
      }
      if (data.error) {
        settle(() =>
          reject(
            new Error(
              data.errorDescription || data.error || "Box authorization was denied.",
            ),
          ),
        );
        return;
      }
      if (!data.code) {
        settle(() => reject(new Error("Box authorization did not return a code.")));
        return;
      }
      settle(() => resolve(data.code!));
    };

    window.addEventListener("message", onMessage);

    const closedPoll = window.setInterval(() => {
      if (popup.closed) {
        settle(() =>
          reject(new Error("Box authorization dialog was closed before completing.")),
        );
      }
    }, 400);
  });
}
