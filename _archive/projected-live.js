import { loadJSON, loadSeasonData } from "./dataLoader.js";
import { setupLayout } from "./main.js";
import { escapeHTML, initials, leadershipRoleLabel, leadershipRoleShort, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("projected.html");
setDocumentTitle("Projected");

const root = document.getElementById("page-root");

function getTeamMaps(seasonData) {
  return {
    teams: new Map((seasonData.teams || []).map((team) => [team.id, team])),
    coaches: new Map((seasonData.coaches || []).map((coach) => [coach.teamId, coach])),
  };
}

function teamName(teamId, maps) {
  return maps.teams.get(teamId)?.name || "Team TBA";
}

function coachName(teamId, maps) {
  return maps.coaches.get(teamId)?.name || maps.teams.get(teamId)?.coachName || "Coach TBA";
}

function goalDiff(row) {
  const diff = Number.isFinite(row.goalDifference) ? row.goalDifference : (Number(row.goalsFor) || 0) - (Number(row.goalsAgainst) || 0);
  return diff > 0 ? `+${diff}` : String(diff);
}

function teamMark(team) {
  const logoStyle = team?.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team?.logo) {
    return `<img class="team-logo" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${logoStyle}>`;
  }
  return `<span class="team-mark"${logoStyle}>${escapeHTML(initials(team?.name || "LSL", 3))}</span>`;
}

function teamLink(teamId, maps) {
  const team = maps.teams.get(teamId);
  if (!team) return escapeHTML(teamName(teamId, maps));
  return `<a href="${escapeHTML(teamProfileHref(team.id, "2026"))}">${escapeHTML(team.name)}</a>`;
}

function renderHero(projected) {
  return `
    <section class="section-panel projected-hero-panel">
      <div class="projected-hero">
        <div>
          <span class="eyebrow">${escapeHTML(projected.status || "Projected")} | ${escapeHTML(projected.officialStatus || "Not Official")}</span>
          <h1>${escapeHTML(projected.title || "2026 Projected Season")}</h1>
          <p>${escapeHTML(projected.summary || "Projection details coming soon.")}</p>
          <div class="projected-warning">
            <strong>Prediction only</strong>
            <span>This page does not show official standings, official match results, or confirmed playoff outcomes.</span>
          </div>
        </div>
        <aside class="projected-method-card">
          <span class="pill green">Projection Basis</span>
          <ul class="clean-list">
            ${(projected.methodology || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
          </ul>
          <p class="source-note">Last updated: ${escapeHTML(projected.lastUpdated || "Time TBA")}</p>
        </aside>
      </div>
    </section>
  `;
}

