import { loadAllSeasons, loadJSON } from "./dataLoader.js";
import { setupLayout } from "./main.js";
import { escapeHTML, initials, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("best-all-time-team.html");
setDocumentTitle("Best All-Time Team");

const root = document.getElementById("page-root");
const state = { view: "all-time" };

const viewOptions = [
  { value: "all-time", label: "All-Time" },
  { value: "2024", label: "2024" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
];

function playerHref(playerId = "") {
  return playerId ? `./player.html?id=${encodeURIComponent(playerId)}` : "./players.html";
}

function coachHref(coachId = "") {
  return coachId ? `./coach.html?id=${encodeURIComponent(coachId)}` : "./coaches.html";
}

function buildLookups(seasons = []) {
  const teams = new Map();
  const players = new Map();

  seasons.forEach((season) => {
    (season.teams || []).forEach((team) => {
      teams.set(team.id, team);
    });
    (season.players || []).forEach((player) => {
      players.set(player.id, player);
    });
  });

  return { teams, players };
}

function playerAvatar(player, storedPlayer) {
  const image = player.image || storedPlayer?.image || "";
  if (image) {
    return `<img src="${escapeHTML(image)}" alt="${escapeHTML(player.name)}">`;
  }
  return `<span>${escapeHTML(initials(player.name, 2))}</span>`;
}

function teamBadge(player, teams) {
  const team = teams.get(player.teamId) || {};
  const logo = player.teamLogo || team.logo || "";
  const label = player.teamName || team.name || "Team";
  const shortName = team.shortName || initials(label, 2);
  const bg = team.logoBg || "#113c1f";

  if (logo) {
    return `
      <span class="best-team-badge" title="${escapeHTML(label)}" style="--badge-bg: ${escapeHTML(bg)}">
        <img src="${escapeHTML(logo)}" alt="${escapeHTML(label)} logo">
      </span>
    `;
  }

  return `
    <span class="best-team-badge text" title="${escapeHTML(label)}" style="--badge-bg: ${escapeHTML(bg)}">
      ${escapeHTML(shortName)}
    </span>
  `;
}

function renderPlayer(player, lookups) {
  const storedPlayer = lookups.players.get(player.id);
  const x = Number.isFinite(Number(player.x)) ? Number(player.x) : 50;
  const y = Number.isFinite(Number(player.y)) ? Number(player.y) : 50;

  return `
    <a class="formation-player" href="${escapeHTML(playerHref(player.id))}" style="--x:${x}%; --y:${y}%;" aria-label="${escapeHTML(player.name)} profile">
      <span class="formation-slot">${escapeHTML(player.slot || "")}</span>
      <span class="formation-avatar">
        ${playerAvatar(player, storedPlayer)}
        ${teamBadge(player, lookups.teams)}
      </span>
      <strong>${escapeHTML(player.name)}</strong>
    </a>
  `;
}

function renderPitch(lineup, lookups) {
  return `
    <section class="section-panel best-team-main-card">
      <div class="best-team-pitch-head">
        <div>
          <span class="eyebrow">${escapeHTML(lineup.seasonLabel || lineup.label || "All-Time")}</span>
          <h2>${escapeHTML(lineup.formationName || "Best XI")}</h2>
        </div>
        <span class="best-formation-pill">Formation: ${escapeHTML(lineup.formation || "TBA")}</span>
      </div>
      <div class="best-team-pitch-wrap">
        <div class="best-team-pitch" aria-label="${escapeHTML(lineup.formationName || "Best all-time team formation")}">
          <div class="pitch-lines" aria-hidden="true">
            <span class="pitch-half"></span>
            <span class="pitch-circle"></span>
            <span class="pitch-box top"></span>
            <span class="pitch-box bottom"></span>
            <span class="pitch-goal top"></span>
            <span class="pitch-goal bottom"></span>
          </div>
          ${(lineup.players || []).map((player) => renderPlayer(player, lookups)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderBench(bench = []) {
  if (!bench.length) return `<p class="muted-text">No bench listed yet.</p>`;
  return `
    <div class="best-bench-list">
      ${bench
        .map(
          (player) => `
            <a href="${escapeHTML(playerHref(player.id))}" class="best-bench-pill">
              <strong>${escapeHTML(player.name)}</strong>
              <span>${escapeHTML(player.teamName || "Team TBA")}</span>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCoach(coach = {}) {
  return `
    <a class="best-coach-card" href="${escapeHTML(coachHref(coach.id))}">
      <span class="pill green">Coach</span>
      <strong>${escapeHTML(coach.name || "Coach TBA")}</strong>
      <small>${escapeHTML(coach.teamName || "Team TBA")}</small>
      <p>${escapeHTML(coach.note || "Coach note coming soon.")}</p>
    </a>
  `;
}

function renderAssistantCoaches(assistantCoaches = []) {
  const coaches = assistantCoaches.slice(0, 2);
  if (!coaches.length) return `<p class="muted-text">Assistant coaches are not listed yet.</p>`;

  return `
    <div class="best-assistant-list">
      ${coaches
        .map(
          (coach) => `
            <a class="best-assistant-card" href="${escapeHTML(coachHref(coach.id))}">
              <span class="pill">Assistant</span>
              <strong>${escapeHTML(coach.name || "Coach TBA")}</strong>
              <small>${escapeHTML(coach.teamName || "Team TBA")}</small>
              <p>${escapeHTML(coach.note || "Assistant coach note coming soon.")}</p>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDetails(lineup) {
  return `
    <section class="best-team-detail-grid">
      <article class="section-panel best-detail-card">
        <span class="eyebrow">Formation</span>
        <h2>${escapeHTML(lineup.formation || "TBA")}</h2>
        <p>${escapeHTML(lineup.description || "Lineup description coming soon.")}</p>
      </article>
      <article class="section-panel best-detail-card">
        <span class="eyebrow">Bench</span>
        <h2>Honorable Mentions</h2>
        ${renderBench(lineup.bench || [])}
      </article>
      <article class="section-panel best-detail-card best-coaching-card">
        <span class="eyebrow">Sideline</span>
        <h2>Coach Section</h2>
        <div class="best-coach-grid">
          <div class="best-head-coach-block">
            <h3>Head Coach</h3>
            ${renderCoach(lineup.coach || {})}
          </div>
          <div class="best-assistant-block">
            <h3>2 Assistant Coaches</h3>
            ${renderAssistantCoaches(lineup.assistantCoaches || [])}
          </div>
        </div>
      </article>
      <article class="section-panel best-detail-card why-card">
        <span class="eyebrow">Selection Note</span>
        <h2>Why This Team?</h2>
        <p>${escapeHTML(lineup.why || "This lineup will be updated as more LSL results are confirmed.")}</p>
      </article>
    </section>
  `;
}

function renderPage(data, lookups) {
  const lineups = data.teams || {};
  const lineup = lineups[state.view] || lineups[data.defaultView] || Object.values(lineups)[0];
  if (!lineup) return statusMessage("empty", "Best team selections are coming soon.");

  return `
    <section class="section-panel best-team-hero">
      <div class="section-head">
        <div>
          <span class="eyebrow">Best XI</span>
          <h1>Best All-Time Team</h1>
          <p>Manual LSL lineup boards by year. These picks are editable and are not auto-generated from stats yet.</p>
        </div>
      </div>
    </section>

    <section class="section-panel best-team-filter-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Filters</span>
          <h2>Lineup Year</h2>
          <p>Switch between the all-time team and season-specific best XI boards.</p>
        </div>
      </div>
      <div class="controls best-team-controls">
        <div class="control best-team-year-control">
          <label>Season View</label>
          <div class="all-time-toggle season best-team-year-toggle" role="group" aria-label="Best all-time team year">
            ${viewOptions
              .map(
                (option) =>
                  `<button class="${option.value === state.view ? "active" : ""}" type="button" data-best-team-view="${escapeHTML(option.value)}">${escapeHTML(option.label)}</button>`
              )
              .join("")}
          </div>
        </div>
      </div>
    </section>

    ${renderPitch(lineup, lookups)}
    ${renderDetails(lineup)}
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading best all-time team...");
  const [lineupData, seasons] = await Promise.all([
    loadJSON("./data/best-all-time-team.json", { teams: {} }),
    loadAllSeasons(),
  ]);
  const lookups = buildLookups(seasons);
  state.view = lineupData.defaultView || "all-time";

  function render() {
    root.innerHTML = renderPage(lineupData, lookups);
    root.querySelectorAll("[data-best-team-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.bestTeamView;
        render();
      });
    });
  }

  render();
}

init();
