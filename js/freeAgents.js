import { SITE } from "./config.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { computeCombinedPlayerStats, computePlayerStats, playersWithOVR } from "./leagueEngine.js?v=3.10";
import { escapeHTML, initials, setDocumentTitle, slugify, statusMessage, unique } from "./utils.js";
import { setupLayout } from "./main.js";

setupLayout("free-agents.html");
setDocumentTitle("Free Agents");

const root = document.getElementById("page-root");
const state = {
  status: "All",
  division: "All",
  position: "All",
  sort: "ovr",
  search: "",
};

const statusOptions = ["All", "Waiting", "Unconfirmed", "Retired"];

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function teamCode(team = {}) {
  const overrides = {
    "gangat-warriors": "GNG",
  };
  if (overrides[team.id]) return overrides[team.id];
  const existing = String(team.shortName || team.abbreviation || team.abbr || "").trim();
  if (existing.length >= 3) return existing.toUpperCase().slice(0, 3);
  const initialsCode = String(team.name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[^a-z0-9]/gi, "")[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return (initialsCode || existing.toUpperCase()).slice(0, 3).padEnd(3, "X") || "TBA";
}

function positionGroup(position = "") {
  return /goal|keeper|goalie|gk/i.test(String(position)) ? "Goalkeeper" : "Field";
}

function statusClass(status) {
  return `status-${slugify(status)}`;
}

function dataText(value) {
  return String(value || "").toLowerCase();
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function newsTexts(news, articles) {
  const values = [];
  const collect = (value) => {
    if (!value) return;
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(news?.items || news);
  collect(articles?.articles || articles);
  return values;
}

function isOfficiallyRetired(player, officialNews) {
  const name = dataText(player.name);
  const achievementText = dataText((player.achievements || []).join(" "));
  const escapedName = escapeRegex(name);
  const directRetirement = new RegExp([
    `\\b${escapedName}\\s+(?:(?:has|have|officially)\\s+)?retired\\b`,
    `\\b${escapedName}\\s+(?:has\\s+)?announced\\s+(?:his|their)\\s+retirement\\b`,
    `\\bretirement\\s+of\\s+${escapedName}\\b`,
  ].join("|"), "i");
  return Boolean(name) && (
    directRetirement.test(achievementText) ||
    officialNews.some((text) => {
      return directRetirement.test(String(text));
    })
  );
}

function buildTeamMaps(allData) {
  const byId = new Map();
  const byName = new Map();
  allData.forEach((season) => {
    (season.teams || []).forEach((team) => {
      const code = teamCode(team);
      byId.set(team.id, code);
      byName.set(dataText(team.name), code);
    });
  });
  return { byId, byName };
}

function codeFor(teamId, teamName, maps) {
  return maps.byId.get(teamId) || maps.byName.get(dataText(teamName)) || teamCode({ name: teamName || teamId });
}

function buildPlayerRecords(allData) {
  const maps = buildTeamMaps(allData);
  const records = new Map();

  const addRecord = (season, player, team = null) => {
    if (!player?.id) return;
    const record = records.get(player.id) || {
      id: player.id,
      name: player.name || "Unknown Player",
      seasons: [],
      teams: [],
      divisions: [],
      positions: [],
      latestYear: "",
      photo: "",
      achievements: [],
    };
    record.name = player.name || record.name;
    record.seasons = unique([...record.seasons, String(season.year)]).sort((a, b) => Number(a) - Number(b));
    record.latestYear = record.seasons.at(-1) || record.latestYear;
    record.photo = player.photo || record.photo;
    record.divisions = unique([...record.divisions, player.division || team?.division]);
    record.positions = unique([...record.positions, player.position]);
    record.achievements = unique([...record.achievements, ...(player.achievements || [])]);

    const teamId = player.teamId || team?.id || "";
    const teamName = player.teamName || team?.name || "";
    const seasonCode = codeFor(teamId, teamName, maps);
    if (teamId || teamName) record.teams.push({ code: seasonCode, year: String(season.year), id: teamId });
    if (player.previousTeamId || player.previousTeamName) {
      record.teams.push({
        code: codeFor(player.previousTeamId, player.previousTeamName, maps),
        year: String(season.year),
        id: player.previousTeamId || "",
      });
    }
    records.set(player.id, record);
  };

  allData.forEach((season) => {
    (season.players || []).forEach((player) => addRecord(season, player));
    (season.teams || []).forEach((team) => (team.roster || []).forEach((player) => addRecord(season, {
      ...player,
      teamId: team.id,
      teamName: team.name,
      division: team.division,
    }, team)));
  });

  return records;
}

function championshipCounts(allData) {
  const counts = new Map();
  allData.forEach((season) => {
    const champions = new Set(
      (season.awards?.awards || [])
        .filter((award) => award.category === "Champion Team")
        .map((award) => award.teamId)
        .filter(Boolean)
    );
    if (!champions.size) return;
    (season.teams || []).forEach((team) => {
      if (!champions.has(team.id)) return;
      (team.roster || []).forEach((player) => counts.set(player.id, number(counts.get(player.id)) + 1));
    });
  });
  return counts;
}

function buildFreeAgents(allData, news, articles) {
  const records = buildPlayerRecords(allData);
  const statsMap = new Map(computeCombinedPlayerStats(allData, { stage: "all" }).map((player) => [player.id, player]));
  const latestCompletedYear = allData
    .filter((season) => (season.matches || []).some((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)))
    .map((season) => Number(season.year))
    .sort((a, b) => a - b)
    .at(-1) || 2026;
  const latestSeason = allData.find((season) => String(season.year) === String(latestCompletedYear));
  const latestSeasonStats = new Map(
    (latestSeason ? computePlayerStats(latestSeason, { stage: "all" }) : []).map((player) => [player.id, player])
  );
  const ratingPool = [...statsMap.values()];
  const ratings = new Map(playersWithOVR(ratingPool, ratingPool).map((player) => [player.id, player.ovr]));
  const champions = championshipCounts(allData);
  const officialNews = newsTexts(news, articles);
  return [...records.values()]
    .map((record) => {
      const stats = statsMap.get(record.id) || {};
      const lastSeason = Number(record.latestYear) || 0;
      const latestSeasonGames = number(latestSeasonStats.get(record.id)?.gamesPlayed);
      const retired = isOfficiallyRetired({ ...record, ...stats, achievements: unique([...record.achievements, ...(stats.achievements || [])]) }, officialNews);
      const status = retired || latestSeasonGames === 0 ? "Retired" : lastSeason >= latestCompletedYear - 1 ? "Waiting" : "Unconfirmed";
      const teams = unique(record.teams
        .sort((a, b) => Number(a.year) - Number(b.year))
        .map((entry) => entry.code));
      const games = number(stats.gamesPlayed);
      const goals = number(stats.goals);
      const wins = number(stats.wins);
      const ties = number(stats.ties);
      const losses = number(stats.losses);
      return {
        ...record,
        ...stats,
        name: stats.name || record.name,
        seasons: record.seasons,
        teams,
        divisions: unique([...record.divisions, stats.division]),
        positions: unique([...record.positions, stats.position]),
        positionGroup: positionGroup(stats.position || record.positions[0]),
        latestYear: record.latestYear,
        status,
        gamesPlayed: games,
        goals,
        wins,
        ties,
        losses,
        goalsPerGame: games ? goals / games : 0,
        winRate: games ? wins / games : 0,
        ovr: ratings.get(record.id) || 50,
        championships: champions.get(record.id) || 0,
      };
    })
    .filter((player) => player.gamesPlayed > 0);
}

function sortAgents(players) {
  const sort = state.sort;
  return [...players].sort((a, b) => {
    const values = sort === "name"
      ? [a.name.localeCompare(b.name), b.goals - a.goals]
      : sort === "latest"
        ? [Number(b.latestYear) - Number(a.latestYear), b.gamesPlayed - a.gamesPlayed]
        : sort === "games"
          ? [b.gamesPlayed - a.gamesPlayed, b.goals - a.goals]
          : sort === "wins"
            ? [b.wins - a.wins, b.goals - a.goals]
            : sort === "ovr"
              ? [b.ovr - a.ovr, b.goals - a.goals, b.wins - a.wins]
              : [b.goals - a.goals, b.wins - a.wins, b.gamesPlayed - a.gamesPlayed];
    return values.find((value) => value !== 0) || a.name.localeCompare(b.name);
  });
}

function filteredAgents(players) {
  const query = state.search.trim().toLowerCase();
  return sortAgents(players
    .filter((player) => state.status === "All" || player.status === state.status)
    .filter((player) => state.division === "All" || player.divisions.includes(state.division))
    .filter((player) => state.position === "All" || player.positionGroup === state.position)
    .filter((player) => {
      if (!query) return true;
      return [player.name, player.status, player.position, player.positionGroup, player.teams.join(" "), player.seasons.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query);
    }));
}

function selectControl(id, label, options, selected) {
  return `
    <div class="control">
      <label for="${escapeHTML(id)}">${escapeHTML(label)}</label>
      <select id="${escapeHTML(id)}">
        ${options.map((option) => `<option value="${escapeHTML(option.value)}"${String(option.value) === String(selected) ? " selected" : ""}>${escapeHTML(option.label)}</option>`).join("")}
      </select>
    </div>
  `;
}

function statTile(label, value, note = "") {
  return `<div class="free-agents-summary-tile"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong>${note ? `<small>${escapeHTML(note)}</small>` : ""}</div>`;
}

function statusToggle() {
  return `
    <div class="free-agents-status-filter">
      <span class="eyebrow">Availability</span>
      <div class="free-agents-status-toggle" role="group" aria-label="Free agent status">
        ${statusOptions.map((status) => `<button type="button" class="${state.status === status ? "active" : ""}" data-status="${escapeHTML(status)}" aria-pressed="${state.status === status}">${escapeHTML(status)}</button>`).join("")}
      </div>
    </div>
  `;
}

function summary(players, allPlayers) {
  const waiting = allPlayers.filter((player) => player.status === "Waiting").length;
  const retired = allPlayers.filter((player) => player.status === "Retired").length;
  const goals = allPlayers.reduce((sum, player) => sum + player.goals, 0);
  const experienced = [...allPlayers].sort((a, b) => b.gamesPlayed - a.gamesPlayed || b.goals - a.goals)[0];
  return `
    <div class="free-agents-summary-grid" data-free-agent-summary>
      ${statTile("Showing", players.length, `${allPlayers.length} in the full pool`)}
      ${statTile("Waiting", waiting, "latest listed season")}
      ${statTile("Retired", retired, "no 2026 game or confirmed retirement")}
      ${statTile("Career Goals", goals, experienced ? `Most experienced: ${experienced.name}` : "Across this pool")}
    </div>
  `;
}

function radarCard(label, player, value, note) {
  if (!player) return `<article class="free-agents-radar-card"><span>${escapeHTML(label)}</span><h3>No match yet</h3><p>${escapeHTML(note)}</p></article>`;
  return `<article class="free-agents-radar-card"><span>${escapeHTML(label)}</span><h3>${escapeHTML(player.name)}</h3><p>${escapeHTML(player.status)} | ${escapeHTML(player.teams.join(" / ") || "No club listed")}</p><strong>${escapeHTML(value)}</strong><p>${escapeHTML(note)}</p></article>`;
}

function renderRadar(allPlayers) {
  const scorer = [...allPlayers].sort((a, b) => b.goals - a.goals || b.wins - a.wins)[0];
  const winner = [...allPlayers].sort((a, b) => b.wins - a.wins || b.goals - a.goals)[0];
  const experienced = [...allPlayers].sort((a, b) => b.gamesPlayed - a.gamesPlayed || b.seasons.length - a.seasons.length)[0];
  return `
    <div class="free-agents-radar" aria-label="Free agent market radar">
      ${radarCard("Top scorer available", scorer, `${scorer?.goals || 0} goals`, "Career goals")}
      ${radarCard("Winning pedigree", winner, `${winner?.wins || 0} wins`, "Career wins")}
      ${radarCard("Most experienced", experienced, `${experienced?.gamesPlayed || 0} games`, `${experienced?.seasons.length || 0} seasons listed`)}
    </div>
  `;
}

function bar(value, max, form = false) {
  const width = max ? Math.max(2, Math.min(100, (number(value) / max) * 100)) : 2;
  return `<div class="free-agent-bar${form ? " free-agent-form-bar" : ""}"><b>${escapeHTML(form ? `${(number(value) * 100).toFixed(0)}%` : number(value))}</b><span class="free-agent-bar-track"><span class="free-agent-bar-fill" style="width:${width.toFixed(1)}%"></span></span></div>`;
}

function teamCodes(player) {
  if (!player.teams.length) return `<span class="free-agent-code">TBA</span>`;
  return player.teams.map((code) => `<span class="free-agent-code">${escapeHTML(code)}</span>`).join("");
}

function renderRows(players, allPlayers) {
  const maxGoals = Math.max(1, ...allPlayers.map((player) => player.goals));
  if (!players.length) return `<p class="free-agent-empty">No free agents match these filters.</p>`;
  return `
    <div class="free-agents-table-wrap">
      <table class="free-agents-table">
        <caption class="sr-only">LSL free agent career chart</caption>
        <thead><tr>
          <th scope="col">Player</th><th scope="col">Status</th><th scope="col">Seasons</th><th scope="col">Past Teams</th>
          <th scope="col">Goals Chart</th><th scope="col">GP</th><th scope="col">Career Record</th><th scope="col">OVR</th><th scope="col">Profile</th>
        </tr></thead>
        <tbody>
          ${players.map((player, index) => `
            <tr data-player-row="${escapeHTML(player.id)}" style="--free-agent-order:${Math.min(index, 12)}">
              <td>
                <a class="free-agent-player-link" href="./player.html?id=${encodeURIComponent(player.id)}">
                  <span class="free-agent-avatar" aria-hidden="true">${escapeHTML(initials(player.name))}</span>
                  <span class="free-agent-name"><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.positionGroup)} | ${escapeHTML(player.divisions.join(" / ") || "Division TBA")}</small></span>
                </a>
              </td>
              <td><span class="free-agent-status ${statusClass(player.status)}">${escapeHTML(player.status)}</span></td>
              <td class="free-agent-season-list">${escapeHTML(player.seasons.join(", "))}</td>
              <td><div class="free-agent-teams">${teamCodes(player)}<small>${escapeHTML(player.teams.length ? "former club history" : "No former club listed")}</small></div></td>
              <td class="free-agent-chart-cell">${bar(player.goals, maxGoals)}</td>
              <td class="free-agent-number">${escapeHTML(player.gamesPlayed)}</td>
              <td><span class="free-agent-record">${escapeHTML(player.wins)}<span>W</span> - ${escapeHTML(player.ties)}<span>D</span> - ${escapeHTML(player.losses)}<span>L</span></span></td>
              <td><span class="free-agent-ovr">${escapeHTML(player.ovr)}</span></td>
              <td><a class="button secondary free-agent-profile-link" href="./player.html?id=${encodeURIComponent(player.id)}">View Profile</a></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderResults(players, allPlayers) {
  return `
    <div class="free-agents-section-heading"><div><span class="eyebrow">Career chart</span><h2>Every Recorded Player</h2><p>Goals are charted against the largest career total in the player pool. Record format is Wins - Ties - Losses.</p></div><span class="free-agents-results-meta">${escapeHTML(players.length)} shown / ${escapeHTML(allPlayers.length)} total</span></div>
    ${renderRows(players, allPlayers)}
  `;
}

function render(allPlayers) {
  const players = filteredAgents(allPlayers);

  root.innerHTML = `
    <section class="section-panel free-agents-hero">
      <div>
        <span class="eyebrow">LSL Transfer Board</span>
        <h1>Free Agents</h1>
        <p>Every player with at least one recorded LSL game is listed here. Rosters reset after every season, so all players are unattached between seasons.</p>
        <div class="free-agents-note"><strong>Roster reset: every season</strong><span>No 2026 appearance is treated as retired; statuses are not contract announcements.</span></div>
      </div>
      <div class="free-agents-hero-actions"><a class="button primary" href="./all-time.html">All Time Stats</a><a class="button secondary" href="./players.html">All Players</a></div>
    </section>

    <section class="section-panel free-agents-controls" aria-label="Free agent filters">
      <div class="free-agents-section-heading"><div><span class="eyebrow">Filters</span><h2>Explore The Player Pool</h2><p>Search every player with a recorded game, filter by availability or position, and sort the career chart by the trait you value most.</p></div></div>
      <div class="free-agents-filter-grid">
        ${statusToggle()}
        ${selectControl("free-agent-division", "Division", [{ value: "All", label: "All Divisions" }, ...SITE.divisions.map((value) => ({ value, label: value }))], state.division)}
        ${selectControl("free-agent-position", "Position", [{ value: "All", label: "All Positions" }, { value: "Field", label: "Field Players" }, { value: "Goalkeeper", label: "Goalkeepers" }], state.position)}
        ${selectControl("free-agent-sort", "Sort Chart By", [{ value: "ovr", label: "OVR" }, { value: "goals", label: "Career Goals" }, { value: "games", label: "Games Played" }, { value: "wins", label: "Career Wins" }, { value: "latest", label: "Latest Season" }, { value: "name", label: "Player Name" }], state.sort)}
        <div class="control"><label for="free-agent-search">Search</label><input id="free-agent-search" type="search" placeholder="Player, club, season..." value="${escapeHTML(state.search)}"></div>
      </div>
      ${summary(players, allPlayers)}
      ${renderRadar(allPlayers)}
    </section>

    <section class="section-panel free-agents-results" data-free-agent-results>
      ${renderResults(players, allPlayers)}
    </section>
  `;

  root.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => {
    state.status = button.dataset.status || "All";
    render(allPlayers);
  }));
  root.querySelector("#free-agent-division")?.addEventListener("change", (event) => { state.division = event.target.value; render(allPlayers); });
  root.querySelector("#free-agent-position")?.addEventListener("change", (event) => { state.position = event.target.value; render(allPlayers); });
  root.querySelector("#free-agent-sort")?.addEventListener("change", (event) => { state.sort = event.target.value; render(allPlayers); });
  root.querySelector("#free-agent-search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    const players = filteredAgents(allPlayers);
    const summaryGrid = root.querySelector("[data-free-agent-summary]");
    if (summaryGrid) summaryGrid.outerHTML = summary(players, allPlayers);
    const results = root.querySelector("[data-free-agent-results]");
    if (results) results.innerHTML = renderResults(players, allPlayers);
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading the LSL free-agent board...");
  try {
    const [allData, news, articles] = await Promise.all([
      loadAllSeasons(),
      loadJSON("./data/news.json", { items: [] }),
      loadJSON("./data/news-articles.json", { articles: [] }),
    ]);
    const allPlayers = buildFreeAgents(allData, news, articles);
    render(allPlayers);
  } catch (error) {
    console.error("Could not load free agents", error);
    root.innerHTML = statusMessage("error", "Free agents are temporarily unavailable. Please try again soon.");
  }
}

init();
