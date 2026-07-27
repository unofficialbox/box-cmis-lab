import type { BoxSelectElement } from "@unofficialbox/box-open-elements/components/forms/select";
import type { BoxSplitViewElement } from "@unofficialbox/box-open-elements/components/layout/split-view";
import type { TrafficEntry } from "../inspector/traffic-log.js";
import { session } from "../session/store.js";
import { escapeHtml } from "./html.js";

const SHELF_OPEN_KEY = "box-cmis-lab.inspector-shelf-open";
const SHELF_HEIGHT_KEY = "box-cmis-lab.inspector-shelf-height";
const SPLIT_RATIO_KEY = "box-cmis-lab.inspector-split-ratio";

export function createInspectorShelf(): HTMLElement {
  const root = document.createElement("section");
  root.className = "lab-inspector-shelf";
  root.setAttribute("aria-label", "HTTP Inspector");
  root.innerHTML = `
    <div class="lab-term-bar" id="inspector-bar">
      <button type="button" class="lab-term-toggle" id="inspector-toggle" aria-expanded="false">
        <span class="lab-term-chevron" aria-hidden="true"></span>
        <span class="lab-term-title">HTTP Inspector</span>
        <span class="lab-term-badge" id="inspector-count">0</span>
      </button>
      <div class="lab-term-bar-actions" id="inspector-bar-actions">
        <box-select id="inspector-filter" label="Filter" aria-label="Status filter"></box-select>
        <box-button id="inspector-clear" label="Clear"></box-button>
      </div>
    </div>
    <div class="lab-term-body" id="inspector-body" hidden>
      <box-split-view
        id="inspector-split"
        class="lab-inspector-split"
        label="Request list and details"
      ></box-split-view>
    </div>
  `;

  const toggleBtn = root.querySelector("#inspector-toggle") as HTMLButtonElement;
  const body = root.querySelector("#inspector-body") as HTMLElement;
  const split = root.querySelector("#inspector-split") as BoxSplitViewElement;
  const countEl = root.querySelector("#inspector-count") as HTMLElement;
  const filterSelect = root.querySelector("#inspector-filter") as BoxSelectElement;

  const listEl = document.createElement("div");
  listEl.className = "lab-term-list";
  listEl.id = "inspector-list";
  listEl.slot = "primary";

  const detailEl = document.createElement("div");
  detailEl.className = "lab-term-detail";
  detailEl.id = "inspector-detail";

  split.resizable = true;
  split.ratio = loadSplitRatio();
  split.append(listEl, detailEl);

  filterSelect.options = [
    { label: "All", value: "all" },
    { label: "2xx", value: "2xx" },
    { label: "4xx", value: "4xx" },
    { label: "5xx", value: "5xx" },
    { label: "Errors", value: "error" },
  ];
  filterSelect.value = "all";

  let selectedId: string | null = null;
  let open = loadShelfOpen();

  const applyOpen = (): void => {
    root.classList.toggle("is-open", open);
    body.hidden = !open;
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      const height = loadShelfHeight();
      root.style.setProperty("--lab-term-height", `${height}px`);
    } else {
      root.style.removeProperty("--lab-term-height");
    }
    localStorage.setItem(SHELF_OPEN_KEY, open ? "1" : "0");
  };

  const setOpen = (next: boolean): void => {
    open = next;
    applyOpen();
    render();
  };

  toggleBtn.addEventListener("click", () => {
    setOpen(!open);
  });

  root.querySelector("#inspector-clear")?.addEventListener("click", () => {
    selectedId = null;
    session.traffic.clear();
  });

  filterSelect.addEventListener("value-changed", () => render());

  split.addEventListener("ratio-changed", ((event: CustomEvent<{ ratio: number }>) => {
    localStorage.setItem(SPLIT_RATIO_KEY, String(event.detail.ratio));
  }) as EventListener);

  // Drag the title bar to resize shelf height when open.
  const bar = root.querySelector("#inspector-bar") as HTMLElement;
  bar.addEventListener("pointerdown", (event) => {
    if (!open || event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("button, box-button, box-select")) {
      return;
    }
    const startY = event.clientY;
    const startHeight = loadShelfHeight();
    const onMove = (moveEvent: PointerEvent): void => {
      const delta = startY - moveEvent.clientY;
      const next = Math.max(180, Math.min(window.innerHeight * 0.7, startHeight + delta));
      root.style.setProperty("--lab-term-height", `${next}px`);
      localStorage.setItem(SHELF_HEIGHT_KEY, String(Math.round(next)));
    };
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  const render = (): void => {
    const all = session.traffic.list();
    countEl.textContent = String(all.length);
    if (!open) {
      return;
    }

    const entries = all.filter((entry) => matchesFilter(entry, filterSelect.value || "all"));
    if (entries.length === 0) {
      listEl.innerHTML = `<div class="lab-term-empty">No traffic yet — CMIS calls appear here as you browse.</div>`;
      detailEl.innerHTML = `<div class="lab-term-empty">Select a request.</div>`;
      return;
    }

    if (!selectedId || !entries.some((entry) => entry.id === selectedId)) {
      selectedId = entries[0]?.id ?? null;
    }

    listEl.innerHTML = `
      <table class="lab-term-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Method</th>
            <th>URL</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map((entry) => {
              const shortUrl = shortenUrl(entry.url);
              return `
                <tr data-id="${escapeHtml(entry.id)}" data-clickable="true" aria-selected="${
                  entry.id === selectedId ? "true" : "false"
                }">
                  <td class="lab-term-status">${entry.status || "ERR"}</td>
                  <td>${escapeHtml(entry.method)}</td>
                  <td title="${escapeHtml(entry.url)}">${escapeHtml(shortUrl)}</td>
                  <td>${entry.durationMs}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    listEl.querySelectorAll("tr[data-id]").forEach((row) => {
      row.addEventListener("click", () => {
        selectedId = row.getAttribute("data-id");
        render();
      });
    });

    const selected = entries.find((entry) => entry.id === selectedId) ?? null;
    detailEl.innerHTML = selected
      ? renderDetail(selected)
      : `<div class="lab-term-empty">Select a request.</div>`;
  };

  (root as HTMLElement & { openShelf: () => void; toggleShelf: () => void }).openShelf = () => {
    setOpen(true);
  };
  (root as HTMLElement & { openShelf: () => void; toggleShelf: () => void }).toggleShelf = () => {
    setOpen(!open);
  };

  session.traffic.subscribe(render);
  session.subscribe(render);
  applyOpen();
  render();
  return root;
}

