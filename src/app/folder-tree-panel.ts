import type { BoxTreeGridElement } from "@unofficialbox/box-open-elements/components/collections/tree-grid";
import type { BoxTextFieldElement } from "@unofficialbox/box-open-elements/components/forms/text-field";
import type { BoxSectionElement } from "@unofficialbox/box-open-elements/components/layout/section";
import { getChildren, getFolderParent, getObject, getObjectByPath } from "../cmis/api.js";
import {
  getBaseTypeId,
  getLastModified,
  getObjectId,
  getObjectName,
  getPath,
} from "../cmis/properties.js";
import type { CmisObject } from "../cmis/types.js";
import { session } from "../session/store.js";

type TreeGridItem = {
  label: string;
  value: string;
  cells: string[];
  children?: TreeGridItem[];
};

/** Runtime hooks used to preserve expansion across item updates. */
type BoxTreeGridInternals = {
  expandedInternal: Set<string>;
  update: () => void;
};

const PENDING_PREFIX = "__pending__:";

const TREE_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "baseType", label: "Base type" },
  { key: "objectId", label: "Object ID" },
  { key: "lastModified", label: "Last modified" },
] as const;

function isFolder(object: CmisObject): boolean {
  return getBaseTypeId(object) === "cmis:folder";
}

function formatModified(iso: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function cellsFromObject(object: CmisObject): string[] {
  return [
    getBaseTypeId(object) || "—",
    getObjectId(object) || "—",
    formatModified(getLastModified(object)),
  ];
}

function pendingChild(folderId: string): TreeGridItem {
  return {
    label: "Loading…",
    value: `${PENDING_PREFIX}${folderId}`,
    cells: ["—", "—", "—"],
  };
}

function itemFromObject(object: CmisObject): TreeGridItem {
  const id = getObjectId(object);
  const label = getObjectName(object) || id;
  const cells = cellsFromObject(object);
  if (isFolder(object)) {
    return { label, value: id, cells, children: [pendingChild(id)] };
  }
  return { label, value: id, cells };
}

function findItem(items: TreeGridItem[], objectId: string): TreeGridItem | null {
  for (const item of items) {
    if (item.value === objectId) {
      return item;
    }
    if (item.children) {
      const nested = findItem(item.children, objectId);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function replaceChildren(
  items: TreeGridItem[],
  folderId: string,
  children: TreeGridItem[],
): TreeGridItem[] {
  return items.map((item) => {
    if (item.value === folderId) {
      return { ...item, children };
    }
    if (item.children) {
      return { ...item, children: replaceChildren(item.children, folderId, children) };
    }
    return item;
  });
}

function collectAncestorIds(
  items: TreeGridItem[],
  objectId: string,
  path: string[] = [],
): string[] | null {
  for (const item of items) {
    if (item.value === objectId) {
      return path;
    }
    if (item.children?.length) {
      const found = collectAncestorIds(item.children, objectId, [...path, item.value]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function createFolderTreePanel(): HTMLElement {
  const root = document.createElement("box-section") as BoxSectionElement;
  root.className = "lab-pane lab-stack folder-tree-panel";
  root.heading = "Browse";
  root.innerHTML = `
    <div class="browse-path-chrome">
      <div class="browse-path-bar">
        <box-text-field id="tree-path" class="browse-path-field" label="Path"></box-text-field>
        <div class="browse-path-actions">
          <box-button id="tree-go" label="Go" tone="primary"></box-button>
          <box-button id="tree-up" label="Up"></box-button>
        </div>
      </div>
      <p class="lab-muted" id="tree-meta"></p>
    </div>
    <div id="tree-empty"></div>
    <box-tree-grid id="folder-tree" label="Repository folders" hidden></box-tree-grid>
  `;

  const pathField = root.querySelector("#tree-path") as BoxTextFieldElement;
  const meta = root.querySelector("#tree-meta") as HTMLElement;
  const emptyHost = root.querySelector("#tree-empty") as HTMLElement;
  const tree = root.querySelector("#folder-tree") as BoxTreeGridElement;
  const treeInternals = tree as unknown as BoxTreeGridInternals;

  tree.columns = [...TREE_COLUMNS];

  let treeItems: TreeGridItem[] = [];
  let loadedFolders = new Set<string>();
  let expandedFolders = new Set<string>();
  let boundEpoch = -1;
  let loadToken = 0;
  let selectGeneration = 0;
  let selectedObjectId = "";

  const restoreExpanded = (): void => {
    // box-tree-grid expands every top-level branch whenever items change.
    // Keep only folders the user (or navigation) actually opened.
    treeInternals.expandedInternal.clear();
    for (const id of expandedFolders) {
      treeInternals.expandedInternal.add(id);
    }
    treeInternals.update();
  };

  const applySelection = (objectId: string): void => {
    selectedObjectId = objectId;
    if (tree.value !== objectId) {
      tree.value = objectId;
    } else {
      // Same value may not re-render; force highlight refresh after item updates.
      treeInternals.update();
    }
  };

  const setTreeItems = (items: TreeGridItem[]): void => {
    const scrollTop = tree.scrollTop;
    treeItems = items;
    tree.items = items;
    restoreExpanded();
    if (selectedObjectId) {
      tree.value = selectedObjectId;
    }
    tree.scrollTop = scrollTop;
  };

  const showDisconnected = (): void => {
    tree.hidden = true;
    emptyHost.hidden = false;
    emptyHost.innerHTML = `<box-empty-state heading="Not connected" description="Use the account menu to connect a Box CMIS account."></box-empty-state>`;
    meta.textContent = "";
    pathField.value = "";
    loadedFolders = new Set();
    expandedFolders = new Set();
    setTreeItems([]);
  };

  const loadFolderChildren = async (folderId: string): Promise<TreeGridItem[]> => {
    const client = session.getClient();
    if (!client) {
      return [];
    }
    const response = await getChildren(client, folderId, {
      maxItems: session.getState().childrenPageSize,
      skipCount: 0,
    });
    const children = (response.objects ?? []).map((entry) => itemFromObject(entry.object));
    loadedFolders.add(folderId);
    return children;
  };

  const hiddenRootId = (): string => session.getState().repositoryInfo?.rootFolderId ?? "";

  const applyRootChildren = (children: TreeGridItem[]): void => {
    setTreeItems(children);
  };

  const ensureFolderLoaded = async (folderId: string): Promise<void> => {
    if (loadedFolders.has(folderId)) {
      return;
    }
    const children = await loadFolderChildren(folderId);
    if (folderId === hiddenRootId()) {
      applyRootChildren(children);
      return;
    }
    setTreeItems(replaceChildren(treeItems, folderId, children));
  };

  const expandFolder = async (folderId: string): Promise<void> => {
    expandedFolders.add(folderId);
    await ensureFolderLoaded(folderId);
    const scrollTop = tree.scrollTop;
    restoreExpanded();
    tree.scrollTop = scrollTop;
  };

  const bootstrapTree = async (): Promise<void> => {
    const state = session.getState();
    const client = session.getClient();
    const rootId = state.repositoryInfo?.rootFolderId;
    if (!state.connected || !client || !rootId) {
      showDisconnected();
      return;
    }

    const token = ++loadToken;
    emptyHost.hidden = true;
    emptyHost.innerHTML = "";
    tree.hidden = false;
    meta.textContent = "Loading…";

    try {
      const rootFolder = await getObject(client, rootId);
      if (token !== loadToken) {
        return;
      }
      loadedFolders = new Set();
      expandedFolders = new Set();
      const children = await loadFolderChildren(rootId);
      if (token !== loadToken) {
        return;
      }
      applyRootChildren(children);

      const selectedId = state.currentObject ? getObjectId(state.currentObject) : "";
      if (selectedId && selectedId !== rootId) {
        applySelection(selectedId);
      }
      pathField.value = getPath(state.currentFolder) || getPath(rootFolder) || "/";
      meta.textContent = `${treeItems.length} items`;
    } catch (error) {
      if (token !== loadToken) {
        return;
      }
      session.setError(error instanceof Error ? error.message : String(error));
      meta.textContent = "Failed to load folder tree";
    }
  };

  const selectObjectId = async (objectId: string): Promise<void> => {
    if (objectId.startsWith(PENDING_PREFIX)) {
      return;
    }
    const client = session.getClient();
    if (!client) {
      return;
    }
    const generation = ++selectGeneration;
    applySelection(objectId);
    const scrollTop = tree.scrollTop;
    session.setLoading(true);
    try {
      const object = await getObject(client, objectId);
      if (generation !== selectGeneration) {
        return;
      }
      if (isFolder(object)) {
        session.patch({
          currentFolder: object,
          currentObject: object,
          loading: false,
          error: null,
          rightPane: "details",
        });
        pathField.value = getPath(object) || "/";
        const rootId = hiddenRootId();
        if (objectId === rootId) {
          await ensureFolderLoaded(rootId);
          applySelection("");
          meta.textContent = `${treeItems.length} items`;
          tree.scrollTop = scrollTop;
          return;
        }
        const ancestors = collectAncestorIds(treeItems, objectId) ?? [];
        for (const ancestorId of ancestors) {
          expandedFolders.add(ancestorId);
        }
        await expandFolder(objectId);
        if (generation !== selectGeneration) {
          return;
        }
        applySelection(objectId);
        const node = findItem(treeItems, objectId);
        meta.textContent = `${node?.children?.length ?? 0} items`;
        tree.scrollTop = scrollTop;
        return;
      }
      session.setObject(object);
      applySelection(objectId);
      meta.textContent = getObjectName(object);
      tree.scrollTop = scrollTop;
    } catch (error) {
      if (generation !== selectGeneration) {
        return;
      }
      session.setError(error instanceof Error ? error.message : String(error));
    }
  };

  tree.addEventListener("value-changed", ((event: CustomEvent<{ value: string }>) => {
    void selectObjectId(event.detail.value);
  }) as EventListener);

  tree.addEventListener("expand-changed", ((
    event: CustomEvent<{ value: string; expanded: boolean }>,
  ) => {
    const folderId = event.detail.value;
    if (!folderId || folderId.startsWith(PENDING_PREFIX)) {
      return;
    }
    if (event.detail.expanded) {
      expandedFolders.add(folderId);
      if (!loadedFolders.has(folderId)) {
        void ensureFolderLoaded(folderId).catch((error) => {
          session.setError(error instanceof Error ? error.message : String(error));
        });
      }
      return;
    }
    expandedFolders.delete(folderId);
  }) as EventListener);

  root.querySelector("#tree-go")?.addEventListener("click", () => {
    void (async () => {
      const client = session.getClient();
      if (!client) {
        return;
      }
      try {
        const object = await getObjectByPath(client, pathField.value.trim() || "/");
        const objectId = getObjectId(object);
        if (isFolder(object)) {
          await bootstrapTree();
          await selectObjectId(objectId);
          return;
        }
        session.setObject(object);
        applySelection(objectId);
      } catch (error) {
        session.setError(error instanceof Error ? error.message : String(error));
      }
    })();
  });

  root.querySelector("#tree-up")?.addEventListener("click", () => {
    void (async () => {
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
      try {
        const parent = await getFolderParent(client, folderId);
        await selectObjectId(getObjectId(parent));
      } catch (error) {
        session.setError(error instanceof Error ? error.message : String(error));
      }
    })();
  });

  const render = (): void => {
    const state = session.getState();
    if (!state.connected) {
      boundEpoch = state.accountEpoch;
      showDisconnected();
      return;
    }
    if (state.accountEpoch !== boundEpoch) {
      boundEpoch = state.accountEpoch;
      void bootstrapTree();
      return;
    }
    if (state.currentFolder) {
      pathField.value = getPath(state.currentFolder) || "/";
    }
  };

  session.subscribe(render);
  render();
  return root;
}
