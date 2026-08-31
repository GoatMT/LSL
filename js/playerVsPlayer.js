import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import {
  computeCombinedPlayerStats,
  computePlayerStats,
  isCompletedMatch,
  playerOVR,
  playerTeamForMatch,
  winnerTeamId,
} from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import {
  controlSelect,
  escapeHTML,
  formatDateWithISO,
  initials,
  setDocumentTitle,
  statusMessage,
  teamProfileHref,
} from "./utils.js?v=1.0";

setupLayout("player-vs-player.html");
setDocumentTitle("Player vs Player");

const root = document.getElementById("page-root");
const state = {
  playerA: "",
  playerB: "",
  searchA: "",
  searchB: "",
  season: "All",
  stage: "all",
};

let allData = [];
let directory = [];

const stageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];

const comparisonMetrics = [
  { key: "ovr", label: "OVR", format: (value) => numberText(value) },
  { key: "gamesPlayed", label: "Games Played", format: (value) => numberText(value) },
  { key: "wins", label: "Games Won", format: (value) => numberText(value) },
  { key: "ties", label: "Ties", format: (value) => numberText(value) },
  { key: "losses", label: "Losses", format: (value) => numberText(value) },
  { key: "goals", label: "Goals", format: (value) => numberText(value) },
  { key: "shots", label: "Shots", format: (value) => numberText(value) },
  { key: "winPct", label: "Win %", format: (value) => percentText(value) },
  { key: "goalsPerGame", label: "Goals Per Game", format: (value) => numberText(value, 2) },
  { key: "seasonsPlayed", label: "Seasons Played", format: (value) => numberText(value) },
  { key: "playerOfMatch", label: "Player of the Match", format: (value) => numberText(value) },
  { key: "honors", label: "Honors", format: (value) => numberText(value) },
];

function numberText(value, decimals = 0) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "N/A";
  return decimals ? Number(value).toFixed(decimals) : String(Math.round(Number(value)));
}

function percentText(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  return Number(value).toFixed(1) + "%";
}

function stageLabel(value = state.stage) {
  return stageOptions.find((option) => option.value === value)?.label || "All Games";
}

function playerHref(id) {
  return id ? "./player.html?id=" + encodeURIComponent(id) : "./players.html";
}

function selectedSeasonData() {
  return state.season === "All" ? allData : allData.filter((data) => data.year === state.season);
}

function teamForProfile(data, player) {
  return (data.teams || []).find((team) => team.id === player.teamId) || null;
}

