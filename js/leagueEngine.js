import { playoffRulesFor } from "./config.js";
import { byId, formatPercent, unique } from "./utils.js";

export function teamMap(data) {
  return byId(data.teams || []);
}

export function playerMap(data) {
  return byId(data.players || []);
}

export function coachMap(data) {
  return byId(data.coaches || []);
}

export function getMatchTeams(data, match) {
  const teams = teamMap(data);
  return {
    home: teams.get(match.homeTeamId),
    away: teams.get(match.awayTeamId),
  };
}

export function scoreText(match) {
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    return `${match.homeScore} - ${match.awayScore}`;
  }
  if (match.winnerId) return "Result posted";
  return "vs";
}

export function winnerTeamId(match) {
  if (match.winnerId) return match.winnerId;
  if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return "";
  if (match.homeScore > match.awayScore) return match.homeTeamId;
  if (match.awayScore > match.homeScore) return match.awayTeamId;
  return "";
}

export function isCompletedMatch(match) {
  return (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) || Boolean(match.winnerId);
}

function matchStartMinutes(time = "") {
  const start = String(time).split(/\s+(?:-|to|–)\s+/i)[0].trim();
  const parts = start.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!parts) return 0;
  let hours = Number(parts[1]) || 0;
  const minutes = Number(parts[2]) || 0;
  const period = (parts[3] || "").toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function matchSortValue(match) {
  const dateValue = match.date ? Date.parse(`${match.date}T00:00:00`) : 0;
  return (Number.isFinite(dateValue) ? dateValue : 0) + matchStartMinutes(match.time) * 60 * 1000;
}

export function filterMatches(matches = [], { division = "Seniors", stage = "regular", week = "all" } = {}) {
  return matches
    .filter((match) => (division === "All" ? true : match.division === division))
    .filter((match) => (stage === "all" ? true : match.stage === stage))
    .filter((match) => (week === "all" ? true : String(match.week) === String(week)))
    .sort((a, b) => matchSortValue(a) - matchSortValue(b) || String(a.label || "").localeCompare(String(b.label || "")));
}

export function getWeeks(matches = [], division = "Seniors", stage = "regular") {
  const weeks = matches
    .filter((match) => match.division === division && match.stage === stage)
    .map((match) => match.week);
  return unique(weeks).sort((a, b) => Number(a) - Number(b));
}

export function calculateStandings(data, { division = "Seniors", upToWeek = "all" } = {}) {
  const teams = (data.teams || []).filter((team) => team.division === division);
  const teamOrder = new Map(teams.map((team, index) => [team.id, index]));
  const standings = new Map(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        team,
        gp: 0,
        w: 0,
        d: 0,
        l: 0,
        pts: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pendingScores: 0,
      },
    ])
  );

  (data.matches || [])
    .filter((match) => match.division === division && match.stage === "regular")
    .filter((match) => upToWeek === "all" || Number(match.week) <= Number(upToWeek))
    .filter((match) => isCompletedMatch(match))
    .forEach((match) => {
      const home = standings.get(match.homeTeamId);
      const away = standings.get(match.awayTeamId);
      if (!home || !away) return;
      const hasScore = Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
      const winner = winnerTeamId(match);

      home.gp += 1;
      away.gp += 1;
      if (!hasScore) {
        home.pendingScores += 1;
        away.pendingScores += 1;
      }
      if (hasScore) {
        home.gf += match.homeScore;
        home.ga += match.awayScore;
        away.gf += match.awayScore;
        away.ga += match.homeScore;
      }

      if (winner) {
        if (winner === match.homeTeamId) {
          home.w += 1;
          home.pts += 3;
          away.l += 1;
        } else if (winner === match.awayTeamId) {
          away.w += 1;
          away.pts += 3;
          home.l += 1;
        }
      } else if (hasScore && match.homeScore > match.awayScore) {
        home.w += 1;
        home.pts += 3;
        away.l += 1;
      } else if (hasScore && match.awayScore > match.homeScore) {
        away.w += 1;
        away.pts += 3;
        home.l += 1;
      } else if (hasScore) {
        home.d += 1;
        away.d += 1;
        home.pts += 1;
        away.pts += 1;
      }
    });

  const sortedRows = [...standings.values()]
    .map((row) => ({ ...row, gd: row.gf - row.ga }))
    .sort((a, b) => {
      return (
        b.pts - a.pts ||
        b.w - a.w ||
        b.gd - a.gd ||
        (teamOrder.get(a.teamId) ?? 0) - (teamOrder.get(b.teamId) ?? 0) ||
        a.team.name.localeCompare(b.team.name)
      );
    });

  return sortedRows
    .map((row, index) => {
      const rank = index + 1;
      const tieIndexes = sortedRows
        .map((candidate, candidateIndex) => (sameStandingsRank(row, candidate) ? candidateIndex + 1 : null))
        .filter(Boolean);
      const rankLabel = tieIndexes.length > 1 ? `${tieIndexes[0]}/${tieIndexes.at(-1)}` : String(rank);
      const rule = playoffRulesFor(data.year, division);
      return {
        ...row,
        rank,
        rankLabel,
        notStarted: row.gp === 0,
        scorePending: row.pendingScores > 0,
        playoff: row.gp > 0 && row.pendingScores === 0 && rank <= (rule.cutoff || 0),
        bye: row.gp > 0 && row.pendingScores === 0 && rank <= (rule.byes || 0),
      };
    });
}

