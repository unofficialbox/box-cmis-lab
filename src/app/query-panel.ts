import type { BoxTextAreaElement } from "@unofficialbox/box-open-elements/components/forms/text-area";
import type { BoxTextFieldElement } from "@unofficialbox/box-open-elements/components/forms/text-field";
import { getObject } from "../cmis/api.js";
import {
  flattenProperties,
  getBaseTypeId,
  propertyValue,
} from "../cmis/properties.js";
import { session } from "../session/store.js";
import { openFolder, runQuery, selectObject } from "./actions.js";
import { escapeAttr, escapeHtml } from "./html.js";

const DEFAULT_QUERY = "SELECT * FROM cmis:document";

export function createQueryPanel(): HTMLElement {
  const root = document.createElement("section");
  root.className = "lab-pane lab-stack";
  root.innerHTML = `
    <h2>Query</h2>
    <p class="lab-muted" id="query-capability"></p>
    <box-text-area id="query-sql" label="CMIS SQL" rows="6"></box-text-area>
    <div class="lab-row">
      <box-text-field id="query-max" label="Max items"></box-text-field>
      <box-text-field id="query-skip" label="Skip count"></box-text-field>
      <box-button id="query-run" label="Run query" tone="primary"></box-button>
    </div>
    <p class="lab-muted" id="query-meta"></p>
    <div id="query-results"></div>
  `;

  const sql = root.querySelector("#query-sql") as BoxTextAreaElement;
  const maxField = root.querySelector("#query-max") as BoxTextFieldElement;
  const skipField = root.querySelector("#query-skip") as BoxTextFieldElement;
  const capability = root.querySelector("#query-capability") as HTMLElement;
  const meta = root.querySelector("#query-meta") as HTMLElement;
  const resultsEl = root.querySelector("#query-results") as HTMLElement;
  const runBtn = root.querySelector("#query-run") as HTMLElement & { disabled: boolean };

  sql.value = DEFAULT_QUERY;
  maxField.value = "50";
  skipField.value = "0";

  runBtn.addEventListener("click", () => {
    const statement = sql.value.trim();
    if (!statement) {
      session.setError("Enter a CMIS SQL statement.");
      return;
    }
    void runQuery(statement, {
      maxItems: Number(maxField.value) || 50,
      skipCount: Number(skipField.value) || 0,
    });
  });

  const render = (): void => {
    const state = session.getState();
    const canQuery = session.canQuery();
    runBtn.disabled = !state.connected || !canQuery;
    capability.textContent = !state.connected
      ? "Connect to enable queries."
      : canQuery
        ? `capabilityQuery=${String(state.repositoryInfo?.capabilities?.capabilityQuery)}`
        : "This repository does not advertise query support.";

    const results = state.queryResults?.results ?? [];
    const numItems = state.queryResults?.numItems ?? results.length;
    meta.textContent = state.queryResults
      ? `${results.length} rows · numItems=${numItems}${
          state.queryResults.hasMoreItems ? " · hasMoreItems" : ""
        }`
      : "";

    if (!state.queryResults) {
      resultsEl.innerHTML = `<box-empty-state heading="No results yet" description="Run a CMIS query to populate this table."></box-empty-state>`;
      return;
    }

    if (results.length === 0) {
      resultsEl.innerHTML = `<box-empty-state heading="Empty result set" description="The query completed with zero rows."></box-empty-state>`;
      return;
    }

    resultsEl.innerHTML = `
      <table class="lab-table">
        <thead>
          <tr>
            <th>Object ID</th>
            <th>Name</th>
            <th>Base type</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map((result, index) => {
              const id = String(
                propertyValue(
                  result.succinctProperties ?? result.properties ?? {},
                  "cmis:objectId",
                ) ?? "",
              );
              const name = String(
                propertyValue(
                  result.succinctProperties ?? result.properties ?? {},
                  "cmis:name",
                ) ?? "",
              );
              const baseType = String(
                propertyValue(
                  result.succinctProperties ?? result.properties ?? {},
                  "cmis:baseTypeId",
                ) ?? "",
              );
              const preview = flattenProperties(result)
                .slice(0, 4)
                .map((row) => `${row.id}=${row.value}`)
                .join("; ");
              return `
                <tr data-index="${index}" data-object-id="${escapeAttr(id)}" data-clickable="${
                  id ? "true" : "false"
                }">
                  <td><code>${escapeHtml(id)}</code></td>
                  <td>${escapeHtml(name)}</td>
                  <td>${escapeHtml(baseType)}</td>
                  <td class="lab-muted">${escapeHtml(preview)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    resultsEl.querySelectorAll("tr[data-object-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-object-id");
        if (!id) {
          return;
        }
        void openQueryHit(id);
      });
    });
  };

  session.subscribe(render);
  render();
  return root;
}

async function openQueryHit(objectId: string): Promise<void> {
  const client = session.getClient();
  if (!client) {
    return;
  }
  session.setLoading(true);
  try {
    const object = await getObject(client, objectId);
    if (getBaseTypeId(object) === "cmis:folder") {
      await openFolder(objectId);
      session.setView("browse");
      return;
    }
    await selectObject(object);
    session.setView("browse");
  } catch (error) {
    session.setError(error instanceof Error ? error.message : String(error));
  }
}