function makeDirectory(seasons) {
  const map = new Map();

  seasons.forEach((data) => {
    (data.players || []).forEach((player) => {
      if (!player?.id) return;
      if (!map.has(player.id)) {
        map.set(player.id, {
          id: player.id,
          name: player.name || "Player TBA",
          photo: player.photo || "",
          positions: new Set(),
          divisions: new Set(),
          seasons: new Set(),
          teams: new Map(),
        });
      }

      const entry = map.get(player.id);
      entry.name = player.name || entry.name;
      entry.photo = player.photo || entry.photo;
      if (player.position) entry.positions.add(player.position);
      if (player.division) entry.divisions.add(player.division);
      entry.seasons.add(String(data.year));

      const team = teamForProfile(data, player);
      if (team) {
        entry.teams.set(String(data.year) + ":" + team.id, {
          id: team.id,
          name: team.name,
          year: String(data.year),
        });
      } else if (player.teamId && player.teamName) {
        entry.teams.set(String(data.year) + ":" + player.teamId, {
          id: player.teamId,
          name: player.teamName,
          year: String(data.year),
        });
      }

      if (player.previousTeamId && player.previousTeamName) {
        entry.teams.set(String(data.year) + ":" + player.previousTeamId, {
          id: player.previousTeamId,
          name: player.previousTeamName,
          year: String(data.year),
        });
      }
    });
  });

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      positions: [...entry.positions],
      divisions: [...entry.divisions],
      seasons: [...entry.seasons].sort((a, b) => Number(a) - Number(b)),
      teams: [...entry.teams.values()].sort((a, b) => Number(a.year) - Number(b.year) || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function directoryEntry(id) {
  return directory.find((player) => player.id === id) || null;
}

function searchDirectory(query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return directory.slice(0, 8);
  return directory
    .filter((player) => {
      const haystack = [
        player.name,
        player.id,
        ...player.teams.map((team) => team.name),
        ...player.divisions,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, 8);
}

function emptyStats(entry) {
  return {
    id: entry?.id || "",
    name: entry?.name || "Player TBA",
    teamEntries: [],
    seasonsPlayed: 0,
    gamesPlayed: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    goals: 0,
    shots: 0,
    playerOfMatch: 0,
    honors: 0,
    ovr: null,
    missing: true,
  };
}

function buildStatsMap(seasons) {
  const map = new Map();

  seasons.forEach((data) => {
    const computed = new Map(
      computePlayerStats(data, { stage: state.stage }).map((player) => [player.id, player])
    );

    (data.players || []).forEach((profile) => {
      const row = computed.get(profile.id);
      if (!row) return;

      if (!map.has(profile.id)) {
        map.set(profile.id, {
          id: profile.id,
          name: profile.name || "Player TBA",
          teamEntries: new Map(),
          seasonsPlayed: new Set(),
          gamesPlayed: 0,
          wins: 0,
          ties: 0,
          losses: 0,
          goals: 0,
          shots: 0,
          playerOfMatch: 0,
          honors: 0,
          missing: false,
        });
      }

      const total = map.get(profile.id);
      total.name = profile.name || total.name;
      total.seasonsPlayed.add(String(data.year));
      total.gamesPlayed += Number(row.gamesPlayed) || 0;
      total.wins += Number(row.wins) || 0;
      total.ties += Number(row.ties) || 0;
      total.losses += Number(row.losses) || 0;
      total.goals += Number(row.goals) || 0;
      total.shots += Number(row.shots) || 0;
      total.playerOfMatch += Number(row.playerOfMatch) || 0;
      total.honors += (data.awards?.awards || []).filter((award) => award.playerId === profile.id).length;

      const team = teamForProfile(data, profile);
      if (team) {
        total.teamEntries.set(String(data.year) + ":" + team.id, {
          id: team.id,
          name: team.name,
          year: String(data.year),
        });
      } else if (profile.teamId && profile.teamName) {
        total.teamEntries.set(String(data.year) + ":" + profile.teamId, {
          id: profile.teamId,
          name: profile.teamName,
          year: String(data.year),
        });
      }
    });
  });

  const ovrPool = computeCombinedPlayerStats(allData, { stage: "all" });
  const ovrById = new Map(ovrPool.map((player) => [player.id, player]));

  return new Map(
    [...map.entries()].map(([id, row]) => {
      const globalProfile = ovrById.get(id) || row;
      const gamesPlayed = row.gamesPlayed;
      return [
        id,
        {
          ...row,
          seasonsPlayed: row.seasonsPlayed.size,
          teamEntries: [...row.teamEntries.values()],
          winPct: gamesPlayed ? (row.wins / gamesPlayed) * 100 : null,
          goalsPerGame: gamesPlayed ? row.goals / gamesPlayed : null,
          ovr: playerOVR(globalProfile, ovrPool),
          missing: false,
        },
      ];
    })
  );
}

function renderPicker(slot, selectedId, query) {
  const entry = directoryEntry(selectedId);
  const label = slot === "a" ? "Player One" : "Player Two";
  const inputId = "pvp-player-" + slot;
  const selectedMarkup = entry
    ? '<div class="pvp-selected-player">' +
      '<div class="pvp-avatar" aria-hidden="true">' + escapeHTML(initials(entry.name)) + "</div>" +
      '<div class="pvp-selected-copy"><strong>' + escapeHTML(entry.name) + "</strong>" +
      "<small>" + escapeHTML(entry.teams.map((team) => team.name).join(" / ") || "Team not listed") + "</small></div>" +
      '<button class="pvp-clear-button" type="button" data-pvp-clear="' + slot + '" aria-label="Clear ' + escapeHTML(label) + '" title="Clear selection">×</button>' +
      "</div>"
    : '<div class="pvp-selected-player empty"><span>Choose a player to begin</span></div>';

  return (
    '<div class="pvp-picker">' +
    '<label for="' + inputId + '">' + escapeHTML(label) + "</label>" +
    '<input id="' + inputId + '" type="search" autocomplete="off" placeholder="Search players or teams..." value="' + escapeHTML(query || entry?.name || "") + '" data-pvp-input="' + slot + '">' +
    '<div class="pvp-picker-results" id="pvp-results-' + slot + '" role="listbox" hidden></div>' +
    selectedMarkup +
    "</div>"
  );
}

function renderTeamLinks(stats) {
  if (!stats?.teamEntries?.length) return '<span class="pvp-muted">Team not listed</span>';
  return stats.teamEntries
    .map(
      (team) =>
        '<a href="' +
        escapeHTML(teamProfileHref(team.id, team.year)) +
        '">' +
        escapeHTML(team.name) +
        " <small>(" +
        escapeHTML(team.year) +
        ")</small></a>"
    )
    .join(", ");
}

function renderPlayerCard(stats, entry, side) {
  if (!stats || stats.missing) {
    return '<article class="pvp-player-card unavailable"><span class="eyebrow">Player ' + side + "</span>" +
      '<h3><a href="' + escapeHTML(playerHref(entry?.id || "")) + '">' + escapeHTML(entry?.name || "Player TBA") + "</a></h3>" +
      '<p>Not listed for this season or game type.</p></article>';
  }

  return (
    '<article class="pvp-player-card">' +
    '<div class="pvp-player-card-head">' +
    '<div class="pvp-avatar large" aria-hidden="true">' + escapeHTML(initials(stats.name)) + "</div>" +
    "<div><span class=\"eyebrow\">Player " + side + "</span>" +
    '<h3><a href="' + escapeHTML(playerHref(stats.id)) + '">' + escapeHTML(stats.name) + "</a></h3>" +
    '<p>' + renderTeamLinks(stats) + "</p></div>" +
    "</div>" +
    '<div class="pvp-card-stat-grid">' +
    '<div><span>OVR</span><strong>' + numberText(stats.ovr) + "</strong></div>" +
    '<div><span>Games</span><strong>' + numberText(stats.gamesPlayed) + "</strong></div>" +
    '<div><span>Wins</span><strong>' + numberText(stats.wins) + "</strong></div>" +
    '<div><span>Goals</span><strong>' + numberText(stats.goals) + "</strong></div>" +
    "</div>" +
    "</article>"
  );
}

function metricValue(stats, metric) {
  if (!stats || stats.missing) return null;
  return stats[metric.key];
}

function metricRow(metric, left, right) {
  const leftValue = metricValue(left, metric);
  const rightValue = metricValue(right, metric);
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  const canCompare = Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber;
  const leftWinner = canCompare && leftNumber > rightNumber;
  const rightWinner = canCompare && rightNumber > leftNumber;

  return (
    '<div class="pvp-metric-row">' +
    '<strong class="' + (leftWinner ? "winner" : "") + '">' + escapeHTML(metric.format(leftValue)) + "</strong>" +
    '<span>' + escapeHTML(metric.label) + "</span>" +
    '<strong class="' + (rightWinner ? "winner" : "") + '">' + escapeHTML(metric.format(rightValue)) + "</strong>" +
    "</div>"
  );
}

function renderComparison(left, right, leftEntry, rightEntry) {
  if (!leftEntry || !rightEntry || leftEntry.id === rightEntry.id) {
    return statusMessage("empty", "Choose two different players to compare.");
  }

  return (
    '<div class="pvp-comparison-grid">' +
    renderPlayerCard(left, leftEntry, "A") +
    renderPlayerCard(right, rightEntry, "B") +
    "</div>" +
    '<div class="pvp-metric-table">' +
    comparisonMetrics.map((metric) => metricRow(metric, left, right)).join("") +
    "</div>"
  );
}

function playerTeamInMatch(data, playerId, match) {
  const player = (data.players || []).find((item) => item.id === playerId);
  if (!player) return "";
  if ((match.absences || []).includes(playerId)) return "";
  const teamId = playerTeamForMatch(player, match);
  return teamId === match.homeTeamId || teamId === match.awayTeamId ? teamId : "";
}

function matchDateValue(data, match, index) {
  const date = match.date ? Date.parse(String(match.date) + "T12:00:00") : 0;
  return (Number(data.year) || 0) * 1000000000000 + (Number.isFinite(date) ? date : 0) + (Number(match.week) || 0) * 1000 + index;
}

function sharedMatchesForSeason(data, playerA, playerB) {
  if (!playerA || !playerB || playerA === playerB) return [];

  const stages = state.stage === "all" ? ["regular", "playoffs"] : [state.stage];
  return (data.matches || [])
    .map((match, index) => ({ data, match, index }))
    .filter(({ match }) => stages.includes(match.stage))
    .filter(({ match }) => isCompletedMatch(match))
    .map(({ data, match, index }) => ({
      data,
      match,
      index,
      teamA: playerTeamInMatch(data, playerA, match),
      teamB: playerTeamInMatch(data, playerB, match),
    }))
    .filter((entry) => entry.teamA && entry.teamB)
    .sort((a, b) => matchDateValue(b.data, b.match, b.index) - matchDateValue(a.data, a.match, a.index));
}

function scopedSharedMatches(playerA, playerB) {
  return selectedSeasonData()
    .flatMap((data) => sharedMatchesForSeason(data, playerA, playerB))
    .sort((a, b) => matchDateValue(b.data, b.match, b.index) - matchDateValue(a.data, a.match, a.index));
}

function eventTotal(match, playerId, key) {
  return (match[key] || [])
    .filter((event) => event.playerId === playerId)
    .reduce((sum, event) => sum + (Number(event[key === "scorers" ? "goals" : key]) || 0), 0);
}

function teamName(data, teamId, fallback = "Team TBA") {
  return (data.teams || []).find((team) => team.id === teamId)?.name || fallback;
}

function matchScore(match) {
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    return String(match.homeScore) + " - " + String(match.awayScore);
  }
  return "Result posted";
}

function matchResult(data, match) {
  const winner = winnerTeamId(match);
  if (winner) return "Winner: " + teamName(data, winner);
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore) && match.homeScore === match.awayScore) return "Draw";
  return "Result posted";
}

function contributionText(match, playerId) {
  const goals = eventTotal(match, playerId, "scorers");
  const shots = eventTotal(match, playerId, "shots");
  const parts = [];
  if (goals) parts.push(numberText(goals) + (goals === 1 ? " goal" : " goals"));
  if (shots) parts.push(numberText(shots) + (shots === 1 ? " shot" : " shots"));
  return parts.length ? parts.join(" | ") : "No recorded goals or shots";
}

function renderSharedMatch(entry, playerA, playerB) {
  const { data, match, teamA, teamB } = entry;
  const homeName = teamName(data, match.homeTeamId, match.homeTeamName || "Home team");
  const awayName = teamName(data, match.awayTeamId, match.awayTeamName || "Away team");
  const relationship = teamA === teamB ? "Shared team" : "Opponents";
  const stage = match.stage === "playoffs" ? "Playoffs" : "Regular Season";
  const round = match.stage === "playoffs" ? match.label || "Playoff game" : "Week " + (match.week || "TBA");
  const leftName = directoryEntry(playerA)?.name || "Player A";
  const rightName = directoryEntry(playerB)?.name || "Player B";

  return (
    '<article class="pvp-match-card">' +
    '<div class="pvp-match-head"><div><span class="pill">' + escapeHTML(String(data.year)) + " | " + escapeHTML(stage) + "</span>" +
    '<strong>' + escapeHTML(round) + "</strong></div>" +
    '<time datetime="' + escapeHTML(match.date || "") + '">' + escapeHTML(formatDateWithISO(match.date)) + "</time>" +
    '<span class="pvp-relationship ' + (relationship === "Opponents" ? "opponents" : "shared") + '">' + escapeHTML(relationship) + "</span></div>" +
    '<div class="pvp-match-scoreline">' +
    '<div><strong>' + escapeHTML(homeName) + "</strong><small>" + escapeHTML(homeName === teamName(data, teamA) ? leftName + ": " + contributionText(match, playerA) : rightName + ": " + contributionText(match, playerB)) + "</small></div>" +
    '<b>' + escapeHTML(matchScore(match)) + "</b>" +
    '<div><strong>' + escapeHTML(awayName) + "</strong><small>" + escapeHTML(awayName === teamName(data, teamA) ? leftName + ": " + contributionText(match, playerA) : rightName + ": " + contributionText(match, playerB)) + "</small></div>" +
    "</div>" +
    '<p class="pvp-match-result">' + escapeHTML(matchResult(data, match)) + (match.notes?.length ? " | " + escapeHTML(match.notes[0]) : "") + "</p>" +
    "</article>"
  );
}

const verdictMetrics = [
  { key: "ovr", label: "OVR", direction: "higher", weight: 3 },
  { key: "goals", label: "goals", direction: "higher", weight: 2 },
  { key: "wins", label: "games won", direction: "higher", weight: 1 },
  { key: "winPct", label: "win rate", direction: "higher", weight: 2 },
  { key: "goalsPerGame", label: "goals per game", direction: "higher", weight: 2 },
  { key: "shots", label: "shots", direction: "higher", weight: 1 },
  { key: "playerOfMatch", label: "player-of-the-match marks", direction: "higher", weight: 1 },
  { key: "honors", label: "honors", direction: "higher", weight: 1 },
  { key: "losses", label: "fewer losses", direction: "lower", weight: 1 },
];

function comparisonVerdict(leftStats, rightStats, leftEntry, rightEntry) {
  if (!leftStats || !rightStats || leftStats.missing || rightStats.missing || !leftEntry || !rightEntry || leftEntry.id === rightEntry.id) {
    return {
      winner: "Not enough recorded totals",
      summary: "Choose two players who are listed in the selected season and game type.",
      leftScore: 0,
      rightScore: 0,
      leftReasons: [],
      rightReasons: [],
    };
  }

  let leftScore = 0;
  let rightScore = 0;
  const leftReasons = [];
  const rightReasons = [];

  verdictMetrics.forEach((metric) => {
    const leftValue = Number(leftStats[metric.key]);
    const rightValue = Number(rightStats[metric.key]);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue) || leftValue === rightValue) return;

    const leftBetter = metric.direction === "lower" ? leftValue < rightValue : leftValue > rightValue;
    if (leftBetter) {
      leftScore += metric.weight;
      leftReasons.push(metric.label);
    } else {
      rightScore += metric.weight;
      rightReasons.push(metric.label);
    }
  });

  if (leftScore === rightScore) {
    return {
      winner: "Too close to call",
      summary: "The selected categories are even, so neither player gets a clear edge.",
      leftScore,
      rightScore,
      leftReasons,
      rightReasons,
    };
  }

  const leftWins = leftScore > rightScore;
  const winner = leftWins ? leftEntry.name : rightEntry.name;
  const reasons = (leftWins ? leftReasons : rightReasons).slice(0, 4);
  return {
    winner,
    summary: reasons.length
      ? winner + " leads in " + reasons.join(", ") + "."
      : winner + " has the stronger overall category score.",
    leftScore,
    rightScore,
    leftReasons,
    rightReasons,
  };
}

