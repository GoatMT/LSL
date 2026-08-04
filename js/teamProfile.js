import { renderFormStrip } from "../components/formStrip.js";
import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { calculateStandings, calculateTeamForm, calculateTeamRecord, computeCombinedPlayerStats, computePlayerStats, getNextTeamMatch, isCompletedMatch, playersWithOVR, scoreText, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatDateWithISO, getQueryParam, initials, leadershipRoleLabel, leadershipRoleShort, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("teams.html");

const root = document.getElementById("page-root");
let state = { season: getQueryParam("season") || SITE.defaultSeason };
const requestedTeamId = getQueryParam("id");

function teamMark(team) {
  const logoStyle = team.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team.logo) {
    return `<img class="team-profile-logo" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${logoStyle}>`;
  }
  return `<span class="team-profile-mark"${logoStyle}>${escapeHTML(initials(team.name, 3))}</span>`;
}

function statBox(label, value) {
  return `<div class="stat-box"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
}

function teamMatches(data, teamId) {
  return (data.matches || [])
    .filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)
    .sort(
      (a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        (Number(a.week) || 0) - (Number(b.week) || 0) ||
        String(a.time || "").localeCompare(String(b.time || ""))
    );
}

function teamPlayers(data, teamId) {
  const baseStats = new Map(computePlayerStats(data, { stage: "all" }).map((player) => [player.id, player]));
  const team = (data.teams || []).find((item) => item.id === teamId) || {};
  const rows = new Map();
  const ensureRow = (entry = {}) => {
    if (!entry.playerId) return null;
    const base = baseStats.get(entry.playerId) || {};
    const existing = rows.get(entry.playerId) || {
      ...base,
      id: entry.playerId,
      name: base.name || entry.name || "Player",
      teamId,
      teamName: team.name || base.teamName || "Team",
      division: team.division || base.division || "Seniors",
      goals: 0,
      assists: 0,
      points: 0,
    };
    rows.set(entry.playerId, existing);
    return existing;
  };

  (data.matches || [])
    .filter((match) => isCompletedMatch(match))
    .forEach((match) => {
      (match.scorers || [])
        .filter((scorer) => scorer.teamId === teamId)
        .forEach((scorer) => {
          const row = ensureRow(scorer);
          if (!row) return;
          row.goals += Number(scorer.goals) || 0;
          row.points = row.goals + row.assists;
        });
      (match.assists || [])
        .filter((assist) => assist.teamId === teamId)
        .forEach((assist) => {
          const row = ensureRow(assist);
          if (!row) return;
          row.assists += Number(assist.assists) || 0;
          row.points = row.goals + row.assists;
        });
    });

  return [...rows.values()].sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name));
}

function coachLink(coach) {
  if (!coach?.id) return escapeHTML(coach?.name || "Not listed");
  return `<a href="./coach.html?id=${escapeHTML(coach.id)}">${escapeHTML(coach.name || "Coach")}</a>`;
}

function playerRatingMap(allData) {
  return new Map(playersWithOVR(computeCombinedPlayerStats(allData, { stage: "all" })).map((player) => [player.id, player.ovr]));
}

function leadershipBadge(player) {
  const role = leadershipRoleLabel(player.leadershipRole);
  const short = leadershipRoleShort(player.leadershipRole);
  if (!role) return "";
  return `<span class="roster-leader-chip ${escapeHTML(player.leadershipRole)}" title="${escapeHTML(role)}">${escapeHTML(short)}</span>`;
}

function renderRoster(team, ratings = new Map()) {
  const roster = team.roster || [];
  if (!roster.length) return statusMessage("empty", "Roster has not been published yet.");
  return `
    <ul class="roster-list team-profile-roster">
      ${roster
        .map(
          (player) => `
            <li>
              <a href="./player.html?id=${escapeHTML(player.id)}">${leadershipBadge(player)}${player.jersey ? `<span class="roster-jersey">#${escapeHTML(player.jersey)}</span>` : ""}${escapeHTML(player.name)}</a>
              <span class="roster-ovr-chip">${escapeHTML(ratings.get(player.id) ? `OVR ${ratings.get(player.id)}` : player.position || "Field")}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function sortTeamLeaders(players, key) {
  return [...players]
    .filter((player) => Number(player[key]) > 0)
    .sort(
      (a, b) =>
        Number(b[key]) - Number(a[key]) ||
        b.points - a.points ||
        b.goals - a.goals ||
        b.assists - a.assists ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 5);
}

function renderTeamLeaderList(title, key, statLabel, players) {
  const leaders = sortTeamLeaders(players, key);
  return `
    <article class="card team-stat-leader-card">
      <div class="team-stat-leader-head">
        <span class="eyebrow">${escapeHTML(statLabel)}</span>
        <h3>${escapeHTML(title)}</h3>
      </div>
      ${
        leaders.length
          ? `<div class="team-stat-leader-list">
              ${leaders
                .map(
                  (player, index) => `
                    <a class="team-stat-leader-row" href="./player.html?id=${escapeHTML(player.id)}">
                      <span class="rank-badge">${index + 1}</span>
                      <strong>${escapeHTML(player.name)}</strong>
                      <span><b>${Number(player[key]) || 0}</b><small>${escapeHTML(statLabel)}</small></span>
                    </a>
                  `
                )
                .join("")}
            </div>`
          : statusMessage("empty", `No ${statLabel.toLowerCase()} listed for this team yet.`)
      }
    </article>
  `;
}

function renderTeamStatLeaders(players) {
  return `
    <div class="team-stat-leader-grid">
      ${renderTeamLeaderList("Goal Leaders", "goals", "Goals", players)}
      ${renderTeamLeaderList("Assist Leaders", "assists", "Assists", players)}
    </div>
  `;
}

function rosterRatingSummary(roster = [], ratings = new Map()) {
  const rated = roster
    .map((player) => ({ ...player, ovr: Number(ratings.get(player.id)) || 0 }))
    .filter((player) => player.ovr > 0)
    .sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
  return {
    average: rated.length ? Math.round(rated.reduce((sum, player) => sum + player.ovr, 0) / rated.length) : "N/A",
    top: rated[0],
    ratedCount: rated.length,
  };
}

function renderClubSnapshot(team, players, ratings) {
  const roster = team.roster || [];
  const ratingSummary = rosterRatingSummary(roster, ratings);
  const topScorer = players.find((player) => Number(player.goals) > 0);
  const topPoints = players.find((player) => Number(player.points) > 0);
  const topAssister = sortTeamLeaders(players, "assists")[0];
  const moves = roster.filter((player) => player.tradeNote || player.previousTeamId).length;

  return `
    <article class="card team-overview-card team-club-card">
      <span class="eyebrow">Club Snapshot</span>
      <h3>Team Identity</h3>
      <div class="team-club-metrics">
        <div>
          <span>Roster</span>
          <strong>${roster.length}</strong>
        </div>
        <div>
          <span>Avg OVR</span>
          <strong>${escapeHTML(ratingSummary.average)}</strong>
        </div>
        <div>
          <span>Top Rated</span>
          <strong>${escapeHTML(ratingSummary.top?.name || "N/A")}</strong>
        </div>
        <div>
          <span>Roster Moves</span>
          <strong>${moves}</strong>
        </div>
      </div>
      <div class="team-mini-leaders">
        <div>
          <span>Goals Leader</span>
          <strong>${escapeHTML(topScorer ? `${topScorer.name} (${topScorer.goals})` : "N/A")}</strong>
        </div>
        <div>
          <span>Points Leader</span>
          <strong>${escapeHTML(topPoints ? `${topPoints.name} (${topPoints.points})` : "N/A")}</strong>
        </div>
        <div>
          <span>Assist Leader</span>
          <strong>${escapeHTML(topAssister ? `${topAssister.name} (${topAssister.assists})` : "N/A")}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderRosterMoves(team) {
  const moves = (team.roster || []).filter((player) => player.tradeNote || player.previousTeamId);
  return `
    <article class="card team-overview-card team-move-card">
      <span class="eyebrow">Roster Movement</span>
      <h3>Trades and Changes</h3>
      ${
        moves.length
          ? `<div class="team-move-list">
              ${moves
                .slice(0, 4)
                .map(
                  (player) => `
                    <a href="./player.html?id=${escapeHTML(player.id)}">
                      <strong>${escapeHTML(player.name)}</strong>
                      <span>${escapeHTML(player.tradeNote || `Moved from ${player.previousTeamName || "previous team"}.`)}</span>
                    </a>
                  `
                )
                .join("")}
            </div>`
          : `<p>No roster moves are listed for this season.</p>`
      }
    </article>
  `;
}

function renderProfileNav() {
  const items = [
    ["overview", "Overview"],
    ["roster", "Roster"],
    ["stats", "Stats"],
    ["schedule", "Schedule"],
  ];
  return `
    <nav class="team-profile-nav" aria-label="Team profile sections">
      ${items
        .map(
          ([id, label], index) => `
            <button class="${index === 0 ? "is-active" : ""}" type="button" data-team-section="${escapeHTML(id)}">
              ${escapeHTML(label)}
            </button>
          `
        )
        .join("")}
    </nav>
  `;
}

function setupProfilePanels() {
  const tabs = [...root.querySelectorAll("[data-team-section]")];
  const panels = [...root.querySelectorAll("[data-team-panel]")];
  if (!tabs.length || !panels.length) return;

  const showPanel = (target) => {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.teamSection === target;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.teamPanel !== target;
    });
  };

  tabs.forEach((tab) => {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(tab.classList.contains("is-active")));
    tab.addEventListener("click", () => {
      showPanel(tab.dataset.teamSection);
      history.replaceState(null, "", `#${tab.dataset.teamSection}`);
    });
  });

  const requestedPanel = window.location.hash.replace("#", "");
  const firstPanel = tabs.some((tab) => tab.dataset.teamSection === requestedPanel) ? requestedPanel : "overview";
  showPanel(firstPanel);
}

