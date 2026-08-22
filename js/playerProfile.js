import { renderPlayerCareerTable } from "../components/careerTable.js";
import { renderFormStrip } from "../components/formStrip.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { buildPlayerCareer, calculatePlayerForm, computeCombinedPlayerStats, computePlayerVsTeamStatsBySeason, getCurrentPlayer, getNextTeamMatch, playerOVR, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatDate, getQueryParam, initials, setDocumentTitle, slugify, statusMessage, unique } from "./utils.js";

setupLayout("players.html");

const root = document.getElementById("page-root");
const stageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];
let state = { stage: "all", vsStage: "all", vsYear: "" };

const vsStageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];

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
        <p>${escapeHTML(current?.division || profile.division || "Division TBA")} | ${escapeHTML(current?.position || profile.position || "Position TBA")}${(current?.jersey || profile.jersey) ? ` | #${escapeHTML(current?.jersey || profile.jersey)}` : ""}</p>
      </div>
      <div class="official-profile-ovr-card" title="Overall rating based on career stats">
        <span>OVR</span>
        <strong>${escapeHTML(ovr)}</strong>
      </div>
      <div class="official-profile-actions">
        <a class="button secondary" href="./players.html">Back To Stats</a>
      </div>
    </section>
    <nav class="team-profile-nav player-jump-nav" aria-label="Jump to section">
      <a href="#player-overview">Overview</a>
      <a href="#player-career">Career</a>
      <a href="#player-matchups">Matchups</a>
      <a href="#player-more">More</a>
    </nav>
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
    <section class="official-main-stats" id="player-overview" aria-label="Main player stats">
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
    <section class="card official-career-card" id="player-career">
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
    <section class="player-detail-panels" id="player-more">
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

function vsYearOptions(allData, playerId) {
  const allRows = computePlayerVsTeamStatsBySeason(allData, playerId, { stage: "all" });
  const years = unique(allRows.map((row) => row.year)).sort((a, b) => Number(b) - Number(a));
  return years.map((year) => ({ value: year, label: year }));
}

function meetingBadge(game) {
  const cls = game.result === "W" ? "win" : game.result === "D" ? "draw" : "loss";
  const detailBits = [formatDate(game.date), game.result];
  if (game.goals) detailBits.push(`${game.goals} goal${game.goals === 1 ? "" : "s"}`);
  if (game.assists) detailBits.push(`${game.assists} assist${game.assists === 1 ? "" : "s"}`);
  return `<span class="form-badge mini ${cls}" title="${escapeHTML(detailBits.join(" - "))}">${escapeHTML(game.result)}</span>`;
}

function renderVsOpponentSection(allData, playerId, viewState) {
  const allRows = computePlayerVsTeamStatsBySeason(allData, playerId, { stage: "all" });
  if (!allRows.length) return "";

  const careerByYear = new Map(buildPlayerCareer(allData, playerId, { stage: "all" }).map((row) => [row.year, row]));
  const wasTraded = [...careerByYear.values()].some((row) => String(row.team || "").includes(" / "));

  const yearOptions = vsYearOptions(allData, playerId);
  let seasonRows = computePlayerVsTeamStatsBySeason(allData, playerId, { stage: viewState.vsStage });
  const activeYear = viewState.vsYear || yearOptions[0]?.value || "";
  seasonRows = seasonRows.filter((row) => row.year === activeYear);

  return `
    <section class="card vs-opponent-card" id="player-matchups">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Matchups</span>
          <h2>Stats vs Opponent</h2>
          <p>Games played, record, goals, and assists against each opponent. Use the season and stats-type dropdowns to switch between individual years, regular season, playoffs, or all games. When this player faced the same team more than once in a season, each meeting shows as its own small W/D/L badge next to the games played total — hover a badge to see that game's date and stats.${
            wasTraded
              ? " This player was traded during at least one season shown below — the season played for lists every team they suited up for, and opponent totals only count games actually played for that roster, so a former team will not show up as an opponent for games played while still on that team."
              : ""
          }</p>
        </div>
      </div>
      <div class="official-filter-body vs-opponent-filter-body">
        <div class="official-filter-control">
          ${controlSelect("vs-year", "Season", yearOptions, activeYear)}
        </div>
        <div class="official-filter-control">
          ${controlSelect("vs-stage", "Stats Type", vsStageOptions, viewState.vsStage)}
        </div>
      </div>
      ${
        seasonRows.length
          ? seasonRows
              .map(
                (season) => `
                  <div class="vs-opponent-season-info">
                    <span class="eyebrow">${escapeHTML(season.year)}</span>
                    <p class="source-note">${escapeHTML(careerByYear.get(season.year)?.team || "Team TBA")} | ${season.opponents.length} opponent${season.opponents.length === 1 ? "" : "s"}</p>
                  </div>
                  <div class="table-wrap player-career-wrap">
                    <table class="data-table player-career-table vs-opponent-table">
                      <colgroup>
                        <col class="vs-opponent-col-team">
                        <col class="vs-opponent-col-stat">
                        <col class="vs-opponent-col-stat">
                        <col class="vs-opponent-col-stat">
                        <col class="vs-opponent-col-stat">
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Opponent</th>
                          <th class="num">GP</th>
                          <th class="num">W-D-L</th>
                          <th class="num">Goals</th>
                          <th class="num">Assists</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${season.opponents
                          .map(
                            (row) => `
                              <tr>
                                <td><a class="team-name" href="./team.html?id=${encodeURIComponent(row.teamId)}">${escapeHTML(row.teamName)}</a></td>
                                <td class="num">
                                  <span class="vs-gp-value">${row.gp}</span>
                                  ${row.gp > 1 ? `<span class="vs-meetings">${row.games.map((game) => meetingBadge(game)).join("")}</span>` : ""}
                                </td>
                                <td class="num">${row.wins}-${row.draws}-${row.losses}</td>
                                <td class="num">${row.goals}</td>
                                <td class="num">${row.assists}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `
              )
              .join("")
          : statusMessage("empty", "No matchups found for the selected season and stats type.")
      }
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
        ${renderVsOpponentSection(allData, id, state)}
        ${renderInterMadrasahSection(allData, id, aliases)}
        ${renderPlayerDetailSections(allData, id, profile)}
      </section>
    `;

    document.getElementById("stage").addEventListener("change", (event) => {
      state.stage = event.target.value;
      render();
    });

    document.getElementById("vs-year")?.addEventListener("change", (event) => {
      state.vsYear = event.target.value;
      render();
    });

    document.getElementById("vs-stage")?.addEventListener("change", (event) => {
      state.vsStage = event.target.value;
      render();
    });
  }

  render();
}

init();
