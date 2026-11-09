import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "data");
const sourceRoot = path.join(root, ".phase3-backup", "20261108", "data");
const years = ["2024", "2025", "2026"];
const divisions = ["Seniors", "Juniors"];
const competitions = ["seniors", "juniors", "inter-madrasah-soccer-tournament"];
const files = ["awards", "coaches", "matches", "photos", "players", "playoffs", "standings", "teams", "tournament", "videos"];
const rowFiles = ["teams", "players", "coaches", "matches", "awards", "photos", "videos"];
const sharedGlobals = [
  "award-watch.json", "best-all-time-team.json", "coach-ratings.json", "cup-names.json",
  "forms.json", "home-ad.json", "news-articles.json", "news.json", "owners.json",
  "player-aliases.json", "rules.json", "team-of-week.json", "transactions.json",
];

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function list(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function rows(data, key) {
  return list(data?.[key]);
}

function sortedRows(items) {
  return items.map((item) => JSON.stringify(item)).sort();
}

function slugify(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function playoffDivision(data, division) {
  if (Array.isArray(data?.divisions)) return data.divisions.find((entry) => entry?.division === division) || null;
  return data?.division === division ? data : null;
}

function standingsDivision(data, division) {
  const entries = Array.isArray(data?.divisions) ? data.divisions : list(data?.divisions);
  return entries.find((entry) => (entry?.division || entry?.name) === division) || null;
}

function assertFolderFiles(folder) {
  const names = fs.readdirSync(folder).filter((name) => name.endsWith(".json")).sort();
  assert.deepEqual(names, files.map((name) => `${name}.json`).sort(), `${folder} must contain exactly the ten standard JSON files`);
  for (const name of names) readJSON(path.join(folder, name));
}

const report = [];
for (const year of years) {
  const sourceDir = path.join(sourceRoot, year);
  const source = Object.fromEntries(files.map((name) => [name, readJSON(path.join(sourceDir, `${name}.json`))]));
  const teams = rows(source.teams, "teams");
  const teamDivision = new Map(teams.map((team) => [team.id, team.division]));
  const teamIds = new Set(teams.map((team) => team.id));
  const unlinkedPlayers = rows(source.players, "players").filter((player) => player.teamId && !teamIds.has(player.teamId));
  assert.equal(unlinkedPlayers.length, 0, `${year}: player references a missing team`);

  for (const competition of competitions) assertFolderFiles(path.join(dataRoot, year, competition));
  const sharedDir = path.join(dataRoot, "shared", "seasons", year);
  const metadata = readJSON(path.join(sharedDir, "season-meta.json"));
  assert.deepEqual(metadata.event, source.teams.event || {}, `${year}: event metadata changed`);
  assert.deepEqual(metadata.standings, { source: source.standings.source || "", notes: list(source.standings.notes) }, `${year}: standings notes changed`);

  const divisionRows = (input, division) => input.filter((row) => {
    const rowDivision = row?.division || (row?.teamId ? teamDivision.get(row.teamId) : "");
    return rowDivision === division;
  });
  const counts = {};
  for (const key of rowFiles) {
    const sourceRows = rows(source[key], key);
    const actualRows = [];
    for (const division of divisions) {
      const scopedRows = rows(readJSON(path.join(dataRoot, year, division.toLowerCase(), `${key}.json`)), key);
      const ids = scopedRows.map((row) => row.id).filter(Boolean);
      assert.equal(new Set(ids).size, ids.length, `${year}/${division}/${key}: duplicate stable IDs`);
      actualRows.push(...scopedRows);
    }
    if (key === "photos" || key === "videos") actualRows.push(...rows(readJSON(path.join(sharedDir, `${key}.json`)), key));
    assert.deepEqual(sortedRows(actualRows), sortedRows(sourceRows), `${year}/${key}: migrated rows differ from the source snapshot`);
    counts[key] = sourceRows.length;
  }

  for (const division of divisions) {
    const slug = division.toLowerCase();
    const playoffTarget = readJSON(path.join(dataRoot, year, slug, "playoffs.json"));
    assert.deepEqual(playoffTarget, playoffDivision(source.playoffs, division) || { season: year, division, rounds: [] }, `${year}/${division}: playoff payload changed`);
    const standingsTarget = readJSON(path.join(dataRoot, year, slug, "standings.json"));
    assert.deepEqual(standingsTarget.divisions[0] || null, standingsDivision(source.standings, division), `${year}/${division}: standings payload changed`);

    const originalRows = rows(source.matches, "matches").filter((match) => match.division === division);
    const migratedRows = rows(readJSON(path.join(dataRoot, year, slug, "matches.json")), "matches");
    const allTeamIds = new Set(teams.map((team) => team.id));
    const unresolved = (matches) => matches.reduce((count, match) => count + [match.homeTeamId, match.awayTeamId].filter((id) => id && !allTeamIds.has(id)).length, 0);
    assert.equal(unresolved(migratedRows), unresolved(originalRows), `${year}/${division}: match/team relationship count changed`);
    const wrongDivisionRefs = migratedRows.filter((match) => [match.homeTeamId, match.awayTeamId].some((id) => id && teams.some((team) => team.id === id && team.division !== division)));
    assert.equal(wrongDivisionRefs.length, 0, `${year}/${division}: match references a team from another division`);
  }

  assert.deepEqual(
    readJSON(path.join(dataRoot, year, "inter-madrasah-soccer-tournament", "tournament.json")),
    source.tournament,
    `${year}: IMST tournament data changed`
  );
  const mediaRows = [
    ...rows(source.photos, "photos"),
    ...rows(source.videos, "videos"),
    ...list(source.tournament.media),
  ];
  const mediaPaths = mediaRows.flatMap((item) => [item.imageUrl, item.videoUrl, item.src, item.url])
    .filter((value) => typeof value === "string" && value.startsWith("./media/"));
  const missingMedia = [...new Set(mediaPaths.filter((value) => !fs.existsSync(path.resolve(root, value.slice(2)))))];
  assert.deepEqual(missingMedia, [], `${year}: media references missing from the site`);
  report.push({ year, counts });
}

for (const name of sharedGlobals) {
  assert.deepEqual(readJSON(path.join(dataRoot, "shared", name)), readJSON(path.join(sourceRoot, name)), `shared/${name} changed`);
}

for (const year of ["2026", "2027"]) {
  assert.ok(fs.existsSync(path.join(dataRoot, year, "projected.json")), `${year} projected data must remain at its original path`);
  readJSON(path.join(dataRoot, year, "projected.json"));
}

const malformed = [];
function scanJSON(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) scanJSON(target);
    else if (entry.isFile() && entry.name.endsWith(".json")) {
      try { readJSON(target); } catch (error) { malformed.push(`${target}: ${error.message}`); }
    }
  }
}
scanJSON(dataRoot);
assert.deepEqual(malformed, [], "all JSON files under data/ must parse");

