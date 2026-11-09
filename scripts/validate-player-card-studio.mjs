import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const { computeCombinedPlayerStats, getAwards, playerOVR } = await import("../js/leagueEngine.js");
const { NAV_LINKS } = await import("../js/config.js");
const seasons = await loadAllSeasons(["2024", "2025", "2026"], ["teams", "players", "matches", "awards"]);
const players = computeCombinedPlayerStats(seasons, { stage: "all" });
const awards = getAwards(seasons, { season: "All", division: "All" });

assert.ok(players.length >= 82, "the studio includes the complete 2026 Seniors roster");
assert.equal(new Set(players.map((player) => player.id)).size, players.length, "each selectable player has one stable ID");
const ratingSamples = [players[0], players[Math.floor(players.length / 2)], players.at(-1)];
assert.ok(ratingSamples.every((player) => Number.isFinite(playerOVR(player, players)) && playerOVR(player, players) >= 0 && playerOVR(player, players) <= 99), "player cards use the shared OVR formula");
assert.ok(awards.length > 0, "verified season award data is available for card honors");
const goalkeepers = players.filter((player) => /goalkeeper|goalie|\bgk\b/i.test(player.position || ""));
assert.ok(goalkeepers.length > 0, "goalkeeper records are present");
assert.ok(goalkeepers.some((player) => Number(player.goalkeeperGames) > 0 && Number.isFinite(player.goalsAgainstPerGame)), "recorded goalkeeper appearances include a calculated GAA");
assert.deepEqual(seasons.map((season) => String(season.year)), ["2024", "2025", "2026"], "card career sources exclude future projections");

const page = await readFile(resolve(siteRoot, "player-card-studio.html"), "utf8");
const controller = await readFile(resolve(siteRoot, "js/playerCardStudio.js"), "utf8");
const studioStyles = await readFile(resolve(siteRoot, "css/player-card-studio.css"), "utf8");
const profilePage = await readFile(resolve(siteRoot, "player.html"), "utf8");
const profileController = await readFile(resolve(siteRoot, "js/playerProfile.js"), "utf8");
const profileStyles = await readFile(resolve(siteRoot, "css/player-profile.css"), "utf8");
const serviceWorker = await readFile(resolve(siteRoot, "service-worker.js"), "utf8");

assert.ok(NAV_LINKS.some((link) => link.label === "Card Studio" && link.href === "player-card-studio.html"));
assert.match(page, /playerCardStudio\.js\?v=20261109-cardstudio1/);
assert.match(page, /player-card-studio\.css\?v=20261109-cardstudio1/);
assert.match(controller, /loadAllSeasons\(\["2024", "2025", "2026"\]/);
assert.match(controller, /canvas\.toBlob/);
assert.match(controller, /navigator\.share/);
assert.match(controller, /playerOVR\(record, players\)/);
assert.match(controller, /getAwards/);
assert.match(controller, /Verified LSL data through 2026/);
assert.match(controller, /GAA/);
assert.match(studioStyles, /prefers-reduced-motion/);
assert.match(profilePage, /player-profile\.css\?v=20261109-cardstudio1/);
assert.match(profileController, /Create Player Card/);
assert.match(profileController, /Goals Against \/ Game/);
assert.match(profileController, /Clean Sheets/);
assert.match(profileStyles, /@media \(max-width: 700px\)/);
assert.match(serviceWorker, /lsl-cache-v146/);
assert.match(serviceWorker, /\.\/player-card-studio\.html/);
assert.match(serviceWorker, /\.\/js\/playerCardStudio\.js\?v=20261109-cardstudio1/);
assert.match(serviceWorker, /\/js\/playerCardStudio\.js/);

console.log("Player Card Studio checks passed: " + players.length + " unique player cards, shared OVR calculations, recorded goalkeeper rates, source-backed honors, profile entry points, reduced-motion styling, and service-worker updates.");
