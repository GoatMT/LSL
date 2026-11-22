const ALLOWED_SEASONS = new Set(["2024", "2025", "2026", "2027"]);
const ALLOWED_STATUSES = new Set(["scheduled", "live", "halftime", "delayed", "postponed", "cancelled", "completed"]);
const ALLOWED_EVENT_TYPES = new Set(["goal", "card", "note"]);

function boundedText(value, label, maxLength, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text;
}

function sanitizeLiveMatchUpdate(input = {}) {
  const season = String(input.season ?? "");
  const matchId = boundedText(input.matchId, "Match", 100, true);
  const status = String(input.status ?? "").toLowerCase();
  if (!ALLOWED_SEASONS.has(season)) throw new Error("Choose a supported LSL season.");
  if (!/^[A-Za-z0-9_-]+$/.test(matchId)) throw new Error("Match ID contains invalid characters.");
  if (!ALLOWED_STATUSES.has(status)) throw new Error("Choose a valid match status.");

  const homeRaw = input.homeScore;
  const awayRaw = input.awayScore;
  const hasHome = homeRaw !== undefined && homeRaw !== null && String(homeRaw).trim() !== "";
  const hasAway = awayRaw !== undefined && awayRaw !== null && String(awayRaw).trim() !== "";
  if (hasHome !== hasAway) throw new Error("Enter both scores, or leave both blank.");
  let score;
  if (hasHome) {
    if (![homeRaw, awayRaw].every((value) => typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim())))) {
      throw new Error("Scores must be whole numbers from 0 to 99.");
    }
    const home = Number(homeRaw);
    const away = Number(awayRaw);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) {
      throw new Error("Scores must be whole numbers from 0 to 99.");
    }
    score = { homeScore: home, awayScore: away };
  }

  let event;
  if (input.event && typeof input.event === "object") {
    const type = String(input.event.type ?? "").toLowerCase();
    if (!ALLOWED_EVENT_TYPES.has(type)) throw new Error("Choose a supported match event.");
    const teamSide = String(input.event.teamSide ?? "");
    if (teamSide && !["home", "away"].includes(teamSide)) throw new Error("Event team must be home or away.");
    if (type === "goal" && !teamSide) throw new Error("Choose which team scored.");
    const minute = boundedText(input.event.minute, "Minute", 8);
    if (minute && !/^\d{1,3}(?:\+\d{1,2})?$/.test(minute)) throw new Error("Minute must look like 12 or 45+1.");
    const text = boundedText(input.event.text, "Event note", 240, type === "note");
    const playerName = boundedText(input.event.playerName, "Player name", 80);
    event = { type, teamSide, minute, text, playerName };
  }

  return { season, matchId, status, ...(score ? { score } : {}), ...(event ? { event } : {}) };
}

function hasMatchAdminClaim(auth) {
  return Boolean(auth?.uid && auth.token?.lslMatchAdmin === true);
}

module.exports = { sanitizeLiveMatchUpdate, hasMatchAdminClaim };
