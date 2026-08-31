import { loadSeasonData } from "./dataLoader.js?v=1.0";
import { computePlayerStats, isCompletedMatch, playerOVR, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { escapeHTML, initials, setDocumentTitle, slugify, statusMessage, teamProfileHref } from "./utils.js?v=1.0";

setupLayout("challenge.html");
setDocumentTitle("11v11 Challenge");

const root = document.getElementById("page-root");
const SEASON = "2026";

const POSITIONS = [
  { key: "S", label: "Strikers", note: "Finishing and goal production" },
  { key: "A", label: "Attackers", note: "Scoring threat and attacking output" },
  { key: "M", label: "Midfielders", note: "Production, creation, and match influence" },
  { key: "D", label: "Defenders", note: "OVR, team results, and recorded output" },
  { key: "G", label: "Goalkeepers", note: "OVR and team defensive results" },
];

const LINEUPS = [
  {
    key: "abdul",
    name: "Abdul's Team",
    positions: {
      S: [{ id: "rehan-ahmed-mohammed", name: "Rehan Mohammed" }],
      A: [
        { id: "muzamil-kharooti", name: "Muzamil Kharooti" },
        { id: "mohammed-ibrahim", name: "Mohammad Ibrahim" },
      ],
      M: [
        { id: "uthman", name: "Uthman Manjra" },
        { id: "mubashir-kharooti", name: "Mubashir Kharooti" },
      ],
      D: [
        { id: "ishaaq-ali", name: "Ishaaq Ali" },
        { id: "muhammad-teli", name: "Muhummud Teli" },
        { id: "sayem-mohammed-sadi", name: "Sayem Mohamed Saad" },
        { id: "yousaf-hosseinzada", name: "Yousaf Hosseinzada" },
      ],
      G: [{ id: "usman-ahmad-popal", name: "Usman Popal" }],
    },
  },
  {
    key: "mt",
    name: "MT Team",
    positions: {
      S: [
        { id: "mosa-fazli", name: "Mosa Fazli" },
        { id: "abdul-ghiyas-solyman", name: "Abdul Ghiyas Solyman" },
      ],
      A: [
        { id: "mudassir", name: "Mudassir" },
        { id: "marwan-ahmad", name: "Marwan Ahmed" },
      ],
      M: [
        { id: "taha-nakhuda", name: "Taaha Nakhuda" },
        { id: "m-yahya", name: "M Yahya" },
      ],
      D: [
        { id: "haroon-ahmadi", name: "Haroon Ahmadi" },
        { id: "uwais-bemat", name: "Uwais Bemat" },
        { id: "abubakr-manjra", name: "Abu Bakr Manjra" },
        { id: "adil-mubashir", name: "Adil Mubashir" },
      ],
      G: [{ id: "saad-khan", name: "Saad Khan" }],
    },
  },
];

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function displayStat(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "N/A";
}

function displayAverage(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

function allSeasonMatches(season) {
  const playoffMatches = Array.isArray(season.playoffs?.divisions)
    ? season.playoffs.divisions.flatMap((division) =>
        (division.rounds || []).flatMap((round) =>
          (round.matches || []).map((match) => ({ ...match, stage: "playoffs" }))
        )
      )
    : (season.playoffs?.rounds || []).flatMap((round) =>
        (round.matches || []).map((match) => ({ ...match, stage: "playoffs" }))
      );

  return [...(season.matches || []), ...playoffMatches];
}

function buildTeamRecords(season) {
  const records = new Map(
    (season.teams || []).map((team) => [
      team.id,
      { gp: 0, wins: 0, ties: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
    ])
  );

  allSeasonMatches(season)
    .filter((match) => match.division === "Seniors" || !match.division)
    .filter((match) => isCompletedMatch(match))
    .forEach((match) => {
      const sides = [
        [match.homeTeamId, match.homeScore, match.awayScore],
        [match.awayTeamId, match.awayScore, match.homeScore],
      ];

      sides.forEach(([teamId, goalsFor, goalsAgainst]) => {
        const record = records.get(teamId);
        if (!record) return;
        record.gp += 1;
        if (Number.isFinite(goalsFor)) record.goalsFor += goalsFor;
        if (Number.isFinite(goalsAgainst)) record.goalsAgainst += goalsAgainst;

        const winner = winnerTeamId(match);
        if (!winner) {
          record.ties += 1;
        } else if (winner === teamId) {
          record.wins += 1;
        } else {
          record.losses += 1;
        }
      });
    });

  records.forEach((record) => {
    record.goalDifference = record.goalsFor - record.goalsAgainst;
  });
  return records;
}

function unitRecord(players, teamRecords) {
  const uniqueTeamIds = [...new Set(players.map((player) => player.stats?.teamId).filter(Boolean))];
  return uniqueTeamIds.reduce(
    (total, teamId) => {
      const record = teamRecords.get(teamId);
      if (!record) return total;
      total.gp += record.gp;
      total.wins += record.wins;
      total.ties += record.ties;
      total.losses += record.losses;
      total.goalsFor += record.goalsFor;
      total.goalsAgainst += record.goalsAgainst;
      total.goalDifference += record.goalDifference;
      return total;
    },
    { gp: 0, wins: 0, ties: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 }
  );
}

function resolvePlayer(entry, statsById, allStats) {
  const stats = statsById.get(entry.id) || null;
  return {
    id: entry.id,
    name: stats?.name || entry.name,
    position: entry.position,
    stats,
    teamId: stats?.teamId || "",
    teamName: stats?.teamName || "2026 team not listed",
    ovr: stats ? playerOVR(stats, allStats) : null,
  };
}

function sumStats(players, key) {
  return players.reduce((total, player) => total + numberValue(player.stats?.[key]), 0);
}

function unitSummary(players, teamRecords) {
  const active = players.filter((player) => player.stats);
  const record = unitRecord(players, teamRecords);
  return {
    playerCount: players.length,
    goals: sumStats(players, "goals"),
    assists: sumStats(players, "assists"),
    points: sumStats(players, "points"),
    games: sumStats(players, "gamesPlayed"),
    avgGoals: active.length ? sumStats(active, "goals") / active.length : NaN,
    avgAssists: active.length ? sumStats(active, "assists") / active.length : NaN,
    avgPoints: active.length ? sumStats(active, "points") / active.length : NaN,
    avgGames: active.length ? sumStats(active, "gamesPlayed") / active.length : NaN,
    avgOVR: active.length ? active.reduce((total, player) => total + numberValue(player.ovr), 0) / active.length : NaN,
    record,
    winRate: record.gp ? (record.wins / record.gp) * 100 : NaN,
  };
}

function compareValues(left, right) {
  if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
  if (!Number.isFinite(left)) return -1;
  if (!Number.isFinite(right)) return 1;
  if (Math.abs(left - right) < 0.001) return 0;
  return left > right ? 1 : -1;
}

function positionWinner(positionKey, left, right) {
  const keys = ["D", "G"].includes(positionKey)
    ? ["avgOVR", "goalDifferencePerPlayer", "winRate", "avgGoals"]
    : ["avgGoals", "avgAssists", "avgOVR", "avgGames"];

  const leftValues = {
    ...left,
    goalDifferencePerPlayer: left.playerCount ? left.record.goalDifference / left.playerCount : NaN,
  };
  const rightValues = {
    ...right,
    goalDifferencePerPlayer: right.playerCount ? right.record.goalDifference / right.playerCount : NaN,
  };

  for (const key of keys) {
    const result = compareValues(leftValues[key], rightValues[key]);
    if (result) return result > 0 ? "left" : "right";
  }
  return "tie";
}

function playerSort(positionKey, a, b) {
  const keys = ["D", "G"].includes(positionKey)
    ? ["ovr", "gamesPlayed", "goals", "assists"]
    : ["goals", "assists", "ovr", "gamesPlayed"];

  for (const key of keys) {
    const left = key === "ovr" ? a.ovr : numberValue(a.stats?.[key]);
    const right = key === "ovr" ? b.ovr : numberValue(b.stats?.[key]);
    const result = compareValues(left, right);
    if (result) return result > 0 ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

function statPill(value, label) {
  return '<span><strong>' + escapeHTML(value) + '</strong><small>' + escapeHTML(label) + '</small></span>';
}

function playerCard(player, positionKey) {
  const avatar = player.stats?.photo
    ? '<img class="challenge-player-avatar" src="' + escapeHTML(player.stats.photo) + '" alt="' + escapeHTML(player.name) + '">'
    : '<span class="challenge-player-avatar initials-avatar" aria-hidden="true">' + escapeHTML(initials(player.name)) + '</span>';
  const teamMarkup = player.teamId
    ? '<a href="' + escapeHTML(teamProfileHref(player.teamId, SEASON)) + '">' + escapeHTML(player.teamName) + '</a>'
    : '<span>' + escapeHTML(player.teamName) + '</span>';
  const profileMarkup = '<div class="challenge-player-copy"><a class="challenge-player-name" href="./player.html?id=' + encodeURIComponent(player.id) + '"><strong>' + escapeHTML(player.name) + '</strong></a>' + teamMarkup + '</div>';
  const statsMarkup = player.stats
    ? '<div class="challenge-player-numbers"><strong>' + escapeHTML(displayStat(player.ovr)) + ' OVR</strong><small>' + escapeHTML(displayStat(player.stats.gamesPlayed)) + ' GP | ' + escapeHTML(displayStat(player.stats.goals)) + ' G | ' + escapeHTML(displayStat(player.stats.assists)) + ' A</small></div>'
    : '<div class="challenge-player-numbers"><strong>N/A</strong><small>2026 stats coming soon</small></div>';

  return '<article class="challenge-player-row">' + avatar + profileMarkup + statsMarkup + '</article>';
}

function renderUnitSide(lineup, position, players, teamRecords) {
  const summary = unitSummary(players, teamRecords);
  const record = summary.record;
  const leader = [...players].sort((a, b) => playerSort(position.key, a, b))[0];
  const leaderText = leader?.stats
    ? 'Leader: ' + leader.name + ' | ' + displayStat(leader.stats.goals) + ' goals, ' + displayStat(leader.stats.assists) + ' assists'
    : '2026 player numbers coming soon';

  return '<section class="challenge-side ' + lineup.key + '">' +
    '<div class="challenge-side-head"><div><span class="eyebrow">' + escapeHTML(lineup.name) + '</span><h3>' + escapeHTML(position.label) + '</h3></div><span class="challenge-side-count">' + escapeHTML(String(summary.playerCount)) + ' players</span></div>' +
    '<div class="challenge-unit-stats">' +
      statPill(displayStat(summary.goals), "Goals") +
      statPill(displayStat(summary.assists), "Assists") +
      statPill(displayAverage(summary.avgOVR, 0), "Avg OVR") +
      statPill(displayStat(record.wins) + "-" + displayStat(record.ties) + "-" + displayStat(record.losses), "Team W-D-L") +
    '</div>' +
    '<p class="challenge-leader-note">' + escapeHTML(leaderText) + '</p>' +
    '<div class="challenge-player-list">' + players.map((player) => playerCard(player, position.key)).join("") + '</div>' +
  '</section>';
}

function renderPosition(position, leftLineup, rightLineup, statsById, allStats, teamRecords) {
  const leftPlayers = (leftLineup.positions[position.key] || []).map((entry) => resolvePlayer({ ...entry, position: position.label }, statsById, allStats));
  const rightPlayers = (rightLineup.positions[position.key] || []).map((entry) => resolvePlayer({ ...entry, position: position.label }, statsById, allStats));
  const leftSummary = unitSummary(leftPlayers, teamRecords);
  const rightSummary = unitSummary(rightPlayers, teamRecords);
  const winner = positionWinner(position.key, leftSummary, rightSummary);
  const winnerLabel = winner === "left" ? leftLineup.name : winner === "right" ? rightLineup.name : "Even";
  const winnerClass = winner === "left" ? "left-edge" : winner === "right" ? "right-edge" : "even-edge";

  return '<article class="challenge-position-card">' +
    '<header class="challenge-position-head">' +
      '<div class="challenge-position-title"><span class="challenge-position-code">' + escapeHTML(position.key) + '</span><div><span class="eyebrow">Position battle</span><h2>' + escapeHTML(position.label) + '</h2><p>' + escapeHTML(position.note) + '</p></div></div>' +
      '<span class="challenge-edge ' + winnerClass + '">Edge: ' + escapeHTML(winnerLabel) + '</span>' +
    '</header>' +
    '<div class="challenge-sides">' +
      renderUnitSide(leftLineup, position, leftPlayers, teamRecords) +
      '<div class="challenge-versus" aria-hidden="true">VS</div>' +
      renderUnitSide(rightLineup, position, rightPlayers, teamRecords) +
    '</div>' +
  '</article>';
}

function renderSummary(leftLineup, rightLineup, results) {
  const leftWins = results.filter((result) => result === "left").length;
  const rightWins = results.filter((result) => result === "right").length;
  const ties = results.filter((result) => result === "tie").length;
  const leftCount = Object.values(leftLineup.positions).reduce((total, players) => total + players.length, 0);
  const rightCount = Object.values(rightLineup.positions).reduce((total, players) => total + players.length, 0);
  return '<section class="section-panel challenge-summary">' +
    '<div class="challenge-summary-head"><div><span class="eyebrow">2026 position challenge</span><h2>Who has the stronger XI?</h2><p>The matchup uses 2026 league performance only. Attacking positions are led by goals, then assists and OVR; defense and goalkeeper use OVR, team results, and recorded output.</p></div><span class="pill green">2026 only</span></div>' +
    '<div class="challenge-scoreboard">' +
      '<div class="challenge-score-team abdul"><strong>' + escapeHTML(leftLineup.name) + '</strong><b>' + escapeHTML(String(leftWins)) + '</b><small>position edges</small></div>' +
      '<div class="challenge-score-divider"><span>VS</span><small>' + escapeHTML(String(ties)) + ' even</small></div>' +
      '<div class="challenge-score-team mt"><strong>' + escapeHTML(rightLineup.name) + '</strong><b>' + escapeHTML(String(rightWins)) + '</b><small>position edges</small></div>' +
    '</div>' +
    '<div class="challenge-lineup-check"><span>' + escapeHTML(String(leftCount)) + '/11 players listed for ' + escapeHTML(leftLineup.name) + '</span><span>' + escapeHTML(String(rightCount)) + '/11 players listed for ' + escapeHTML(rightLineup.name) + '</span></div>' +
    (leftCount !== 11 || rightCount !== 11 ? '<p class="challenge-note">This is a position comparison of the names provided. Add or remove players from the lineup above whenever the challenge roster changes.</p>' : '') +
  '</section>';
}

async function init() {
  root.innerHTML = '<section class="section-panel">' + statusMessage("loading", "Loading the 2026 challenge...") + '</section>';

  try {
    const season = await loadSeasonData(SEASON);
    const allStats = computePlayerStats(season, { stage: "all" });
    const statsById = new Map(allStats.map((player) => [player.id, player]));
    const teamRecords = buildTeamRecords(season);
    const leftLineup = LINEUPS[0];
    const rightLineup = LINEUPS[1];
    const results = POSITIONS.map((position) => {
      const leftPlayers = (leftLineup.positions[position.key] || []).map((entry) => resolvePlayer({ ...entry, position: position.label }, statsById, allStats));
      const rightPlayers = (rightLineup.positions[position.key] || []).map((entry) => resolvePlayer({ ...entry, position: position.label }, statsById, allStats));
      return positionWinner(position.key, unitSummary(leftPlayers, teamRecords), unitSummary(rightPlayers, teamRecords));
    });

    root.innerHTML = '<section class="challenge-page">' +
      '<section class="section-panel challenge-hero"><div><span class="eyebrow">2026 HEAD-TO-HEAD</span><h1>11v11 Challenge</h1><p>Two custom lineups. One position-by-position test using this season only.</p></div><div class="challenge-hero-meta"><span>2026 season</span><span>2026 player stats</span><span>Position breakdown</span></div></section>' +
      renderSummary(leftLineup, rightLineup, results) +
      '<section class="challenge-position-list" aria-label="Position battles">' + POSITIONS.map((position) => renderPosition(position, leftLineup, rightLineup, statsById, allStats, teamRecords)).join("") + '</section>' +
      '<section class="section-panel challenge-method"><span class="eyebrow">How the comparison works</span><h2>2026 performance snapshot</h2><p>Each player card shows 2026 games played, goals, assists, and OVR. Strikers, attackers, and midfielders are compared by average goals first. Defenders and goalkeepers are compared by average OVR first, with team record and recorded output as tie-breakers.</p><p>Individual saves, tackles, and defensive actions are not recorded, so the page does not invent those numbers.</p></section>' +
    '</section>';
  } catch (error) {
    console.error(error);
    root.innerHTML = '<section class="section-panel">' + statusMessage("error", "The 2026 challenge could not load right now.") + '</section>';
  }
}

init();