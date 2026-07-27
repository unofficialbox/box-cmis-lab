import type { BoxAppShellElement } from "@unofficialbox/box-open-elements/components/layout/app-shell";
import type { BoxSplitViewElement } from "@unofficialbox/box-open-elements/components/layout/split-view";
import type { BoxDialogElement } from "@unofficialbox/box-open-elements/components/overlays/dialog";
import { session } from "../session/store.js";
import { createAccountMenu } from "./account-menu.js";
import { tryResumeSession } from "./actions.js";
import { createConnectDialog, openConnectDialog } from "./connect-dialog.js";
import { createDetailsPanel } from "./details-panel.js";
import { createFolderTreePanel } from "./folder-tree-panel.js";
import { createInspectorShelf, toggleInspectorShelf } from "./inspector-panel.js";
import { createQueryPanel } from "./query-panel.js";
import { createRepoInfoPanel } from "./repo-info-panel.js";

const BROWSE_SPLIT_RATIO_KEY = "box-cmis-lab.browse-split-ratio-v3";
const BROWSE_SPLIT_RATIO_DEFAULT = 0.6;

export function mountApp(host: HTMLElement): void {
  const shell = document.createElement("box-app-shell") as BoxAppShellElement;
  shell.heading = "Box CMIS Lab";

  const eyebrow = document.createElement("span");
  eyebrow.slot = "eyebrow";
  eyebrow.className = "lab-eyebrow";
  eyebrow.textContent = "Browser Binding workbench";

  const headerActions = document.createElement("div");
  headerActions.slot = "header-actions";
  headerActions.className = "lab-toolbar";
  headerActions.innerHTML = `
    <box-button id="btn-repo-info" label="Repository Info"></box-button>
    <box-button id="btn-browse" label="Browse"></box-button>
    <box-button id="btn-query" label="Query"></box-button>
    <box-button id="btn-inspector" label="Inspector"></box-button>
  `;

  const connectDialog = createConnectDialog();
  const accountMenu = createAccountMenu({
    onConnect: () => openConnectDialog(connectDialog, { addAccount: true }),
  });
  headerActions.append(accountMenu);

  const stage = document.createElement("div");
  stage.className = "lab-stage";

  const main = document.createElement("div");
  main.className = "lab-main";
  main.innerHTML = `
    <p class="lab-error" id="shell-error" hidden></p>
    <div id="shell-view"></div>
  `;

  const browseSplit = document.createElement("box-split-view") as BoxSplitViewElement;
  browseSplit.className = "lab-browse-split";
  browseSplit.label = "Browse and details";
  browseSplit.resizable = true;
  browseSplit.ratio = loadBrowseSplitRatio();

  const treePanel = createFolderTreePanel();
  treePanel.slot = "primary";
  const repoInfoPanel = createRepoInfoPanel();
  const detailsPanel = createDetailsPanel();
  // Secondary pane uses the default (unnamed) slot on box-split-view.
  const rightHost = document.createElement("div");
  rightHost.className = "lab-right-host";
  rightHost.append(repoInfoPanel);

  browseSplit.append(treePanel, rightHost);

  browseSplit.addEventListener("ratio-changed", ((event: CustomEvent<{ ratio: number }>) => {
    localStorage.setItem(BROWSE_SPLIT_RATIO_KEY, String(event.detail.ratio));
  }) as EventListener);

  const queryPanel = createQueryPanel();
  const inspectorShelf = createInspectorShelf();

  stage.append(main, inspectorShelf);
  shell.append(eyebrow, headerActions, stage, connectDialog);
  host.replaceChildren(shell);

  headerActions.querySelector("#btn-repo-info")?.addEventListener("click", () => {
    session.setView("browse");
    session.setRightPane("repo-info");
  });
  headerActions.querySelector("#btn-browse")?.addEventListener("click", () => {
    session.setView("browse");
  });
  headerActions.querySelector("#btn-query")?.addEventListener("click", () => {
    session.setView("query");
  });
  headerActions.querySelector("#btn-inspector")?.addEventListener("click", () => {
    toggleInspectorShelf(inspectorShelf);
  });

  const viewHost = main.querySelector("#shell-view") as HTMLElement;
  const errorEl = main.querySelector("#shell-error") as HTMLElement;
  const repoInfoBtn = headerActions.querySelector("#btn-repo-info") as HTMLElement & {
    disabled: boolean;
  };
  const browseBtn = headerActions.querySelector("#btn-browse") as HTMLElement & {
    disabled: boolean;
  };
  const queryBtn = headerActions.querySelector("#btn-query") as HTMLElement & {
    disabled: boolean;
  };

  let mountedRight: "repo-info" | "details" | null = null;
  let mountedView: "browse" | "query" | null = null;

  const syncRightPane = (): void => {
    const state = session.getState();
    const next = state.connected ? state.rightPane : "repo-info";
    if (mountedRight === next && rightHost.childElementCount > 0) {
      return;
    }
    mountedRight = next;
    switch (next) {
      case "repo-info":
        rightHost.replaceChildren(repoInfoPanel);
        break;
      case "details":
        rightHost.replaceChildren(detailsPanel);
        break;
      default: {
        const _exhaustive: never = next;
        void _exhaustive;
        break;
      }
    }
  };

  const render = (): void => {
    const state = session.getState();
    repoInfoBtn.disabled = !state.connected;
    browseBtn.disabled = !state.connected;
    queryBtn.disabled = !state.connected || !session.canQuery();

    if (state.error) {
      errorEl.hidden = false;
      errorEl.textContent = state.error;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    switch (state.view) {
      case "browse":
        syncRightPane();
        if (mountedView !== "browse") {
          mountedView = "browse";
          viewHost.replaceChildren(browseSplit);
        }
        break;
      case "query":
        if (mountedView !== "query") {
          mountedView = "query";
          viewHost.replaceChildren(queryPanel);
        }
        break;
      default: {
        const _exhaustive: never = state.view;
        void _exhaustive;
        break;
      }
    }
  };

  session.subscribe(render);
  render();

  if (!session.getState().connected) {
    void tryResumeSession().then((resumed) => {
      if (!resumed && !session.getState().connected) {
        openConnectDialog(connectDialog as BoxDialogElement);
      }
    });
  }
}

function loadBrowseSplitRatio(): number {
  const raw = localStorage.getItem(BROWSE_SPLIT_RATIO_KEY);
  const value = raw ? Number(raw) : BROWSE_SPLIT_RATIO_DEFAULT;
  if (!Number.isFinite(value)) {
    return BROWSE_SPLIT_RATIO_DEFAULT;
  }
  // Match box-split-view clamp (0.2–0.8).
  return Math.max(0.2, Math.min(0.8, value));
}
