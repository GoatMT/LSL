import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { calculateStandings, computeCoachSummary, computeCombinedPlayerStats, computePlayerStats } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("records.html");
setDocumentTitle("Records");

const root = document.getElementById("page-root");
let state = { division: "Seniors" };

const divisionOptions = [
  { value: "Seniors", label: "Seniors" },
  { value: "Juniors", label: "Juniors" },
];

function matchesDivision(item) {
  return state.division === "All" || item.division === state.division || String(item.division || "").includes(state.division);
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

function recordTable(title, note, items, columns) {
  return `
    <article class="card record-card">
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

function currentStreaks(allData) {
  const latest = allData[allData.length - 1];
  if (!latest) return [];
  const { teamsById, results } = seasonTeamResults(latest);
  const rows = [];
  results.forEach((games, teamId) => {
    if (!games.length) return;
    const type = games[games.length - 1].result;
    let length = 0;
    for (let i = games.length - 1; i >= 0; i--) {
      if (games[i].result === type) length += 1;
      else break;
    }
    const team = teamsById.get(teamId);
    if (!team) return;
    rows.push({ teamId, teamName: team.name, season: latest.year, type, length });
  });
  const rank = (type) => (type === "W" ? 2 : type === "D" ? 1 : 0);
  return rows.sort((a, b) => rank(b.type) - rank(a.type) || b.length - a.length || a.teamName.localeCompare(b.teamName));
}

function streakLabel(row) {
  const word = row.type === "W" ? "Win" : row.type === "L" ? "Loss" : "Draw";
  return `${row.length} straight ${word.toLowerCase()}${row.length === 1 ? "" : "s"}`;
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
        <span class="eyebrow">Division</span>
        <div class="all-time-toggle wide" role="group" aria-label="Records division filter">
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
        ${recordTable("Coach Wins", "Regular-season coaching wins from listed team records.", coachWins, [
          { label: "Coach", render: coachLink },
          { label: "Teams", render: (row) => escapeHTML((row.pastTeams || []).join(" / ") || row.teamName || "Team TBA") },
          { label: "Wins", num: true, render: (row) => row.wins },
          { label: "Titles", num: true, render: (row) => row.championships },
        ])}
        ${recordTable("Biggest Wins", "Largest listed score margins.", biggestWins(allData), [
          { label: "Winner", render: (row) => teamLink(row.winner || { name: "Team TBA" }, row.season) },
          { label: "Opponent", render: (row) => escapeHTML(row.loser?.name || "Team TBA") },
          { label: "Score", render: (row) => escapeHTML(row.score) },
          { label: "Margin", num: true, render: (row) => row.margin },
        ])}
        ${recordTable("Best Regular Season", "Top team point totals by season and division.", bestTeams(allData), [
          { label: "Team", render: (row) => teamLink(row, row.season) },
          { label: "Season", render: (row) => `${escapeHTML(row.season)} ${escapeHTML(row.division)}` },
          { label: "Points", num: true, render: (row) => row.pts },
          { label: "Record", render: (row) => `${row.w}-${row.d}-${row.l}` },
        ])}
      </div>
    </section>

    <section class="section-panel records-grid-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Right Now</span>
          <h2>Streaks &amp; Trends</h2>
          <p>Current win/loss streaks this season, plus the biggest hot and cold scoring runs on record.</p>
        </div>
      </div>
      <div class="records-grid">
        ${recordTable(`Current Streaks (${SITE.seasons[SITE.seasons.length - 1]})`, "Each team's active run heading into the next game, longest win streaks first.", currentStreaks(allData), [
          { label: "Team", render: (row) => teamLink(row, row.season) },
          { label: "Streak", render: (row) => `${row.type}${row.length}` },
          { label: "Detail", render: (row) => escapeHTML(streakLabel(row)) },
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
  `;

  root.querySelectorAll("[data-division]").forEach((button) => {
    button.addEventListener("click", () => {
      state.division = button.dataset.division;
      render(allData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading records...");
  render(await loadAllSeasons());
}

init();
