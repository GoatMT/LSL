import { SITE } from "./config.js";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";
import { clearFranchiseSave, createFranchiseSave, loadFranchiseConfig, loadFranchiseSave, saveFranchiseSave } from "./franchiseCore.js";

setupLayout("franchise.html");
setDocumentTitle("Franchise Mode");

const root = document.getElementById("page-root");

let pickedTeamId = "";

function renderFeaturePills(features = []) {
  return `
    <div class="franchise-feature-pills">
      ${features.map((feature) => `<span class="pill">${escapeHTML(feature)}</span>`).join("")}
    </div>
  `;
}

function renderRoadmap(roadmap = []) {
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Build Roadmap</span>
          <h2>Franchise Mode Parts</h2>
          <p>Franchise Mode is being built in five parts. Part 1 is live below; the rest are coming next.</p>
        </div>
      </div>
      <div class="grid franchise-roadmap-grid">
        ${roadmap
          .map(
            (item) => `
              <article class="card franchise-roadmap-card${item.status === "available" ? " available" : ""}">
                <div class="franchise-roadmap-top">
                  <span class="pill${item.status === "available" ? " green" : ""}">Part ${escapeHTML(item.part)}</span>
                  <span class="franchise-roadmap-status">${item.status === "available" ? "Available now" : "Coming soon"}</span>
                </div>
                <h3>${escapeHTML(item.title)}</h3>
                <p>${escapeHTML(item.summary)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTeamPicker(config, save) {
  const teams = config.teams || [];
  const activeTeamId = save?.userTeamId || pickedTeamId;

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Fantasy Draft</span>
          <h2>${save ? "Your Franchise Team" : "Choose Your Team"}</h2>
          <p>${save ? "This is the team you are general manager of for this franchise save." : "Pick one of six teams to control. The CPU runs the other five."}</p>
        </div>
      </div>
      <div class="grid franchise-team-grid" ${save ? 'data-locked="true"' : ""}>
        ${teams
          .map((team) => {
            const isActive = team.id === activeTeamId;
            const isCpu = save && !isActive;
            return `
              <button
                type="button"
                class="franchise-team-card${isActive ? " selected" : ""}${isCpu ? " cpu" : ""}"
                data-franchise-team="${escapeHTML(team.id)}"
                ${save ? "disabled" : ""}
                style="--franchise-team-color: ${escapeHTML(team.color || "#15803d")}"
              >
                <span class="franchise-team-badge">${escapeHTML(team.abbr || "")}</span>
                <strong>${escapeHTML(team.name)}</strong>
                <span class="franchise-team-role">${isActive ? "General Manager: You" : save ? "CPU-controlled" : "Tap to select"}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      ${
        save
          ? `<div class="button-row"><button type="button" class="button" id="franchise-reset-button">Reset League</button></div>`
          : `<div class="button-row"><button type="button" class="button primary" id="franchise-start-button" ${pickedTeamId ? "" : "disabled"}>Start New Franchise</button></div>`
      }
    </section>
  `;
}

function renderSeasonFormat(config, save) {
  const season = config.season || {};
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">League Structure</span>
          <h2>Season Format</h2>
          <p>${save ? `Season ${escapeHTML(save.season)}, Week ${escapeHTML(save.week)} of ${escapeHTML(season.weeks)}.` : "Every Franchise Mode season runs on the same clock."}</p>
        </div>
      </div>
      <div class="rule-strip">
        <div class="rule-pill"><span>Teams</span><strong>${escapeHTML(config.totalTeams)}</strong></div>
        <div class="rule-pill"><span>User-controlled</span><strong>${escapeHTML(config.userTeams)}</strong></div>
        <div class="rule-pill"><span>CPU-controlled</span><strong>${escapeHTML(config.cpuTeams)}</strong></div>
        <div class="rule-pill"><span>Season length</span><strong>${escapeHTML(season.weeks)} weeks</strong></div>
        <div class="rule-pill"><span>Game day</span><strong>${escapeHTML(season.gameDay)}</strong></div>
        <div class="rule-pill"><span>Simulation</span><strong>Daily</strong></div>
      </div>
      <p class="franchise-note">${escapeHTML(season.note || "")}</p>
    </section>
  `;
}

function renderPlayoffFormat(config) {
  const rounds = config.playoffFormat?.rounds || [];
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Postseason</span>
          <h2>Playoffs</h2>
          <p>Top ${escapeHTML(config.playoffFormat?.qualifiers || 6)} teams qualify. Seeds 1 and 2 receive quarterfinal byes.</p>
        </div>
      </div>
      <div class="franchise-bracket">
        ${rounds
          .map(
            (round) => `
              <article class="franchise-bracket-round">
                <span class="pill">${escapeHTML(round.shortName)}</span>
                <strong>${escapeHTML(round.name)}</strong>
                <p>${escapeHTML(round.matchup)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function attachHandlers(config) {
  const teamButtons = [...document.querySelectorAll("[data-franchise-team]")];
  teamButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      pickedTeamId = button.dataset.franchiseTeam;
      render(config);
    });
  });

  const startButton = document.getElementById("franchise-start-button");
  startButton?.addEventListener("click", () => {
    if (!pickedTeamId) return;
    const save = createFranchiseSave(config, pickedTeamId);
    saveFranchiseSave(save);
    render(config);
  });

  const resetButton = document.getElementById("franchise-reset-button");
  resetButton?.addEventListener("click", () => {
    const confirmed = window.confirm("Reset your franchise? This clears your current save and cannot be undone.");
    if (!confirmed) return;
    clearFranchiseSave();
    pickedTeamId = "";
    render(config);
  });
}

function render(config) {
  const save = loadFranchiseSave();

  root.innerHTML = `
    <section class="hero franchise-hero">
      <div class="hero-copy">
        <span class="hero-kicker">${escapeHTML(config.modeName || "Franchise Mode")}</span>
        <h1>${escapeHTML(config.subModeName || "Fantasy Draft")}</h1>
        <p>${escapeHTML(config.description || config.tagline || "")}</p>
        ${renderFeaturePills(config.features)}
      </div>
      <aside class="hero-logo-card" aria-label="Franchise Mode">
        <img src="${escapeHTML(SITE.logo)}" alt="Lantern Soccer League logo">
        <strong>${escapeHTML(config.modeName || "Franchise Mode")}</strong>
        <span class="pill">Part 1: League Structure</span>
      </aside>
    </section>

    ${renderRoadmap(config.roadmap)}
    ${renderTeamPicker(config, save)}
    ${renderSeasonFormat(config, save)}
    ${renderPlayoffFormat(config)}
  `;

  attachHandlers(config);
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading Franchise Mode...");
  const config = await loadFranchiseConfig();
  render(config);
}

init();
