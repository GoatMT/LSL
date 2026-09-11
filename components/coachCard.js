import { escapeHTML, initials, joinNames } from "../js/utils.js";
import { renderFormStrip } from "./formStrip.js";

export function renderCoachCard(coach, index = null) {
  const rank = Number.isFinite(index) ? index + 1 : "";
  const points = (Number(coach.points) || 0) || ((Number(coach.wins) || 0) * 3 + (Number(coach.ties) || 0));
  const grade = coach.overallGrade || "Not Rated";
  const gradeMeaning = coach.gradeMeaning || "Not enough rating information";
  const style = coach.tacticalStyle || "Not Rated";
  const strength = coach.strength || "Not Rated";
  const weakness = coach.weakness || "Not Rated";
  const avatar = coach.photo
    ? `<img class="person-photo" src="${escapeHTML(coach.photo)}" alt="">`
    : `<span class="person-avatar">${escapeHTML(initials(coach.name))}</span>`;
  return `
    <article class="card person-card coach-card">
      <div class="coach-card-head">
        ${avatar}
        <div class="person-title">
          ${rank ? `<span class="person-rank">#${rank}</span>` : ""}
          <h3><a href="./coach.html?id=${escapeHTML(coach.id)}">${escapeHTML(coach.name)}</a></h3>
          <p>${escapeHTML(coach.teamName || "Team TBA")} | ${escapeHTML(coach.division || "Seniors")}</p>
        </div>
        <a class="text-link compact" href="./coach.html?id=${escapeHTML(coach.id)}">Profile</a>
      </div>
      <div class="coach-card-rating prominent">
        <div class="coach-card-grade-badge">
          <span>Overall Coach Grade</span>
          <strong>${escapeHTML(grade)}</strong>
          <small>${escapeHTML(gradeMeaning)}</small>
        </div>
        <div class="coach-card-style-stack">
          <p><span>Tactical Style</span><strong>${escapeHTML(style)}</strong></p>
          <p><span>Strength</span><strong>${escapeHTML(strength)}</strong></p>
          <p><span>Weakness</span><strong>${escapeHTML(weakness)}</strong></p>
        </div>
      </div>
      <div class="stat-grid coach-stat-grid">
        <div class="stat-box"><span>Games</span><strong>${coach.gamesPlayed || 0}</strong></div>
        <div class="stat-box"><span>Wins</span><strong>${coach.wins || 0}</strong></div>
        <div class="stat-box"><span>Points</span><strong>${points}</strong></div>
        <div class="stat-box"><span>Win %</span><strong>${escapeHTML(coach.winPct || "0.0%")}</strong></div>
        <div class="stat-box"><span>Finals</span><strong>${coach.finals || 0}</strong></div>
        <div class="stat-box"><span>Titles</span><strong>${coach.championships || 0}</strong></div>
      </div>
      ${renderFormStrip(coach.form || [])}
      <p class="person-note">${escapeHTML(coach.notes || "Coach profile details will be updated from league records.")}</p>
      <div class="person-chip-row">
        <span class="detail-chip">${coach.seasons || 0} seasons</span>
        <span class="detail-chip">Past teams: ${escapeHTML(joinNames(coach.pastTeams || [coach.teamName]))}</span>
      </div>
    </article>
  `;
}
