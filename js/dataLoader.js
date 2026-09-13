import { DATA_FILES, SITE } from "./config.js";
import { slugify } from "./utils.js";

let playerAliasCache;
const DATA_CACHE_VERSION = "20260913-1";
const DATA_CACHE_TTL_MS = 30_000;
const jsonCache = new Map();
const jsonRequests = new Map();
const seasonCache = new Map();
const seasonRequests = new Map();
const allSeasonsCache = new Map();
const allSeasonsRequests = new Map();

function sessionCacheKey(path) {
  return `lsl-data:${DATA_CACHE_VERSION}:${path}`;
}

function readSessionJSON(path) {
  try {
    if (typeof sessionStorage === "undefined") return { found: false, value: null };
    const raw = sessionStorage.getItem(sessionCacheKey(path));
    if (!raw) return { found: false, value: null };
    const cached = JSON.parse(raw);
    if (!cached || Date.now() - Number(cached.savedAt) > DATA_CACHE_TTL_MS) {
      sessionStorage.removeItem(sessionCacheKey(path));
      return { found: false, value: null };
    }
    return { found: true, value: cached.value };
  } catch {
    return { found: false, value: null };
  }
}

function writeSessionJSON(path, value) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(sessionCacheKey(path), JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Session storage can be unavailable or full; memory caching still works.
  }
}

async function fetchJSON(path, optional = true) {
  if (jsonCache.has(path)) return jsonCache.get(path);

  const sessionValue = readSessionJSON(path);
  if (sessionValue.found) {
    jsonCache.set(path, sessionValue.value);
    return sessionValue.value;
  }

  if (jsonRequests.has(path)) return jsonRequests.get(path);

  const request = (async () => {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const value = await response.json();
      jsonCache.set(path, value);
      writeSessionJSON(path, value);
      return value;
    } catch (error) {
      if (!optional) throw error;
      console.warn(`Could not load ${path}`, error);
      return null;
    }
  })();

  jsonRequests.set(path, request);
  try {
    return await request;
  } finally {
    jsonRequests.delete(path);
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
    birthYear: Number.isFinite(Number(player.birthYear)) ? Number(player.birthYear) : "",
    birthMonth: Number.isFinite(Number(player.birthMonth)) ? Number(player.birthMonth) : "",
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
  const seasonKey = String(year);
  if (seasonCache.has(seasonKey)) return seasonCache.get(seasonKey);
  if (seasonRequests.has(seasonKey)) return seasonRequests.get(seasonKey);

  const request = (async () => {
    const entries = await Promise.all(
      DATA_FILES.map(async (key) => [key, await fetchJSON(`${SITE.dataPath}/${seasonKey}/${key}.json`, true)])
    );
    const files = Object.fromEntries(entries);
    const aliases = await loadPlayerAliases();
    const teams = canonicalizeRoster(files.teams?.teams || [], aliases);
    const seasonData = {
      year: seasonKey,
      event: files.teams?.event || {},
      teams,
      players: mergePlayers(teams, files.players, seasonKey, aliases),
      coaches: files.coaches?.coaches || [],
      matches: (files.matches?.matches || []).map((match) => canonicalizeMatch(match, aliases)),
      standingsMeta: files.standings || {},
      playoffs: files.playoffs || { rounds: [] },
      awards: files.awards || { awards: [] },
      tournament: files.tournament || null,
      photos: files.photos?.photos || [],
      videos: files.videos?.videos || [],
    };
    seasonCache.set(seasonKey, seasonData);
    return seasonData;
  })();

  seasonRequests.set(seasonKey, request);
  try {
    return await request;
  } finally {
    seasonRequests.delete(seasonKey);
  }
}

export async function loadAllSeasons(seasons = SITE.seasons) {
  const seasonKey = seasons.map(String).sort().join(",");
  if (allSeasonsCache.has(seasonKey)) return allSeasonsCache.get(seasonKey);
  if (allSeasonsRequests.has(seasonKey)) return allSeasonsRequests.get(seasonKey);

  const request = Promise.all(seasons.map((season) => loadSeasonData(season)))
    .then((data) => {
      const sorted = data.sort((a, b) => Number(a.year) - Number(b.year));
      allSeasonsCache.set(seasonKey, sorted);
      return sorted;
    });

  allSeasonsRequests.set(seasonKey, request);
  try {
    return await request;
  } finally {
    allSeasonsRequests.delete(seasonKey);
  }
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
