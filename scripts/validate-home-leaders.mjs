import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const { loadAllSeasons } = await import("../js/dataLoader.js");
const { computePlayerStats } = await import("../js/leagueEngine.js");
const { homeLeaderRows, renderHomeContent } = await import("../js/main.js");
const seasons = await loadAllSeasons(["2024", "2025", "2026"], ["teams", "players", "matches", "standings", "playoffs", "awards"]);
const current = seasons.find((season) => season.year === "2026");
const goals = homeLeaderRows(current, { key: "goals", valueKey: "goals" }, seasons);
const goalies = homeLeaderRows(current, { key: "goalies", valueKey: "wins" }, seasons);
const rookies = homeLeaderRows(current, { key: "rookies", valueKey: "goals" }, seasons);
const priorPlayers = new Set(seasons.filter((season) => Number(season.year) < 2026)
  .flatMap((season) => computePlayerStats(season, { stage: "all" }))
  .filter((player) => player.gamesPlayed > 0)
  .map((player) => player.id));

assert.ok(goals.length > 0, "2026 player goals tab has leaders");
assert.ok(goalies.length > 0, "2026 goalkeeper tab has leaders");
assert.ok(goalies.every((player) => /goal\s*keeper|goalie|\bgk\b/i.test(player.position)), "goalkeeper tab contains goalkeepers only");
assert.ok(goalies.every((player, index) => index === 0 || goalies[index - 1].wins >= player.wins), "goalkeepers are ordered by wins");
assert.ok(rookies.length > 0, "2026 first-season tab has leaders");
assert.ok(rookies.every((player) => !priorPlayers.has(player.id)), "rookies have no recorded prior LSL appearances");
assert.ok(goals.length <= 10 && goalies.length <= 10 && rookies.length <= 10, "each tab is capped at the top ten");

const home = renderHomeContent(current, seasons);
const leaderCategories = [...home.matchAll(/data-home-leader-stat="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(leaderCategories, ["goals", "goalies", "rookies"]);
assert.ok(home.indexOf("2027 Expected Dates") < home.indexOf("Congratulations, EM Haulers FC!"), "2027 dates are the first homepage section");
assert.doesNotMatch(home, /score-ticker-bar|Extremely Important News|Crazy Stats &amp; Records/);

console.log(`2026 leaders verified: ${goals.length} scorers, ${goalies.length} goalkeepers, ${rookies.length} first-season players.`);
