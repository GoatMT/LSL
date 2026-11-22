export const LIVE_MATCH_STATUSES = ["scheduled", "live", "halftime", "delayed", "postponed", "cancelled", "completed"];

const STATUS_LABELS = {
  scheduled: "Upcoming",
  live: "Live",
  halftime: "Halftime",
  delayed: "Delayed",
  postponed: "Postponed",
  cancelled: "Cancelled",
  completed: "Final",
  unreported: "Status not reported",
};

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? [value] : [];
}

function readableScore(value) {
  const home = Number(value?.homeScore);
  const away = Number(value?.awayScore);
  return Number.isInteger(home) && home >= 0 && Number.isInteger(away) && away >= 0
    ? { homeScore: home, awayScore: away }
    : null;
}

function idPart(value) {
  return String(value || "match").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "match";
}

function startTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const start = String(time || "").split(/\s+(?:-|to|–)\s+/i)[0].trim();
  const parsed = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(start);
  if (!parsed) return new Date(`${date}T23:59:59`);
  let hour = Number(parsed[1]) % 12;
  if (/PM/i.test(parsed[3])) hour += 12;
  const minute = Number(parsed[2]);
  if (minute > 59) return null;
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
}

export function collectMatchCentreFixtures(seasons = []) {
  const rows = [];
  seasons.forEach((season) => {
    const year = String(season?.year || "");
    if (!/^20\d{2}$/.test(year)) return;
    const teams = new Map((Array.isArray(season.teams) ? season.teams : []).map((team) => [team.id, team]));
    asArray(season.matches).forEach((match) => {
      if (!match || String(match.stage || "regular").toLowerCase() === "playoffs") return;
      if (!match.id) return;
      rows.push({
        ...match,
        id: String(match.id),
        season: year,
        division: match.division || "Seniors",
        stage: match.stage || "regular",
        label: match.label || (match.week ? `Week ${match.week}` : "Regular season"),
        homeTeamName: match.homeTeamName || teams.get(match.homeTeamId)?.name || match.homeTeamId || "Home team not listed",
        awayTeamName: match.awayTeamName || teams.get(match.awayTeamId)?.name || match.awayTeamId || "Away team not listed",
        homeTeamLogo: teams.get(match.homeTeamId)?.logo || "",
        awayTeamLogo: teams.get(match.awayTeamId)?.logo || "",
        matchType: "league",
        liveDocumentId: `${year}_${idPart(match.id)}`,
      });
    });

    const root = season.playoffs || {};
    const divisions = Array.isArray(root.divisions) && root.divisions.length
      ? root.divisions
      : [root];
    divisions.forEach((playoffs, divisionIndex) => {
      const division = playoffs.division || (divisions.length > 1 ? (divisionIndex === 0 ? "Seniors" : "Juniors") : "Seniors");
      asArray(playoffs.rounds).forEach((round, roundIndex) => {
        asArray(round?.matches).forEach((match, matchIndex) => {
          if (!match || typeof match !== "object") return;
          const roundName = round.name || "Playoffs";
          const id = String(match.id || `playoff-${idPart(division)}-${idPart(roundName)}-${matchIndex + 1}`);
          rows.push({
            ...match,
            id,
            season: year,
            division,
            stage: "playoffs",
            label: match.label || `${roundName} ${matchIndex + 1}`,
            roundName,
            homeTeamName: match.homeTeamName || teams.get(match.homeTeamId)?.name || match.homeTeamId || "Home team not listed",
            awayTeamName: match.awayTeamName || teams.get(match.awayTeamId)?.name || match.awayTeamId || "Away team not listed",
            homeTeamLogo: teams.get(match.homeTeamId)?.logo || "",
            awayTeamLogo: teams.get(match.awayTeamId)?.logo || "",
            matchType: "playoff",
            liveDocumentId: `${year}_${idPart(id)}`,
          });
        });
      });
    });
  });
  return rows;
}

export function matchStatus(match = {}, liveUpdate = null, now = new Date()) {
  const override = String(liveUpdate?.status || "").toLowerCase();
  if (LIVE_MATCH_STATUSES.includes(override)) return override;

  const sourceStatus = String(match.status || "").trim().toLowerCase().replace(/[ _]+/g, "-");
  if (["complete", "completed", "final", "full-time", "fulltime"].includes(sourceStatus)) return "completed";
  if (["in-progress", "in-play", "live", "playing"].includes(sourceStatus)) return "live";
  if (["half-time", "halftime", "half"] .includes(sourceStatus)) return "halftime";
  if (["delay", "delayed", "late-start", "late"].includes(sourceStatus)) return "delayed";
  if (["postponed", "ppd"].includes(sourceStatus)) return "postponed";
  if (["cancelled", "canceled", "default", "forfeit"].includes(sourceStatus)) return "cancelled";
  if (readableScore(match)) return "completed";
  if (["scheduled", "upcoming", "not-started"].includes(sourceStatus)) {
    const kickoff = startTime(match.date, match.time);
    return kickoff && kickoff >= now ? "scheduled" : "unreported";
  }

  const kickoff = startTime(match.date, match.time);
  if (kickoff && kickoff >= now) return "scheduled";
  return "unreported";
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.unreported;
}

export function matchScore(match = {}, liveUpdate = null) {
  return readableScore(liveUpdate?.score) || readableScore(match);
}

export function fixtureStart(match = {}) {
  return startTime(match.date, match.time);
}

export function matchDocumentId(season, matchId) {
  return `${String(season)}_${idPart(matchId)}`;
}
