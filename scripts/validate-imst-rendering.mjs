import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeTournamentArchive,
  playoffRounds,
  scheduleMatches,
  tournamentScore,
  tournamentWinner,
} from "../js/tournamentData.js";

for (const year of ["2024", "2025", "2026"]) {
  const path = new URL(`../data/${year}/inter-madrasah-soccer-tournament/tournament.json`, import.meta.url);
  const data = JSON.parse(await readFile(path, "utf8"));
  const rounds = playoffRounds(data);
  const schedule = scheduleMatches(data);

  assert.ok(rounds.every((round) => Array.isArray(round.matches)), `${year}: every playoff round must render from an array`);
  assert.ok(schedule.every((match) => match && typeof match === "object"), `${year}: ignore empty/non-match payloads`);
  assert.equal(new Set(schedule.map((match) => match.id || `${match.round}|${match.homeTeamId}|${match.awayTeamId}|${match.label}`)).size, schedule.length, `${year}: schedule contains no duplicates`);

  if (year === "2024") {
    const archived = normalizeTournamentArchive(data);
    assert.equal(archived.event.champion, undefined, "2024 must not inherit the 2025 champion");
    assert.equal(schedule.length, 0, "2024 must not turn an empty object into a match");
  }

  if (year === "2025") {
    assert.equal(rounds.length, 2);
    assert.ok(rounds.some((round) => round.name === "Final" && round.matches.length === 1), "object-shaped final match is preserved");
    assert.ok(schedule.length > data.matches.length, "playoff matches appear in the complete schedule");
    assert.match(normalizeTournamentArchive(data).event.currentStatus, /Hifz City/);
  }

  if (year === "2026") {
    assert.equal(rounds.length, 3);
    assert.ok(rounds.some((round) => round.name === "Final" && round.matches.length === 1), "object-shaped final match is preserved");
    assert.equal(normalizeTournamentArchive(data), data, "2026 event details remain untouched");
  }

  console.log(`${year}: ${schedule.length} schedule entries; ${rounds.reduce((count, round) => count + round.matches.length, 0)} playoff matches`);
}

assert.equal(tournamentScore({ homeScore: 2, awayScore: 1 }), "2-1");
assert.equal(tournamentWinner({ homeTeamId: "a", homeTeamName: "A", awayTeamId: "b", awayTeamName: "B", homeScore: 0, awayScore: 0, status: "Draw" }), "Draw");
assert.equal(tournamentWinner({ homeTeamId: "a", homeTeamName: "A", awayTeamId: "b", awayTeamName: "B", homeScore: 3, awayScore: 1, winnerId: "a" }), "A win");
assert.equal(tournamentScore({}), "VS");
console.log("IMST rendering data checks passed.");
