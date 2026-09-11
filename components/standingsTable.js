import { escapeHTML, initials, teamProfileHref } from "../js/utils.js";
import { SITE } from "../js/config.js";

function statusBadge(row, season = "") {
  if (row.notStarted) return `<span class="source-note">Not started yet</span>`;
  if (row.scorePending) return `<span class="pill">Score pending</span>`;
  if (row.rank === 1) return `<span class="pill">President Trophy</span>`;
  if (row.bye) return `<span class="pill green">Semifinal bye</span>`;
  if (row.playoff) return `<span class="pill">Playoff seed</span>`;
  if (String(season) === String(SITE.defaultSeason)) return `<span class="pill red">Outside Playoff Line</span>`;
  return `<span class="pill red">Missed Playoffs</span>`;
}

function teamMark(team) {
  const logoStyle = team.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team.logo) {
    return `<img class="team-logo small" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${logoStyle}>`;
  }
  return `<span class="team-mark"${logoStyle}>${escapeHTML(initials(team.name, 3))}</span>`;
}

function movementBadge(row) {
  if (!Number.isFinite(row.rankChange)) return `<span class="movement-badge neutral">-</span>`;
  if (row.rankChange > 0) return `<span class="movement-badge up">+${row.rankChange}</span>`;
  if (row.rankChange < 0) return `<span class="movement-badge down">${row.rankChange}</span>`;
  return `<span class="movement-badge same">0</span>`;
}

export function renderStandingsTable(rows = [], season = "") {
  if (!rows.length) {
    return `<div class="empty-state">No standings are available for this selection yet.</div>`;
  }
  const showMovement = rows.some((row) => Number.isFinite(row.rankChange));

  return `
    <div class="table-wrap standings-table-wrap">
      <table class="data-table standings-table">
        <thead>
          <tr>
            <th class="num">Rank</th>
            ${showMovement ? `<th class="num">Move</th>` : ""}
            <th>Team</th>
            <th>Status</th>
            <th class="num">GP</th>
            <th class="num">W</th>
            <th class="num">D</th>
            <th class="num">L</th>
            <th class="num">PTS</th>
            <th class="num">GF</th>
            <th class="num">GA</th>
            <th class="num">GD</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr class="standings-row${row.bye ? " bye" : row.playoff ? " playoff" : !row.notStarted && !row.scorePending ? " outside" : ""}">
                  <td class="num standings-rank-cell" data-label="Rank">${escapeHTML(row.rankLabel || row.rank)}</td>
                  ${showMovement ? `<td class="num standings-move-cell" data-label="Move">${movementBadge(row)}</td>` : ""}
                  <td class="standings-team-cell" data-label="Team">
                    <div class="team-cell">
                      ${teamMark(row.team)}
                      <a class="team-name" href="${escapeHTML(teamProfileHref(row.team.id, season))}">${escapeHTML(row.team.name)}</a>
                    </div>
                  </td>
                  <td class="standings-status-cell" data-label="Status">${statusBadge(row, season)}</td>
                  <td class="num standings-stat-cell" data-label="GP">${row.gp}</td>
                  <td class="num standings-stat-cell" data-label="W">${row.w}</td>
                  <td class="num standings-stat-cell" data-label="D">${row.d}</td>
                  <td class="num standings-stat-cell" data-label="L">${row.l}</td>
                  <td class="num standings-stat-cell standings-points-cell" data-label="PTS"><strong>${row.pts}</strong></td>
                  <td class="num standings-stat-cell" data-label="GF">${row.gf}</td>
                  <td class="num standings-stat-cell" data-label="GA">${row.ga}</td>
                  <td class="num standings-stat-cell" data-label="GD">${row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
