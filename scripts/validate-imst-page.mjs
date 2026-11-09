import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = fileURLToPath(new URL("../", import.meta.url));
const elements = new Map();
const makeElement = (id = "") => ({
  id,
  innerHTML: "",
  dataset: {},
  listeners: new Map(),
  classList: { add() {}, contains() { return false; } },
  style: { setProperty() {} },
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  },
  focus() {},
  querySelectorAll() { return []; },
  querySelector() { return null; },
});
const root = makeElement("page-root");
const views = ["home", "schedule", "standings", "bracket", "teams", "lantern", "news", "media"]
  .map((id) => Object.assign(makeElement(`view-${id}`), { dataset: { imtView: id } }));
const standings = ["west", "east", "combined"]
  .map((id) => Object.assign(makeElement(`standings-${id}`), { dataset: { imtStandings: id } }));
root.querySelectorAll = (selector) => selector === "[data-imt-view]" ? views : selector === "[data-imt-standings]" ? standings : [];
const yearControl = makeElement("imt-year");
const navbar = makeElement("site-navbar");
const footer = makeElement("site-footer");
for (const item of [root, yearControl, navbar, footer]) elements.set(item.id, item);

globalThis.document = {
  body: { classList: { add() {} } },
  getElementById(id) { return elements.get(id) || makeElement(id); },
  createElement() { return makeElement(); },
};
globalThis.window = {
  location: { hash: "#bracket", pathname: "/tournament.html" },
  history: { replaceState() {} },
  requestAnimationFrame(callback) { callback(); },
};
globalThis.MutationObserver = class { observe() {} };
globalThis.fetch = async (request) => {
  const relativePath = String(request).replace(/^\.\//, "").replaceAll("/", "\\");
  try {
    const body = await readFile(resolve(siteRoot, relativePath), "utf8");
    return { ok: true, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, statusText: "Not Found" };
  }
};

await import("../js/tournament.js?imt-page-test=1");
await new Promise((resolve) => setTimeout(resolve, 20));

async function selectYear(year) {
  const listeners = yearControl.listeners.get("change") || [];
  assert.ok(listeners.length, "tournament year selector is connected");
  await listeners.at(-1)({ target: { value: year } });
}

function selectView(id) {
  const button = views.find((item) => item.dataset.imtView === id);
  const listeners = button?.listeners.get("click") || [];
  assert.ok(listeners.length, `${id} navigation is connected`);
  listeners.at(-1)();
}

await selectYear("2025");
selectView("bracket");
assert.match(root.innerHTML, /Grand Final/);
assert.match(root.innerHTML, /Hifz City/);
assert.match(root.innerHTML, />4</);
assert.doesNotMatch(root.innerHTML, />undefined</);

await selectYear("2026");
selectView("bracket");
assert.match(root.innerHTML, /Championship Final/);
assert.match(root.innerHTML, /Islamic Foundation of Toronto/);
assert.match(root.innerHTML, /Khairul Ummah Academy/);
assert.match(root.innerHTML, />3</);
assert.doesNotMatch(root.innerHTML, />undefined</);
selectView("schedule");
assert.match(root.innerHTML, /Quarter-Finals/);
assert.match(root.innerHTML, /Semi-Finals/);
assert.match(root.innerHTML, /Championship Final/);

await selectYear("2024");
assert.match(root.innerHTML, /No 2024 Tournament Results/);
assert.match(root.innerHTML, /did not start until 2025/i);
assert.doesNotMatch(root.innerHTML, /Champion: Hifz City/);

console.log("Inter-Madrasah page renders 2024, 2025, and 2026 bracket/schedule states correctly.");
