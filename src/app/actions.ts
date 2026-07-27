import {
  downloadContent,
  getAcl,
  getChildren,
  getFolderParent,
  getObject,
  getObjectByPath,
  getRenditions,
  getRepositoryInfo,
  getVersions,
  query,
} from "../cmis/api.js";
import { fetchCurrentBoxUser } from "../auth/box-user.js";
import { ensureValidOAuthCredentials } from "../auth/ensure-oauth.js";
import { loadOAuthSession } from "../auth/oauth-session.js";
import {
  getBaseTypeId,
  getObjectId,
  getObjectName,
  getPath,
} from "../cmis/properties.js";
import { CmisClient, fetchServiceDocument } from "../cmis/client.js";
import type { CmisObject, CmisServiceDocument } from "../cmis/types.js";
import { session } from "../session/store.js";

/** Reconnect after refresh when a repository and usable auth are still available. */
export async function tryResumeSession(): Promise<boolean> {
  const repositoryId = session.getState().repositoryId.trim();
  if (!repositoryId) {
    return false;
  }

  let auth = session.getState().auth;
  switch (auth.mode) {
    case "oauth": {
      const storedSession = loadOAuthSession();
      if (!storedSession?.accessToken && !auth.accessToken) {
        return false;
      }
      try {
        auth = await ensureValidOAuthCredentials(auth, { allowPopup: false });
      } catch {
        return false;
      }
      session.setConnectionFields({ auth });
      try {
        session.setBoxUser(await fetchCurrentBoxUser(auth.accessToken));
      } catch {
        // CMIS may still accept the token even if /users/me fails.
      }
      break;
    }
    case "ccg":
      if (!auth.clientId.trim() || !auth.clientSecret || !auth.boxSubjectId.trim()) {
        return false;
      }
      break;
    case "jwt":
      if (!auth.configJson.trim() && (!auth.clientId.trim() || !auth.privateKey.trim())) {
        return false;
      }
      break;
    default: {
      const _exhaustive: never = auth;
      void _exhaustive;
      return false;
    }
  }

  session.setLoading(true);
  try {
    const doc = (await fetchServiceDocument(
      session.getState().serviceUrl,
      session.traffic,
      auth,
    )) as CmisServiceDocument;
    if (!doc[repositoryId]) {
      session.setLoading(false);
      return false;
    }
    session.setRepositories(doc, repositoryId);
    session.setConnectionFields({ auth });
    await connectAndOpenRoot();
    return session.getState().connected;
  } catch {
    session.setLoading(false);
    return false;
  }
}

export async function connectAndOpenRoot(): Promise<void> {
  const state = session.getState();
  if (!state.repositoryId) {
    throw new Error("Select a repository before connecting.");
  }

  const previousActiveId = state.activeAccountId;
  session.setLoading(true);
  try {
    const client = new CmisClient(
      {
        serviceUrl: state.serviceUrl,
        repositoryId: state.repositoryId,
        succinct: state.succinct,
        auth: state.auth,
      },
      session.traffic,
    );
    const info = await getRepositoryInfo(client);
    const rootId = info.rootFolderId;
    if (!rootId) {
      throw new Error("Repository info is missing rootFolderId.");
    }
    const folder = await getObject(client, rootId);
    const latest = session.getState();
    session.addOrActivateAccount({
      serviceUrl: latest.serviceUrl,
      succinct: latest.succinct,
      auth: latest.auth,
      boxUser: latest.boxUser,
      repositoryId: latest.repositoryId,
      repositories: latest.repositories,
      repositoryInfo: info,
      currentFolder: folder,
      currentObject: folder,
    });
  } catch (error) {
    if (
      previousActiveId &&
      session.getState().accounts.some((account) => account.id === previousActiveId)
    ) {
      session.switchAccount(previousActiveId);
    } else if (session.getState().accounts.length === 0) {
      session.disconnectAll();
    }
    session.setLoading(false);
    throw error;
  }
}

