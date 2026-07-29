import { renderPlayerCareerTable } from "../components/careerTable.js";
import { renderFormStrip } from "../components/formStrip.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js";
import { buildPlayerCareer, calculatePlayerForm, computeCombinedPlayerStats, getCurrentPlayer, getNextTeamMatch, playerOVR, winnerTeamId } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatDate, getQueryParam, initials, setDocumentTitle, slugify, statusMessage, unique } from "./utils.js";

setupLayout("players.html");

const root = document.getElementById("page-root");
const stageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];
let state = { stage: "all" };

function playerTeamNames(seasons, playerId, fallback = "Team TBA") {
  const teams = seasons
    .flatMap((data) => data.players || [])
    .filter((player) => player.id === playerId)
    .flatMap((player) => [player.previousTeamName, player.teamName])
    .filter(Boolean);
  return [...new Set(teams)].join(" / ") || fallback;
}

function successRate(points, gamesPlayed) {
  return gamesPlayed ? points / gamesPlayed : 0;
}

function formatPPG(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function buildSuccessRow(allData, playerId) {
  const regularStats = new Map(computeCombinedPlayerStats(allData, { stage: "regular" }).map((player) => [player.id, player]));
  const playoffStats = new Map(computeCombinedPlayerStats(allData, { stage: "playoffs" }).map((player) => [player.id, player]));
  const player = computeCombinedPlayerStats(allData, { stage: "all" }).find((item) => item.id === playerId);
  if (!player) return null;

  const regular = regularStats.get(player.id) || {};
  const playoffs = playoffStats.get(player.id) || {};
  const regularPoints = (Number(regular.goals) || 0) + (Number(regular.assists) || 0);
  const playoffPoints = (Number(playoffs.goals) || 0) + (Number(playoffs.assists) || 0);
  const regularGP = Number(regular.gamesPlayed) || 0;
  const playoffGP = Number(playoffs.gamesPlayed) || 0;
  const regularSuccess = successRate(regularPoints, regularGP);
  const playoffSuccess = successRate(playoffPoints, playoffGP);

  return {
    id: player.id,
    name: player.name,
    teams: playerTeamNames(allData, player.id, player.teamName),
    regularGP,
    playoffGP,
    regularSuccess,
    playoffSuccess,
    difference: playoffSuccess - regularSuccess,
  };
}

function renderSuccessBar(label, value, maxValue, type) {
  const width = value > 0 && maxValue ? Math.max(4, Math.min(100, (value / maxValue) * 100)) : 0;
  return `
    <div class="success-bar-group">
      <div class="success-bar-label">
        <span>${escapeHTML(label)}</span>
        <strong>${formatPPG(value)}</strong>
      </div>
      <div class="success-bar-track" aria-label="${escapeHTML(label)} points per game ${formatPPG(value)}">
        <span class="success-bar-fill ${escapeHTML(type)}" style="width: ${width}%"></span>
      </div>
    </div>
  `;
}

function renderSuccessComparison(allData, currentPlayerId) {
  const row = buildSuccessRow(allData, currentPlayerId);
  if (!row) return "";
  const maxSuccess = Math.max(row.regularSuccess, row.playoffSuccess, 1);
  const badge = row.difference > 0 ? "Playoff Riser" : "Regular Season Star";
  const badgeClass = row.difference > 0 ? "riser" : "regular";

  return `
    <section class="card success-comparison-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Career Comparison</span>
          <h2>Regular Season vs Playoff Success</h2>
          <p>This compares ${escapeHTML(row.name)}'s points per game in the regular season and playoffs.</p>
        </div>
      </div>
      <div class="success-chart">
        <article class="success-row current single">
          <div class="success-player">
            <span class="success-player-icon">PPG</span>
            <div>
              <h3>${escapeHTML(row.name)}</h3>
              <p>${escapeHTML(row.teams)}</p>
            </div>
          </div>
          <div class="success-bars">
            ${renderSuccessBar(`Regular (${row.regularGP} GP)`, row.regularSuccess, maxSuccess, "regular")}
            ${renderSuccessBar(`Playoffs (${row.playoffGP} GP)`, row.playoffSuccess, maxSuccess, "playoffs")}
          </div>
          <div class="success-result">
            <span class="success-badge ${badgeClass}">${escapeHTML(badge)}</span>
            <strong>${row.difference >= 0 ? "+" : ""}${formatPPG(row.difference)}</strong>
            <small>difference</small>
          </div>
        </article>
      </div>
      <div class="success-explainer">
        <div>
          <span>Regular PPG</span>
          <strong>(Regular goals + regular assists) / regular games</strong>
        </div>
        <div>
          <span>Playoff PPG</span>
          <strong>(Playoff goals + playoff assists) / playoff games</strong>
        </div>
        <div>
          <span>Difference</span>
          <strong>Playoff PPG - regular PPG</strong>
        </div>
        <p>Playoff games are counted from the player's team playoff bracket appearances, even if the player did not score.</p>
      </div>
    </section>
  `;
}

function canonicalTournamentPlayerId(name, aliases = {}) {
  const slug = slugify(name);
  return aliases[slug] || slug;
}

function tournamentTeamName(team) {
  if (team.id === "lantern-of-knowledge-academy") return "Lantern Team";
  return team.name || "Tournament Team";
}

function tournamentMatches(tournament = {}) {
  return [
    ...(tournament.matches || []),
    ...(tournament.playoffs?.rounds || []).flatMap((round) => round.matches || []),
  ];
}

function tournamentTeamRecord(tournament, teamId) {
  return tournamentMatches(tournament).reduce(
    (record, match) => {
      if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) return record;
      if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return record;

      const isHome = match.homeTeamId === teamId;
      const gf = isHome ? match.homeScore : match.awayScore;
      const ga = isHome ? match.awayScore : match.homeScore;
      const winner = winnerTeamId(match);

      record.gamesPlayed += 1;
      record.goalsFor += gf;
      record.goalsAgainst += ga;
      if (!winner) {
        record.ties += 1;
        record.points += 1;
      } else if (winner === teamId) {
        record.wins += 1;
        record.points += 3;
      } else {
        record.losses += 1;
      }
      return record;
    },
    { gamesPlayed: 0, wins: 0, ties: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  );
}

function eventPlayerId(event, aliases = {}) {
  const name = typeof event === "string" ? event : event?.name || "";
  const id = typeof event === "object" ? event.playerId || "" : "";
  return aliases[id] || aliases[slugify(name)] || id || slugify(name);
}

function eventStatCount(event, key) {
  if (typeof event === "string") return 1;
  const value = Number(event?.[key]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function tournamentPlayerPoints(tournament, playerId, aliases) {
  return tournamentMatches(tournament).reduce(
    (stats, match) => {
      (match.scorers || match.goalscorers || []).forEach((event) => {
        if (eventPlayerId(event, aliases) === playerId) stats.goals += eventStatCount(event, "goals");
      });
      (match.assists || []).forEach((event) => {
        if (eventPlayerId(event, aliases) === playerId) stats.assists += eventStatCount(event, "assists");
      });
      return stats;
    },
    { goals: 0, assists: 0 }
  );
}

function buildInterMadrasahRows(allData, playerId, aliases) {
  return allData
    .flatMap((data) => {
      const tournament = data.tournament;
      if (!tournament?.divisions?.length) return [];

      return tournament.divisions.flatMap((division) =>
        (division.teams || [])
          .filter((team) => (team.roster || []).some((name) => canonicalTournamentPlayerId(name, aliases) === playerId))
          .map((team) => {
            const record = tournamentTeamRecord(tournament, team.id);
            const playerStats = tournamentPlayerPoints(tournament, playerId, aliases);
            return {
              year: data.year,
              eventName: tournament.event?.name || "Inter-Madrasah Soccer Tournament",
              divisionName: division.name || "Inter-Madrasah",
              teamName: tournamentTeamName(team),
              officialTeamName: team.name || tournamentTeamName(team),
              playerGoals: playerStats.goals,
              playerAssists: playerStats.assists,
              playerPoints: playerStats.goals + playerStats.assists,
              ...record,
              goalDifference: record.goalsFor - record.goalsAgainst,
            };
          })
      );
    })
    .sort((a, b) => Number(b.year) - Number(a.year) || a.teamName.localeCompare(b.teamName));
}

function renderInterMadrasahSection(allData, playerId, aliases) {
  const rows = buildInterMadrasahRows(allData, playerId, aliases);
  if (!rows.length) return "";

  return `
    <section class="card inter-profile-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Inter-Madrasah</span>
          <h2>Tournament Stats</h2>
          <p>Tournament roster appearances are shown separately from LSL league totals.</p>
        </div>
      </div>
      <div class="inter-profile-list">
        ${rows
          .map(
            (row) => `
              <article class="inter-profile-row">
                <div class="inter-profile-copy">
                  <span class="pill">${escapeHTML(row.year)}</span>
                  <h3>Played for ${escapeHTML(row.teamName)} (Inter-Madrasah) in ${escapeHTML(row.year)}.</h3>
                  <p>${escapeHTML(row.eventName)} | ${escapeHTML(row.divisionName)}${row.officialTeamName !== row.teamName ? ` | ${escapeHTML(row.officialTeamName)}` : ""}</p>
                </div>
                <div class="inter-profile-stats" aria-label="Tournament team record">
                  <span><strong>${row.gamesPlayed}</strong><small>GP</small></span>
                  <span><strong>${row.wins}-${row.ties}-${row.losses}</strong><small>W-D-L</small></span>
                  <span><strong>${row.playerPoints}</strong><small>Player PTS</small></span>
                  <span><strong>${row.goalsFor}</strong><small>GF</small></span>
                  <span><strong>${row.goalsAgainst}</strong><small>GA</small></span>
                  <span><strong>${row.goalDifference >= 0 ? "+" : ""}${row.goalDifference}</strong><small>GD</small></span>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProfileHeader(profile, current, ovr) {
  const avatar = profile.photo
    ? `<img class="official-profile-photo" src="${escapeHTML(profile.photo)}" alt="${escapeHTML(profile.name)}">`
    : `<div class="official-profile-photo placeholder" aria-hidden="true">${escapeHTML(initials(profile.name))}</div>`;
  return `
    <section class="official-profile-header">
      ${avatar}
      <div class="official-profile-identity">
        <span class="eyebrow">Player Profile</span>
        <h1>${escapeHTML(profile.name)}</h1>
        <p>${escapeHTML(current?.division || profile.division || "Division TBA")} | ${escapeHTML(current?.position || profile.position || "Position TBA")}</p>
      </div>
      <div class="official-profile-ovr-card" title="Overall rating based on career stats">
        <span>OVR</span>
        <strong>${escapeHTML(ovr)}</strong>
      </div>
      <div class="official-profile-actions">
        <a class="button secondary" href="./players.html">Back To Stats</a>
      </div>
    </section>
  `;
}

function renderMainStatsRow(total) {
  const stats = [
    { label: "Games", value: total.gamesPlayed || 0 },
    { label: "Goals", value: total.goals || 0 },
    { label: "Points", value: total.points || 0 },
    { label: "Shots", value: total.shots || 0 },
  ];

  return `
    <section class="official-main-stats" aria-label="Main player stats">
      ${stats
        .map(
          (stat) => `
            <article class="official-stat-card">
              <span>${escapeHTML(stat.label)}</span>
              <strong>${escapeHTML(stat.value)}</strong>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function seasonsPlayed(careerRows = []) {
  return unique(careerRows.map((row) => row.year)).sort((a, b) => Number(b) - Number(a));
}

function renderPlayerInfoSection(profile, careerRows) {
  const achievements = unique([...(profile.achievements || []), ...careerRows.flatMap((row) => row.achievements || [])]);
  const seasons = seasonsPlayed(careerRows);

  return `
    <section class="card official-info-card">
      <div class="official-achievements-box">
        <span class="eyebrow">Achievements</span>
        <p>${escapeHTML(achievements.join(", ") || "None listed yet")}</p>
      </div>
      <div class="official-seasons-strip">
        <span>Seasons Played</span>
        <div>
          ${
            seasons.length
              ? seasons.map((season) => `<strong>${escapeHTML(season)}</strong>`).join("")
              : `<strong>TBA</strong>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderNextMatchCard(allData, current) {
  if (!current?.teamId) return "";
  const match = getNextTeamMatch(allData, current.teamId);
  if (!match) return "";
  const data = match.data || allData.find((season) => season.year === match.season) || {};
  const isHome = match.homeTeamId === current.teamId;
  const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
  const opponent = (data.teams || []).find((team) => team.id === opponentId);
  return `
    <section class="card profile-next-match-card next-match-card">
      <span class="eyebrow">Next Match</span>
      <h2>${escapeHTML(isHome ? "vs" : "@")} ${escapeHTML(opponent?.name || "Opponent TBA")}</h2>
      <p>${escapeHTML(current.teamName || "Current team")} | ${escapeHTML(formatDate(match.date))} | ${escapeHTML(match.time || "Time TBA")}</p>
    </section>
  `;
}

function renderCareerSection(career, stageLabel, form) {
  return `
    <section class="card official-career-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Career Table</span>
          <h2>${escapeHTML(stageLabel)}</h2>
          <p>Choose a stats type, scan recent form, then read season-by-season totals.</p>
        </div>
      </div>
      <div class="official-filter-body career-filter-body">
        <div class="official-filter-control">
          ${controlSelect("stage", "Stats Type", stageOptions, state.stage)}
        </div>
        <div class="official-last-five-card">
          ${renderFormStrip(form)}
        </div>
      </div>
      ${renderPlayerCareerTable(career)}
    </section>
  `;
}

function seasonProductivitySort(a, b) {
  return (
    (Number(b.points) || 0) - (Number(a.points) || 0) ||
    (Number(b.goals) || 0) - (Number(a.goals) || 0) ||
    (Number(b.assists) || 0) - (Number(a.assists) || 0) ||
    (Number(b.shots) || 0) - (Number(a.shots) || 0) ||
    (Number(b.gamesPlayed) || 0) - (Number(a.gamesPlayed) || 0) ||
    Number(b.year) - Number(a.year)
  );
}

function renderSeasonProductionCard(label, row, tone = "") {
  return `
    <article class="productive-season-panel ${escapeHTML(tone)}">
      <div>
        <span class="eyebrow">${escapeHTML(label)}</span>
        <h3>${escapeHTML(row.year)} | ${escapeHTML(row.team)}</h3>
      </div>
      <div class="productive-season-stats">
        <span><strong>${row.points || 0}</strong><small>PTS</small></span>
        <span><strong>${row.goals || 0}</strong><small>Goals</small></span>
        <span><strong>${row.assists || 0}</strong><small>Assists</small></span>
        <span><strong>${row.shots || 0}</strong><small>Shots</small></span>
        <span><strong>${row.gamesPlayed || 0}</strong><small>Games</small></span>
      </div>
    </article>
  `;
}

function renderSeasonProductionSection(careerRows, stageLabel) {
  const seasons = (careerRows || []).filter((row) => row?.year);
  if (unique(seasons.map((row) => row.year)).length < 2) return "";

  const sorted = [...seasons].sort(seasonProductivitySort);
  const most = sorted[0];
  const least = sorted.at(-1);

  return `
    <section class="card productive-season-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Season Comparison</span>
          <h2>Most and Least Productive</h2>
          <p>Based on ${escapeHTML(stageLabel)} points first, then goals, assists, shots, and games.</p>
        </div>
      </div>
      <div class="productive-season-grid">
        ${renderSeasonProductionCard("Most Productive", most, "best")}
        ${renderSeasonProductionCard("Least Productive", least, "low")}
      </div>
    </section>
  `;
}

function renderPlayerDetailSections(allData, playerId, profile) {
  const regular = computeCombinedPlayerStats(allData, { stage: "regular" }).find((player) => player.id === playerId) || {};
  const playoffs = computeCombinedPlayerStats(allData, { stage: "playoffs" }).find((player) => player.id === playerId) || {};
  const careerRows = buildPlayerCareer(allData, playerId, { stage: "all" });
  const bestSeason = [...careerRows].sort((a, b) => b.points - a.points || b.goals - a.goals || b.gamesPlayed - a.gamesPlayed)[0];
  const teamHistory = unique(careerRows.map((row) => `${row.year}: ${row.team}`));
  const achievements = unique([...(profile.achievements || []), ...careerRows.flatMap((row) => row.achievements || [])]);

  return `
    <section class="player-detail-panels">
      <article class="card player-detail-card">
        <div class="player-detail-card-head">
          <span class="eyebrow">Player Summary</span>
        </div>
        ${
          bestSeason
            ? `
              <h3>Best season: ${escapeHTML(bestSeason.year)} | ${escapeHTML(bestSeason.team)}</h3>
              <div class="mini-stat-row">
                <span>${bestSeason.points} pts</span>
                <span>${bestSeason.goals} goals</span>
                <span>${bestSeason.shots} shots</span>
                <span>${bestSeason.assists} assists</span>
                <span>${bestSeason.gamesPlayed} games</span>
              </div>
            `
            : `<p>No season totals found yet.</p>`
        }
      </article>
      <article class="card player-detail-card">
        <div class="player-detail-card-head">
          <span class="eyebrow">Team History</span>
        </div>
        <h3>${escapeHTML(teamHistory.join(" / ") || "Team history TBA")}</h3>
        <div class="mini-stat-row">
          <span>${regular.points || 0} regular pts</span>
          <span>${playoffs.points || 0} playoff pts</span>
          <span>${playoffs.gamesPlayed || 0} playoff games</span>
        </div>
      </article>
      <article class="card player-detail-card">
        <div class="player-detail-card-head">
          <span class="eyebrow">Awards / Notes</span>
        </div>
        <h3>${escapeHTML(achievements.length ? "Listed notes" : "No awards listed yet")}</h3>
        <p>${escapeHTML(achievements.join(", ") || "No awards or notes listed yet.")}</p>
      </article>
    </section>
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading player profile...");
  const requestedId = getQueryParam("id");
  const aliases = await loadJSON("./data/player-aliases.json", {});
  const id = aliases[requestedId] || requestedId;
  const allData = await loadAllSeasons();
  const current = getCurrentPlayer(allData, id);
  const profile = computeCombinedPlayerStats(allData).find((player) => player.id === id);

  if (!id || !profile) {
    setDocumentTitle("Player Profile");
    root.innerHTML = `<section class="section-panel">${statusMessage("empty", "Player profile not found. Check the player ID in the URL.")}</section>`;
    return;
  }

  function render() {
    const total = computeCombinedPlayerStats(allData, { stage: state.stage }).find((player) => player.id === id) || profile;
    const career = buildPlayerCareer(allData, id, { stage: state.stage });
    const careerAll = buildPlayerCareer(allData, id, { stage: "all" });
    const stageLabel = stageOptions.find((option) => option.value === state.stage)?.label || "All Games";
    const ovr = playerOVR(profile, computeCombinedPlayerStats(allData, { stage: "all" }));
    const form = calculatePlayerForm(allData, id, { stage: state.stage });

    setDocumentTitle(profile.name);
    root.innerHTML = `
      <section class="official-player-profile">
        ${renderProfileHeader(profile, current, ovr)}
        ${renderMainStatsRow(total)}
        ${renderPlayerInfoSection(profile, careerAll)}
        ${renderNextMatchCard(allData, current)}
        ${renderCareerSection(career, stageLabel, form)}
        ${renderSeasonProductionSection(career, stageLabel)}
        ${renderInterMadrasahSection(allData, id, aliases)}
        ${renderSuccessComparison(allData, id)}
        ${renderPlayerDetailSections(allData, id, profile)}
      </section>
    `;

    document.getElementById("stage").addEventListener("change", (event) => {
      state.stage = event.target.value;
      render();
    });
  }

  render();
}

init();
