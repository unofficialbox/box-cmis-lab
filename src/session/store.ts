import type { BoxUser } from "../auth/box-user.js";
import { resolveConnectionSeed } from "../auth/env-defaults.js";
import { clearOAuthSession, oauthCredentialsFromSession, persistOAuthCredentials } from "../auth/oauth-session.js";
import {
  toStoredAuthPrefs,
  type AuthCredentials,
  type StoredAuthPrefs,
} from "../auth/types.js";
import { CmisClient } from "../cmis/client.js";
import {
  getBaseTypeId,
  getObjectId,
  getObjectName,
  getPath,
  supportsQuery,
} from "../cmis/properties.js";
import type {
  CmisChildrenResponse,
  CmisObject,
  CmisQueryResponse,
  CmisRepositoryInfo,
  CmisServiceDocument,
} from "../cmis/types.js";
import { TrafficLog } from "../inspector/traffic-log.js";

const STORAGE_KEY = "box-cmis-lab.connection";

export interface StoredConnection {
  serviceUrl: string;
  succinct: boolean;
  repositoryId?: string;
  auth?: StoredAuthPrefs;
}

export interface ConnectedAccount {
  id: string;
  label: string;
  boxUser: BoxUser | null;
  serviceUrl: string;
  succinct: boolean;
  auth: AuthCredentials;
  repositoryId: string;
  repositories: CmisServiceDocument;
  repositoryInfo: CmisRepositoryInfo | null;
  currentFolder: CmisObject | null;
  currentObject: CmisObject | null;
  currentChildren: CmisChildrenResponse | null;
  childrenPage: number;
  childrenPageSize: number;
}

export type RightPane = "repo-info" | "details";

export interface SessionState {
  connected: boolean;
  serviceUrl: string;
  succinct: boolean;
  auth: AuthCredentials;
  boxUser: BoxUser | null;
  repositories: CmisServiceDocument;
  repositoryId: string;
  repositoryInfo: CmisRepositoryInfo | null;
  currentFolder: CmisObject | null;
  currentChildren: CmisChildrenResponse | null;
  childrenPage: number;
  childrenPageSize: number;
  currentObject: CmisObject | null;
  queryResults: CmisQueryResponse | null;
  loading: boolean;
  error: string | null;
  view: "browse" | "query";
  accounts: ConnectedAccount[];
  activeAccountId: string | null;
  rightPane: RightPane;
  /** Bumps when the active account identity changes so tree panels remount. */
  accountEpoch: number;
}

export interface ActivateAccountInput {
  serviceUrl: string;
  succinct: boolean;
  auth: AuthCredentials;
  boxUser: BoxUser | null;
  repositoryId: string;
  repositories: CmisServiceDocument;
  repositoryInfo: CmisRepositoryInfo;
  currentFolder: CmisObject;
  currentObject?: CmisObject | null;
}

type Listener = () => void;

export function accountIdFor(input: {
  boxUser: BoxUser | null;
  auth: AuthCredentials;
  repositoryId: string;
  serviceUrl: string;
}): string {
  if (input.boxUser?.id) {
    return `${input.boxUser.id}@${input.repositoryId}`;
  }
  return `${input.auth.mode}:${input.repositoryId}:${input.serviceUrl}`;
}

export function accountLabelFor(input: {
  boxUser: BoxUser | null;
  auth: AuthCredentials;
  repositoryInfo: CmisRepositoryInfo | null;
  repositoryId: string;
}): string {
  const user =
    input.boxUser?.login ||
    input.boxUser?.name ||
    (input.auth.mode === "ccg"
      ? input.auth.boxSubjectId || input.auth.boxSubjectType
      : input.auth.mode === "jwt"
        ? input.auth.userId || input.auth.enterpriseId || input.auth.mode.toUpperCase()
        : input.auth.mode.toUpperCase());
  const repo = input.repositoryInfo?.repositoryName || input.repositoryId || "CMIS";
  return `${user} · ${repo}`;
}

const initialConnection = resolveConnectionSeed(loadStored());
const initialAuth =
  initialConnection.auth.mode === "oauth"
    ? oauthCredentialsFromSession(initialConnection.auth)
    : initialConnection.auth;

