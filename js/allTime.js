import { SITE } from "./config.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { decorateCoachGrade } from "./coachRatings.js";
import { calculateTeamRecord, computeCombinedPlayerStats, computePlayerStats, playersWithOVR } from "./leagueEngine.js?v=3.3";
import { escapeHTML, formatPercent, setDocumentTitle, slugify, statusMessage, unique } from "./utils.js";
import { setupLayout } from "./main.js";

setupLayout("all-time.html");
setDocumentTitle("All Time Stats");

const root = document.getElementById("page-root");
let globalPlayerRatings = new Map();
let coachRatings = {};
const state = {
  view: "players",
  stage: "regular",
  division: "Seniors",
  season: "All",
  week: "All",
  playersExpanded: false,
  coachesExpanded: false,
  playerSort: "rank",
  playerDir: "asc",
  coachSort: "rank",
  coachDir: "asc",
};

const stageOptions = [
  { value: "all", label: "Both" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];

const divisionOptions = [
  { value: "Seniors", label: "Seniors" },
  { value: "Juniors", label: "Juniors" },
];

const playerColumns = [
  { key: "rank", label: "Rank", sortable: false },
  { key: "name", label: "Player", sortable: false },
  { key: "teams", label: "Team" },
  { key: "seasons", label: "Seasons" },
  { key: "games", label: "GP", numeric: true },
  { key: "goals", label: "Goals", numeric: true },
  { key: "wins", label: "Wins", numeric: true },
  { key: "ovr", label: "OVR", numeric: true },
  { key: "championships", label: "Championships", numeric: true },
];

const coachColumns = [
  { key: "rank", label: "Rank", sortable: false },
  { key: "name", label: "Coach", sortable: false },
  { key: "teams", label: "Teams" },
  { key: "seasons", label: "Seasons" },
  { key: "gradeValue", label: "Grade", numeric: true },
  { key: "wins", label: "Wins", numeric: true },
  { key: "ties", label: "Ties", numeric: true },
  { key: "losses", label: "Losses", numeric: true },
  { key: "championships", label: "Championships", numeric: true },
  { key: "winPctValue", label: "Win %", numeric: true },
];

function canonicalKey(item, aliases = {}) {
  const id = item.id || slugify(item.name);
  return aliases[id] || id || slugify(item.name);
}

function addNumber(target, key, value) {
  target[key] += Number(value) || 0;
}

function yearsLabel(years = []) {
  return years.length ? years.join(", ") : "Not listed";
}

function teamsLabel(teams = []) {
  return teams.length ? teams.join(" / ") : "Team TBA";
}

function defaultSortDirection(key) {
  if (key === "rank" || key === "name") return "asc";
  return "desc";
}

function sortValue(row, key) {
  if (key === "rank") return row.defaultRank || 0;
  if (key === "teams") return row.teams?.length || 0;
  if (key === "seasons") return row.seasons?.length || 0;
  if (key === "name") return row.name || "";
  return Number(row[key]) || 0;
}

function compareRows(a, b, key, direction) {
  const aValue = sortValue(a, key);
  const bValue = sortValue(b, key);
  const modifier = direction === "asc" ? 1 : -1;
  let result = 0;

  if (typeof aValue === "string" || typeof bValue === "string") {
    result = String(aValue).localeCompare(String(bValue));
  } else {
    result = aValue - bValue;
  }

  if (result !== 0) return result * modifier;
  if (result === 0 && key === "teams") result = teamsLabel(a.teams).localeCompare(teamsLabel(b.teams));
  if (result === 0 && key === "seasons") result = yearsLabel(a.seasons).localeCompare(yearsLabel(b.seasons));
  if (result === 0) result = (a.defaultRank || 0) - (b.defaultRank || 0);
  if (result === 0) result = a.name.localeCompare(b.name);
  return result;
}

function prepareRows(rows, table) {
  const sortKey = table === "players" ? state.playerSort : state.coachSort;
  const sortDir = table === "players" ? state.playerDir : state.coachDir;
  return rows
    .map((row, index) => ({ ...row, defaultRank: index + 1 }))
    .sort((a, b) => compareRows(a, b, sortKey, sortDir));
}

function renderSortableHeaders(columns, table) {
  const sortKey = table === "players" ? state.playerSort : state.coachSort;
  const sortDir = table === "players" ? state.playerDir : state.coachDir;
  return columns
    .map((column) => {
      if (column.sortable === false) {
        return `<th class="${column.numeric ? "num" : ""}"><span class="table-static-heading">${escapeHTML(column.label)}</span></th>`;
      }
      const active = column.key === sortKey;
      const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
      const sortText = active ? `Sorted ${sortDir === "asc" ? "ascending" : "descending"}` : "Sort column";
      return `
        <th class="${column.numeric ? "num" : ""}" aria-sort="${ariaSort}">
          <button class="table-sort-button ${active ? "active" : ""}" type="button" data-sort-table="${table}" data-sort-key="${escapeHTML(column.key)}">
            <span class="sort-label">${escapeHTML(column.label)}</span>
            <span class="sort-indicator ${active ? `is-${sortDir}` : ""}" aria-hidden="true"></span>
            <span class="sr-only">${escapeHTML(sortText)}</span>
          </button>
        </th>
      `;
    })
    .join("");
}

function updateSort(table, key) {
  const keyName = table === "players" ? "playerSort" : "coachSort";
  const dirName = table === "players" ? "playerDir" : "coachDir";
  if (state[keyName] === key) {
    state[dirName] = state[dirName] === "asc" ? "desc" : "asc";
    return;
  }
  state[keyName] = key;
  state[dirName] = defaultSortDirection(key);
}

function stageLabel() {
  return stageOptions.find((option) => option.value === state.stage)?.label || "Both";
}

function divisionLabel() {
  return divisionOptions.find((option) => option.value === state.division)?.label || "Seniors";
}

function seasonLabel() {
  return state.season === "All" ? "All Seasons" : state.season;
}

function weekLabel() {
  if (state.stage === "playoffs") return "";
  if (state.season === "All") return "";
  return state.week === "All" ? "All Weeks" : `Week ${state.week}`;
}

function matchesDivision(item) {
  return item.division === state.division;
}

function championTeamIds(season) {
  return new Set(
    (season.awards?.awards || [])
      .filter((award) => award.category === "Champion Team")
      .filter((award) => award.division === state.division)
      .map((award) => award.teamId)
      .filter(Boolean)
  );
}

function selectedSeasonData(allData) {
  return state.season === "All" ? allData : allData.filter((season) => season.year === state.season);
}

function availableWeeks(allData) {
  if (state.season === "All" || state.stage === "playoffs") return [];
  return unique(
    selectedSeasonData(allData)
      .flatMap((season) => season.matches || [])
      .filter((match) => match.stage === "regular")
      .map((match) => Number(match.week))
      .filter(Number.isFinite)
  ).sort((a, b) => a - b);
}

function emptyPlayoffs(playoffs) {
  if (!playoffs) return playoffs;
  if (Array.isArray(playoffs.divisions)) {
    return {
      ...playoffs,
      divisions: playoffs.divisions.map((division) => ({ ...division, rounds: [] })),
    };
  }
  if (Array.isArray(playoffs.rounds)) return { ...playoffs, rounds: [] };
  return playoffs;
}

function scopedSeasonData(allData) {
  const seasons = selectedSeasonData(allData);
  if (state.week === "All") return seasons;
  const week = Number(state.week);
  return seasons.map((season) => ({
    ...season,
    matches: (season.matches || []).filter((match) => match.stage === "regular" && Number(match.week) === week),
    playoffs: emptyPlayoffs(season.playoffs),
  }));
}

function normalizeScope(allData) {
  if (state.season === "All" || state.stage === "playoffs") {
    state.week = "All";
    return;
  }
  const weeks = availableWeeks(allData).map(String);
  if (state.week !== "All" && !weeks.includes(String(state.week))) state.week = "All";
  if (state.week !== "All" && state.stage !== "regular") state.stage = "regular";
}

function buildAllTimePlayers(seasons, aliases, stage = "all") {
  const rows = new Map();
  const includeChampionshipHonors = state.week === "All";

  seasons.forEach((season) => {
    const championTeams = championTeamIds(season);
    computePlayerStats(season, { stage }).filter(matchesDivision).forEach((player) => {
      const key = canonicalKey(player, aliases);
      const row = rows.get(key) || {
        id: key,
        name: player.name || "Unknown Player",
        teams: [],
        seasons: [],
        games: 0,
        goals: 0,
        shots: 0,
        assists: 0,
        points: 0,
        wins: 0,
        ties: 0,
        losses: 0,
        playerOfMatch: 0,
        achievements: [],
        championships: 0,
        championshipKeys: [],
      };

      row.name = player.name || row.name;
      row.teams = unique([...row.teams, player.previousTeamName, player.teamName]);
      row.seasons = unique([...row.seasons, season.year]).sort((a, b) => Number(a) - Number(b));
      addNumber(row, "games", player.gamesPlayed);
      addNumber(row, "goals", player.goals);
      addNumber(row, "shots", player.shots);
      addNumber(row, "assists", player.assists);
      addNumber(row, "points", player.points);
      addNumber(row, "wins", player.wins);
      addNumber(row, "ties", player.ties);
      addNumber(row, "losses", player.losses);
      addNumber(row, "playerOfMatch", player.playerOfMatch);
      row.achievements = unique([...(row.achievements || []), ...(player.achievements || [])]);
      if (includeChampionshipHonors && championTeams.has(player.teamId)) {
        const championshipKey = `${season.year}:${player.teamId}`;
        if (!row.championshipKeys.includes(championshipKey)) {
          row.championshipKeys.push(championshipKey);
          row.championships = row.championshipKeys.length;
        }
      }
      rows.set(key, row);
    });
  });

  return [...rows.values()].sort(
    (a, b) =>
      b.goals - a.goals ||
      b.wins - a.wins ||
      b.championships - a.championships ||
      b.ovr - a.ovr ||
      a.name.localeCompare(b.name)
  );
}

function ratePlayerRows(players) {
  const ratingPool = players.map((player) => ({
    ...player,
    gamesPlayed: player.games,
  }));
  return playersWithOVR(ratingPool).map((player) => ({
    ...player,
    games: player.gamesPlayed,
  }));
}

function buildGlobalPlayerRatingMap(allData, aliases) {
  const ratedPlayers = playersWithOVR(computeCombinedPlayerStats(allData, { stage: "all" }));
  const ratings = new Map(ratedPlayers.map((player) => [player.id, player.ovr]));
  Object.entries(aliases || {}).forEach(([aliasId, canonicalId]) => {
    if (!ratings.has(canonicalId) && ratings.has(aliasId)) ratings.set(canonicalId, ratings.get(aliasId));
  });
  return ratings;
}

function addPlayerOVR(players) {
  if (!globalPlayerRatings.size) return ratePlayerRows(players);
  return players.map((player) => ({
    ...player,
    ovr: globalPlayerRatings.get(player.id) ?? "N/A",
  }));
}

function buildAllTimeCoaches(seasons, stage = "all") {
  const rows = new Map();
  const includePostseasonHonors = state.week === "All";

  seasons.forEach((season) => {
    (season.coaches || []).filter(matchesDivision).forEach((coach) => {
      const key = coach.id || slugify(coach.name);
      const teamStats = calculateTeamRecord(season, coach.teamId, { stage }) || {};
      const row = rows.get(key) || {
        id: key,
        name: coach.name || "Unknown Coach",
        teams: [],
        seasons: [],
        games: 0,
        wins: 0,
        ties: 0,
        losses: 0,
        points: 0,
        finals: 0,
        championships: 0,
        winPctValue: 0,
      };

      row.name = coach.name || row.name;
      row.teams = unique([...row.teams, coach.teamName]);
      row.seasons = unique([...row.seasons, season.year]).sort((a, b) => Number(a) - Number(b));
      addNumber(row, "games", teamStats.gp);
      addNumber(row, "wins", teamStats.w);
      addNumber(row, "ties", teamStats.d);
      addNumber(row, "losses", teamStats.l);
      addNumber(row, "points", teamStats.pts);
      if (includePostseasonHonors) {
        addNumber(row, "finals", coach.finals);
        addNumber(row, "championships", coach.championships);
      }
      row.winPctValue = row.games ? (row.wins / row.games) * 100 : 0;
      rows.set(key, row);
    });
  });

  return [...rows.values()].sort(
    (a, b) =>
      b.championships - a.championships ||
      b.finals - a.finals ||
      b.points - a.points ||
      b.wins - a.wins ||
      b.winPctValue - a.winPctValue ||
      a.name.localeCompare(b.name)
  );
}

function summaryTile(label, value, note = "") {
  return `
    <div class="summary-tile">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
      ${note ? `<p>${escapeHTML(note)}</p>` : ""}
    </div>
  `;
}

function renderSummary(players, coaches) {
  const totalGames = players.reduce((sum, player) => sum + player.games, 0);
  const totalWins = players.reduce((sum, player) => sum + player.wins, 0);
  const playerTitles = players.reduce((sum, player) => sum + player.championships, 0);
  const coachTitles = coaches.reduce((sum, coach) => sum + coach.championships, 0);
  const allTeams = unique([
    ...players.flatMap((player) => player.teams || []),
    ...coaches.flatMap((coach) => coach.teams || []),
  ]);
  return `
    <div class="people-summary-grid all-time-summary-grid">
      ${summaryTile("Players", players.length)}
      ${summaryTile("Coaches", coaches.length)}
      ${summaryTile("Goals", players.reduce((sum, player) => sum + player.goals, 0))}
      ${summaryTile("Games", totalGames)}
      ${summaryTile("Wins", totalWins)}
      ${summaryTile("Championships", `${playerTitles} / ${coachTitles}`, "players / coaches")}
      ${summaryTile("Teams", allTeams.length)}
    </div>
  `;
}

function currentFilterPills() {
  const pills = [
    { label: "View", value: state.view === "players" ? "Players" : "Coaches" },
    { label: "Season", value: seasonLabel() },
    { label: "Type", value: stageLabel() },
    { label: "Division", value: divisionLabel() },
  ];
  const week = weekLabel();
  if (week) pills.push({ label: "Week", value: week });
  return `
    <div class="all-time-current-row">
      <span class="current-label">Showing</span>
      ${pills.map((pill) => `<b><small>${escapeHTML(pill.label)}</small>${escapeHTML(pill.value)}</b>`).join("")}
    </div>
  `;
}

function renderWeekSelect(allData) {
  if (state.stage === "playoffs") return "";
  if (state.season === "All") {
    return `
      <select id="all-time-week" class="all-time-select" aria-label="All time week filter" disabled>
        <option>Select a season first</option>
      </select>
    `;
  }

  const weeks = availableWeeks(allData);
  if (!weeks.length) {
    return `
      <select id="all-time-week" class="all-time-select" aria-label="All time week filter" disabled>
        <option>No weeks listed</option>
      </select>
    `;
  }

  const options = [{ value: "All", label: "All Weeks" }, ...weeks.map((week) => ({ value: String(week), label: `Week ${week}` }))];
  return `
    <select id="all-time-week" class="all-time-select" aria-label="All time week filter">
      ${options
        .map((option) => `<option value="${escapeHTML(option.value)}"${String(option.value) === String(state.week) ? " selected" : ""}>${escapeHTML(option.label)}</option>`)
        .join("")}
    </select>
  `;
}

function renderToggle(allData) {
  return `
    <div class="all-time-filter-bar">
      <div>
        <span class="eyebrow">View</span>
        <div class="all-time-toggle" role="group" aria-label="All time stats view">
          <button class="${state.view === "players" ? "active" : ""}" type="button" data-view="players">Players</button>
          <button class="${state.view === "coaches" ? "active" : ""}" type="button" data-view="coaches">Coaches</button>
        </div>
      </div>
      <div>
        <span class="eyebrow">Season</span>
        <div class="all-time-toggle season" role="group" aria-label="All time season filter">
          ${[{ value: "All", label: "All" }, ...SITE.seasons.map((season) => ({ value: season, label: season }))]
            .map(
              (option) =>
                `<button class="${state.season === option.value ? "active" : ""}" type="button" data-season="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`
            )
            .join("")}
        </div>
      </div>
      <div>
        <span class="eyebrow">Stats Type</span>
        <div class="all-time-toggle wide" role="group" aria-label="All time stats type">
          ${stageOptions
            .map(
              (option) =>
                `<button class="${state.stage === option.value ? "active" : ""}" type="button" data-stage="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`
            )
            .join("")}
        </div>
      </div>
      <div>
        <span class="eyebrow">Division</span>
        <div class="all-time-toggle wide" role="group" aria-label="All time division filter">
          ${divisionOptions
            .map(
              (option) =>
                `<button class="${state.division === option.value ? "active" : ""}" type="button" data-division="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`
            )
            .join("")}
        </div>
      </div>
      ${state.stage === "playoffs" ? "" : `<div>
        <span class="eyebrow">Week</span>
        ${renderWeekSelect(allData)}
      </div>`}
    </div>
  `;
}

function renderPlayerRows(players) {
  return players
    .map(
      (player, index) => `
        <tr>
          <td data-label="Rank">${index + 1}</td>
          <td data-label="Player"><a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a></td>
          <td data-label="Team">${escapeHTML(teamsLabel(player.teams))}</td>
          <td data-label="Seasons">${escapeHTML(yearsLabel(player.seasons))}</td>
          <td class="num" data-label="GP">${player.games}</td>
          <td class="num" data-label="Goals">${player.goals}</td>
          <td class="num" data-label="Wins">${player.wins}</td>
          <td class="num" data-label="OVR">${player.ovr}</td>
          <td class="num" data-label="Championships">${player.championships}</td>
        </tr>
      `
    )
    .join("");
}

function renderCoachRows(coaches) {
  return coaches
    .map(
      (coach, index) => `
        <tr>
          <td data-label="Rank">${index + 1}</td>
          <td data-label="Coach"><a href="./coach.html?id=${escapeHTML(coach.id)}">${escapeHTML(coach.name)}</a></td>
          <td data-label="Teams">${escapeHTML(teamsLabel(coach.teams))}</td>
          <td data-label="Seasons">${escapeHTML(yearsLabel(coach.seasons))}</td>
          <td class="num" data-label="Grade">${escapeHTML(coach.overallGrade || "Not Rated")}</td>
          <td class="num" data-label="Wins">${coach.wins}</td>
          <td class="num" data-label="Ties">${coach.ties}</td>
          <td class="num" data-label="Losses">${coach.losses}</td>
          <td class="num" data-label="Championships">${coach.championships}</td>
          <td class="num" data-label="Win %">${formatPercent(coach.winPctValue)}</td>
        </tr>
      `
    )
    .join("");
}

function renderPlayersSection(players) {
  const visible = state.playersExpanded ? players : players.slice(0, 10);
  const sortColumn = playerColumns.find((column) => column.key === state.playerSort)?.label || "Rank";
  return `
    <div class="all-time-section ${state.view === "players" ? "" : "is-hidden"}" data-panel="players">
      <div class="all-time-leaderboard-head">
        <div>
          <span class="eyebrow">Players</span>
          <h2>Top 10 Players</h2>
        </div>
        <p>Sorted by ${escapeHTML(sortColumn)} ${state.playerDir === "asc" ? "ascending" : "descending"}.</p>
      </div>
      <div class="table-wrap all-time-table-wrap">
        <table class="data-table all-time-table all-time-player-table">
          <thead>
            <tr>
              ${renderSortableHeaders(playerColumns, "players")}
            </tr>
          </thead>
          <tbody>${visible.length ? renderPlayerRows(visible) : `<tr><td colspan="9">No player records found.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="all-time-actions">
        <button class="button primary" type="button" data-expand="players">${state.playersExpanded ? "Show Less" : "View More"}</button>
      </div>
    </div>
  `;
}

