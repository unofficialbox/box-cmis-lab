import type { BoxSegmentedControlElement } from "@unofficialbox/box-open-elements/components/actions/segmented-control";
import type { BoxDropZoneElement } from "@unofficialbox/box-open-elements/components/files/drop-zone";
import type { BoxSelectElement } from "@unofficialbox/box-open-elements/components/forms/select";
import type { BoxSwitchElement } from "@unofficialbox/box-open-elements/components/forms/switch";
import type { BoxTextAreaElement } from "@unofficialbox/box-open-elements/components/forms/text-area";
import type { BoxTextFieldElement } from "@unofficialbox/box-open-elements/components/forms/text-field";
import type { BoxDialogElement } from "@unofficialbox/box-open-elements/components/overlays/dialog";
import { fetchCurrentBoxUser, formatBoxUser, type BoxUser } from "../auth/box-user.js";
import { ensureValidOAuthCredentials } from "../auth/ensure-oauth.js";
import { defaultRedirectUri } from "../auth/oauth.js";
import { maskSecretField } from "../auth/secret-field.js";
import {
  beautifyJson,
  emptyAuth,
  jwtCredentialsFromConfigJson,
  type AuthCredentials,
  type AuthMode,
  type BoxSubjectType,
  type OAuthCredentials,
} from "../auth/types.js";
import { fetchServiceDocument } from "../cmis/client.js";
import type { CmisServiceDocument } from "../cmis/types.js";
import { session } from "../session/store.js";
import { connectAndOpenRoot } from "./actions.js";

export interface OpenConnectDialogOptions {
  /** When true, connect adds/switches an account instead of closing an already-connected session. */
  addAccount?: boolean;
}

