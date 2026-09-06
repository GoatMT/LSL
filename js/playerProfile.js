import { renderPlayerCareerTable } from "../components/careerTable.js";
import { renderFormStrip } from "../components/formStrip.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { buildPlayerCareer, calculatePlayerForm, computeCombinedPlayerStats, computePlayerStats, computePlayerVsTeamStatsBySeason, getCurrentPlayer, getNextTeamMatch, playerOVR, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatDate, getQueryParam, initials, setDocumentTitle, slugify, statusMessage, unique } from "./utils.js";

setupLayout("players.html");

const root = document.getElementById("page-root");
const stageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];
let state = { stage: "all", vsStage: "all", vsYear: "", profileSection: "overview" };
let scoredMatchIndex = 0;

const vsStageOptions = [
  { value: "all", label: "All Games" },
  { value: "regular", label: "Regular Season" },
  { value: "playoffs", label: "Playoffs" },
];

function canonicalTournamentPlayerId(name, aliases = {}) {
  const slug = slugify(name);
  return aliases[slug] || slug;
}

function tournamentTeamName(team) {
  if (team.id === "lantern-of-knowledge-academy") return "Lantern Team";
  return team.name || "Tournament Team";
}

function tournamentMatches(tournament = {}) {
  return [
    ...(tournament.matches || []),
    ...(tournament.playoffs?.rounds || []).flatMap((round) => round.matches || []),
  ];
}

function tournamentTeamRecord(tournament, teamId) {
  return tournamentMatches(tournament).reduce(
    (record, match) => {
      if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) return record;
      if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return record;

      const isHome = match.homeTeamId === teamId;
      const gf = isHome ? match.homeScore : match.awayScore;
      const ga = isHome ? match.awayScore : match.homeScore;
      const winner = winnerTeamId(match);

      record.gamesPlayed += 1;
      record.goalsFor += gf;
      record.goalsAgainst += ga;
      if (!winner) {
        record.ties += 1;
        record.points += 1;
      } else if (winner === teamId) {
        record.wins += 1;
        record.points += 3;
      } else {
        record.losses += 1;
      }
      return record;
    },
    { gamesPlayed: 0, wins: 0, ties: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  );
}

function eventPlayerId(event, aliases = {}) {
  const name = typeof event === "string" ? event : event?.name || "";
  const id = typeof event === "object" ? event.playerId || "" : "";
  return aliases[id] || aliases[slugify(name)] || id || slugify(name);
}

