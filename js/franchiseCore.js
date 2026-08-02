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
    version: 2,
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
