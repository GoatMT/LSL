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
const { renderStartingSevenPanel, resolveConfirmedStartingSeven } = await import("../js/teamStartingSeven.js");
const seasons = await loadAllSeasons(["2024", "2025", "2026"], ["teams"]);
const slots = ["GK", "LB", "RB", "LM", "CM", "RM", "ST"];
const roster = slots.map((slot, index) => ({
  id: "lineup-player-" + index,
  name: "Lineup Player " + (index + 1),
  jersey: index + 1,
  position: slot === "GK" ? "Goalie" : "Field",
}));
const confirmedTeam = {
  id: "confirmed-team",
  name: "Confirmed Team",
  division: "Seniors",
  roster,
  starting7: {
    status: "confirmed",
    season: "2026",
    formation: "2-3-1",
    source: "Official match sheet",
    confirmedAt: "2026-06-13",
    players: slots.map((slot, index) => ({ playerId: roster[index].id, slot })),
  },
};

const lineup = resolveConfirmedStartingSeven(confirmedTeam, "2026");
assert.ok(lineup, "an explicitly sourced and confirmed seven-player team lineup is accepted");
assert.equal(lineup.players.length, 7);
assert.deepEqual(lineup.players.map((item) => item.slot), slots);
assert.ok(lineup.players.every((item) => roster.some((player) => player.id === item.player.id)));
assert.equal(resolveConfirmedStartingSeven(confirmedTeam, "2025"), null, "a lineup cannot leak into a different season");

const invalidCases = [
  { ...confirmedTeam, starting7: { ...confirmedTeam.starting7, status: "draft" } },
  { ...confirmedTeam, starting7: { ...confirmedTeam.starting7, source: "" } },
  { ...confirmedTeam, starting7: { ...confirmedTeam.starting7, confirmedAt: "unknown" } },
  { ...confirmedTeam, starting7: { ...confirmedTeam.starting7, formation: "4-2-1" } },
  { ...confirmedTeam, starting7: { ...confirmedTeam.starting7, players: confirmedTeam.starting7.players.slice(0, 6) } },
  { ...confirmedTeam, starting7: { ...confirmedTeam.starting7, players: confirmedTeam.starting7.players.map((item, index) => index ? item : { ...item, playerId: "not-on-roster" }) } },
  { ...confirmedTeam, starting7: { ...confirmedTeam.starting7, players: confirmedTeam.starting7.players.map((item, index) => index ? item : { ...item, slot: "LB" }) } },
];
invalidCases.forEach((team) => assert.equal(resolveConfirmedStartingSeven(team, "2026"), null, "incomplete or unverified lineup is not rendered"));

const emptyHtml = renderStartingSevenPanel({ name: "No Lineup Team", division: "Seniors" }, "2026");
assert.match(emptyHtml, /No confirmed Starting 7 recorded/);
assert.match(emptyHtml, /A roster is not treated as a starting lineup/);
assert.match(emptyHtml, /Graphic unavailable/);
assert.doesNotMatch(emptyHtml, /starting-seven-canvas/);
const confirmedHtml = renderStartingSevenPanel(confirmedTeam, "2026");
assert.match(confirmedHtml, /starting-seven-canvas/);
assert.match(confirmedHtml, /Download PNG/);
assert.match(confirmedHtml, /Share graphic/);
assert.match(confirmedHtml, /id="starting-seven-download" disabled/);
assert.match(confirmedHtml, /id="starting-seven-share" disabled/);
assert.match(confirmedHtml, /Official match sheet/);
assert.equal((confirmedHtml.match(/<li>/g) || []).length, 7, "accessible text list includes all seven starters");

const teamCount = seasons.reduce((sum, season) => sum + (season.teams || []).length, 0);
assert.ok(teamCount > 0);
const publishedLineups = seasons.flatMap((season) =>
  (season.teams || []).filter((team) => resolveConfirmedStartingSeven(team, season.year))
);
assert.equal(publishedLineups.length, 0, "current historical data has no confirmed team Starting 7 records");
const page = await readFile(resolve(siteRoot, "team.html"), "utf8");
const controller = await readFile(resolve(siteRoot, "js/teamProfile.js"), "utf8");
const renderer = await readFile(resolve(siteRoot, "js/teamStartingSeven.js"), "utf8");
const styles = await readFile(resolve(siteRoot, "css/team-starting-seven.css"), "utf8");
const serviceWorker = await readFile(resolve(siteRoot, "service-worker.js"), "utf8");
assert.match(page, /team-starting-seven\.css\?v=20261121-starting71/);
assert.match(page, /teamProfile\.js\?v=20261121-starting71/);
assert.match(controller, /Starting 7/);
assert.match(controller, /renderStartingSevenPanel\(team, data\.year\)/);
assert.match(controller, /setupStartingSevenGraphic\(team, data\.year\)/);
assert.match(renderer, /canvas\.toBlob/);
assert.match(renderer, /navigator\.share/);
assert.match(renderer, /player\.photo/);
assert.match(styles, /@media \(max-width: 620px\)/);
assert.match(styles, /prefers-reduced-motion/);
assert.match(serviceWorker, /lsl-cache-v152/);
assert.match(serviceWorker, /\.\/team\.html/);
assert.match(serviceWorker, /\.\/js\/teamStartingSeven\.js\?v=20261121-starting71/);
assert.match(serviceWorker, /\/js\/teamStartingSeven\.js/);

console.log("Starting 7 checks passed: " + teamCount + " team records audited, invalid lineups withheld, confirmed formation maps render seven players, current missing lineup data stays explicit, PNG/share controls and cache wiring verified.");