export function openInspectorShelf(shelf: HTMLElement): void {
  const openShelf = (shelf as HTMLElement & { openShelf?: () => void }).openShelf;
  openShelf?.();
}

export function toggleInspectorShelf(shelf: HTMLElement): void {
  const toggleShelf = (shelf as HTMLElement & { toggleShelf?: () => void }).toggleShelf;
  toggleShelf?.();
}

function loadShelfOpen(): boolean {
  return localStorage.getItem(SHELF_OPEN_KEY) === "1";
}

function loadShelfHeight(): number {
  const raw = localStorage.getItem(SHELF_HEIGHT_KEY);
  const value = raw ? Number(raw) : 280;
  if (!Number.isFinite(value)) {
    return 280;
  }
  return Math.max(180, Math.min(window.innerHeight * 0.7, value));
}

function loadSplitRatio(): number {
  const raw = localStorage.getItem(SPLIT_RATIO_KEY);
  const value = raw ? Number(raw) : 0.34;
  if (!Number.isFinite(value)) {
    return 0.34;
  }
  return Math.max(0.2, Math.min(0.8, value));
}

function matchesFilter(entry: TrafficEntry, filter: string): boolean {
  switch (filter) {
    case "all":
      return true;
    case "2xx":
      return entry.status >= 200 && entry.status < 300;
    case "4xx":
      return entry.status >= 400 && entry.status < 500;
    case "5xx":
      return entry.status >= 500 && entry.status < 600;
    case "error":
      return Boolean(entry.error) || entry.status === 0 || entry.status >= 400;
    default: {
      const _exhaustive: never = filter as never;
      void _exhaustive;
      return true;
    }
  }
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function renderDetail(entry: TrafficEntry): string {
  return `
    <div class="lab-term-summary">
      <span class="lab-term-pill">${escapeHtml(entry.method)}</span>
      <span class="lab-term-pill lab-term-pill-status">${entry.status || "ERR"}</span>
      <span class="lab-term-meta">${entry.durationMs} ms · ${escapeHtml(
        new Date(entry.startedAt).toLocaleTimeString(),
      )}</span>
    </div>
    <div class="lab-term-url"><code>${escapeHtml(entry.url)}</code></div>
    ${
      entry.error
        ? `<div class="lab-term-error">${escapeHtml(entry.error)}</div>`
        : ""
    }
    <div class="lab-term-block">
      <div class="lab-term-block-label">Request headers</div>
      <pre class="lab-code">${escapeHtml(JSON.stringify(entry.requestHeaders, null, 2))}</pre>
    </div>
    <div class="lab-term-block">
      <div class="lab-term-block-label">Request body</div>
      <pre class="lab-code">${escapeHtml(entry.requestBodyPreview || "(empty)")}</pre>
    </div>
    <div class="lab-term-block">
      <div class="lab-term-block-label">Response headers</div>
      <pre class="lab-code">${escapeHtml(JSON.stringify(entry.responseHeaders, null, 2))}</pre>
    </div>
    <div class="lab-term-block">
      <div class="lab-term-block-label">Response body</div>
      <pre class="lab-code">${escapeHtml(formatMaybeJson(entry.responseBodyPreview) || "(empty)")}</pre>
    </div>
  `;
}

function formatMaybeJson(text: string | undefined): string {
  if (!text) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