function recordText(record = {}) {
  return `${record.w || 0}-${record.d || 0}-${record.l || 0}`;
}

function playoffPositionText(row, season) {
  if (!row || row.notStarted) return "Not started";
  if (row.scorePending) return "Score pending";
  if (row.bye) return "Top 2 bye position";
  if (row.playoff) return "In playoff position";
  return String(season) === SITE.defaultSeason ? "Outside playoff line" : "Missed playoffs";
}

function standingMoveText(row) {
  if (!Number.isFinite(row?.rankChange)) return "No previous week";
  if (row.rankChange > 0) return `+${row.rankChange}`;
  if (row.rankChange < 0) return String(row.rankChange);
  return "0";
}

function nextMatchText(data, team, match) {
  if (!match) return "No upcoming match listed";
  const matchData = match.data || data;
  const isHome = match.homeTeamId === team.id;
  const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
  const opponent = (matchData.teams || []).find((item) => item.id === opponentId);
  const side = isHome ? "vs" : "@";
  return `${side} ${opponent?.name || "Opponent TBA"} | ${formatDateWithISO(match.date)} | ${match.time || "Time TBA"}`;
}

function renderTeamStatusGrid(data, team, form, standingRow, nextMatch) {
  return `
    <div class="team-status-grid">
      <article class="team-status-card">
        <span>Last 5</span>
        ${renderFormStrip(form)}
      </article>
      <article class="team-status-card">
        <span>Standing Change</span>
        <strong>${escapeHTML(standingMoveText(standingRow))}</strong>
      </article>
      <article class="team-status-card">
        <span>Playoff Position</span>
        <strong>${escapeHTML(playoffPositionText(standingRow, data.year))}</strong>
      </article>
      <article class="team-status-card next-match-card">
        <span>Next Match</span>
        <strong>${escapeHTML(nextMatchText(data, team, nextMatch))}</strong>
      </article>
    </div>
  `;
}

