import { SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js";
import { filterMatches, getMatchTeams, isCompletedMatch, scoreText, winnerTeamId } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatDate, formatDateWithISO, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("matchday.html");
setDocumentTitle("Matchday");

const root = document.getElementById("page-root");
let state = { season: SITE.defaultSeason, division: "All", week: "auto" };

function sortMatches(matches = []) {
  return filterMatches(matches, { division: "All", stage: "all", week: "all" });
}

function matchdayKey(match) {
  return `${match.date || "date-tba"}-${match.week || "week-tba"}`;
}

function selectedMatches(data) {
  return sortMatches(data.matches || []).filter((match) => state.division === "All" || match.division === state.division);
}

function availableDivisionOptions(data) {
  const divisions = [...new Set((data.matches || []).map((match) => match.division).filter(Boolean))];
  return [{ value: "All", label: "All divisions" }, ...divisions.map((division) => ({ value: division, label: division }))];
}

function matchdayOptions(matches = []) {
  const seen = new Set();
  const options = [{ value: "auto", label: "Next matchday" }];
  matches.forEach((match) => {
    const key = matchdayKey(match);
    if (seen.has(key)) return;
    seen.add(key);
    options.push({
      value: key,
      label: `${match.week ? `Week ${match.week}` : "Matchday"} | ${match.date ? formatDate(match.date) : "Date TBA"}`,
    });
  });
  return options;
}

function isTodayOrLater(date = "") {
  if (!date) return true;
  const matchDate = new Date(`${date}T23:59:59`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isFinite(matchDate.getTime()) && matchDate >= today;
}

function matchdayAnchor(matches = []) {
  if (state.week !== "auto") return matches.find((match) => matchdayKey(match) === state.week) || null;
  const upcoming = matches.filter((match) => !isCompletedMatch(match) && isTodayOrLater(match.date));
  return upcoming[0] || matches.at(-1) || null;
}

function sameMatchdayMatches(matches = [], anchor = null) {
  if (!anchor) return [];
  return matches.filter((match) => matchdayKey(match) === matchdayKey(anchor));
}

function currentMatchday(matches = []) {
  return sameMatchdayMatches(matches, matchdayAnchor(matches));
}

function timeRange(matches = []) {
  const times = matches.map((match) => match.time).filter(Boolean);
  if (!times.length) return "Time TBA";
  const firstStart = times[0].split(/\s+(?:-|to)\s+/i)[0] || times[0];
  const lastEnd = times.at(-1).split(/\s+(?:-|to)\s+/i).at(-1) || times.at(-1);
  return `${firstStart.trim()} - ${lastEnd.trim()}`;
}

function matchLabel(match) {
  if (match.activityTitle) return match.activityTitle;
  const { home, away } = getMatchTeams(match.data || {}, match);
  return `${home?.name || match.homeTeamName || "Home team"} vs ${away?.name || match.awayTeamName || "Away team"}`;
}

function teamNameById(data, teamId) {
  return (data.teams || []).find((team) => team.id === teamId)?.name || "Team TBA";
}

function actualWinnerText(data, match) {
  const winnerId = winnerTeamId(match);
  if (winnerId) return `Winner: ${teamNameById(data, winnerId)}`;
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore) && match.homeScore === match.awayScore) return "Winner: Draw";
  return "Winner: TBA";
}

function hasFullScore(match) {
  return Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
}

function resultTypeLabel(match) {
  return hasFullScore(match) ? "Final" : "Result";
}

function actualResultLabel(match) {
  if (hasFullScore(match)) return scoreText(match).replace(/\s+/g, "");
  if (winnerTeamId(match)) return "Winner posted";
  return "TBA";
}

function renderMatchdayStatus(data, match) {
  if (match.activityTitle) {
    return `
      <div class="matchday-projection activity">
        <span>Activity</span>
        <strong>${escapeHTML(match.status || "Scheduled")}</strong>
      </div>
    `;
  }

  if (isCompletedMatch(match)) {
    return `
      <div class="matchday-projection final">
        <span>${escapeHTML(resultTypeLabel(match))}: ${escapeHTML(actualResultLabel(match))}</span>
        <strong>${escapeHTML(actualWinnerText(data, match))}</strong>
      </div>
    `;
  }

  return `
    <div class="matchday-projection scheduled">
      <span>${escapeHTML(match.status || "Scheduled")}</span>
      <strong>Official Schedule</strong>
    </div>
  `;
}

