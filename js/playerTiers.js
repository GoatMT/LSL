import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { computeCombinedPlayerStats, computePlayerStats, playerOVR, playerTeamForMatch } from "./leagueEngine.js?v=3.10";
import { setupLayout } from "./main.js";
import { SITE } from "./config.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("player-tiers.html");

const root = document.getElementById("page-root");
const state = {
  season: "All",
  division: "All",
  position: "All",
  stage: "all",
  metric: "goals",
  minGames: "0",
  search: "",
  collapsedTiers: new Set(),
  filtersOpen: typeof window === "undefined" || window.innerWidth > 680,
};

const stageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];

const metricOptions = [
  { value: "goals", label: "Goals" },
  { value: "goalsPerGame", label: "Goals Per Game Played" },
  { value: "championships", label: "Championships" },
  { value: "ovr", label: "OVR" },
  { value: "gamesPlayed", label: "Games Played" },
  { value: "wins", label: "Wins" },
  { value: "winsPerGame", label: "Wins Per Game Played" },
  { value: "ties", label: "Ties" },
  { value: "losses", label: "Losses" },
];

const goalkeeperMetricOptions = [
  { value: "goals", label: "Goals" },
  { value: "championships", label: "Championships" },
  { value: "ovr", label: "OVR" },
  { value: "gamesPlayed", label: "Games Played" },
  { value: "wins", label: "Wins" },
  { value: "ties", label: "Ties" },
  { value: "losses", label: "Losses" },
  { value: "winsPerGame", label: "Wins Per Game Played" },
  { value: "goalsAgainstPerGame", label: "Goals Against Per Game" },
  { value: "cleanSheets", label: "Clean Sheets" },
];

const positionOptions = [
  { value: "All", label: "All Positions" },
  { value: "Goalkeeper", label: "Goalkeeper" },
  { value: "Defender", label: "Defender" },
  { value: "Midfielder", label: "Midfielder" },
  { value: "Forward", label: "Forward" },
  { value: "Other", label: "Other" },
];

const tierOrder = ["S", "A", "B", "C", "D", "F"];

function metricTier(value, metric) {
  if (!Number.isFinite(value)) return "F";
  if (metric === "ovr") {
    if (value >= 95) return "S";
    if (value >= 85) return "A";
    if (value >= 75) return "B";
    if (value >= 65) return "C";
    if (value >= 55) return "D";
    return "F";
  }
  if (metric === "losses") {
    if (value === 0) return "S";
    if (value <= 1) return "A";
    if (value <= 2) return "B";
    if (value <= 3) return "C";
    if (value <= 4) return "D";
    return "F";
  }
  if (metric === "goalsPerGame") {
    if (value >= 1.4) return "S";
    if (value >= 1) return "A";
    if (value >= 0.65) return "B";
    if (value >= 0.4) return "C";
    if (value >= 0.2) return "D";
    return "F";
  }
  if (metric === "winsPerGame") {
    if (value >= 0.75) return "S";
    if (value >= 0.6) return "A";
    if (value >= 0.45) return "B";
    if (value >= 0.33) return "C";
    if (value > 0) return "D";
    return "F";
  }
  if (metric === "goalsAgainstPerGame") {
    if (value <= 0.75) return "S";
    if (value <= 1.25) return "A";
    if (value <= 1.75) return "B";
    if (value <= 2.25) return "C";
    if (value <= 3) return "D";
    return "F";
  }
  if (metric === "cleanSheets") {
    if (value >= 10) return "S";
    if (value >= 7) return "A";
    if (value >= 5) return "B";
    if (value >= 3) return "C";
    if (value >= 1) return "D";
    return "F";
  }
  if (metric === "championships") {
    if (value >= 3) return "S";
    if (value >= 2) return "A";
    if (value >= 1) return "B";
    return "F";
  }
  if (metric === "ties") {
    if (value >= 4) return "S";
    if (value >= 3) return "A";
    if (value >= 2) return "B";
    if (value >= 1) return "C";
    return "F";
  }
  const thresholds = {
    goals: [10, 7, 5, 3, 1],
    gamesPlayed: [20, 15, 10, 7, 3],
    wins: [10, 7, 5, 3, 1],
  }[metric] || [10, 7, 5, 3, 1];
  if (value >= thresholds[0]) return "S";
  if (value >= thresholds[1]) return "A";
  if (value >= thresholds[2]) return "B";
  if (value >= thresholds[3]) return "C";
  if (value >= thresholds[4]) return "D";
  return "F";
}

