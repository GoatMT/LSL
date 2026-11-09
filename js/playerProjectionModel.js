import { computePlayerStats, isCompletedMatch, playerTeamForMatch } from "./leagueEngine.js";

export const PROJECTION_TARGET_SEASON = 2027;
export const EXPECTED_FIRST_WEEK = "2027-06-05";
export const RECENT_SEASON_WEIGHT = 0.65;
export const PRIOR_CAREER_WEIGHT = 0.35;
export const SAMPLE_PRIOR_GAMES = 5;

const POSITION_PRIME_AGES = {
  goalkeeper: 24,
  defender: 22,
  midfielder: 21,
  attacker: 20,
  field: 21,
};

function rows(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function positionGroup(position = "") {
  const value = String(position).toLowerCase();
  if (/goal|keeper|goalie|\bgk\b/.test(value)) return "goalkeeper";
  if (/defen|back/.test(value)) return "defender";
  if (/midfield|centre.?mid|central.?mid/.test(value)) return "midfielder";
  if (/forward|strik|wing|attack/.test(value)) return "attacker";
  return "field";
}

function ageAtExpectedStart(player, targetSeason) {
  const birthYear = Number(player.birthYear);
  const birthMonth = Number(player.birthMonth);
  const [anchorYear, anchorMonth] = EXPECTED_FIRST_WEEK.split("-").map(Number);
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > targetSeason) {
    return { label: "Not recorded", midpoint: null, source: "missing" };
  }

  const yearAge = anchorYear - birthYear;
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    return { label: `${yearAge - 1}-${yearAge}`, midpoint: yearAge - 0.5, source: "year-only" };
  }

  if (birthMonth < anchorMonth) return { label: String(yearAge), midpoint: yearAge, source: "year-month" };
  if (birthMonth > anchorMonth) return { label: String(yearAge - 1), midpoint: yearAge - 1, source: "year-month" };
  return { label: `${yearAge - 1}-${yearAge}`, midpoint: yearAge - 0.5, source: "month-only" };
}

function ageFactor(player, targetSeason) {
  const age = ageAtExpectedStart(player, targetSeason);
  if (age.midpoint === null) return { ...age, factor: 1, adjustment: "No age adjustment" };
  const group = positionGroup(player.position);
  const primeAge = POSITION_PRIME_AGES[group];
  const development = clamp((age.midpoint - 12) / (primeAge - 12), 0, 1);
  const factor = 0.88 + development * 0.12;
  return {
    ...age,
    factor,
    adjustment: `${factor < 0.995 ? "-" : ""}${Math.round(Math.abs(1 - factor) * 100)}%`,
  };
}

function teamRecordsForSeason(data, division) {
  const records = new Map();
  const teams = rows(data.teams).filter((team) => !team.division || team.division === division);
  teams.forEach((team) => records.set(team.id, {
    teamId: team.id,
    gamesPlayed: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  }));

  rows(data.matches)
    .filter((match) => match.division === division && match.stage === "regular" && isCompletedMatch(match))
    .forEach((match) => {
      const home = records.get(match.homeTeamId);
      const away = records.get(match.awayTeamId);
      if (!home || !away) return;
      home.gamesPlayed += 1;
      away.gamesPlayed += 1;
      if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
        home.goalsFor += match.homeScore;
        home.goalsAgainst += match.awayScore;
        away.goalsFor += match.awayScore;
        away.goalsAgainst += match.homeScore;
      }
      if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore) && match.homeScore === match.awayScore) {
        home.ties += 1;
        away.ties += 1;
      } else {
        const winner = match.winnerId || (match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId);
        if (winner === match.homeTeamId) {
          home.wins += 1;
          away.losses += 1;
        } else if (winner === match.awayTeamId) {
          away.wins += 1;
          home.losses += 1;
        }
      }
    });
  return records;
}

function median(values) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function playerScheduleGames(player, matches) {
  return matches.filter((match) => {
    const teamId = playerTeamForMatch(player, match);
    return teamId && (match.homeTeamId === teamId || match.awayTeamId === teamId);
  }).length;
}

function sampleRate(goals, games, fallback) {
  if (games <= 0) return fallback;
  return goals / games;
}

