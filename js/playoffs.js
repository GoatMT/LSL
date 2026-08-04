import { renderPlayoffBracket } from "../components/playoffBracket.js";
import { renderStandingsTable } from "../components/standingsTable.js?v=3.1";
import { playoffRulesFor, SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js?v=1.0";
import { calculateStandings } from "./leagueEngine.js?v=3.3";
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

  // 2026 expanded the senior field to 8 teams with no byes: quarterfinals are
  // 1v8, 2v7, 3v6, and 4v5, all played the same day (August 8) as the semis and final.
  const seeded = rows.filter((row) => row.gp > 0 && !row.scorePending).slice(0, 8);
  if (seeded.length < 8) return null;

  const seed1 = seedTeam(seeded[0]);
  const seed2 = seedTeam(seeded[1]);
  const seed3 = seedTeam(seeded[2]);
  const seed4 = seedTeam(seeded[3]);
  const seed5 = seedTeam(seeded[4]);
  const seed6 = seedTeam(seeded[5]);
  const seed7 = seedTeam(seeded[6]);
  const seed8 = seedTeam(seeded[7]);
  const q1Winner = placeholderTeam("Winner Q1");
  const q2Winner = placeholderTeam("Winner Q2");
  const q3Winner = placeholderTeam("Winner Q3");
  const q4Winner = placeholderTeam("Winner Q4");
  const s1Winner = placeholderTeam("Winner S1");
  const s2Winner = placeholderTeam("Winner S2");

  return {
    season: data.year,
    division,
    layout: "wide",
    champion: "",
    isCurrentProjection: true,
    format: "Eight-team single-day bracket. Quarterfinals, semifinals, and the championship are all played Saturday, August 8, 2026.",
    rounds: [
      {
        name: "Quarterfinals",
        matches: [
          {
            label: "Q1",
            homeTeamId: seed1.id,
            homeTeamName: seed1.name,
            homeSeed: 1,
            awayTeamId: seed8.id,
            awayTeamName: seed8.name,
            awaySeed: 8,
            homeScore: null,
            awayScore: null,
            note: "Current seed 1 vs current seed 8."
          },
          {
            label: "Q2",
            homeTeamId: seed2.id,
            homeTeamName: seed2.name,
            homeSeed: 2,
            awayTeamId: seed7.id,
            awayTeamName: seed7.name,
            awaySeed: 7,
            homeScore: null,
            awayScore: null,
            note: "Current seed 2 vs current seed 7."
          },
          {
            label: "Q3",
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
            label: "Q4",
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
            homeTeamId: q1Winner.id,
            homeTeamName: q1Winner.name,
            awayTeamId: q4Winner.id,
            awayTeamName: q4Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Winner of Q1 (1v8) faces the winner of Q4 (4v5). No byes in the 8-team format."
          },
          {
            label: "S2",
            homeTeamId: q2Winner.id,
            homeTeamName: q2Winner.name,
            awayTeamId: q3Winner.id,
            awayTeamName: q3Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Winner of Q2 (2v7) faces the winner of Q3 (3v6)."
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
            note: "Projected bracket spot only. Not an official result. Championship is played the same day as the quarterfinals and semifinals."
          }
        ]
      }
    ]
  };
}

function bracketNotice(playoffData, seasonComplete) {
  if (!playoffData?.isCurrentProjection) return "";
  if (seasonComplete) {
    return `
      <div class="card playoff-current-notice">
        <span class="pill green">Official Bracket</span>
        <h3>Quarterfinal matchups are set</h3>
        <p>The ${escapeHTML(state.season)} regular season is complete, so these are the official quarterfinal matchups based on final standings. Scores will be added as each game is played.</p>
      </div>
    `;
  }
  return `
    <div class="card playoff-current-notice">
      <span class="pill green">Current Bracket</span>
      <h3>If the playoffs started today</h3>
      <p>This bracket is built from the current ${escapeHTML(state.season)} standings. It is not official and will change as more regular season games are completed.</p>
    </div>
  `;
}

function regularSeasonComplete(data, division) {
  const regularMatches = (data.matches || []).filter((match) => match.division === division && match.stage === "regular");
  return regularMatches.length > 0 && regularMatches.every((match) => match.homeScore != null && match.awayScore != null);
}

function divisionOptions(data) {
  const available = [...new Set((data.teams || []).map((team) => team.division).filter(Boolean))];
  return available.length ? available : SITE.divisions;
}

function render(data) {
  const divisions = divisionOptions(data);
  if (!divisions.includes(state.division)) state.division = divisions[0] || "Seniors";
  const rule = playoffRulesFor(state.season, state.division);
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
      ${bracketNotice(playoffData, regularSeasonComplete(data, state.division))}
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
