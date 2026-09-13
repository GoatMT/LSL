import { renderFormStrip } from "../components/formStrip.js";
import { renderMatchCard } from "../components/matchCard.js?v=3.2";
import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { calculateTeamForm, calculateTeamRecord, computePlayerStats, getMatchTeams, scoreText, winnerTeamId } from "./leagueEngine.js?v=3.12";
import { setupLayout } from "./main.js";
import { initShareButtons, renderShareButtons } from "./shareLinks.js";
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

function formScoreOf(form = []) {
  const results = (form || []).map((item) => (typeof item === "string" ? item : item?.result)).filter(Boolean);
  if (!results.length) return 0.5;
  const points = results.reduce((sum, result) => sum + (String(result).toUpperCase() === "W" ? 1 : String(result).toUpperCase() === "D" ? 0.5 : 0), 0);
  return points / results.length;
}

function teamStrength(record, form) {
  const gp = record?.gp || 0;
  if (!gp) return 0.35;
  const ppg = (record.pts || 0) / gp;
  const gdPerGame = (record.gd || 0) / gp;
  return ppg / 3 + gdPerGame * 0.12 + formScoreOf(form) * 0.35;
}

function winProbabilities(homeRecord, awayRecord, homeForm, awayForm) {
  const homeStrength = Math.max(0.05, teamStrength(homeRecord, homeForm) + 0.05);
  const awayStrength = Math.max(0.05, teamStrength(awayRecord, awayForm));
  const total = homeStrength + awayStrength;
  const homePct = Math.min(90, Math.max(10, Math.round((homeStrength / total) * 100)));
  return { home: homePct, away: 100 - homePct };
}

function renderWinProbability(homeName, awayName, homeRecord, awayRecord, homeForm, awayForm) {
  const hasHistory = (homeRecord?.gp || 0) > 0 || (awayRecord?.gp || 0) > 0;
  const probs = winProbabilities(homeRecord, awayRecord, homeForm, awayForm);

  return `
    <div class="game-win-prob">
      <div class="game-win-prob-head">
        <span class="eyebrow">Win Probability</span>
        <p>${hasHistory ? "Estimated from each team's record, goal difference, and recent form." : "Not enough games played yet for a confident estimate."}</p>
      </div>
      <div class="game-win-prob-labels">
        <span>${escapeHTML(homeName)}</span>
        <span>${escapeHTML(awayName)}</span>
      </div>
      <div class="game-win-prob-bar" role="img" aria-label="${escapeHTML(homeName)} ${probs.home}% chance, ${escapeHTML(awayName)} ${probs.away}% chance">
        <span class="game-win-prob-fill home" style="width:${probs.home}%">${probs.home}%</span>
        <span class="game-win-prob-fill away" style="width:${probs.away}%">${probs.away}%</span>
      </div>
    </div>
  `;
}

function teamTopScorers(data, teamId, stageKey) {
  if (!teamId) return [];
  return computePlayerStats(data, { stage: stageKey })
    .filter((player) => player.teamId === teamId)
    .filter((player) => player.gamesPlayed > 0 && player.goals > 0)
    .map((player) => ({ ...player, goalsPerGame: player.goals / player.gamesPlayed }))
    .sort((a, b) => b.goalsPerGame - a.goalsPerGame || b.goals - a.goals)
    .slice(0, 3);
}

