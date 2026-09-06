import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { computePlayerStats, computeCombinedPlayerStats, playersWithOVR } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("players.html");
setDocumentTitle("Players");

const root = document.getElementById("page-root");

const defaults = {
  metric: "goals",
  stage: "all",
  season: "All",
  division: "All",
  position: "All",
  minGames: "0",
  maxGames: "",
  search: "",
  sortDirection: "desc",
};

let state = { ...defaults };

const metricOptions = [
  { value: "goals", label: "Goals" },
  { value: "wins", label: "Wins" },
  { value: "championships", label: "Championships" },
  { value: "ovr", label: "OVR" },
];

const stageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function selectedSeasons(allData) {
  return state.season === "All" ? allData : allData.filter((season) => season.year === state.season);
}

function metricLabel() {
  return metricOptions.find((option) => option.value === state.metric)?.label || "Goals";
}

function sortDirectionLabel() {
  return state.sortDirection === "asc" ? "ascending" : "descending";
}

function metricButtonLabel(option) {
  if (state.metric !== option.value) return option.label;
  return `${option.label} ${state.sortDirection === "asc" ? "↑" : "↓"}`;
}

function stageLabel() {
  return stageOptions.find((option) => option.value === state.stage)?.label || "All Games";
}

function positionGroup(position = "") {
  const value = String(position).toLowerCase();
  if (/goal|keeper|gk/.test(value)) return "Goalkeeper";
  if (/defend|back|centre back|center back|cb/.test(value)) return "Defender";
  if (/mid|wing back/.test(value)) return "Midfielder";
  if (/forward|striker|winger|attack/.test(value)) return "Forward";
  return position ? "Other" : "Other";
}

function positionOptions(allData) {
  const groups = unique(
    selectedSeasons(allData)
      .flatMap((season) => season.players || [])
      .filter((player) => state.division === "All" || player.division === state.division)
      .map((player) => positionGroup(player.position))
  );
  const order = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Other"];
  return ["All", ...order.filter((group) => groups.includes(group))];
}

function careerOVRMap(allData) {
  const careerPool = computeCombinedPlayerStats(allData, { stage: "all" });
  return new Map(playersWithOVR(careerPool, careerPool).map((player) => [player.id, player.ovr]));
}

function championshipMap(seasons) {
  const champions = new Map();

  seasons.forEach((season) => {
    const awards = season.awards?.awards || [];
    awards
      .filter((award) => award.category === "Champion Team")
      .filter((award) => state.division === "All" || award.division === state.division)
      .forEach((award) => {
        const team = (season.teams || []).find((candidate) => candidate.id === award.teamId);
        (team?.roster || []).forEach((player) => {
          const current = champions.get(player.id) || { count: 0, labels: [] };
          current.count += 1;
          current.labels.push(`${season.year} ${award.division || team.division || ""} - ${award.winner}`.trim());
          champions.set(player.id, current);
        });
      });
  });

  return champions;
}

function aggregatePlayers(allData) {
  const seasons = selectedSeasons(allData);
  const map = new Map();

  seasons.forEach((season) => {
    computePlayerStats(season, { stage: state.stage })
      .filter((player) => state.division === "All" || player.division === state.division)
      .forEach((player) => {
        const current = map.get(player.id) || {
          id: player.id,
          name: player.name,
          goals: 0,
          wins: 0,
          ties: 0,
          losses: 0,
          gamesPlayed: 0,
          seasons: [],
          divisions: [],
          teamHistory: [],
        };

        current.name = player.name || current.name;
        current.photo = player.photo || current.photo || "";
        current.position = player.position || current.position || "";
        current.positionGroup = positionGroup(current.position);
        current.teamId = player.teamId || current.teamId || "";
        current.teamName = player.teamName || current.teamName || "";
        current.latestYear = season.year;
        current.goals += Number(player.goals) || 0;
        current.wins += Number(player.wins) || 0;
        current.ties += Number(player.ties) || 0;
        current.losses += Number(player.losses) || 0;
        current.gamesPlayed += Number(player.gamesPlayed) || 0;
        current.seasons.push(season.year);
        current.divisions.push(player.division);
        if (player.teamId || player.teamName) {
          current.teamHistory.push({
            id: player.teamId || "",
            name: player.teamName || "Team coming soon",
            year: season.year,
          });
        }
        map.set(player.id, current);
      });
  });

  return [...map.values()].map((player) => ({
    ...player,
    seasons: unique(player.seasons),
    divisions: unique(player.divisions),
    teamHistory: player.teamHistory.filter(
      (team, index, list) => list.findIndex((item) => item.id === team.id && item.year === team.year) === index
    ),
  }));
}

