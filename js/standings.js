import { renderMatchCard } from "../components/matchCard.js";
import { renderPlayoffBracket } from "../components/playoffBracket.js";
import { renderStandingsTable } from "../components/standingsTable.js?v=3.1";
import { PLAYOFF_RULES, SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js";
import { filterMatches, getWeeks, standingsWithMovement } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("standings.html");
setDocumentTitle("Standings");

const root = document.getElementById("page-root");
let state = { season: SITE.defaultSeason, division: "Seniors", phase: "regular", week: "all" };

function playoffDataForDivision(playoffs = {}, division) {
  if (Array.isArray(playoffs.divisions)) {
    return playoffs.divisions.find((item) => item.division === division) || { rounds: [] };
  }
  if (playoffs.division && playoffs.division !== division) return { rounds: [] };
  return playoffs;
}

function weekOptions(data) {
  const weeks = getWeeks(data.matches, state.division, state.phase);
  return [{ value: "all", label: state.phase === "regular" ? "All regular weeks" : "All playoff weeks" }].concat(
    weeks.map((week) => ({ value: week, label: `Week ${week}` }))
  );
}

function divisionOptions(data) {
  const available = [...new Set((data.teams || []).map((team) => team.division).filter(Boolean))];
  return available.length ? available : SITE.divisions;
}

function render(data) {
  const divisions = divisionOptions(data);
  if (!divisions.includes(state.division)) state.division = divisions[0] || "Seniors";
  const rule = PLAYOFF_RULES[state.division];
  const weeks = weekOptions(data);
  if (!weeks.some((item) => String(item.value) === String(state.week))) state.week = "all";

  const controls = `
    <div class="controls">
      ${controlSelect("season", "Season", SITE.seasons, state.season)}
      ${controlSelect("division", "Division", divisions, state.division)}
      ${controlSelect("phase", "Phase", [
        { value: "regular", label: "Regular season" },
        { value: "playoffs", label: "Playoffs" }
      ], state.phase)}
      ${controlSelect("week", "Week", weeks, state.week)}
    </div>
  `;

  const rows = standingsWithMovement(data, { division: state.division, upToWeek: state.week });
  const notStarted = state.phase === "regular" && rows.length && rows.every((row) => row.gp === 0);
  const playoffMatches = filterMatches(data.matches, { division: state.division, stage: "playoffs", week: state.week });
  const playoffData = playoffDataForDivision(data.playoffs, state.division);

  root.innerHTML = `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Standings</span>
          <h1>${escapeHTML(state.season)} ${escapeHTML(state.division)}</h1>
          <p>${escapeHTML(rule?.description || "Select a division to view standings.")}</p>
        </div>
      </div>
      ${controls}
      <div class="rule-strip standings-rules">
        ${SITE.pointsSystem.map((rule) => `<div class="rule-pill"><span>${escapeHTML(rule.label)}</span><strong>${escapeHTML(rule.value)}</strong></div>`).join("")}
        <div class="rule-pill"><span>Tie breaker</span><strong>Points, wins, goal difference</strong></div>
      </div>
      ${notStarted ? statusMessage("empty", "Not started yet") : ""}
      ${
        state.phase === "regular"
          ? renderStandingsTable(rows, data.year)
          : `<div class="grid two">${playoffMatches.length ? playoffMatches.map((match) => renderMatchCard(data, match)).join("") : statusMessage("empty", state.season === SITE.defaultSeason ? "Not started yet" : "No playoff matches are published for this selection yet.")}</div>`
      }
    </section>
    <section class="section-panel">
      <div class="section-head">
        <div>
          <h2>Playoff Bracket</h2>
          <p>Playoff brackets stay separate from regular standings and update as results are confirmed.</p>
        </div>
      </div>
      ${renderPlayoffBracket(playoffData)}
    </section>
  `;

  ["season", "division", "phase", "week"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async (event) => {
      state[id] = event.target.value;
      const nextData = id === "season" ? await loadSeasonData(state.season) : data;
      render(nextData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading standings...");
  render(await loadSeasonData(state.season));
}

init();
