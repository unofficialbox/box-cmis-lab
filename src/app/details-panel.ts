import type { BoxTabsElement } from "@unofficialbox/box-open-elements/components/navigation/tabs";
import {
  flattenProperties,
  getBaseTypeId,
  getCreatedBy,
  getCreationDate,
  getLastModified,
  getLastModifiedBy,
  getObjectId,
  getObjectName,
  getPath,
} from "../cmis/properties.js";
import type { CmisAce, CmisObject, CmisRendition } from "../cmis/types.js";
import { session } from "../session/store.js";
import {
  downloadCurrentDocument,
  loadAcl,
  loadRenditions,
  loadVersions,
  refreshCurrentObject,
} from "./actions.js";
import { escapeHtml } from "./html.js";

type DetailsTab = "object" | "properties" | "acl" | "versions" | "renditions";

const TAB_OPTIONS: Array<{ label: string; value: DetailsTab }> = [
  { label: "Object", value: "object" },
  { label: "Properties", value: "properties" },
  { label: "ACL", value: "acl" },
  { label: "Versions", value: "versions" },
  { label: "Renditions", value: "renditions" },
];

export function createDetailsPanel(): HTMLElement {
  const root = document.createElement("section");
  root.className = "lab-pane lab-stack";
  root.innerHTML = `
    <div class="lab-actions" style="justify-content: space-between;">
      <h2 style="margin:0;">Details</h2>
      <div class="lab-actions">
        <box-button id="details-refresh" label="Refresh"></box-button>
        <box-button id="details-download" label="Download" tone="primary"></box-button>
      </div>
    </div>
    <div id="details-empty"></div>
    <box-tabs id="details-tabs" label="Object details" hidden>
      <div slot="object" id="panel-object" class="details-tab-panel"></div>
      <div slot="properties" id="panel-properties" class="details-tab-panel"></div>
      <div slot="acl" id="panel-acl" class="details-tab-panel"></div>
      <div slot="versions" id="panel-versions" class="details-tab-panel"></div>
      <div slot="renditions" id="panel-renditions" class="details-tab-panel"></div>
    </box-tabs>
  `;

  const tabs = root.querySelector("#details-tabs") as BoxTabsElement;
  const emptyHost = root.querySelector("#details-empty") as HTMLElement;
  const panels: Record<DetailsTab, HTMLElement> = {
    object: root.querySelector("#panel-object") as HTMLElement,
    properties: root.querySelector("#panel-properties") as HTMLElement,
    acl: root.querySelector("#panel-acl") as HTMLElement,
    versions: root.querySelector("#panel-versions") as HTMLElement,
    renditions: root.querySelector("#panel-renditions") as HTMLElement,
  };
  const downloadBtn = root.querySelector("#details-download") as HTMLElement & {
    disabled: boolean;
  };

  tabs.options = TAB_OPTIONS;
  tabs.value = "object";
  tabs.layout = "separated";

  let activeTab: DetailsTab = "object";
  let loadedObjectId = "";
  let aclCache: { objectId: string; aces: CmisAce[] } | null = null;
  let versionsCache: { objectId: string; versions: CmisObject[] } | null = null;
  let renditionsCache: { objectId: string; renditions: CmisRendition[] } | null =
    null;

  tabs.addEventListener("value-changed", ((event: CustomEvent<{ value: string }>) => {
    activeTab = event.detail.value as DetailsTab;
    void renderActivePanel(true);
  }) as EventListener);

  root.querySelector("#details-refresh")?.addEventListener("click", () => {
    aclCache = null;
    versionsCache = null;
    renditionsCache = null;
    void refreshCurrentObject();
  });

  root.querySelector("#details-download")?.addEventListener("click", () => {
    void downloadCurrentDocument();
  });

  const renderSummary = (): void => {
    const object = session.getState().currentObject;
    downloadBtn.disabled = getBaseTypeId(object) !== "cmis:document";
  };

  const clearPanels = (): void => {
    for (const panel of Object.values(panels)) {
      panel.innerHTML = "";
    }
  };

  const renderActivePanel = async (force = false): Promise<void> => {
    const state = session.getState();
    const object = state.currentObject;
    renderSummary();

    if (!state.connected || !object) {
      tabs.hidden = true;
      emptyHost.hidden = false;
      emptyHost.innerHTML = `<box-empty-state heading="No object selected" description="Select a folder or document in the browse list."></box-empty-state>`;
      clearPanels();
      return;
    }

    emptyHost.hidden = true;
    emptyHost.innerHTML = "";
    tabs.hidden = false;

    const objectId = getObjectId(object);
    if (objectId !== loadedObjectId) {
      loadedObjectId = objectId;
      aclCache = null;
      versionsCache = null;
      renditionsCache = null;
      clearPanels();
    }

    const panel = panels[activeTab];
    switch (activeTab) {
      case "object":
        panel.innerHTML = renderObjectSummary(object);
        return;
      case "properties":
        panel.innerHTML = renderProperties(object);
        return;
      case "acl":
        panel.innerHTML = `<p class="lab-muted">Loading ACL…</p>`;
        try {
          if (!aclCache || aclCache.objectId !== objectId || force) {
            const acl = await loadAcl(objectId);
            aclCache = { objectId, aces: acl.aces ?? [] };
          }
          if (activeTab === "acl") {
            panel.innerHTML = renderAcl(aclCache.aces);
          }
        } catch (error) {
          if (activeTab === "acl") {
            panel.innerHTML = `<p class="lab-error">${escapeHtml(
              error instanceof Error ? error.message : String(error),
            )}</p>`;
          }
        }
        return;
      case "versions":
        panel.innerHTML = `<p class="lab-muted">Loading versions…</p>`;
        try {
          if (!versionsCache || versionsCache.objectId !== objectId || force) {
            const versions = await loadVersions(objectId);
            versionsCache = { objectId, versions };
          }
          if (activeTab === "versions") {
            panel.innerHTML = renderVersions(versionsCache.versions);
          }
        } catch (error) {
          if (activeTab === "versions") {
            panel.innerHTML = `<p class="lab-error">${escapeHtml(
              error instanceof Error ? error.message : String(error),
            )}</p>`;
          }
        }
        return;
      case "renditions":
        panel.innerHTML = `<p class="lab-muted">Loading renditions…</p>`;
        try {
          if (!renditionsCache || renditionsCache.objectId !== objectId || force) {
            const renditions = await loadRenditions(objectId);
            renditionsCache = { objectId, renditions };
          }
          if (activeTab === "renditions") {
            panel.innerHTML = renderRenditions(renditionsCache.renditions);
          }
        } catch (error) {
          if (activeTab === "renditions") {
            panel.innerHTML = `<p class="lab-error">${escapeHtml(
              error instanceof Error ? error.message : String(error),
            )}</p>`;
          }
        }
        return;
      default: {
        const _exhaustive: never = activeTab;
        void _exhaustive;
        return;
      }
    }
  };

  session.subscribe(() => {
    void renderActivePanel(false);
  });
  void renderActivePanel(false);
  return root;
}