function renderCoachesSection(coaches) {
  const visible = state.coachesExpanded ? coaches : coaches.slice(0, 10);
  const sortColumn = coachColumns.find((column) => column.key === state.coachSort)?.label || "Rank";
  return `
    <div class="all-time-section ${state.view === "coaches" ? "" : "is-hidden"}" data-panel="coaches">
      <div class="all-time-leaderboard-head">
        <div>
          <span class="eyebrow">Coaches</span>
          <h2>Top 10 Coaches</h2>
        </div>
        <p>Sorted by ${escapeHTML(sortColumn)} ${state.coachDir === "asc" ? "ascending" : "descending"}.</p>
      </div>
      <div class="table-wrap all-time-table-wrap">
        <table class="data-table all-time-table all-time-coach-table">
          <thead>
            <tr>
              ${renderSortableHeaders(coachColumns, "coaches")}
            </tr>
          </thead>
          <tbody>${visible.length ? renderCoachRows(visible) : `<tr><td colspan="10">No coach records found.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="all-time-actions">
        <button class="button primary" type="button" data-expand="coaches">${state.coachesExpanded ? "Show Less" : "View More"}</button>
      </div>
    </div>
  `;
}

function render(allData, aliases) {
  normalizeScope(allData);
  const scopedData = scopedSeasonData(allData);
  const basePlayers = addPlayerOVR(buildAllTimePlayers(scopedData, aliases, state.stage));
  const baseCoaches = buildAllTimeCoaches(scopedData, state.stage).map((coach) => decorateCoachGrade(coach, coachRatings));
  const players = prepareRows(basePlayers, "players");
  const coaches = prepareRows(baseCoaches, "coaches");

  root.innerHTML = `
    <section class="section-panel all-time-header-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">ALL TIME</span>
          <h1>All Time Stats</h1>
          <p>Career leaders by player, coach, season, division, and week.</p>
        </div>
      </div>
    </section>

    <section class="section-panel all-time-filter-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Filters</span>
          <h2>Filter Leaderboard</h2>
        </div>
      </div>
      ${renderToggle(allData)}
      ${currentFilterPills()}
    </section>

    <section class="section-panel all-time-results-card">
      ${renderSummary(basePlayers, baseCoaches)}
      ${renderPlayersSection(players)}
      ${renderCoachesSection(coaches)}
    </section>
  `;

  root.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render(allData, aliases);
    });
  });

  root.querySelectorAll("[data-season]").forEach((button) => {
    button.addEventListener("click", () => {
      state.season = button.dataset.season;
      const weeks = availableWeeks(allData).map(String);
      if (state.week !== "All" && !weeks.includes(String(state.week))) state.week = "All";
      render(allData, aliases);
    });
  });

  root.querySelector("#all-time-week")?.addEventListener("change", (event) => {
    state.week = event.target.value;
    if (state.week !== "All") state.stage = "regular";
    render(allData, aliases);
  });

  root.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      state.stage = button.dataset.stage;
      if (state.stage !== "regular") state.week = "All";
      render(allData, aliases);
    });
  });

  root.querySelectorAll("[data-division]").forEach((button) => {
    button.addEventListener("click", () => {
      state.division = button.dataset.division;
      render(allData, aliases);
    });
  });

  root.querySelectorAll("[data-expand]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.expand;
      if (target === "players") state.playersExpanded = !state.playersExpanded;
      if (target === "coaches") state.coachesExpanded = !state.coachesExpanded;
      render(allData, aliases);
    });
  });

  root.querySelectorAll("[data-sort-key]").forEach((button) => {
    button.addEventListener("click", () => {
      updateSort(button.dataset.sortTable, button.dataset.sortKey);
      render(allData, aliases);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading all-time stats...");
  const [allData, aliases, ratings] = await Promise.all([
    loadAllSeasons(SITE.seasons),
    loadJSON("./data/player-aliases.json", {}),
    loadJSON("./data/coach-ratings.json", { coaches: {} }),
  ]);
  coachRatings = ratings;
  globalPlayerRatings = buildGlobalPlayerRatingMap(allData, aliases);
  render(allData, aliases);
}

init();
