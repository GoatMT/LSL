import { renderPlayoffBracket } from "../components/playoffBracket.js";
import { renderStandingsTable } from "../components/standingsTable.js";
import { SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js";
import { calculateStandings, computePlayerStats } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("season-recap.html");
setDocumentTitle("Season Recap");

const root = document.getElementById("page-root");
let state = { season: SITE.defaultSeason };

function playoffDataForDivision(playoffs = {}, division) {
  if (Array.isArray(playoffs.divisions)) {
    return playoffs.divisions.find((item) => item.division === division) || { rounds: [] };
  }
  if (playoffs.division && playoffs.division !== division) return { rounds: [] };
  return playoffs;
}

function awardCard(award, category) {
  const item = award || { category, winner: "Not listed yet", sourceNote: "No source record has been added yet." };
  return `
    <article class="card recap-award-card">
      <span class="award-title">${escapeHTML(category)}</span>
      <h3>${escapeHTML(item.winner)}</h3>
      <p>${escapeHTML(item.sourceNote || "Source note not listed.")}</p>
    </article>
  `;
}

function leaderRows(players) {
  const top = players.filter((player) => player.goals > 0).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, 5);
  if (!top.length) return statusMessage("empty", "No scorer records listed yet.");
  return `
    <div class="team-player-list">
      ${top
        .map(
          (player, index) => `
            <a class="team-player-row" href="./player.html?id=${escapeHTML(player.id)}">
              <span class="rank-badge">${index + 1}</span>
              <strong>${escapeHTML(player.name)}</strong>
              <span>${escapeHTML(player.teamName || "Team TBA")}</span>
              <span>${player.goals} G</span>
              <span>${player.points} PTS</span>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDivisionRecap(data, division) {
  const isCurrentSeason = String(data.year) === String(SITE.defaultSeason);
  const awards = (data.awards?.awards || []).filter((award) => award.division === division);
  const awardByCategory = new Map(awards.map((award) => [award.category, award]));
  const rows = calculateStandings(data, { division });
  const players = computePlayerStats(data, { stage: "regular" }).filter((player) => player.division === division);
  const playoffData = playoffDataForDivision(data.playoffs, division);

  return `
    <section class="section-panel recap-division-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">${escapeHTML(division)}</span>
          <h2>${escapeHTML(data.year)} ${escapeHTML(division)} ${isCurrentSeason ? "Season So Far" : "Recap"}</h2>
          <p>${isCurrentSeason ? "Current table, leaders, honors status, and playoff picture for this active season." : "Champions, final table, leaders, and playoff bracket for this division."}</p>
        </div>
        ${isCurrentSeason ? '<span class="pill green">Live Season</span>' : '<span class="pill">Completed Season</span>'}
      </div>
      <div class="award-season-grid recap-award-grid">
        ${["Champion Team", "2nd Place Team", "3rd Place Team", "MVP", "Golden Boot"].map((category) => awardCard(awardByCategory.get(category), category)).join("")}
      </div>
      <div class="recap-split">
        <div class="card">
          <div class="player-detail-card-head">
            <span class="eyebrow">Top Scorers</span>
          </div>
          ${leaderRows(players)}
        </div>
        <div class="card">
          <div class="player-detail-card-head">
            <span class="eyebrow">Quick Numbers</span>
          </div>
          <div class="stat-grid">
            <div class="stat-box"><span>Teams</span><strong>${rows.length}</strong></div>
            <div class="stat-box"><span>Matches</span><strong>${(data.matches || []).filter((match) => match.division === division && match.stage === "regular").length}</strong></div>
            <div class="stat-box"><span>Goals</span><strong>${players.reduce((sum, player) => sum + (Number(player.goals) || 0), 0)}</strong></div>
            <div class="stat-box"><span>Players</span><strong>${players.length}</strong></div>
          </div>
        </div>
      </div>
      <div class="recap-block">
        <div class="section-head compact-head">
          <div>
            <span class="eyebrow">${isCurrentSeason ? "Current Table" : "Final Table"}</span>
            <h3>${isCurrentSeason ? "Standings So Far" : "Regular Season Standings"}</h3>
          </div>
        </div>
        ${renderStandingsTable(rows, data.year)}
      </div>
      <div class="recap-block">
        <div class="section-head compact-head">
          <div>
            <span class="eyebrow">Playoffs</span>
            <h3>Bracket</h3>
          </div>
        </div>
        ${renderPlayoffBracket(playoffData)}
      </div>
    </section>
  `;
}

function render(data) {
  const isCurrentSeason = String(data.year) === String(SITE.defaultSeason);
  const divisions = [...new Set((data.teams || []).map((team) => team.division))];
  root.innerHTML = `
    <section class="section-panel people-panel people-hero-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">${isCurrentSeason ? "Active Season" : "Season Recap"}</span>
          <h1>${escapeHTML(data.year)} ${isCurrentSeason ? "Season So Far" : "Recap"}</h1>
          <p>${escapeHTML(data.event?.name || "Season summary")} | ${escapeHTML(data.event?.dates || "Dates TBA")}${isCurrentSeason ? " | Results update as games are completed" : ""}</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("season", "Season", SITE.seasons, state.season)}
      </div>
    </section>
    ${divisions.length ? divisions.map((division) => renderDivisionRecap(data, division)).join("") : statusMessage("empty", "No divisions are listed for this season yet.")}
  `;

  document.getElementById("season").addEventListener("change", async (event) => {
    state.season = event.target.value;
    render(await loadSeasonData(state.season));
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading season recap...");
  render(await loadSeasonData(state.season));
}

init();
