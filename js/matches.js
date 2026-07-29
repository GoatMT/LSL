import { renderMatchCard } from "../components/matchCard.js?v=3.1";
import { SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js";
import { filterMatches, getWeeks } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("matches.html");
setDocumentTitle("Matches");

const root = document.getElementById("page-root");
let state = { season: SITE.defaultSeason, division: "Seniors", stage: "all", week: "all" };

function stageOptions(data) {
  const stages = [...new Set((data.matches || []).map((match) => match.stage))];
  return [{ value: "all", label: "All match types" }].concat(stages.map((stage) => ({ value: stage, label: stage[0].toUpperCase() + stage.slice(1) })));
}

function allWeeks(data) {
  const stages = state.stage === "all" ? ["regular", "playoffs", "exhibition"] : [state.stage];
  const weeks = [...new Set(stages.flatMap((stage) => getWeeks(data.matches, state.division, stage)))].sort((a, b) => Number(a) - Number(b));
  return [{ value: "all", label: "All weeks" }].concat(weeks.map((week) => ({ value: week, label: week === 0 ? "Preseason" : `Week ${week}` })));
}

function schedulePlaceholderCards(stage = "all") {
  const cards = [
    { label: "Week 1", note: "Opening schedule coming soon." },
    { label: "Week 2", note: "Matchups will appear here once posted." },
    { label: "Playoffs", note: "Playoff schedule starts after regular season results." },
  ].filter((item) => stage === "all" || (stage === "playoffs" ? item.label === "Playoffs" : item.label !== "Playoffs"));

  return cards
    .map(
      (item) => `
        <article class="card match-card">
          <div class="match-topline">
            <div>
              <span class="pill green">${escapeHTML(item.label)}</span>
              <p class="source-note">${escapeHTML(state.division)} | Schedule coming soon</p>
            </div>
            <span class="pill">Not started yet</span>
          </div>
          <p>${escapeHTML(item.note)}</p>
        </article>
      `
    )
    .join("");
}

function weekTitle(match) {
  if (Number(match.week) === 0) return "Preseason";
  const label = match.stage === "playoffs" ? "Playoffs" : match.stage === "exhibition" ? "Exhibition" : "Regular Season";
  return `Week ${match.week} | ${label}`;
}

function renderMatchGroups(data, matches) {
  if (!matches.length) return "";
  const groups = matches.reduce((map, match) => {
    const key = `${match.week}-${match.stage}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(match);
    return map;
  }, new Map());

  return `
    <div class="match-week-list">
      ${[...groups.values()]
        .map((group) => {
          const first = group[0];
          return `
            <details class="match-week-section">
              <summary class="match-week-head">
                <div>
                  <span class="eyebrow">${escapeHTML(first.division)}</span>
                  <h2>${escapeHTML(weekTitle(first))}</h2>
                </div>
                <span class="match-week-count">${group.length} ${group.length === 1 ? "match" : "matches"}</span>
              </summary>
              <div class="match-week-grid">
                ${group.map((match) => renderMatchCard(data, match)).join("")}
              </div>
            </details>
          `;
        })
        .join("")}
    </div>
  `;
}

function render(data) {
  const weeks = allWeeks(data);
  if (!weeks.some((item) => String(item.value) === String(state.week))) state.week = "all";
  const matches = filterMatches(data.matches, { division: state.division, stage: state.stage, week: state.week });
  const emptyMessage = state.season === SITE.defaultSeason ? "Not started yet" : "No matches are published for this selection yet.";

  root.innerHTML = `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Matches</span>
          <h1>Schedules and Results</h1>
          <p>Match cards include teams, scores, date, time, goals, assists, shots, player of the match, and match notes.</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("season", "Season", SITE.seasons, state.season)}
        ${controlSelect("division", "Division", SITE.divisions, state.division)}
        ${controlSelect("stage", "Match Type", stageOptions(data), state.stage)}
        ${controlSelect("week", "Week", weeks, state.week)}
      </div>
      ${matches.length ? renderMatchGroups(data, matches) : `<div class="grid two">${state.season === SITE.defaultSeason ? schedulePlaceholderCards(state.stage) : statusMessage("empty", emptyMessage)}</div>`}
    </section>
  `;

  ["season", "division", "stage", "week"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async (event) => {
      state[id] = event.target.value;
      const nextData = id === "season" ? await loadSeasonData(state.season) : data;
      render(nextData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading matches...");
  render(await loadSeasonData(state.season));
}

init();
