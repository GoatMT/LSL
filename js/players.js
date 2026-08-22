import { renderFormStrip } from "../components/formStrip.js";
import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { calculatePlayerForm, computeCombinedPlayerStats, computePlayerStats, playersWithOVR } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { controlInput, controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("players.html");
setDocumentTitle("Player Stats");

const root = document.getElementById("page-root");
let state = { stage: "regular", season: "All", division: "All", minGames: "0", search: "", sort: "goals", compareA: "", compareB: "" };
const stageOptions = [
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
  { value: "all", label: "All Games" },
];

function selectedStats(allData) {
  const options = { stage: state.stage };
  if (state.season === "All") return computeCombinedPlayerStats(allData, options);
  const data = allData.find((season) => season.year === state.season);
  return data ? computePlayerStats(data, options) : [];
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function divisionOptions(allData) {
  const seasons = state.season === "All" ? allData : allData.filter((season) => season.year === state.season);
  const divisions = uniqueList(seasons.flatMap((season) => (season.players || []).map((player) => player.division)));
  return [{ value: "All", label: "All" }, ...divisions.map((division) => ({ value: division, label: division }))];
}

function teamLabel(player, allData) {
  const seasons = state.season === "All" ? allData : allData.filter((season) => season.year === state.season);
  const teams = uniqueList(
    seasons
      .flatMap((season) => season.players || [])
      .filter((item) => item.id === player.id)
      .flatMap((item) => [item.previousTeamName, item.teamName || player.teamName])
  );
  return teams.length ? teams.join(" / ") : player.teamName || "Team TBA";
}

function careerOVRMap(allData) {
  return new Map(playersWithOVR(computeCombinedPlayerStats(allData, { stage: "all" })).map((player) => [player.id, player.ovr]));
}

function filteredStats(allData) {
  const seasons = state.season === "All" ? allData : allData.filter((season) => season.year === state.season);
  const ratings = careerOVRMap(allData);
  return selectedStats(allData)
    .map((player) => ({
      ...player,
      ovr: ratings.get(player.id) || 60,
    }))
    .filter((player) => state.division === "All" || player.division === state.division)
    .filter((player) => (Number(player.gamesPlayed) || 0) >= (Number(state.minGames) || 0))
    .filter((player) => player.name.toLowerCase().includes(state.search.toLowerCase()) || (player.teamName || "").toLowerCase().includes(state.search.toLowerCase()))
    .sort((a, b) => {
      const metric = state.sort;
      return (Number(b[metric]) || 0) - (Number(a[metric]) || 0) || a.name.localeCompare(b.name);
    })
    .map((player) => ({
      ...player,
      form: calculatePlayerForm(seasons, player.id, { stage: state.stage }),
    }));
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

function activeFilterText() {
  const stage = stageOptions.find((option) => option.value === state.stage)?.label || "Regular Season";
  const minGames = Number(state.minGames) > 0 ? `${state.minGames}+ GP` : "All GP";
  return `${stage} | ${state.season} | ${state.division} | ${minGames}`;
}

function sortLabel() {
  return {
    points: "Points",
    goals: "Goals",
    shots: "Shots",
    assists: "Assists",
    mvpScore: "MVP Goals",
    ovr: "OVR",
  }[state.sort] || "Goals";
}

function playerLeaderCard(player, index, allData, compact = false) {
  const rank = index + 1;
  const stats = compact
    ? [
        { label: "Goals", value: player.goals || 0 },
        { label: "Assists", value: player.assists || 0 },
        { label: "Points", value: player.points || 0 },
      ]
    : [
        { label: "Games", value: player.gamesPlayed || 0 },
        { label: "Goals", value: player.goals || 0 },
        { label: "Shots", value: player.shots || 0 },
        { label: "Assists", value: player.assists || 0 },
        { label: "Points", value: player.points || 0 },
      ];
  return `
    <article class="player-leader-card${compact ? " compact" : ""}">
      <div class="player-leader-rank">
        <span>#${rank}</span>
        <small>${escapeHTML(sortLabel())}</small>
      </div>
      <div class="player-leader-info">
        <span class="eyebrow">${rank === 1 ? "Current Leader" : `Rank ${rank}`}</span>
        <h3><a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a></h3>
        <p class="player-leader-meta-row">
          <span>${escapeHTML(teamLabel(player, allData))}</span>
          <span>${escapeHTML(player.division || "Division TBA")}</span>
          <span class="leader-ovr-chip"><strong>${escapeHTML(player.ovr || "N/A")}</strong> OVR</span>
        </p>
        ${renderFormStrip(player.form || [])}
      </div>
      <div class="player-leader-stats">
        ${stats.map((stat) => `<div class="stat-box"><span>${escapeHTML(stat.label)}</span><strong>${stat.value}</strong></div>`).join("")}
      </div>
    </article>
  `;
}

function playerLeaderboard(players, allData) {
  const leaders = players.slice(0, 5);
  if (!leaders.length) return statusMessage("empty", "No leaders found for the current filters.");
  return `
    <div class="player-leaderboard">
      <div class="player-leaderboard-main">
        ${leaders.map((player, index) => playerLeaderCard(player, index, allData)).join("")}
      </div>
    </div>
  `;
}

function playerSummary(players, allData) {
  return `
    <div class="people-summary-grid players-summary-grid">
      ${summaryTile("Players", players.length, "matching filters")}
      ${summaryTile("Games", players.reduce((sum, player) => sum + (Number(player.gamesPlayed) || 0), 0), "tracked games")}
      ${summaryTile("Goals", players.reduce((sum, player) => sum + (Number(player.goals) || 0), 0), "total scored")}
      ${summaryTile("Shots", players.reduce((sum, player) => sum + (Number(player.shots) || 0), 0), "total taken")}
      ${summaryTile("Assists", players.reduce((sum, player) => sum + (Number(player.assists) || 0), 0), "total listed")}
      ${summaryTile("Points", players.reduce((sum, player) => sum + (Number(player.points) || 0), 0), "goals + assists")}
    </div>
    ${playerLeaderboard(players, allData)}
  `;
}

function ranking(title, players, metric, label, allData) {
  const rows = [...players]
    .sort((a, b) => (Number(b[metric]) || 0) - (Number(a[metric]) || 0))
    .slice(0, 3)
    .map(
      (player, index) => `
        <li class="leader-row">
          <span class="rank-badge">${index + 1}</span>
          <span class="leader-name">
            <a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a>
            <small>OVR ${escapeHTML(player.ovr || "N/A")}</small>
          </span>
          <strong class="leader-score"><span>${player[metric] || 0}</span><small>${escapeHTML(title)}</small></strong>
        </li>
      `
    )
    .join("");
  return `
    <article class="card leader-card">
      <div class="leader-card-head">
        <div>
          <span class="eyebrow">${escapeHTML(label)}</span>
          <h3>${escapeHTML(title)}</h3>
        </div>
        <span class="pill">Top 3</span>
      </div>
      ${rows ? `<ul class="ranking-list leader-list">${rows}</ul>` : statusMessage("empty", "No rankings available for this filter.")}
    </article>
  `;
}

function comparison(players, allData) {
  const options = players.map((player) => ({ value: player.id, label: player.name }));
  if (!state.compareA && players[0]) state.compareA = players[0].id;
  if (!state.compareB && players[1]) state.compareB = players[1].id;
  const a = players.find((player) => player.id === state.compareA);
  const b = players.find((player) => player.id === state.compareB);

  return `
    <div class="controls player-comparison-controls">
      ${controlSelect("compareA", "Player One", options, state.compareA)}
      ${controlSelect("compareB", "Player Two", options, state.compareB)}
    </div>
    <div class="comparison-grid">
      ${[a, b]
        .map(
          (player) =>
            player
              ? `<div class="card comparison-card">
                  <div class="comparison-card-head">
                    <div>
                      <span class="eyebrow">Player</span>
                      <h3><a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a></h3>
                      <p>${escapeHTML(player.division || "Division TBA")} | ${escapeHTML(teamLabel(player, allData))}</p>
                    </div>
                    <a class="text-link compact" href="./player.html?id=${escapeHTML(player.id)}">Profile</a>
                  </div>
                    <div class="stat-grid">
                    <div class="stat-box"><span>OVR</span><strong>${player.ovr || "N/A"}</strong></div>
                    <div class="stat-box"><span>Games</span><strong>${player.gamesPlayed || 0}</strong></div>
                    <div class="stat-box"><span>Goals</span><strong>${player.goals || 0}</strong></div>
                    <div class="stat-box"><span>Shots</span><strong>${player.shots || 0}</strong></div>
                    <div class="stat-box"><span>Assists</span><strong>${player.assists || 0}</strong></div>
                    <div class="stat-box"><span>Points</span><strong>${player.points || 0}</strong></div>
                  </div>
                </div>`
              : statusMessage("empty", "Select a player to compare.")
        )
        .join("")}
    </div>
  `;
}

function render(allData, focusSearch = false) {
  const divisions = divisionOptions(allData);
  if (!divisions.some((option) => option.value === state.division)) state.division = "All";
  const players = filteredStats(allData);

  root.innerHTML = `
    <section class="section-panel players-title-panel">
      <div class="players-title-copy">
        <span class="eyebrow">Player Stats</span>
        <h1>Players</h1>
        <p>Search the league, filter seasons, and open clean player profiles for career details.</p>
      </div>
      <div class="players-title-side">
        <span class="pill">${escapeHTML(activeFilterText())}</span>
        <a class="button primary" href="./all-time.html">All Time Stats</a>
      </div>
    </section>

    <section class="section-panel players-filter-panel">
      <details class="players-filters-details" open>
        <summary class="section-head compact-head players-filters-summary">
          <div>
            <span class="eyebrow">Filters</span>
            <h2>Find Player Leaders</h2>
            <p>Choose a stat type, season, and division.</p>
          </div>
        </summary>
        <div class="controls players-controls">
          ${controlSelect("stage", "Stats Type", stageOptions, state.stage)}
          ${controlSelect("season", "Season", [{ value: "All", label: "All" }, ...SITE.seasons.map((season) => ({ value: season, label: season }))], state.season)}
          ${controlSelect("division", "Division", divisions, state.division)}
          ${controlSelect("minGames", "Minimum Games", [
            { value: "0", label: "All" },
            { value: "1", label: "1+ GP" },
            { value: "3", label: "3+ GP" },
            { value: "5", label: "5+ GP" }
          ], state.minGames)}
          ${controlSelect("sort", "Sort By", [
            { value: "goals", label: "Goals" },
            { value: "shots", label: "Shots" },
            { value: "assists", label: "Assists" },
            { value: "points", label: "Points" },
            { value: "mvpScore", label: "MVP goals" },
            { value: "ovr", label: "OVR" }
          ], state.sort)}
          ${controlInput("search", "Search", "Player or team")}
        </div>
      </details>
    </section>

    <section class="section-panel people-panel people-hero-panel players-main-panel">
      <div class="players-main-head">
        <div>
          <span class="eyebrow">Dashboard</span>
          <h2>${escapeHTML(sortLabel())} Leaders</h2>
          <p>${players.length} players match the current filters.</p>
        </div>
        <span class="pill">${escapeHTML(state.search ? `Search: ${state.search}` : "Top 5 shown")}</span>
      </div>
      ${playerSummary(players, allData)}
    </section>

    <section class="section-panel players-top-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Leaders</span>
          <h2>Top Performers</h2>
          <p>Goal leaders and goal-first MVP watch cards are shown for the selected filters.</p>
        </div>
      </div>
      <div class="grid leader-grid">
        ${ranking("Goals", players, "goals", "Scoring", allData)}
        ${ranking("Assists", players, "assists", "Playmaking", allData)}
        ${ranking("Points", players, "points", "Output", allData)}
        ${ranking("MVP Goals", players, "mvpScore", "Impact", allData)}
      </div>
    </section>

    <section class="section-panel players-compare-panel">
      <details class="players-compare-details">
        <summary class="section-head players-compare-summary">
          <div>
            <span class="eyebrow">Compare</span>
            <h2>Player Comparison</h2>
            <p>Select two players to compare their career output.</p>
          </div>
        </summary>
        ${players.length >= 2 ? comparison(players, allData) : statusMessage("empty", "At least two players are needed for comparison.")}
      </details>
    </section>
  `;

  const searchInput = document.getElementById("search");
  searchInput.value = state.search;
  if (focusSearch) {
    searchInput.focus();
    searchInput.setSelectionRange(state.search.length, state.search.length);
  }
  ["stage", "season", "division", "minGames", "sort", "compareA", "compareB"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      state[id] = event.target.value;
      render(allData);
    });
  });
  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    render(allData, true);
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading player stats...");
  render(await loadAllSeasons());
}

init();
