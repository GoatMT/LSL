import { loadAllSeasons } from "./dataLoader.js?v=20261108-data3";
import { setupLayout } from "./main.js?v=20261109-greenprimary1";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("unites.html");
setDocumentTitle("LSL Unites");

const root = document.getElementById("page-root");
const state = { season: "all", division: "all", query: "" };

function partnerCard(partner) {
  return `<article class="unites-partner">
    <a class="unites-partner-logo" href="${escapeHTML(partner.url)}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${escapeHTML(partner.name)}">
      <img src="${escapeHTML(partner.logo)}" alt="${escapeHTML(partner.name)} logo" loading="lazy">
    </a>
    <div class="unites-partner-copy">
      <span class="unites-kicker">${escapeHTML(partner.category)}</span>
      <h3>${escapeHTML(partner.name)}</h3>
      <p>Listed as a league partner on the existing LSL site. Partnership seasons are not recorded.</p>
      <a class="text-link" href="${escapeHTML(partner.url)}" target="_blank" rel="noopener noreferrer">Visit partner site</a>
    </div>
    <span class="unites-record-mark">Verified listing</span>
  </article>`;
}

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function teamCard(team, season) {
  const logo = team.logo
    ? `<img data-team-logo src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo" loading="lazy"><span class="unites-team-initials" aria-hidden="true">${escapeHTML(initials(team.name))}</span>`
    : `<span class="unites-team-initials" aria-hidden="true">${escapeHTML(initials(team.name))}</span>`;
  const profileHref = `./team.html?season=${encodeURIComponent(season)}&id=${encodeURIComponent(team.id)}`;
  return `<article class="unites-team-card">
    <a class="unites-team-logo" href="${profileHref}" aria-label="View ${escapeHTML(season)} ${escapeHTML(team.name)} team page">${logo}</a>
    <div class="unites-team-copy">
      <span class="unites-kicker">${escapeHTML(season)} · ${escapeHTML(team.division || "Division not listed")}</span>
      <h3><a href="${profileHref}">${escapeHTML(team.name)}</a></h3>
      <span class="unites-team-label">Official season team</span>
    </div>
  </article>`;
}

function render(data, partnerData) {
  const teams = data.flatMap((season) => (season.teams || []).map((team) => ({ ...team, season: String(season.year) })));
  const divisions = [...new Set(teams.map((team) => team.division).filter(Boolean))].sort();
  const query = state.query.trim().toLocaleLowerCase();
  const visibleTeams = teams.filter((team) =>
    (state.season === "all" || team.season === state.season) &&
    (state.division === "all" || team.division === state.division) &&
    (!query || `${team.name} ${team.division} ${team.season}`.toLocaleLowerCase().includes(query))
  );
  const partners = Array.isArray(partnerData.partners) ? partnerData.partners : [];
  const sponsors = Array.isArray(partnerData.sponsors) ? partnerData.sponsors : [];
  const seasons = [...new Set(teams.map((team) => team.season))].sort();

  root.innerHTML = `
    <section class="section-panel unites-hero">
      <div class="unites-hero-copy">
        <span class="eyebrow">COMMUNITY · PARTNERS · HISTORY</span>
        <h1>LSL Unites</h1>
        <p>A home for the people and organizations connected to Lantern Soccer League, alongside the teams that have shaped each season.</p>
      </div>
      <div class="unites-hero-stats" aria-label="LSL Unites archive totals">
        <div><strong>${partners.length}</strong><span>verified partners</span></div>
        <div><strong>${sponsors.length}</strong><span>sponsor records</span></div>
        <div><strong>${teams.length}</strong><span>season teams</span></div>
      </div>
    </section>

    <section class="section-panel unites-sponsor-section" aria-labelledby="unites-sponsor-title">
      <div class="section-head">
        <div><span class="eyebrow">SPONSOR ARCHIVE</span><h2 id="unites-sponsor-title">Sponsors who support LSL</h2>
          <p>Sponsor names and seasons are shown only when they are documented in league records.</p></div>
      </div>
      ${sponsors.length ? `<div class="unites-partner-list">${sponsors.map(partnerCard).join("")}</div>` : `
        <div class="unites-empty" role="status"><span class="unites-empty-mark" aria-hidden="true">+</span>
          <div><h3>No historical sponsor records published</h3><p>The current site data does not identify sponsor names or sponsorship seasons. Team names below are kept separate and are not presented as sponsors.</p></div>
        </div>`}
    </section>

    <section class="section-panel unites-partners-section" aria-labelledby="unites-partner-title">
      <div class="section-head">
        <div><span class="eyebrow">COMMUNITY CONNECTIONS</span><h2 id="unites-partner-title">League partners</h2>
          <p>Organizations explicitly listed as LSL partners on the existing site.</p></div>
      </div>
      <div class="unites-partner-list">${partners.length ? partners.map(partnerCard).join("") : statusMessage("empty", "No partner records are published yet.")}</div>
    </section>

    <section class="section-panel unites-teams-section" aria-labelledby="unites-teams-title">
      <div class="section-head">
        <div><span class="eyebrow">SEASON ARCHIVE</span><h2 id="unites-teams-title">Teams that bring us together</h2>
          <p>Official team identities from published 2024–2026 season records. These are team listings, not sponsor claims.</p></div>
      </div>
      <div class="unites-controls">
        <label>Season<select id="unites-season"><option value="all">All seasons</option>${seasons.map((season) => `<option value="${escapeHTML(season)}" ${state.season === season ? "selected" : ""}>${escapeHTML(season)}</option>`).join("")}</select></label>
        <label>Division<select id="unites-division"><option value="all">All divisions</option>${divisions.map((division) => `<option value="${escapeHTML(division)}" ${state.division === division ? "selected" : ""}>${escapeHTML(division)}</option>`).join("")}</select></label>
        <label class="unites-search-label">Search teams<input id="unites-search" type="search" value="${escapeHTML(state.query)}" placeholder="Search names or seasons" autocomplete="off"></label>
      </div>
      <p class="unites-result-count" role="status">Showing ${visibleTeams.length} of ${teams.length} team-season entries</p>
      <div class="unites-team-grid">${visibleTeams.length ? visibleTeams.map((team) => teamCard(team, team.season)).join("") : statusMessage("empty", "No team entries match those filters.")}</div>
    </section>
  `;

  root.querySelectorAll("[data-team-logo]").forEach((image) => {
    image.addEventListener("error", () => image.remove());
  });
  root.querySelector("#unites-season")?.addEventListener("change", (event) => { state.season = event.target.value; render(data, partnerData); });
  root.querySelector("#unites-division")?.addEventListener("change", (event) => { state.division = event.target.value; render(data, partnerData); });
  root.querySelector("#unites-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    const selectionStart = event.target.selectionStart;
    render(data, partnerData);
    const input = root.querySelector("#unites-search");
    input?.focus();
    input?.setSelectionRange(selectionStart, selectionStart);
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading LSL community archive...");
  try {
    const [seasons, response] = await Promise.all([
      loadAllSeasons(["2024", "2025", "2026"], ["teams"]),
      fetch("./data/shared/partners.json"),
    ]);
    if (!response.ok) throw new Error("Could not load verified partner records.");
    render(seasons, await response.json());
  } catch (error) {
    console.error("Could not load LSL Unites", error);
    root.innerHTML = statusMessage("error", "The LSL community archive could not be loaded. Please try again soon.");
  }
}

init();
