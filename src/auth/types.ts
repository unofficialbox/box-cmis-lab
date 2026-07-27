export type AuthMode = "oauth" | "ccg" | "jwt";

export type BoxSubjectType = "enterprise" | "user";

export interface OAuthCredentials {
  mode: "oauth";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Filled by the OAuth authorization flow; not shown in the connect form. */
  accessToken: string;
  /** Filled by the OAuth authorization flow; not shown in the connect form. */
  refreshToken: string;
}

export interface CcgCredentials {
  mode: "ccg";
  clientId: string;
  clientSecret: string;
  boxSubjectType: BoxSubjectType;
  boxSubjectId: string;
}

export interface JwtCredentials {
  mode: "jwt";
  clientId: string;
  clientSecret: string;
  jwtKeyId: string;
  privateKey: string;
  privateKeyPassphrase: string;
  enterpriseId: string;
  userId: string;
  configJson: string;
}

export type AuthCredentials = OAuthCredentials | CcgCredentials | JwtCredentials;

export interface StoredAuthPrefs {
  authMode: AuthMode;
  clientId?: string;
  redirectUri?: string;
  /** @deprecated Prefer boxSubjectType/boxSubjectId for CCG. */
  enterpriseId?: string;
  /** @deprecated Prefer boxSubjectType/boxSubjectId for CCG. */
  userId?: string;
  boxSubjectType?: BoxSubjectType;
  boxSubjectId?: string;
  jwtKeyId?: string;
}

export function emptyAuth(mode: "oauth"): OAuthCredentials;
export function emptyAuth(mode: "ccg"): CcgCredentials;
export function emptyAuth(mode: "jwt"): JwtCredentials;
export function emptyAuth(mode?: AuthMode): AuthCredentials;
export function emptyAuth(mode: AuthMode = "oauth"): AuthCredentials {
  switch (mode) {
    case "oauth":
      return {
        mode: "oauth",
        clientId: "",
        clientSecret: "",
        redirectUri: "",
        accessToken: "",
        refreshToken: "",
      };
    case "ccg":
      return {
        mode: "ccg",
        clientId: "",
        clientSecret: "",
        boxSubjectType: "enterprise",
        boxSubjectId: "",
      };
    case "jwt":
      return {
        mode: "jwt",
        clientId: "",
        clientSecret: "",
        jwtKeyId: "",
        privateKey: "",
        privateKeyPassphrase: "",
        enterpriseId: "",
        userId: "",
        configJson: "",
      };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Build an Authorization header for CMIS Browser Binding requests when possible. */
export function authorizationHeader(auth: AuthCredentials): string | undefined {
  if (auth.mode === "oauth") {
    const token = auth.accessToken.trim();
    return token ? `Bearer ${token}` : undefined;
  }
  // CCG/JWT token exchange is server-side on the Box CMIS Connector today.
  return undefined;
}

export function authModeLabel(mode: AuthMode): string {
  switch (mode) {
    case "oauth":
      return "OAuth 2.0";
    case "ccg":
      return "Client Credentials Grant";
    case "jwt":
      return "JWT";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function toStoredAuthPrefs(auth: AuthCredentials): StoredAuthPrefs {
  switch (auth.mode) {
    case "oauth":
      return {
        authMode: "oauth",
        clientId: auth.clientId || undefined,
        redirectUri: auth.redirectUri || undefined,
      };
    case "ccg":
      return {
        authMode: "ccg",
        clientId: auth.clientId || undefined,
        boxSubjectType: auth.boxSubjectType,
        boxSubjectId: auth.boxSubjectId || undefined,
      };
    case "jwt":
      return {
        authMode: "jwt",
        clientId: auth.clientId || undefined,
        enterpriseId: auth.enterpriseId || undefined,
        userId: auth.userId || undefined,
        jwtKeyId: auth.jwtKeyId || undefined,
      };
    default: {
      const _exhaustive: never = auth;
      return _exhaustive;
    }
  }
}

export function authFromStoredPrefs(prefs: StoredAuthPrefs | undefined): AuthCredentials {
  const mode = prefs?.authMode ?? "oauth";
  const base = emptyAuth(mode);
  switch (base.mode) {
    case "oauth":
      return {
        ...base,
        clientId: prefs?.clientId ?? "",
        redirectUri: prefs?.redirectUri ?? "",
      };
    case "ccg":
      return {
        ...base,
        clientId: prefs?.clientId ?? "",
        ...ccgSubjectFromPrefs(prefs),
      };
    case "jwt":
      return {
        ...base,
        clientId: prefs?.clientId ?? "",
        enterpriseId: prefs?.enterpriseId ?? "",
        userId: prefs?.userId ?? "",
        jwtKeyId: prefs?.jwtKeyId ?? "",
      };
    default: {
      const _exhaustive: never = base;
      return _exhaustive;
    }
  }
}

/** Parse a Box developer JWT config JSON blob into Lab JWT credentials. */
export function jwtCredentialsFromConfigJson(configJson: string): JwtCredentials {
  const base = emptyAuth("jwt");
  const trimmed = configJson.trim();
  if (!trimmed) {
    return base;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ...base, configJson: trimmed };
  }

  const root = asRecord(parsed);
  const boxAppSettings = asRecord(root?.boxAppSettings);
  const appAuth = asRecord(boxAppSettings?.appAuth);
  const beautified = beautifyJson(trimmed);

  return {
    mode: "jwt",
    clientId: stringField(boxAppSettings?.clientID ?? boxAppSettings?.clientId),
    clientSecret: stringField(boxAppSettings?.clientSecret),
    jwtKeyId: stringField(appAuth?.publicKeyID ?? appAuth?.publicKeyId),
    privateKey: stringField(appAuth?.privateKey),
    privateKeyPassphrase: stringField(appAuth?.passphrase),
    enterpriseId: stringField(root?.enterpriseID ?? root?.enterpriseId),
    userId: stringField(root?.userID ?? root?.userId),
    configJson: beautified,
  };
}

export function beautifyJson(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return `${JSON.stringify(JSON.parse(trimmed), null, 2)}\n`;
  } catch {
    return trimmed;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Enterprise id when CCG is scoped to an enterprise subject, else JWT enterprise id. */
export function enterpriseIdFromAuth(auth: AuthCredentials): string | null {
  switch (auth.mode) {
    case "ccg":
      return auth.boxSubjectType === "enterprise" && auth.boxSubjectId.trim()
        ? auth.boxSubjectId.trim()
        : null;
    case "jwt":
      return auth.enterpriseId.trim() || null;
    case "oauth":
      return null;
    default: {
      const _exhaustive: never = auth;
      return _exhaustive;
    }
  }
}

function ccgSubjectFromPrefs(prefs: StoredAuthPrefs | undefined): {
  boxSubjectType: BoxSubjectType;
  boxSubjectId: string;
} {
  if (prefs?.boxSubjectType === "enterprise" || prefs?.boxSubjectType === "user") {
    return {
      boxSubjectType: prefs.boxSubjectType,
      boxSubjectId: prefs.boxSubjectId ?? "",
    };
  }
  // Migrate legacy CCG prefs that stored enterpriseId / userId separately.
  if (prefs?.userId) {
    return { boxSubjectType: "user", boxSubjectId: prefs.userId };
  }
  if (prefs?.enterpriseId) {
    return { boxSubjectType: "enterprise", boxSubjectId: prefs.enterpriseId };
  }
  return { boxSubjectType: "enterprise", boxSubjectId: "" };
}