function metricValue(player, metric, ovr) {
  if (metric === "ovr") return ovr;
  if (metric === "goalsPerGame" || metric === "winsPerGame") {
    const games = Number(player.gamesPlayed) || 0;
    if (!games) return 0;
    const total = metric === "goalsPerGame" ? Number(player.goals) || 0 : Number(player.wins) || 0;
    return total / games;
  }
  if (metric === "goalsAgainstPerGame") {
    const value = Number(player.goalsAgainstPerGame);
    return Number.isFinite(value) ? value : null;
  }
  if (metric === "cleanSheets") {
    const value = Number(player[metric]);
    return Number.isFinite(value) ? value : null;
  }
  const value = Number(player[metric]);
  return Number.isFinite(value) ? value : 0;
}

function formatMetric(value, metric) {
  if (!Number.isFinite(value)) return "N/A";
  if (["goalsPerGame", "winsPerGame", "goalsAgainstPerGame"].includes(metric)) return value.toFixed(2);
  return String(Math.round(value));
}

function selectedMetric() {
  const options = metricOptionsForPosition();
  return options.find((option) => option.value === state.metric) || options[0];
}

function selectedStageLabel() {
  return stageOptions.find((option) => option.value === state.stage)?.label || "All Games";
}

function metricOptionsForPosition() {
  return state.position === "Goalkeeper" ? goalkeeperMetricOptions : metricOptions;
}

function positionGroup(position = "") {
  const value = String(position).toLowerCase();
  if (/goal|keeper|goalie|gk/.test(value)) return "Goalkeeper";
  if (/defend|back|centre back|center back|cb/.test(value)) return "Defender";
  if (/mid|wing back/.test(value)) return "Midfielder";
  if (/forward|striker|winger|attack/.test(value)) return "Forward";
  return "Other";
}

function tierRange(tier, metric) {
  const ranges = {
    goals: { S: "10+", A: "7–9", B: "5–6", C: "3–4", D: "1–2", F: "0" },
    goalsPerGame: { S: "1.40+", A: "1.00–1.39", B: "0.65–0.99", C: "0.40–0.64", D: "0.20–0.39", F: "<0.20" },
    championships: { S: "3+", A: "2", B: "1", C: "0", D: "0", F: "0" },
    ovr: { S: "95–99", A: "85–94", B: "75–84", C: "65–74", D: "55–64", F: "50–54" },
    gamesPlayed: { S: "20+", A: "15–19", B: "10–14", C: "7–9", D: "3–6", F: "0–2" },
    wins: { S: "10+", A: "7–9", B: "5–6", C: "3–4", D: "1–2", F: "0" },
    winsPerGame: { S: "0.75+", A: "0.60–0.74", B: "0.45–0.59", C: "0.33–0.44", D: ">0–0.32", F: "0" },
    goalsAgainstPerGame: { S: "0.00–0.75", A: "0.76–1.25", B: "1.26–1.75", C: "1.76–2.25", D: "2.26–3.00", F: "3.01+" },
    cleanSheets: { S: "10+", A: "7–9", B: "5–6", C: "3–4", D: "1–2", F: "0" },
    ties: { S: "4+", A: "3", B: "2", C: "1", D: "0", F: "0" },
    losses: { S: "0", A: "1", B: "2", C: "3", D: "4", F: "5+" },
  };
  return ranges[metric]?.[tier] || "—";
}

function seasonRows(allData) {
  if (state.season === "All") return computeCombinedPlayerStats(allData, { stage: state.stage });
  const season = allData.find((data) => String(data.year) === state.season);
  return season ? computePlayerStats(season, { stage: state.stage }) : [];
}

function selectedSeasons(allData) {
  if (state.season === "All") return allData;
  return allData.filter((data) => String(data.year) === state.season);
}

function playoffMatchesForSeason(data = {}) {
  if (Array.isArray(data.playoffs?.divisions)) {
    return data.playoffs.divisions.flatMap((division) =>
      (division.rounds || []).flatMap((round) =>
        (round.matches || []).map((match) => ({
          ...match,
          stage: match.stage || "playoffs",
          division: match.division || division.division,
        }))
      )
    );
  }
  return (data.playoffs?.rounds || []).flatMap((round) =>
    (round.matches || []).map((match) => ({
      ...match,
      stage: match.stage || "playoffs",
      division: match.division || data.playoffs?.division || data.division || "Seniors",
    }))
  );
}

function seasonMatches(data) {
  return [...(data.matches || []), ...playoffMatchesForSeason(data)];
}