function sameStandingsRank(a, b) {
  return (
    a.gp > 0 &&
    b.gp > 0 &&
    a.pendingScores === 0 &&
    b.pendingScores === 0 &&
    a.pts === b.pts &&
    a.w === b.w &&
    a.gd === b.gd
  );
}

function completedRegularWeeks(data, division, upToWeek = "all") {
  return unique(
    (data.matches || [])
      .filter((match) => match.division === division && match.stage === "regular")
      .filter((match) => isCompletedMatch(match))
      .filter((match) => upToWeek === "all" || Number(match.week) <= Number(upToWeek))
      .map((match) => Number(match.week))
      .filter(Number.isFinite)
  ).sort((a, b) => a - b);
}

export function standingsWithMovement(data, { division = "Seniors", upToWeek = "all" } = {}) {
  const rows = calculateStandings(data, { division, upToWeek });
  const weeks = completedRegularWeeks(data, division, upToWeek);
  const currentWeek = upToWeek === "all" ? weeks.at(-1) : Number(upToWeek);
  const previousWeek = weeks.filter((week) => week < currentWeek).at(-1);
  if (!Number.isFinite(currentWeek) || !Number.isFinite(previousWeek)) {
    return rows.map((row) => ({ ...row, rankChange: null }));
  }

  const previousRanks = new Map(calculateStandings(data, { division, upToWeek: previousWeek }).map((row) => [row.teamId, row.rank]));
  return rows.map((row) => {
    const previousRank = previousRanks.get(row.teamId);
    return {
      ...row,
      previousRank: previousRank || null,
      rankChange: row.gp > 0 && previousRank ? previousRank - row.rank : null,
    };
  });
}

export function getTeamStats(data, teamId) {
  const team = (data.teams || []).find((item) => item.id === teamId);
  if (!team) return null;
  return calculateStandings(data, { division: team.division }).find((row) => row.teamId === teamId) || null;
}