function sortPlayers(players) {
  const direction = state.sortDirection === "asc" ? 1 : -1;
  const tieBreakers = {
    goals: ["goals", "wins", "ovr"],
    wins: ["wins", "goals", "ovr"],
    championships: ["championships", "goals", "wins", "ovr"],
    ovr: ["ovr", "goals", "wins"],
  }[state.metric] || ["goals", "wins", "ovr"];

  return [...players].sort((a, b) => {
    for (const key of tieBreakers) {
      const difference = ((Number(b[key]) || 0) - (Number(a[key]) || 0)) * direction;
      if (difference) return difference;
    }
    return a.name.localeCompare(b.name) * direction;
  });
}

function filteredPlayers(allData) {
  const ratings = careerOVRMap(allData);
  const championships = championshipMap(selectedSeasons(allData));
  const min = Math.max(0, Number(state.minGames) || 0);
  const max = state.maxGames === "" ? Infinity : Math.max(0, Number(state.maxGames) || 0);
  const query = state.search.trim().toLowerCase();

  const players = aggregatePlayers(allData)
    .map((player) => {
      const titleRecord = championships.get(player.id) || { count: 0, labels: [] };
      return {
        ...player,
        ovr: ratings.get(player.id) || 50,
        championships: titleRecord.count,
        championshipLabels: titleRecord.labels,
      };
    })
    .filter((player) => state.position === "All" || player.positionGroup === state.position)
    .filter((player) => player.gamesPlayed >= min && player.gamesPlayed <= max)
    .filter((player) => {
      if (!query) return true;
      const teams = player.teamHistory.map((team) => team.name).join(" ");
      return [player.name, teams, player.position, player.positionGroup, ...player.seasons]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  return sortPlayers(players);
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "PL";
}

function teamLabel(player) {
  const names = unique(player.teamHistory.map((team) => team.name));
  if (!names.length) return "Team coming soon";
  if (names.length <= 2) return names.join(" / ");
  return `${names[0]} + ${names.length - 1} more`;
}

function metricValue(player) {
  return Number(player[state.metric]) || 0;
}

function gameRangeLabel() {
  const min = Math.max(0, Number(state.minGames) || 0);
  if (state.maxGames === "") return min ? `${min}+ games` : "Any games played";
  const max = Math.max(0, Number(state.maxGames) || 0);
  return `${min}-${max} games`;
}

function filterScopePills() {
  return [
    state.season === "All" ? "All Seasons" : state.season,
    state.division === "All" ? "All Divisions" : state.division,
    state.position === "All" ? "All Positions" : state.position,
    stageLabel(),
  ]
    .map((label) => `<span class="players-scope-pill">${escapeHTML(label)}</span>`)
    .join("");
}

function renderMetricToggle() {
  return `
    <div class="players-stat-type">
      <span class="players-filter-label">Stats Type</span>
      <div class="players-metric-toggle" role="group" aria-label="Stats Type">
        ${metricOptions
          .map(
            (option) => `
              <button
                type="button"
                class="players-metric-button${state.metric === option.value ? " active" : ""}"
                data-player-metric="${escapeHTML(option.value)}"
                aria-pressed="${state.metric === option.value ? "true" : "false"}"
                aria-label="${escapeHTML(option.label)}: ${escapeHTML(state.metric === option.value ? sortDirectionLabel() : "descending")}"
              >${escapeHTML(metricButtonLabel(option))}</button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}
function selectControl(id, label, options, selected) {
  return `
    <div class="control">
      <label for="${escapeHTML(id)}">${escapeHTML(label)}</label>
      <select id="${escapeHTML(id)}">
        ${options
          .map((option) => {
            const value = typeof option === "object" ? option.value : option;
            const text = typeof option === "object" ? option.label : option;
            return `<option value="${escapeHTML(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHTML(text)}</option>`;
          })
          .join("")}
      </select>
    </div>
  `;
}

function numberControl(id, label, placeholder, value) {
  return `
    <div class="control">
      <label for="${escapeHTML(id)}">${escapeHTML(label)}</label>
      <input id="${escapeHTML(id)}" type="number" inputmode="numeric" min="0" step="1" placeholder="${escapeHTML(placeholder)}" value="${escapeHTML(value)}">
    </div>
  `;
}

function leaderSpotlight(player) {
  if (!player) return "";
  return `
    <article class="players-leader-spotlight">
      <div class="players-leader-rank">1</div>
      <div class="players-avatar large" aria-hidden="true">${escapeHTML(initials(player.name))}</div>
      <div class="players-leader-copy">
        <span class="eyebrow">${state.sortDirection === "asc" ? "Lowest in" : "Number One in"} ${escapeHTML(metricLabel())}</span>
        <h3><a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a></h3>
        <p>${escapeHTML(teamLabel(player))} | ${escapeHTML(player.positionGroup)}</p>
      </div>
      <div class="players-leader-value">
        <strong>${escapeHTML(metricValue(player))}</strong>
        <span>${escapeHTML(metricLabel())}</span>
      </div>
      <a class="button secondary" href="./player.html?id=${escapeHTML(player.id)}">View Profile</a>
    </article>
  `;
}

function metricCell(player, metric, label) {
  const active = state.metric === metric ? " active-metric" : "";
  const value =
    metric === "ovr"
      ? `<span class="players-ovr-badge">${escapeHTML(player.ovr)}</span>`
      : metric === "championships" && player.championships > 0
        ? `<span class="players-title-count" title="${escapeHTML(player.championshipLabels.join(" | "))}">${escapeHTML(player.championships)}</span>`
        : escapeHTML(Number(player[metric]) || 0);
  return `<td class="numeric${active}" data-label="${escapeHTML(label)}">${value}</td>`;
}

function leaderboardTable(players) {
  const rows = players.slice(0, 10);
  if (!rows.length) return statusMessage("empty", "No players match these filters.");

  return `
    <div class="players-table-wrap">
      <table class="players-rank-table">
        <caption class="sr-only">Top 10 players ranked by ${escapeHTML(metricLabel())} ${escapeHTML(sortDirectionLabel())}</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Player</th>
            <th scope="col">Team</th>
            <th scope="col">Position</th>
            <th scope="col">Season</th>
            <th scope="col" class="numeric">GP</th>
            <th scope="col" class="numeric${state.metric === "goals" ? " active-metric" : ""}">Goals</th>
            <th scope="col" class="numeric${state.metric === "wins" ? " active-metric" : ""}">Wins</th>
            <th scope="col" class="numeric${state.metric === "championships" ? " active-metric" : ""}">Championships</th>
            <th scope="col" class="numeric${state.metric === "ovr" ? " active-metric" : ""}">OVR</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (player, index) => `
                <tr>
                  <td data-label="Rank"><span class="players-table-rank${index < 3 ? " top-three" : ""}">#${index + 1}</span></td>
                  <td data-label="Player">
                    <div class="players-name-cell">
                      <span class="players-avatar" aria-hidden="true">${escapeHTML(initials(player.name))}</span>
                      <span>
                        <a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a>
                        <small>${escapeHTML(player.divisions.join(" / ") || "Division coming soon")}</small>
                      </span>
                    </div>
                  </td>
                  <td data-label="Team">
                    ${player.teamId ? `<a class="players-team-link" href="./team.html?season=${escapeHTML(player.latestYear)}&id=${escapeHTML(player.teamId)}">${escapeHTML(teamLabel(player))}</a>` : escapeHTML(teamLabel(player))}
                  </td>
                  <td data-label="Position">${escapeHTML(player.positionGroup)}</td>
                  <td data-label="Season">${escapeHTML(player.seasons.join(", "))}</td>
                  <td class="numeric" data-label="GP">${escapeHTML(player.gamesPlayed)}</td>
                  ${metricCell(player, "goals", "Goals")}
                  ${metricCell(player, "wins", "Wins")}
                  ${metricCell(player, "championships", "Championships")}
                  ${metricCell(player, "ovr", "OVR")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function summaryTiles(players) {
  const leader = players[0];
  return `
    <div class="players-summary-row">
      <div><span>Eligible Players</span><strong>${escapeHTML(players.length)}</strong></div>
      <div><span>Current Leader</span><strong>${escapeHTML(leader?.name || "Coming Soon")}</strong></div>
      <div><span>Leading ${escapeHTML(metricLabel())}</span><strong>${escapeHTML(leader ? metricValue(leader) : 0)}</strong></div>
      <div><span>Games Range</span><strong>${escapeHTML(gameRangeLabel())}</strong></div>
    </div>
  `;
}

function render(allData, focusId = "") {
  const positions = positionOptions(allData);
  if (!positions.includes(state.position)) state.position = "All";

  const min = Math.max(0, Number(state.minGames) || 0);
  const max = state.maxGames === "" ? Infinity : Math.max(0, Number(state.maxGames) || 0);
  const invalidRange = max < min;
  const players = invalidRange ? [] : filteredPlayers(allData);

  root.innerHTML = `
    <div class="players-dashboard">
      <section class="section-panel players-page-hero">
        <div>
          <span class="eyebrow">LSL Player Rankings</span>
          <h1>Players</h1>
          <p>Find every player, narrow the field, and rank the top 10 by the stat that matters to you.</p>
        </div>
        <div class="players-hero-actions">
          <a class="button primary" href="./player-vs-player.html">Compare Players</a>
          <a class="button secondary" href="./all-time.html">All Time Stats</a>
        </div>
      </section>

      <section class="section-panel players-filter-card">
        <div class="players-section-heading">
          <div>
            <span class="eyebrow">Filters</span>
            <h2>Build Your Leaderboard</h2>
            <p>Choose the ranking stat, then set who qualifies for the top 10.</p>
          </div>
          <button class="button secondary players-reset-button" id="reset-filters" type="button">Reset</button>
        </div>

        ${renderMetricToggle()}

        <div class="players-filter-grid">
          ${selectControl("stage", "Game Type", stageOptions, state.stage)}
          ${selectControl("season", "Season", [{ value: "All", label: "All Seasons" }, ...SITE.seasons.map((season) => ({ value: season, label: season }))], state.season)}
          ${selectControl("division", "Division", [
            { value: "All", label: "All Divisions" },
            { value: "Seniors", label: "Seniors" },
            { value: "Juniors", label: "Juniors" },
          ], state.division)}
          ${selectControl("position", "Position", positions, state.position)}
          ${numberControl("minGames", "Minimum Games", "0", state.minGames)}
          ${numberControl("maxGames", "Maximum Games", "No maximum", state.maxGames)}
          <div class="control players-search-control">
            <label for="search">Search Players</label>
            <input id="search" type="search" placeholder="Player or team" value="${escapeHTML(state.search)}">
          </div>
        </div>
        ${invalidRange ? `<p class="players-filter-warning">Maximum Games must be equal to or higher than Minimum Games.</p>` : ""}
      </section>

      <section class="section-panel players-leaderboard-card">
        <div class="players-section-heading players-results-heading">
          <div>
            <span class="eyebrow">Top 10</span>
            <h2>${escapeHTML(metricLabel())} Leaders</h2>
            <p>${escapeHTML(players.length)} players qualify. ${escapeHTML(metricLabel())} are sorted ${escapeHTML(sortDirectionLabel())}.</p>
          </div>
          <div class="players-scope-row">${filterScopePills()}</div>
        </div>

        ${summaryTiles(players)}
        ${leaderSpotlight(players[0])}
        ${leaderboardTable(players)}
      </section>
    </div>
  `;

  document.querySelectorAll("[data-player-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMetric = button.dataset.playerMetric || "goals";
      if (state.metric === nextMetric) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.metric = nextMetric;
        state.sortDirection = "desc";
      }
      render(allData);
    });
  });

  ["stage", "season", "division", "position"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      state[id] = event.target.value;
      if (id === "season" || id === "division") state.position = "All";
      render(allData);
    });
  });

  ["minGames", "maxGames"].forEach((id) => {
    const input = document.getElementById(id);
    input?.addEventListener("change", (event) => {
      state[id] = event.target.value;
      render(allData);
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      state[id] = event.currentTarget.value;
      render(allData);
    });
  });

  const search = document.getElementById("search");
  search?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render(allData, "search");
  });

  document.getElementById("reset-filters")?.addEventListener("click", () => {
    state = { ...defaults };
    render(allData);
  });

  if (focusId) {
    const focused = document.getElementById(focusId);
    focused?.focus({ preventScroll: true });
    if (focused?.setSelectionRange) focused.setSelectionRange(focused.value.length, focused.value.length);
  }
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading players...");
  try {
    render(await loadAllSeasons());
  } catch (error) {
    console.error(error);
    root.innerHTML = `
      <section class="section-panel">
        ${statusMessage("error", "Could not load player rankings. Please try again.")}
      </section>
    `;
  }
}

init();
