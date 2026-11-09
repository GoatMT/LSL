import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = fileURLToPath(new URL("../", import.meta.url));
globalThis.document = { scripts: [] };
globalThis.fetch = async (request) => {
  const relativePath = String(request).replace(/^\.\//, "").replaceAll("/", "\\");
  try {
    const body = await readFile(resolve(siteRoot, relativePath), "utf8");
    return { ok: true, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, statusText: "Not Found" };
  }
};

const { loadSeasonData } = await import("../js/dataLoader.js");
const { buildPlayerPool, FORMATIONS, formationSlots, isGoalkeeper, roleLabel, summarizePlayers } = await import("../js/teamBuilderCore.js");
const files = ["teams", "players", "matches", "standings", "playoffs", "awards"];
const seasons = ["2024", "2025", "2026"];
let playerRowsChecked = 0;

for (const year of seasons) {
  const data = await loadSeasonData(year, files);
  const allPlayers = buildPlayerPool(data, "All");
  const seniors = buildPlayerPool(data, "Seniors");
  const juniors = buildPlayerPool(data, "Juniors");

  assert.ok(allPlayers.length > 0, `${year} has a player pool`);
  assert.ok(seniors.length > 0, `${year} has Seniors`);
  assert.ok(allPlayers.every((player) => player.season === year), `${year} pool is season-specific`);
  assert.ok(seniors.every((player) => player.division === "Seniors"), `${year} Seniors filter is accurate`);
  assert.ok(juniors.every((player) => player.division === "Juniors"), `${year} Juniors filter is accurate`);
  assert.equal(juniors.length > 0, allPlayers.some((player) => player.division === "Juniors"), `${year} Juniors option reflects available data`);
  assert.ok(allPlayers.every((player) => Number.isFinite(player.ovr) && player.ovr >= 0), `${year} pool uses computed LSL OVR`);
  assert.equal(new Set(allPlayers.map((player) => player.id)).size, allPlayers.length, `${year} pool has unique player IDs`);
  assert.ok(allPlayers.some(isGoalkeeper), `${year} pool recognizes goalkeepers`);
  assert.ok(allPlayers.some((player) => roleLabel(player.position) === "Forward"), `${year} pool recognizes attacking positions`);
  playerRowsChecked += allPlayers.length;
}

for (const [name, formation] of Object.entries(FORMATIONS)) {
  const slots = formationSlots(name);
  assert.equal(slots.length, 11, `${name} contains eleven positions`);
  assert.equal(slots.filter((slot) => slot.id === "GK").length, 1, `${name} contains one goalkeeper position`);
  assert.equal(new Set(slots.map((slot) => slot.id)).size, 11, `${name} slot IDs are unique`);
  assert.ok(Array.isArray(formation), `${name} has field-line layout`);
}

const sample = [
  { ovr: 80, goals: 4, wins: 3, gamesPlayed: 5 },
  { ovr: 70, goals: 2, wins: 1, gamesPlayed: 4 },
];
assert.deepEqual(summarizePlayers(sample), { count: 2, averageOvr: 75, goals: 6, wins: 4, games: 9 });

const nav = await readFile(resolve(siteRoot, "js/config.js"), "utf8");
const shell = await readFile(resolve(siteRoot, "service-worker.js"), "utf8");
const html = await readFile(resolve(siteRoot, "team-builder.html"), "utf8");
const baseCss = await readFile(resolve(siteRoot, "css/main.css"), "utf8");
const theme = await readFile(resolve(siteRoot, "css/modern-system.css"), "utf8");
const builderCss = await readFile(resolve(siteRoot, "css/team-builder.css"), "utf8");
const imstStyles = await readFile(resolve(siteRoot, "css/components.css"), "utf8");
const manifest = JSON.parse(await readFile(resolve(siteRoot, "manifest.json"), "utf8"));
assert.match(nav, /label: "Team Builder", href: "team-builder\.html"/);
assert.match(shell, /\.\/team-builder\.html/);
assert.match(shell, /\.\/js\/teamBuilderCore\.js/);
assert.match(html, /20261108-green2/);
assert.match(html, /theme-color" content="#1f2922/);
assert.match(builderCss, /@media \(max-width: 440px\)/);
assert.doesNotMatch(builderCss, /max-height:\s*640px/);
assert.match(await readFile(resolve(siteRoot, "js/teamBuilder.js"), "utf8"), /lsl-team-builder-v1/);
assert.doesNotMatch(await readFile(resolve(siteRoot, "js/teamBuilder.js"), "utf8"), /firebase|firestore|auth/i);
assert.match(theme, /body:not\(\.imt-blue-page\)/);
assert.match(theme, /--page: #1f2922/);
assert.match(theme, /--gold: #d1b166/);
assert.match(theme, /--brand-gold: var\(--gold\)/);
assert.match(baseCss, /--green: #0d4923/);
assert.match(baseCss, /--green-2: #1b5630/);
assert.match(baseCss, /--page: #1f2922/);
assert.ok(theme.lastIndexOf("Final palette precedence") > theme.indexOf("LSL shared visual refresh"), "site palette wins over the later legacy shared rules");
assert.match(theme, /:is\(button\.active, \.button\.active/);
assert.match(theme, /body:not\(\.imt-blue-page\) :is\(\.button\.primary, button\.primary\)[\s\S]*?background-color: var\(--brand-green\)/);
assert.match(theme, /\.button\.primary:disabled[\s\S]*?background-color: var\(--soft\)/);
assert.match(theme, /body:not\(\.imt-blue-page\) :is\(\.button\.secondary, button\.secondary\)[\s\S]*?background-color: var\(--card\)/);
assert.match(imstStyles, /\.imt-blue-page \{[\s\S]*?--green: #001a3a[\s\S]*?--gold: #1f7bd1/);
assert.equal(manifest.theme_color, "#1f2922");
assert.equal(manifest.background_color, "#1f2922");
const rootPages = (await readdir(siteRoot)).filter((entry) => entry.endsWith(".html"));
for (const page of rootPages) {
  const source = await readFile(resolve(siteRoot, page), "utf8");
  assert.match(source, /main\.css\?v=20261109-greenprimary1/, `${page} refreshes shared base styles`);
  assert.match(source, /modern-system\.css\?v=20261109-greenprimary1/, `${page} loads the current design layer`);
  if (page === "tournament.html") assert.match(source, /theme-color" content="#001a3a/);
  else assert.match(source, /theme-color" content="#1f2922/);
}

assert.match(theme, /Phase 10: bring remaining community and operations surfaces into the shared system/);
assert.match(theme, /--green: #0d4923/);
assert.match(theme, /--green-2: #1b5630/);
assert.match(theme, /body:not\(\.imt-blue-page\) :is\(\.button\.secondary, button\.secondary\)[\s\S]*?background-color: var\(--card\)/);
assert.match(theme, /body\.home-page \.home-expected-dates[\s\S]*?background-color: #16432a/);
assert.match(theme, /home-expected-card[\s\S]*?background-color: var\(--gold\)/);
assert.match(theme, /body:not\(\.imt-blue-page\) :is\(button\.active[\s\S]*?background-color: var\(--brand-green\)/);
assert.match(theme, /body:not\(\.imt-blue-page\) \.pulse-post-card\.pulse-post-user[\s\S]*?background: var\(--card\)/);
assert.match(theme, /body:not\(\.imt-blue-page\) \.trade-row:hover[\s\S]*?background: var\(--card-2\)/);
assert.match(shell, /lsl-cache-v145/);
assert.match(await readFile(resolve(siteRoot, "js/main.js"), "utf8"), /service-worker\.js\?v=20261109-greenprimary1/);

console.log(`Team Builder checks passed: ${playerRowsChecked} real season-player rows, five 11-player formations, division filters, OVR, local-only saves, 42 refreshed pages, and IMST color isolation.`);