export function calculateTeamRecord(data, teamId, { stage = "regular" } = {}) {
  const team = (data.teams || []).find((item) => item.id === teamId);
  if (!team) return null;
  const allowedStages = stage === "all" ? ["regular", "playoffs"] : [stage];
  const row = {
    teamId,
    team,
    gp: 0,
    w: 0,
    d: 0,
    l: 0,
    pts: 0,
    gf: 0,
    ga: 0,
    gd: 0,
  };

  (data.matches || [])
    .filter((match) => allowedStages.includes(match.stage))
    .filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)
    .filter((match) => isCompletedMatch(match))
    .forEach((match) => {
      const isHome = match.homeTeamId === teamId;
      const ownScore = isHome ? match.homeScore : match.awayScore;
      const opponentScore = isHome ? match.awayScore : match.homeScore;
      const winner = winnerTeamId(match);

      row.gp += 1;
      if (Number.isFinite(ownScore)) row.gf += ownScore;
      if (Number.isFinite(opponentScore)) row.ga += opponentScore;

      if (winner) {
        if (winner === teamId) {
          row.w += 1;
          row.pts += 3;
        } else {
          row.l += 1;
        }
        return;
      }

      if (!Number.isFinite(ownScore) || !Number.isFinite(opponentScore)) return;
      if (ownScore > opponentScore) {
        row.w += 1;
        row.pts += 3;
      } else if (opponentScore > ownScore) {
        row.l += 1;
      } else {
        row.d += 1;
        row.pts += 1;
      }
    });

  row.gd = row.gf - row.ga;
  return row;
}

function teamResultForMatch(match, teamId) {
  if (!isCompletedMatch(match) || (match.homeTeamId !== teamId && match.awayTeamId !== teamId)) return null;
  const winner = winnerTeamId(match);
  if (winner) return winner === teamId ? "W" : "L";
  if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return null;
  if (match.homeScore === match.awayScore) return "D";
  const isHome = match.homeTeamId === teamId;
  return (isHome && match.homeScore > match.awayScore) || (!isHome && match.awayScore > match.homeScore) ? "W" : "L";
}

function allowedFormStages(stage = "all") {
  if (stage === "all") return ["regular", "playoffs"];
  return [stage];
}

function seasonMatchSortValue(data, match) {
  return (Number(data.year) || 0) * 1000000000000 + matchSortValue(match) + (Number(match.week) || 0);
}

function teamFormEntries(data, teamId, { stage = "all" } = {}) {
  const stages = allowedFormStages(stage);
  return (data.matches || [])
    .filter((match) => stages.includes(match.stage))
    .filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)
    .map((match) => ({
      result: teamResultForMatch(match, teamId),
      match,
      season: data.year,
      sortValue: seasonMatchSortValue(data, match),
    }))
    .filter((entry) => entry.result);
}

export function calculateTeamForm(seasonsOrData, teamId, { stage = "all", limit = 5 } = {}) {
  const seasons = Array.isArray(seasonsOrData) ? seasonsOrData : [seasonsOrData];
  return seasons
    .flatMap((data) => teamFormEntries(data, teamId, { stage }))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, limit)
    .map((entry) => entry.result)
    .reverse();
}

export function calculatePlayerForm(seasons, playerId, { stage = "all", limit = 5 } = {}) {
  return seasons
    .flatMap((data) => {
      const player = (data.players || []).find((item) => item.id === playerId);
      if (!player?.teamId) return [];
      const teamIds = unique([player.previousTeamId, player.teamId]);
      return teamIds.flatMap((teamId) => teamFormEntries(data, teamId, { stage }).filter((entry) => playerTeamForMatch(player, entry.match) === teamId));
    })
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, limit)
    .map((entry) => entry.result)
    .reverse();
}

export function calculateCoachForm(seasons, coachId, { stage = "all", division = "All", limit = 5 } = {}) {
  return seasons
    .flatMap((data) =>
      (data.coaches || [])
        .filter((coach) => coach.id === coachId)
        .filter((coach) => division === "All" || coach.division === division)
        .flatMap((coach) => teamFormEntries(data, coach.teamId, { stage }))
    )
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, limit)
    .map((entry) => entry.result)
    .reverse();
}

export function getLatestCompletedMatches(allSeasonData, limit = 4) {
  return allSeasonData
    .flatMap((data) => (data.matches || []).map((match) => ({ ...match, season: data.year, data })))
    .filter((match) => isCompletedMatch(match))
    .sort((a, b) => matchSortValue(b) - matchSortValue(a))
    .slice(0, limit);
}