function goalCoverage(data, division) {
  const matches = rows(data.matches)
    .filter((match) => match.division === division && match.stage === "regular" && isCompletedMatch(match))
    .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore));
  const scored = matches.reduce((total, match) => total + match.homeScore + match.awayScore, 0);
  const scorerGoals = matches.reduce((total, match) => total + rows(match.scorers)
    .reduce((sum, event) => sum + number(event.goals), 0), 0);
  const playerLinkedGoals = matches.reduce((total, match) => total + rows(match.scorers)
    .reduce((sum, event) => sum + (event.playerId ? number(event.goals) : 0), 0), 0);
  return {
    matches: matches.length,
    scoreboardGoals: scored,
    scorerGoals,
    playerLinkedGoals,
    unattributedGoals: Math.max(0, scored - scorerGoals),
    unlinkedGoals: Math.max(0, scorerGoals - playerLinkedGoals),
  };
}

function roleScoringBaselines(players) {
  const totals = new Map();
  players.forEach((player) => {
    const role = positionGroup(player.position);
    const row = totals.get(role) || { goals: 0, games: 0 };
    row.goals += number(player.goals);
    row.games += number(player.gamesPlayed);
    totals.set(role, row);
  });
  return new Map([...totals].map(([role, row]) => [role, row.games ? row.goals / row.games : 0]));
}

function aggregateHistory(rowsForPlayer) {
  return rowsForPlayer.reduce((total, row) => ({
    goals: total.goals + number(row.goals),
    games: total.games + number(row.gamesPlayed),
    goalkeeperGoalsAgainst: total.goalkeeperGoalsAgainst + number(row.goalsAgainst),
    goalkeeperGames: total.goalkeeperGames + number(row.goalkeeperGames),
  }), { goals: 0, games: 0, goalkeeperGoalsAgainst: 0, goalkeeperGames: 0 });
}

function scoreRateProjection(recent, prior, baseline) {
  const recentRate = sampleRate(number(recent.goals), number(recent.games), baseline);
  const priorRate = sampleRate(number(prior.goals), number(prior.games), recentRate);
  const weightedRate = prior.games > 0
    ? recentRate * RECENT_SEASON_WEIGHT + priorRate * PRIOR_CAREER_WEIGHT
    : recentRate;
  const samples = number(recent.games) + number(prior.games);
  const reliability = samples / (samples + SAMPLE_PRIOR_GAMES);
  return weightedRate * reliability + baseline * (1 - reliability);
}

function goalieGaaProjection(recent, prior, baseline, ageMultiplier) {
  const recentGames = number(recent.goalkeeperGames);
  const priorGames = number(prior.goalkeeperGames);
  const recentRate = sampleRate(number(recent.goalkeeperGoalsAgainst), recentGames, baseline);
  const priorRate = sampleRate(prior.goalkeeperGoalsAgainst, priorGames, recentRate);
  const weightedRate = priorGames > 0
    ? recentRate * RECENT_SEASON_WEIGHT + priorRate * PRIOR_CAREER_WEIGHT
    : recentRate;
  const reliability = (recentGames + priorGames) / (recentGames + priorGames + SAMPLE_PRIOR_GAMES);
  const stableRate = weightedRate * reliability + baseline * (1 - reliability);
  return stableRate + (1 - ageMultiplier) * baseline * 0.25;
}

function scorerEventTotals(data, division) {
  const matches = rows(data.matches)
    .filter((match) => match.division === division && match.stage === "regular" && isCompletedMatch(match));
  return matches.reduce((total, match) => {
    rows(match.scorers).forEach((event) => {
      if (!event.playerId) return;
      total.set(event.playerId, (total.get(event.playerId) || 0) + number(event.goals));
    });
    return total;
  }, new Map());
}