export async function openFolder(folderId: string, page = 1): Promise<void> {
  const client = session.getClient();
  if (!client) {
    throw new Error("Not connected.");
  }
  const pageSize = session.getState().childrenPageSize;
  const skipCount = (Math.max(1, page) - 1) * pageSize;
  session.setLoading(true);
  try {
    const [folder, children] = await Promise.all([
      getObject(client, folderId),
      getChildren(client, folderId, { maxItems: pageSize, skipCount }),
    ]);
    session.setFolder(folder, children, page);
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function openPath(path: string): Promise<void> {
  const client = session.getClient();
  if (!client) {
    throw new Error("Not connected.");
  }
  session.setLoading(true);
  try {
    const object = await getObjectByPath(client, path || "/");
    const baseType = getBaseTypeId(object);
    const objectId = getObjectId(object);
    if (baseType === "cmis:folder") {
      await openFolder(objectId);
      return;
    }
    session.setObject(object);
    const parentPath = parentPathOf(getPath(object) || path);
    if (parentPath) {
      const parent = await getObjectByPath(client, parentPath);
      const pageSize = session.getState().childrenPageSize;
      const children = await getChildren(client, getObjectId(parent), {
        maxItems: pageSize,
        skipCount: 0,
      });
      session.patch({
        currentFolder: parent,
        currentChildren: children,
        childrenPage: 1,
        currentObject: object,
        loading: false,
      });
    }
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function goUp(): Promise<void> {
  const client = session.getClient();
  const folder = session.getState().currentFolder;
  if (!client || !folder) {
    return;
  }
  const folderId = getObjectId(folder);
  const rootId = session.getState().repositoryInfo?.rootFolderId;
  if (rootId && folderId === rootId) {
    return;
  }
  session.setLoading(true);
  try {
    const parent = await getFolderParent(client, folderId);
    await openFolder(getObjectId(parent));
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
  }
}

export async function selectObject(object: CmisObject): Promise<void> {
  const baseType = getBaseTypeId(object);
  if (baseType === "cmis:folder") {
    await openFolder(getObjectId(object));
    return;
  }
  const client = session.getClient();
  if (!client) {
    return;
  }
  session.setLoading(true);
  try {
    const full = await getObject(client, getObjectId(object));
    session.setObject(full);
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
  }
}

export async function refreshCurrentObject(): Promise<void> {
  const client = session.getClient();
  const object = session.getState().currentObject;
  if (!client || !object) {
    return;
  }
  const objectId = getObjectId(object);
  const baseType = getBaseTypeId(object);
  if (baseType === "cmis:folder") {
    await openFolder(objectId);
    return;
  }
  await selectObject(object);
}

export async function downloadCurrentDocument(): Promise<void> {
  const client = session.getClient();
  const object = session.getState().currentObject;
  if (!client || !object) {
    return;
  }
  if (getBaseTypeId(object) !== "cmis:document") {
    session.setError("Only documents can be downloaded.");
    return;
  }
  try {
    await downloadContent(client, getObjectId(object), getObjectName(object));
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
  }
}

export async function loadAcl(objectId: string) {
  const client = session.getClient();
  if (!client) {
    throw new Error("Not connected.");
  }
  return getAcl(client, objectId);
}

export async function loadVersions(objectId: string) {
  const client = session.getClient();
  if (!client) {
    throw new Error("Not connected.");
  }
  return getVersions(client, objectId);
}

export async function loadRenditions(objectId: string) {
  const client = session.getClient();
  if (!client) {
    throw new Error("Not connected.");
  }
  return getRenditions(client, objectId);
}

export async function runQuery(
  statement: string,
  options: { maxItems?: number; skipCount?: number } = {},
): Promise<void> {
  const client = session.getClient();
  if (!client) {
    throw new Error("Not connected.");
  }
  session.setLoading(true);
  try {
    const results = await query(client, statement, options);
    session.setQueryResults(results);
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function parentPathOf(path: string): string | null {
  if (!path || path === "/") {
    return null;
  }
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) {
    return "/";
  }
  return trimmed.slice(0, idx);
}
