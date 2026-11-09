import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const years = ["2024", "2025", "2026"];
const divisions = ["Seniors", "Juniors"];
const competitions = ["seniors", "juniors", "inter-madrasah-soccer-tournament"];
const files = ["awards", "coaches", "matches", "photos", "players", "playoffs", "standings", "teams", "tournament", "videos"];
const sharedGlobalFiles = [
  "award-watch.json", "best-all-time-team.json", "coach-ratings.json", "cup-names.json",
  "forms.json", "home-ad.json", "news-articles.json", "news.json", "owners.json",
  "player-aliases.json", "rules.json", "team-of-week.json", "transactions.json",
];

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function list(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function getRows(data, key) {
  return list(data?.[key]);
}

function divisionRows(rows, division, teamDivision, allowShared = false) {
  return rows.filter((row) => {
    const rowDivision = row?.division || (row?.teamId ? teamDivision.get(row.teamId) : "");
    if (allowShared && rowDivision === "All") return false;
    return rowDivision === division;
  });
}

function playoffDivision(data, division) {
  if (Array.isArray(data?.divisions)) return data.divisions.find((entry) => entry?.division === division) || null;
  return data?.division === division ? data : null;
}

function standingsDivision(data, division) {
  const entries = Array.isArray(data?.divisions) ? data.divisions : list(data?.divisions);
  return entries.find((entry) => (entry?.division || entry?.name) === division) || null;
}

function emptyFile(year, file, division) {
  const base = { season: year };
  switch (file) {
    case "awards": return { ...base, awards: [] };
    case "coaches": return { ...base, coaches: [] };
    case "matches": return { ...base, matches: [] };
    case "photos": return { ...base, photos: [] };
    case "players": return { ...base, players: [] };
    case "playoffs": return { ...base, division, rounds: [] };
    case "standings": return { ...base, divisions: [] };
    case "teams": return { ...base, teams: [] };
    case "tournament": return base;
    case "videos": return { ...base, videos: [] };
    default: throw new Error(`Unsupported standard file: ${file}`);
  }
}

function ensureNoUnassignedRows(rows, file, year, teamDivision) {
  const invalid = rows.filter((row) => {
    const value = row?.division || (row?.teamId ? teamDivision.get(row.teamId) : "");
    return !divisions.includes(value) && !(file === "photos" || file === "videos" ? value === "All" : false);
  });
  if (invalid.length) throw new Error(`${year}/${file}.json has ${invalid.length} row(s) without a recognized division`);
}

function copyBackup(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function migrate(apply) {
  const backup = path.join(root, ".phase3-backup", "20261108");
  if (apply && fs.existsSync(backup)) throw new Error(`Backup already exists: ${backup}`);

  const sources = new Map();
  const sharedGlobals = new Map();
  for (const year of years) {
    const seasonDir = path.join(root, "data", year);
    const data = Object.fromEntries(files.map((name) => [name, readJSON(path.join(seasonDir, `${name}.json`))]));
    const teams = getRows(data.teams, "teams");
    const teamDivision = new Map(teams.map((team) => [team.id, team.division]));
    for (const name of ["teams", "players", "coaches", "matches", "awards", "photos", "videos"]) {
      const rows = getRows(data[name], name);
      ensureNoUnassignedRows(rows, name, year, teamDivision);
    }
    sources.set(year, { data, teams, teamDivision });
  }

  for (const name of sharedGlobalFiles) {
    const source = path.join(root, "data", name);
    if (!fs.existsSync(source)) throw new Error(`Missing shared source: ${source}`);
    sharedGlobals.set(name, readJSON(source));
  }

  if (!apply) {
    const report = Object.fromEntries([...sources].map(([year, { data }]) => [year, Object.fromEntries(
      ["teams", "players", "coaches", "matches", "awards", "photos", "videos"].map((key) => [key, getRows(data[key], key).length])
    )]));
    console.log(JSON.stringify({ mode: "dry-run", years, competitions, sharedGlobalFiles, counts: report }, null, 2));
    return;
  }

  for (const year of years) {
    const { data, teams, teamDivision } = sources.get(year);
    const sharedSeasonDir = path.join(root, "data", "shared", "seasons", year);
    const standings = data.standings;
    writeJSON(path.join(sharedSeasonDir, "season-meta.json"), {
      season: year,
      event: data.teams.event || {},
      standings: { source: standings.source || "", notes: list(standings.notes) },
    });

    for (const division of divisions) {
      const slug = division.toLowerCase();
      const outputDir = path.join(root, "data", year, slug);
      const divisionTeams = divisionRows(teams, division, teamDivision);
      const output = {
        awards: { season: year, awards: divisionRows(getRows(data.awards, "awards"), division, teamDivision) },
        coaches: { season: year, coaches: divisionRows(getRows(data.coaches, "coaches"), division, teamDivision) },
        matches: { season: year, matches: divisionRows(getRows(data.matches, "matches"), division, teamDivision) },
        photos: { season: year, photos: divisionRows(getRows(data.photos, "photos"), division, teamDivision) },
        players: { season: year, players: divisionRows(getRows(data.players, "players"), division, teamDivision) },
        playoffs: playoffDivision(data.playoffs, division) || emptyFile(year, "playoffs", division),
        standings: { season: year, divisions: list(standingsDivision(data.standings, division)) },
        teams: { season: year, teams: divisionTeams },
        tournament: emptyFile(year, "tournament", division),
        videos: { season: year, videos: divisionRows(getRows(data.videos, "videos"), division, teamDivision) },
      };
      for (const [name, value] of Object.entries(output)) writeJSON(path.join(outputDir, `${name}.json`), value);
    }

    const imstDir = path.join(root, "data", year, "inter-madrasah-soccer-tournament");
    const imstOutput = {
      awards: emptyFile(year, "awards"),
      coaches: emptyFile(year, "coaches"),
      matches: emptyFile(year, "matches"),
      photos: emptyFile(year, "photos"),
      players: emptyFile(year, "players"),
      playoffs: { ...emptyFile(year, "playoffs", "IMST"), division: "IMST" },
      standings: emptyFile(year, "standings"),
      teams: emptyFile(year, "teams"),
      tournament: data.tournament,
      videos: emptyFile(year, "videos"),
    };
    for (const [name, value] of Object.entries(imstOutput)) writeJSON(path.join(imstDir, `${name}.json`), value);

    for (const kind of ["photos", "videos"]) {
      const sharedRows = getRows(data[kind], kind).filter((row) => row.division === "All");
      writeJSON(path.join(sharedSeasonDir, `${kind}.json`), { season: year, [kind]: sharedRows });
    }
  }

  for (const [name, value] of sharedGlobals) writeJSON(path.join(root, "data", "shared", name), value);

  const movedFiles = [];
  for (const year of years) {
    const seasonDir = path.join(root, "data", year);
    const backupDir = path.join(backup, "data", year);
    for (const file of files) {
      const source = path.join(seasonDir, `${file}.json`);
      copyBackup(source, path.join(backupDir, `${file}.json`));
      movedFiles.push(source);
    }
  }
  for (const name of sharedGlobalFiles) {
    const source = path.join(root, "data", name);
    copyBackup(source, path.join(backup, "data", name));
    movedFiles.push(source);
  }

  const checks = validateTargets(sources, sharedGlobals);
  if (checks.length) throw new Error(`Target validation failed:\n${checks.join("\n")}`);

  for (const source of movedFiles) {
    const destination = path.join(backup, "data", path.relative(path.join(root, "data"), source));
    if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) throw new Error(`Backup verification failed: ${source}`);
    fs.unlinkSync(source);
  }
  console.log(JSON.stringify({ mode: "applied", backup: path.relative(root, backup), checks: "passed", migratedYears: years }, null, 2));
}

function validateTargets(sources, sharedGlobals) {
  const errors = [];
  for (const year of years) {
    const { data } = sources.get(year);
    const sharedDir = path.join(root, "data", "shared", "seasons", year);
    const meta = readJSON(path.join(sharedDir, "season-meta.json"));
    if (JSON.stringify(meta.event) !== JSON.stringify(data.teams.event || {})) errors.push(`${year}: shared event metadata differs`);

    for (const file of files) {
      for (const competition of competitions) {
        const target = path.join(root, "data", year, competition, `${file}.json`);
        if (!fs.existsSync(target)) errors.push(`${year}/${competition}/${file}.json missing`);
        else readJSON(target);
      }
    }

    const { teamDivision } = sources.get(year);
    for (const key of ["teams", "players", "coaches", "matches", "awards", "photos", "videos"]) {
      const allTargetRows = [];
      for (const division of divisions) {
        const target = readJSON(path.join(root, "data", year, division.toLowerCase(), `${key}.json`));
        allTargetRows.push(...getRows(target, key));
      }
      if (key === "photos" || key === "videos") {
        allTargetRows.push(...getRows(readJSON(path.join(sharedDir, `${key}.json`)), key));
      }
      const sourceRows = getRows(data[key], key);
      const sortKey = (rows) => rows.map((row) => JSON.stringify(row)).sort();
      if (JSON.stringify(sortKey(allTargetRows)) !== JSON.stringify(sortKey(sourceRows))) errors.push(`${year}/${key}: source and target rows differ`);
    }

    for (const division of divisions) {
      const slug = division.toLowerCase();
      const targetPlayoffs = readJSON(path.join(root, "data", year, slug, "playoffs.json"));
      const sourcePlayoffs = playoffDivision(data.playoffs, division);
      if (JSON.stringify(targetPlayoffs) !== JSON.stringify(sourcePlayoffs || emptyFile(year, "playoffs", division))) errors.push(`${year}/${division} playoffs differ`);
      const targetStandings = readJSON(path.join(root, "data", year, slug, "standings.json"));
      const sourceEntry = standingsDivision(data.standings, division);
      if (JSON.stringify(targetStandings.divisions[0] || null) !== JSON.stringify(sourceEntry)) errors.push(`${year}/${division} standings differ`);
    }

    const targetTournament = readJSON(path.join(root, "data", year, "inter-madrasah-soccer-tournament", "tournament.json"));
    if (JSON.stringify(targetTournament) !== JSON.stringify(data.tournament)) errors.push(`${year}: IMST tournament data differs`);
  }
  for (const [name, source] of sharedGlobals) {
    const target = readJSON(path.join(root, "data", "shared", name));
    if (JSON.stringify(target) !== JSON.stringify(source)) errors.push(`shared/${name} differs`);
  }
  return errors;
}

migrate(process.argv.includes("--apply"));