export function getUpcomingMatches(allSeasonData, limit = 4) {
  const today = new Date();
  return allSeasonData
    .flatMap((data) => (data.matches || []).map((match) => ({ ...match, season: data.year, data })))
    .filter((match) => !isCompletedMatch(match) && (!match.date || new Date(`${match.date}T23:59:59`) >= today))
    .sort((a, b) => matchSortValue(a) - matchSortValue(b))
    .slice(0, limit);
}

export function getNextTeamMatch(seasonsOrData, teamId) {
  const seasons = Array.isArray(seasonsOrData) ? seasonsOrData : [seasonsOrData];
  const today = new Date();
  return seasons
    .flatMap((data) =>
      (data.matches || [])
        .filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)
        .filter((match) => !isCompletedMatch(match))
        .filter((match) => !match.date || new Date(`${match.date}T23:59:59`) >= today)
        .map((match) => ({ ...match, season: data.year, data }))
    )
    .sort((a, b) => matchSortValue(a) - matchSortValue(b))
    .at(0) || null;
}

function playoffBracketMatches(data) {
  if (Array.isArray(data.playoffs?.divisions)) {
    return data.playoffs.divisions.flatMap((division) => (division.rounds || []).flatMap((round) => round.matches || []));
  }
  return (data.playoffs?.rounds || []).flatMap((round) => round.matches || []);
}

function teamAwardAchievements(data, teamId) {
  const teamAwardCategories = new Set(["Champion Team", "2nd Place Team", "3rd Place Team"]);
  return (data.awards?.awards || [])
    .filter((award) => award.teamId === teamId && teamAwardCategories.has(award.category))
    .map((award) => `${data.year} ${award.category}: ${award.winner}`);
}

export function playerTeamForMatch(player, match = {}) {
  if (player.previousTeamId && player.tradeEffectiveDate && match.date && String(match.date) < String(player.tradeEffectiveDate)) {
    return player.previousTeamId;
  }
  return player.teamId;
}

function countRosterMatch(stats, players, teamId, winner, match) {
  const absentees = new Set(match.absences || []);
  players.forEach((player) => {
    if (absentees.has(player.id)) return;
    if (playerTeamForMatch(player, match) !== teamId) return;
    const row = stats.get(player.id);
    if (!row) return;
    row.gamesPlayed += 1;
    if (!winner) return;
    if (winner === teamId) row.wins += 1;
    else row.losses += 1;
  });
}

function countRosterTie(stats, players, teamId, match) {
  const absentees = new Set(match.absences || []);
  players.forEach((player) => {
    if (absentees.has(player.id)) return;
    if (playerTeamForMatch(player, match) !== teamId) return;
    const row = stats.get(player.id);
    if (!row) return;
    row.gamesPlayed += 1;
    row.ties += 1;
  });
}