function eventStatCount(event, key) {
  if (typeof event === "string") return 1;
  const value = Number(event?.[key]);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function tournamentPlayerPoints(tournament, playerId, aliases) {
  return tournamentMatches(tournament).reduce(
    (stats, match) => {
      (match.scorers || match.goalscorers || []).forEach((event) => {
        if (eventPlayerId(event, aliases) === playerId) stats.goals += eventStatCount(event, "goals");
      });
      (match.assists || []).forEach((event) => {
        if (eventPlayerId(event, aliases) === playerId) stats.assists += eventStatCount(event, "assists");
      });
      return stats;
    },
    { goals: 0, assists: 0 }
  );
}

function buildInterMadrasahRows(allData, playerId, aliases) {
  return allData
    .flatMap((data) => {
      const tournament = data.tournament;
      if (!tournament?.divisions?.length) return [];

      return tournament.divisions.flatMap((division) =>
        (division.teams || [])
          .filter((team) => (team.roster || []).some((name) => canonicalTournamentPlayerId(name, aliases) === playerId))
          .map((team) => {
            const record = tournamentTeamRecord(tournament, team.id);
            const playerStats = tournamentPlayerPoints(tournament, playerId, aliases);
            return {
              year: data.year,
              eventName: tournament.event?.name || "Inter-Madrasah Soccer Tournament",
              divisionName: division.name || "Inter-Madrasah",
              teamName: tournamentTeamName(team),
              officialTeamName: team.name || tournamentTeamName(team),
              playerGoals: playerStats.goals,
              playerAssists: playerStats.assists,
              playerPoints: playerStats.goals + playerStats.assists,
              ...record,
              goalDifference: record.goalsFor - record.goalsAgainst,
            };
          })
      );
    })
    .sort((a, b) => Number(b.year) - Number(a.year) || a.teamName.localeCompare(b.teamName));
}

function renderInterMadrasahSection(allData, playerId, aliases) {
  const rows = buildInterMadrasahRows(allData, playerId, aliases);
  if (!rows.length) return "";

  return `
    <section class="card inter-profile-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Inter-Madrasah</span>
          <h2>Tournament Stats</h2>
          <p>Tournament roster appearances are shown separately from LSL league totals.</p>
        </div>
      </div>
      <div class="inter-profile-list">
        ${rows
          .map(
            (row) => `
              <article class="inter-profile-row">
                <div class="inter-profile-copy">
                  <span class="pill">${escapeHTML(row.year)}</span>
                  <h3>Played for ${escapeHTML(row.teamName)} (Inter-Madrasah) in ${escapeHTML(row.year)}.</h3>
                  <p>${escapeHTML(row.eventName)} | ${escapeHTML(row.divisionName)}${row.officialTeamName !== row.teamName ? ` | ${escapeHTML(row.officialTeamName)}` : ""}</p>
                </div>
                <div class="inter-profile-stats" aria-label="Tournament team record">
                  <span><strong>${row.gamesPlayed}</strong><small>GP</small></span>
                  <span><strong>${row.wins}-${row.ties}-${row.losses}</strong><small>W-D-L</small></span>
                  <span><strong>${row.playerPoints}</strong><small>Player PTS</small></span>
                  <span><strong>${row.goalsFor}</strong><small>GF</small></span>
                  <span><strong>${row.goalsAgainst}</strong><small>GA</small></span>
                  <span><strong>${row.goalDifference >= 0 ? "+" : ""}${row.goalDifference}</strong><small>GD</small></span>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function careerTotals(rows = []) {
  return rows.reduce(
    (totals, row) => ({
      gamesPlayed: totals.gamesPlayed + (Number(row.gamesPlayed) || 0),
      goals: totals.goals + (Number(row.goals) || 0),
      assists: totals.assists + (Number(row.assists) || 0),
      shots: totals.shots + (Number(row.shots) || 0),
      wins: totals.wins + (Number(row.wins) || 0),
      ties: totals.ties + (Number(row.ties) || 0),
      losses: totals.losses + (Number(row.losses) || 0),
      points: totals.points + (Number(row.points) || 0),
    }),
    { gamesPlayed: 0, goals: 0, assists: 0, shots: 0, wins: 0, ties: 0, losses: 0, points: 0 }
  );
}

function inferPlayerStyle(profile = {}, careerRows = []) {
  const totals = careerTotals(careerRows);
  const games = Math.max(1, totals.gamesPlayed || 0);
  const goalRate = totals.goals / games;
  const assistRate = totals.assists / games;
  const shotRate = totals.shots / games;
  const winRate = totals.wins / games;
  const position = String(profile.position || "Field").toLowerCase();

  if (position.includes("goal")) {
    return {
      label: "Goalkeeper",
      traits: ["Shot stopper", "Back line voice", "Penalty box presence"],
      description: `${profile.name} plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line.` ,
    };
  }

  if (position.includes("defen")) {
    const extra = totals.goals || totals.assists ? " also adds surprise attacking value when chances open up" : " keeps the game simple and protects space first";
    return {
      label: "Defensive Anchor",
      traits: ["Physical defending", "Team shape", winRate >= 0.55 ? "Winning impact" : "Reliable coverage"],
      description: `${profile.name} profiles as a defense-first player who${extra}. The style is built around positioning, effort, and helping the team stay organized.` ,
    };
  }

  if (goalRate >= 1.5) {
    return {
      label: "Elite Finisher",
      traits: ["High goal rate", "Big scoring threat", shotRate >= 2 ? "Creates shots" : "Efficient chances"],
      description: `${profile.name} plays like a main scoring option. The profile is direct, aggressive in front of goal, and dangerous whenever the team creates space.` ,
    };
  }

  if (goalRate >= 0.8 && totals.goals >= totals.assists) {
    return {
      label: "Goal-First Attacker",
      traits: ["Finishing", "Forward runs", winRate >= 0.55 ? "Helps winning teams" : "Scoring spark"],
      description: `${profile.name} is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances.` ,
    };
  }

  if (assistRate > goalRate || totals.assists >= 3) {
    return {
      label: "Creator",
      traits: ["Passing", "Chance creation", "Unselfish play"],
      description: `${profile.name} plays more like a setup player, moving the ball into better areas and helping teammates get cleaner looks at goal.` ,
    };
  }

  if (shotRate >= 2) {
    return {
      label: "High-Activity Player",
      traits: ["Shot volume", "Energy", "Pressure"],
      description: `${profile.name} stays involved and looks to make things happen. The style is active, forward-thinking, and built around putting pressure on the opponent.` ,
    };
  }

  if (totals.gamesPlayed >= 8) {
    return {
      label: "Steady Contributor",
      traits: ["Experience", "Team role", "Consistency"],
      description: `${profile.name} brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure.` ,
    };
  }

  return {
    label: "Developing Profile",
    traits: ["More to show", "Role building", "Coming soon"],
    description: `${profile.name} is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact.` ,
  };
}

function isGoalkeeperProfile(profile = {}) {
  return /goal|keeper|goalie|gk/i.test(String(profile.position || ""));
}

function goalkeeperTotals(profile = {}, allData = []) {
  const seenMatches = new Set();
  const result = { games: 0, goalsAgainst: 0, cleanSheets: 0 };

  allData.forEach((data) => {
    const player = computePlayerStats(data, { stage: "all" }).find((row) => row.id === profile.id);
    const teamId = player?.teamId;
    if (!teamId) return;

    lslMatchesForSeason(data).forEach((match) => {
      if (seenMatches.has(match.id) || !match.id) return;
      if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) return;
      if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return;

      seenMatches.add(match.id);
      const opponentScore = match.homeTeamId === teamId ? match.awayScore : match.homeScore;
      result.games += 1;
      result.goalsAgainst += Number(opponentScore) || 0;
      if (Number(opponentScore) === 0) result.cleanSheets += 1;
    });
  });

  result.goalsAgainstPerGame = result.games ? result.goalsAgainst / result.games : null;
  result.cleanSheetRate = result.games ? result.cleanSheets / result.games : 0;
  return result;
}

function tierForRate(rate = {}) {
  const value = Number(rate.tierValue);
  if (!Number.isFinite(value)) return "F";

  if (rate.kind === "gaRate") {
    if (value <= 0.75) return "S";
    if (value <= 1.25) return "A";
    if (value <= 1.75) return "B";
    if (value <= 2.25) return "C";
    if (value <= 3) return "D";
    return "F";
  }

  if (rate.kind === "winRate") {
    if (value >= 0.75) return "S";
    if (value >= 0.6) return "A";
    if (value >= 0.45) return "B";
    if (value >= 0.33) return "C";
    if (value > 0) return "D";
    return "F";
  }

  if (rate.kind === "cleanRate") {
    if (value >= 0.65) return "S";
    if (value >= 0.5) return "A";
    if (value >= 0.35) return "B";
    if (value >= 0.2) return "C";
    if (value > 0) return "D";
    return "F";
  }

  if (value >= 1.5) return "S";
  if (value >= 1) return "A";
  if (value >= 0.65) return "B";
  if (value >= 0.4) return "C";
  if (value >= 0.2) return "D";
  return "F";
}

function renderStyleRate(rate) {
  const tier = tierForRate(rate);
  return `<span class="tier-rate tier-${tier.toLowerCase()}"><strong>${escapeHTML(rate.value)}</strong><small>${escapeHTML(rate.label)}</small><em>${tier}-Tier</em></span>`;
}

function renderPlayerStyleCard(profile, careerRows, allData) {
  const style = inferPlayerStyle(profile, careerRows);
  const totals = careerTotals(careerRows);
  const games = Math.max(1, totals.gamesPlayed || 0);
  const goalie = isGoalkeeperProfile(profile);
  const rates = goalie
    ? (() => {
        const goalieTotals = goalkeeperTotals(profile, allData);
        return [
          {
            label: "Goals Against/Game",
            value: goalieTotals.goalsAgainstPerGame === null ? "N/A" : goalieTotals.goalsAgainstPerGame.toFixed(2),
            tierValue: goalieTotals.goalsAgainstPerGame === null ? Number.POSITIVE_INFINITY : goalieTotals.goalsAgainstPerGame,
            kind: "gaRate",
          },
          {
            label: "Clean Sheets",
            value: goalieTotals.cleanSheets,
            tierValue: goalieTotals.cleanSheetRate,
            kind: "cleanRate",
          },
          {
            label: "Win Rate",
            value: ${Math.round((totals.wins / games) * 100)}%,
            tierValue: totals.wins / games,
            kind: "winRate",
          },
        ];
      })()
    : [
        { label: "Goals/Game", value: (totals.goals / games).toFixed(2), tierValue: totals.goals / games, kind: "rate" },
        { label: "Points/Game", value: (totals.points / games).toFixed(2), tierValue: totals.points / games, kind: "rate" },
        { label: "Win Rate", value: ${Math.round((totals.wins / games) * 100)}%, tierValue: totals.wins / games, kind: "winRate" },
      ];

  return `
    <article class="official-style-card">
      <div class="official-style-copy">
        <span class="eyebrow">Player Style</span>
        <h2>${escapeHTML(style.label)}</h2>
        <p>${escapeHTML(style.description)}</p>
        <div class="official-style-traits">
          ${style.traits.map((trait) => `<span>${escapeHTML(trait)}</span>`).join("")}
        </div>
      </div>
      <div class="official-style-rates" aria-label="${goalie ? "Goalkeeper" : "Player"} style rates">
        ${rates.map(renderStyleRate).join("")}
      </div>
    </article>
  `;
}
function playoffMatchesForSeason(data = {}) {
  if (Array.isArray(data.playoffs?.divisions)) {
    return data.playoffs.divisions.flatMap((division) =>
      (division.rounds || []).flatMap((round) =>
        (round.matches || []).map((match) => ({
          ...match,
          stage: match.stage || "playoffs",
          division: match.division || division.division,
          roundName: round.name,
        }))
      )
    );
  }

  return (data.playoffs?.rounds || []).flatMap((round) =>
    (round.matches || []).map((match) => ({
      ...match,
      stage: match.stage || "playoffs",
      division: match.division || data.playoffs?.division || data.division || "Seniors",
      roundName: round.name,
    }))
  );
}

function lslMatchesForSeason(data = {}) {
  return [
    ...(data.matches || []),
    ...playoffMatchesForSeason(data),
  ];
}

function scoredMatchTimeValue(season, match = {}) {
  const dateValue = match.date ? Date.parse(`${match.date}T00:00:00`) : 0;
  const time = String(match.time || "").match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  let minutes = 0;
  if (time) {
    let hour = Number(time[1]) || 0;
    const minute = Number(time[2]) || 0;
    const period = String(time[3] || "").toUpperCase();
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    minutes = hour * 60 + minute;
  }
  return (Number(season) || 0) * 1000000000000 + (Number.isFinite(dateValue) ? dateValue : 0) + minutes * 60000 + (Number(match.week) || 0);
}

function teamNameForMatch(data, teamId, fallback = "Team TBA") {
  return (data.teams || []).find((team) => team.id === teamId)?.name || fallback;
}

function scoredMatchScore(match = {}) {
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) return `${match.homeScore}-${match.awayScore}`;
  return "Score TBA";
}

