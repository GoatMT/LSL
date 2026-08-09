import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { calculateStandings, calculateTeamRecord, computeCoachSummary, computeCombinedPlayerStats, computePlayerStats } from "./leagueEngine.js?v=3.4";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("records.html");
setDocumentTitle("Records");

const root = document.getElementById("page-root");
let state = { division: "Seniors", category: "player" };

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

function matchesDivision(item) {
  return state.division === "All" || item.division === state.division;
}

// Combines a player's stats only across the seasons where they actually played in the
// currently selected division, so e.g. a player's Juniors-era goals never get folded into
// their Seniors career total just because they moved up divisions in a later season.
function combinedPlayerStatsForDivision(allData, options = {}) {
  const scopedSeasons = allData.map((season) => ({
    ...season,
    players: (season.players || []).filter((player) => player.division === state.division),
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
  return `<a href="${escapeHTML(teamProfileHref(team.teamId || team.id, season))}">${escapeHTML(team.teamName || team.name)}</a>`;
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

function recordTable(title, note, items, columns, tone = "good") {
  return `
    <article class="card record-card record-card--${escapeHTML(tone)}">
      <div class="record-card-head">
        <div>
          <span class="eyebrow">Record</span>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(note)}</p>
        </div>
      </div>
      <div class="table-wrap record-table-wrap">
        <table class="data-table record-table">
          <thead>
            <tr>
              <th>Rank</th>
              ${columns.map((column) => `<th class="${column.num ? "num" : ""}">${escapeHTML(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${items.length ? recordRows(items, columns) : `<tr><td colspan="${columns.length + 1}">No records found.</td></tr>`}</tbody>
        </table>
      </div>
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

function biggestSingleGameGoals(allData) {
  return allData
    .flatMap((season) =>
      (season.matches || [])
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

function multiGoalGameCounts(allData) {
  const rows = new Map();
  allData.forEach((season) => {
    (season.matches || []).filter(matchesDivision).forEach((match) => {
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

function mostCareerGamesPlayed(allData) {
  return combinedPlayerStatsForDivision(allData, { stage: "all" })
    .filter((player) => player.gamesPlayed > 0)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function bestGoalsPerGameRate(allData) {
  return combinedPlayerStatsForDivision(allData, { stage: "regular" })
    .filter((player) => player.gamesPlayed >= MIN_GAMES_FOR_RATE)
    .map((player) => ({ ...player, rate: player.goals / player.gamesPlayed }))
    .sort((a, b) => b.rate - a.rate || b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function biggestWins(allData) {
  return allData
    .flatMap((season) =>
      (season.matches || [])
        .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
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

function bestTeams(allData) {
  const divisions = state.division === "All" ? SITE.divisions : [state.division];
  return allData
    .flatMap((season) =>
      divisions.flatMap((division) =>
        calculateStandings(season, { division })
          .filter((row) => row.gp > 0)
          .map((row) => ({
            ...row,
            season: season.year,
            division,
            teamId: row.teamId,
            teamName: row.team.name,
          }))
      )
    )
    .sort((a, b) => b.pts - a.pts || b.w - a.w || b.gd - a.gd || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function teamSeasonRows(allData) {
  const divisions = state.division === "All" ? SITE.divisions : [state.division];
  return allData.flatMap((season) =>
    divisions.flatMap((division) =>
      calculateStandings(season, { division })
        .filter((row) => row.gp > 0)
        .map((row) => ({
          ...row,
          season: season.year,
          division,
          teamId: row.teamId,
          teamName: row.team.name,
        }))
    )
  );
}

function bestGoalsFor(allData) {
  return teamSeasonRows(allData)
    .sort((a, b) => b.gf - a.gf || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function leastGoalsAgainst(allData) {
  return teamSeasonRows(allData)
    .sort((a, b) => a.ga - b.ga || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function bestGoalDifferential(allData) {
  return teamSeasonRows(allData)
    .sort((a, b) => b.gd - a.gd || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

const MIN_TEAM_GAMES_FOR_RATE = 5;

function bestTeamPointsPerGame(allData) {
  return teamSeasonRows(allData)
    .filter((row) => row.gp >= MIN_TEAM_GAMES_FOR_RATE)
    .map((row) => ({ ...row, ppg: row.pts / row.gp }))
    .sort((a, b) => b.ppg - a.ppg || b.pts - a.pts || a.teamName.localeCompare(b.teamName))
    .slice(0, 5);
}

function mostCleanSheetsInSeason(allData) {
  const rows = new Map();
  allData.forEach((season) => {
    const teamsById = new Map((season.teams || []).map((team) => [team.id, team]));
    (season.matches || [])
      .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
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

function worstSingleGameDefense(allData) {
  const rows = [];
  allData.forEach((season) => {
    const teamsById = new Map((season.teams || []).map((team) => [team.id, team]));
    (season.matches || [])
      .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
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

function bestCoachWinPct(allData) {
  return computeCoachSummary(allData)
    .filter(matchesDivision)
    .filter((coach) => coach.gamesPlayed >= MIN_COACH_GAMES_FOR_RATE)
    .map((coach) => ({ ...coach, pct: coach.gamesPlayed ? coach.wins / coach.gamesPlayed : 0 }))
    .sort((a, b) => b.pct - a.pct || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function mostFinalsAppearances(allData) {
  return computeCoachSummary(allData)
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

function coachChampionships(allData) {
  return computeCoachSummary(allData)
    .filter(matchesDivision)
    .filter((coach) => coach.championships > 0)
    .sort((a, b) => b.championships - a.championships || b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, 5);
}

function cupChampions(allData) {
  const rows = [];
  allData.forEach((season) => {
    const playoffs = season.playoffs;
    if (!playoffs) return;
    const divisionEntries = Array.isArray(playoffs.divisions) ? playoffs.divisions : [playoffs];
    divisionEntries.forEach((entry) => {
      if (!entry.champion) return;
      if (state.division !== "All" && entry.division !== state.division) return;
      const finalRound = (entry.rounds || []).find((round) => /final/i.test(round.name)) || {};
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

function seasonTeamResults(season) {
  const teamsById = new Map((season.teams || []).map((team) => [team.id, team]));
  const matches = (season.matches || [])
    .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
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

function longestResultStreaks(allData) {
  const winStreaks = [];
  const lossStreaks = [];
  allData.forEach((season) => {
    const { teamsById, results } = seasonTeamResults(season);
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

function biggestScoringStreaks(allData) {
  const hot = [];
  const cold = [];
  allData.forEach((season) => {
    const { teamsById, results } = seasonTeamResults(season);
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
    </div>
  `;
}

function renderCupSection(allData) {
  const champions = cupChampions(allData);
  const { multi, backToBack } = cupRepeatWinners(champions);
  return `
    <section class="section-panel records-grid-panel">
      <div class="records-grid">
        ${recordTable("LSL Cup Champions", "Playoff champion by season and division.", champions, [
          { label: "Season", render: (row) => escapeHTML(row.season) },
          { label: "Division", render: (row) => escapeHTML(row.division) },
          { label: "Champion", render: (row) => (row.championId ? teamLink({ teamId: row.championId, teamName: row.champion }, row.season) : escapeHTML(row.champion)) },
          { label: "Runner-Up", render: (row) => escapeHTML(row.runnerUp || "TBA") },
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
        ${recordTable("Most Goals In A Single Postseason Run", "Most combined playoff goals scored by one team in one season.", mostPostseasonGoals(allData), [
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

function render(allData) {
  const singleSeasonGoals = playerSeasonRows(allData, "regular")
    .filter((player) => player.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, 5);
  const careerGoals = combinedPlayerStatsForDivision(allData, { stage: "regular" })
    .filter((player) => player.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name))
    .slice(0, 5);
  const playoffGoals = combinedPlayerStatsForDivision(allData, { stage: "playoffs" })
    .filter((player) => player.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, 5);
  const singleGameGoals = biggestSingleGameGoals(allData);
  const multiGoalGames = multiGoalGameCounts(allData);
  const careerGamesPlayed = mostCareerGamesPlayed(allData);
  const goalsPerGameRate = bestGoalsPerGameRate(allData);
  const coachWins = computeCoachSummary(allData)
    .filter(matchesDivision)
    .filter((coach) => coach.wins > 0)
    .sort((a, b) => b.wins - a.wins || b.championships - a.championships || a.name.localeCompare(b.name))
    .slice(0, 5);

  root.innerHTML = `
    <section class="section-panel people-panel people-hero-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Records</span>
          <h1>LSL Records</h1>
          <p>Major records across 2024, 2025, and 2026.</p>
        </div>
      </div>
      ${renderFilters()}
      <div class="grid three">
        <div class="summary-tile"><span>Seasons</span><strong>${SITE.seasons.length}</strong><p>included</p></div>
        <div class="summary-tile"><span>Players</span><strong>${computeCombinedPlayerStats(allData).length}</strong><p>all divisions</p></div>
        <div class="summary-tile"><span>Coaches</span><strong>${computeCoachSummary(allData).length}</strong><p>all divisions</p></div>
      </div>
    </section>

    ${
      state.category === "player"
        ? `
          <section class="section-panel records-grid-panel">
            <div class="records-grid">
              ${recordTable("Most Goals In A Season", "Regular-season goals by one player in one season.", singleSeasonGoals, [
                { label: "Player", render: playerLink },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Goals", num: true, render: (row) => row.goals },
              ])}
              ${recordTable("Career Goals", "Regular-season goals only, combined across all listed seasons in the selected division.", careerGoals, [
                { label: "Player", render: playerLink },
                { label: "Teams", render: (row) => escapeHTML(row.teamName || "Team TBA") },
                { label: "Goals", num: true, render: (row) => row.goals },
                { label: "Games Played", num: true, render: (row) => row.gamesPlayed },
              ])}
              ${recordTable("Playoff Goals", "Only playoff scoring records.", playoffGoals, [
                { label: "Player", render: playerLink },
                { label: "Team", render: (row) => escapeHTML(row.teamName || "Team TBA") },
                { label: "Goals", num: true, render: (row) => row.goals },
                { label: "Games", num: true, render: (row) => row.gamesPlayed },
              ])}
              ${recordTable("Most Goals In A Single Game", "Most goals by one player in one game, regular season and playoffs.", singleGameGoals, [
                { label: "Player", render: (row) => playerLink(row) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Team", render: (row) => escapeHTML(row.teamName) },
                { label: "vs", render: (row) => escapeHTML(row.opponent) },
                { label: "Goals", num: true, render: (row) => row.goals },
              ])}
              ${recordTable("Most Multi-Goal Games In A Season", "Games with 2 or more goals by the same player, in one season.", multiGoalGames, [
                { label: "Player", render: (row) => playerLink(row) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Team", render: (row) => escapeHTML(row.teamName) },
                { label: "Multi-Goal Games", num: true, render: (row) => row.count },
              ])}
              ${recordTable("Most Career Games Played", "Regular season and playoff games combined, across all listed seasons in the selected division.", careerGamesPlayed, [
                { label: "Player", render: playerLink },
                { label: "Teams", render: (row) => escapeHTML(row.teamName || "Team TBA") },
                { label: "Games Played", num: true, render: (row) => row.gamesPlayed },
              ])}
              ${recordTable("Best Goals-Per-Game Rate", `Regular-season goals per game, minimum ${MIN_GAMES_FOR_RATE} games played.`, goalsPerGameRate, [
                { label: "Player", render: playerLink },
                { label: "Team", render: (row) => escapeHTML(row.teamName || "Team TBA") },
                { label: "Rate", num: true, render: (row) => row.rate.toFixed(2) },
                { label: "Goals", num: true, render: (row) => row.goals },
                { label: "Games", num: true, render: (row) => row.gamesPlayed },
              ])}
            </div>
          </section>
        `
        : ""
    }

    ${
      state.category === "team"
        ? `
          <section class="section-panel records-grid-panel">
            <div class="records-grid">
              ${recordTable("Best Regular Season", "Top team point totals by season and division.", bestTeams(allData), [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => `${escapeHTML(row.season)} ${escapeHTML(row.division)}` },
                { label: "Points", num: true, render: (row) => row.pts },
                { label: "Record", render: (row) => `${row.w}-${row.d}-${row.l}` },
              ])}
              ${recordTable("Best Goals For", "Most goals scored by one team in one season.", bestGoalsFor(allData), [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => `${escapeHTML(row.season)} ${escapeHTML(row.division)}` },
                { label: "GF", num: true, render: (row) => row.gf },
              ])}
              ${recordTable("Best Goal Differential", "Best goal difference by one team in one season.", bestGoalDifferential(allData), [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => `${escapeHTML(row.season)} ${escapeHTML(row.division)}` },
                { label: "GD", num: true, render: (row) => (row.gd > 0 ? `+${row.gd}` : row.gd) },
              ])}
              ${recordTable("Least Goals Against", "Fewest goals conceded by one team in one season.", leastGoalsAgainst(allData), [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => `${escapeHTML(row.season)} ${escapeHTML(row.division)}` },
                { label: "GA", num: true, render: (row) => row.ga },
              ])}
              ${recordTable("Most Clean Sheets In A Season", "Most games in one season with the opponent held scoreless.", mostCleanSheetsInSeason(allData), [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Clean Sheets", num: true, render: (row) => row.count },
              ])}
              ${recordTable("Best Points-Per-Game Rate", `Regular-season points per game, minimum ${MIN_TEAM_GAMES_FOR_RATE} games played.`, bestTeamPointsPerGame(allData), [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => `${escapeHTML(row.season)} ${escapeHTML(row.division)}` },
                { label: "PPG", num: true, render: (row) => row.ppg.toFixed(2) },
                { label: "Points", num: true, render: (row) => row.pts },
              ])}
              ${recordTable("Biggest Wins", "Largest listed score margins.", biggestWins(allData), [
                { label: "Winner", render: (row) => teamLink(row.winner || { name: "Team TBA" }, row.season) },
                { label: "Opponent", render: (row) => escapeHTML(row.loser?.name || "Team TBA") },
                { label: "Score", render: (row) => escapeHTML(row.score) },
                { label: "Margin", num: true, render: (row) => row.margin },
              ])}
              ${recordTable("Worst Single-Game Defensive Performance", "Most goals conceded by one team in a single game.", worstSingleGameDefense(allData), [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "vs", render: (row) => escapeHTML(row.opponent) },
                { label: "Goals Conceded", num: true, render: (row) => row.conceded },
              ], "bad")}
            </div>
          </section>

          <section class="section-panel records-grid-panel">
            <div class="section-head compact-head">
              <div>
                <span class="eyebrow">On Record</span>
                <h2>Streaks &amp; Trends</h2>
                <p>Longest win and loss streaks on record, plus the biggest hot and cold scoring runs.</p>
              </div>
            </div>
            <div class="records-grid">
              ${recordTable("Most Consecutive Wins", "Longest winning streak by one team in one season, all seasons.", longestResultStreaks(allData).win, [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Streak", num: true, render: (row) => `${row.length} games` },
              ])}
              ${recordTable("Most Consecutive Losses", "Longest losing streak by one team in one season, all seasons.", longestResultStreaks(allData).loss, [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Streak", num: true, render: (row) => `${row.length} games` },
              ])}
              ${recordTable("Hottest Scoring Streaks", "Most consecutive games scoring 2+ goals, all seasons.", biggestScoringStreaks(allData).hot, [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Streak", num: true, render: (row) => `${row.length} games` },
              ])}
              ${recordTable("Coldest Scoring Streaks", "Most consecutive games held to 1 goal or fewer, all seasons.", biggestScoringStreaks(allData).cold, [
                { label: "Team", render: (row) => teamLink(row, row.season) },
                { label: "Season", render: (row) => escapeHTML(row.season) },
                { label: "Streak", num: true, render: (row) => `${row.length} games` },
              ])}
            </div>
          </section>
        `
        : ""
    }

    ${
      state.category === "coach"
        ? `
          <section class="section-panel records-grid-panel">
            <div class="records-grid">
              ${recordTable("Coach Wins", "Regular-season coaching wins from listed team records.", coachWins, [
                { label: "Coach", render: coachLink },
                { label: "Teams", render: (row) => escapeHTML((row.pastTeams || []).join(" / ") || row.teamName || "Team TBA") },
                { label: "Wins", num: true, render: (row) => row.wins },
                { label: "Titles", num: true, render: (row) => row.championships },
              ])}
              ${recordTable("Best Win Percentage", `Regular-season win percentage, minimum ${MIN_COACH_GAMES_FOR_RATE} games coached.`, bestCoachWinPct(allData), [
                { label: "Coach", render: coachLink },
                { label: "Teams", render: (row) => escapeHTML((row.pastTeams || []).join(" / ") || row.teamName || "Team TBA") },
                { label: "Win %", num: true, render: (row) => `${(row.pct * 100).toFixed(1)}%` },
                { label: "Record", render: (row) => `${row.wins}-${row.ties}-${row.losses}` },
              ])}
              ${recordTable("Coach Championships", "Coaches with 1 or more LSL Cup titles on record.", coachChampionships(allData), [
                { label: "Coach", render: coachLink },
                { label: "Teams", render: (row) => escapeHTML((row.pastTeams || []).join(" / ") || row.teamName || "Team TBA") },
                { label: "Titles", num: true, render: (row) => row.championships },
                { label: "Wins", num: true, render: (row) => row.wins },
              ])}
              ${recordTable("Most Finals Appearances", "Most LSL Cup Final appearances by one coach.", mostFinalsAppearances(allData), [
                { label: "Coach", render: coachLink },
                { label: "Teams", render: (row) => escapeHTML((row.pastTeams || []).join(" / ") || row.teamName || "Team TBA") },
                { label: "Finals", num: true, render: (row) => row.finals },
                { label: "Titles", num: true, render: (row) => row.championships },
              ])}
            </div>
          </section>
        `
        : ""
    }

    ${state.category === "cup" ? renderCupSection(allData) : ""}
  `;

  root.querySelectorAll("[data-division]").forEach((button) => {
    button.addEventListener("click", () => {
      state.division = button.dataset.division;
      render(allData);
    });
  });

  root.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      render(allData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading records...");
  render(await loadAllSeasons());
}

init();
