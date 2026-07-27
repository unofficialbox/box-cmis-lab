import type { BoxSectionElement } from "@unofficialbox/box-open-elements/components/layout/section";
import { enterpriseIdFromAuth } from "../auth/types.js";
import type { CmisRepositoryInfo } from "../cmis/types.js";
import { session } from "../session/store.js";
import { escapeHtml } from "./html.js";

function capabilityEntries(
  capabilities: CmisRepositoryInfo["capabilities"],
): Array<{ key: string; value: string }> {
  if (!capabilities) {
    return [];
  }
  return Object.keys(capabilities)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      key,
      value: formatCapability(capabilities[key]),
    }));
}

function formatCapability(value: unknown): string {
  if (value === undefined || value === null) {
    return "—";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function renderInfo(
  info: CmisRepositoryInfo | null,
  enterpriseId: string | null,
): string {
  if (!info) {
    return `<box-empty-state heading="No repository info" description="Connect an account to load repository metadata."></box-empty-state>`;
  }

  const rows: Array<[string, string]> = [
    ["Repository ID", info.repositoryId],
    ["Box Enterprise ID", enterpriseId || "—"],
    ["Name", info.repositoryName ?? "—"],
    ["Description", info.repositoryDescription ?? "—"],
    ["Vendor", info.vendorName ?? "—"],
    ["Product", info.productName ?? "—"],
    ["Product version", info.productVersion ?? "—"],
    ["CMIS version", info.cmisVersionSupported ?? "—"],
    ["Root folder ID", info.rootFolderId ?? "—"],
    ["Repository URL", info.repositoryUrl ?? "—"],
    ["Root folder URL", info.rootFolderUrl ?? "—"],
  ];

  const caps = capabilityEntries(info.capabilities);

  return `
    <dl class="lab-kv">
      ${rows
        .map(
          ([label, value]) => `
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      `,
        )
        .join("")}
    </dl>
    <h3 class="lab-repo-caps-heading">Capabilities</h3>
    ${
      caps.length === 0
        ? `<p class="lab-muted">No capabilities returned.</p>`
        : `<dl class="lab-kv">
            ${caps
              .map(
                (cap) => `
              <dt><code>${escapeHtml(cap.key)}</code></dt>
              <dd>${escapeHtml(cap.value)}</dd>
            `,
              )
              .join("")}
          </dl>`
    }
  `;
}

export function createRepoInfoPanel(): HTMLElement {
  const root = document.createElement("box-section") as BoxSectionElement;
  root.className = "lab-pane lab-stack repo-info-panel";
  root.heading = "Repository Info";
  root.innerHTML = `<div id="repo-info-body"></div>`;

  const body = root.querySelector("#repo-info-body") as HTMLElement;

  const render = (): void => {
    const state = session.getState();
    const enterpriseId =
      state.boxUser?.enterpriseId || enterpriseIdFromAuth(state.auth);
    body.innerHTML = renderInfo(state.repositoryInfo, enterpriseId);
  };

  session.subscribe(render);
  render();
  return root;
}
