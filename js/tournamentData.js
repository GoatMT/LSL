export function asList(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" && Object.keys(value).length ? [value] : [];
}

export function playoffRounds(tournament = {}) {
  return asList(tournament.playoffs?.rounds).map((round) => ({
    ...round,
    matches: asList(round?.matches),
  }));
}

export function scheduleMatches(tournament = {}) {
  const playoffMatches = playoffRounds(tournament).flatMap((round) =>
    round.matches.map((match) => ({ ...match, round: match.round || round.name }))
  );
  const seen = new Set();
  return [...asList(tournament.matches), ...playoffMatches].filter((match) => {
    const key = match.id || `${match.round || ""}|${match.homeTeamId || ""}|${match.awayTeamId || ""}|${match.label || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function tournamentScore(match = {}) {
  if (match.activityTitle) return match.status || "Scheduled";
  if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return "VS";
  const penalties = match.penaltyScore ? `, pens ${match.penaltyScore}` : "";
  return `${match.homeScore}-${match.awayScore}${penalties}`;
}

export function tournamentWinner(match = {}) {
  if (match.winnerId) {
    const winner = match.winnerId === match.homeTeamId ? match.homeTeamName : match.winnerId === match.awayTeamId ? match.awayTeamName : "";
    if (winner) return `${winner} win`;
  }
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    if (match.homeScore > match.awayScore) return `${match.homeTeamName} win`;
    if (match.awayScore > match.homeScore) return `${match.awayTeamName} win`;
    return match.status || "Draw";
  }
  return match.status || "Coming Soon";
}

export function normalizeTournamentArchive(tournament = {}) {
  if (Number(tournament.season) !== 2025 || tournament.event?.date || tournament.event?.headline) return tournament;
  const champion = tournament.playoffs?.champion || "";
  return {
    ...tournament,
    event: {
      ...(tournament.event || {}),
      edition: tournament.season ? `${tournament.season} Tournament` : "Tournament Archive",
      headline: "Tournament archive with divisions, teams, match results, and playoff history.",
      statusLabel: "Tournament Archive",
      currentStatus: champion ? `Champion: ${champion}` : "Results available in the archive",
      ...(champion ? { champion } : {}),
      date: tournament.event?.dates,
      time: tournament.event?.schedule,
      gameLength: "Full day tournament",
      intro: [
        "The first Inter-Madrasah Soccer Tournament brought together multiple madrasah teams for a full day of competition.",
        "Use the year selector to compare tournament seasons.",
      ],
    },
  };
}
