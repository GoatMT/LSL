import { renderTeamCard } from "../components/teamCard.js?v=3.2";
import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js";
import { calculateTeamForm, coachMap, computeCombinedPlayerStats, getTeamStats, playersWithOVR } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("teams.html");
setDocumentTitle("Teams");

const root = document.getElementById("page-root");
let state = { season: SITE.defaultSeason, division: "Seniors" };

function playerRatingMap(allData) {
  return new Map(playersWithOVR(computeCombinedPlayerStats(allData, { stage: "all" })).map((player) => [player.id, player.ovr]));
}

function render(data, allData) {
  const divisions = [...new Set((data.teams || []).map((team) => team.division).filter(Boolean))];
  if (!divisions.includes(state.division)) state.division = divisions[0] || "Seniors";
  const coaches = coachMap(data);
  const teams = (data.teams || []).filter((team) => team.division === state.division);
  const ratings = playerRatingMap(allData);

  root.innerHTML = `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Teams</span>
          <h1>${escapeHTML(state.season)} Team Directory</h1>
          <p>Team cards show roster, coach, regular season stats, and history.</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("season", "Season", SITE.seasons, state.season)}
        ${controlSelect("division", "Division", divisions.length ? divisions : SITE.divisions, state.division)}
      </div>
      <div class="team-list">
        ${
          teams.length
            ? teams
                .map((team) => renderTeamCard(team, getTeamStats(data, team.id), coaches.get(team.coachId), data.year, calculateTeamForm(data, team.id), ratings))
                .join("")
            : statusMessage("empty", "No teams are published for this division yet.")
        }
      </div>
    </section>
  `;

  ["season", "division"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async (event) => {
      state[id] = event.target.value;
      const nextData = allData.find((season) => season.year === state.season) || data;
      render(nextData, allData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading teams...");
  const allData = await loadAllSeasons();
  render(allData.find((season) => season.year === state.season) || allData.at(-1), allData);
}

init();
