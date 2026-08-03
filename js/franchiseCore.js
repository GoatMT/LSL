import { loadJSON } from "./dataLoader.js";

const STORAGE_KEY = "lsl-franchise-save-v1";

export const CAP_MAX = 100_000_000;
export const MAX_CONTRACT_YEARS = 2;
export const DRAFT_ROUNDS = 10;
export const TRADE_DEADLINE_WEEK = 4;
export const HARD_TRADE_MARGIN = 1.15; // CPU wants 15% more value coming in than going out

export const POSITION_TARGETS = { Forward: 3, Midfielder: 3, Defender: 3, Goalkeeper: 1 };

// ---------- Config / player pool / save I/O ----------

export async function loadFranchiseConfig() {
  return loadJSON("./data/franchise/config.json", {});
}

export async function loadFranchisePlayerPool() {
  const data = await loadJSON("./data/franchise/players.json", { players: [] });
  return data.players || [];
}

export function loadFranchiseSave() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("Could not read franchise save", error);
    return null;
  }
}

export function saveFranchiseSave(save) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch (error) {
    console.error("Could not write franchise save", error);
    return false;
  }
}

export function clearFranchiseSave() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("Could not clear franchise save", error);
    return false;
  }
}

export function formatMoney(value = 0) {
  const millions = value / 1_000_000;
  return `$${millions.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: millions % 1 === 0 ? 0 : 1 })}M`;
}

// ---------- Save creation ----------

export function createFranchiseSave(config, userTeamId) {
  const teams = config.teams || [];
  const teamIds = teams.map((team) => team.id);
  return {
    version: 3,
    createdAt: new Date().toISOString(),
    userTeamId,
    season: 1,
    week: 0,
    phase: "predraft",
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      abbr: team.abbr,
      color: team.color,
      isUser: team.id === userTeamId,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    })),
    rosters: Object.fromEntries(teamIds.map((id) => [id, []])),
    freeAgents: [],
    draftOrder: [],
    draftPickIndex: 0,
    draftLog: [],
    futurePicks: Object.fromEntries(
      teamIds.map((id) => [
        id,
        Array.from({ length: DRAFT_ROUNDS }, (_, index) => ({ season: 2, round: index + 1, originalTeamId: id })),
      ])
    ),
    trades: [],
    tradeBlock: Object.fromEntries(teamIds.map((id) => [id, []])),
    history: [],
    playerSeasonStats: {},
    careerStats: {},
    teamStreaks: {},
    awardsHistory: [],
  };
}

// ---------- Draft ----------

export function buildSnakeDraftOrder(teamIds, rounds = DRAFT_ROUNDS) {
  const order = [];
  for (let round = 0; round < rounds; round += 1) {
    const roundOrder = round % 2 === 0 ? [...teamIds] : [...teamIds].reverse();
    order.push(...roundOrder);
  }
  return order;
}