export function buildPlayerProjections(seasons, targetSeason = PROJECTION_TARGET_SEASON, division = "Seniors") {
  const orderedSeasons = [...seasons].sort((a, b) => Number(a.year) - Number(b.year));
  const latestData = orderedSeasons.find((season) => String(season.year) === String(targetSeason - 1));
  if (!latestData) return { targetSeason, sourceSeason: targetSeason - 1, division, players: [], scheduleBaseline: 0, coverage: null };

  const snapshots = orderedSeasons
    .filter((season) => Number(season.year) < targetSeason)
    .map((season) => ({
      year: Number(season.year),
      data: season,
      players: computePlayerStats(season, { stage: "regular" }).filter((player) => player.division === division),
      teams: teamRecordsForSeason(season, division),
    }));
  const recentSnapshot = snapshots.find((snapshot) => snapshot.year === Number(latestData.year));
  if (!recentSnapshot) return { targetSeason, sourceSeason: Number(latestData.year), division, players: [], scheduleBaseline: 0, coverage: null };

  const latestMatches = rows(latestData.matches)
    .filter((match) => match.division === division && match.stage === "regular" && isCompletedMatch(match));
  const scheduleBaseline = median([...recentSnapshot.teams.values()].map((record) => record.gamesPlayed));
  const recentPlayers = recentSnapshot.players.filter((player) => number(player.gamesPlayed) > 0);
  const baselines = roleScoringBaselines(recentPlayers);
  const goalies = recentPlayers.filter((player) => positionGroup(player.position) === "goalkeeper");
  const goalieGames = goalies.reduce((sum, player) => sum + number(player.goalkeeperGames), 0);
  const goalieGoalsAgainst = goalies.reduce((sum, player) => sum + number(player.goalsAgainst), 0);
  const leagueGaa = goalieGames ? goalieGoalsAgainst / goalieGames : null;
  const earlierSnapshots = snapshots.filter((snapshot) => snapshot.year < recentSnapshot.year);
  const earlierByPlayer = new Map();
  earlierSnapshots.forEach((snapshot) => snapshot.players.forEach((player) => {
    const history = earlierByPlayer.get(player.id) || [];
    history.push(player);
    earlierByPlayer.set(player.id, history);
  }));
  const scorerTotals = scorerEventTotals(latestData, division);

  const players = recentPlayers.map((recent) => {
    const prior = aggregateHistory(earlierByPlayer.get(recent.id) || []);
    const team = rows(latestData.teams).find((item) => item.id === recent.teamId);
    const teamRecord = recentSnapshot.teams.get(recent.teamId);
    const scheduledGames = playerScheduleGames(recent, latestMatches);
    const appearanceShare = scheduledGames > 0
      ? clamp(number(recent.gamesPlayed) / scheduledGames, 0, 1)
      : 0;
    const projectedGames = scheduleBaseline * appearanceShare;
    const teamGames = number(teamRecord?.gamesPlayed);
    const recentGoalRate = scoreRateProjection(
      { goals: recent.goals, games: recent.gamesPlayed },
      prior,
      baselines.get(positionGroup(recent.position)) || 0,
    );
    const age = ageFactor(recent, targetSeason);
    const projectedGoals = Math.max(0, recentGoalRate * projectedGames * age.factor);
    const winRate = teamGames ? number(teamRecord.wins) / teamGames : 0;
    const tieRate = teamGames ? number(teamRecord.ties) / teamGames : 0;
    const lossRate = teamGames ? number(teamRecord.losses) / teamGames : 0;
    const isGoalkeeper = positionGroup(recent.position) === "goalkeeper";
    const projectedGaa = isGoalkeeper && leagueGaa !== null
      ? goalieGaaProjection(recent, prior, leagueGaa, age.factor)
      : null;
    return {
      id: recent.id,
      name: recent.name,
      position: recent.position || "Not recorded",
      role: positionGroup(recent.position),
      division,
      ageLabel: age.label,
      ageAdjustment: age.adjustment,
      ageSource: age.source,
      teamId: team?.id || "",
      teamName: team?.name || "Not listed",
      teamShortName: team?.shortName || "",
      sourceGames: number(recent.gamesPlayed),
      sourceGoals: scorerTotals.get(recent.id) ?? number(recent.goals),
      careerGamesBeforeLatest: prior.games,
      careerGoalsBeforeLatest: prior.goals,
      projectedGames,
      projectedGoals,
      projectedWins: projectedGames * winRate,
      projectedTies: projectedGames * tieRate,
      projectedLosses: projectedGames * lossRate,
      projectedGaa,
      sourceTeamGames: scheduledGames,
      teamScenario: team ? `Retain 2026 ${team.shortName || team.name}` : "No team scenario",
    };
  });

  return {
    targetSeason,
    sourceSeason: Number(latestData.year),
    division,
    players,
    scheduleBaseline,
    ageReferenceDate: EXPECTED_FIRST_WEEK,
    coverage: goalCoverage(latestData, division),
    scoringCoverageBySeason: snapshots.map(({ year, data }) => ({ year, ...goalCoverage(data, division) })),
    goalieGaaBaseline: leagueGaa,
  };
}