function renderObjectSummary(object: CmisObject): string {
  const actions = object.allowableActions
    ? Object.entries(object.allowableActions)
        .filter(([, allowed]) => allowed)
        .map(([name]) => name)
        .sort()
    : [];

  return `
    <dl class="lab-kv">
      <dt>Name</dt><dd>${escapeHtml(getObjectName(object))}</dd>
      <dt>Object ID</dt><dd><code>${escapeHtml(getObjectId(object))}</code></dd>
      <dt>Base type</dt><dd>${escapeHtml(getBaseTypeId(object))}</dd>
      <dt>Path</dt><dd>${escapeHtml(getPath(object) || "—")}</dd>
      <dt>Created</dt><dd>${escapeHtml(formatDisplayDate(getCreationDate(object)))}</dd>
      <dt>Created by</dt><dd>${escapeHtml(getCreatedBy(object) || "—")}</dd>
      <dt>Modified</dt><dd>${escapeHtml(formatDisplayDate(getLastModified(object)))}</dd>
      <dt>Modified by</dt><dd>${escapeHtml(getLastModifiedBy(object) || "—")}</dd>
      <dt>Allowable actions</dt>
      <dd>${
        actions.length
          ? `<code>${escapeHtml(actions.join(", "))}</code>`
          : "<span class=\"lab-muted\">None returned</span>"
      }</dd>
    </dl>
  `;
}

function formatDisplayDate(iso: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function renderProperties(object: CmisObject): string {
  const rows = flattenProperties(object);
  if (rows.length === 0) {
    return `<box-empty-state heading="No properties" description="The object response did not include properties."></box-empty-state>`;
  }
  return `
    <table class="lab-table">
      <thead><tr><th>Property</th><th>Value</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td><code>${escapeHtml(row.id)}</code></td>
            <td>${escapeHtml(row.value)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderAcl(aces: CmisAce[]): string {
  if (aces.length === 0) {
    return `<box-empty-state heading="No ACEs" description="ACL selector returned no entries."></box-empty-state>`;
  }
  return `
    <table class="lab-table">
      <thead><tr><th>Principal</th><th>Permissions</th><th>Direct</th></tr></thead>
      <tbody>
        ${aces
          .map(
            (ace) => `
          <tr>
            <td>${escapeHtml(ace.principal?.principalId ?? "")}</td>
            <td>${escapeHtml((ace.permissions ?? []).join(", "))}</td>
            <td>${ace.isDirect === undefined ? "" : String(ace.isDirect)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderVersions(versions: CmisObject[]): string {
  if (versions.length === 0) {
    return `<box-empty-state heading="No versions" description="Versions selector returned no entries."></box-empty-state>`;
  }
  return `
    <table class="lab-table">
      <thead><tr><th>Name</th><th>Object ID</th><th>Base type</th></tr></thead>
      <tbody>
        ${versions
          .map(
            (version) => `
          <tr>
            <td>${escapeHtml(getObjectName(version))}</td>
            <td><code>${escapeHtml(getObjectId(version))}</code></td>
            <td>${escapeHtml(getBaseTypeId(version))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderRenditions(renditions: CmisRendition[]): string {
  if (renditions.length === 0) {
    return `<box-empty-state heading="No renditions" description="Renditions selector returned no entries."></box-empty-state>`;
  }
  return `
    <table class="lab-table">
      <thead><tr><th>Kind</th><th>MIME</th><th>Title</th><th>Stream ID</th><th>Size</th></tr></thead>
      <tbody>
        ${renditions
          .map(
            (rendition) => `
          <tr>
            <td>${escapeHtml(rendition.kind ?? "")}</td>
            <td>${escapeHtml(rendition.mimeType ?? "")}</td>
            <td>${escapeHtml(rendition.title ?? "")}</td>
            <td><code>${escapeHtml(rendition.streamId ?? "")}</code></td>
            <td>${rendition.length ?? ""}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}