function renderRecordCard(title, record = {}) {
  return `
    <article class="card team-record-card">
      <div class="team-record-card-head">
        <span class="pill ${title === "Regular Season" ? "green" : ""}">${escapeHTML(title)}</span>
        <strong>${escapeHTML(recordText(record))}</strong>
      </div>
      <div class="stat-grid">
        ${statBox("Games", record.gp || 0)}
        ${statBox("Points", record.pts || 0)}
        ${statBox("Goals For", record.gf || 0)}
        ${statBox("Goal Diff", record.gd > 0 ? `+${record.gd}` : record.gd || 0)}
      </div>
    </article>
  `;
}

function renderTeamMatchRows(data, team, matches) {
  const rows = matches
    .slice(-5)
    .reverse()
    .map((match) => {
      const isHome = match.homeTeamId === team.id;
      const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
      const opponent = (data.teams || []).find((item) => item.id === opponentId);
      const winner = winnerTeamId(match);
      const complete = isCompletedMatch(match);
      const result = !complete ? "Scheduled" : !winner ? "Draw" : winner === team.id ? "Win" : "Loss";
      return `
        <article class="team-form-row">
          <span class="pill ${result === "Win" ? "green" : ""}">${escapeHTML(result)}</span>
          <div>
            <strong>${escapeHTML(opponent?.name || "Opponent TBA")}</strong>
            <p>${escapeHTML(match.label || `Week ${match.week}`)} | ${escapeHTML(match.time || "Time TBA")}</p>
          </div>
          <b>${escapeHTML(complete ? scoreText(match) : "vs")}</b>
        </article>
      `;
    })
    .join("");

  return rows ? `<div class="team-form-list">${rows}</div>` : statusMessage("empty", "No matches are listed yet.");
}

