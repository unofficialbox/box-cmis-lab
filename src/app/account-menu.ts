import type { BoxAvatarElement } from "@unofficialbox/box-open-elements/components/identity/avatar";
import { session, type ConnectedAccount } from "../session/store.js";
import { escapeHtml } from "./html.js";

export interface AccountMenuOptions {
  onConnect: () => void;
}

function initialsFor(label: string): string {
  const parts = label
    .replace(/[·@].*$/, "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function accountPrimary(account: ConnectedAccount): string {
  return (
    account.boxUser?.login ||
    account.boxUser?.name ||
    account.label.split(" · ")[0] ||
    "Box account"
  );
}

function accountSecondary(account: ConnectedAccount): string {
  return (
    account.repositoryInfo?.repositoryName ||
    account.repositoryId ||
    account.serviceUrl
  );
}

export function createAccountMenu(options: AccountMenuOptions): HTMLElement {
  const root = document.createElement("div");
  root.className = "lab-account-menu";
  root.innerHTML = `
    <button type="button" class="lab-account-trigger" id="account-trigger" aria-haspopup="menu" aria-expanded="false" title="Account menu">
      <box-avatar id="account-avatar" size="32" tone="brand"></box-avatar>
    </button>
    <div class="lab-account-panel" id="account-panel" hidden role="menu">
      <div class="lab-account-header" id="account-header"></div>
      <div class="lab-account-list" id="account-list"></div>
      <div class="lab-account-actions" id="account-actions"></div>
    </div>
  `;

  const trigger = root.querySelector("#account-trigger") as HTMLButtonElement;
  const panel = root.querySelector("#account-panel") as HTMLElement;
  const header = root.querySelector("#account-header") as HTMLElement;
  const list = root.querySelector("#account-list") as HTMLElement;
  const actions = root.querySelector("#account-actions") as HTMLElement;
  const avatar = root.querySelector("#account-avatar") as BoxAvatarElement;

  const close = (): void => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  const open = (): void => {
    render();
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };

  const toggle = (): void => {
    if (panel.hidden) {
      open();
    } else {
      close();
    }
  };

  const render = (): void => {
    const state = session.getState();
    const active = state.accounts.find((account) => account.id === state.activeAccountId);

    if (state.connected && active) {
      const name = accountPrimary(active);
      avatar.name = name;
      avatar.initials = initialsFor(name);
      avatar.alt = name;
      header.innerHTML = `
        <box-avatar size="40" tone="brand" name="${escapeHtml(name)}" initials="${escapeHtml(initialsFor(name))}"></box-avatar>
        <div class="lab-account-header-text">
          <div class="lab-account-header-name">${escapeHtml(name)}</div>
          <div class="lab-account-header-meta">${escapeHtml(accountSecondary(active))}</div>
        </div>
      `;
    } else {
      avatar.name = "Guest";
      avatar.initials = "?";
      avatar.alt = "Not connected";
      header.innerHTML = `
        <box-avatar size="40" tone="neutral" name="Guest" initials="?"></box-avatar>
        <div class="lab-account-header-text">
          <div class="lab-account-header-name">Not connected</div>
          <div class="lab-account-header-meta">Connect a Box CMIS account</div>
        </div>
      `;
    }

    if (state.accounts.length > 0) {
      list.hidden = false;
      list.innerHTML = state.accounts
        .map((account) => {
          const selected = account.id === state.activeAccountId;
          return `
            <button type="button" class="lab-account-item${selected ? " is-active" : ""}" role="menuitemradio" data-account-id="${escapeHtml(account.id)}" aria-checked="${selected}">
              <span class="lab-account-item-indicator" aria-hidden="true">
                ${selected ? `<span class="lab-account-status-dot"></span>` : ""}
              </span>
              <span class="lab-account-item-text">
                <span class="lab-account-item-name">${escapeHtml(accountPrimary(account))}</span>
                <span class="lab-account-item-meta">${escapeHtml(accountSecondary(account))}</span>
              </span>
            </button>
          `;
        })
        .join("");
    } else {
      list.hidden = true;
      list.innerHTML = "";
    }

    const connectLabel = state.connected ? "Connect another account…" : "Connect…";
    actions.innerHTML = `
      <button type="button" class="lab-account-action" data-action="connect" role="menuitem">${escapeHtml(connectLabel)}</button>
      ${
        state.connected
          ? `<button type="button" class="lab-account-action lab-account-action-danger" data-action="disconnect" role="menuitem">Disconnect</button>`
          : ""
      }
    `;
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });

  panel.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-account-id], [data-action]");
    if (!target) {
      return;
    }

    const accountId = target.dataset.accountId;
    if (accountId) {
      try {
        session.switchAccount(accountId);
      } catch (error) {
        session.setError(error instanceof Error ? error.message : String(error));
      }
      close();
      return;
    }

    switch (target.dataset.action) {
      case "connect":
        close();
        options.onConnect();
        break;
      case "disconnect":
        session.disconnectActive();
        close();
        break;
      default:
        break;
    }
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  session.subscribe(render);
  render();
  return root;
}