function scoredMatchResult(match = {}, teamId = "") {
  const winner = winnerTeamId(match);
  if (!winner && Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) return "Draw";
  if (!winner) return "Result TBA";
  return winner === teamId ? "Win" : "Loss";
}

function buildScoredMatches(allData, playerId, aliases) {
  return allData
    .flatMap((data) =>
      lslMatchesForSeason(data).flatMap((match) => {
        const playerScorers = (match.scorers || match.goalscorers || []).filter((event) => eventPlayerId(event, aliases) === playerId);
        if (!playerScorers.length) return [];

        const goals = playerScorers.reduce((sum, event) => sum + eventStatCount(event, "goals"), 0);
        const assists = (match.assists || [])
          .filter((event) => eventPlayerId(event, aliases) === playerId)
          .reduce((sum, event) => sum + eventStatCount(event, "assists"), 0);
        const teamId = playerScorers.find((event) => event?.teamId)?.teamId || match.homeTeamId;
        const opponentId = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

        return [
          {
            season: data.year,
            matchId: match.id || "",
            week: match.week || "",
            stage: match.stage || "regular",
            division: match.division || "Seniors",
            label: match.label || match.roundName || "Match",
            roundName: match.roundName || "",
            date: match.date || "",
            time: match.time || "",
            teamId,
            teamName: teamNameForMatch(data, teamId, playerScorers[0]?.teamName || "Team TBA"),
            opponentId,
            opponentName: teamNameForMatch(data, opponentId, teamId === match.homeTeamId ? match.awayTeamName : match.homeTeamName),
            homeTeamName: teamNameForMatch(data, match.homeTeamId, match.homeTeamName),
            awayTeamName: teamNameForMatch(data, match.awayTeamId, match.awayTeamName),
            score: scoredMatchScore(match),
            result: scoredMatchResult(match, teamId),
            goals,
            assists,
            notes: match.notes || (match.note ? [match.note] : []),
            sortValue: scoredMatchTimeValue(data.year, match),
          },
        ];
      })
    )
    .sort((a, b) => b.sortValue - a.sortValue || String(b.label).localeCompare(String(a.label)));
}