function renderVerdict(leftStats, rightStats, leftEntry, rightEntry) {
  const verdict = comparisonVerdict(leftStats, rightStats, leftEntry, rightEntry);
  const leftReasons = verdict.leftReasons.length ? verdict.leftReasons.join(", ") : "No category edge";
  const rightReasons = verdict.rightReasons.length ? verdict.rightReasons.join(", ") : "No category edge";

  return (
    '<section class="pvp-verdict-card">' +
    '<div class="pvp-verdict-head"><div><span class="eyebrow">Final Read</span><h2>Who is better?</h2>' +
    '<p>Based on the selected season and game type, with direct output and record weighted most heavily.</p></div>' +
    '<span class="pvp-verdict-badge">' + escapeHTML(verdict.winner) + "</span></div>" +
    '<div class="pvp-verdict-result"><strong>' + escapeHTML(verdict.winner) + "</strong><span>" + escapeHTML(verdict.summary) + "</span></div>" +
    '<div class="pvp-verdict-edges"><div><span>' + escapeHTML(leftEntry?.name || "Player A") + " leads in</span><strong>" + escapeHTML(leftReasons) + "</strong></div>" +
    '<div><span>' + escapeHTML(rightEntry?.name || "Player B") + " leads in</span><strong>" + escapeHTML(rightReasons) + "</strong></div></div>" +
    "</section>"
  );
}

