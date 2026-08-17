import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const out = process.argv[2] ?? new URL("../assets/screenshot.png", import.meta.url).pathname;
const targetName = "Agent Demo";
const targetId = "folder:335620450992";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--window-size=1440,900", "--hide-scrollbars"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.setDefaultTimeout(45000);

await page.evaluateOnNewDocument(() => {
  localStorage.setItem("box-cmis-lab.inspector-shelf-open", "1");
});

await page.goto("http://localhost:5173/?shot=" + Date.now(), { waitUntil: "networkidle0" });
await page.waitForSelector("box-dialog");

await page.evaluate(() => {
  const dialog = document.querySelector("box-dialog");
  const mode = dialog.querySelector("#connect-auth-mode");
  mode.value = "ccg";
  mode.dispatchEvent(new CustomEvent("value-changed", { detail: { value: "ccg" } }));
  dialog.querySelector("#ccg-subject-id").value = "5105484";
  dialog.querySelector("#connect-load")?.click();
});

await page.waitForFunction(() => {
  const select = document.querySelector("box-dialog #connect-repo");
  return select?.value === "box" || (select?.options?.length ?? 0) > 0;
});

await page.evaluate(() => {
  const dialog = document.querySelector("box-dialog");
  const select = dialog.querySelector("#connect-repo");
  if (!select.value) select.value = "box";
  const confirm = dialog.shadowRoot?.querySelector('[part="confirm"]');
  if (confirm) confirm.click();
  else dialog.dispatchEvent(new CustomEvent("confirm"));
});

await page.waitForSelector("box-tree-grid");
await page.waitForFunction(() => {
  const tree = document.querySelector("box-tree-grid");
  if (!tree || tree.hidden) {
    return false;
  }
  const items = tree.items ?? [];
  if (items.length === 0) {
    return false;
  }
  const first = items[0]?.label ?? "";
  return first && first !== "Loading…" && first !== "No items loaded";
}, { timeout: 40000 });

const treeState = await page.evaluate((targetName, targetId) => {
  const tree = document.querySelector("box-tree-grid");
  const items = tree?.items ?? [];
  const names = items.map((item) => item.label);
  const match =
    items.find((item) => item.label === targetName) ??
    items.find((item) => item.value === targetId);
  if (match) {
    tree.value = match.value;
    tree.dispatchEvent(new CustomEvent("value-changed", { detail: { value: match.value } }));
  }
  return { names, selected: match?.value ?? null, count: items.length };
}, targetName, targetId);
console.log("root folders", JSON.stringify(treeState, null, 2));

if (!treeState.selected) {
  throw new Error(`Could not find ${targetName} (${targetId}) in tree`);
}

await page.waitForFunction((id, name) => {
  const text = document.body?.innerText ?? "";
  return text.includes("DETAILS") && text.includes(name) && text.includes(id.replace("folder:", ""));
}, { timeout: 20000 }, treeState.selected, targetName);

await page.waitForFunction(() => {
  const path = document.querySelector("#tree-path")?.value ?? "";
  return path.includes("Agent Demo");
}, { timeout: 15000 });

await page.evaluate(() => {
  document.querySelector("#btn-browse")?.click();
  const shelf = document.querySelector(".lab-inspector-shelf");
  if (shelf && !shelf.classList.contains("is-open")) {
    document.querySelector("#inspector-toggle")?.click();
  }
});

await page.waitForFunction(() => {
  const shelf = document.querySelector(".lab-inspector-shelf");
  const body = document.querySelector("#inspector-body");
  return Boolean(shelf?.classList.contains("is-open") && body && !body.hidden);
});

await page.waitForFunction(() => {
  const rows = document.querySelectorAll(".lab-term-table tbody tr");
  return rows.length > 0;
}, { timeout: 15000 });

await new Promise((r) => setTimeout(r, 1200));

const after = await page.evaluate((targetName) => {
  const tree = document.querySelector("box-tree-grid");
  const match = (tree?.items ?? []).find((item) => item.label === targetName);
  return {
    childNames: (match?.children ?? []).map((child) => child.label),
    path: document.querySelector("#tree-path")?.value ?? "",
    inspectorOpen: document.querySelector(".lab-inspector-shelf")?.classList.contains("is-open") ?? false,
    requestCount: document.querySelector("#inspector-count")?.textContent ?? "0",
    treeCount: (tree?.items ?? []).length,
  };
}, targetName);
console.log("agent demo", JSON.stringify(after, null, 2));

await page.screenshot({ path: out, type: "png" });
console.log("wrote", out);
await browser.close();
