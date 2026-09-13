import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.1";
import { calculateTeamRecord, computeCoachSummary, computeCombinedPlayerStats, computePlayerStats } from "./leagueEngine.js?v=3.13";
import { setupLayout } from "./main.js?v=20260913-3";
import { escapeHTML, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("records.html");
setDocumentTitle("Records");

const root = document.getElementById("page-root");
let state = { division: "Seniors", category: "player", stage: "all" };
let teamCodeMap = new Map();

const categoryOptions = [
  { value: "player", label: "Player Records" },
  { value: "team", label: "Team Records" },
  { value: "coach", label: "Coach Records" },
  { value: "cup", label: "LSL Cup" },
];

const divisionOptions = [
  { value: "Seniors", label: "Seniors" },
  { value: "Juniors", label: "Juniors" },
];

const stageOptions = [
  { value: "all", label: "All" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];

const teamCodeOverrides = {
  "gangat-warriors": "GNG",
};

function normalizeTeamName(name) {
  return String(name || "").trim().toLowerCase();
}

function fallbackTeamCode(name) {
  const initials = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[^a-z0-9]/gi, "")[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return initials.slice(0, 3) || "TBA";
}

function teamCodeForTeam(team = {}) {
  const override = teamCodeOverrides[team.id];
  if (override) return override;
  const existing = String(team.shortName || team.abbreviation || team.abbr || "").trim();
  return existing ? existing.toUpperCase() : fallbackTeamCode(team.name);
}

function teamCodeFor(teamId, teamName) {
  return teamCodeMap.get(teamId) || teamCodeMap.get(normalizeTeamName(teamName)) || fallbackTeamCode(teamName);
}

function teamDisplay(row = {}, nameKey = "teamName", idKey = "teamId") {
  return teamCodeFor(row[idKey], row[nameKey] || "Team TBA");
}

function teamListDisplay(names = []) {
  return [...new Set(names.filter(Boolean).map((name) => teamCodeFor(null, name)))].join(" / ") || "Team TBA";
}

function buildTeamCodeMap(allData) {
  const map = new Map();
  allData.forEach((season) => {
    (season.teams || []).forEach((team) => {
      const code = teamCodeForTeam(team);
      map.set(team.id, code);
      map.set(normalizeTeamName(team.name), code);
    });
  });
  return map;
}

function stageLabel() {
  return stageLabelFor(state.stage);
}

function stageLabelFor(stage) {
  return stageOptions.find((option) => option.value === stage)?.label || "All";
}

function matchesStageValue(match, stage) {
  return stage === "all" || match.stage === stage;
}

function playerRecordScopeDescription(stage) {
  if (stage === "regular") return "Regular Season player records only. Playoff matches are excluded.";
  if (stage === "playoffs") return "Playoff player records only. Regular Season matches are excluded.";
  return "Regular Season and Playoff player records shown together, with each stage kept separate.";
}

function matchesStage(match) {
  return state.stage === "all" || match.stage === state.stage;
}

function matchesDivision(item) {
  return state.division === "All" || item.division === state.division;
}

// Combines a player's stats only across the seasons where they actually played in the
// currently selected division, so e.g. a player's Juniors-era goals never get folded into
// their Seniors career total just because they moved up divisions in a later season.
function combinedPlayerStatsForDivision(allData, options = {}) {
  const scopedSeasons = allData.map((season) => ({
    ...season,
    players: (season.players || []).filter((player) => state.division === "All" || player.division === state.division),
  }));
  return computeCombinedPlayerStats(scopedSeasons, options);
}

function playerLink(player) {
  return `<a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a>`;
}

function coachLink(coach) {
  return `<a href="./coach.html?id=${escapeHTML(coach.id)}">${escapeHTML(coach.name)}</a>`;
}

function teamLink(team, season) {
  const fullName = team.teamName || team.name || "Team TBA";
  const code = teamCodeFor(team.teamId || team.id, fullName);
  return `<a title="${escapeHTML(fullName)}" href="${escapeHTML(teamProfileHref(team.teamId || team.id, season))}">${escapeHTML(code)}</a>`;
}

function recordRows(items, columns) {
  return items
    .map(
      (item, index) => `
        <tr>
          <td data-label="Rank">${index + 1}</td>
          ${columns.map((column) => `<td class="${column.num ? "num" : ""}" data-label="${escapeHTML(column.label)}">${column.render(item)}</td>`).join("")}
        </tr>
      `
    )
    .join("");
}

function recordCountLabel(title, identityLabel) {
  if (/back.to.back|multiple.time/i.test(title)) return identityLabel === "Player" ? "Players" : "Holders";
  if (/champions/i.test(title)) return "Seasons";
  return "Entries";
}

function recordTable(title, note, items, columns, tone = "good", options = {}) {
  const leader = items[0];
  const identity = columns.find(column => ["Player", "Coach", "Team", "Winner", "Champion"].includes(column.label)) || columns[0];
  const metric = title === "Most Goals In A Single Postseason Run" ? columns.find(column => column.label === "Goals") : columns.find(column => column.num);
  const tiedLeaders = leader && metric ? items.filter((item) => String(metric.render(item)) === String(metric.render(leader))) : leader ? [leader] : [];
  const tied = tiedLeaders.length > 1;
  const holderItems = metric ? tiedLeaders : items;
  const context = columns.filter(column => column !== identity && !column.num && column.label !== "Runner-Up");
  const spotlightContext = context.filter((column) => !tied || !/^(season|year|date|time|week)$/i.test(String(column.label || "").trim()));
  const holder = options.tiebreaker && tied
    ? `<strong class="record-tiebreaker-winner">${identity.render(leader)}</strong><span class="record-tiebreaker-label">Tiebreaker winner</span><span class="record-tied-note">Also tied: ${tiedLeaders.slice(1).map((item) => identity.render(item)).join('<span class="record-tied-separator" aria-hidden="true"> / </span>')}</span>`
    : holderItems.map((item) => identity.render(item)).join('<span class="record-tied-separator" aria-hidden="true"> / </span>');
  const recordMark = metric
    ? `<div class="record-mark"><strong>${metric.render(leader)}</strong><span>${escapeHTML(metric.label)}</span></div>`
    : holderItems.length > 1
      ? `<div class="record-mark"><strong>${holderItems.length}</strong><span>${escapeHTML(recordCountLabel(title, identity.label))}</span></div>`
      : "";
  const contextItems = metric ? [leader] : holderItems;
  return `
    <article class="card record-card record-card--${escapeHTML(tone)}">
      <div class="record-card-head">
        <div>
          <span class="eyebrow">${escapeHTML(state.division)} / Record Book</span>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(note)}</p>
        </div>
      </div>
      ${leader ? `<div class="record-spotlight">
        ${recordMark}
        <div class="record-holder">
          <span class="record-holder-label">${metric ? (tied ? "Joint leading mark" : "Leading mark") : "From the honours roll"}</span>
          <div class="record-holder-name">${holder}</div>
          <div class="record-holder-context">${contextItems.map((item) => `<span>${spotlightContext.map(column => column.render(item)).join(" | ")}</span>`).join("")}</div>
        </div>
      </div>` : `<p class="record-empty">A new chapter awaits. Records coming soon.</p>`}
      ${items.length ? `<details class="record-rankings">
        <summary><span class="record-open-label">View Rankings</span><span class="record-close-label">Hide Rankings</span><small>${items.length} ${items.length === 1 ? "entry" : "entries"}</small></summary>
      <div class="table-wrap record-table-wrap">
        <table class="data-table record-table">
          <thead>
            <tr>
              <th>Rank</th>
              ${columns.map((column) => `<th class="${column.num ? "num" : ""}">${escapeHTML(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${recordRows(items, columns)}</tbody>
        </table>
      </div>
      </details>` : ""}
    </article>
  `;
}

function playerSeasonRows(allData, stage = "all") {
  return allData.flatMap((season) =>
    computePlayerStats(season, { stage })
      .filter(matchesDivision)
      .map((player) => ({
        ...player,
        season: season.year,
      }))
  );
}

const MIN_GAMES_FOR_RATE = 5;

function resolveScorerTeamId(season, match, scorer) {
  if (scorer.teamId) return scorer.teamId;
  const player = (season.players || []).find((item) => item.id === scorer.playerId);
  return player?.teamId || match.homeTeamId;
}

function teamNameFor(season, teamId) {
  return (season.teams || []).find((team) => team.id === teamId)?.name || "Team TBA";
}

function biggestSingleGameGoals(allData, stage = state.stage) {
  return allData
    .flatMap((season) =>
      (season.matches || [])
        .filter((match) => matchesStageValue(match, stage))
        .filter(matchesDivision)
        .flatMap((match) =>
          (match.scorers || [])
            .filter((scorer) => scorer.playerId && Number(scorer.goals) > 0)
            .map((scorer) => {
              const teamId = resolveScorerTeamId(season, match, scorer);
              const opponentId = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
              return {
                id: scorer.playerId,
                name: scorer.name,
                season: season.year,
                teamId,
                teamName: teamNameFor(season, teamId),
                opponent: teamNameFor(season, opponentId),
                goals: Number(scorer.goals) || 0,
                label: match.label || `Week ${match.week}`,
              };
            })
        )
    )
    .sort((a, b) => b.goals - a.goals || a.season.localeCompare(b.season) || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function multiGoalGameCounts(allData, stage = state.stage) {
  const rows = new Map();
  allData.forEach((season) => {
    (season.matches || []).filter((match) => matchesStageValue(match, stage)).filter(matchesDivision).forEach((match) => {
      (match.scorers || []).forEach((scorer) => {
        if (!scorer.playerId || Number(scorer.goals) < 2) return;
        const key = `${season.year}:${scorer.playerId}`;
        const teamId = resolveScorerTeamId(season, match, scorer);
        const existing = rows.get(key) || {
          id: scorer.playerId,
          name: scorer.name,
          season: season.year,
          teamId,
          teamName: teamNameFor(season, teamId),
          count: 0,
        };
        existing.count += 1;
        rows.set(key, existing);
      });
    });
  });
  return [...rows.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function mostCareerGamesPlayed(allData, stage = state.stage) {
  return combinedPlayerStatsForDivision(allData, { stage })
    .filter((player) => player.gamesPlayed > 0)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function bestGoalsPerGameRate(allData, stage = state.stage) {
  return combinedPlayerStatsForDivision(allData, { stage })
    .filter((player) => player.gamesPlayed >= MIN_GAMES_FOR_RATE)
    .map((player) => ({ ...player, rate: player.goals / player.gamesPlayed }))
    .sort((a, b) => b.rate - a.rate || b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function biggestWins(allData, stage = state.stage) {
  return allData
    .flatMap((season) =>
      (season.matches || [])
        .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
        .filter((match) => matchesStageValue(match, stage))
        .filter((match) => state.division === "All" || match.division === state.division)
        .map((match) => {
          const home = (season.teams || []).find((team) => team.id === match.homeTeamId);
          const away = (season.teams || []).find((team) => team.id === match.awayTeamId);
          const homeWon = match.homeScore >= match.awayScore;
          return {
            season: season.year,
            division: match.division,
            margin: Math.abs(match.homeScore - match.awayScore),
            score: `${match.homeScore}-${match.awayScore}`,
            winner: homeWon ? home : away,
            loser: homeWon ? away : home,
          };
        })
    )
    .filter((row) => row.margin > 0)
    .sort((a, b) => b.margin - a.margin || a.season.localeCompare(b.season))
    .slice(0, 5);
}

function biggestLosses(allData, stage = state.stage) {
  return biggestWins(allData, stage);
}

function bestTeams(allData, stage = state.stage) {
  return teamSeasonRows(allData, stage)
    .sort((a, b) => b.pts - a.pts || b.w - a.w || b.gd - a.gd || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function bestPlayoffRuns(allData) {
  return teamSeasonRows(allData, "playoffs")
    .sort((a, b) => b.w - a.w || b.gd - a.gd || b.gf - a.gf || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function teamSeasonRows(allData, stage = state.stage) {
  const divisions = state.division === "All" ? SITE.divisions : [state.division];
  return allData.flatMap((season) =>
    divisions.flatMap((division) =>
      (season.teams || [])
        .filter((team) => team.division === division)
        .map((team) => {
          const record = calculateTeamRecord(season, team.id, { stage }) || {};
          return {
            ...record,
            season: season.year,
            division,
            teamId: team.id,
            teamName: team.name,
          };
        })
        .filter((row) => row.gp > 0)
    )
  );
}

function bestGoalsFor(allData, stage = state.stage) {
  return teamSeasonRows(allData, stage)
    .sort((a, b) => b.gf - a.gf || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function leastGoalsAgainst(allData, stage = state.stage) {
  return teamSeasonRows(allData, stage)
    .sort((a, b) => a.ga - b.ga || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function bestGoalDifferential(allData, stage = state.stage) {
  return teamSeasonRows(allData, stage)
    .sort((a, b) => b.gd - a.gd || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

const MIN_TEAM_GAMES_FOR_RATE = 5;

function bestTeamPointsPerGame(allData, stage = state.stage) {
  return teamSeasonRows(allData, stage)
    .filter((row) => row.gp >= MIN_TEAM_GAMES_FOR_RATE)
    .map((row) => ({ ...row, ppg: row.pts / row.gp }))
    .sort((a, b) => b.ppg - a.ppg || b.pts - a.pts || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function mostCleanSheetsInSeason(allData, stage = state.stage) {
  const rows = new Map();
  allData.forEach((season) => {
    const teamsById = new Map((season.teams || []).map((team) => [team.id, team]));
    (season.matches || [])
      .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
      .filter((match) => matchesStageValue(match, stage))
      .filter(matchesDivision)
      .forEach((match) => {
        const addCleanSheet = (teamId) => {
          const team = teamsById.get(teamId);
          if (!team) return;
          const key = `${season.year}:${teamId}`;
          const existing = rows.get(key) || { teamId, teamName: team.name, season: season.year, count: 0 };
          existing.count += 1;
          rows.set(key, existing);
        };
        if (match.awayScore === 0) addCleanSheet(match.homeTeamId);
        if (match.homeScore === 0) addCleanSheet(match.awayTeamId);
      });
  });
  return [...rows.values()].sort((a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName)).slice(0, 5);
}

function worstSingleGameDefense(allData, stage = state.stage) {
  const rows = [];
  allData.forEach((season) => {
    const teamsById = new Map((season.teams || []).map((team) => [team.id, team]));
    (season.matches || [])
      .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
      .filter((match) => matchesStageValue(match, stage))
      .filter(matchesDivision)
      .forEach((match) => {
        const home = teamsById.get(match.homeTeamId);
        const away = teamsById.get(match.awayTeamId);
        if (home) {
          rows.push({ teamId: match.homeTeamId, teamName: home.name, opponent: away?.name || "Team TBA", season: season.year, conceded: match.awayScore, label: match.label || `Week ${match.week}` });
        }
        if (away) {
          rows.push({ teamId: match.awayTeamId, teamName: away.name, opponent: home?.name || "Team TBA", season: season.year, conceded: match.homeScore, label: match.label || `Week ${match.week}` });
        }
      });
  });
  return rows
    .filter((row) => row.conceded > 0)
    .sort((a, b) => b.conceded - a.conceded || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

const MIN_COACH_GAMES_FOR_RATE = 5;

function bestCoachWinPct(allData, stage = state.stage) {
  return computeCoachSummary(allData, { stage })
    .filter(matchesDivision)
    .filter((coach) => coach.gamesPlayed >= MIN_COACH_GAMES_FOR_RATE)
    .map((coach) => ({ ...coach, pct: coach.gamesPlayed ? coach.wins / coach.gamesPlayed : 0 }))
    .sort((a, b) => b.pct - a.pct || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function mostFinalsAppearances(allData, stage = state.stage) {
  return computeCoachSummary(allData, { stage })
    .filter(matchesDivision)
    .filter((coach) => coach.finals > 0)
    .sort((a, b) => b.finals - a.finals || b.championships - a.championships || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function mostPostseasonGoals(allData) {
  const rows = [];
  allData.forEach((season) => {
    (season.teams || [])
      .filter(matchesDivision)
      .forEach((team) => {
        const record = calculateTeamRecord(season, team.id, { stage: "playoffs" });
        if (record && record.gp > 0 && record.gf > 0) {
          rows.push({ teamId: team.id, teamName: team.name, season: season.year, goals: record.gf, gp: record.gp });
        }
      });
  });
  return rows.sort((a, b) => b.goals - a.goals || a.teamName.localeCompare(b.teamName)).slice(0, 5);
}

function coachChampionships(allData, stage = state.stage) {
  return computeCoachSummary(allData, { stage })
    .filter(matchesDivision)
    .filter((coach) => coach.championships > 0)
    .sort((a, b) => b.championships - a.championships || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function cupChampions(allData) {
  if (state.stage === "regular") return [];
  const rows = [];
  allData.forEach((season) => {
    const playoffs = season.playoffs;
    if (!playoffs) return;
    const divisionEntries = Array.isArray(playoffs.divisions) ? playoffs.divisions : [playoffs];
    divisionEntries.forEach((entry) => {
      if (!entry.champion) return;
      if (state.division !== "All" && entry.division !== state.division) return;
      const finalRound = (entry.rounds || []).find((round) => /^finals?$/i.test((round.name || "").trim())) || {};
      const finalMatch = (finalRound.matches || []).find((match) => !/3rd/i.test(match.label || "")) || {};
      const runnerUpId = finalMatch.winnerId === finalMatch.homeTeamId ? finalMatch.awayTeamId : finalMatch.homeTeamId;
      const runnerUpName = finalMatch.winnerId === finalMatch.homeTeamId ? finalMatch.awayTeamName : finalMatch.homeTeamName;
      // Match the champion team by id from the bracket first (reliable), and
      // only fall back to a name-string match if the bracket didn't record a
      // winnerId. Some seasons' playoffs.json spells the champion's name
      // slightly differently from teams.json (e.g. "Umer Memon F.C." vs
      // "Umer Memon FC"), which would otherwise silently return an empty
      // roster and drop that whole championship out of the repeat-winner count.
      const championTeam =
        (season.teams || []).find((team) => team.id === finalMatch.winnerId) ||
        (season.teams || []).find((team) => team.name === entry.champion);
      rows.push({
        season: season.year,
        division: entry.division || season.division || "Seniors",
        champion: entry.champion,
        championId: championTeam?.id || finalMatch.winnerId || "",
        runnerUp: runnerUpName || "",
        roster: championTeam?.roster || [],
      });
    });
  });
  return rows.sort((a, b) => a.season.localeCompare(b.season) || a.division.localeCompare(b.division));
}

function cupRepeatWinners(champions) {
  const byPlayer = new Map();
  champions.forEach((row) => {
    (row.roster || []).forEach((player) => {
      if (!byPlayer.has(player.id)) byPlayer.set(player.id, []);
      byPlayer.get(player.id).push({ name: player.name, season: row.season, division: row.division, team: row.champion });
    });
  });
  const multi = [];
  const backToBack = [];
  byPlayer.forEach((wins, playerId) => {
    if (wins.length < 2) return;
    multi.push({ id: playerId, name: wins[0].name, count: wins.length, seasons: wins.map((w) => w.season).join(", ") });
    const sortedYears = wins.map((w) => Number(w.season)).sort((a, b) => a - b);
    for (let i = 1; i < sortedYears.length; i++) {
      if (sortedYears[i] === sortedYears[i - 1] + 1) {
        backToBack.push({ id: playerId, name: wins[0].name, seasons: `${sortedYears[i - 1]}-${sortedYears[i]}` });
        break;
      }
    }
  });
  return {
    multi: multi.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    backToBack: backToBack.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function matchDateValue(match) {
  const value = Date.parse(`${match.date || ""} 12:00:00`);
  return Number.isFinite(value) ? value : 0;
}

function seasonTeamResults(season, stage = state.stage) {
  const teamsById = new Map((season.teams || []).map((team) => [team.id, team]));
  const matches = (season.matches || [])
    .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
    .filter((match) => matchesStageValue(match, stage))
    .filter((match) => state.division === "All" || match.division === state.division)
    .slice()
    .sort((a, b) => matchDateValue(a) - matchDateValue(b));

  const results = new Map();
  matches.forEach((match) => {
    const home = match.homeTeamId;
    const away = match.awayTeamId;
    const homeGoals = match.homeScore;
    const awayGoals = match.awayScore;
    const homeResult = homeGoals === awayGoals ? "D" : homeGoals > awayGoals ? "W" : "L";
    const awayResult = homeGoals === awayGoals ? "D" : awayGoals > homeGoals ? "W" : "L";
    if (!results.has(home)) results.set(home, []);
    if (!results.has(away)) results.set(away, []);
    results.get(home).push({ result: homeResult, goalsFor: homeGoals, date: match.date });
    results.get(away).push({ result: awayResult, goalsFor: awayGoals, date: match.date });
  });

  return { teamsById, results };
}

function longestResultStreaks(allData, stage = state.stage) {
  const winStreaks = [];
  const lossStreaks = [];
  allData.forEach((season) => {
    const { teamsById, results } = seasonTeamResults(season, stage);
    results.forEach((games, teamId) => {
      const team = teamsById.get(teamId);
      if (!team) return;
      let winRun = 0;
      let bestWin = 0;
      let lossRun = 0;
      let bestLoss = 0;
      games.forEach((game) => {
        winRun = game.result === "W" ? winRun + 1 : 0;
        bestWin = Math.max(bestWin, winRun);
        lossRun = game.result === "L" ? lossRun + 1 : 0;
        bestLoss = Math.max(bestLoss, lossRun);
      });
      if (bestWin > 0) winStreaks.push({ teamId, teamName: team.name, season: season.year, length: bestWin });
      if (bestLoss > 0) lossStreaks.push({ teamId, teamName: team.name, season: season.year, length: bestLoss });
    });
  });
  return {
    win: winStreaks.sort((a, b) => b.length - a.length || a.teamName.localeCompare(b.teamName)).slice(0, 5),
    loss: lossStreaks.sort((a, b) => b.length - a.length || a.teamName.localeCompare(b.teamName)).slice(0, 5),
  };
}

function biggestScoringStreaks(allData, stage = state.stage) {
  const hot = [];
  const cold = [];
  allData.forEach((season) => {
    const { teamsById, results } = seasonTeamResults(season, stage);
    results.forEach((games, teamId) => {
      const team = teamsById.get(teamId);
      if (!team) return;
      let hotRun = 0;
      let bestHot = 0;
      let coldRun = 0;
      let bestCold = 0;
      games.forEach((game) => {
        hotRun = game.goalsFor >= 2 ? hotRun + 1 : 0;
        bestHot = Math.max(bestHot, hotRun);
        coldRun = game.goalsFor <= 1 ? coldRun + 1 : 0;
        bestCold = Math.max(bestCold, coldRun);
      });
      if (bestHot > 0) hot.push({ teamId, teamName: team.name, season: season.year, length: bestHot });
      if (bestCold > 0) cold.push({ teamId, teamName: team.name, season: season.year, length: bestCold });
    });
  });
  return {
    hot: hot.sort((a, b) => b.length - a.length || a.teamName.localeCompare(b.teamName)).slice(0, 5),
    cold: cold.sort((a, b) => b.length - a.length || a.teamName.localeCompare(b.teamName)).slice(0, 5),
  };
}

function renderFilters() {
  return `
    <div class="all-time-filter-bar records-filter-bar">
      <div>
        <span class="eyebrow">Category</span>
        <div class="all-time-toggle four" role="group" aria-label="Records category filter">
          ${categoryOptions
            .map(
              (option) =>
                `<button class="${state.category === option.value ? "active" : ""}" type="button" data-category="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`
            )
            .join("")}
        </div>
      </div>
      <div>
        <span class="eyebrow">Division</span>
        <div class="all-time-toggle" role="group" aria-label="Records division filter">
          ${divisionOptions
            .map(
              (option) =>
                `<button class="${state.division === option.value ? "active" : ""}" type="button" data-division="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`
            )
            .join("")}
        </div>
      </div>
      <div>
        <span class="eyebrow">Games From</span>
        <div class="all-time-toggle wide" role="group" aria-label="Record game stage filter">
          ${stageOptions
            .map(
              (option) =>
                `<button class="${state.stage === option.value ? "active" : ""}" type="button" data-stage="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderCupSection(allData) {
  const champions = cupChampions(allData);
  const { multi, backToBack } = cupRepeatWinners(champions);
  const postseasonGoals = state.stage === "regular" ? [] : mostPostseasonGoals(allData);
  const scopeDescription = state.stage === "all"
    ? "Complete LSL Cup history across every championship season and division."
    : "Playoff champion by season and division.";
  return `
    <section class="section-panel records-grid-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(stageLabel())}</span>
          <h3>${escapeHTML(state.stage === "all" ? "All LSL Cup Records" : "LSL Cup Records")}</h3>
          <p>${escapeHTML(scopeDescription)}</p>
        </div>
      </div>
      <div class="records-grid">
        ${recordTable("LSL Cup Champions", scopeDescription, champions, [
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Division", render: (row) => escapeHTML(row.division) },
          { label: "Champion", render: (row) => (row.championId ? teamLink({ teamId: row.championId, teamName: row.champion }, row.season) : escapeHTML(row.champion)) },
          { label: "Runner-Up", render: (row) => escapeHTML(teamCodeFor(null, row.runnerUp || "TBA")) },
        ])}
        ${recordTable("Multiple-Time Champions", "Players who were on 2 or more LSL Cup-winning rosters.", multi, [
          { label: "Player", render: (row) => playerLink({ id: row.id, name: row.name }) },
          { label: "Titles", num: true, render: (row) => row.count },
          { label: "Seasons", render: (row) => escapeHTML(row.seasons) },
        ])}
        ${recordTable("Back-To-Back Champions", "Players on a title-winning roster in consecutive seasons.", backToBack, [
          { label: "Player", render: (row) => playerLink({ id: row.id, name: row.name }) },
          { label: "Seasons", render: (row) => escapeHTML(row.seasons) },
        ])}
        ${recordTable("Most Goals In A Single Postseason Run", "Most combined playoff goals scored by one team in one season.", postseasonGoals, [
          { label: "Team", render: (row) => teamLink(row, row.season) },
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Games", num: true, render: (row) => row.gp },
          { label: "Goals", num: true, render: (row) => row.goals },
        ])}
      </div>
      ${!multi.length ? `<p class="franchise-note">No player has won the LSL Cup more than once yet \u2014 each completed championship so far has gone to a different roster.</p>` : ""}
    </section>
  `;
}

function coachRecordScopeDescription(stage) {
  if (stage === "regular") return "Regular Season coaching records only. Playoff results are excluded.";
  if (stage === "playoffs") return "Playoff coaching records only. Regular Season results are excluded.";
  return "Regular Season and Playoff coaching records shown separately.";
}

function renderCoachRecordSection(allData, stage) {
  const label = stageLabelFor(stage);
  const id = `coach-records-${stage}`;
  const coachWins = computeCoachSummary(allData, { stage })
    .filter(matchesDivision)
    .filter((coach) => coach.wins > 0)
    .sort((a, b) => b.wins - a.wins || b.championships - a.championships || a.name.localeCompare(b.name))
    .slice(0, 5);

  return `
    <section class="section-panel records-grid-panel coach-record-stage" aria-labelledby="${escapeHTML(id)}">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(label)}</span>
          <h3 id="${escapeHTML(id)}">${escapeHTML(label)} Coach Records</h3>
          <p>${escapeHTML(coachRecordScopeDescription(stage))}</p>
        </div>
      </div>
      <div class="records-grid">
        ${recordTable("Coach Wins", `${label} coaching wins from listed team records.`, coachWins, [
          { label: "Coach", render: coachLink },
          { label: "Teams", render: (row) => escapeHTML(teamListDisplay(row.pastTeams || [row.teamName])) },
          { label: "Wins", num: true, render: (row) => row.wins },
          { label: "Titles", num: true, render: (row) => row.championships },
        ])}
        ${recordTable("Best Win Percentage", `${label} win percentage, minimum ${MIN_COACH_GAMES_FOR_RATE} games coached.`, bestCoachWinPct(allData, stage), [
          { label: "Coach", render: coachLink },
          { label: "Teams", render: (row) => escapeHTML(teamListDisplay(row.pastTeams || [row.teamName])) },
          { label: "Win %", num: true, render: (row) => `${(row.pct * 100).toFixed(1)}%` },
          { label: "Record", render: (row) => `${row.wins}-${row.ties}-${row.losses}` },
        ])}
        ${stage === "playoffs" ? `
          ${recordTable("Coach Championships", "Coaches with one or more LSL Cup titles on record.", coachChampionships(allData, stage), [
            { label: "Coach", render: coachLink },
            { label: "Teams", render: (row) => escapeHTML(teamListDisplay(row.pastTeams || [row.teamName])) },
            { label: "Titles", num: true, render: (row) => row.championships },
            { label: "Wins", num: true, render: (row) => row.wins },
          ])}
          ${recordTable("Most Finals Appearances", "Most LSL Cup Final appearances by one coach.", mostFinalsAppearances(allData, stage), [
            { label: "Coach", render: coachLink },
            { label: "Teams", render: (row) => escapeHTML(teamListDisplay(row.pastTeams || [row.teamName])) },
            { label: "Finals", num: true, render: (row) => row.finals },
            { label: "Titles", num: true, render: (row) => row.championships },
          ])}
        ` : ""}
      </div>
    </section>
  `;
}

function playerRecordSet(allData, stage) {
  const singleSeasonGoals = playerSeasonRows(allData, stage)
    .filter((player) => player.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
    .slice(0, 5);
  const careerGoals = combinedPlayerStatsForDivision(allData, { stage })
    .filter((player) => player.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    singleSeasonGoals,
    careerGoals,
    singleGameGoals: biggestSingleGameGoals(allData, stage),
    multiGoalGames: multiGoalGameCounts(allData, stage),
    careerGamesPlayed: mostCareerGamesPlayed(allData, stage),
    goalsPerGameRate: bestGoalsPerGameRate(allData, stage),
  };
}

function renderPlayerRecordSection(allData, stage) {
  const label = stageLabelFor(stage);
  const records = playerRecordSet(allData, stage);
  const isPlayoffs = stage === "playoffs";
  const id = `player-records-${stage}`;

  return `
    <section class="section-panel records-grid-panel player-record-stage" aria-labelledby="${escapeHTML(id)}">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(label)}</span>
          <h3 id="${escapeHTML(id)}">${escapeHTML(label)} Player Records</h3>
          <p>${escapeHTML(playerRecordScopeDescription(stage))}</p>
        </div>
      </div>
      <div class="records-grid">
        ${recordTable(
          isPlayoffs ? "Most Goals In A Playoff Run" : "Most Goals In A Season",
          isPlayoffs ? "Most goals scored by one player during one playoff run." : "Most goals scored by one player during one Regular Season.",
          records.singleSeasonGoals,
          [
            { label: "Player", render: playerLink },
            { label: "Season", render: (row) => escapeHTML(row.season) },
            { label: "Team", render: (row) => teamLink(row, row.season) },
            { label: "Goals", num: true, render: (row) => row.goals },
          ]
        )}
        ${recordTable(
          isPlayoffs ? "Career Goals In The Playoffs" : "Career Goals In The Regular Season",
          isPlayoffs ? "Career goals scored across all listed playoff seasons in the selected division." : "Career goals scored across all listed Regular Season seasons in the selected division.",
          records.careerGoals,
          [
            { label: "Player", render: playerLink },
            { label: "Teams", render: (row) => escapeHTML(teamDisplay(row)) },
            { label: "Goals", num: true, render: (row) => row.goals },
            { label: "Games Played", num: true, render: (row) => row.gamesPlayed },
          ]
        )}
        ${recordTable(
          isPlayoffs ? "Most Goals In A Single Playoff Game" : "Most Goals In A Single Regular Season Game",
          isPlayoffs ? "Most goals scored by one player in one playoff game." : "Most goals scored by one player in one Regular Season game.",
          records.singleGameGoals,
          [
            { label: "Player", render: (row) => playerLink(row) },
            { label: "Season", render: (row) => escapeHTML(row.season) },
            { label: "Team", render: (row) => escapeHTML(teamDisplay(row)) },
            { label: "vs", render: (row) => escapeHTML(teamCodeFor(null, row.opponent)) },
            { label: "Goals", num: true, render: (row) => row.goals },
          ]
        )}
        ${recordTable(
          isPlayoffs ? "Most Multi-Goal Games In A Playoff Season" : "Most Multi-Goal Games In A Season",
          isPlayoffs ? "Most games with 2 or more goals by the same player in one playoff season." : "Most games with 2 or more goals by the same player in one Regular Season.",
          records.multiGoalGames,
          [
            { label: "Player", render: (row) => playerLink(row) },
            { label: "Season", render: (row) => escapeHTML(row.season) },
            { label: "Team", render: (row) => escapeHTML(teamDisplay(row)) },
            { label: "Multi-Goal Games", num: true, render: (row) => row.count },
          ]
        )}
        ${recordTable(
          isPlayoffs ? "Most Career Games Played In The Playoffs" : "Most Career Games Played In The Regular Season",
          isPlayoffs ? "Most career games played across all listed playoff seasons in the selected division." : "Most career games played across all listed Regular Season seasons in the selected division.",
          records.careerGamesPlayed,
          [
            { label: "Player", render: playerLink },
            { label: "Teams", render: (row) => escapeHTML(teamDisplay(row)) },
            { label: "Games Played", num: true, render: (row) => row.gamesPlayed },
          ]
        )}
        ${recordTable(
          isPlayoffs ? "Best Goals-Per-Game Rate In A Playoff Season" : "Best Goals-Per-Game Rate In The Regular Season",
          isPlayoffs ? `Best playoff goals-per-game rate, minimum ${MIN_GAMES_FOR_RATE} games played.` : `Best Regular Season goals-per-game rate, minimum ${MIN_GAMES_FOR_RATE} games played.`,
          records.goalsPerGameRate,
          [
            { label: "Player", render: playerLink },
            { label: "Team", render: (row) => escapeHTML(teamDisplay(row)) },
            { label: "Rate", num: true, render: (row) => row.rate.toFixed(2) },
            { label: "Goals", num: true, render: (row) => row.goals },
            { label: "Games", num: true, render: (row) => row.gamesPlayed },
          ]
        )}
      </div>
    </section>
  `;
}

function bestPlayoffWinRate(allData) {
  return teamSeasonRows(allData, "playoffs")
    .filter((row) => row.gp > 0)
    .map((row) => ({ ...row, winRate: row.w / row.gp }))
    .sort((a, b) => b.winRate - a.winRate || b.w - a.w || b.gd - a.gd || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function teamRecordScopeDescription(stage) {
  if (stage === "regular") return "Regular Season team records only. Points and points-per-game apply here.";
  if (stage === "playoffs") return "Playoff team records only. Playoff records use wins, goal difference, and goals instead of points.";
  return "Regular Season and Playoff team records shown separately. Playoff records do not use points.";
}

function renderTeamRecordSection(allData, stage) {
  const label = stageLabelFor(stage);
  const isPlayoffs = stage === "playoffs";
  const rows = {
    bestTeam: isPlayoffs ? bestPlayoffRuns(allData) : bestTeams(allData, stage),
    goalsFor: bestGoalsFor(allData, stage),
    goalDifference: bestGoalDifferential(allData, stage),
    goalsAgainst: leastGoalsAgainst(allData, stage),
    cleanSheets: mostCleanSheetsInSeason(allData, stage),
    pointsPerGame: isPlayoffs ? bestPlayoffWinRate(allData) : bestTeamPointsPerGame(allData, stage),
    biggestWins: biggestWins(allData, stage),
    biggestLosses: biggestLosses(allData, stage),
    defensive: worstSingleGameDefense(allData, stage),
    streaks: longestResultStreaks(allData, stage),
    scoringStreaks: biggestScoringStreaks(allData, stage),
  };
  const id = `team-records-${stage}`;
  const seasonColumn = (row) => `${escapeHTML(row.season)} ${escapeHTML(row.division)}`;
  const teamColumn = (row) => teamLink(row, row.season);
  const tiedOptions = { tiebreaker: true };

  return `
    <section class="section-panel records-grid-panel team-record-stage" aria-labelledby="${escapeHTML(id)}">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(label)}</span>
          <h3 id="${escapeHTML(id)}">${escapeHTML(label)} Team Records</h3>
          <p>${escapeHTML(teamRecordScopeDescription(stage))}</p>
        </div>
      </div>
      <div class="records-grid">
        ${isPlayoffs
          ? recordTable("Best Team Playoff Run", "Most wins by one team in one playoff run; ties are ordered by goal difference, then goals scored.", rows.bestTeam, [
              { label: "Team", render: teamColumn },
              { label: "Season", render: seasonColumn },
              { label: "Wins", num: true, render: (row) => row.w },
              { label: "Record", render: (row) => `${row.w}-${row.d}-${row.l}` },
            ], "good", tiedOptions)
          : recordTable("Best Team Season In The Regular Season", "Highest Regular Season point total; ties are ordered by wins, then goal difference.", rows.bestTeam, [
              { label: "Team", render: teamColumn },
              { label: "Season", render: seasonColumn },
              { label: "Points", num: true, render: (row) => row.pts },
              { label: "Record", render: (row) => `${row.w}-${row.d}-${row.l}` },
            ], "good", tiedOptions)}
        ${recordTable(isPlayoffs ? "Best Goals For In The Playoffs" : "Best Goals For In The Regular Season", `Most goals scored by one team in one ${label.toLowerCase()}.`, rows.goalsFor, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: seasonColumn },
          { label: "GF", num: true, render: (row) => row.gf },
        ], "good")}
        ${recordTable(isPlayoffs ? "Best Goal Differential In The Playoffs" : "Best Goal Differential In The Regular Season", `Best goal difference by one team in one ${label.toLowerCase()}.`, rows.goalDifference, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: seasonColumn },
          { label: "GD", num: true, render: (row) => (row.gd > 0 ? `+${row.gd}` : row.gd) },
        ], "good")}
        ${recordTable(isPlayoffs ? "Least Goals Against In The Playoffs" : "Least Goals Against In The Regular Season", `Fewest goals conceded by one team in one ${label.toLowerCase()}.`, rows.goalsAgainst, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: seasonColumn },
          { label: "GA", num: true, render: (row) => row.ga },
        ], "good")}
        ${recordTable(isPlayoffs ? "Most Clean Sheets In A Playoff Run" : "Most Clean Sheets In A Regular Season", `Most games in one ${label.toLowerCase()} with the opponent held scoreless.`, rows.cleanSheets, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Clean Sheets", num: true, render: (row) => row.count },
        ], "good")}
        ${isPlayoffs
          ? recordTable("Best Win Rate In The Playoffs", "Best playoff win rate; ties are ordered by wins, then goal difference.", rows.pointsPerGame, [
              { label: "Team", render: teamColumn },
              { label: "Season", render: seasonColumn },
              { label: "Win %", num: true, render: (row) => `${(row.winRate * 100).toFixed(1)}%` },
              { label: "Wins", num: true, render: (row) => row.w },
            ], "good", tiedOptions)
          : recordTable("Best Points-Per-Game Rate In The Regular Season", "Best Regular Season points-per-game rate, minimum 5 games played.", rows.pointsPerGame, [
              { label: "Team", render: teamColumn },
              { label: "Season", render: seasonColumn },
              { label: "PPG", num: true, render: (row) => row.ppg.toFixed(2) },
              { label: "Points", num: true, render: (row) => row.pts },
            ], "good")}
        ${recordTable(isPlayoffs ? "Biggest Wins In The Playoffs" : "Biggest Wins In The Regular Season", `Largest listed ${label.toLowerCase()} score margins.`, rows.biggestWins, [
          { label: "Winner", render: (row) => teamLink(row.winner || { name: "Team TBA" }, row.season) },
          { label: "Opponent", render: (row) => escapeHTML(teamCodeFor(row.loser?.id, row.loser?.name || "Team TBA")) },
          { label: "Score", render: (row) => escapeHTML(row.score) },
          { label: "Margin", num: true, render: (row) => row.margin },
        ], "good")}
        ${recordTable(isPlayoffs ? "Biggest Losses In The Playoffs" : "Biggest Losses In The Regular Season", `Largest listed ${label.toLowerCase()} losses by goal margin.`, rows.biggestLosses, [
          { label: "Team", render: (row) => teamLink(row.loser || { name: "Team TBA" }, row.season) },
          { label: "Opponent", render: (row) => escapeHTML(teamCodeFor(row.winner?.id, row.winner?.name || "Team TBA")) },
          { label: "Score", render: (row) => escapeHTML(row.score) },
          { label: "Margin", num: true, render: (row) => row.margin },
        ], "bad")}
        ${recordTable(isPlayoffs ? "Worst Single-Game Defensive Performance In The Playoffs" : "Worst Single-Game Defensive Performance In The Regular Season", `Most goals conceded by one team in a single ${label.toLowerCase()} game.`, rows.defensive, [
          { label: "Team", render: (row) => teamLink(row, row.season) },
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "vs", render: (row) => escapeHTML(teamCodeFor(null, row.opponent)) },
          { label: "Goals Conceded", num: true, render: (row) => row.conceded },
        ], "bad")}
      </div>
    </section>

    <section class="section-panel records-grid-panel team-streak-stage" aria-labelledby="${escapeHTML(`${id}-streaks`)}">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">On Record</span>
          <h3 id="${escapeHTML(`${id}-streaks`)}">${escapeHTML(label)} Streaks &amp; Trends</h3>
          <p>${escapeHTML(`Team streaks and scoring runs from ${label.toLowerCase()} matches.`)}</p>
        </div>
      </div>
      <div class="records-grid">
        ${recordTable(`Most Consecutive Wins In The ${label}`, `Longest winning streak by one team in one ${label.toLowerCase()}.`, rows.streaks.win, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Streak", num: true, render: (row) => `${row.length} games` },
        ], "good")}
        ${recordTable(`Most Consecutive Losses In The ${label}`, `Longest losing streak by one team in one ${label.toLowerCase()}.`, rows.streaks.loss, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Streak", num: true, render: (row) => `${row.length} games` },
        ], "bad")}
        ${recordTable(`${isPlayoffs ? "Hottest Scoring Streaks In The Playoffs" : "Hottest Scoring Streaks In The Regular Season"}`, `Most consecutive games scoring 2+ goals in the ${label.toLowerCase()}.`, rows.scoringStreaks.hot, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Streak", num: true, render: (row) => `${row.length} games` },
        ], "good")}
        ${recordTable(`${isPlayoffs ? "Coldest Scoring Streaks In The Playoffs" : "Coldest Scoring Streaks In The Regular Season"}`, `Most consecutive games held to 1 goal or fewer in the ${label.toLowerCase()}.`, rows.scoringStreaks.cold, [
          { label: "Team", render: teamColumn },
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Streak", num: true, render: (row) => `${row.length} games` },
        ], "bad")}
      </div>
    </section>
  `;
}

function render(allData) {
  teamCodeMap = buildTeamCodeMap(allData);
  const selectedCategoryLabel = categoryOptions.find((option) => option.value === state.category)?.label || "Records";

  const archiveYears = allData
    .filter((season) => (season.matches || []).some((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)))
    .map((season) => season.year)
    .sort((a, b) => Number(a) - Number(b));
  root.innerHTML = `
    <section class="section-panel records-hero">
      <div class="records-hero-copy">
        <span class="eyebrow">The League Record Book</span>
        <h1>LSL Records</h1>
        <p>The goals. The winning runs. The names that made league history.</p>
        <div class="records-archive"><span>Season archives</span>${archiveYears.map(year => `<strong>${escapeHTML(year)}</strong>`).join("")}</div>
        <div class="button-row records-hero-actions"><a class="button primary" href="./record-watch.html">Record Watch</a><a class="button" href="./lsl-timeline.html">LSL Timeline</a></div>
      </div>
      <img class="records-seal" src="${escapeHTML(SITE.logo)}" alt="Lantern Soccer League">
    </section>
    <section class="section-panel records-controls" aria-label="Record filters">
      ${renderFilters()}
    </section>
    <div class="records-collection-heading">
      <div>
        <h2>${escapeHTML(selectedCategoryLabel)}</h2>
        ${state.category === "player" ? `<p>${escapeHTML(playerRecordScopeDescription(state.stage))}</p>` : state.category === "team" ? `<p>${escapeHTML(teamRecordScopeDescription(state.stage))}</p>` : state.category === "coach" ? `<p>${escapeHTML(coachRecordScopeDescription(state.stage))}</p>` : state.category === "cup" ? `<p>${escapeHTML(state.stage === "all" ? "Complete LSL Cup history across every championship season and division." : "Playoff championship history by season and division.")}</p>` : ""}
      </div>
      <span>${escapeHTML(state.division)} / ${escapeHTML(stageLabel())}</span>
    </div>

    ${state.stage === "all" ? `
      <div class="records-all-note" role="status">
        <span class="eyebrow">All Stages</span>
        <strong>Regular Season + Playoffs</strong>
        <span>Both record books are shown below in separate sections.</span>
      </div>
    ` : ""}

    ${state.category === "player" ? (state.stage === "all" ? `${renderPlayerRecordSection(allData, "regular")}${renderPlayerRecordSection(allData, "playoffs")}` : renderPlayerRecordSection(allData, state.stage)) : ""}

    ${state.category === "team" ? (state.stage === "all" ? `${renderTeamRecordSection(allData, "regular")}${renderTeamRecordSection(allData, "playoffs")}` : renderTeamRecordSection(allData, state.stage)) : ""}

    ${state.category === "coach" ? (state.stage === "all" ? `${renderCoachRecordSection(allData, "regular")}${renderCoachRecordSection(allData, "playoffs")}` : renderCoachRecordSection(allData, state.stage)) : ""}

    ${state.category === "cup" ? renderCupSection(allData) : ""}
  `;

  root.querySelectorAll("[data-division]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.division === state.division));
    button.addEventListener("click", () => {
      state.division = button.dataset.division;
      render(allData);
      root.querySelector("[data-division].active")?.focus({ preventScroll: true });
    });
  });

  root.querySelectorAll("[data-category]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      render(allData);
      root.querySelector("[data-category].active")?.focus({ preventScroll: true });
    });
  });

  root.querySelectorAll("[data-stage]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.stage === state.stage));
    button.addEventListener("click", () => {
      state.stage = button.dataset.stage;
      render(allData);
      root.querySelector("[data-stage].active")?.focus({ preventScroll: true });
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading records...");
  try {
    render(await loadAllSeasons());
  } catch (error) {
    console.error("Could not load records", error);
    root.innerHTML = statusMessage("error", "Records are temporarily unavailable. Please try again soon.");
  }
}

init();
