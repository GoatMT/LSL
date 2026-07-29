import { escapeHTML, teamProfileHref } from "../js/utils.js";

function renderTeamLine(match, side, season) {
  const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
  const name = side === "home" ? match.homeTeamName : match.awayTeamName;
  const score = side === "home" ? match.homeScore : match.awayScore;
  const isWinner = match.winnerId && match.winnerId === teamId;
  return `
    <div class="bracket-team${isWinner ? " winner" : ""}">
      <strong>${teamId ? `<a href="${escapeHTML(teamProfileHref(teamId, season))}">${escapeHTML(name || "TBA")}</a>` : escapeHTML(name || "TBA")}</strong>
      <span>${Number.isFinite(score) ? score : "(Score)"}</span>
    </div>
  `;
}

export function renderPlayoffBracket(playoffs = { rounds: [] }) {
  const rounds = playoffs.rounds || [];
  const season = playoffs.season || "";
  if (!rounds.length) {
    return `<div class="empty-state">Playoff bracket has not been published for this selection yet.</div>`;
  }
  return `
    <div class="bracket${playoffs.layout === "wide" ? " bracket-wide" : ""}">
      ${rounds
        .map(
          (round) => `
            <section class="bracket-round">
              <h3>${escapeHTML(round.name)}</h3>
              ${(round.matches || [])
                .map(
                  (match) => `
                    <article class="bracket-match">
                      <span class="pill">${escapeHTML(match.label || round.name)}</span>
                      ${renderTeamLine(match, "home", season)}
                      ${renderTeamLine(match, "away", season)}
                      ${match.note ? `<p class="source-note">${escapeHTML(match.note)}</p>` : ""}
                    </article>
                  `
                )
                .join("")}
            </section>
          `
        )
        .join("")}
    </div>
    ${playoffs.champion ? `<p class="source-note">Champion: <strong>${escapeHTML(playoffs.champion)}</strong></p>` : ""}
  `;
}
