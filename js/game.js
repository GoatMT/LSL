import { renderFormStrip } from "../components/formStrip.js";
import { renderMatchCard } from "../components/matchCard.js";
import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { calculateTeamForm, calculateTeamRecord, getMatchTeams, scoreText, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { escapeHTML, formatDateWithISO, getQueryParam, initials, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("matches.html");

const root = document.getElementById("page-root");

function teamMark(team) {
  const logoStyle = team?.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team?.logo) {
    return `<img class="team-profile-logo" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name || "Team")} logo"${logoStyle}>`;
  }
  return `<span class="team-profile-mark"${logoStyle}>${escapeHTML(initials(team?.name || "TBD", 3))}</span>`;
}

function renderMissing(title, message) {
  setDocumentTitle(title);
  root.innerHTML = `
    <section class="section-panel not-found-panel">
      <div class="not-found-code">404</div>
      <span class="eyebrow">${escapeHTML(title)}</span>
      <h1>${escapeHTML(message)}</h1>
      <p>The link may be old, incomplete, or moved. Head back to the schedule to find the game you're looking for.</p>
      <div class="button-row not-found-actions">
        <a class="button primary" href="./matchday.html">Matchday Hub</a>
        <a class="button" href="./matches.html">All Matches</a>
      </div>
    </section>
  `;
}

function findMatch(allData, id, preferredSeason) {
  if (!id) return null;
  const preferred = allData.find((data) => data.year === String(preferredSeason));
  const preferredMatch = (preferred?.matches || []).find((match) => match.id === id);
  if (preferredMatch) return { data: preferred, match: preferredMatch };
  for (const data of [...allData].reverse()) {
    const match = (data.matches || []).find((item) => item.id === id);
    if (match) return { data, match };
  }
  return null;
}

function renderTeamSummary(data, team, stageLabel, stageOptionsKey, form) {
  const record = team ? calculateTeamRecord(data, team.id, { stage: stageOptionsKey }) : null;
  return `
    <article class="card game-team-summary">
      <a href="${escapeHTML(teamProfileHref(team?.id, data.year))}"><strong>${escapeHTML(team?.name || "Team TBA")}</strong></a>
      <span class="source-note">${escapeHTML(stageLabel)} record this season</span>
      <div class="stat-grid">
        <div class="stat-box"><span>Record</span><strong>${record?.w ?? 0}-${record?.d ?? 0}-${record?.l ?? 0}</strong></div>
        <div class="stat-box"><span>Points</span><strong>${record?.pts ?? 0}</strong></div>
        <div class="stat-box"><span>Goals For</span><strong>${record?.gf ?? 0}</strong></div>
        <div class="stat-box"><span>Goal Diff</span><strong>${record?.gd > 0 ? "+" : ""}${record?.gd ?? 0}</strong></div>
      </div>
      ${renderFormStrip(form)}
    </article>
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading game...");
  const id = getQueryParam("id");
  const seasonParam = getQueryParam("season") || SITE.defaultSeason;
  const allData = await loadAllSeasons();
  const found = findMatch(allData, id, seasonParam);

  if (!found) {
    renderMissing("Game Not Found", "This game could not be found.");
    return;
  }

  const { data, match } = found;

  if (match.activityTitle) {
    renderMissing("No Game Page", "This is a Junior activity, not an individual game.");
    return;
  }

  const { home, away } = getMatchTeams(data, match);
  const winner = winnerTeamId(match);
  const stageKey = match.stage === "playoffs" ? "all" : "regular";
  const stageLabel = match.stage === "playoffs" ? "Regular season + playoffs" : "Regular season";
  const homeForm = home ? calculateTeamForm(data, home.id, { stage: stageKey }) : [];
  const awayForm = away ? calculateTeamForm(data, away.id, { stage: stageKey }) : [];
  const homeName = home?.name || match.homeTeamName || "Home team";
  const awayName = away?.name || match.awayTeamName || "Away team";

  setDocumentTitle(`${homeName} vs ${awayName}`);

  root.innerHTML = `
    <section class="section-panel game-hero-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(data.year)} ${escapeHTML(match.division || "LSL")} | ${escapeHTML(match.label || `Week ${match.week}`)}</span>
          <h1>${escapeHTML(homeName)} vs ${escapeHTML(awayName)}</h1>
          <p>${escapeHTML(formatDateWithISO(match.date))} | ${escapeHTML(match.time || "Time TBA")}</p>
        </div>
        <a class="text-link" href="./matchday.html">Matchday hub</a>
      </div>
      <div class="game-hero-scoreline">
        <a class="game-hero-team${winner && home?.id === winner ? " winner" : ""}" href="${escapeHTML(teamProfileHref(home?.id, data.year))}">
          ${teamMark(home)}
          <strong>${escapeHTML(homeName)}</strong>
        </a>
        <div class="game-hero-score">${escapeHTML(scoreText(match))}</div>
        <a class="game-hero-team${winner && away?.id === winner ? " winner" : ""}" href="${escapeHTML(teamProfileHref(away?.id, data.year))}">
          ${teamMark(away)}
          <strong>${escapeHTML(awayName)}</strong>
        </a>
      </div>
    </section>

    <section class="section-panel">
      ${renderMatchCard(data, { ...match, detailsOpen: true })}
    </section>

    <section class="section-panel game-teams-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Season Form</span>
          <h2>Both Teams Coming In</h2>
          <p>How each team looked heading into this game, plus their last five results.</p>
        </div>
      </div>
      <div class="game-teams-grid">
        ${renderTeamSummary(data, home, stageLabel, stageKey, homeForm)}
        ${renderTeamSummary(data, away, stageLabel, stageKey, awayForm)}
      </div>
    </section>
  `;
}

init();