export function createConnectDialog(): BoxDialogElement {
  const dialog = document.createElement("box-dialog") as BoxDialogElement;
  dialog.heading = "Connect to CMIS";
  dialog.description =
    "Browser Binding only. Choose a Box auth mode, then load repositories from the service URL.";
  dialog.confirmLabel = "Connect";

  dialog.innerHTML = `
    <div class="connect-form">
      <box-text-field id="connect-url" label="Service URL"></box-text-field>
      <box-segmented-control id="connect-auth-mode" label="Box authentication"></box-segmented-control>

      <div id="auth-oauth" class="connect-auth-panel" hidden>
        <div class="connect-auth">
          <box-text-field id="oauth-client-id" label="Client ID"></box-text-field>
          <box-text-field id="oauth-client-secret" label="Client secret"></box-text-field>
        </div>
        <box-text-field id="oauth-redirect-uri" label="Redirect URI"></box-text-field>
        <p class="lab-user" id="oauth-user" hidden></p>
      </div>

      <div id="auth-ccg" class="connect-auth-panel" hidden>
        <div class="connect-auth">
          <box-text-field id="ccg-client-id" label="Client ID"></box-text-field>
          <box-text-field id="ccg-client-secret" label="Client secret"></box-text-field>
        </div>
        <div class="connect-auth">
          <box-select id="ccg-subject-type" label="Box Subject Type"></box-select>
          <box-text-field id="ccg-subject-id" label="Box Subject Id"></box-text-field>
        </div>
      </div>

      <div id="auth-jwt" class="connect-auth-panel" hidden>
        <box-drop-zone
          id="jwt-config-file"
          label="JWT config file"
          message="Drop a Box JWT .json here, or click to browse."
        ></box-drop-zone>
        <box-text-area id="jwt-config-json" label="JWT config JSON" rows="12"></box-text-area>
      </div>

      <div class="connect-toolbar">
        <box-button id="connect-load" label="Load repositories"></box-button>
        <box-switch id="connect-succinct" label="Succinct JSON"></box-switch>
      </div>
      <span class="lab-muted" id="connect-hint"></span>
      <box-select id="connect-repo" label="Repository"></box-select>
      <p class="lab-error" id="connect-error" hidden></p>
    </div>
  `;

  const urlField = dialog.querySelector("#connect-url") as BoxTextFieldElement;
  const authModeControl = dialog.querySelector(
    "#connect-auth-mode",
  ) as BoxSegmentedControlElement;
  const succinctSwitch = dialog.querySelector("#connect-succinct") as BoxSwitchElement;
  const repoSelect = dialog.querySelector("#connect-repo") as BoxSelectElement;
  const hint = dialog.querySelector("#connect-hint") as HTMLElement;
  const errorEl = dialog.querySelector("#connect-error") as HTMLElement;
  const loadBtn = dialog.querySelector("#connect-load") as HTMLElement;

  const oauthPanel = dialog.querySelector("#auth-oauth") as HTMLElement;
  const ccgPanel = dialog.querySelector("#auth-ccg") as HTMLElement;
  const jwtPanel = dialog.querySelector("#auth-jwt") as HTMLElement;
  const oauthUserEl = dialog.querySelector("#oauth-user") as HTMLElement;

  const oauthClientId = dialog.querySelector("#oauth-client-id") as BoxTextFieldElement;
  const oauthClientSecret = dialog.querySelector(
    "#oauth-client-secret",
  ) as BoxTextFieldElement;
  const oauthRedirectUri = dialog.querySelector(
    "#oauth-redirect-uri",
  ) as BoxTextFieldElement;

  const ccgClientId = dialog.querySelector("#ccg-client-id") as BoxTextFieldElement;
  const ccgClientSecret = dialog.querySelector("#ccg-client-secret") as BoxTextFieldElement;
  const ccgSubjectType = dialog.querySelector("#ccg-subject-type") as BoxSelectElement;
  const ccgSubjectId = dialog.querySelector("#ccg-subject-id") as BoxTextFieldElement;

  const jwtConfigJson = dialog.querySelector("#jwt-config-json") as BoxTextAreaElement;
  const jwtConfigFile = dialog.querySelector("#jwt-config-file") as BoxDropZoneElement;
  const jwtDropMessageDefault = "Drop a Box JWT .json here, or click to browse.";

  configureJwtDropZone(jwtConfigFile);

  maskSecretField(oauthClientSecret);
  maskSecretField(ccgClientSecret);

  authModeControl.options = [
    { label: "OAuth 2.0", value: "oauth" },
    { label: "CCG", value: "ccg" },
    { label: "JWT", value: "jwt" },
  ];

  ccgSubjectType.options = [
    { label: "enterprise", value: "enterprise" },
    { label: "user", value: "user" },
  ];
  ccgSubjectType.value = "enterprise";

  const drafts: Record<AuthMode, AuthCredentials> = {
    oauth: emptyAuth("oauth"),
    ccg: emptyAuth("ccg"),
    jwt: emptyAuth("jwt"),
  };
  let activeMode: AuthMode = "oauth";
  let connectInFlight = false;
  let dismissRequested = false;
  let addAccountMode = false;
  let pendingBoxUser: BoxUser | null = null;

  const readAuthFromForm = (mode: AuthMode = activeMode): AuthCredentials => {
    switch (mode) {
      case "oauth": {
        const previous = drafts.oauth as OAuthCredentials;
        return {
          mode: "oauth",
          clientId: oauthClientId.value.trim(),
          clientSecret: oauthClientSecret.value,
          redirectUri: oauthRedirectUri.value.trim() || defaultRedirectUri(),
          accessToken: previous.accessToken,
          refreshToken: previous.refreshToken,
        };
      }
      case "ccg":
        return {
          mode: "ccg",
          clientId: ccgClientId.value.trim(),
          clientSecret: ccgClientSecret.value,
          boxSubjectType: parseBoxSubjectType(ccgSubjectType.value),
          boxSubjectId: ccgSubjectId.value.trim(),
        };
      case "jwt":
        return jwtCredentialsFromConfigJson(jwtConfigJson.value);
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  };

  const updateOAuthUser = (): void => {
    const user = pendingBoxUser;
    const auth = drafts.oauth as OAuthCredentials;
    if (user && auth.accessToken) {
      oauthUserEl.hidden = false;
      oauthUserEl.textContent = `Signed in as ${formatBoxUser(user)}`;
      return;
    }
    oauthUserEl.hidden = true;
    oauthUserEl.textContent = "";
  };

  const writeAuthToForm = (auth: AuthCredentials): void => {
    drafts[auth.mode] = auth;
    activeMode = auth.mode;
    authModeControl.value = auth.mode;
    switch (auth.mode) {
      case "oauth":
        oauthClientId.value = auth.clientId;
        oauthClientSecret.value = auth.clientSecret;
        oauthRedirectUri.value = auth.redirectUri || defaultRedirectUri();
        updateOAuthUser();
        break;
      case "ccg":
        ccgClientId.value = auth.clientId;
        ccgClientSecret.value = auth.clientSecret;
        ccgSubjectType.value = auth.boxSubjectType;
        ccgSubjectId.value = auth.boxSubjectId;
        break;
      case "jwt":
        jwtConfigJson.value = auth.configJson
          ? beautifyJson(auth.configJson)
          : "";
        jwtConfigFile.message = jwtDropMessageDefault;
        break;
      default: {
        const _exhaustive: never = auth;
        void _exhaustive;
        break;
      }
    }
  };

  const showAuthPanel = (mode: AuthMode): void => {
    oauthPanel.hidden = mode !== "oauth";
    ccgPanel.hidden = mode !== "ccg";
    jwtPanel.hidden = mode !== "jwt";
    if (mode === "jwt") {
      configureJwtDropZone(jwtConfigFile);
    }
  };

  const syncFieldsFromState = (): void => {
    const state = session.getState();
    urlField.value = state.serviceUrl;
    succinctSwitch.checked = state.succinct;
    drafts[state.auth.mode] = state.auth;
    writeAuthToForm(state.auth);
    showAuthPanel(state.auth.mode);

    const options = Object.entries(state.repositories).map(([id, info]) => ({
      value: id,
      label: `${info.repositoryName ?? id} (${id})`,
    }));
    repoSelect.options = options.length
      ? options
      : [{ value: "", label: "Load repositories first" }];
    repoSelect.value = state.repositoryId;
    repoSelect.disabled = options.length === 0;
    hint.textContent = options.length
      ? `${options.length} repositor${options.length === 1 ? "y" : "ies"} loaded`
      : "";
  };

  const applyFormToSession = (): void => {
    const auth = readAuthFromForm();
    drafts[auth.mode] = auth;
    session.setConnectionFields({
      serviceUrl: urlField.value.trim() || "http://127.0.0.1:8080/cmis",
      succinct: succinctSwitch.checked,
      auth,
    });
  };

  const setError = (message: string | null): void => {
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = "";
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  };

  const ensureOAuthAuthorized = async (): Promise<OAuthCredentials> => {
    applyFormToSession();
    const auth = session.getState().auth;
    if (auth.mode !== "oauth") {
      throw new Error("OAuth authorization requested for a non-OAuth mode.");
    }

    hint.textContent = auth.accessToken
      ? "Reusing Box access token…"
      : "Waiting for Box authorization…";
    const authorized = await ensureValidOAuthCredentials(auth);
    drafts.oauth = authorized;
    session.setConnectionFields({ auth: authorized });

    if (!pendingBoxUser && authorized.accessToken) {
      pendingBoxUser = await fetchCurrentBoxUser(authorized.accessToken);
    }
    updateOAuthUser();
    return authorized;
  };

  authModeControl.addEventListener("value-changed", ((
    event: CustomEvent<{ value: string }>,
  ) => {
    const mode = event.detail.value as AuthMode;
    drafts[activeMode] = readAuthFromForm(activeMode);
    const next = drafts[mode] ?? emptyAuth(mode);
    if (!next.clientId && drafts[activeMode].clientId) {
      next.clientId = drafts[activeMode].clientId;
    }
    writeAuthToForm(next);
    showAuthPanel(mode);
  }) as EventListener);

  jwtConfigFile.addEventListener("files-selected", ((
    event: CustomEvent<{ files: File[] }>,
  ) => {
    const file = event.detail.files[0];
    if (!file) {
      return;
    }
    void (async () => {
      try {
        const text = await file.text();
        const beautified = beautifyJson(text);
        // Validate JSON before populating.
        JSON.parse(beautified);
        jwtConfigJson.value = beautified;
        drafts.jwt = jwtCredentialsFromConfigJson(beautified);
        jwtConfigFile.message = `Loaded ${file.name}`;
        setError(null);
      } catch (error) {
        jwtConfigFile.message = jwtDropMessageDefault;
        setError(
          error instanceof Error
            ? `Could not load JWT config: ${error.message}`
            : "Could not load JWT config file.",
        );
      }
    })();
  }) as EventListener);

  const keepDialogOpen = (): void => {
    queueMicrotask(() => {
      if (!dismissRequested) {
        dialog.open = true;
      }
    });
  };

  loadBtn.addEventListener("click", async () => {
    setError(null);
    if (addAccountMode) {
      session.preserveActiveAccount();
    }
    applyFormToSession();
    hint.textContent = "Loading…";
    try {
      if (session.getState().auth.mode === "oauth") {
        await ensureOAuthAuthorized();
      }
      const doc = (await fetchServiceDocument(
        session.getState().serviceUrl,
        session.traffic,
        session.getState().auth,
      )) as CmisServiceDocument;
      session.setRepositories(doc);
      const options = Object.entries(doc).map(([id, info]) => ({
        value: id,
        label: `${info.repositoryName ?? id} (${id})`,
      }));
      repoSelect.options = options.length
        ? options
        : [{ value: "", label: "Load repositories first" }];
      repoSelect.value = session.getState().repositoryId;
      repoSelect.disabled = options.length === 0;
      hint.textContent = `${Object.keys(doc).length} repositor${
        Object.keys(doc).length === 1 ? "y" : "ies"
      } loaded`;
    } catch (error) {
      hint.textContent = "";
      setError(error instanceof Error ? error.message : String(error));
    }
  });

  dialog.addEventListener("confirm", () => {
    if (connectInFlight) {
      keepDialogOpen();
      return;
    }

    dismissRequested = false;
    connectInFlight = true;
    keepDialogOpen();

    void (async () => {
      setError(null);
      if (addAccountMode) {
        session.preserveActiveAccount();
      }
      applyFormToSession();
      try {
        if (session.getState().auth.mode === "oauth") {
          await ensureOAuthAuthorized();
          if (pendingBoxUser) {
            session.setBoxUser(pendingBoxUser);
          }
        }
        if (dismissRequested) {
          return;
        }
        if (Object.keys(session.getState().repositories).length === 0) {
          hint.textContent = "Loading repositories…";
          const doc = (await fetchServiceDocument(
            session.getState().serviceUrl,
            session.traffic,
            session.getState().auth,
          )) as CmisServiceDocument;
          session.setRepositories(doc);
          // Refresh repo select from form session fields without clobbering add-account drafts.
          const options = Object.entries(doc).map(([id, info]) => ({
            value: id,
            label: `${info.repositoryName ?? id} (${id})`,
          }));
          repoSelect.options = options;
          repoSelect.value = session.getState().repositoryId;
          repoSelect.disabled = options.length === 0;
        }
        const repositoryId = repoSelect.value || session.getState().repositoryId;
        if (!repositoryId) {
          throw new Error("Select a repository before connecting.");
        }
        session.patch({ repositoryId });
        hint.textContent = "Opening repository…";
        await connectAndOpenRoot();
        addAccountMode = false;
        if (!dismissRequested) {
          dialog.open = false;
        }
      } catch (error) {
        if (addAccountMode && session.getState().accounts.length > 0) {
          session.restoreActiveAccount();
        }
        if (!dismissRequested) {
          const message = error instanceof Error ? error.message : String(error);
          hint.textContent = "";
          setError(message);
          session.setError(message);
          dialog.open = true;
        }
      } finally {
        connectInFlight = false;
      }
    })();
  });

  dialog.addEventListener("cancel", () => {
    dismissRequested = true;
    if (addAccountMode && session.getState().accounts.length > 0) {
      session.restoreActiveAccount();
    }
    addAccountMode = false;
    dialog.open = false;
  });

  dialog.addEventListener("open-changed", ((event: CustomEvent<{ open: boolean }>) => {
    if (event.detail.open) {
      dismissRequested = false;
      if (!addAccountMode) {
        syncFieldsFromState();
      }
      if (!oauthRedirectUri.value.trim()) {
        oauthRedirectUri.value = defaultRedirectUri();
      }
      dialog.heading = addAccountMode ? "Connect another account" : "Connect to CMIS";
      dialog.confirmLabel = "Connect";
    } else if (addAccountMode) {
      // Restore prior account if the add flow closed without a successful connect.
      if (session.getState().activeAccountId) {
        session.restoreActiveAccount();
      }
      addAccountMode = false;
    }
  }) as EventListener);

  (dialog as BoxDialogElement & { __setAddAccountMode?: (value: boolean) => void }).__setAddAccountMode =
    (value: boolean) => {
      addAccountMode = value;
      if (!value) {
        return;
      }
      session.preserveActiveAccount();
      const oauth = emptyAuth("oauth");
      const current = session.getState().auth;
      if (current.mode === "oauth") {
        oauth.clientId = current.clientId;
        oauth.clientSecret = current.clientSecret;
        oauth.redirectUri = current.redirectUri || defaultRedirectUri();
      } else {
        oauth.clientId = current.clientId;
      }
      drafts.oauth = oauth;
      drafts.ccg = emptyAuth("ccg");
      drafts.jwt = emptyAuth("jwt");
      pendingBoxUser = null;
      urlField.value = session.getState().serviceUrl;
      writeAuthToForm(oauth);
      showAuthPanel("oauth");
      repoSelect.options = [{ value: "", label: "Load repositories first" }];
      repoSelect.value = "";
      repoSelect.disabled = true;
      hint.textContent = "";
      updateOAuthUser();
    };

  syncFieldsFromState();
  if (!oauthRedirectUri.value.trim()) {
    oauthRedirectUri.value = defaultRedirectUri();
  }
  return dialog;
}

export function openConnectDialog(
  dialog: BoxDialogElement,
  options: OpenConnectDialogOptions = {},
): void {
  const errorEl = dialog.querySelector("#connect-error") as HTMLElement | null;
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }
  const jwtDropZone = dialog.querySelector("#jwt-config-file") as BoxDropZoneElement | null;
  if (jwtDropZone) {
    configureJwtDropZone(jwtDropZone);
  }
  const setAddAccountMode = (
    dialog as BoxDialogElement & { __setAddAccountMode?: (value: boolean) => void }
  ).__setAddAccountMode;
  setAddAccountMode?.(Boolean(options.addAccount));
  dialog.heading = options.addAccount ? "Connect another account" : "Connect to CMIS";
  dialog.confirmLabel = "Connect";
  dialog.open = true;
}

function configureJwtDropZone(dropZone: BoxDropZoneElement): void {
  const apply = (): boolean => {
    const input = dropZone.shadowRoot?.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    if (!input) {
      return false;
    }
    input.accept = ".json,application/json";
    input.multiple = false;
    return true;
  };

  if (apply()) {
    return;
  }

  // Drop zone renders its shadow input on first connect.
  requestAnimationFrame(() => {
    if (!apply()) {
      queueMicrotask(apply);
    }
  });
}

function parseBoxSubjectType(value: string | null | undefined): BoxSubjectType {
  return value === "user" ? "user" : "enterprise";
}
