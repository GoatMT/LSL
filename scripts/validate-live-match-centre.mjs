import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const siteRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { hasMatchAdminClaim, sanitizeLiveMatchUpdate } = require("../functions/liveMatchValidation.js");
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
const { collectMatchCentreFixtures, matchDocumentId, matchScore, matchStatus, statusLabel } = await import("../js/liveMatchCentreModel.js");
const seasons = await loadAllSeasons(["2024", "2025", "2026", "2027"], ["matches", "teams", "playoffs"]);
const fixtures = collectMatchCentreFixtures(seasons);
assert.ok(fixtures.length > 0, "real historic match and playoff records load");
assert.equal(new Set(fixtures.map((match) => match.liveDocumentId)).size, fixtures.length, "each static fixture has a stable unique live document key");
assert.ok(fixtures.every((match) => match.season !== "2027"), "projected season metadata is not presented as a real fixture");
assert.ok(fixtures.some((match) => match.stage === "playoffs"), "playoff round data is included");
assert.ok(fixtures.some((match) => match.stage === "regular"), "regular season match data is included");
assert.ok(fixtures.some((match) => matchScore(match)), "verified recorded scores are retained");

assert.equal(matchStatus({ status: "Complete", homeScore: 2, awayScore: 1 }), "completed");
assert.equal(matchStatus({ homeScore: 2, awayScore: 1 }), "completed");
assert.equal(matchStatus({}, { status: "live" }), "live");
assert.equal(matchStatus({}, { status: "cancelled" }), "cancelled");
assert.equal(matchStatus({ status: "scheduled", date: "2024-01-01" }, null, new Date("2026-11-21T12:00:00")), "unreported", "old unplayed fixtures are not mislabeled upcoming");
assert.equal(matchStatus({ status: "scheduled", homeScore: 1, awayScore: 0 }), "completed", "recorded scores take precedence over stale scheduled labels");
assert.equal(statusLabel("unreported"), "Status not reported");
assert.equal(matchDocumentId("2026", "Test Match 1"), "2026_test-match-1");

const validUpdate = sanitizeLiveMatchUpdate({
  season: "2026",
  matchId: "2026-seniors-week-1-game-1",
  status: "live",
  homeScore: "2",
  awayScore: "1",
  event: { type: "goal", teamSide: "home", minute: "45+1", playerName: "Recorded Player" },
});
assert.equal(validUpdate.score.homeScore, 2);
assert.equal(validUpdate.event.minute, "45+1");
assert.equal(hasMatchAdminClaim({ uid: "admin-uid", token: { lslMatchAdmin: true } }), true);
assert.equal(hasMatchAdminClaim({ uid: "user-uid", token: {} }), false);
assert.equal(hasMatchAdminClaim(null), false);

for (const invalid of [
  { season: "2023", matchId: "game-1", status: "live" },
  { season: "2026", matchId: "bad/id", status: "live" },
  { season: "2026", matchId: "game-1", status: "unknown" },
  { season: "2026", matchId: "game-1", status: "live", homeScore: 1 },
  { season: "2026", matchId: "game-1", status: "live", homeScore: 100, awayScore: 0 },
  { season: "2026", matchId: "game-1", status: "live", homeScore: true, awayScore: 0 },
  { season: "2026", matchId: "game-1", status: "live", event: { type: "goal", teamSide: "neither" } },
]) assert.throws(() => sanitizeLiveMatchUpdate(invalid));

const page = await readFile(resolve(siteRoot, "live-match-centre.html"), "utf8");
const controller = await readFile(resolve(siteRoot, "js/liveMatchCentre.js"), "utf8");
const sync = await readFile(resolve(siteRoot, "js/liveMatchCentreSync.js"), "utf8");
const server = await readFile(resolve(siteRoot, "functions/index.js"), "utf8");
const rules = await readFile(resolve(siteRoot, "firestore.rules"), "utf8");
const config = await readFile(resolve(siteRoot, "js/config.js"), "utf8");
const styles = await readFile(resolve(siteRoot, "css/live-match-centre.css"), "utf8");
const worker = await readFile(resolve(siteRoot, "service-worker.js"), "utf8");
assert.match(page, /liveMatchCentre\.js\?v=20261121-matchcentre3/);
assert.match(controller, /onUpdates/);
assert.match(controller, /Upcoming fixtures/);
assert.match(controller, /Latest completed results/);
assert.match(controller, /Latest score updates/);
assert.match(controller, /statusUpdate/);
assert.match(controller, /2027 season planning dates are not match schedules/);
assert.match(sync, /onSnapshot/);
assert.match(sync, /lslMatchAdmin/);
assert.match(sync, /publishLiveMatchUpdate/);
assert.match(server, /hasMatchAdminClaim\(request\.auth\)/);
assert.match(server, /HttpsError\("permission-denied"/);
assert.match(rules, /match \/liveMatchCentre\/\{matchId\} \{[\s\S]*allow read: if true;[\s\S]*allow write: if false;/);
assert.match(config, /label: "Live Match Centre", href: "live-match-centre\.html"/);
assert.match(styles, /@media \(max-width: 680px\)/);
assert.match(styles, /prefers-reduced-motion/);
assert.match(worker, /lsl-cache-v152/);
assert.match(worker, /\.\/live-match-centre\.html/);
assert.match(worker, /\.\/js\/liveMatchCentreSync\.js\?v=20261121-matchcentre3/);
await access(resolve(siteRoot, "data/2027/matches.json"));

console.log(`Live Match Centre checks passed: ${fixtures.length} real regular/playoff fixtures, stable IDs, score/status fallback, admin-only validated publishing, public read-only feed rules, live listener, filters, and normal-reload cache wiring.`);