function goalkeeperGoalsAgainstMap(seasons) {
  const totals = new Map();
  seasons.forEach((data) => {
    const goalkeepers = computePlayerStats(data, { stage: "all" }).filter((player) => positionGroup(player.position) === "Goalkeeper");
    const seenMatches = new Set();
    seasonMatches(data).forEach((match) => {
      const matchKey = `${data.year}-${match.id}`;
      if (seenMatches.has(matchKey) || !match.id) return;
      if (state.stage !== "all" && (match.stage || "regular") !== state.stage) return;
      if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return;
      seenMatches.add(matchKey);
      goalkeepers.forEach((player) => {
        if ((match.absences || []).includes(player.id)) return;
        const teamId = playerTeamForMatch(player, match);
        if (!teamId || (match.homeTeamId !== teamId && match.awayTeamId !== teamId)) return;
        const opponentScore = match.homeTeamId === teamId ? match.awayScore : match.homeScore;
        const current = totals.get(player.id) || { games: 0, goalsAgainst: 0, cleanSheets: 0 };
        current.games += 1;
        current.goalsAgainst += Number(opponentScore) || 0;
        if (Number(opponentScore) === 0) current.cleanSheets += 1;
        totals.set(player.id, current);
      });
    });
  });
  return new Map([...totals.entries()].map(([id, total]) => [id, {
    goalsAgainstPerGame: total.games ? total.goalsAgainst / total.games : null,
    cleanSheets: total.cleanSheets,
  }]));
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
          const current = champions.get(player.id) || { count: 0 };
          current.count += 1;
          champions.set(player.id, current);
        });
      });
  });
  return champions;
}

function tierRows(allData) {
  let rows = seasonRows(allData);
  if (state.division !== "All") rows = rows.filter((player) => player.division === state.division);
  if (state.position !== "All") rows = rows.filter((player) => positionGroup(player.position) === state.position);
  const minGames = Math.max(0, Number(state.minGames) || 0);
  if (minGames > 0) rows = rows.filter((player) => (Number(player.gamesPlayed) || 0) >= minGames);
  const comparison = rows;
  const championships = championshipMap(selectedSeasons(allData));
  const goalkeeperRates = goalkeeperGoalsAgainstMap(selectedSeasons(allData));
  const search = state.search.trim().toLowerCase();
  if (search) {
    rows = rows.filter((player) => `${player.name} ${player.teamName} ${player.position}`.toLowerCase().includes(search));
  }
  return rows
    .map((player) => {
      const enrichedPlayer = {
        ...player,
        championships: championships.get(player.id)?.count || 0,
        goalsAgainstPerGame: goalkeeperRates.get(player.id)?.goalsAgainstPerGame ?? null,
        cleanSheets: goalkeeperRates.get(player.id)?.cleanSheets ?? null,
      };
      const ovr = playerOVR(enrichedPlayer, comparison);
      const value = metricValue(enrichedPlayer, state.metric, ovr);
      return {
        ...enrichedPlayer,
        ovr,
        value,
        tier: metricTier(value, state.metric),
      };
    })
    .sort((a, b) => {
      const aValue = Number.isFinite(a.value) ? a.value : -1;
      const bValue = Number.isFinite(b.value) ? b.value : -1;
      if (bValue !== aValue) return bValue - aValue;
      const goalsTie = (Number(b.goals) || 0) - (Number(a.goals) || 0);
      if (goalsTie) return goalsTie;
      const winsTie = (Number(b.wins) || 0) - (Number(a.wins) || 0);
      if (winsTie) return winsTie;
      const lossesTie = (Number(a.losses) || 0) - (Number(b.losses) || 0);
      if (lossesTie) return lossesTie;
      return (Number(b.ovr) || 0) - (Number(a.ovr) || 0) || String(a.name || "").localeCompare(String(b.name || ""));
    });
}

function metricButtonLabel(option) {
  return option.label;
}