function renderTopScorers(data, teamId, stageKey) {
  const players = teamTopScorers(data, teamId, stageKey);
  if (!players.length) return `<div class="game-top-scorers"><span class="eyebrow">Most Likely To Score</span>${statusMessage("empty", "No goals recorded yet this season.")}</div>`;
  const maxRate = Math.max(...players.map((player) => player.goalsPerGame), 0.01);

  return `
    <div class="game-top-scorers">
      <span class="eyebrow">Most Likely To Score</span>
      <div class="game-top-scorer-list">
        ${players
          .map(
            (player) => `
              <a class="game-top-scorer-row" href="./player.html?id=${encodeURIComponent(player.id)}">
                <span class="game-top-scorer-name">${escapeHTML(player.name)}</span>
                <div class="game-top-scorer-bar"><span style="width:${Math.max(6, (player.goalsPerGame / maxRate) * 100)}%"></span></div>
                <span class="game-top-scorer-rate">${player.goals} goals | ${player.goalsPerGame.toFixed(2)} G/G</span>
              </a>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function findGoalie(data, teamId) {
  if (!teamId) return null;
  return (data.players || []).find((player) => player.teamId === teamId && String(player.position).toLowerCase() === "goalie") || null;
}

function goalieAvatar(goalie) {
  if (goalie?.photo) {
    return `<img class="game-goalie-photo" src="${escapeHTML(goalie.photo)}" alt="${escapeHTML(goalie.name)}">`;
  }
  return `<span class="game-goalie-photo placeholder">${escapeHTML(initials(goalie?.name || "TBD"))}</span>`;
}

function goalieCard(team, goalie) {
  const href = goalie ? `./player.html?id=${encodeURIComponent(goalie.id)}` : `./team.html?id=${encodeURIComponent(team?.id || "")}`;
  return `
    <a class="game-goalie-card" href="${escapeHTML(href)}">
      ${goalieAvatar(goalie)}
      <div class="game-goalie-copy">
        <span class="eyebrow">${escapeHTML(team?.name || "Team TBA")}</span>
        <strong>${escapeHTML(goalie?.name || "Goalie TBA")}</strong>
        ${goalie?.jersey ? `<small>#${escapeHTML(goalie.jersey)}</small>` : ""}
      </div>
    </a>
  `;
}

function renderStartingGoalies(data, home, away) {
  const homeGoalie = findGoalie(data, home?.id);
  const awayGoalie = findGoalie(data, away?.id);
  if (!homeGoalie && !awayGoalie) return "";

  return `
    <div class="game-goalies">
      <span class="eyebrow">Starting Goalies</span>
      <div class="game-goalies-grid">
        ${goalieCard(home, homeGoalie)}
        ${goalieCard(away, awayGoalie)}
      </div>
    </div>
  `;
}

function matchGameNumber(match) {
  const idParts = String(match?.id || "").split("-");
  const gameIndex = idParts.indexOf("game");
  if (gameIndex >= 0 && Number.isFinite(Number(idParts[gameIndex + 1]))) {
    const globalGame = Number(idParts[gameIndex + 1]);
    return ((globalGame - 1) % 4) + 1;
  }

  const labelMatch = String(match?.label || "").match(/game\s+(\d+)/i);
  return labelMatch ? Number(labelMatch[1]) : null;
}

function matchDisplayLabel(match) {
  if (match?.label && !/^game\s+\d+$/i.test(String(match.label))) return match.label;
  if (match?.week && matchGameNumber(match)) return `Week ${match.week} Game ${matchGameNumber(match)}`;
  return match?.label || (match?.week ? `Week ${match.week}` : "Match");
}

function mediaBelongsToMatch(item, match) {
  if (!item || !match) return false;
  const ids = [item.matchId, item.gameId, ...(Array.isArray(item.matchIds) ? item.matchIds : [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (ids.includes(String(match.id || "").toLowerCase())) return true;

  const week = Number(match.week);
  const game = matchGameNumber(match);
  const itemWeek = Number(item.week ?? item.matchWeek);
  const itemGame = Number(item.game ?? item.gameNumber ?? item.matchNumber);
  if (Number.isFinite(week) && Number.isFinite(game) && itemWeek === week && itemGame === game) return true;

  const references = [item.matchReference, item.matchLabel, item.gameLabel, item.title, item.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const label = matchDisplayLabel(match).toLowerCase();
  return Boolean(label && references.includes(label));
}

function renderGameMediaCard(item, type) {
  const isPhoto = type === "photo";
  const source = isPhoto ? item.imageUrl : item.videoUrl;
  const title = item.title || (isPhoto ? "Match photo" : "Match video");
  const media = source
    ? isPhoto
      ? `<img src="${escapeHTML(source)}" alt="${escapeHTML(title)}" loading="lazy">`
      : `<video controls preload="metadata" src="${escapeHTML(source)}"></video>`
    : `<span>${escapeHTML(isPhoto ? "Photo coming soon" : "Video coming soon")}</span>`;

  return `
    <article class="card media-card game-media-card">
      <div class="game-media-thumb ${isPhoto ? "photo-thumb" : "video-thumb"}">${media}</div>
      <span class="pill">${escapeHTML(item.category || (isPhoto ? "Photo" : "Video"))}</span>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(item.description || `${isPhoto ? "Photo" : "Video"} details will be posted soon.`)}</p>
    </article>
  `;
}

function renderGameMedia(data, match) {
  const photos = (data.photos || []).filter((item) => mediaBelongsToMatch(item, match));
  const videos = (data.videos || []).filter((item) => mediaBelongsToMatch(item, match));
  const items = [
    ...photos.map((item) => ({ item, type: "photo" })),
    ...videos.map((item) => ({ item, type: "video" })),
  ];

  return `
    <section class="section-panel game-media-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Match Media</span>
          <h2>Photos and Videos</h2>
          <p>Matchday moments will appear here as they are posted.</p>
        </div>
      </div>
      ${items.length ? `<div class="game-media-grid">${items.map(({ item, type }) => renderGameMediaCard(item, type)).join("")}</div>` : `<div class="empty-state">Photos and videos for this game are coming soon.</div>`}
    </section>
  `;
}

function renderDataCompleteness(match) {
  const hasScore = Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
  if (!hasScore) return "";

  const expectedGoals = Number(match.homeScore) + Number(match.awayScore);
  const listedGoals = (match.scorers || match.goalscorers || []).reduce((sum, scorer) => sum + (Number(scorer.goals) || 0), 0);
  const missing = [];
  if (expectedGoals > 0 && listedGoals !== expectedGoals) {
    missing.push(`${listedGoals} of ${expectedGoals} goals have a scorer listed`);
  }
  if (!Array.isArray(match.assists)) missing.push("assists are not listed");
  if (!Array.isArray(match.shots)) missing.push("shots are not listed");

  return `
    <section class="section-panel game-data-completeness ${missing.length ? "is-incomplete" : "is-complete"}" aria-label="Match data status">
      <div class="game-data-completeness-icon" aria-hidden="true">${missing.length ? "!" : "✓"}</div>
      <div>
        <span class="eyebrow">Match Data Status</span>
        <h2>${missing.length ? "Some scoring data is incomplete" : "Full score and event data recorded"}</h2>
        <p>${escapeHTML(missing.length ? `This match has a final score, but ${missing.join(" and ")}.` : "The final score, listed scorers, assists, and shots are all recorded.")}</p>
      </div>
    </section>
  `;
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
      ${renderFormStrip(form, "Regular Season")}
      ${renderTopScorers(data, team?.id, stageOptionsKey)}
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
  const homeForm = home ? calculateTeamForm(data, home.id, { stage: "regular", limit: 100 }) : [];
  const awayForm = away ? calculateTeamForm(data, away.id, { stage: "regular", limit: 100 }) : [];
  const homeRecord = home ? calculateTeamRecord(data, home.id, { stage: stageKey }) : null;
  const awayRecord = away ? calculateTeamRecord(data, away.id, { stage: stageKey }) : null;
  const homeName = home?.name || match.homeTeamName || "Home team";
  const awayName = away?.name || match.awayTeamName || "Away team";

  setDocumentTitle(`${homeName} vs ${awayName}`);

  root.innerHTML = `
    <section class="section-panel game-hero-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(data.year)} ${escapeHTML(match.division || "LSL")} | ${escapeHTML(matchDisplayLabel(match))}</span>
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
      ${renderWinProbability(homeName, awayName, homeRecord, awayRecord, homeForm, awayForm)}
      ${renderStartingGoalies(data, home, away)}
      ${renderShareButtons(window.location.href, `${homeName} vs ${awayName}`, { label: "Share This Game" })}
    </section>

    <section class="section-panel">
      ${renderMatchCard(data, { ...match, detailsOpen: true })}
    </section>

    ${renderDataCompleteness(match)}

    <section class="section-panel game-teams-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Season Form</span>
          <h2>Both Teams Coming In</h2>
          <p>How each team looked heading into this game: full regular-season record, results, and their top scoring threats.</p>
        </div>
      </div>
      <div class="game-teams-grid">
        ${renderTeamSummary(data, home, stageLabel, stageKey, homeForm)}
        ${renderTeamSummary(data, away, stageLabel, stageKey, awayForm)}
      </div>
    </section>

    ${renderGameMedia(data, match)}
  `;

  initShareButtons(root);
}

init();
