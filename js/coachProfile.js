import { renderCoachCareerTable } from "../components/careerTable.js";
import { renderFormStrip } from "../components/formStrip.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { COACH_GRADE_SCALE, decorateCoachGrade } from "./coachRatings.js";
import { buildCoachCareer, calculateCoachForm, computeCoachSummary, getCurrentCoach, getNextTeamMatch } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { escapeHTML, formatDate, getQueryParam, initials, setDocumentTitle, statusMessage, unique } from "./utils.js";

setupLayout("coaches.html");

const root = document.getElementById("page-root");

const CATEGORY_LABELS = [
  ["tactics", "Tactics"],
  ["playerDevelopment", "Player Development"],
  ["motivation", "Motivation"],
  ["playoffPerformance", "Playoff Performance"],
  ["experience", "Experience"],
];

function coachStyleCard(label, value, note = "") {
  return '<article class="coach-style-card"><span>' + escapeHTML(label) + '</span><strong>' + escapeHTML(value || "Not Rated") + '</strong>' + (note ? '<p>' + escapeHTML(note) + '</p>' : '') + '</article>';
}

function renderCategoryGrades(coach) {
  return CATEGORY_LABELS.map(([key, label]) => coachStyleCard(label, coach.categoryGrades?.[key] || "Not Rated")).join("");
}

function renderGradeScale() {
  return '<div class="coach-grade-guide">' + COACH_GRADE_SCALE.map((item) => '<div class="coach-grade-guide-item"><strong>' + escapeHTML(item.grade) + '</strong><span>' + escapeHTML(item.meaning) + '</span></div>').join("") + '</div>';
}

function renderAchievements(coach) {
  const computed = [];
  if (Number(coach.championships) > 0) computed.push(`${coach.championships} championship${Number(coach.championships) === 1 ? "" : "s"}`);
  if (Number(coach.finals) > 0) computed.push(`${coach.finals} finals appearance${Number(coach.finals) === 1 ? "" : "s"}`);
  const achievements = unique([...(coach.ratingAchievements || []), ...computed]);
  if (!achievements.length) return '<p class="muted-text">No listed achievements yet.</p>';
  return '<ul class="coach-detail-list">' + achievements.map((item) => '<li>' + escapeHTML(item) + '</li>').join("") + '</ul>';
}

function renderCoachNextMatch(allData, coach) {
  if (!coach?.teamId) return "";
  const match = getNextTeamMatch(allData, coach.teamId);
  if (!match) return "";
  const data = match.data || allData.find((season) => season.year === match.season) || {};
  const isHome = match.homeTeamId === coach.teamId;
  const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
  const opponent = (data.teams || []).find((team) => team.id === opponentId);
  return `
    <div class="profile-next-match-card next-match-card">
      <span class="eyebrow">Next Match</span>
      <h3>${escapeHTML(isHome ? "vs" : "@")} ${escapeHTML(opponent?.name || "Opponent TBA")}</h3>
      <p>${escapeHTML(coach.teamName || "Current team")} | ${escapeHTML(formatDate(match.date))} | ${escapeHTML(match.time || "Time TBA")}</p>
    </div>
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading coach profile...");
  const id = getQueryParam("id");
  const [allData, ratings] = await Promise.all([loadAllSeasons(), loadJSON("./data/coach-ratings.json", { coaches: {} })]);
  const current = decorateCoachGrade(getCurrentCoach(allData, id) || {}, ratings);
  const summaryBase = computeCoachSummary(allData).find((coach) => coach.id === id);
  const career = buildCoachCareer(allData, id);
  const form = calculateCoachForm(allData, id);

  if (!id || !summaryBase) {
    setDocumentTitle("Coach Profile");
    root.innerHTML = `<section class="section-panel">${statusMessage("empty", "Coach profile not found. Check the coach ID in the URL.")}</section>`;
    return;
  }

  const summary = decorateCoachGrade(summaryBase, ratings);
  const avatar = summary.photo
    ? `<img class="person-photo" src="${escapeHTML(summary.photo)}" alt="">`
    : `<span class="person-avatar">${escapeHTML(initials(summary.name))}</span>`;
  setDocumentTitle(summary.name);
  root.innerHTML = `
    <section class="section-panel coach-profile-page">
      <div class="section-head">
        ${avatar}
        <div>
          <span class="eyebrow">Coach Profile</span>
          <h1>${escapeHTML(summary.name)}</h1>
          <p>${escapeHTML(summary.division || "Seniors")} | ${escapeHTML(summary.winPct || "0.0%")} win rate | Coach Grade ${escapeHTML(summary.overallGrade || "Not Rated")}</p>
        </div>
        <a class="button secondary" href="./coaches.html">Back to coaches</a>
      </div>
      <div class="profile-layout">
        <aside class="card profile-summary coach-profile-summary">
          <span class="pill green">Career totals</span>
          <h3>${escapeHTML(summary.name)}</h3>
          <p>${escapeHTML(summary.notes || "Coaching notes will be updated from league records.")}</p>
          <div class="coach-profile-grade-card">
            <span>Overall Coach Grade</span>
            <strong>${escapeHTML(summary.overallGrade || "Not Rated")}</strong>
            <p>${escapeHTML(summary.gradeMeaning || "Not enough rating information")}</p>
          </div>
          <div class="stat-grid">
            <div class="stat-box"><span>Games</span><strong>${summary.gamesPlayed || 0}</strong></div>
            <div class="stat-box"><span>Wins</span><strong>${summary.wins || 0}</strong></div>
            <div class="stat-box"><span>Championships</span><strong>${summary.championships || 0}</strong></div>
            <div class="stat-box"><span>Finals</span><strong>${summary.finals || 0}</strong></div>
          </div>
          ${renderFormStrip(form)}
          ${renderCoachNextMatch(allData, current)}
          <div class="profile-note">
            <span>Past teams</span>
            <p>${escapeHTML((summary.pastTeams || []).join(", ") || "None listed")}</p>
          </div>
        </aside>
        <div class="coach-profile-main">
          <div class="card coach-rating-details">
            <div class="section-head compact-head">
              <div>
                <span class="eyebrow">Rating Profile</span>
                <h2>Coach Grade</h2>
                <p>Letter grades are for coaching style and results. Player pages keep numeric OVR ratings.</p>
              </div>
            </div>
            <div class="coach-style-grid">
              ${coachStyleCard("Tactical Style", summary.tacticalStyle)}
              ${coachStyleCard("Strength", summary.strength)}
              ${coachStyleCard("Weakness", summary.weakness)}
              ${coachStyleCard("Experience", summary.experienceLabel)}
            </div>
            <div class="coach-category-grid">
              ${renderCategoryGrades(summary)}
            </div>
            <div class="coach-grade-guide-wrap">
              <span class="eyebrow">Full Grade Scale</span>
              ${renderGradeScale()}
            </div>
          </div>
          <div class="card coach-rating-details">
            <div class="section-head compact-head">
              <div>
                <span class="eyebrow">Coach Career</span>
                <h2>Career Table</h2>
              </div>
            </div>
            ${renderCoachCareerTable(career)}
          </div>
          <div class="coach-detail-grid">
            <div class="card coach-detail-panel">
              <span class="eyebrow">Achievements</span>
              ${renderAchievements(summary)}
            </div>
            <div class="card coach-detail-panel">
              <span class="eyebrow">Coaching Notes</span>
              <p>${escapeHTML(summary.notes || "More notes will be added as the season continues.")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

init();