function renderScoredMatchSection(allData, playerId, aliases) {
  const matches = buildScoredMatches(allData, playerId, aliases);
  if (!matches.length) {
    return `
      <section class="card player-scored-games-card">
        <div class="section-head compact-head">
          <div>
            <span class="eyebrow">Goal Log</span>
            <h2>Scoring Match Log</h2>
            <p>Scoring-match details will appear here once a goal is listed.</p>
          </div>
        </div>
        ${statusMessage("empty", "No scored matches listed yet.")}
      </section>
    `;
  }

  if (scoredMatchIndex >= matches.length) scoredMatchIndex = matches.length - 1;
  if (scoredMatchIndex < 0) scoredMatchIndex = 0;
  const match = matches[scoredMatchIndex];
  const stageLabel = match.stage === "playoffs" ? (match.roundName || "Playoffs") : `Week ${match.week || "TBA"}`;
  const countText = `${scoredMatchIndex + 1} of ${matches.length}`;

  return `
    <section class="card player-scored-games-card" data-scored-count="${matches.length}">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Goal Log</span>
          <h2>Scoring Match Log</h2>
          <p>Newest scoring game first. Use the buttons to browse every listed game where this player scored.</p>
        </div>
        <span class="pill green">${escapeHTML(countText)}</span>
      </div>
      <article class="scored-game-feature" aria-live="polite">
        <div class="scored-game-main">
          <span class="pill">${escapeHTML(match.season)} | ${escapeHTML(stageLabel)}</span>
          <h3>${escapeHTML(match.homeTeamName)} <span>${escapeHTML(match.score)}</span> ${escapeHTML(match.awayTeamName)}</h3>
          <p>${escapeHTML([formatDate(match.date), match.time, match.division, match.result].filter(Boolean).join(" | "))}</p>
        </div>
        <div class="scored-game-scorebox">
          <span>Goals In Match</span>
          <strong>${escapeHTML(match.goals)}</strong>
          <small>${match.goals === 1 ? "Goal" : "Goals"}${match.assists ? ` | ${match.assists} Assist${match.assists === 1 ? "" : "s"}` : ""}</small>
        </div>
      </article>
      <div class="scored-game-detail-grid">
        <span><strong>${escapeHTML(match.teamName)}</strong><small>Player's Team</small></span>
        <span><strong>${escapeHTML(match.opponentName)}</strong><small>Opponent</small></span>
        <span><strong>${escapeHTML(match.goals)}${match.goals === 1 ? " goal" : " goals"}</strong><small>Goals In Game</small></span>
        <span><strong>${escapeHTML(match.stage === "playoffs" ? "Playoffs" : "Regular Season")}</strong><small>Competition</small></span>
      </div>
      ${
        match.notes.length
          ? `<ul class="scored-game-notes">${match.notes.slice(0, 3).map((note) => `<li>${escapeHTML(note)}</li>`).join("")}</ul>`
          : ""
      }
      <div class="scored-game-actions">
        <button class="button secondary" type="button" data-scored-move="-1"${matches.length < 2 ? " disabled" : ""}>Previous Game</button>
        ${match.matchId ? `<a class="button" href="./game.html?id=${encodeURIComponent(match.matchId)}">Open Match</a>` : `<span class="pill">${escapeHTML(match.roundName || "Match details")}</span>`}
        <button class="button secondary" type="button" data-scored-move="1"${matches.length < 2 ? " disabled" : ""}>Next Game</button>
      </div>
    </section>
  `;
}