function renderSharedGames(leftEntry, rightEntry, leftStats, rightStats) {
  const groups = selectedSeasonData().map((data) => ({
    year: String(data.year),
    matches: sharedMatchesForSeason(data, leftEntry?.id, rightEntry?.id),
  }));
  const total = groups.reduce((sum, group) => sum + group.matches.length, 0);
  const groupMarkup = groups.length
    ? '<div class="pvp-season-games-list">' +
      groups
        .map(
          (group) =>
            '<section class="pvp-season-games"><div class="pvp-season-games-head"><h3>' +
            escapeHTML(group.year) +
            "</h3><span class=\"pill\">" +
            escapeHTML(String(group.matches.length)) +
            (group.matches.length === 1 ? " game" : " games") +
            "</span></div>" +
            (group.matches.length
              ? '<div class="pvp-match-list">' + group.matches.map((entry) => renderSharedMatch(entry, leftEntry.id, rightEntry.id)).join("") + "</div>"
              : statusMessage("empty", "No completed games found where both players appeared this season.")) +
            "</section>"
        )
        .join("") +
      "</div>"
    : statusMessage("empty", "No seasons are available for this selection.");

  return (
    '<div class="pvp-games-head"><div><span class="eyebrow">Shared Match History</span>' +
    '<h2>Games They Both Played</h2><p>' + escapeHTML(String(total)) + " completed " + (total === 1 ? "game" : "games") + " found in the selected scope.</p></div>" +
    '<span class="pill">' + escapeHTML(state.season === "All" ? "2024 | 2025 | 2026" : state.season) + " | " + escapeHTML(stageLabel()) + "</span></div>" +
    groupMarkup +
    renderVerdict(leftStats, rightStats, leftEntry, rightEntry)
  );
}

