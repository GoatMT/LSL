import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = fileURLToPath(new URL("../", import.meta.url));
globalThis.fetch = async (request) => {
  const relativePath = String(request).replace(/^\.\//, "").replaceAll("/", "\\");
  try {
    const body = await readFile(resolve(siteRoot, relativePath), "utf8");
    return { ok: true, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, statusText: "Not Found" };
  }
};

const { loadAllSeasons } = await import("../js/dataLoader.js");
const [partners, seasons, page, moduleSource, styles, config, serviceWorker] = await Promise.all([
  readFile(resolve(siteRoot, "data/shared/partners.json"), "utf8").then(JSON.parse),
  loadAllSeasons(["2024", "2025", "2026"], ["teams"]),
  readFile(resolve(siteRoot, "unites.html"), "utf8"),
  readFile(resolve(siteRoot, "js/unites.js"), "utf8"),
  readFile(resolve(siteRoot, "css/unites.css"), "utf8"),
  readFile(resolve(siteRoot, "js/config.js"), "utf8"),
  readFile(resolve(siteRoot, "service-worker.js"), "utf8"),
]);

assert.equal(partners.partners.length, 1, "the known footer partner is recorded once");
assert.equal(partners.partners[0].name, "Lantern of Knowledge Academy");
assert.equal(partners.partners[0].seasons, null, "unrecorded partnership seasons remain unknown");
assert.deepEqual(partners.sponsors, [], "no unsupported sponsor names are invented");
await access(resolve(siteRoot, partners.partners[0].logo.replace(/^\.\//, "")));

const teamCount = seasons.reduce((total, season) => total + (season.teams || []).length, 0);
assert.ok(teamCount > 0, "historical team identities load from real season data");
for (const season of seasons) {
  for (const team of season.teams || []) {
    assert.ok(team.id && team.name, "team archive entries retain stable ids and names");
    if (team.logo) await access(resolve(siteRoot, team.logo.replace(/^\.\//, "")));
  }
}

assert.match(page, /LSL Unites/);
assert.match(page, /unites\.css\?v=20261121-unites1/);
assert.match(page, /unites\.js\?v=20261121-unites1/);
assert.match(moduleSource, /Sponsors who support LSL/);
assert.match(moduleSource, /not presented as sponsors/);
assert.match(moduleSource, /addEventListener\("input"/);
assert.match(moduleSource, /unites-season/);
assert.match(moduleSource, /unites-division/);
assert.match(styles, /@media \(max-width: 620px\)/);
assert.match(styles, /prefers-reduced-motion/);
assert.match(config, /label: "LSL Unites", href: "unites\.html"/);
assert.match(serviceWorker, /lsl-cache-v153/);
assert.match(serviceWorker, /\.\/unites\.html/);
assert.match(serviceWorker, /\.\/data\/shared\/partners\.json/);
assert.match(serviceWorker, /\.\/js\/unites\.js\?v=20261121-unites1/);
assert.match(serviceWorker, /\/js\/unites\.js/);

console.log(`LSL Unites checks passed: ${partners.partners.length} confirmed league partner, ${partners.sponsors.length} verified sponsor records, ${teamCount} archived team-season entries, local logos, filters, navigation, responsive styling, and cache updates verified.`);