function renderProfileHeader(profile, current, ovr) {
  const avatar = profile.photo
    ? `<img class="official-profile-photo" src="${escapeHTML(profile.photo)}" alt="${escapeHTML(profile.name)}">`
    : `<div class="official-profile-photo placeholder" aria-hidden="true">${escapeHTML(initials(profile.name))}</div>`;
  return `
    <section class="official-profile-header">
      ${avatar}
      <div class="official-profile-identity">
        <span class="eyebrow">Player Profile</span>
        <h1>${escapeHTML(profile.name)}</h1>
        <p>${escapeHTML(current?.division || profile.division || "Division TBA")} | ${escapeHTML(current?.position || profile.position || "Position TBA")}${(current?.jersey || profile.jersey) ? ` | #${escapeHTML(current?.jersey || profile.jersey)}` : ""}</p>
      </div>
      <div class="official-profile-ovr-card" title="Overall rating based on career stats">
        <span>OVR</span>
        <strong>${escapeHTML(ovr)}</strong>
      </div>
      <div class="official-profile-actions">
        <a class="button secondary" href="./players.html">Back To Stats</a>
      </div>
    </section>
    <nav class="team-profile-nav player-jump-nav" aria-label="Player profile sections" role="tablist">
      ${[
        ["overview", "Overview"],
        ["career", "Career"],
        ["matchups", "Matchups"],
        ["more", "More"],
      ]
        .map(
          ([value, label]) =>
            '<button type="button" role="tab" class="' + (value === state.profileSection ? "is-active" : "") + '" data-profile-section="' + value + '" aria-selected="' + (value === state.profileSection ? "true" : "false") + '" aria-controls="player-' + value + '-panel">' + label + '</button>'
        )
        .join("")}
    </nav>
  `;
}

function renderMainStatsRow(total) {
  const stats = [
    { label: "Games", value: total.gamesPlayed || 0 },
    { label: "Goals", value: total.goals || 0 },
    { label: "Points", value: total.points || 0 },
    { label: "Shots", value: total.shots || 0 },
  ];

  return `
    <section class="official-main-stats" id="player-overview" aria-label="Main player stats">
      ${stats
        .map(
          (stat) => `
            <article class="official-stat-card">
              <span>${escapeHTML(stat.label)}</span>
              <strong>${escapeHTML(stat.value)}</strong>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function seasonsPlayed(careerRows = []) {
  return unique(careerRows.map((row) => row.year)).sort((a, b) => Number(b) - Number(a));
}

function renderPlayerInfoSection(profile, careerRows, allData) {
  const achievements = unique([...(profile.achievements || []), ...careerRows.flatMap((row) => row.achievements || [])]);
  const seasons = seasonsPlayed(careerRows);

  return `
    <section class="card official-info-card">
      ${renderPlayerStyleCard(profile, careerRows, allData)}
      <div class="official-achievements-box">
        <span class="eyebrow">Achievements</span>
        <p>${escapeHTML(achievements.join(", ") || "None listed yet")}</p>
      </div>
      <div class="official-seasons-strip">
        <span>Seasons Played</span>
        <div>
          ${
            seasons.length
              ? seasons.map((season) => `<strong>${escapeHTML(season)}</strong>`).join("")
              : `<strong>TBA</strong>`
          }
        </div>
      </div>
    </section>
  `;
}
function renderNextMatchCard(allData, current) {
  if (!current?.teamId) return "";
  const match = getNextTeamMatch(allData, current.teamId);
  if (!match) return "";
  const data = match.data || allData.find((season) => season.year === match.season) || {};
  const isHome = match.homeTeamId === current.teamId;
  const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
  const opponent = (data.teams || []).find((team) => team.id === opponentId);
  return `
    <section class="card profile-next-match-card next-match-card">
      <span class="eyebrow">Next Match</span>
      <h2>${escapeHTML(isHome ? "vs" : "@")} ${escapeHTML(opponent?.name || "Opponent TBA")}</h2>
      <p>${escapeHTML(current.teamName || "Current team")} | ${escapeHTML(formatDate(match.date))} | ${escapeHTML(match.time || "Time TBA")}</p>
    </section>
  `;
}

function renderCareerSection(career, stageLabel, form) {
  return `
    <section class="card official-career-card" id="player-career">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Career Table</span>
          <h2>${escapeHTML(stageLabel)}</h2>
          <p>Choose a stats type, scan recent form, then read season-by-season totals.</p>
        </div>
      </div>
      <div class="official-filter-body career-filter-body">
        <div class="official-filter-control">
          ${controlSelect("stage", "Stats Type", stageOptions, state.stage)}
        </div>
        <div class="official-last-five-card">
          ${renderFormStrip(form)}
        </div>
      </div>
      ${renderPlayerCareerTable(career)}
    </section>
  `;
}

function seasonProductivitySort(a, b) {
  return (
    (Number(b.points) || 0) - (Number(a.points) || 0) ||
    (Number(b.goals) || 0) - (Number(a.goals) || 0) ||
    (Number(b.assists) || 0) - (Number(a.assists) || 0) ||
    (Number(b.shots) || 0) - (Number(a.shots) || 0) ||
    (Number(b.gamesPlayed) || 0) - (Number(a.gamesPlayed) || 0) ||
    Number(b.year) - Number(a.year)
  );
}

function renderSeasonProductionCard(label, row, tone = "") {
  return `
    <article class="productive-season-panel ${escapeHTML(tone)}">
      <div>
        <span class="eyebrow">${escapeHTML(label)}</span>
        <h3>${escapeHTML(row.year)} | ${escapeHTML(row.team)}</h3>
      </div>
      <div class="productive-season-stats">
        <span><strong>${row.points || 0}</strong><small>PTS</small></span>
        <span><strong>${row.goals || 0}</strong><small>Goals</small></span>
        <span><strong>${row.assists || 0}</strong><small>Assists</small></span>
        <span><strong>${row.shots || 0}</strong><small>Shots</small></span>
        <span><strong>${row.gamesPlayed || 0}</strong><small>Games</small></span>
      </div>
    </article>
  `;
}

function renderSeasonProductionSection(careerRows, stageLabel) {
  const seasons = (careerRows || []).filter((row) => row?.year);
  if (unique(seasons.map((row) => row.year)).length < 2) return "";

  const sorted = [...seasons].sort(seasonProductivitySort);
  const most = sorted[0];
  const least = sorted.at(-1);

  return `
    <section class="card productive-season-card">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Season Comparison</span>
          <h2>Most and Least Productive</h2>
          <p>Based on ${escapeHTML(stageLabel)} points first, then goals, assists, shots, and games.</p>
        </div>
      </div>
      <div class="productive-season-grid">
        ${renderSeasonProductionCard("Most Productive", most, "best")}
        ${renderSeasonProductionCard("Least Productive", least, "low")}
      </div>
    </section>
  `;
}

function renderPlayerDetailSections(allData, playerId, profile) {
  const regular = computeCombinedPlayerStats(allData, { stage: "regular" }).find((player) => player.id === playerId) || {};
  const playoffs = computeCombinedPlayerStats(allData, { stage: "playoffs" }).find((player) => player.id === playerId) || {};
  const careerRows = buildPlayerCareer(allData, playerId, { stage: "all" });
  const bestSeason = [...careerRows].sort((a, b) => b.points - a.points || b.goals - a.goals || b.gamesPlayed - a.gamesPlayed)[0];
  const teamHistory = unique(careerRows.map((row) => `${row.year}: ${row.team}`));
  const achievements = unique([...(profile.achievements || []), ...careerRows.flatMap((row) => row.achievements || [])]);

  return `
    <section class="player-detail-panels" id="player-more">
      <article class="card player-detail-card">
        <div class="player-detail-card-head">
          <span class="eyebrow">Player Summary</span>
        </div>
        ${
          bestSeason
            ? `
              <h3>Best season: ${escapeHTML(bestSeason.year)} | ${escapeHTML(bestSeason.team)}</h3>
              <div class="mini-stat-row">
                <span>${bestSeason.points} pts</span>
                <span>${bestSeason.goals} goals</span>
                <span>${bestSeason.shots} shots</span>
                <span>${bestSeason.assists} assists</span>
                <span>${bestSeason.gamesPlayed} games</span>
              </div>
            `
            : `<p>No season totals found yet.</p>`
        }
      </article>
      <article class="card player-detail-card">
        <div class="player-detail-card-head">
          <span class="eyebrow">Team History</span>
        </div>
        <h3>${escapeHTML(teamHistory.join(" / ") || "Team history TBA")}</h3>
        <div class="mini-stat-row">
          <span>${regular.points || 0} regular pts</span>
          <span>${playoffs.points || 0} playoff pts</span>
          <span>${playoffs.gamesPlayed || 0} playoff games</span>
        </div>
      </article>
      <article class="card player-detail-card">
        <div class="player-detail-card-head">
          <span class="eyebrow">Awards / Notes</span>
        </div>
        <h3>${escapeHTML(achievements.length ? "Listed notes" : "No awards listed yet")}</h3>
        <p>${escapeHTML(achievements.join(", ") || "No awards or notes listed yet.")}</p>
      </article>
    </section>
  `;
}

function vsYearOptions(allData, playerId) {
  const allRows = computePlayerVsTeamStatsBySeason(allData, playerId, { stage: "all" });
  const years = unique(allRows.map((row) => row.year)).sort((a, b) => Number(b) - Number(a));
  return years.map((year) => ({ value: year, label: year }));
}

function meetingBadge(game) {
  const cls = game.result === "W" ? "win" : game.result === "D" ? "draw" : "loss";
  const detailBits = [formatDate(game.date), game.result];
  if (game.goals) detailBits.push(`${game.goals} goal${game.goals === 1 ? "" : "s"}`);
  if (game.assists) detailBits.push(`${game.assists} assist${game.assists === 1 ? "" : "s"}`);
  return `<span class="form-badge mini ${cls}" title="${escapeHTML(detailBits.join(" - "))}">${escapeHTML(game.result)}</span>`;
}

function renderVsOpponentSection(allData, playerId, viewState) {
  const allRows = computePlayerVsTeamStatsBySeason(allData, playerId, { stage: "all" });
  if (!allRows.length) return "";

  const careerByYear = new Map(buildPlayerCareer(allData, playerId, { stage: "all" }).map((row) => [row.year, row]));
  const wasTraded = [...careerByYear.values()].some((row) => String(row.team || "").includes(" / "));

  const yearOptions = vsYearOptions(allData, playerId);
  let seasonRows = computePlayerVsTeamStatsBySeason(allData, playerId, { stage: viewState.vsStage });
  const activeYear = viewState.vsYear || yearOptions[0]?.value || "";
  seasonRows = seasonRows.filter((row) => row.year === activeYear);

  return `
    <section class="card vs-opponent-card" id="player-matchups">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Matchups</span>
          <h2>Stats vs Opponent</h2>
          <p>Games played, record, goals, and assists against each opponent. Use the season and stats-type dropdowns to switch between individual years, regular season, playoffs, or all games. When this player faced the same team more than once in a season, each meeting shows as its own small W/D/L badge next to the games played total — hover a badge to see that game's date and stats.${
            wasTraded
              ? " This player was traded during at least one season shown below — the season played for lists every team they suited up for, and opponent totals only count games actually played for that roster, so a former team will not show up as an opponent for games played while still on that team."
              : ""
          }</p>
        </div>
      </div>
      <div class="official-filter-body vs-opponent-filter-body">
        <div class="official-filter-control">
          ${controlSelect("vs-year", "Season", yearOptions, activeYear)}
        </div>
        <div class="official-filter-control">
          ${controlSelect("vs-stage", "Stats Type", vsStageOptions, viewState.vsStage)}
        </div>
      </div>
      ${
        seasonRows.length
          ? seasonRows
              .map(
                (season) => `
                  <div class="vs-opponent-season-info">
                    <span class="eyebrow">${escapeHTML(season.year)}</span>
                    <p class="source-note">${escapeHTML(careerByYear.get(season.year)?.team || "Team TBA")} | ${season.opponents.length} opponent${season.opponents.length === 1 ? "" : "s"}</p>
                  </div>
                  <div class="table-wrap player-career-wrap">
                    <table class="data-table player-career-table vs-opponent-table">
                      <colgroup>
                        <col class="vs-opponent-col-team">
                        <col class="vs-opponent-col-stat">
                        <col class="vs-opponent-col-stat">
                        <col class="vs-opponent-col-stat">
                        <col class="vs-opponent-col-stat">
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Opponent</th>
                          <th class="num">GP</th>
                          <th class="num">W-D-L</th>
                          <th class="num">Goals</th>
                          <th class="num">Assists</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${season.opponents
                          .map(
                            (row) => `
                              <tr>
                                <td><a class="team-name" href="./team.html?id=${encodeURIComponent(row.teamId)}">${escapeHTML(row.teamName)}</a></td>
                                <td class="num">
                                  <span class="vs-gp-value">${row.gp}</span>
                                  ${row.gp > 1 ? `<span class="vs-meetings">${row.games.map((game) => meetingBadge(game)).join("")}</span>` : ""}
                                </td>
                                <td class="num">${row.wins}-${row.draws}-${row.losses}</td>
                                <td class="num">${row.goals}</td>
                                <td class="num">${row.assists}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `
              )
              .join("")
          : statusMessage("empty", "No matchups found for the selected season and stats type.")
      }
    </section>
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading player profile...");
  const requestedId = getQueryParam("id");
  const aliases = await loadJSON("./data/player-aliases.json", {});
  const id = aliases[requestedId] || requestedId;
  const allData = await loadAllSeasons();
  const current = getCurrentPlayer(allData, id);
  const profile = computeCombinedPlayerStats(allData).find((player) => player.id === id);

  if (!id || !profile) {
    setDocumentTitle("Player Profile");
    root.innerHTML = `<section class="section-panel">${statusMessage("empty", "Player profile not found. Check the player ID in the URL.")}</section>`;
    return;
  }

  function render() {
    const total = computeCombinedPlayerStats(allData, { stage: state.stage }).find((player) => player.id === id) || profile;
    const career = buildPlayerCareer(allData, id, { stage: state.stage });
    const careerAll = buildPlayerCareer(allData, id, { stage: "all" });
    const stageLabel = stageOptions.find((option) => option.value === state.stage)?.label || "All Games";
    const ovr = playerOVR(profile, computeCombinedPlayerStats(allData, { stage: "all" }));
    const form = calculatePlayerForm(allData, id, { stage: state.stage });

    setDocumentTitle(profile.name);
    root.innerHTML = `
      <section class="official-player-profile">
        ${renderProfileHeader(profile, current, ovr)}

        <section class="player-profile-panel" id="player-overview-panel" data-profile-panel="overview" role="tabpanel" aria-label="Overview"${state.profileSection !== "overview" ? " hidden" : ""}>
          ${renderMainStatsRow(total)}
          ${renderPlayerInfoSection(profile, careerAll, allData)}
          ${renderNextMatchCard(allData, current)}
          ${renderScoredMatchSection(allData, id, aliases)}
        </section>

        <section class="player-profile-panel" id="player-career-panel" data-profile-panel="career" role="tabpanel" aria-label="Career"${state.profileSection !== "career" ? " hidden" : ""}>
          ${renderCareerSection(career, stageLabel, form)}
          ${renderSeasonProductionSection(career, stageLabel)}
        </section>

        <section class="player-profile-panel" id="player-matchups-panel" data-profile-panel="matchups" role="tabpanel" aria-label="Matchups"${state.profileSection !== "matchups" ? " hidden" : ""}>
          ${renderVsOpponentSection(allData, id, state)}
        </section>

        <section class="player-profile-panel" id="player-more-panel" data-profile-panel="more" role="tabpanel" aria-label="More"${state.profileSection !== "more" ? " hidden" : ""}>
          ${renderInterMadrasahSection(allData, id, aliases)}
          ${renderPlayerDetailSections(allData, id, profile)}
        </section>
      </section>
    `;

    document.querySelectorAll("[data-profile-section]").forEach((button) => {
      button.addEventListener("click", () => {
        state.profileSection = button.dataset.profileSection || "overview";
        render();
        document.querySelectorAll("[data-profile-section]").forEach((candidate) => {
          if (candidate.dataset.profileSection === state.profileSection) candidate.focus({ preventScroll: true });
        });
      });
    });

    document.getElementById("stage").addEventListener("change", (event) => {
      state.stage = event.target.value;
      render();
    });

    document.getElementById("vs-year")?.addEventListener("change", (event) => {
      state.vsYear = event.target.value;
      render();
    });

    document.getElementById("vs-stage")?.addEventListener("change", (event) => {
      state.vsStage = event.target.value;
      render();
    });

    document.querySelectorAll("[data-scored-move]").forEach((button) => {
      button.addEventListener("click", () => {
        const count = Number(document.querySelector("[data-scored-count]")?.dataset.scoredCount) || 0;
        if (count < 2) return;
        scoredMatchIndex = (scoredMatchIndex + Number(button.dataset.scoredMove || 0) + count) % count;
        render();
      });
    });
  }

  render();
}

init();