function pickerResultsMarkup(slot, query) {
  const matches = searchDirectory(query);
  return matches
    .map(
      (player) =>
        '<button type="button" class="pvp-picker-result" data-pvp-select="' +
        slot +
        '" data-player-id="' +
        escapeHTML(player.id) +
        '" role="option">' +
        '<span class="pvp-avatar small" aria-hidden="true">' +
        escapeHTML(initials(player.name)) +
        "</span><span><strong>" +
        escapeHTML(player.name) +
        "</strong><small>" +
        escapeHTML(player.teams.map((team) => team.name).join(" / ") || "Team not listed") +
        "</small></span></button>"
    )
    .join("");
}

function showPickerResults(slot, query) {
  const results = document.getElementById("pvp-results-" + slot);
  if (!results) return;
  results.innerHTML = pickerResultsMarkup(slot, query);
  results.hidden = !String(query || "").trim() || !results.children.length;
}

function bindPage(statsMap) {
  ["season", "stage"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      state[id] = event.target.value;
      render();
    });
  });

  ["a", "b"].forEach((slot) => {
    const input = document.querySelector('[data-pvp-input="' + slot + '"]');
    input?.addEventListener("input", (event) => {
      state["search" + slot.toUpperCase()] = event.target.value;
      showPickerResults(slot, event.target.value);
    });
    input?.addEventListener("focus", () => {
      showPickerResults(slot, input.value);
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = searchDirectory(input.value)[0];
      if (first) {
        event.preventDefault();
        state["player" + slot.toUpperCase()] = first.id;
        state["search" + slot.toUpperCase()] = first.name;
        render();
      }
    });
  });

  root.querySelectorAll("[data-pvp-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const slot = button.dataset.pvpSelect;
      const id = button.dataset.playerId;
      const entry = directoryEntry(id);
      state["player" + slot.toUpperCase()] = id;
      state["search" + slot.toUpperCase()] = entry?.name || "";
      render();
    });
  });

  root.querySelectorAll("[data-pvp-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      const slot = button.dataset.pvpClear;
      state["player" + slot.toUpperCase()] = "";
      state["search" + slot.toUpperCase()] = "";
      render();
    });
  });

  document.getElementById("pvp-reset")?.addEventListener("click", () => {
    const ranked = [...statsMap.values()].sort((a, b) => b.goals - a.goals || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name));
    state.playerA = ranked[0]?.id || directory[0]?.id || "";
    state.playerB = ranked.find((player) => player.id !== state.playerA)?.id || directory.find((player) => player.id !== state.playerA)?.id || "";
    state.searchA = directoryEntry(state.playerA)?.name || "";
    state.searchB = directoryEntry(state.playerB)?.name || "";
    state.season = "All";
    state.stage = "all";
    render();
  });
}

