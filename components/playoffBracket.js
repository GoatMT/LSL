import { escapeHTML, teamProfileHref } from "../js/utils.js";

function list(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function renderTeamLine(match, side, season) {
  const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
  const name = side === "home" ? match.homeTeamName : match.awayTeamName;
  const score = side === "home" ? match.homeScore : match.awayScore;
  const isWinner = match.winnerId && match.winnerId === teamId;
  return `
    <div class="bracket-team${isWinner ? " winner" : ""}">
      <strong>${teamId ? `<a href="${escapeHTML(teamProfileHref(teamId, season))}">${escapeHTML(name || "TBA")}</a>` : escapeHTML(name || "TBA")}</strong>
      <span${Number.isFinite(score) ? "" : ' aria-label="Score not recorded"'}>${Number.isFinite(score) ? score : "N/R"}</span>
    </div>
  `;
}

function safeBracketClass(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function roundClass(round, index) {
  const name = safeBracketClass(round?.name || `round-${index + 1}`);
  return name ? ` bracket-round-${name}` : "";
}

function matchClass(match, index) {
  const label = safeBracketClass(match?.label || `match-${index + 1}`);
  return label ? ` bracket-match-${label}` : "";
}

function bracketShapeClass(rounds) {
  const firstRoundMatches = list(rounds[0]?.matches).length;
  if (firstRoundMatches >= 4) {
    return " bracket-four-quarterfinals";
  }
  if (firstRoundMatches === 2) {
    return " bracket-two-quarterfinals";
  }
  return "";
}

export function renderPlayoffBracket(playoffs = { rounds: [] }) {
  const rounds = list(playoffs.rounds);
  const season = playoffs.season || "";
  if (!rounds.length) {
    return `<div class="empty-state">Playoff bracket has not been published for this selection yet.</div>`;
  }
  return `
    <div class="bracket${playoffs.layout === "wide" ? ` bracket-wide${bracketShapeClass(rounds)}` : ""}">
      ${rounds
        .map(
          (round, roundIndex) => `
            <section class="bracket-round${roundClass(round, roundIndex)}">
              <h3>${escapeHTML(round.name)}</h3>
              ${list(round.matches)
                .map(
                  (match, matchIndex) => `
                    <article class="bracket-match${matchClass(match, matchIndex)}">
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