export function computePlayerStats(data, { stage = "all" } = {}) {
  const players = playerMap(data);
  const stats = new Map();
  const allowedStages = stage === "all" ? ["regular", "playoffs"] : [stage];

  players.forEach((player) => {
    stats.set(player.id, {
      ...player,
      goals: 0,
      assists: 0,
      shots: 0,
      points: 0,
      playerOfMatch: 0,
      mvpScore: 0,
      gamesPlayed: 0,
        wins: 0,
        ties: 0,
        losses: 0,
        achievements: unique([...(player.achievements || []), ...teamAwardAchievements(data, player.teamId)]),
      });
  });

  if (allowedStages.includes("regular")) {
    (data.matches || [])
      .filter((match) => match.stage === "regular")
      .filter((match) => isCompletedMatch(match))
      .forEach((match) => {
        const winner = winnerTeamId(match);
        [match.homeTeamId, match.awayTeamId].forEach((teamId) => {
          if (!winner) {
            countRosterTie(stats, players, teamId, match);
            return;
          }
          countRosterMatch(stats, players, teamId, winner, match);
        });
      });
  }

  if (allowedStages.includes("playoffs")) {
    const playoffMatches = playoffBracketMatches(data);
    const playoffGameSource = playoffMatches.length
      ? playoffMatches
      : (data.matches || []).filter((match) => match.stage === "playoffs" && isCompletedMatch(match));
    playoffGameSource.forEach((match) => {
      const winner = winnerTeamId(match);
      [match.homeTeamId, match.awayTeamId].forEach((teamId) => {
        if (!winner && Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
          countRosterTie(stats, players, teamId, match);
          return;
        }
        countRosterMatch(stats, players, teamId, winner, match);
      });
    });
  }

  (data.matches || [])
    .filter((match) => allowedStages.includes(match.stage))
    .filter((match) => isCompletedMatch(match))
    .forEach((match) => {
      (match.scorers || []).forEach((scorer) => {
        if (!scorer.playerId) return;
        const row = stats.get(scorer.playerId);
        if (!row) return;
        row.goals += Number(scorer.goals) || 0;
      });

      (match.assists || []).forEach((assist) => {
        if (!assist.playerId) return;
        const row = stats.get(assist.playerId);
        if (!row) return;
        row.assists += Number(assist.assists) || 0;
      });

      (match.shots || []).forEach((shot) => {
        if (!shot.playerId) return;
        const row = stats.get(shot.playerId);
        if (!row) return;
        row.shots += Number(shot.shots) || 0;
      });

      if (match.playerOfMatchId && stats.has(match.playerOfMatchId)) {
        stats.get(match.playerOfMatchId).playerOfMatch += 1;
      }
    });

  return [...stats.values()]
    .map((row) => ({
      ...row,
      points: row.goals + row.assists,
      mvpScore: row.goals,
    }))
    .sort((a, b) => b.points - a.points || b.goals - a.goals || b.shots - a.shots || a.name.localeCompare(b.name));
}

export function computeCombinedPlayerStats(seasons, options = {}) {
  const map = new Map();
  seasons.forEach((data) => {
    computePlayerStats(data, options).forEach((row) => {
      const existing = map.get(row.id) || {
        id: row.id,
        name: row.name,
        teamId: row.teamId,
        teamName: row.teamName,
        division: row.division,
        position: row.position,
        jersey: row.jersey,
        photo: row.photo,
        achievements: [],
        goals: 0,
        assists: 0,
        shots: 0,
        points: 0,
        gamesPlayed: 0,
        wins: 0,
        ties: 0,
        losses: 0,
        playerOfMatch: 0,
        mvpScore: 0,
        ovrOverride: row.ovrOverride,
      };
      existing.goals += row.goals;
      existing.assists += row.assists;
      existing.shots += row.shots;
      existing.points += row.points;
      existing.gamesPlayed += row.gamesPlayed;
      existing.wins += row.wins;
      existing.ties += row.ties;
      existing.losses += row.losses;
      existing.playerOfMatch += row.playerOfMatch;
      existing.mvpScore += row.mvpScore;
      if (Number.isFinite(row.ovrOverride)) existing.ovrOverride = row.ovrOverride;
      existing.achievements = unique([...(existing.achievements || []), ...(row.achievements || [])]);
      existing.name = row.name || existing.name;
      existing.teamId = row.teamId || existing.teamId;
      existing.teamName = row.teamName || existing.teamName;
      existing.division = row.division || existing.division;
      existing.position = row.position || existing.position;
      existing.jersey = row.jersey || existing.jersey;
      existing.photo = row.photo || existing.photo;
      map.set(row.id, existing);
    });
  });
  return [...map.values()].sort((a, b) => b.points - a.points || b.goals - a.goals || b.shots - a.shots || a.name.localeCompare(b.name));
}

