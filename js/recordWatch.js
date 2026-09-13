import { calculateTeamRecord, computeCombinedPlayerStats } from "./leagueEngine.js?v=3.12";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("record-watch.html");
setDocumentTitle("Record Watch");

const root = document.getElementById("page-root");

function playerMetricRows(players, key, minimumGames = 1) {
  return players
    .filter((player) => (Number(player.gamesPlayed) || 0) >= minimumGames && Number.isFinite(Number(player[key])))
    .map((player) => ({
      name: player.name,
      value: Number(player[key]),
      sub: `${player.gamesPlayed} GP | ${player.wins}-${player.ties}-${player.losses}`,
      href: `./player.html?id=${encodeURIComponent(player.id)}`,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function teamMetricRows(rows, key) {
  return rows
    .filter((row) => (Number(row.gp) || 0) > 0 && Number.isFinite(Number(row[key])))
    .map((row) => ({
      name: row.teamName,
      value: Number(row[key]),
      sub: `${row.season} ${row.division} | ${row.w}-${row.d}-${row.l}`,
      href: `./team.html?season=${encodeURIComponent(row.season)}&id=${encodeURIComponent(row.teamId)}`,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function formatValue(value, unit = "") {
  const shown = Number.isInteger(value) ? value : value.toFixed(2);
  return `${shown}${unit ? ` ${unit}` : ""}`;
}

function watchCard(metric, rows) {
  const leader = rows[0];
  const challenger = rows.find((row) => row.value < leader?.value) || rows[1];
  if (!leader) return `<article class="archive-card watch-card"><span class="eyebrow">${escapeHTML(metric.label)}</span><h3>No record data yet</h3><p>More completed matches are needed before this watch can open.</p></article>`;
  const gap = challenger ? Math.max(0, leader.value - challenger.value) : 0;
  const note = !challenger
    ? "Only one qualifying mark is currently listed."
    : gap === 0
      ? "The record is currently tied."
      : `${formatValue(gap)} away from the current mark.`;
  return `
    <article class="archive-card watch-card">
      <div class="watch-card-head"><span>${escapeHTML(metric.label)}</span><span>${escapeHTML(metric.scope)}</span></div>
      <h3>${escapeHTML(leader.name)}</h3>
      <strong class="archive-value">${escapeHTML(formatValue(leader.value, metric.unit))}</strong>
      <p class="watch-card-note">Current record | ${escapeHTML(leader.sub)}</p>
      <div class="watch-card-footer">
        <small>${escapeHTML(challenger ? `Closest: ${challenger.name} at ${formatValue(challenger.value, metric.unit)}. ${note}` : note)}</small>
        <a class="button secondary" href="${escapeHTML(leader.href)}">Open</a>
      </div>
    </article>
  `;
}

function buildTeamRows(allData) {
  return allData.flatMap((data) => (data.teams || []).map((team) => ({
    season: data.year,
    division: team.division || "Division TBA",
    teamId: team.id,
    teamName: team.shortName || team.abbreviation || team.name,
    ...calculateTeamRecord(data, team.id, { stage: "regular" }),
  })));
}

function render(allData) {
  const players = computeCombinedPlayerStats(allData, { stage: "all" });
  const teamRows = buildTeamRows(allData);
  const playerMetrics = [
    { label: "Career Goals", scope: "Players", key: "goals", unit: "goals", min: 1 },
    { label: "Career Wins", scope: "Players", key: "wins", unit: "wins", min: 1 },
    { label: "Career Games Played", scope: "Players", key: "gamesPlayed", unit: "games", min: 1 },
    { label: "Goals-Per-Game Rate", scope: "Players", key: "goalsPerGame", unit: "G/G", min: 3 },
  ];
  const playerRows = players.map((player) => ({ ...player, goalsPerGame: player.gamesPlayed ? player.goals / player.gamesPlayed : 0 }));
  const teamMetrics = [
    { label: "Best Regular Season", scope: "Teams", key: "pts", unit: "pts" },
    { label: "Most Goals For", scope: "Teams", key: "gf", unit: "goals" },
    { label: "Best Goal Difference", scope: "Teams", key: "gd", unit: "GD" },
  ];

  root.innerHTML = `
    <section class="section-panel archive-hero">
      <div>
        <span class="eyebrow">LSL Record Book</span>
        <h1>Record Watch</h1>
        <p>See who currently owns the biggest marks and which players or teams are closest to catching them.</p>
        <div class="button-row"><a class="button primary" href="./records.html">Open Records</a><a class="button" href="./lsl-timeline.html">League Timeline</a></div>
      </div>
      <div class="archive-hero-mark" aria-hidden="true">WATCH</div>
    </section>
    <section class="section-panel archive-section">
      <div class="archive-section-head"><div><span class="eyebrow">Player Records</span><h2>Who is closest?</h2><p>Career totals combine every listed LSL season.</p></div></div>
      <div class="archive-grid">${playerMetrics.map((metric) => watchCard(metric, playerMetricRows(playerRows, metric.key, metric.min))).join("")}</div>
    </section>
    <section class="section-panel archive-section">
      <div class="archive-section-head"><div><span class="eyebrow">Team Records</span><h2>Season marks under pressure</h2><p>Regular-season team records are shown with their season and division.</p></div></div>
      <div class="archive-grid">${teamMetrics.map((metric) => watchCard(metric, teamMetricRows(teamRows, metric.key))).join("")}</div>
    </section>
  `;
}

async function init() {
  root.innerHTML = `<section class="section-panel">${statusMessage("loading", "Loading record watch...")}</section>`;
  try {
    render(await loadAllSeasons());
  } catch (error) {
    console.error("Could not load record watch", error);
    root.innerHTML = `<section class="section-panel">${statusMessage("error", "Record Watch is temporarily unavailable. Please try again soon.")}</section>`;
  }
}

init();