function renderTeamScheduleRows(data, team, matches) {
  if (!matches.length) return statusMessage("empty", "No matches are listed for this team yet.");
  const teams = new Map((data.teams || []).map((item) => [item.id, item]));

  return `
    <div class="team-schedule-list">
      ${matches
        .map((match) => {
          const isHome = match.homeTeamId === team.id;
          const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
          const opponent = teams.get(opponentId);
          const complete = isCompletedMatch(match);
          const winner = winnerTeamId(match);
          const result = !complete ? "Upcoming" : !winner ? "Draw" : winner === team.id ? "Win" : "Loss";
          const score = complete ? scoreText(match) : "vs";
          return `
            <article class="team-schedule-row">
              <div class="team-schedule-date">
                <span>${escapeHTML(match.label || `Week ${match.week}`)}</span>
                <strong>${escapeHTML(formatDateWithISO(match.date))}</strong>
                <small>${escapeHTML(match.time || "Time TBA")}</small>
              </div>
              <div class="team-schedule-main">
                <strong>${escapeHTML(isHome ? "Home" : "Away")}</strong>
                <a href="./team.html?season=${escapeHTML(data.year)}&id=${escapeHTML(opponentId)}">${escapeHTML(opponent?.name || "Opponent TBA")}</a>
                ${match.status && !/^(complete|completed|scheduled)$/i.test(match.status) ? `<small>${escapeHTML(match.status)}</small>` : ""}
              </div>
              <div class="team-schedule-result ${result.toLowerCase()}">
                <span>${escapeHTML(result)}</span>
                <strong>${escapeHTML(score)}</strong>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function findTeamSeason(allData, teamId, preferredSeason) {
  const preferred = allData.find((data) => data.year === preferredSeason && (data.teams || []).some((team) => team.id === teamId));
  if (preferred) return preferred;
  return [...allData].reverse().find((data) => (data.teams || []).some((team) => team.id === teamId));
}

function render(allData) {
  const data = findTeamSeason(allData, requestedTeamId, state.season);
  if (!requestedTeamId || !data) {
    setDocumentTitle("Team Profile");
    root.innerHTML = `<section class="section-panel">${statusMessage("empty", "Team profile not found. Open a team from the Teams page.")}</section>`;
    return;
  }

  state.season = data.year;
  const team = (data.teams || []).find((item) => item.id === requestedTeamId);
  const coach = (data.coaches || []).find((item) => item.id === team.coachId);
  const regular = calculateTeamRecord(data, team.id, { stage: "regular" }) || {};
  const playoffs = calculateTeamRecord(data, team.id, { stage: "playoffs" }) || {};
  const form = calculateTeamForm(data, team.id);
  const standingRow = calculateStandings(data, { division: team.division }).find((row) => row.teamId === team.id);
  const nextMatch = getNextTeamMatch(allData, team.id);
  const ratings = playerRatingMap(allData);
  const players = teamPlayers(data, team.id).map((player) => ({ ...player, ovr: ratings.get(player.id) || 60 }));
  const matches = teamMatches(data, team.id);
  const seasonOptions = SITE.seasons.map((season) => ({ value: season, label: season }));

  setDocumentTitle(team.name);
  root.innerHTML = `
    <section class="section-panel team-profile-hero">
      <div class="team-profile-head">
        ${teamMark(team)}
        <div>
          <span class="eyebrow">${escapeHTML(data.year)} Team Profile</span>
          <h1>${escapeHTML(team.name)}</h1>
          <p>${escapeHTML(team.division)} | Coach: ${coachLink(coach || { id: team.coachId, name: team.coachName })}</p>
          <div class="team-profile-actions">
            <a class="text-link" href="./teams.html">Back to teams</a>
          </div>
        </div>
      </div>
      <div class="controls team-profile-controls">
        ${controlSelect("season", "Season", seasonOptions, state.season)}
      </div>
      ${renderProfileNav()}
      <div class="team-overview-grid" id="overview" data-team-panel="overview">
        <article class="card team-overview-card">
          <span class="eyebrow">Overview</span>
          <h3>${escapeHTML(team.name)}</h3>
          <p>${escapeHTML(team.history || "Team history will be updated as more information is confirmed.")}</p>
        </article>
        <article class="card team-overview-card">
          <span class="eyebrow">Coach</span>
          <h3>${coachLink(coach || { id: team.coachId, name: team.coachName })}</h3>
          <p>${escapeHTML(team.division)} | ${escapeHTML(data.year)} season</p>
        </article>
        ${renderClubSnapshot(team, players, ratings)}
        ${renderRosterMoves(team)}
      </div>
      ${renderTeamStatusGrid(data, team, form, standingRow, nextMatch)}
    </section>

    <section class="section-panel team-profile-panel" id="roster" data-team-panel="roster" hidden>
      <div class="section-head">
        <div>
          <span class="eyebrow">Roster</span>
          <h2>Players</h2>
          <p>${escapeHTML((team.roster || []).length)} players listed for this team.</p>
        </div>
      </div>
      ${renderRoster(team, ratings)}
    </section>

    <section class="section-panel team-profile-panel" id="stats" data-team-panel="stats" hidden>
      <div class="section-head">
        <div>
          <span class="eyebrow">Stats</span>
          <h2>Season Record</h2>
          <p>Regular season and playoff numbers are kept separate.</p>
        </div>
      </div>
      <div class="team-record-grid">
        ${renderRecordCard("Regular Season", regular)}
        ${renderRecordCard("Playoffs", playoffs)}
      </div>
      <div class="section-head compact-head team-profile-subhead">
        <div>
          <span class="eyebrow">Leaders</span>
          <h2>Team Leaders</h2>
          <p>Goal and assist leaders for this team.</p>
        </div>
      </div>
      ${renderTeamStatLeaders(players)}
    </section>

    <section class="section-panel team-profile-panel" id="schedule" data-team-panel="schedule" hidden>
      <div class="section-head">
        <div>
          <span class="eyebrow">Matches</span>
          <h2>Team Schedule</h2>
          <p>Oldest to latest for ${escapeHTML(data.year)}.</p>
        </div>
      </div>
      ${renderTeamScheduleRows(data, team, matches)}
    </section>
  `;

  document.getElementById("season").addEventListener("change", (event) => {
    state.season = event.target.value;
    render(allData);
  });
  setupProfilePanels();
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading team profile...");
  render(await loadAllSeasons());
}

init();
