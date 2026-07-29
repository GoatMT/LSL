import { playerMap, scoreText, teamMap, winnerTeamId } from "../js/leagueEngine.js";
import { escapeHTML, formatDateWithISO, joinNames, teamProfileHref } from "../js/utils.js";

function playerHref(playerId = "") {
  return playerId ? `./player.html?id=${encodeURIComponent(playerId)}` : "./players.html";
}

function eventText(event, players, key) {
  const player = players.get(event.playerId);
  const name = event.name || player?.name || "Unknown";
  const count = Number(event[key]) || 0;
  const jersey = event.jersey || player?.jersey || "";
  const label = key === "goals" ? "goal" : key === "assists" ? "assist" : "shot";
  const countText = count > 1 ? ` - ${count} ${label}s` : "";
  return `${escapeHTML(name)}${jersey ? ` #${escapeHTML(jersey)}` : ""}${countText}`;
}

function splitEventsByTeam(events = [], players, match, key) {
  const home = [];
  const away = [];
  const unknown = [];

  events.forEach((event) => {
    const playerTeamId = event.teamId || players.get(event.playerId)?.teamId || "";
    if (playerTeamId === match.homeTeamId) home.push(event);
    else if (playerTeamId === match.awayTeamId) away.push(event);
    else unknown.push(event);
  });

  if (key === "goals" && Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    unknown.forEach((event) => {
      const count = Number(event[key]) || 0;
      const homeTotal = home.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
      const awayTotal = away.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
      if (homeTotal + count <= match.homeScore) home.push(event);
      else if (awayTotal + count <= match.awayScore) away.push(event);
      else home.push(event);
    });
  } else {
    home.push(...unknown);
  }

  return { home, away };
}

function renderStatBlock(title, events, players, match, key) {
  const { home, away } = splitEventsByTeam(events, players, match, key);
  const rowCount = Math.max(home.length, away.length);
  if (rowCount === 0) return "";

  const rows = Array.from({ length: rowCount }, (_, index) => {
    const homeEvent = home[index];
    const awayEvent = away[index];
    return `
      <div class="match-stat-row">
        <span class="match-stat-player">${homeEvent ? eventText(homeEvent, players, key) : ""}</span>
        <span class="match-stat-label">${index === 0 ? escapeHTML(title) : ""}</span>
        <span class="match-stat-player right">${awayEvent ? eventText(awayEvent, players, key) : ""}</span>
      </div>
    `;
  }).join("");

  return `<div class="match-stat-block">${rows}</div>`;
}