function renderScheduleList(data, matches) {
  if (!matches.length) return statusMessage("empty", "No matchday schedule is published for this selection yet.");
  return `
    <div class="matchday-schedule-list">
      ${matches
        .map((match) => {
          const { home, away } = getMatchTeams(data, match);
          const label = match.activityTitle || `${home?.name || match.homeTeamName || "Home team"} vs ${away?.name || match.awayTeamName || "Away team"}`;
          return `
            <article class="matchday-row">
              <div class="matchday-row-time">
                <span>${escapeHTML(match.label || `Game ${match.week}`)}</span>
                <strong>${escapeHTML(match.time || "Time TBA")}</strong>
              </div>
              <div class="matchday-row-main">
                <h3>${match.activityTitle ? escapeHTML(label) : `<a href="${escapeHTML(teamProfileHref(match.homeTeamId, data.year))}">${escapeHTML(home?.name || match.homeTeamName || "Home team")}</a> <span>vs</span> <a href="${escapeHTML(teamProfileHref(match.awayTeamId, data.year))}">${escapeHTML(away?.name || match.awayTeamName || "Away team")}</a>`}</h3>
                <p>${escapeHTML(match.division || "LSL")} | ${escapeHTML(formatDateWithISO(match.date))}</p>
              </div>
              ${renderMatchdayStatus(data, match)}
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function latestCompletedMatchday(matches = []) {
  return [...matches].reverse().find((match) => !match.activityTitle && isCompletedMatch(match)) || null;
}

function renderFinalScoreList(data, matches) {
  const completedAnchor = latestCompletedMatchday(matches);
  const matchdayMatches = sameMatchdayMatches(matches, completedAnchor);
  const finals = matchdayMatches.filter((match) => !match.activityTitle && isCompletedMatch(match));
  const first = completedAnchor || {};
  const weekText = first.week ? `Week ${first.week}` : "Matchday";
  const dateText = first.date ? formatDateWithISO(first.date) : "Date TBA";

  return `
    <section class="section-panel matchday-results-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Final Scores</span>
          <h2>Previous Results</h2>
          <p>Open a completed matchday to view its final scores.</p>
        </div>
      </div>
      ${
        finals.length
          ? `<details class="matchday-results-details">
              <summary>
                <span>
                  <small>Completed Matchday</small>
                  <strong>${escapeHTML(weekText)} | ${escapeHTML(dateText)}</strong>
                </span>
                <b>${finals.length} ${finals.length === 1 ? "game" : "games"}</b>
              </summary>
              <div class="matchday-final-list">
              ${finals
                .map((match) => {
                  const { home, away } = getMatchTeams(data, match);
                  const winnerId = winnerTeamId(match);
                  return `
                    <article class="matchday-final-row">
                      <div>
                        <span class="pill green">${escapeHTML(match.label || `Game ${match.week}`)}</span>
                        <p>${escapeHTML(match.division || "LSL")} | ${escapeHTML(match.time || "Time TBA")}</p>
                      </div>
                      <div class="matchday-final-teams">
                        <a class="${winnerId === match.homeTeamId ? "winner" : ""}" href="${escapeHTML(teamProfileHref(match.homeTeamId, data.year))}">${escapeHTML(home?.name || match.homeTeamName || "Home team")}</a>
                        <strong>${escapeHTML(actualResultLabel(match))}</strong>
                        <a class="${winnerId === match.awayTeamId ? "winner" : ""}" href="${escapeHTML(teamProfileHref(match.awayTeamId, data.year))}">${escapeHTML(away?.name || match.awayTeamName || "Away team")}</a>
                      </div>
                      <span class="matchday-final-winner">${escapeHTML(actualWinnerText(data, match))}</span>
                    </article>
                  `;
                })
                .join("")}
              </div>
            </details>`
          : statusMessage("empty", "No final scores are posted for this season yet.")
      }
    </section>
  `;
}

async function render(data) {
  const divisions = availableDivisionOptions(data);
  if (!divisions.some((option) => option.value === state.division)) state.division = "All";
  const matches = selectedMatches(data);
  const weeks = matchdayOptions(matches);
  if (!weeks.some((option) => option.value === state.week)) state.week = "auto";
  const anchor = matchdayAnchor(matches);
  const dayMatches = sameMatchdayMatches(matches, anchor).map((match) => ({ ...match, data }));
  const first = dayMatches[0] || {};
  const completedCount = dayMatches.filter(isCompletedMatch).length;
  const seniorGames = dayMatches.filter((match) => match.division === "Seniors" && !match.activityTitle).length;
  const juniorActivities = dayMatches.filter((match) => match.division === "Juniors" || match.activityTitle).length;

  root.innerHTML = `
    <section class="section-panel matchday-hub-hero">
      <div class="section-head">
        <div>
          <span class="eyebrow">Matchday Hub</span>
          <h1>${escapeHTML(formatDateWithISO(first.date || data.event?.firstDay))}</h1>
          <p>${escapeHTML(data.event?.venue || SITE.venue)} | ${escapeHTML(timeRange(dayMatches))}</p>
        </div>
        <a class="text-link" href="./matches.html">All matches</a>
      </div>
      <div class="controls">
        ${controlSelect("season", "Season", SITE.seasons, state.season)}
        ${controlSelect("division", "Division", divisions, state.division)}
        ${controlSelect("week", "Matchday", weeks, state.week)}
      </div>
      <div class="matchday-summary-grid">
        <div class="summary-tile"><span>Senior Games</span><strong>${seniorGames}</strong><p>${completedCount ? `${completedCount} results posted` : "official schedule posted"}</p></div>
        <div class="summary-tile"><span>Juniors</span><strong>${juniorActivities || "TBA"}</strong><p>skills, dribbling, or scrimmage</p></div>
        <div class="summary-tile"><span>Field</span><strong>${escapeHTML(data.event?.venue || "Venue TBA")}</strong><p>${escapeHTML(data.event?.address || "Address TBA")}</p></div>
      </div>
    </section>

    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Schedule</span>
          <h2>Game Times</h2>
          <p>${dayMatches.length ? `${dayMatches.length} item${dayMatches.length === 1 ? "" : "s"} listed for this matchday.` : "No matchday items listed yet."}</p>
        </div>
      </div>
      ${renderScheduleList(data, dayMatches)}
    </section>

    ${renderFinalScoreList(data, matches)}

  `;

  ["season", "division", "week"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async (event) => {
      state[id] = event.target.value;
      if (id === "season" || id === "division") state.week = "auto";
      loadAndRender();
    });
  });
}

async function loadAndRender() {
  root.innerHTML = statusMessage("loading", "Loading matchday...");
  const data = await loadSeasonData(state.season);
  render(data);
}

loadAndRender();