function renderOpeningNotes(projected) {
  const notes = projected.openingNotes || [];
  if (!notes.length) return "";
  return `
    <section class="section-panel projected-notice-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Matchday</span>
          <h2>Player Reminders</h2>
          <p>Important reminders for 2026 LSL matchdays.</p>
        </div>
        <span class="pill green">Please Read</span>
      </div>
      <div class="projected-note-grid">
        ${notes
          .map(
            (note) => `
              <article class="projected-note-card">
                <span>${escapeHTML(note.title || "Reminder")}</span>
                <p>${escapeHTML(note.message || "")}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProjectedStandings(projected, maps) {
  const rows = projected.standings || [];
  return `
    <section class="section-panel projected-main-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected | Not Official</span>
          <h2>Projected Standings</h2>
          <p>Ranked best to worst for the 2026 senior season prediction.</p>
        </div>
        <span class="pill">Prediction</span>
      </div>
      <div class="table-wrap projected-table-wrap">
        <table class="data-table projected-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th class="num">W</th>
              <th class="num">T</th>
              <th class="num">L</th>
              <th class="num">GF</th>
              <th class="num">GA</th>
              <th class="num">GD</th>
              <th class="num">PTS</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const team = maps.teams.get(row.teamId);
                return `
                  <tr>
                    <td data-label="Rank"><span class="rank-badge">${escapeHTML(row.rank)}</span></td>
                    <td data-label="Team">
                      <div class="projected-team-cell">
                        ${teamMark(team)}
                        <div>
                          <strong>${teamLink(row.teamId, maps)}</strong>
                          <span>Projected | Not Official</span>
                        </div>
                      </div>
                    </td>
                    <td class="num" data-label="Wins">${escapeHTML(row.wins)}</td>
                    <td class="num" data-label="Ties">${escapeHTML(row.ties)}</td>
                    <td class="num" data-label="Losses">${escapeHTML(row.losses)}</td>
                    <td class="num" data-label="Goals For">${escapeHTML(row.goalsFor)}</td>
                    <td class="num" data-label="Goals Against">${escapeHTML(row.goalsAgainst)}</td>
                    <td class="num" data-label="Goal Difference">${escapeHTML(goalDiff(row))}</td>
                    <td class="num" data-label="Points"><strong>${escapeHTML(row.points)}</strong></td>
                    <td data-label="Reason">${escapeHTML(row.reason)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderRosterDetails(team) {
  const roster = team?.roster || [];
  if (!roster.length) return "";
  return `
    <details class="projection-roster-details">
      <summary>Roster (${roster.length})</summary>
      <ul>
        ${roster
          .map(
            (player) => `
              <li>
                <a href="./player.html?id=${escapeHTML(player.id)}">
                  ${leadershipRoleShort(player.leadershipRole) ? `<span class="roster-leader-chip ${escapeHTML(player.leadershipRole)}" title="${escapeHTML(leadershipRoleLabel(player.leadershipRole))}">${escapeHTML(leadershipRoleShort(player.leadershipRole))}</span>` : ""}
                  ${escapeHTML(player.name)}
                </a>
                <span>${escapeHTML(player.position || "Field")}</span>
              </li>
            `
          )
          .join("")}
      </ul>
    </details>
  `;
}

function renderTeamCards(projected, maps) {
  const cards = [...(projected.teams || [])].sort((a, b) => (parseInt(a.projectedFinish, 10) || 99) - (parseInt(b.projectedFinish, 10) || 99));
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected | Not Official</span>
          <h2>Team Projections</h2>
          <p>Each card gives the predicted finish and quick team outlook.</p>
        </div>
      </div>
      <div class="projection-card-grid">
        ${cards
          .map((card) => {
            const team = maps.teams.get(card.teamId);
            return `
              <article class="card projection-card">
                <div class="projection-card-head">
                  ${teamMark(team)}
                  <div>
                    <span class="pill">${escapeHTML(card.projectedFinish || "Projected")}</span>
                    <h3>${teamLink(card.teamId, maps)}</h3>
                    <p>Coach: ${escapeHTML(coachName(card.teamId, maps))}</p>
                  </div>
                </div>
                <div class="projection-key-row">
                  ${(card.keyPlayers || []).map((player) => `<span>${escapeHTML(player)}</span>`).join("")}
                </div>
                ${renderRosterDetails(team)}
                <dl class="projection-detail-list">
                  <div>
                    <dt>Strength</dt>
                    <dd>${escapeHTML(card.strength || "Not listed")}</dd>
                  </div>
                  <div>
                    <dt>Weakness</dt>
                    <dd>${escapeHTML(card.weakness || "Not listed")}</dd>
                  </div>
                </dl>
                <p>${escapeHTML(card.explanation || "Projection note coming soon.")}</p>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function projectedScore(match) {
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    return `${match.homeScore} - ${match.awayScore}`;
  }
  return "vs";
}

function scorerText(scorer) {
  if (!scorer?.name) return "";
  const goals = Number(scorer.goals) || 1;
  return `${scorer.name}${goals > 1 ? ` x${goals}` : ""}`;
}

function renderScorerRows(match) {
  const homeScorers = match.scorers?.home || [];
  const awayScorers = match.scorers?.away || [];
  const rowCount = Math.max(homeScorers.length, awayScorers.length);
  if (!rowCount) return "";

  return Array.from({ length: rowCount })
    .map((_, index) => {
      const home = scorerText(homeScorers[index]);
      const away = scorerText(awayScorers[index]);
      return `
        <div class="projected-scorer-row">
          <span>${escapeHTML(home)}</span>
          <strong>Goals</strong>
          <span>${escapeHTML(away)}</span>
        </div>
      `;
    })
    .join("");
}

function renderProjectedMatch(match, maps) {
  const scorerRows = renderScorerRows(match);
  const scoreLabel = match.scoreLabel || "Projected Final";
  const scorerLabel = match.scorerLabel || "Projected scorers";
  return `
    <article class="projected-match-card">
      <div class="projected-match-row">
        <span class="projected-match-team">${teamLink(match.homeTeamId, maps)}</span>
        <div class="projected-score-box">
          <small>${escapeHTML(scoreLabel)}</small>
          <strong>${escapeHTML(projectedScore(match))}</strong>
        </div>
        <span class="projected-match-team right">${teamLink(match.awayTeamId, maps)}</span>
      </div>
      ${match.time ? `<p class="projected-match-time">${escapeHTML(match.time)}</p>` : ""}
      ${
        scorerRows
          ? `<details class="projected-scorer-details">
              <summary>${escapeHTML(scorerLabel)}</summary>
              <div class="projected-scorer-board">
                <div class="projected-scorer-head">
                  <span>${teamLink(match.homeTeamId, maps)}</span>
                  <strong>Stat</strong>
                  <span>${teamLink(match.awayTeamId, maps)}</span>
                </div>
                ${scorerRows}
              </div>
            </details>`
          : ""
      }
    </article>
  `;
}

function renderSchedule(projected, maps) {
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected | Not Official</span>
          <h2>Projected Week-By-Week Matches</h2>
          <p>Weeks already played show posted finals. Future weeks stay clearly marked as predictions.</p>
        </div>
      </div>
      <div class="projected-week-list">
        ${(projected.schedule || [])
          .map(
            (week) => `
              <article class="projected-week-card">
                <div class="projected-week-head">
                  <span class="pill green">Week ${escapeHTML(week.week)}</span>
                  <strong>Projected matchups</strong>
                </div>
                <div class="projected-match-list">
                  ${(week.matches || [])
                    .map((match) => renderProjectedMatch(match, maps))
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function playoffTeamLine(match, side, maps) {
  const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
  const seed = side === "home" ? match.homeSeed : match.awaySeed;
  const score = side === "home" ? match.homeScore : match.awayScore;
  const isWinner = match.winnerTeamId === teamId;
  return `
    <div class="projected-bracket-team${isWinner ? " winner" : ""}">
      <span>${seed ? `#${escapeHTML(seed)}` : "Seed"}</span>
      <strong>${teamLink(teamId, maps)}</strong>
      <b>${Number.isFinite(score) ? escapeHTML(score) : ""}</b>
    </div>
  `;
}

function renderProjectedPlayoffs(projected, maps) {
  const playoffs = projected.playoffs || {};
  const championName = teamName(playoffs.championTeamId, maps);
  return `
    <section class="section-panel projected-playoff-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected Playoffs | Not Official</span>
          <h2>Projected Senior Playoff Bracket</h2>
          <p>${escapeHTML(playoffs.formatNote || "Projected playoff format coming soon.")}</p>
        </div>
        <span class="pill green">Prediction</span>
      </div>
      <div class="projected-bracket">
        ${(playoffs.rounds || [])
          .map(
            (round) => `
              <section class="projected-bracket-round">
                <h3>${escapeHTML(round.name)}</h3>
                ${(round.matches || [])
                  .map(
                    (match) => `
                      <article class="projected-bracket-match">
                        <span class="pill">${escapeHTML(match.label || round.name)}</span>
                        ${playoffTeamLine(match, "home", maps)}
                        ${playoffTeamLine(match, "away", maps)}
                        ${match.note ? `<p class="source-note">${escapeHTML(match.note)}</p>` : ""}
                        ${
                          renderScorerRows(match)
                            ? `<details class="projected-scorer-details compact">
                                <summary>Projected scorers</summary>
                                <div class="projected-scorer-board">
                                  <div class="projected-scorer-head">
                                    <span>${teamLink(match.homeTeamId, maps)}</span>
                                    <strong>Stat</strong>
                                    <span>${teamLink(match.awayTeamId, maps)}</span>
                                  </div>
                                  ${renderScorerRows(match)}
                                </div>
                              </details>`
                            : ""
                        }
                      </article>
                    `
                  )
                  .join("")}
              </section>
            `
          )
          .join("")}
      </div>
      <div class="projected-champion-card">
        <span class="eyebrow">Projected Champion | Prediction Only</span>
        <h3>${escapeHTML(championName)}</h3>
        <p>${escapeHTML(playoffs.championNote || "This champion pick is not official.")}</p>
      </div>
    </section>
  `;
}

function render(projected, seasonData) {
  const maps = getTeamMaps(seasonData);
  root.innerHTML = `
    ${renderHero(projected)}
    ${renderOpeningNotes(projected)}
    ${renderProjectedStandings(projected, maps)}
    ${renderTeamCards(projected, maps)}
    ${renderSchedule(projected, maps)}
    ${renderProjectedPlayoffs(projected, maps)}
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading projected season...");
  const [seasonData, projected] = await Promise.all([
    loadSeasonData("2026"),
    loadJSON("./data/2026/projected.json", null),
  ]);

  if (!projected) {
    root.innerHTML = statusMessage("empty", "Projected 2026 details are coming soon.");
    return;
  }

  render(projected, seasonData);
}

init();