export function playerRatingScore(player = {}) {
  const achievements = (player.achievements || []).join(" ");
  const achievementBonus =
    (/\bMVP\b/i.test(achievements) ? 12 : 0) +
    (/Golden Boot/i.test(achievements) ? 10 : 0) +
    (/Champion Team/i.test(achievements) ? 4 : 0) +
    (/2nd Place Team/i.test(achievements) ? 2 : 0) +
    (/3rd Place Team/i.test(achievements) ? 1 : 0);
  return (
    (Number(player.points) || 0) * 5 +
    (Number(player.goals) || 0) * 3 +
    (Number(player.assists) || 0) * 2 +
    (Number(player.shots) || 0) * 0.65 +
    (Number(player.wins) || 0) * 1.5 +
    (Number(player.playerOfMatch) || 0) * 6 +
    (Number(player.gamesPlayed) || 0) * 0.75 +
    achievementBonus
  );
}

export function playerOVR(player = {}, comparisonPlayers = []) {
  if (Number.isFinite(player.ovrOverride)) return Math.max(0, Math.min(99, Math.round(player.ovrOverride)));
  const pool = comparisonPlayers.length ? comparisonPlayers : [player];
  const scores = [...new Set(pool.map((item) => playerRatingScore(item)))].sort((a, b) => a - b);
  const score = playerRatingScore(player);
  if (scores.length === 1) return 50;
  const rank = scores.indexOf(score);
  const percentile = rank < 0 ? 0 : rank / (scores.length - 1);
  return Math.round(50 + percentile * 49);
}

export function playersWithOVR(players = [], comparisonPlayers = players) {
  return players.map((player) => ({
    ...player,
    ovr: playerOVR(player, comparisonPlayers),
  }));
}

export function computePlayerVsTeamStatsBySeason(seasons, playerId, { stage = "all" } = {}) {
  const allowedStages = stage === "all" ? ["regular", "playoffs"] : [stage];
  return seasons
    .map((data) => {
      const players = playerMap(data);
      const player = players.get(playerId);
      if (!player) return null;
      const teamsById = teamMap(data);
      const opponents = new Map();

      (data.matches || [])
        .filter((match) => allowedStages.includes(match.stage))
        .filter((match) => isCompletedMatch(match))
        .forEach((match) => {
          const playerTeamId = playerTeamForMatch(player, match);
          if (match.homeTeamId !== playerTeamId && match.awayTeamId !== playerTeamId) return;
          const absentees = new Set(match.absences || []);
          if (absentees.has(playerId)) return;

          const opponentId = match.homeTeamId === playerTeamId ? match.awayTeamId : match.homeTeamId;
          if (!opponentId || opponentId === playerTeamId) return;

          if (!opponents.has(opponentId)) {
            const opponentTeam = teamsById.get(opponentId);
            opponents.set(opponentId, {
              teamId: opponentId,
              teamName: opponentTeam?.name || "Opponent TBA",
              gp: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              goals: 0,
              assists: 0,
              games: [],
            });
          }

          const row = opponents.get(opponentId);
          row.gp += 1;

          const winner = winnerTeamId(match);
          const result = !winner ? "D" : winner === playerTeamId ? "W" : "L";
          if (result === "D") row.draws += 1;
          else if (result === "W") row.wins += 1;
          else row.losses += 1;

          let matchGoals = 0;
          let matchAssists = 0;
          (match.scorers || []).forEach((scorer) => {
            if (scorer.playerId === playerId) matchGoals += Number(scorer.goals) || 0;
          });
          (match.assists || []).forEach((assist) => {
            if (assist.playerId === playerId) matchAssists += Number(assist.assists) || 0;
          });
          row.goals += matchGoals;
          row.assists += matchAssists;
          row.games.push({
            date: match.date || "",
            week: match.week,
            stage: match.stage,
            result,
            goals: matchGoals,
            assists: matchAssists,
            sortValue: seasonMatchSortValue(data, match),
          });
        });

      const rows = [...opponents.values()]
        .map((row) => ({
          ...row,
          games: row.games.sort((a, b) => a.sortValue - b.sortValue),
        }))
        .sort(
          (a, b) => b.gp - a.gp || b.goals + b.assists - (a.goals + a.assists) || a.teamName.localeCompare(b.teamName)
        );
      if (!rows.length) return null;
      return { year: data.year, division: player.division, opponents: rows };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.year) - Number(a.year));
}