export class SessionStore {
  readonly traffic = new TrafficLog();
  private client: CmisClient | null = null;
  private listeners = new Set<Listener>();
  private state: SessionState = {
    connected: false,
    serviceUrl: initialConnection.serviceUrl,
    succinct: initialConnection.succinct,
    auth: initialAuth,
    boxUser: null,
    repositories: {},
    repositoryId: loadStored()?.repositoryId ?? "",
    repositoryInfo: null,
    currentFolder: null,
    currentChildren: null,
    childrenPage: 1,
    childrenPageSize: 50,
    currentObject: null,
    queryResults: null,
    loading: false,
    error: null,
    view: "browse",
    accounts: [],
    activeAccountId: null,
    rightPane: "repo-info",
    accountEpoch: 0,
  };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): SessionState {
    return this.state;
  }

  getClient(): CmisClient | null {
    return this.client;
  }

  canQuery(): boolean {
    return supportsQuery(this.state.repositoryInfo?.capabilities?.capabilityQuery);
  }

  patch(partial: Partial<SessionState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  setView(view: SessionState["view"]): void {
    this.patch({ view, error: null });
  }

  setRightPane(rightPane: RightPane): void {
    this.patch({ rightPane, error: null });
  }

  setConnectionFields(fields: {
    serviceUrl?: string;
    succinct?: boolean;
    auth?: AuthCredentials;
  }): void {
    this.patch({
      serviceUrl: fields.serviceUrl ?? this.state.serviceUrl,
      succinct: fields.succinct ?? this.state.succinct,
      auth: fields.auth ?? this.state.auth,
    });
  }

  setRepositories(repositories: CmisServiceDocument, repositoryId?: string): void {
    const ids = Object.keys(repositories);
    const selected =
      repositoryId && repositories[repositoryId]
        ? repositoryId
        : ids[0] ?? "";
    this.patch({ repositories, repositoryId: selected, error: null });
  }

  /**
   * Creates the CMIS client for the form fields currently in session state.
   * Prefer {@link addOrActivateAccount} after repository info is loaded.
   */
  async connect(): Promise<void> {
    const { serviceUrl, repositoryId, succinct, auth } = this.state;
    if (!repositoryId) {
      throw new Error("Select a repository before connecting.");
    }

    this.client = new CmisClient(
      {
        serviceUrl,
        repositoryId,
        succinct,
        auth,
      },
      this.traffic,
    );

    saveStored({
      serviceUrl,
      succinct,
      repositoryId,
      auth: toStoredAuthPrefs(auth),
    });

    if (auth.mode === "oauth" && auth.accessToken) {
      persistOAuthCredentials(auth);
    }

    this.patch({
      connected: true,
      loading: true,
      error: null,
      view: "browse",
      rightPane: "repo-info",
    });
  }

  /** Snapshot the active projection into `accounts` before mutating form credentials. */
  preserveActiveAccount(): void {
    if (!this.state.activeAccountId || !this.state.connected) {
      return;
    }
    this.state = {
      ...this.state,
      accounts: this.snapshotActiveIntoAccounts(),
    };
  }

  /** Re-apply the active account from `accounts` after a cancelled add-account flow. */
  restoreActiveAccount(): void {
    const activeId = this.state.activeAccountId;
    if (!activeId) {
      return;
    }
    const account = this.state.accounts.find((entry) => entry.id === activeId);
    if (!account) {
      return;
    }
    this.applyAccount(account, this.state.accounts, {
      bumpEpoch: false,
      rightPane: this.state.rightPane,
    });
  }

  addOrActivateAccount(input: ActivateAccountInput): void {
    const id = accountIdFor(input);
    const label = accountLabelFor(input);
    const account: ConnectedAccount = {
      id,
      label,
      boxUser: input.boxUser,
      serviceUrl: input.serviceUrl,
      succinct: input.succinct,
      auth: input.auth,
      repositoryId: input.repositoryId,
      repositories: input.repositories,
      repositoryInfo: input.repositoryInfo,
      currentFolder: input.currentFolder,
      currentObject: input.currentObject ?? input.currentFolder,
      currentChildren: null,
      childrenPage: 1,
      childrenPageSize: this.state.childrenPageSize,
    };

    // Caller should preserveActiveAccount() before overwriting projection fields.
    const accounts = [
      ...this.state.accounts.filter((entry) => entry.id !== id),
      account,
    ];

    this.applyAccount(account, accounts, { bumpEpoch: true });
  }

  switchAccount(accountId: string): void {
    if (accountId === this.state.activeAccountId) {
      return;
    }
    const target = this.state.accounts.find((account) => account.id === accountId);
    if (!target) {
      throw new Error(`Unknown account: ${accountId}`);
    }
    const accounts = this.snapshotActiveIntoAccounts();
    const next = accounts.find((account) => account.id === accountId) ?? target;
    this.applyAccount(next, accounts, { bumpEpoch: true, rightPane: "repo-info" });
  }

  /** Disconnect the active account; switch to another if any remain. */
  disconnectActive(): void {
    const activeId = this.state.activeAccountId;
    if (!activeId) {
      this.disconnectAll();
      return;
    }
    const remaining = this.state.accounts.filter((account) => account.id !== activeId);
    if (remaining.length === 0) {
      this.disconnectAll();
      return;
    }
    this.applyAccount(remaining[0]!, remaining, {
      bumpEpoch: true,
      rightPane: "repo-info",
    });
  }

  disconnectAll(): void {
    this.client = null;
    clearOAuthSession();
    this.state = {
      ...this.state,
      connected: false,
      accounts: [],
      activeAccountId: null,
      repositoryInfo: null,
      currentFolder: null,
      currentChildren: null,
      childrenPage: 1,
      currentObject: null,
      queryResults: null,
      loading: false,
      error: null,
      boxUser: null,
      rightPane: "repo-info",
      accountEpoch: this.state.accountEpoch + 1,
    };
    this.notify();
  }

  /** @deprecated Prefer {@link disconnectActive} from the account menu. */
  disconnect(): void {
    this.disconnectActive();
  }

  setBoxUser(boxUser: BoxUser | null): void {
    this.patch({ boxUser });
  }

  setFolder(
    folder: CmisObject,
    children: CmisChildrenResponse,
    page = 1,
  ): void {
    this.patch({
      currentFolder: folder,
      currentChildren: children,
      childrenPage: page,
      currentObject: folder,
      loading: false,
      error: null,
    });
  }

  setChildrenPage(page: number): void {
    this.patch({ childrenPage: Math.max(1, page) });
  }

  setObject(object: CmisObject): void {
    this.patch({
      currentObject: object,
      rightPane: "details",
      loading: false,
      error: null,
    });
  }

  setQueryResults(results: CmisQueryResponse): void {
    this.patch({ queryResults: results, loading: false, error: null });
  }

  setRepositoryInfo(info: CmisRepositoryInfo): void {
    this.patch({ repositoryInfo: info });
  }

  setError(error: string): void {
    this.patch({ error, loading: false });
  }

  setLoading(loading: boolean): void {
    this.patch({ loading });
  }

  describeSelection(): string {
    const object = this.state.currentObject;
    if (!object) {
      return "No object selected";
    }
    return `${getObjectName(object)} (${getBaseTypeId(object) || "object"} · ${getObjectId(object)})`;
  }

  describeFolderPath(): string {
    return getPath(this.state.currentFolder) || "/";
  }

  private applyAccount(
    account: ConnectedAccount,
    accounts: ConnectedAccount[],
    options: { bumpEpoch?: boolean; rightPane?: RightPane } = {},
  ): void {
    this.client = new CmisClient(
      {
        serviceUrl: account.serviceUrl,
        repositoryId: account.repositoryId,
        succinct: account.succinct,
        auth: account.auth,
      },
      this.traffic,
    );

    saveStored({
      serviceUrl: account.serviceUrl,
      succinct: account.succinct,
      repositoryId: account.repositoryId,
      auth: toStoredAuthPrefs(account.auth),
    });

    if (account.auth.mode === "oauth" && account.auth.accessToken) {
      persistOAuthCredentials(account.auth);
    }

    this.state = {
      ...this.state,
      connected: true,
      accounts,
      activeAccountId: account.id,
      serviceUrl: account.serviceUrl,
      succinct: account.succinct,
      auth: account.auth,
      boxUser: account.boxUser,
      repositories: account.repositories,
      repositoryId: account.repositoryId,
      repositoryInfo: account.repositoryInfo,
      currentFolder: account.currentFolder,
      currentObject: account.currentObject,
      currentChildren: account.currentChildren,
      childrenPage: account.childrenPage,
      childrenPageSize: account.childrenPageSize,
      queryResults: null,
      loading: false,
      error: null,
      view: "browse",
      rightPane: options.rightPane ?? "repo-info",
      accountEpoch: options.bumpEpoch
        ? this.state.accountEpoch + 1
        : this.state.accountEpoch,
    };
    this.notify();
  }

  private snapshotActiveIntoAccounts(): ConnectedAccount[] {
    const activeId = this.state.activeAccountId;
    if (!activeId || !this.state.connected) {
      return [...this.state.accounts];
    }
    const snapshot = this.accountFromActiveState(activeId);
    if (this.state.accounts.some((account) => account.id === activeId)) {
      return this.state.accounts.map((account) =>
        account.id === activeId ? snapshot : account,
      );
    }
    return [...this.state.accounts, snapshot];
  }

  private accountFromActiveState(id: string): ConnectedAccount {
    const previous = this.state.accounts.find((account) => account.id === id);
    return {
      id,
      label:
        previous?.label ??
        accountLabelFor({
          boxUser: this.state.boxUser,
          auth: this.state.auth,
          repositoryInfo: this.state.repositoryInfo,
          repositoryId: this.state.repositoryId,
        }),
      boxUser: this.state.boxUser,
      serviceUrl: this.state.serviceUrl,
      succinct: this.state.succinct,
      auth: this.state.auth,
      repositoryId: this.state.repositoryId,
      repositories: this.state.repositories,
      repositoryInfo: this.state.repositoryInfo,
      currentFolder: this.state.currentFolder,
      currentObject: this.state.currentObject,
      currentChildren: this.state.currentChildren,
      childrenPage: this.state.childrenPage,
      childrenPageSize: this.state.childrenPageSize,
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function loadStored(): StoredConnection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredConnection;
  } catch {
    return null;
  }
}

function saveStored(connection: StoredConnection): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
}

export const session = new SessionStore();
