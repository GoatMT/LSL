import { renderCoachCard } from "../components/coachCard.js";
import { renderFormStrip } from "../components/formStrip.js";
import { COACH_GRADE_SCALE, decorateCoachGrade } from "./coachRatings.js";
import { SITE } from "./config.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { calculateCoachForm, computeCoachSummary } from "./leagueEngine.js?v=3.4";
import { setupLayout } from "./main.js";
import { controlInput, controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("coaches.html");
setDocumentTitle("Coaches");

const root = document.getElementById("page-root");
let coachRatings = {};
let state = { stage: "regular", season: "All", division: "All", search: "", sort: "wins", compareA: "", compareB: "" };
const stageOptions = [
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
  { value: "all", label: "All Games" },
];
const sortOptions = [
  { value: "gradeValue", label: "Coach Grade" },
  { value: "wins", label: "Wins" },
  { value: "points", label: "Points" },
  { value: "winPctValue", label: "Win %" },
  { value: "gamesPlayed", label: "Games" },
  { value: "finals", label: "Finals" },
  { value: "championships", label: "Championships" },
];

function selectedSeasons(allData) {
  return state.season === "All" ? allData : allData.filter((data) => data.year === state.season);
}

function divisionOptions(allData) {
  const divisions = [...new Set(selectedSeasons(allData).flatMap((season) => (season.coaches || []).map((coach) => coach.division)).filter(Boolean))];
  return [{ value: "All", label: "All" }, ...divisions.map((division) => ({ value: division, label: division }))];
}

function coachPoints(coach) {
  return (Number(coach.wins) || 0) * 3 + (Number(coach.ties) || 0);
}

function winPctValue(coach) {
  const games = Number(coach.gamesPlayed) || 0;
  return games ? ((Number(coach.wins) || 0) / games) * 100 : 0;
}

function decorateCoach(coach) {
  return decorateCoachGrade({
    ...coach,
    points: coachPoints(coach),
    winPctValue: winPctValue(coach),
  }, coachRatings);
}

function sortLabel() {
  return sortOptions.find((option) => option.value === state.sort)?.label || "Wins";
}

function activeFilterText() {
  const stage = stageOptions.find((option) => option.value === state.stage)?.label || "Regular Season";
  return `${stage} | ${state.season} | ${state.division}`;
}

function summaryTile(label, value, note = "") {
  return `
    <div class="summary-tile">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
      ${note ? `<p>${escapeHTML(note)}</p>` : ""}
    </div>
  `;
}

function coachGradeGuide() {
  return `
    <div class="coach-grade-guide" aria-label="Coach grade scale">
      ${COACH_GRADE_SCALE.map((item) => `
        <div class="coach-grade-guide-item">
          <strong>${escapeHTML(item.grade)}</strong>
          <span>${escapeHTML(item.meaning)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function filteredCoaches(allData) {
  const seasons = selectedSeasons(allData);
  return computeCoachSummary(seasons, { stage: state.stage })
    .map(decorateCoach)
    .filter((coach) => state.division === "All" || (coach.divisions || [coach.division]).includes(state.division))
    .filter((coach) => coach.name.toLowerCase().includes(state.search.toLowerCase()) || (coach.teamName || "").toLowerCase().includes(state.search.toLowerCase()))
    .sort((a, b) => (Number(b[state.sort]) || 0) - (Number(a[state.sort]) || 0) || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((coach) => ({
      ...coach,
      form: calculateCoachForm(seasons, coach.id, { stage: state.stage, division: state.division }),
    }));
}

function coachLeaderCard(coach, index, compact = false) {
  const rank = index + 1;
  const stats = compact
    ? [
        { label: "Wins", value: coach.wins || 0 },
        { label: "Points", value: coach.points || 0 },
        { label: "Win %", value: coach.winPct || "0.0%" },
      ]
    : [
        { label: "Games", value: coach.gamesPlayed || 0 },
        { label: "Wins", value: coach.wins || 0 },
        { label: "Points", value: coach.points || 0 },
        { label: "Win %", value: coach.winPct || "0.0%" },
        { label: "Finals", value: coach.finals || 0 },
      ];
  return `
    <article class="coach-leader-card${compact ? " compact" : ""}">
      <div class="coach-leader-rank">
        <span>#${rank}</span>
        <small>${escapeHTML(sortLabel())}</small>
      </div>
      <div class="coach-leader-info">
        <span class="eyebrow">${rank === 1 ? "Current Leader" : `Rank ${rank}`}</span>
        <h3><a href="./coach.html?id=${escapeHTML(coach.id)}">${escapeHTML(coach.name)}</a></h3>
        <p>
          <span>${escapeHTML(coach.teamName || "Team TBA")}</span>
          <span>${escapeHTML(coach.division || "Division TBA")}</span>
          <span class="coach-grade-inline">Grade ${escapeHTML(coach.overallGrade || "Not Rated")}</span>
        </p>
        ${renderFormStrip(coach.form || [])}
      </div>
      <div class="coach-leader-stats">
        ${stats.map((stat) => `<div class="stat-box"><span>${escapeHTML(stat.label)}</span><strong>${escapeHTML(stat.value)}</strong></div>`).join("")}
      </div>
    </article>
  `;
}

function coachLeaderboard(coaches) {
  const leaders = coaches.slice(0, 5);
  if (!leaders.length) return statusMessage("empty", "No coach leaders found for the current filters.");
  const topThree = leaders.slice(0, 3).map((coach, index) => coachLeaderCard(coach, index)).join("");
  const nextTwo = leaders.slice(3, 5).map((coach, index) => coachLeaderCard(coach, index + 3, true)).join("");
  return `
    <div class="coach-leaderboard">
      <div class="coach-leaderboard-main">
        ${topThree}
      </div>
      ${nextTwo ? `<div class="coach-leaderboard-more">${nextTwo}</div>` : ""}
    </div>
  `;
}

function coachSummary(coaches) {
  const games = coaches.reduce((sum, coach) => sum + (Number(coach.gamesPlayed) || 0), 0);
  const wins = coaches.reduce((sum, coach) => sum + (Number(coach.wins) || 0), 0);
  const ties = coaches.reduce((sum, coach) => sum + (Number(coach.ties) || 0), 0);
  const points = coaches.reduce((sum, coach) => sum + (Number(coach.points) || 0), 0);
  const finals = coaches.reduce((sum, coach) => sum + (Number(coach.finals) || 0), 0);
  const titles = coaches.reduce((sum, coach) => sum + (Number(coach.championships) || 0), 0);
  return `
    <div class="people-summary-grid coach-summary-grid">
      ${summaryTile("Coaches", coaches.length, "matching filters")}
      ${summaryTile("Games", games, "tracked games")}
      ${summaryTile("Wins", wins, `${ties} ties`)}
      ${summaryTile("Points", points, "3 per win, 1 per tie")}
      ${summaryTile("Finals", finals, "appearances")}
      ${summaryTile("Titles", titles, "championships")}
    </div>
    ${coachLeaderboard(coaches)}
  `;
}

function ranking(title, coaches, metric, label) {
  const rows = [...coaches]
    .sort((a, b) => (Number(b[metric]) || 0) - (Number(a[metric]) || 0) || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((coach, index) => {
      const value = metric === "winPctValue" ? coach.winPct || "0.0%" : coach[metric] || 0;
      return `
        <li class="leader-row">
          <span class="rank-badge">${index + 1}</span>
          <span class="leader-name">
            <a href="./coach.html?id=${escapeHTML(coach.id)}">${escapeHTML(coach.name)}</a>
          </span>
          <strong class="leader-score"><span>${escapeHTML(value)}</span><small>${escapeHTML(title)}</small></strong>
        </li>
      `;
    })
    .join("");
  return `
    <article class="card leader-card">
      <div class="leader-card-head">
        <div>
          <span class="eyebrow">${escapeHTML(label)}</span>
          <h3>${escapeHTML(title)}</h3>
        </div>
        <span class="pill">Top 3</span>
      </div>
      ${rows ? `<ul class="ranking-list leader-list">${rows}</ul>` : statusMessage("empty", "No rankings available for this filter.")}
    </article>
  `;
}

function comparison(coaches) {
  const options = coaches.map((coach) => ({ value: coach.id, label: coach.name }));
  if (!state.compareA && coaches[0]) state.compareA = coaches[0].id;
  if (!state.compareB && coaches[1]) state.compareB = coaches[1].id;
  const a = coaches.find((coach) => coach.id === state.compareA);
  const b = coaches.find((coach) => coach.id === state.compareB);

  return `
    <div class="controls coach-comparison-controls player-comparison-controls">
      ${controlSelect("compareA", "Coach One", options, state.compareA)}
      ${controlSelect("compareB", "Coach Two", options, state.compareB)}
    </div>
    <div class="comparison-grid">
      ${[a, b]
        .map(
          (coach) =>
            coach
              ? `<div class="card comparison-card">
                  <div class="comparison-card-head">
                    <div>
                      <span class="eyebrow">Coach</span>
                      <h3><a href="./coach.html?id=${escapeHTML(coach.id)}">${escapeHTML(coach.name)}</a></h3>
                      <p>${escapeHTML(coach.division || "Division TBA")} | ${escapeHTML(coach.teamName || "Team TBA")}</p>
                    </div>
                    <a class="text-link compact" href="./coach.html?id=${escapeHTML(coach.id)}">Profile</a>
                  </div>
                  <div class="stat-grid">
                    <div class="stat-box"><span>Games</span><strong>${coach.gamesPlayed || 0}</strong></div>
                    <div class="stat-box"><span>Wins</span><strong>${coach.wins || 0}</strong></div>
                    <div class="stat-box"><span>Points</span><strong>${coach.points || 0}</strong></div>
                    <div class="stat-box"><span>Win %</span><strong>${escapeHTML(coach.winPct || "0.0%")}</strong></div>
                    <div class="stat-box"><span>Finals</span><strong>${coach.finals || 0}</strong></div>
                    <div class="stat-box"><span>Titles</span><strong>${coach.championships || 0}</strong></div>
                    <div class="stat-box coach-grade-stat"><span>Coach Grade</span><strong>${escapeHTML(coach.overallGrade || "Not Rated")}</strong></div>
                  </div>
                </div>`
              : statusMessage("empty", "Select a coach to compare.")
        )
        .join("")}
    </div>
  `;
}

function render(allData, focusSearch = false) {
  const divisions = divisionOptions(allData);
  if (!divisions.some((option) => option.value === state.division)) state.division = "All";
  const coaches = filteredCoaches(allData);

  root.innerHTML = `
    <section class="section-panel coaches-title-panel">
      <div class="coaches-title-copy">
        <span class="eyebrow">Coaches</span>
        <h1>Coaches</h1>
        <p>Search the league, filter seasons, and open clean coach profiles for career details.</p>
      </div>
      <div class="coaches-title-side">
        <span class="pill">${escapeHTML(activeFilterText())}</span>
        <a class="button primary" href="./all-time.html">All Time Stats</a>
      </div>
    </section>

    <section class="section-panel coaches-filter-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Filters</span>
          <h2>Find Coach Leaders</h2>
          <p>Choose a stat type, season, and division. Search by coach or team name.</p>
        </div>
      </div>
      <div class="controls coaches-controls">
        ${controlSelect("stage", "Stats Type", stageOptions, state.stage)}
        ${controlSelect("season", "Season", [{ value: "All", label: "All" }, ...SITE.seasons.map((season) => ({ value: season, label: season }))], state.season)}
        ${controlSelect("division", "Division", divisions, state.division)}
        ${controlSelect("sort", "Sort By", sortOptions, state.sort)}
        ${controlInput("search", "Search", "Coach or team")}
      </div>
      <div class="coach-grade-guide-wrap">
        <span class="eyebrow">Coach Rating Scale</span>
        ${coachGradeGuide()}
      </div>
    </section>

    <section class="section-panel people-panel people-hero-panel coaches-main-panel">
      <div class="coaches-main-head">
        <div>
          <span class="eyebrow">Dashboard</span>
          <h2>${escapeHTML(sortLabel())} Leaders</h2>
          <p>${coaches.length} coaches match the current filters.</p>
        </div>
        <span class="pill">${escapeHTML(state.search ? `Search: ${state.search}` : "Top 5 shown")}</span>
      </div>
      ${coachSummary(coaches)}
    </section>

    <section class="section-panel coaches-top-panel players-top-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Leaders</span>
          <h2>Top Coaches</h2>
          <p>Wins, points, win percentage, and championship leaders are shown as clean top 3 cards.</p>
        </div>
      </div>
      <div class="grid leader-grid">
        ${ranking("Wins", coaches, "wins", "Results")}
        ${ranking("Points", coaches, "points", "Table")}
        ${ranking("Win %", coaches, "winPctValue", "Efficiency")}
        ${ranking("Championships", coaches, "championships", "Honors")}
      </div>
    </section>

    <section class="section-panel coaches-compare-panel players-compare-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Compare</span>
          <h2>Coach Comparison</h2>
          <p>Select two coaches to compare their coaching records.</p>
        </div>
      </div>
      ${coaches.length >= 2 ? comparison(coaches) : statusMessage("empty", "At least two coaches are needed for comparison.")}
    </section>

    <section class="section-panel coaches-records-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Directory</span>
          <h2>Coach Cards</h2>
          <p>Open a coach profile for career history, championships, and season details.</p>
        </div>
      </div>
      <div class="grid three coach-card-grid">
        ${coaches.length ? coaches.map((coach) => renderCoachCard(coach, null)).join("") : statusMessage("empty", "No coaches match this selection yet.")}
      </div>
    </section>
  `;

  const searchInput = document.getElementById("search");
  searchInput.value = state.search;
  if (focusSearch) {
    searchInput.focus();
    searchInput.setSelectionRange(state.search.length, state.search.length);
  }
  ["stage", "season", "division", "sort", "compareA", "compareB"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      state[id] = event.target.value;
      render(allData);
    });
  });
  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    render(allData, true);
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading coaches...");
  const [allData, ratings] = await Promise.all([
    loadAllSeasons(),
    loadJSON("./data/coach-ratings.json", { coaches: {} }),
  ]);
  coachRatings = ratings;
  render(allData);
}

init();