function renderMatchStars(match, players) {
  const stars = (match.stars || []).filter((star) => star && (star.name || star.playerId));
  if (!stars.length) return "";

  return `
    <div class="match-stars-card">
      <div class="match-stars-head">
        <span class="eyebrow">Match Info</span>
        <strong>3 Stars of the Match</strong>
      </div>
      <div class="match-stars-list">
        ${stars
          .map((star, index) => {
            const player = players.get(star.playerId) || {};
            const name = star.name || player.name || "Player TBA";
            return `
              <a class="match-star-row" href="${escapeHTML(playerHref(star.playerId || player.id || ""))}">
                <span class="match-star-rank">${escapeHTML(star.rank || index + 1)}</span>
                <div>
                  <strong>${escapeHTML(name)}</strong>
                  <small>${escapeHTML(star.teamName || player.teamName || "Team TBA")}</small>
                </div>
                <p>${escapeHTML(star.note || "Match impact")}</p>
              </a>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function visibleStatusPill(match, hasScore) {
  const status = String(match.status || "").trim();
  if (!status) return "";
  if (/^(complete|completed|scheduled|scheduled activity)$/i.test(status)) return "";
  if (hasScore && /^final$/i.test(status)) return "";
  return `<span class="pill">${escapeHTML(status)}</span>`;
}

export function renderMatchCard(data, match) {
  const teams = teamMap(data);
  const players = playerMap(data);
  const home = teams.get(match.homeTeamId);
  const away = teams.get(match.awayTeamId);
  const winner = winnerTeamId(match);
  const pom = match.playerOfMatchId ? players.get(match.playerOfMatchId)?.name || match.playerOfMatch || "" : match.playerOfMatch || "";
  const hasScore = Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
  const statBlocks = [
    renderStatBlock("Goals", match.scorers || [], players, match, "goals"),
    renderStatBlock("Shots", match.shots || [], players, match, "shots"),
    renderStatBlock("Assists", match.assists || [], players, match, "assists"),
  ].join("");
  const matchMeta = `${escapeHTML(match.division)} | ${escapeHTML(formatDateWithISO(match.date))}`;
  const timePill = match.time ? `<span class="match-time-pill">${escapeHTML(match.time)}</span>` : "";

  if (match.activityTitle) {
    return `
      <article class="card match-card">
        <div class="match-topline">
          <div>
            <span class="pill green">${escapeHTML(match.label || `Week ${match.week}`)}</span>
            <div class="match-meta-line">
              <p class="source-note">${matchMeta}</p>
              ${timePill}
            </div>
          </div>
          <div class="match-status-stack">
            ${visibleStatusPill(match, false)}
          </div>
        </div>
        <div class="match-activity-card">
          <span class="eyebrow">Week ${escapeHTML(match.week)} Activity</span>
          <h3>${escapeHTML(match.activityTitle)}</h3>
          <p>${escapeHTML(match.time || "Time TBA")}</p>
        </div>
        <details class="clean-details"${match.detailsOpen ? " open" : ""}>
          <summary>Activity details</summary>
          <ul class="detail-list compact">
            <li><strong>Activity</strong><span>${escapeHTML(match.activityTitle)}</span></li>
            <li><strong>Notes</strong><span>${escapeHTML(joinNames(match.notes || [], "No extra notes listed"))}</span></li>
          </ul>
        </details>
      </article>
    `;
  }

  return `
    <article class="card match-card">
      <div class="match-topline">
        <div>
          <span class="pill ${match.stage === "playoffs" ? "" : "green"}">${escapeHTML(match.label || `Week ${match.week}`)}</span>
          <div class="match-meta-line">
            <p class="source-note">${matchMeta}</p>
            ${timePill}
          </div>
        </div>
        <div class="match-status-stack">
          ${visibleStatusPill(match, hasScore)}
        </div>
      </div>
      <div class="match-scoreline">
        <div class="match-team">
          <strong><a href="${escapeHTML(teamProfileHref(match.homeTeamId, data.year))}">${escapeHTML(home?.name || match.homeTeamName || "Home team")}</a></strong>
          ${winner === match.homeTeamId ? `<span class="source-note">Winner</span>` : ""}
        </div>
        <div class="score-box">${escapeHTML(scoreText(match))}</div>
        <div class="match-team right">
          <strong><a href="${escapeHTML(teamProfileHref(match.awayTeamId, data.year))}">${escapeHTML(away?.name || match.awayTeamName || "Away team")}</a></strong>
          ${winner === match.awayTeamId ? `<span class="source-note">Winner</span>` : ""}
        </div>
      </div>
      <details class="clean-details"${match.detailsOpen ? " open" : ""}>
        <summary>Match details</summary>
        ${
          statBlocks
            ? `<div class="match-stat-board">
                <div class="match-stat-teams">
                  <strong>${escapeHTML(home?.name || match.homeTeamName || "Home team")}</strong>
                  <span>Stats</span>
                  <strong>${escapeHTML(away?.name || match.awayTeamName || "Away team")}</strong>
                </div>
                ${statBlocks}
              </div>`
            : ""
        }
        ${renderMatchStars(match, players)}
        <ul class="detail-list compact">
          <li><strong>Player of match</strong><span>${escapeHTML(pom || "Not listed")}</span></li>
          <li><strong>Match notes</strong><span>${escapeHTML(joinNames(match.notes || [], "No extra notes listed"))}</span></li>
        </ul>
      </details>
    </article>
  `;
}
