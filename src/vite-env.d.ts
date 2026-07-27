/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CMIS_SERVICE_URL?: string;
  readonly VITE_CMIS_SUCCINCT?: string;
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_BOX_CLIENT_ID?: string;
  readonly VITE_BOX_CLIENT_SECRET?: string;
  readonly VITE_OAUTH_REDIRECT_URI?: string;
  readonly VITE_BOX_SUBJECT_TYPE?: string;
  readonly VITE_BOX_SUBJECT_ID?: string;
  /** Box JWT developer config JSON (beautified on load). Prefer VITE_JWT_CONFIG_FILE in .env. */
  readonly VITE_JWT_CONFIG_JSON?: string;
  /** Path relative to project root; Vite injects file contents into VITE_JWT_CONFIG_JSON. */
  readonly VITE_JWT_CONFIG_FILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
