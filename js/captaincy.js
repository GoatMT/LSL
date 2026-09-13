import { loadAllSeasons } from "./dataLoader.js?v=1.1";
import { setupLayout } from "./main.js?v=20260913-3";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("captaincy.html");
setDocumentTitle("Captaincy History");

const root = document.getElementById("page-root");
const state = { season: "All", division: "All" };

function buildRows(allData) {
  return allData.flatMap((data) => (data.teams || []).flatMap((team) => (team.roster || [])
    .filter((player) => /captain|assistant/i.test(String(player.leadershipRole || "")))
    .map((player) => ({
      season: String(data.year),
      division: team.division || "Division TBA",
      teamId: team.id,
      teamName: team.name,
      playerId: player.id,
      playerName: player.name,
      role: /captain/i.test(String(player.leadershipRole)) && !/assistant/i.test(String(player.leadershipRole)) ? "Captain" : "Assistant Captain",
    }))));
}

function renderRows(rows) {
  if (!rows.length) return statusMessage("empty", "No captaincy records match these filters.");
  return `
    <div class="captaincy-table-wrap">
      <table class="captaincy-table">
        <caption class="sr-only">LSL captaincy history</caption>
        <thead><tr><th>Season</th><th>Division</th><th>Team</th><th>Player</th><th>Role</th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr>
            <td><strong>${escapeHTML(row.season)}</strong></td>
            <td>${escapeHTML(row.division)}</td>
            <td><a href="./team.html?season=${encodeURIComponent(row.season)}&id=${encodeURIComponent(row.teamId)}">${escapeHTML(row.teamName)}</a></td>
            <td><a href="./player.html?id=${encodeURIComponent(row.playerId)}">${escapeHTML(row.playerName)}</a></td>
            <td><span class="captaincy-role ${row.role === "Captain" ? "captain" : "assistant"}">${escapeHTML(row.role)}</span></td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function render(allData) {
  const allRows = buildRows(allData);
  const seasons = [...new Set(allRows.map((row) => row.season))].sort((a, b) => Number(b) - Number(a));
  const divisions = [...new Set(allRows.map((row) => row.division))].sort();
  const rows = allRows.filter((row) => (state.season === "All" || row.season === state.season) && (state.division === "All" || row.division === state.division));
  root.innerHTML = `
    <section class="section-panel archive-hero">
      <div><span class="eyebrow">Leadership Archive</span><h1>LSL Captaincy History</h1><p>Every recorded captain and assistant captain, season by season, with links to their player and team pages.</p></div>
      <div class="archive-hero-mark" aria-hidden="true">C</div>
    </section>
    <section class="section-panel archive-section">
      <div class="archive-toolbar">
        <div class="control"><label for="captaincy-season">Season</label><select id="captaincy-season"><option value="All">All Seasons</option>${seasons.map((season) => `<option value="${escapeHTML(season)}"${state.season === season ? " selected" : ""}>${escapeHTML(season)}</option>`).join("")}</select></div>
        <div class="control"><label for="captaincy-division">Division</label><select id="captaincy-division"><option value="All">All Divisions</option>${divisions.map((division) => `<option value="${escapeHTML(division)}"${state.division === division ? " selected" : ""}>${escapeHTML(division)}</option>`).join("")}</select></div>
      </div>
      <div class="archive-section-head"><div><span class="eyebrow">${rows.length} records</span><h2>Leadership by season</h2><p>Leadership roles are read from the season roster records.</p></div></div>
      ${renderRows(rows)}
    </section>
  `;
  root.querySelector("#captaincy-season")?.addEventListener("change", (event) => { state.season = event.target.value; render(allData); });
  root.querySelector("#captaincy-division")?.addEventListener("change", (event) => { state.division = event.target.value; render(allData); });
}

async function init() {
  root.innerHTML = `<section class="section-panel">${statusMessage("loading", "Loading captaincy history...")}</section>`;
  try { render(await loadAllSeasons()); } catch (error) {
    console.error("Could not load captaincy history", error);
    root.innerHTML = `<section class="section-panel">${statusMessage("error", "Captaincy History is temporarily unavailable. Please try again soon.")}</section>`;
  }
}

init();