function renderMetricToggle() {
  return `
    <div class="player-tiers-stat-type">
      <span class="player-tiers-filter-label">Tier Stat</span>
      <div class="player-tiers-metric-toggle" role="group" aria-label="Tier Stat">
        ${metricOptionsForPosition().map((option) => `
          <button
            type="button"
            class="player-tiers-metric-button${state.metric === option.value ? " active" : ""}"
            data-tier-metric="${escapeHTML(option.value)}"
            aria-pressed="${state.metric === option.value ? "true" : "false"}"
            aria-label="${escapeHTML(option.label)}: highest to lowest"
          >${escapeHTML(metricButtonLabel(option))}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPlayerRow(player, metric) {
  const href = `./player.html?id=${encodeURIComponent(player.id)}`;
  return `
    <article class="player-tier-row">
      <div class="player-tier-identity">
        <a class="player-tier-name" href="${escapeHTML(href)}">${escapeHTML(player.name || "Player TBA")}</a>
        <span>${escapeHTML(player.teamName || "Team TBA")}</span>
        <small>${escapeHTML(player.position || "Position TBA")}</small>
      </div>
      <div class="player-tier-stat">
        <strong>${escapeHTML(formatMetric(player.value, state.metric))}</strong>
        <small>${escapeHTML(metric.label)}</small>
      </div>
      <div class="player-tier-secondary">
        <span class="pill">${player.gamesPlayed || 0} GP</span>
        <span class="pill">${player.ovr} OVR</span>
        <span class="pill tier-stage-pill">${escapeHTML(selectedStageLabel())}</span>
      </div>
      <a class="player-tier-open text-link" href="${escapeHTML(href)}">View profile</a>
    </article>
  `;
}

function renderCompactPlayer(player) {
  const href = `./player.html?id=${encodeURIComponent(player.id)}`;
  return `<a class="player-tier-compact-player" href="${escapeHTML(href)}">${escapeHTML(player.name || "Player TBA")}</a>`;
}

function renderTierColumn(tier, rows, metric) {
  const players = rows.filter((player) => player.tier === tier);
  const tierKey = tier.toLowerCase();
  const collapsed = state.collapsedTiers.has(tier);
  return `
    <section class="player-tier-column tier-${tierKey}" aria-labelledby="tier-${tierKey}-title">
      <div class="player-tier-column-head">
        <div>
          <span class="tier-mark">${tier}</span>
          <h2 id="tier-${tierKey}-title">${tier}-Tier <span class="player-tier-range" title="${escapeHTML(metric.label)} range: ${escapeHTML(tierRange(tier, state.metric))}">(${escapeHTML(tierRange(tier, state.metric))})</span></h2>
        </div>
        <div class="player-tier-column-actions">
          <span class="pill">${players.length} player${players.length === 1 ? "" : "s"}</span>
          <button class="player-tier-toggle" type="button" data-tier-toggle="${tier}" aria-expanded="${String(!collapsed)}" aria-controls="tier-players-${tierKey}" title="${collapsed ? "Show" : "Hide"} ${tier}-Tier players">
            <span aria-hidden="true">${collapsed ? "+" : "-"}</span>
            <span>${collapsed ? "Show" : "Hide"}</span>
          </button>
        </div>
      </div>
      ${collapsed
        ? `<div class="player-tier-compact-list" id="tier-players-${tierKey}">${players.length ? players.map((player) => renderCompactPlayer(player)).join("") : `<p class="player-tier-empty">No players in ${tier}-Tier for this selection.</p>`}</div>`
        : `<div class="player-tier-list" id="tier-players-${tierKey}">${players.length ? players.map((player) => renderPlayerRow(player, metric)).join("") : `<p class="player-tier-empty">No players in ${tier}-Tier for this selection.</p>`}</div>`}
    </section>
  `;
}
function render(allData) {
  const availableMetrics = metricOptionsForPosition();
  if (!availableMetrics.some((option) => option.value === state.metric)) {
    state.metric = availableMetrics[0].value;
  }
  const rows = tierRows(allData);
  const metric = selectedMetric();
  const seasonLabel = state.season === "All" ? "All Seasons" : state.season;
  const divisionLabel = state.division === "All" ? "All Divisions" : state.division;
  const positionLabel = positionOptions.find((option) => option.value === state.position)?.label || "All Positions";
  const stageLabel = stageOptions.find((option) => option.value === state.stage)?.label || "All Games";
  const minGames = Math.max(0, Number(state.minGames) || 0);
  const minGamesLabel = minGames ? `Minimum ${minGames} GP` : "No GP minimum";
  const allTiersCollapsed = tierOrder.every((tier) => state.collapsedTiers.has(tier));

  root.innerHTML = `
    <section class="section-panel page-title-panel player-tiers-hero">
      <span class="eyebrow">PLAYER RATINGS</span>
      <h1>Player Tiers</h1>
      <p>See every player grouped by the selected performance tier, with the exact stat behind the grade.</p>
    </section>

    <section class="section-panel player-tiers-filter-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">FILTERS</span>
          <h2>Choose a stat to rank</h2>
          <p>Rankings use goals, championships, OVR, games played, wins, ties, losses, and goalkeeper defensive results. Points, assists, shots, and saves never affect a tier.</p>
        </div>
      </div>
      <details class="player-tiers-filter-drawer" id="tier-filter-drawer"${state.filtersOpen ? " open" : ""}>
        <summary><span>Filter Players</span><small>Season, division, position, games, and search</small></summary>
        <div class="player-tiers-controls">
          ${controlSelect("tier-season", "Season", [{ value: "All", label: "All Seasons" }, ...SITE.seasons.map((year) => ({ value: year, label: year }))], state.season)}
          ${controlSelect("tier-division", "Division", [{ value: "All", label: "All Divisions" }, ...SITE.divisions.map((division) => ({ value: division, label: division }))], state.division)}
          ${controlSelect("tier-position", "Position", positionOptions, state.position)}
          ${controlSelect("tier-stage", "Stats Type", stageOptions, state.stage)}
          <label class="player-tiers-min-games">
            <span>Minimum Games</span>
            <input type="number" min="0" step="1" data-tier-min-games value="${escapeHTML(state.minGames)}" placeholder="0">
          </label>
          ${renderMetricToggle()}
          <label class="player-tiers-search">
            <span>Search Players</span>
            <input type="search" data-tier-search value="${escapeHTML(state.search)}" placeholder="Search by name or team">
          </label>
        </div>
      </details>
      <div class="player-tiers-scope" aria-live="polite">
        <span>Showing</span>
        <strong>${escapeHTML(seasonLabel)}</strong>
        <strong>${escapeHTML(divisionLabel)}</strong>
        <strong>${escapeHTML(positionLabel)}</strong>
        <strong>${escapeHTML(stageLabel)}</strong>
        <strong>${escapeHTML(metric.label)}</strong>
        <strong>${escapeHTML(minGamesLabel)}</strong>
        <strong>${rows.length} player${rows.length === 1 ? "" : "s"}</strong>
      </div>
    </section>

    <section class="section-panel player-tiers-main">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">TIER BOARD</span>
          <h2>${escapeHTML(metric.label)} Tiers</h2>
          <p>${escapeHTML(metric.label)} are ranked highest to lowest. Tie-breakers: Goals, Wins, least Losses, then OVR.</p>
        </div>
        <button class="player-tier-all-toggle" type="button" data-tier-all-toggle>${allTiersCollapsed ? "Expand all" : "Collapse all"}</button>
      </div>
      ${rows.length ? `<div class="player-tier-grid">${tierOrder.map((tier) => renderTierColumn(tier, rows, metric)).join("")}</div>` : statusMessage("empty", "No players match these filters.")}
    </section>
  `;

  root.querySelector("#tier-filter-drawer")?.addEventListener("toggle", (event) => {
    state.filtersOpen = event.target.open;
  });
  root.querySelector("[data-tier-all-toggle]")?.addEventListener("click", () => {
    if (allTiersCollapsed) state.collapsedTiers.clear();
    else state.collapsedTiers = new Set(tierOrder);
    render(allData);
  });
  root.querySelectorAll("[data-tier-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const tier = button.dataset.tierToggle;
      const key = tier?.toLowerCase();
      if (!tier) return;
      const isCollapsed = state.collapsedTiers.has(tier);
      if (isCollapsed) state.collapsedTiers.delete(tier);
      else state.collapsedTiers.add(tier);
      render(allData);
    });
  });
  root.querySelector("#tier-season")?.addEventListener("change", (event) => {
    state.season = event.target.value;
    render(allData);
  });
  root.querySelector("#tier-division")?.addEventListener("change", (event) => {
    state.division = event.target.value;
    render(allData);
  });
  root.querySelector("#tier-position")?.addEventListener("change", (event) => {
    state.position = event.target.value;
    render(allData);
  });
  root.querySelector("#tier-stage")?.addEventListener("change", (event) => {
    state.stage = event.target.value;
    render(allData);
  });
  root.querySelector("[data-tier-min-games]")?.addEventListener("input", (event) => {
    state.minGames = String(Math.max(0, Number(event.target.value) || 0));
    render(allData);
    const input = root.querySelector("[data-tier-min-games]");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });
  root.querySelectorAll("[data-tier-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMetric = button.dataset.tierMetric || "goals";
      if (state.metric === nextMetric) {
        return;
      } else {
        state.metric = nextMetric;
      }
      render(allData);
    });
  });
  root.querySelector("[data-tier-search]")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render(allData);
    const input = root.querySelector("[data-tier-search]");
    input?.focus();
    input?.setSelectionRange(state.search.length, state.search.length);
  });
}

async function init() {
  setDocumentTitle("Player Tiers");
  root.innerHTML = statusMessage("loading", "Loading player tiers...");
  try {
    const allData = await loadAllSeasons();
    if (!allData.length) {
      root.innerHTML = statusMessage("empty", "Player tiers are coming soon.");
      return;
    }
    render(allData);
  } catch (error) {
    console.error(error);
    root.innerHTML = statusMessage("error", "Could not load player tiers right now.");
  }
}

init();