export function shuffledTeamIds(teamIds) {
  const arr = [...teamIds];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function startDraft(save, players) {
  const teamIds = shuffledTeamIds(save.teams.map((team) => team.id));
  save.draftOrder = buildSnakeDraftOrder(teamIds, DRAFT_ROUNDS);
  save.draftPickIndex = 0;
  save.draftLog = [];
  save.freeAgents = players.map((player) => player.id);
  save.rosters = Object.fromEntries(save.teams.map((team) => [team.id, []]));
  save.phase = "draft";
  return save;
}

export function isDraftComplete(save) {
  return !save.draftOrder || save.draftPickIndex >= save.draftOrder.length;
}

export function currentPick(save) {
  if (isDraftComplete(save)) return null;
  return {
    overall: save.draftPickIndex + 1,
    round: Math.floor(save.draftPickIndex / save.teams.length) + 1,
    teamId: save.draftOrder[save.draftPickIndex],
  };
}

export function isUsersPick(save) {
  const pick = currentPick(save);
  return !!pick && pick.teamId === save.userTeamId;
}

export function availablePlayers(save, allPlayers) {
  const set = new Set(save.freeAgents);
  return allPlayers.filter((player) => set.has(player.id));
}

export function positionCounts(roster = []) {
  const counts = { Forward: 0, Midfielder: 0, Defender: 0, Goalkeeper: 0 };
  roster.forEach((player) => {
    counts[player.position] = (counts[player.position] || 0) + 1;
  });
  return counts;
}

export function teamNeedScore(roster, position) {
  const counts = positionCounts(roster);
  const target = POSITION_TARGETS[position] || 2;
  const have = counts[position] || 0;
  // Bigger bonus the further below target a team is; small penalty once past target.
  return have < target ? (target - have) * 6 : (target - have) * 2;
}

export function cpuBestPick(save, teamId, allPlayers) {
  const options = availablePlayers(save, allPlayers);
  if (!options.length) return null;
  const roster = save.rosters[teamId] || [];
  let best = options[0];
  let bestScore = -Infinity;
  options.forEach((player) => {
    const score = player.rating + teamNeedScore(roster, player.position);
    if (score > bestScore) {
      bestScore = score;
      best = player;
    }
  });
  return best;
}

export function draftPlayer(save, playerId, allPlayers) {
  const pick = currentPick(save);
  if (!pick) return save;
  const player = allPlayers.find((item) => item.id === playerId);
  if (!player) return save;

  save.rosters[pick.teamId] = save.rosters[pick.teamId] || [];
  save.rosters[pick.teamId].push({ ...player, contract: null });
  save.freeAgents = save.freeAgents.filter((id) => id !== playerId);
  save.draftLog.push({ overall: pick.overall, round: pick.round, teamId: pick.teamId, playerId: player.id, playerName: player.name });
  save.draftPickIndex += 1;
  return save;
}

export function autoAdvanceCpuPicks(save, allPlayers) {
  while (!isDraftComplete(save) && !isUsersPick(save)) {
    const pick = currentPick(save);
    const player = cpuBestPick(save, pick.teamId, allPlayers);
    if (!player) break;
    draftPlayer(save, player.id, allPlayers);
  }
  return save;
}

// ---------- Contracts ----------

export function generateContract(player) {
  const strength = Math.max(0, Math.min(1, (player.rating - 40) / (99 - 40)));
  const base = 3_000_000 + strength ** 2.2 * 16_000_000;
  const variance = 0.9 + Math.random() * 0.2;
  const salary = Math.round((base * variance) / 50_000) * 50_000;
  const years = Math.random() < 0.35 + strength * 0.3 ? 2 : 1;
  return { years, salary, seasonSigned: null };
}

export function finalizeDraftContracts(save) {
  Object.keys(save.rosters).forEach((teamId) => {
    save.rosters[teamId] = save.rosters[teamId].map((player) => ({
      ...player,
      contract: player.contract || { ...generateContract(player), seasonSigned: save.season },
    }));
  });
  save.phase = "offseason";
  return save;
}

export function teamCapUsed(save, teamId) {
  return (save.rosters[teamId] || []).reduce((sum, player) => sum + (player.contract?.salary || 0), 0);
}

export function teamCapSpace(save, teamId) {
  return CAP_MAX - teamCapUsed(save, teamId);
}

// ---------- Trading ----------

export function playerTradeValue(rosterPlayer) {
  const ratingValue = rosterPlayer.rating * 1.0;
  const salaryMillions = (rosterPlayer.contract?.salary || 0) / 1_000_000;
  const expectedForRating = 3 + Math.max(0, rosterPlayer.rating - 40) ** 1.4 / 30;
  const contractPenalty = Math.max(0, salaryMillions - expectedForRating) * 1.5;
  return Math.max(5, ratingValue - contractPenalty);
}

export function pickTradeValue(pick) {
  const roundValues = [0, 24, 16, 11, 8, 6, 5, 4, 3, 2, 1];
  return roundValues[pick.round] ?? 1;
}

export function offerSideValue(save, teamId, { playerIds = [], picks = [] } = {}) {
  const roster = save.rosters[teamId] || [];
  const playerValue = playerIds.reduce((sum, playerId) => {
    const player = roster.find((item) => item.id === playerId);
    return sum + (player ? playerTradeValue(player) : 0);
  }, 0);
  const pickValue = picks.reduce((sum, pick) => sum + pickTradeValue(pick), 0);
  return playerValue + pickValue;
}

export function evaluateTradeOffer(save, offer) {
  const { teamAId, teamBId, teamAGives, teamBGives } = offer;
  const valueFromAToB = offerSideValue(save, teamAId, teamAGives);
  const valueFromBToA = offerSideValue(save, teamBId, teamBGives);

  const teamAIsCpu = teamAId !== save.userTeamId;
  const teamBIsCpu = teamBId !== save.userTeamId;

  let cpuAccepts = true;
  let reason = "Both general managers agree to the terms.";

  if (teamBIsCpu) {
    // Team B (often the CPU side being pitched an offer) must receive at least HARD_TRADE_MARGIN times what it gives up.
    if (valueFromAToB < valueFromBToA * HARD_TRADE_MARGIN) {
      cpuAccepts = false;
      reason = `${offer.teamBName || "The CPU"} wants more value coming back before agreeing to this trade.`;
    }
  }
  if (teamAIsCpu && cpuAccepts) {
    if (valueFromBToA < valueFromAToB * HARD_TRADE_MARGIN) {
      cpuAccepts = false;
      reason = `${offer.teamAName || "The CPU"} wants more value coming back before agreeing to this trade.`;
    }
  }

  return { valueFromAToB, valueFromBToA, cpuAccepts, reason };
}

export function isTradeDeadlinePassed(save) {
  return save.week > TRADE_DEADLINE_WEEK;
}

export function executeTrade(save, offer) {
  const { teamAId, teamBId, teamAGives, teamBGives } = offer;

  const movePlayers = (fromTeamId, toTeamId, playerIds) => {
    playerIds.forEach((playerId) => {
      const roster = save.rosters[fromTeamId] || [];
      const index = roster.findIndex((item) => item.id === playerId);
      if (index === -1) return;
      clearCaptaincyRole(save, fromTeamId, playerId);
      const [player] = roster.splice(index, 1);
      save.rosters[toTeamId] = save.rosters[toTeamId] || [];
      save.rosters[toTeamId].push(player);
    });
  };

  const movePicks = (fromTeamId, toTeamId, picks) => {
    picks.forEach((pick) => {
      const list = save.futurePicks[fromTeamId] || [];
      const index = list.findIndex((item) => item.season === pick.season && item.round === pick.round && item.originalTeamId === pick.originalTeamId);
      if (index === -1) return;
      const [moved] = list.splice(index, 1);
      save.futurePicks[toTeamId] = save.futurePicks[toTeamId] || [];
      save.futurePicks[toTeamId].push(moved);
    });
  };

  movePlayers(teamAId, teamBId, teamAGives.playerIds || []);
  movePlayers(teamBId, teamAId, teamBGives.playerIds || []);
  movePicks(teamAId, teamBId, teamAGives.picks || []);
  movePicks(teamBId, teamAId, teamBGives.picks || []);

  save.tradeBlock[teamAId] = (save.tradeBlock[teamAId] || []).filter((id) => !(teamAGives.playerIds || []).includes(id));
  save.tradeBlock[teamBId] = (save.tradeBlock[teamBId] || []).filter((id) => !(teamBGives.playerIds || []).includes(id));

  const trade = {
    id: `trade-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    season: save.season,
    week: save.week,
    teamAId,
    teamBId,
    teamAGives,
    teamBGives,
  };
  save.trades.push(trade);
  return trade;
}

export function proposeCpuToCpuTrade(save, allPlayers) {
  const cpuTeamIds = save.teams.filter((team) => team.id !== save.userTeamId).map((team) => team.id);
  if (cpuTeamIds.length < 2) return { executed: false };
  const shuffled = shuffledTeamIds(cpuTeamIds);
  const teamAId = shuffled[0];
  const teamBId = shuffled[1];
  const rosterA = save.rosters[teamAId] || [];
  const rosterB = save.rosters[teamBId] || [];
  if (!rosterA.length || !rosterB.length) return { executed: false };

  const countsA = positionCounts(rosterA);
  const countsB = positionCounts(rosterB);

  const findSurplusForNeed = (givingRoster, givingCounts, needingCounts) => {
    const surplusPositions = Object.keys(POSITION_TARGETS).filter(
      (position) => (givingCounts[position] || 0) > POSITION_TARGETS[position] && (needingCounts[position] || 0) < POSITION_TARGETS[position]
    );
    const candidates = givingRoster.filter((player) => surplusPositions.includes(player.position));
    if (!candidates.length) return null;
    return candidates.sort((a, b) => a.rating - b.rating)[0]; // offer up a lower-value surplus piece first
  };

  const playerFromA = findSurplusForNeed(rosterA, countsA, countsB);
  const playerFromB = findSurplusForNeed(rosterB, countsB, countsA);
  if (!playerFromA || !playerFromB) return { executed: false };

  const offer = {
    teamAId,
    teamBId,
    teamAName: save.teams.find((team) => team.id === teamAId)?.name,
    teamBName: save.teams.find((team) => team.id === teamBId)?.name,
    teamAGives: { playerIds: [playerFromA.id], picks: [] },
    teamBGives: { playerIds: [playerFromB.id], picks: [] },
  };

  const evaluation = evaluateTradeOffer(save, offer);
  if (!evaluation.cpuAccepts) return { executed: false };

  const trade = executeTrade(save, offer);
  return { executed: true, trade, playerFromA, playerFromB };
}

// =====================================================================
// Part 3: Team Management (chemistry, captains, injuries, morale,
// training, lineups/formations, player development), season simulation,
// playoffs, owner objectives, and free agency (offers/competing bids,
// waivers, retirements).
// =====================================================================

export const SEASON_WEEKS = 6;
export const TRAINING_SUCCESS_CHANCE = 0.55;
export const DEVELOPMENT_CHANCE_PER_GAME = 0.08;
export const CAPTAIN_MORALE_BONUS = 15;
export const CAPTAIN_RATING_BONUS = 6;

// ---------- Schedule + ratings ----------

export function buildRoundRobinSchedule(teamIds, weeks = SEASON_WEEKS) {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push(null);
  const n = teams.length;
  const roundsNeeded = n - 1;
  const baseSchedule = [];
  let arr = [...teams];
  for (let r = 0; r < roundsNeeded; r += 1) {
    const roundMatches = [];
    for (let i = 0; i < n / 2; i += 1) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home !== null && away !== null) {
        if (r % 2 === 0) roundMatches.push({ homeTeamId: home, awayTeamId: away });
        else roundMatches.push({ homeTeamId: away, awayTeamId: home });
      }
    }
    baseSchedule.push(roundMatches);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }
  const schedule = [];
  for (let w = 0; w < weeks; w += 1) {
    schedule.push(baseSchedule[w % baseSchedule.length]);
  }
  return schedule;
}

export function computeChemistry(save, teamId) {
  const roster = save.rosters[teamId] || [];
  if (!roster.length) return 50;
  const counts = positionCounts(roster);
  let balanceScore = 0;
  Object.keys(POSITION_TARGETS).forEach((position) => {
    const have = counts[position] || 0;
    const target = POSITION_TARGETS[position];
    balanceScore += Math.max(0, 10 - Math.abs(have - target) * 3);
  });
  const captainBonus = save.captains?.[teamId] ? 8 : 0;
  const avgMorale = roster.reduce((sum, player) => sum + (player.morale ?? 70), 0) / roster.length;
  const moraleFactor = (avgMorale - 50) * 0.4;
  const base = 40 + balanceScore + captainBonus + moraleFactor;
  return Math.max(10, Math.min(99, Math.round(base)));
}

export function teamOverallRating(save, teamId) {
  const pool = save.rosters[teamId] || [];
  if (!pool.length) return 50;
  const top = [...pool].sort((a, b) => b.rating - a.rating).slice(0, 8);
  const avgRating = top.reduce((sum, player) => sum + player.rating, 0) / top.length;
  const avgMorale = top.reduce((sum, player) => sum + (player.morale ?? 70), 0) / top.length;
  const chemistry = computeChemistry(save, teamId);
  return avgRating + (avgMorale - 70) * 0.05 + (chemistry - 70) * 0.08;
}

export function simulateMatch(ratingA, ratingB) {
  const diff = ratingA - ratingB;
  const expectedA = 1.6 + diff / 22;
  const expectedB = 1.6 - diff / 22;
  const roll = (lambda) => Math.max(0, Math.round(Math.max(0.15, lambda) + (Math.random() - 0.5) * 2.4));
  return { scoreA: roll(expectedA), scoreB: roll(expectedB) };
}

// ---------- Season lifecycle ----------

export function ensureRosterMeta(save) {
  Object.keys(save.rosters).forEach((teamId) => {
    save.rosters[teamId] = (save.rosters[teamId] || []).map((player) => ({
      morale: 70,
      development: 0,
      captaincyBoosted: false,
      ...player,
    }));
  });
  return save;
}

export function startSeason(save) {
  ensureRosterMeta(save);
  ensurePlayerStatsShape(save);
  Object.keys(save.rosters).forEach((teamId) => {
    (save.rosters[teamId] || []).forEach((player) => {
      player.seasonStartRating = player.rating;
    });
  });
  save.playerSeasonStats = {};
  const teamIds = save.teams.map((team) => team.id);
  save.schedule = buildRoundRobinSchedule(teamIds, SEASON_WEEKS);
  save.week = 1;
  save.phase = "season";
  save.results = save.results || [];
  save.ownerObjectives = save.ownerObjectives || { reachedSemis: false, wonChampionship: false, winningRecord: false };
  save.lineups = save.lineups || {};
  save.captains = save.captains || {};
  save.assistantCaptains = save.assistantCaptains || {};
  save.trainingLog = save.trainingLog || [];
  save.retirementLog = save.retirementLog || [];
  return save;
}

function applyPostMatchEffects(save, teamId, outcome) {
  const roster = save.rosters[teamId] || [];
  roster.forEach((player) => {
    const moraleShift = outcome === "win" ? 4 : outcome === "draw" ? 0 : -4;
    player.morale = Math.max(0, Math.min(100, Math.round((player.morale ?? 70) + moraleShift + (Math.random() * 2 - 1))));
    if (Math.random() < DEVELOPMENT_CHANCE_PER_GAME) {
      const delta = player.rating < 65 || Math.random() < 0.5 ? 1 : -1;
      player.rating = Math.max(40, Math.min(99, player.rating + delta));
      player.development = (player.development || 0) + delta;
    }
  });
}

export function advanceWeek(save) {
  if (save.phase !== "season") return save;
  const weekIndex = save.week - 1;
  const matches = (save.schedule || [])[weekIndex] || [];
  const weekResults = matches.map((match) => {
    const ratingA = teamOverallRating(save, match.homeTeamId);
    const ratingB = teamOverallRating(save, match.awayTeamId);
    const { scoreA, scoreB } = simulateMatch(ratingA, ratingB);
    const teamA = save.teams.find((team) => team.id === match.homeTeamId);
    const teamB = save.teams.find((team) => team.id === match.awayTeamId);

    teamA.goalsFor += scoreA;
    teamA.goalsAgainst += scoreB;
    teamB.goalsFor += scoreB;
    teamB.goalsAgainst += scoreA;

    if (scoreA > scoreB) {
      teamA.wins += 1;
      teamA.points += 3;
      teamB.losses += 1;
      applyPostMatchEffects(save, match.homeTeamId, "win");
      applyPostMatchEffects(save, match.awayTeamId, "loss");
      recordStreak(save, match.homeTeamId, "win");
      recordStreak(save, match.awayTeamId, "loss");
    } else if (scoreB > scoreA) {
      teamB.wins += 1;
      teamB.points += 3;
      teamA.losses += 1;
      applyPostMatchEffects(save, match.homeTeamId, "loss");
      applyPostMatchEffects(save, match.awayTeamId, "win");
      recordStreak(save, match.homeTeamId, "loss");
      recordStreak(save, match.awayTeamId, "win");
    } else {
      teamA.draws += 1;
      teamA.points += 1;
      teamB.draws += 1;
      teamB.points += 1;
      applyPostMatchEffects(save, match.homeTeamId, "draw");
      applyPostMatchEffects(save, match.awayTeamId, "draw");
      recordStreak(save, match.homeTeamId, "draw");
      recordStreak(save, match.awayTeamId, "draw");
    }

    recordTeamMatchStats(save, match.homeTeamId, scoreB, scoreA);
    recordTeamMatchStats(save, match.awayTeamId, scoreA, scoreB);

    return { week: save.week, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, homeScore: scoreA, awayScore: scoreB };
  });

  save.results = [...(save.results || []), ...weekResults];
  save.week += 1;
  if (save.week > SEASON_WEEKS) save.phase = "postseason-ready";
  return save;
}

export function standingsForSave(save) {
  return [...save.teams].sort(
    (a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor
  );
}

export function runPlayoffs(save) {
  const table = standingsForSave(save);
  const seed = (rank) => table[rank - 1];

  const simRound = (teamA, teamB) => {
    if (!teamA) return teamB;
    if (!teamB) return teamA;
    const ratingA = teamOverallRating(save, teamA.id) + Math.random() * 3;
    const ratingB = teamOverallRating(save, teamB.id) + Math.random() * 3;
    const { scoreA, scoreB } = simulateMatch(ratingA, ratingB);
    if (scoreA === scoreB) return Math.random() < 0.5 + (ratingA - ratingB) / 100 ? teamA : teamB;
    return scoreA > scoreB ? teamA : teamB;
  };

  const qf1Winner = simRound(seed(3), seed(6));
  const qf2Winner = simRound(seed(4), seed(5));
  const sf1Winner = simRound(seed(1), qf2Winner);
  const sf2Winner = simRound(seed(2), qf1Winner);
  const champion = simRound(sf1Winner, sf2Winner);

  const userTeamId = save.userTeamId;
  const reachedSemis = [seed(1)?.id, seed(2)?.id, sf1Winner?.id, sf2Winner?.id].includes(userTeamId);
  const userTeam = save.teams.find((team) => team.id === userTeamId);
  const winningRecord = !!userTeam && userTeam.wins > userTeam.losses;

  save.playoffResults = {
    qf1: { teamA: seed(3), teamB: seed(6), winner: qf1Winner },
    qf2: { teamA: seed(4), teamB: seed(5), winner: qf2Winner },
    sf1: { teamA: seed(1), teamB: qf2Winner, winner: sf1Winner },
    sf2: { teamA: seed(2), teamB: qf1Winner, winner: sf2Winner },
    final: { teamA: sf1Winner, teamB: sf2Winner, winner: champion },
    champion,
  };

  save.ownerObjectives = {
    reachedSemis,
    wonChampionship: champion?.id === userTeamId,
    winningRecord,
  };

  save.history = save.history || [];
  save.history.push({
    season: save.season,
    champion: champion?.name,
    championTeamId: champion?.id || null,
    userResult: champion?.id === userTeamId ? "Champion" : reachedSemis ? "Reached Semifinals" : "Missed Semifinals",
    record: userTeam ? `${userTeam.wins}-${userTeam.losses}-${userTeam.draws}` : "",
  });

  save.lastSeasonAwards = computeSeasonAwards(save);

  save.phase = "playoffs-complete";
  return save;
}

export function startNextSeason(save) {
  archiveSeasonStatsToCareer(save);
  const { retired } = processRetirements(save);
  save.season += 1;
  save.week = 0;
  save.results = [];
  save.playoffResults = null;
  save.trainingLog = [];
  save.teams = save.teams.map((team) => ({ ...team, wins: 0, losses: 0, draws: 0, points: 0, goalsFor: 0, goalsAgainst: 0 }));
  save.phase = "offseason";
  return { save, retired };
}

// ---------- Team management: captains, training, lineups ----------

function applyCaptaincyBoost(player) {
  if (player.captaincyBoosted) return;
  player.rating = Math.min(99, player.rating + CAPTAIN_RATING_BONUS);
  player.morale = Math.min(100, (player.morale ?? 70) + CAPTAIN_MORALE_BONUS);
  player.captaincyBoosted = true;
}

function removeCaptaincyBoost(player) {
  if (!player.captaincyBoosted) return;
  player.rating = Math.max(40, player.rating - CAPTAIN_RATING_BONUS);
  player.morale = Math.max(0, (player.morale ?? 70) - CAPTAIN_MORALE_BONUS);
  player.captaincyBoosted = false;
}

export function clearCaptaincyRole(save, teamId, playerId) {
  const roster = save.rosters[teamId] || [];
  const player = roster.find((item) => item.id === playerId);
  let changed = false;
  if (save.captains?.[teamId] === playerId) {
    delete save.captains[teamId];
    changed = true;
  }
  if (save.assistantCaptains?.[teamId] === playerId) {
    delete save.assistantCaptains[teamId];
    changed = true;
  }
  if (changed && player) removeCaptaincyBoost(player);
}

export function setCaptain(save, teamId, playerId) {
  save.captains = save.captains || {};
  save.assistantCaptains = save.assistantCaptains || {};
  const roster = save.rosters[teamId] || [];
  const previousCaptainId = save.captains[teamId];
  const assistantId = save.assistantCaptains[teamId];
  if (previousCaptainId === playerId) return save;

  if (previousCaptainId && previousCaptainId !== assistantId) {
    const prevPlayer = roster.find((item) => item.id === previousCaptainId);
    if (prevPlayer) removeCaptaincyBoost(prevPlayer);
  }
  if (assistantId === playerId) save.assistantCaptains[teamId] = null;

  save.captains[teamId] = playerId;
  const newPlayer = roster.find((item) => item.id === playerId);
  if (newPlayer) applyCaptaincyBoost(newPlayer);
  return save;
}

export function setAssistantCaptain(save, teamId, playerId) {
  save.assistantCaptains = save.assistantCaptains || {};
  save.captains = save.captains || {};
  const roster = save.rosters[teamId] || [];
  const captainId = save.captains[teamId];
  if (captainId === playerId) return save;

  const previousAssistantId = save.assistantCaptains[teamId];
  if (previousAssistantId === playerId) return save;

  if (previousAssistantId && previousAssistantId !== captainId) {
    const prevPlayer = roster.find((item) => item.id === previousAssistantId);
    if (prevPlayer) removeCaptaincyBoost(prevPlayer);
  }

  save.assistantCaptains[teamId] = playerId;
  const newPlayer = roster.find((item) => item.id === playerId);
  if (newPlayer) applyCaptaincyBoost(newPlayer);
  return save;
}

export function applyTraining(save, teamId, playerId) {
  const roster = save.rosters[teamId] || [];
  const player = roster.find((item) => item.id === playerId);
  if (!player) return { success: false };
  save.trainingLog = save.trainingLog || [];
  if (Math.random() < TRAINING_SUCCESS_CHANCE) {
    player.rating = Math.min(99, player.rating + 1);
    player.morale = Math.min(100, (player.morale ?? 70) + 3);
    save.trainingLog.unshift({ week: save.week, teamId, playerId, playerName: player.name, result: "improved" });
    return { success: true, player };
  }
  player.morale = Math.max(0, (player.morale ?? 70) - 1);
  save.trainingLog.unshift({ week: save.week, teamId, playerId, playerName: player.name, result: "no change" });
  return { success: false, player };
}

export const FORMATIONS = ["4-3-3", "4-4-2", "3-5-2", "5-3-2"];
export const STARTING_XI_SIZE = 11;

export function setLineup(save, teamId, formation, startingIds) {
  save.lineups = save.lineups || {};
  save.lineups[teamId] = { formation, startingIds };
  return save;
}

// ---------- Free agency: offers, competing bids, waivers, retirements ----------

export function freeAgentPool(save, allPlayers) {
  const set = new Set(save.freeAgents || []);
  return allPlayers.filter((player) => set.has(player.id));
}

export function signFreeAgent(save, teamId, playerId, allPlayers) {
  const player = allPlayers.find((item) => item.id === playerId);
  if (!player) return { success: false, reason: "Player not found." };
  if (!(save.freeAgents || []).includes(playerId)) return { success: false, reason: "Player is no longer a free agent." };

  const contract = { ...generateContract(player), seasonSigned: save.season };
  if (teamCapSpace(save, teamId) < contract.salary) {
    return { success: false, reason: `Not enough cap space to offer ${player.name} a contract.` };
  }

  if (teamId === save.userTeamId) {
    const rivals = save.teams.filter((team) => team.id !== teamId);
    for (const rival of rivals) {
      const rivalRoster = save.rosters[rival.id] || [];
      const need = teamNeedScore(rivalRoster, player.position);
      const rivalBids = need > 4 && Math.random() < 0.35;
      if (rivalBids && teamCapSpace(save, rival.id) >= contract.salary) {
        save.rosters[rival.id] = save.rosters[rival.id] || [];
        save.rosters[rival.id].push({ ...player, contract: { ...generateContract(player), seasonSigned: save.season }, morale: 70 });
        save.freeAgents = save.freeAgents.filter((id) => id !== playerId);
        return { success: false, reason: `${rival.name} won a competing bid for ${player.name}.`, lostTo: rival.name };
      }
    }
  }

  save.rosters[teamId] = save.rosters[teamId] || [];
  save.rosters[teamId].push({ ...player, contract, morale: 70 });
  save.freeAgents = (save.freeAgents || []).filter((id) => id !== playerId);
  return { success: true, player };
}

export function waivePlayer(save, teamId, playerId) {
  const roster = save.rosters[teamId] || [];
  const index = roster.findIndex((item) => item.id === playerId);
  if (index === -1) return { success: false };
  clearCaptaincyRole(save, teamId, playerId);
  const [player] = roster.splice(index, 1);
  save.freeAgents = save.freeAgents || [];
  save.freeAgents.push(player.id);
  return { success: true, player };
}

export function processRetirements(save) {
  const retired = [];
  Object.keys(save.rosters).forEach((teamId) => {
    save.rosters[teamId] = (save.rosters[teamId] || []).filter((player) => {
      const retireChance = player.rating < 58 ? 0.12 : 0.03;
      if (Math.random() < retireChance) {
        clearCaptaincyRole(save, teamId, player.id);
        retired.push({ teamId, player });
        return false;
      }
      return true;
    });
  });
  save.retirementLog = [
    ...(save.retirementLog || []),
    ...retired.map((entry) => ({ season: save.season, playerName: entry.player.name, teamId: entry.teamId })),
  ];
  return { save, retired };
}

// =====================================================================
// Part 4: Statistics and Awards
//
// Per-player season/career statistics (goals, assists, points, minutes
// played, clean sheets), plus end-of-season awards (MVP, Golden Boot,
// Best Goalkeeper, Rookie of the Year, Most Improved Player) and
// franchise records (most goals/assists/points, longest winning streak,
// most championships). Team-level statistics (wins, losses, goal
// difference) already live on save.teams / standingsForSave.
// =====================================================================

const POSITION_GOAL_WEIGHT = { Forward: 6, Midfielder: 2.5, Defender: 0.6, Goalkeeper: 0.05 };
const POSITION_ASSIST_WEIGHT = { Forward: 2.5, Midfielder: 4, Defender: 1.5, Goalkeeper: 0.2 };
const UNASSISTED_GOAL_CHANCE = 0.22;

function weightedRandomPick(candidates, weightFn) {
  const weighted = candidates.map((item) => ({ item, weight: Math.max(0.01, weightFn(item)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[weighted.length - 1]?.item || null;
}

function matchLineup(save, teamId) {
  const roster = save.rosters[teamId] || [];
  const lineup = save.lineups?.[teamId];
  if (lineup?.startingIds?.length) {
    const starters = lineup.startingIds.map((id) => roster.find((player) => player.id === id)).filter(Boolean);
    if (starters.length) return starters;
  }
  return [...roster].sort((a, b) => b.rating - a.rating).slice(0, STARTING_XI_SIZE);
}

export function ensurePlayerStatsShape(save) {
  save.playerSeasonStats = save.playerSeasonStats || {};
  save.careerStats = save.careerStats || {};
  save.teamStreaks = save.teamStreaks || {};
  save.awardsHistory = save.awardsHistory || [];
  return save;
}

function statLine(save, playerId, meta) {
  save.playerSeasonStats[playerId] = save.playerSeasonStats[playerId] || {
    playerId,
    name: meta.name,
    teamId: meta.teamId,
    position: meta.position,
    goals: 0,
    assists: 0,
    minutesPlayed: 0,
    cleanSheets: 0,
    gamesPlayed: 0,
  };
  return save.playerSeasonStats[playerId];
}

function recordTeamMatchStats(save, teamId, opponentGoals, goalsScored) {
  ensurePlayerStatsShape(save);
  const starters = matchLineup(save, teamId);
  if (!starters.length) return;

  starters.forEach((player) => {
    const line = statLine(save, player.id, player);
    line.teamId = teamId;
    line.minutesPlayed += 90;
    line.gamesPlayed += 1;
  });

  const goalkeeper = starters.find((player) => player.position === "Goalkeeper");
  if (goalkeeper && opponentGoals === 0) {
    statLine(save, goalkeeper.id, goalkeeper).cleanSheets += 1;
  }

  for (let i = 0; i < goalsScored; i += 1) {
    const scorer = weightedRandomPick(starters, (player) => POSITION_GOAL_WEIGHT[player.position] * (0.5 + player.rating / 100));
    if (!scorer) continue;
    statLine(save, scorer.id, scorer).goals += 1;

    if (Math.random() > UNASSISTED_GOAL_CHANCE) {
      const assistCandidates = starters.filter((player) => player.id !== scorer.id);
      const assister = weightedRandomPick(assistCandidates, (player) => POSITION_ASSIST_WEIGHT[player.position] * (0.5 + player.rating / 100));
      if (assister) statLine(save, assister.id, assister).assists += 1;
    }
  }
}

function recordStreak(save, teamId, outcome) {
  save.teamStreaks = save.teamStreaks || {};
  const streak = save.teamStreaks[teamId] || { current: 0, best: 0 };
  streak.current = outcome === "win" ? streak.current + 1 : 0;
  streak.best = Math.max(streak.best, streak.current);
  save.teamStreaks[teamId] = streak;
}

// ---------- Season/career stat lookups ----------

export function playerSeasonStatLine(save, playerId) {
  return save.playerSeasonStats?.[playerId] || null;
}

export function playerCareerStatLine(save, playerId) {
  return save.careerStats?.[playerId] || null;
}

export function seasonStatLeaders(save, key, limit = 10) {
  ensurePlayerStatsShape(save);
  return Object.values(save.playerSeasonStats)
    .filter((line) => line.gamesPlayed > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, limit);
}

// ---------- End-of-season archiving ----------

export function archiveSeasonStatsToCareer(save) {
  ensurePlayerStatsShape(save);
  Object.values(save.playerSeasonStats).forEach((line) => {
    const career = save.careerStats[line.playerId] || {
      playerId: line.playerId,
      name: line.name,
      goals: 0,
      assists: 0,
      minutesPlayed: 0,
      cleanSheets: 0,
      gamesPlayed: 0,
    };
    career.name = line.name;
    career.goals += line.goals;
    career.assists += line.assists;
    career.minutesPlayed += line.minutesPlayed;
    career.cleanSheets += line.cleanSheets;
    career.gamesPlayed += line.gamesPlayed;
    save.careerStats[line.playerId] = career;
  });
  return save;
}

// ---------- Awards ----------

export function computeSeasonAwards(save) {
  ensurePlayerStatsShape(save);
  const lines = Object.values(save.playerSeasonStats).filter((line) => line.gamesPlayed > 0);
  if (!lines.length) return { season: save.season, mvp: null, goldenBoot: null, bestGoalkeeper: null, rookieOfTheYear: null, mostImprovedPlayer: null };

  const rosterPlayer = (playerId) => {
    for (const teamId of Object.keys(save.rosters)) {
      const found = (save.rosters[teamId] || []).find((player) => player.id === playerId);
      if (found) return found;
    }
    return null;
  };

  const goldenBootLine = [...lines].sort((a, b) => b.goals - a.goals)[0];
  const goldenBoot = goldenBootLine?.goals > 0 ? goldenBootLine : null;

  const keeperLines = lines.filter((line) => line.position === "Goalkeeper");
  const bestGoalkeeper = keeperLines.length
    ? [...keeperLines].sort((a, b) => b.cleanSheets - a.cleanSheets || b.gamesPlayed - a.gamesPlayed)[0]
    : null;

  const mvpScore = (line) => line.goals * 3 + line.assists * 2 + (rosterPlayer(line.playerId)?.rating || 0) * 0.5;
  const mvp = [...lines].sort((a, b) => mvpScore(b) - mvpScore(a))[0] || null;

  const rookieLines = lines.filter((line) => {
    const career = save.careerStats[line.playerId];
    return !career || career.gamesPlayed === 0;
  });
  const rookieScore = (line) => line.goals * 2 + line.assists + (rosterPlayer(line.playerId)?.rating || 0);
  const rookieOfTheYear = rookieLines.length ? [...rookieLines].sort((a, b) => rookieScore(b) - rookieScore(a))[0] : null;

  const improvementCandidates = Object.keys(save.rosters)
    .flatMap((teamId) => (save.rosters[teamId] || []).map((player) => ({ player, teamId })))
    .filter(({ player }) => typeof player.seasonStartRating === "number")
    .map(({ player, teamId }) => ({
      playerId: player.id,
      name: player.name,
      teamId,
      startRating: player.seasonStartRating,
      endRating: player.rating,
      delta: player.rating - player.seasonStartRating,
    }))
    .sort((a, b) => b.delta - a.delta);
  const mostImprovedPlayer = improvementCandidates.length && improvementCandidates[0].delta > 0 ? improvementCandidates[0] : null;

  return {
    season: save.season,
    mvp: mvp ? { playerId: mvp.playerId, name: mvp.name, teamId: mvp.teamId, goals: mvp.goals, assists: mvp.assists } : null,
    goldenBoot: goldenBoot ? { playerId: goldenBoot.playerId, name: goldenBoot.name, teamId: goldenBoot.teamId, goals: goldenBoot.goals } : null,
    bestGoalkeeper: bestGoalkeeper
      ? { playerId: bestGoalkeeper.playerId, name: bestGoalkeeper.name, teamId: bestGoalkeeper.teamId, cleanSheets: bestGoalkeeper.cleanSheets }
      : null,
    rookieOfTheYear: rookieOfTheYear
      ? { playerId: rookieOfTheYear.playerId, name: rookieOfTheYear.name, teamId: rookieOfTheYear.teamId, goals: rookieOfTheYear.goals, assists: rookieOfTheYear.assists }
      : null,
    mostImprovedPlayer,
  };
}

// ---------- Franchise records ----------

export function computeFranchiseRecords(save) {
  ensurePlayerStatsShape(save);
  const careerLines = Object.values(save.careerStats);

  const topBy = (key) => (careerLines.length ? [...careerLines].sort((a, b) => b[key] - a[key])[0] : null);
  const mostGoalsLine = topBy("goals");
  const mostAssistsLine = topBy("assists");
  const mostPointsLine = careerLines.length
    ? [...careerLines].sort((a, b) => b.goals + b.assists - (a.goals + a.assists))[0]
    : null;

  const streakEntries = Object.entries(save.teamStreaks || {}).map(([teamId, streak]) => ({
    teamId,
    teamName: save.teams.find((team) => team.id === teamId)?.name || teamId,
    best: streak.best,
  }));
  const longestWinningStreak = streakEntries.length ? [...streakEntries].sort((a, b) => b.best - a.best)[0] : null;

  const championshipCounts = {};
  (save.history || []).forEach((entry) => {
    if (!entry.championTeamId) return;
    championshipCounts[entry.championTeamId] = (championshipCounts[entry.championTeamId] || 0) + 1;
  });
  const mostChampionshipsEntry = Object.entries(championshipCounts).sort((a, b) => b[1] - a[1])[0];
  const mostChampionships = mostChampionshipsEntry
    ? {
        teamId: mostChampionshipsEntry[0],
        teamName: save.teams.find((team) => team.id === mostChampionshipsEntry[0])?.name || mostChampionshipsEntry[0],
        count: mostChampionshipsEntry[1],
      }
    : null;

  return {
    mostGoals: mostGoalsLine && mostGoalsLine.goals > 0 ? { playerId: mostGoalsLine.playerId, name: mostGoalsLine.name, value: mostGoalsLine.goals } : null,
    mostAssists:
      mostAssistsLine && mostAssistsLine.assists > 0 ? { playerId: mostAssistsLine.playerId, name: mostAssistsLine.name, value: mostAssistsLine.assists } : null,
    mostPoints:
      mostPointsLine && mostPointsLine.goals + mostPointsLine.assists > 0
        ? { playerId: mostPointsLine.playerId, name: mostPointsLine.name, value: mostPointsLine.goals + mostPointsLine.assists }
        : null,
    longestWinningStreak: longestWinningStreak && longestWinningStreak.best > 0 ? longestWinningStreak : null,
    mostChampionships,
  };
}
