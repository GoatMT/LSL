import { escapeHTML, initials, leadershipRoleLabel, leadershipRoleShort, teamProfileHref } from "../js/utils.js";
import { renderFormStrip } from "./formStrip.js";

function teamMark(team) {
  const logoStyle = team.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team.logo) {
    return `<img class="team-logo" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${logoStyle}>`;
  }
  return `<span class="team-mark"${logoStyle}>${escapeHTML(initials(team.name, 3))}</span>`;
}

function rosterRatingSummary(roster = [], playerRatings = new Map()) {
  const rated = roster
    .map((player) => ({ ...player, ovr: Number(playerRatings.get(player.id)) || 0 }))
    .filter((player) => player.ovr > 0)
    .sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
  const average = rated.length ? Math.round(rated.reduce((sum, player) => sum + player.ovr, 0) / rated.length) : "N/A";
  const top = rated[0];
  return {
    average,
    topLabel: top ? `${top.name} (${top.ovr})` : "N/A",
    moveCount: roster.filter((player) => player.tradeNote || player.previousTeamId).length,
  };
}

function leadershipBadge(player) {
  const role = leadershipRoleLabel(player.leadershipRole);
  const short = leadershipRoleShort(player.leadershipRole);
  if (!role) return "";
  return `<span class="roster-leader-chip ${escapeHTML(player.leadershipRole)}" title="${escapeHTML(role)}">${escapeHTML(short)}</span>`;
}

function renderLeadershipStrip(roster = []) {
  const leaders = roster.filter((player) => leadershipRoleLabel(player.leadershipRole));
  if (!leaders.length) return "";
  return `
    <div class="team-leadership-strip">
      ${leaders
        .map(
          (player) => `
            <a href="./player.html?id=${escapeHTML(player.id)}">
              <span>${escapeHTML(leadershipRoleShort(player.leadershipRole))}</span>
              <strong>${escapeHTML(player.name)}</strong>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderTeamCard(team, stats, coach, season, form = [], playerRatings = new Map()) {
  const roster = team.roster || [];
  const coachName = coach?.name || team.coachName || "Not listed";
  const href = teamProfileHref(team.id, season);
  const ratingSummary = rosterRatingSummary(roster, playerRatings);
  return `
    <article class="card team-card">
      <div class="team-card-head">
        ${teamMark(team)}
        <div>
          <h3 class="team-title-line">
            <a href="${escapeHTML(href)}">${escapeHTML(team.name)}</a>
            <span class="team-meta">| ${escapeHTML(team.division)} | Coach: ${escapeHTML(coachName)} |</span>
          </h3>
        </div>
      </div>
      ${renderLeadershipStrip(roster)}
      <div class="stat-grid">
        <div class="stat-box"><span>Points</span><strong>${stats?.pts ?? 0}</strong></div>
        <div class="stat-box"><span>Wins</span><strong>${stats?.w ?? 0}</strong></div>
        <div class="stat-box"><span>Goals For</span><strong>${stats?.gf ?? 0}</strong></div>
        <div class="stat-box"><span>Goal Diff</span><strong>${stats?.gd > 0 ? `+${stats.gd}` : stats?.gd ?? 0}</strong></div>
      </div>
      <div class="team-club-strip" aria-label="${escapeHTML(team.name)} club snapshot">
        <div>
          <span>Roster</span>
          <strong>${roster.length}</strong>
        </div>
        <div>
          <span>Avg OVR</span>
          <strong>${escapeHTML(ratingSummary.average)}</strong>
        </div>
        <div>
          <span>Top Rated</span>
          <strong>${escapeHTML(ratingSummary.topLabel)}</strong>
        </div>
        <div>
          <span>Moves</span>
          <strong>${ratingSummary.moveCount}</strong>
        </div>
      </div>
      ${renderFormStrip(form)}
      <details class="clean-details">
        <summary>Roster</summary>
        ${
          roster.length
            ? `<ul class="roster-list">
                ${roster
                  .map(
                    (player) => `
                      <li>
                        <a href="./player.html?id=${escapeHTML(player.id)}">${leadershipBadge(player)}${escapeHTML(player.name)}</a>
                        <span class="roster-ovr-chip">${escapeHTML(playerRatings.get(player.id) ? `OVR ${playerRatings.get(player.id)}` : player.position || "")}</span>
                      </li>
                    `
                  )
                  .join("")}
              </ul>`
            : `<div class="empty-state">Roster has not been published yet.</div>`
        }
      </details>
    </article>
  `;
}
