import { teamMap, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { escapeHTML, formatDate } from "./utils.js";

/**
 * Finds the most notable completed match that fell on today's calendar
 * date (month + day) in a prior season. Returns null on days with no
 * historical match on record - that's expected, not a bug.
 */
export function findOnThisDayHighlight(allData, referenceDate = new Date()) {
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  const candidates = allData
    .flatMap((data) => (data.matches || []).map((match) => ({ ...match, season: data.year, data })))
    .filter((match) => match.date && !match.activityTitle)
    .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
    .filter((match) => {
      const date = new Date(`${match.date}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date.getMonth() === month && date.getDate() === day && date < referenceDate;
    });

  if (!candidates.length) return null;

  const notability = (match) => {
    const margin = Math.abs(match.homeScore - match.awayScore);
    const stageBonus = match.stage === "playoffs" ? 5 : 0;
    const finalBonus = /final/i.test(match.label || "") ? 4 : 0;
    return stageBonus + finalBonus + margin;
  };

  return [...candidates].sort((a, b) => notability(b) - notability(a) || Number(b.season) - Number(a.season))[0];
}

export function renderOnThisDayCallout(highlight) {
  if (!highlight) return "";
  const teams = teamMap(highlight.data || {});
  const home = teams.get(highlight.homeTeamId);
  const away = teams.get(highlight.awayTeamId);
  const homeName = home?.name || highlight.homeTeamName || "Home team";
  const awayName = away?.name || highlight.awayTeamName || "Away team";
  const winner = winnerTeamId(highlight);
  const winnerName = winner === highlight.homeTeamId ? homeName : winner === highlight.awayTeamId ? awayName : null;
  const topScorer = [...(highlight.scorers || [])].sort((a, b) => (Number(b.goals) || 0) - (Number(a.goals) || 0))[0];
  const gameHref = `./game.html?id=${encodeURIComponent(highlight.id || "")}&season=${encodeURIComponent(highlight.season || "")}`;
  const note = [
    winnerName ? `${winnerName} won.` : "",
    topScorer ? `${topScorer.name || "A player"} scored ${Number(topScorer.goals) > 1 ? `${topScorer.goals} goals` : "a goal"}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <a class="on-this-day-card" href="${escapeHTML(gameHref)}">
      <span class="eyebrow">On This Day - ${escapeHTML(formatDate(highlight.date))}, ${escapeHTML(highlight.season)}</span>
      <h2>${escapeHTML(homeName)} ${escapeHTML(highlight.homeScore)}-${escapeHTML(highlight.awayScore)} ${escapeHTML(awayName)}</h2>
      <p>${escapeHTML([highlight.division || "LSL", highlight.label].filter(Boolean).join(" | "))}${note ? ` - ${note}` : ""}</p>
    </a>
  `;
}
