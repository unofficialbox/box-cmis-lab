import {
  authFromStoredPrefs,
  emptyAuth,
  jwtCredentialsFromConfigJson,
  type AuthCredentials,
  type AuthMode,
  type BoxSubjectType,
  type StoredAuthPrefs,
} from "./types.js";

export const DEFAULT_SERVICE_URL = "http://127.0.0.1:8080/cmis";

/** Subset of Vite env keys used to seed the connect form. */
export interface LabEnv {
  VITE_CMIS_SERVICE_URL?: string;
  VITE_CMIS_SUCCINCT?: string;
  VITE_AUTH_MODE?: string;
  VITE_BOX_CLIENT_ID?: string;
  VITE_BOX_CLIENT_SECRET?: string;
  VITE_OAUTH_REDIRECT_URI?: string;
  VITE_BOX_SUBJECT_TYPE?: string;
  VITE_BOX_SUBJECT_ID?: string;
  VITE_JWT_CONFIG_JSON?: string;
}

export interface ConnectionSeed {
  serviceUrl: string;
  succinct: boolean;
  auth: AuthCredentials;
}

export function labEnvFromImportMeta(
  source: ImportMetaEnv | LabEnv = import.meta.env,
): LabEnv {
  return {
    VITE_CMIS_SERVICE_URL: trimEnv(source.VITE_CMIS_SERVICE_URL),
    VITE_CMIS_SUCCINCT: trimEnv(source.VITE_CMIS_SUCCINCT),
    VITE_AUTH_MODE: trimEnv(source.VITE_AUTH_MODE),
    VITE_BOX_CLIENT_ID: trimEnv(source.VITE_BOX_CLIENT_ID),
    VITE_BOX_CLIENT_SECRET: source.VITE_BOX_CLIENT_SECRET ?? "",
    VITE_OAUTH_REDIRECT_URI: trimEnv(source.VITE_OAUTH_REDIRECT_URI),
    VITE_BOX_SUBJECT_TYPE: trimEnv(source.VITE_BOX_SUBJECT_TYPE),
    VITE_BOX_SUBJECT_ID: trimEnv(source.VITE_BOX_SUBJECT_ID),
    VITE_JWT_CONFIG_JSON: source.VITE_JWT_CONFIG_JSON ?? "",
  };
}

export function parseAuthMode(raw: string | undefined): AuthMode | null {
  switch (raw?.trim().toLowerCase()) {
    case "oauth":
    case "oauth2":
    case "oauth_2.0":
      return "oauth";
    case "ccg":
    case "client_credentials":
      return "ccg";
    case "jwt":
      return "jwt";
    default:
      return null;
  }
}

export function parseBoxSubjectType(raw: string | undefined): BoxSubjectType | null {
  switch (raw?.trim().toLowerCase()) {
    case "enterprise":
      return "enterprise";
    case "user":
      return "user";
    default:
      return null;
  }
}

export function parseBool(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no") {
    return false;
  }
  return null;
}

/** Build auth credentials for a mode from Lab env vars. */
export function authFromLabEnv(env: LabEnv, mode: AuthMode = "oauth"): AuthCredentials {
  const clientId = env.VITE_BOX_CLIENT_ID ?? "";
  const clientSecret = env.VITE_BOX_CLIENT_SECRET ?? "";

  switch (mode) {
    case "oauth":
      return {
        ...emptyAuth("oauth"),
        clientId,
        clientSecret,
        redirectUri: env.VITE_OAUTH_REDIRECT_URI ?? "",
      };
    case "ccg":
      return {
        ...emptyAuth("ccg"),
        clientId,
        clientSecret,
        boxSubjectType: parseBoxSubjectType(env.VITE_BOX_SUBJECT_TYPE) ?? "enterprise",
        boxSubjectId: env.VITE_BOX_SUBJECT_ID ?? "",
      };
    case "jwt": {
      const configJson = env.VITE_JWT_CONFIG_JSON?.trim() ?? "";
      if (configJson) {
        return jwtCredentialsFromConfigJson(configJson);
      }
      return {
        ...emptyAuth("jwt"),
        clientId,
        clientSecret,
      };
    }
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Resolve initial connection fields from optional localStorage prefs + .env.
 * Stored non-secret prefs win when present; secrets and blank fields come from env.
 */
export function resolveConnectionSeed(
  stored:
    | {
        serviceUrl?: string;
        succinct?: boolean;
        auth?: StoredAuthPrefs;
      }
    | null
    | undefined,
  env: LabEnv = labEnvFromImportMeta(),
): ConnectionSeed {
  const mode =
    stored?.auth?.authMode ?? parseAuthMode(env.VITE_AUTH_MODE) ?? "oauth";
  const fromPrefs = authFromStoredPrefs(
    stored?.auth ? { ...stored.auth, authMode: mode } : { authMode: mode },
  );
  const fromEnv = authFromLabEnv(env, mode);
  const auth = overlayAuthFromEnv(fromPrefs, fromEnv);

  return {
    serviceUrl: stored?.serviceUrl?.trim() || env.VITE_CMIS_SERVICE_URL || DEFAULT_SERVICE_URL,
    succinct: stored?.succinct ?? parseBool(env.VITE_CMIS_SUCCINCT) ?? false,
    auth,
  };
}

/** Fill blanks from env; secrets always prefer a non-empty env value. */
export function overlayAuthFromEnv(
  base: AuthCredentials,
  fromEnv: AuthCredentials,
): AuthCredentials {
  if (base.mode !== fromEnv.mode) {
    return base;
  }

  switch (base.mode) {
    case "oauth": {
      if (fromEnv.mode !== "oauth") {
        return base;
      }
      return {
        ...base,
        clientId: base.clientId || fromEnv.clientId,
        clientSecret: fromEnv.clientSecret || base.clientSecret,
        redirectUri: base.redirectUri || fromEnv.redirectUri,
      };
    }
    case "ccg": {
      if (fromEnv.mode !== "ccg") {
        return base;
      }
      return {
        ...base,
        clientId: base.clientId || fromEnv.clientId,
        clientSecret: fromEnv.clientSecret || base.clientSecret,
        boxSubjectType: base.boxSubjectId
          ? base.boxSubjectType
          : fromEnv.boxSubjectType || base.boxSubjectType,
        boxSubjectId: base.boxSubjectId || fromEnv.boxSubjectId,
      };
    }
    case "jwt": {
      if (fromEnv.mode !== "jwt") {
        return base;
      }
      if (fromEnv.configJson.trim()) {
        return {
          ...fromEnv,
          // Keep any stored subject ids if the JSON omitted them.
          enterpriseId: fromEnv.enterpriseId || base.enterpriseId,
          userId: fromEnv.userId || base.userId,
        };
      }
      return {
        ...base,
        clientId: base.clientId || fromEnv.clientId,
        clientSecret: fromEnv.clientSecret || base.clientSecret,
        jwtKeyId: base.jwtKeyId || fromEnv.jwtKeyId,
        privateKey: fromEnv.privateKey || base.privateKey,
        privateKeyPassphrase: fromEnv.privateKeyPassphrase || base.privateKeyPassphrase,
        enterpriseId: base.enterpriseId || fromEnv.enterpriseId,
        userId: base.userId || fromEnv.userId,
        configJson: base.configJson || fromEnv.configJson,
      };
    }
    default: {
      const _exhaustive: never = base;
      return _exhaustive;
    }
  }
}

function trimEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}