function render() {
  const seasons = selectedSeasonData();
  const statsMap = buildStatsMap(seasons);
  const leftEntry = directoryEntry(state.playerA);
  const rightEntry = directoryEntry(state.playerB);
  const leftStats = statsMap.get(state.playerA) || (leftEntry ? emptyStats(leftEntry) : null);
  const rightStats = statsMap.get(state.playerB) || (rightEntry ? emptyStats(rightEntry) : null);
  const scopeText = (state.season === "All" ? "All Seasons" : state.season) + " | " + stageLabel();

  root.innerHTML =
    '<div class="pvp-page">' +
    '<section class="section-panel pvp-hero-panel">' +
    '<div><span class="eyebrow">Player Comparison</span><h1>Player vs Player</h1>' +
    '<p>Compare two LSL players across OVR, games, record, goals, shots, honors, and every completed game they both played.</p></div>' +
    '<span class="pvp-hero-mark" aria-hidden="true">VS</span>' +
    "</section>" +
    '<section class="section-panel pvp-controls-panel">' +
    '<div class="section-head"><div><span class="eyebrow">Choose Your Matchup</span><h2>Search two players</h2>' +
    '<p>Pick any two players, then narrow the comparison by season or game type.</p></div>' +
    '<button class="button" type="button" id="pvp-reset">Reset</button></div>' +
    '<div class="pvp-picker-grid">' + renderPicker("a", state.playerA, state.searchA) + renderPicker("b", state.playerB, state.searchB) + "</div>" +
    '<div class="controls pvp-scope-controls">' +
    controlSelect("season", "Season", [{ value: "All", label: "All Seasons" }].concat(SITE.seasons.map((season) => ({ value: season, label: season }))), state.season) +
    controlSelect("stage", "Game Type", stageOptions, state.stage) +
    "</div>" +
    '<div class="pvp-scope-row"><span class="eyebrow">Current Scope</span><span class="pill">' + escapeHTML(scopeText) + "</span><span>Points and assists are left out so the comparison stays focused on direct output and record.</span></div>" +
    "</section>" +
    '<section class="section-panel pvp-main-panel">' +
    '<div class="section-head"><div><span class="eyebrow">Head-to-Head</span><h2>' + escapeHTML(leftEntry?.name || "Player A") + " vs " + escapeHTML(rightEntry?.name || "Player B") + "</h2>" +
    '<p>Higher numbers are highlighted in gold for each comparison category.</p></div>' +
    '<span class="pill green">' + escapeHTML(scopeText) + "</span></div>" +
    renderComparison(leftStats, rightStats, leftEntry, rightEntry) +
    "</section>" +
    '<section class="section-panel pvp-games-panel">' +
    renderSharedGames(leftEntry, rightEntry, leftStats, rightStats) +
    "</section>" +
    '<section class="section-panel pvp-note-panel"><span class="eyebrow">How It Works</span><h2>One clear comparison</h2>' +
    '<p>Games played and wins come from completed league and playoff appearances. Goals and shots use the recorded match totals, while head-to-head games appear only when both players were listed as playing.</p></section>' +
    "</div>";

  bindPage(statsMap);
}

root.innerHTML = '<section class="section-panel">' + statusMessage("loading", "Loading player comparison...") + "</section>";

loadAllSeasons()
  .then((seasons) => {
    allData = seasons;
    directory = makeDirectory(seasons);
    const params = new URLSearchParams(window.location.search);
    const ranked = [...buildStatsMap(seasons).values()].sort(
      (a, b) => b.goals - a.goals || b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name)
    );
    const defaultA = directory.some((player) => player.id === params.get("a")) ? params.get("a") : ranked[0]?.id || directory[0]?.id || "";
    const defaultB = directory.some((player) => player.id === params.get("b")) ? params.get("b") : ranked.find((player) => player.id !== defaultA)?.id || directory.find((player) => player.id !== defaultA)?.id || "";
    state.playerA = defaultA;
    state.playerB = defaultB;
    state.searchA = directoryEntry(defaultA)?.name || "";
    state.searchB = directoryEntry(defaultB)?.name || "";
    render();
  })
  .catch(() => {
    root.innerHTML = '<section class="section-panel">' + statusMessage("error", "Could not load player comparison right now.") + "</section>";
  });