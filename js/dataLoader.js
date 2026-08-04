import { DATA_FILES, SITE } from "./config.js";
import { slugify } from "./utils.js";

let playerAliasCache;

async function fetchJSON(path, optional = true) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    if (!optional) throw error;
    console.warn(`Could not load ${path}`, error);
    return null;
  }
}

export async function loadJSON(path, fallback = null) {
  const data = await fetchJSON(path, true);
  return data ?? fallback;
}

async function loadPlayerAliases() {
  if (!playerAliasCache) {
    playerAliasCache = fetchJSON(`${SITE.dataPath}/player-aliases.json`, true).then((data) => data || {});
  }
  return playerAliasCache;
}

function canonicalPlayerId(id, aliases = {}) {
  return aliases[id] || id;
}

function normalizeRosterId(player, aliases = {}) {
  return canonicalPlayerId(player.id || slugify(player.name || "Unnamed Player"), aliases);
}

function canonicalizePlayerEvent(event, aliases = {}) {
  if (!event || typeof event !== "object") return event;
  const id = event.playerId || (event.player ? slugify(event.player) : "");
  return id ? { ...event, playerId: canonicalPlayerId(id, aliases) } : event;
}

function canonicalizeMatch(match, aliases = {}) {
  if (!match || typeof match !== "object") return match;
  const next = { ...match };
  ["scorers", "assists", "shots", "stars"].forEach((key) => {
    if (Array.isArray(next[key])) next[key] = next[key].map((event) => canonicalizePlayerEvent(event, aliases));
  });
  if (next.playerOfMatchId) next.playerOfMatchId = canonicalPlayerId(next.playerOfMatchId, aliases);
  return next;
}

function canonicalizeRoster(teams, aliases = {}) {
  return (teams || []).map((team) => ({
    ...team,
    roster: (team.roster || []).map((player) => ({
      ...player,
      id: normalizeRosterId(player, aliases),
    })),
  }));
}

function normalizeRosterPlayer(player, team, year, aliases = {}) {
  const name = player.name || "Unnamed Player";
  const id = normalizeRosterId(player, aliases);
  return {
    id,
    name,
    teamId: team.id,
    teamName: team.name,
    division: team.division,
    jersey: player.jersey || "",
    position: player.position || "Field",
    photo: player.photo || "",
    previousTeamId: player.previousTeamId || "",
    previousTeamName: player.previousTeamName || "",
    tradeEffectiveDate: player.tradeEffectiveDate || "",
    tradeNote: player.tradeNote || "",
    leadershipRole: player.leadershipRole || "",
    season: String(year),
    ovrOverride: Number.isFinite(player.ovrOverride) ? player.ovrOverride : undefined,
    achievements: [...(player.achievements || []), ...(player.tradeNote ? [player.tradeNote] : [])],
  };
}

function mergePlayers(teams, playerPayload, year, aliases = {}) {
  const map = new Map();
  teams.forEach((team) => {
    (team.roster || []).forEach((player) => {
      const normalized = normalizeRosterPlayer(player, team, year, aliases);
      map.set(normalized.id, normalized);
    });
  });

  (playerPayload?.players || []).forEach((player) => {
    const playerId = canonicalPlayerId(player.id || slugify(player.name || "Unnamed Player"), aliases);
    const existing = map.get(playerId) || {};
    map.set(playerId, {
      ...existing,
      ...player,
      id: playerId,
      season: String(year),
      teamId: player.teamId || existing.teamId || "",
      teamName: existing.teamName || player.teamName || "",
      division: player.division || existing.division || "Seniors",
      achievements: [...(existing.achievements || []), ...(player.achievements || [])],
    });
  });

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadSeasonData(year) {
  const entries = await Promise.all(
    DATA_FILES.map(async (key) => [key, await fetchJSON(`${SITE.dataPath}/${year}/${key}.json`, true)])
  );
  const files = Object.fromEntries(entries);
  const aliases = await loadPlayerAliases();
  const teams = canonicalizeRoster(files.teams?.teams || [], aliases);

  return {
    year: String(year),
    event: files.teams?.event || {},
    teams,
    players: mergePlayers(teams, files.players, year, aliases),
    coaches: files.coaches?.coaches || [],
    matches: (files.matches?.matches || []).map((match) => canonicalizeMatch(match, aliases)),
    standingsMeta: files.standings || {},
    playoffs: files.playoffs || { rounds: [] },
    awards: files.awards || { awards: [] },
    tournament: files.tournament || null,
    photos: files.photos?.photos || [],
    videos: files.videos?.videos || [],
  };
}

export async function loadAllSeasons(seasons = SITE.seasons) {
  const data = await Promise.all(seasons.map((season) => loadSeasonData(season)));
  return data.sort((a, b) => Number(a.year) - Number(b.year));
}

export function getTeam(data, teamId) {
  return (data.teams || []).find((team) => team.id === teamId);
}

export function getPlayer(data, playerId) {
  return (data.players || []).find((player) => player.id === playerId);
}

export function getCoach(data, coachId) {
  return (data.coaches || []).find((coach) => coach.id === coachId);
}