if (process.argv.includes("--runtime")) {
  globalThis.fetch = async (request) => {
    const relative = String(request).replace(/^\.\//, "");
    const target = path.resolve(root, relative);
    if (!target.startsWith(root) || !fs.existsSync(target)) return { ok: false, status: 404, statusText: "Not Found" };
    return { ok: true, json: async () => readJSON(target) };
  };
  const { loadSeasonData } = await import("../js/dataLoader.js?phase3-validator");
  const aliases = readJSON(path.join(dataRoot, "shared", "player-aliases.json"));
  for (const year of [...years, "2027"]) {
    const season = await loadSeasonData(year);
    if (year !== "2027") {
      const expected = report.find((entry) => entry.year === year).counts;
      for (const key of rowFiles) {
        const loaded = key === "teams" ? season.teams : key === "players" ? season.players : key === "coaches" ? season.coaches : key === "matches" ? season.matches : key === "awards" ? season.awards.awards : season[key];
        if (key === "players") continue;
        assert.equal(loaded.length, expected[key], `${year}: loader ${key} count mismatch`);
      }
      const source = readJSON(path.join(sourceRoot, year, "teams.json"));
      const sourcePlayers = readJSON(path.join(sourceRoot, year, "players.json"));
      const expectedPlayerIds = new Set();
      const canonicalId = (player) => {
        const raw = player.id || slugify(player.name || "Unnamed Player");
        return aliases[raw] || raw;
      };
      for (const team of rows(source, "teams")) for (const player of team.roster || []) expectedPlayerIds.add(canonicalId(player));
      for (const player of rows(sourcePlayers, "players")) expectedPlayerIds.add(canonicalId(player));
      assert.deepEqual([...season.players.map((player) => player.id)].sort(), [...expectedPlayerIds].sort(), `${year}: merged player IDs changed`);
      assert.deepEqual(season.event, readJSON(path.join(dataRoot, "shared", "seasons", year, "season-meta.json")).event);
      assert.deepEqual(season.tournament, readJSON(path.join(sourceRoot, year, "tournament.json")));
    } else {
      assert.equal(season.year, "2027");
      assert.ok(Array.isArray(season.teams));
    }
  }
  report.push({ runtimeLoader: "2024-2027 passed" });
}

console.log(JSON.stringify({ valid: true, report }, null, 2));
