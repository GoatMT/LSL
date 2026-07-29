import { renderPlayoffBracket } from "../components/playoffBracket.js";
import { renderStandingsTable } from "../components/standingsTable.js?v=3.1";
import { PLAYOFF_RULES, SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js";
import { calculateStandings } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("playoffs.html");
setDocumentTitle("Playoffs");

const root = document.getElementById("page-root");
let state = { season: SITE.defaultSeason, division: "Seniors" };

function playoffDataForDivision(playoffs = {}, division) {
  if (Array.isArray(playoffs.divisions)) {
    return playoffs.divisions.find((item) => item.division === division) || { rounds: [] };
  }
  if (playoffs.division && playoffs.division !== division) return { rounds: [] };
  return playoffs;
}

function seedTeam(row, fallback = "TBA") {
  if (!row?.team) return { id: "", name: fallback };
  return {
    id: row.team.id,
    name: `${row.team.name} (${row.rankLabel || row.rank})`,
  };
}

function placeholderTeam(name) {
  return { id: "", name };
}

function buildCurrentBracket(data, rows, division) {
  if (data.year !== SITE.defaultSeason || division !== "Seniors") return null;

  const seeded = rows.filter((row) => row.gp > 0 && !row.scorePending).slice(0, 6);
  if (seeded.length < 6) return null;

  const seed1 = seedTeam(seeded[0]);
  const seed2 = seedTeam(seeded[1]);
  const seed3 = seedTeam(seeded[2]);
  const seed4 = seedTeam(seeded[3]);
  const seed5 = seedTeam(seeded[4]);
  const seed6 = seedTeam(seeded[5]);
  const q1Winner = placeholderTeam("Winner Q1");
  const q2Winner = placeholderTeam("Winner Q2");
  const s1Winner = placeholderTeam("Winner S1");
  const s2Winner = placeholderTeam("Winner S2");

  return {
    season: data.year,
    division,
    layout: "wide",
    champion: "",
    isCurrentProjection: true,
    rounds: [
      {
        name: "Quarterfinals",
        matches: [
          {
            label: "Q1",
            homeTeamId: seed3.id,
            homeTeamName: seed3.name,
            homeSeed: 3,
            awayTeamId: seed6.id,
            awayTeamName: seed6.name,
            awaySeed: 6,
            homeScore: null,
            awayScore: null,
            note: "Current seed 3 vs current seed 6."
          },
          {
            label: "Q2",
            homeTeamId: seed4.id,
            homeTeamName: seed4.name,
            homeSeed: 4,
            awayTeamId: seed5.id,
            awayTeamName: seed5.name,
            awaySeed: 5,
            homeScore: null,
            awayScore: null,
            note: "Current seed 4 vs current seed 5."
          }
        ]
      },
      {
        name: "Semifinals",
        matches: [
          {
            label: "S1",
            homeTeamId: seed1.id,
            homeTeamName: seed1.name,
            homeSeed: 1,
            awayTeamId: q1Winner.id,
            awayTeamName: q1Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Current seed 1 gets a bye and faces the Q1 winner."
          },
          {
            label: "S2",
            homeTeamId: seed2.id,
            homeTeamName: seed2.name,
            homeSeed: 2,
            awayTeamId: q2Winner.id,
            awayTeamName: q2Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Current seed 2 gets a bye and faces the Q2 winner."
          }
        ]
      },
      {
        name: "Final",
        matches: [
          {
            label: "Final",
            homeTeamId: s1Winner.id,
            homeTeamName: s1Winner.name,
            awayTeamId: s2Winner.id,
            awayTeamName: s2Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Projected bracket spot only. Not an official result."
          }
        ]
      }
    ]
  };
}

function bracketNotice(playoffData) {
  if (!playoffData?.isCurrentProjection) return "";
  return `
    <div class="card playoff-current-notice">
      <span class="pill green">Current Bracket</span>
      <h3>If the playoffs started today</h3>
      <p>This bracket is built from the current ${escapeHTML(state.season)} standings. It is not official and will change as more regular season games are completed.</p>
    </div>
  `;
}

function divisionOptions(data) {
  const available = [...new Set((data.teams || []).map((team) => team.division).filter(Boolean))];
  return available.length ? available : SITE.divisions;
}

function render(data) {
  const divisions = divisionOptions(data);
  if (!divisions.includes(state.division)) state.division = divisions[0] || "Seniors";
  const rule = PLAYOFF_RULES[state.division];
  const rows = calculateStandings(data, { division: state.division });
  const publishedPlayoffData = playoffDataForDivision(data.playoffs, state.division);
  const playoffData = (publishedPlayoffData.rounds || []).length ? publishedPlayoffData : buildCurrentBracket(data, rows, state.division) || publishedPlayoffData;

  root.innerHTML = `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Playoffs</span>
          <h1>${escapeHTML(state.season)} Bracket</h1>
          <p>${escapeHTML(rule?.description || "Select a division to view playoff format.")}</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("season", "Season", SITE.seasons, state.season)}
        ${controlSelect("division", "Division", divisions, state.division)}
      </div>
      ${bracketNotice(playoffData)}
      ${renderPlayoffBracket(playoffData)}
    </section>
    <section class="section-panel">
      <div class="section-head">
        <div>
          <h2>Seeding Table</h2>
          <p>Seeds are calculated from regular season results.</p>
        </div>
      </div>
      ${rows.length ? renderStandingsTable(rows, data.year) : statusMessage("empty", "No seeding table is available yet.")}
    </section>
  `;

  ["season", "division"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async (event) => {
      state[id] = event.target.value;
      const nextData = id === "season" ? await loadSeasonData(state.season) : data;
      render(nextData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading playoffs...");
  render(await loadSeasonData(state.season));
}

init();