export function buildPlayerCareer(seasons, playerId, options = {}) {
  return seasons
    .map((data) => {
      const stats = computePlayerStats(data, options).find((player) => player.id === playerId);
      if (!stats) return null;
      return {
        year: data.year,
        team: unique([stats.previousTeamName, stats.teamName]).join(" / ") || "Unassigned",
        jersey: stats.jersey || "Not listed",
        points: stats.points,
        gamesPlayed: stats.gamesPlayed,
        goals: stats.goals,
        shots: stats.shots,
        wins: stats.wins,
        ties: stats.ties,
        losses: stats.losses,
        assists: stats.assists,
        division: stats.division,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.year) - Number(a.year));
}

export function getCurrentPlayer(seasons, playerId) {
  return [...seasons]
    .reverse()
    .flatMap((data) => computePlayerStats(data))
    .find((player) => player.id === playerId);
}

export function buildCoachCareer(seasons, coachId) {
  return seasons
    .flatMap((data) => {
      return (data.coaches || [])
        .filter((coach) => coach.id === coachId)
        .map((coach) => {
          const teamStats = getTeamStats(data, coach.teamId) || {};
          return {
            year: data.year,
            coach,
            team: coach.teamName,
            points: teamStats.pts || 0,
            gamesPlayed: teamStats.gp || 0,
            wins: teamStats.w || 0,
            ties: teamStats.d || 0,
            losses: teamStats.l || 0,
            championships: coach.championships || 0,
            finals: coach.finals || 0,
          };
        });
    })
    .sort((a, b) => Number(b.year) - Number(a.year));
}

export function computeCoachSummary(seasons, { stage = "regular" } = {}) {
  const map = new Map();
  seasons.forEach((data) => {
    (data.coaches || []).forEach((coach) => {
      const teamStats = calculateTeamRecord(data, coach.teamId, { stage }) || {};
      const existing = map.get(coach.id) || {
        ...coach,
        pastTeams: [],
        divisions: [],
        seasons: 0,
        gamesPlayed: 0,
        wins: 0,
        ties: 0,
        losses: 0,
        championships: 0,
        finals: 0,
      };
      existing.name = coach.name;
      existing.teamId = coach.teamId;
      existing.teamName = coach.teamName;
      existing.divisions = unique([...(existing.divisions || []), coach.division]);
      existing.division = existing.divisions.join(" / ");
      existing.notes = coach.notes || existing.notes || "";
      existing.seasons += 1;
      existing.gamesPlayed += teamStats.gp || 0;
      existing.wins += teamStats.w || 0;
      existing.ties += teamStats.d || 0;
      existing.losses += teamStats.l || 0;
      existing.championships += coach.championships || 0;
      existing.finals += coach.finals || 0;
      existing.pastTeams = unique([...existing.pastTeams, coach.teamName]);
      map.set(coach.id, existing);
    });
  });

  return [...map.values()].map((coach) => ({
    ...coach,
    division: (coach.divisions || [coach.division]).join(" / "),
    winPct: formatPercent(coach.gamesPlayed ? (coach.wins / coach.gamesPlayed) * 100 : 0),
  }));
}

export function getCurrentCoach(seasons, coachId) {
  return [...seasons]
    .reverse()
    .flatMap((data) => data.coaches || [])
    .find((coach) => coach.id === coachId);
}

export function getAwards(seasons, { season = "All", division = "All" } = {}) {
  return seasons
    .filter((data) => season === "All" || data.year === String(season))
    .flatMap((data) => (data.awards?.awards || []).map((award) => ({ ...award, season: data.year })))
    .filter((award) => division === "All" || award.division === division);
}
