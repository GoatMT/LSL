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
const { buildPlayerProjections } = await import("../js/playerProjectionModel.js");
const { NAV_LINKS } = await import("../js/config.js");
const seasons = await loadAllSeasons(["2024", "2025", "2026"], ["teams", "players", "matches"]);
const projections = buildPlayerProjections(seasons);
const juniorProjections = buildPlayerProjections(seasons, 2027, "Juniors");

assert.equal(projections.targetSeason, 2027);
assert.equal(projections.sourceSeason, 2026);
assert.ok(NAV_LINKS.some((link) => link.label === "Projections" && link.href === "projected.html"));
assert.equal(projections.players.length, 82, "all 2026 Seniors roster players are represented");
assert.equal(projections.scheduleBaseline, 7, "the 2027 schedule assumption matches the 2026 team median");
assert.equal(projections.coverage.scoreboardGoals, 135);
assert.equal(projections.coverage.scorerGoals, 125);
assert.equal(projections.coverage.playerLinkedGoals, 125);
assert.equal(projections.coverage.unattributedGoals, 10, "uncredited goals remain unattributed");
assert.deepEqual(projections.scoringCoverageBySeason.map(({ year, unattributedGoals }) => [year, unattributedGoals]), [[2024, 11], [2025, 0], [2026, 10]]);
assert.deepEqual(projections.scoringCoverageBySeason.map(({ year, unlinkedGoals }) => [year, unlinkedGoals]), [[2024, 1], [2025, 2], [2026, 0]]);
assert.equal(projections.players.filter((player) => player.role === "goalkeeper").length, 8);
assert.ok(projections.players.every((player) => player.teamScenario.startsWith("Retain 2026 ")));
assert.ok(projections.players.every((player) => Number.isFinite(player.projectedGames) && player.projectedGames >= 0 && player.projectedGames <= 7));
assert.ok(projections.players.every((player) => Number.isFinite(player.projectedGoals) && player.projectedGoals >= 0));
assert.ok(projections.players.every((player) => Math.abs(player.projectedWins + player.projectedTies + player.projectedLosses - player.projectedGames) < 1e-8));
assert.ok(projections.players.filter((player) => player.role === "goalkeeper").every((player) => Number.isFinite(player.projectedGaa)));
assert.equal(juniorProjections.players.length, 0, "no junior forecasts are fabricated without a 2026 player dataset");

const novemberBirth = projections.players.find((player) => player.name === "Taaha Nakhuda");
assert.equal(novemberBirth?.ageLabel, "16", "November birthdays use age at the expected June 2027 start, not a calendar-year guess");
assert.equal(novemberBirth?.ageSource, "year-month");
const unknownAge = projections.players.find((player) => player.ageLabel === "Not recorded");
assert.equal(unknownAge?.ageAdjustment, "No age adjustment");

const page = await readFile(resolve(siteRoot, "projected.html"), "utf8");
const controller = await readFile(resolve(siteRoot, "js/projected.js"), "utf8");
const stylesheet = await readFile(resolve(siteRoot, "css/projected.css"), "utf8");
const serviceWorker = await readFile(resolve(siteRoot, "service-worker.js"), "utf8");
const data = JSON.parse(await readFile(resolve(siteRoot, "data/2027/projected.json"), "utf8"));
assert.match(page, /projected\.css\?v=20261109-playerproj1/);
assert.match(page, /projected\.js\?v=20261109-playerproj1/);
assert.match(controller, /Player Projections/);
assert.match(controller, /Team scenario/);
assert.match(controller, /2026 goals/);
assert.match(controller, /No player projections match these filters/);
assert.match(stylesheet, /prefers-reduced-motion/);
assert.match(serviceWorker, /lsl-cache-v146/);
assert.match(serviceWorker, /\.\/js\/playerProjectionModel\.js/);
assert.match(data.summary, /2024-2026 Seniors records/);
assert.equal(data.lastUpdated, "November 9, 2026");

console.log(`Projection checks passed: ${projections.players.length} 2027 Seniors simulations, ${projections.players.filter((player) => player.role === "goalkeeper").length} goalkeepers, schedule/team scenarios, age ranges, scorer gaps, no fabricated Juniors rows, and responsive controls.`);
