import { escapeHTML, initials } from "../js/utils.js";
import { renderFormStrip } from "./formStrip.js";

export function renderPlayerCard(player, index = 0) {
  const rank = Number.isFinite(index) ? index + 1 : "";
  const avatar = player.photo
    ? `<img class="person-photo" src="${escapeHTML(player.photo)}" alt="">`
    : `<span class="person-avatar">${escapeHTML(initials(player.name))}</span>`;
  return `
    <article class="card person-card player-card">
      <div class="person-card-head">
        ${avatar}
        <div class="person-title">
          ${rank ? `<span class="person-rank">#${rank}</span>` : ""}
          <h3><a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a></h3>
          <p>${escapeHTML(player.division || "Division TBA")} | ${escapeHTML(player.position || "Field")}</p>
        </div>
      </div>
      <div class="person-meta-line">
        <span>${player.gamesPlayed || 0} games</span>
        <span>${player.wins || 0}W ${player.ties || 0}D ${player.losses || 0}L</span>
      </div>
      ${renderFormStrip(player.form || [])}
      <div class="stat-grid">
        <div class="stat-box"><span>Games</span><strong>${player.gamesPlayed || 0}</strong></div>
        <div class="stat-box"><span>Goals</span><strong>${player.goals || 0}</strong></div>
        <div class="stat-box"><span>Shots</span><strong>${player.shots || 0}</strong></div>
        <div class="stat-box"><span>Assists</span><strong>${player.assists || 0}</strong></div>
        <div class="stat-box"><span>Points</span><strong>${player.points || 0}</strong></div>
      </div>
      <div class="person-chip-row">
        ${player.ovr ? `<span class="detail-chip ovr-detail-chip">OVR ${escapeHTML(player.ovr)}</span>` : ""}
        <span class="detail-chip">MVP score ${player.mvpScore || 0}</span>
        <a class="text-link compact" href="./player.html?id=${escapeHTML(player.id)}">Profile</a>
      </div>
    </article>
  `;
}
