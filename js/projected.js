import { loadAllSeasons, loadJSON, loadSeasonData } from "./dataLoader.js?v=20261108-data3";
import { setupLayout } from "./main.js?v=20261109-greenprimary1";
import { SITE } from "./config.js";
import { buildPlayerProjections } from "./playerProjectionModel.js?v=20261109-playerproj1";
import { escapeHTML, initials, leadershipRoleLabel, leadershipRoleShort, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

function list(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}

setupLayout("projected.html");
setDocumentTitle("Player Projections");

const root = document.getElementById("page-root");

function getTeamMaps(seasonData) {
  return {
    teams: new Map((seasonData.teams || []).map((team) => [team.id, team])),
    coaches: new Map((seasonData.coaches || []).map((coach) => [coach.teamId, coach])),
    season: String(seasonData.year || SITE.defaultSeason),
  };
}

function teamName(teamId, maps) {
  return maps.teams.get(teamId)?.name || "Team TBA";
}

function coachName(teamId, maps) {
  return maps.coaches.get(teamId)?.name || maps.teams.get(teamId)?.coachName || "Coach TBA";
}

function goalDiff(row) {
  const diff = Number.isFinite(row.goalDifference) ? row.goalDifference : (Number(row.goalsFor) || 0) - (Number(row.goalsAgainst) || 0);
  return diff > 0 ? `+${diff}` : String(diff);
}

function teamMark(team) {
  const logoStyle = team?.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team?.logo) {
    return `<img class="team-logo" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${logoStyle}>`;
  }
  return `<span class="team-mark"${logoStyle}>${escapeHTML(initials(team?.name || "LSL", 3))}</span>`;
}

function teamLink(teamId, maps) {
  const team = maps.teams.get(teamId);
  if (!team) return escapeHTML(teamName(teamId, maps));
  return `<a href="${escapeHTML(teamProfileHref(team.id, maps.season))}">${escapeHTML(team.name)}</a>`;
}

function renderHero(projected) {
  return `
    <section class="section-panel projected-hero-panel">
      <div class="projected-hero">
        <div>
          <span class="eyebrow">${escapeHTML(projected.status || "Projected")} | ${escapeHTML(projected.officialStatus || "Not Official")}</span>
          <h1>${escapeHTML(projected.title || `${SITE.defaultSeason} Projected Season`)}</h1>
          <p>${escapeHTML(projected.summary || "Projection details coming soon.")}</p>
          <div class="projected-warning">
            <strong>Prediction only</strong>
            <span>This page does not show official standings, official match results, or confirmed playoff outcomes.</span>
          </div>
        </div>
        <aside class="projected-method-card">
          <span class="pill green">Projection Basis</span>
          <ul class="clean-list">
            ${(projected.methodology || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
          </ul>
          <p class="source-note">Last updated: ${escapeHTML(projected.lastUpdated || "Time TBA")}</p>
        </aside>
      </div>
    </section>
  `;
}

function renderOpeningNotes(projected) {
  const notes = projected.openingNotes || [];
  if (!notes.length) return "";
  return `
    <section class="section-panel projected-notice-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Matchday</span>
          <h2>Player Reminders</h2>
          <p>Important reminders for ${escapeHTML(projected.season || SITE.defaultSeason)} LSL matchdays.</p>
        </div>
        <span class="pill green">Please Read</span>
      </div>
      <div class="projected-note-grid">
        ${notes
          .map(
            (note) => `
              <article class="projected-note-card">
                <span>${escapeHTML(note.title || "Reminder")}</span>
                <p>${escapeHTML(note.message || "")}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProjectedStandings(projected, maps) {
  const rows = projected.standings || [];
  return `
    <section class="section-panel projected-main-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected | Not Official</span>
          <h2>Projected Standings</h2>
          <p>Ranked best to worst for the ${escapeHTML(projected.season || SITE.defaultSeason)} senior season prediction.</p>
        </div>
        <span class="pill">Prediction</span>
      </div>
      <div class="table-wrap projected-table-wrap">
        <table class="data-table projected-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th class="num">W</th>
              <th class="num">T</th>
              <th class="num">L</th>
              <th class="num">GF</th>
              <th class="num">GA</th>
              <th class="num">GD</th>
              <th class="num">PTS</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const team = maps.teams.get(row.teamId);
                return `
                  <tr>
                    <td data-label="Rank"><span class="rank-badge">${escapeHTML(row.rank)}</span></td>
                    <td data-label="Team">
                      <div class="projected-team-cell">
                        ${teamMark(team)}
                        <div>
                          <strong>${teamLink(row.teamId, maps)}</strong>
                          <span>Projected | Not Official</span>
                        </div>
                      </div>
                    </td>
                    <td class="num" data-label="Wins">${escapeHTML(row.wins)}</td>
                    <td class="num" data-label="Ties">${escapeHTML(row.ties)}</td>
                    <td class="num" data-label="Losses">${escapeHTML(row.losses)}</td>
                    <td class="num" data-label="Goals For">${escapeHTML(row.goalsFor)}</td>
                    <td class="num" data-label="Goals Against">${escapeHTML(row.goalsAgainst)}</td>
                    <td class="num" data-label="Goal Difference">${escapeHTML(goalDiff(row))}</td>
                    <td class="num" data-label="Points"><strong>${escapeHTML(row.points)}</strong></td>
                    <td data-label="Reason">${escapeHTML(row.reason)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderRosterDetails(team) {
  const roster = team?.roster || [];
  if (!roster.length) return "";
  return `
    <details class="projection-roster-details">
      <summary>Roster (${roster.length})</summary>
      <ul>
        ${roster
          .map(
            (player) => `
              <li>
                <a href="./player.html?id=${escapeHTML(player.id)}">
                  ${leadershipRoleShort(player.leadershipRole) ? `<span class="roster-leader-chip ${escapeHTML(player.leadershipRole)}" title="${escapeHTML(leadershipRoleLabel(player.leadershipRole))}">${escapeHTML(leadershipRoleShort(player.leadershipRole))}</span>` : ""}
                  ${escapeHTML(player.name)}
                </a>
                <span>${escapeHTML(player.position || "Field")}</span>
              </li>
            `
          )
          .join("")}
      </ul>
    </details>
  `;
}

function renderTeamCards(projected, maps) {
  const cards = [...(projected.teams || [])].sort((a, b) => (parseInt(a.projectedFinish, 10) || 99) - (parseInt(b.projectedFinish, 10) || 99));
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected | Not Official</span>
          <h2>Team Projections</h2>
          <p>Each card gives the predicted finish and quick team outlook.</p>
        </div>
      </div>
      <div class="projection-card-grid">
        ${cards
          .map((card) => {
            const team = maps.teams.get(card.teamId);
            return `
              <article class="card projection-card">
                <div class="projection-card-head">
                  ${teamMark(team)}
                  <div>
                    <span class="pill">${escapeHTML(card.projectedFinish || "Projected")}</span>
                    <h3>${teamLink(card.teamId, maps)}</h3>
                    <p>Coach: ${escapeHTML(coachName(card.teamId, maps))}</p>
                  </div>
                </div>
                <div class="projection-key-row">
                  ${(card.keyPlayers || []).map((player) => `<span>${escapeHTML(player)}</span>`).join("")}
                </div>
                ${renderRosterDetails(team)}
                <dl class="projection-detail-list">
                  <div>
                    <dt>Strength</dt>
                    <dd>${escapeHTML(card.strength || "Not listed")}</dd>
                  </div>
                  <div>
                    <dt>Weakness</dt>
                    <dd>${escapeHTML(card.weakness || "Not listed")}</dd>
                  </div>
                </dl>
                <p>${escapeHTML(card.explanation || "Projection note coming soon.")}</p>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function projectedScore(match) {
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    return `${match.homeScore} - ${match.awayScore}`;
  }
  return "vs";
}

function scorerText(scorer) {
  if (!scorer?.name) return "";
  const goals = Number(scorer.goals) || 1;
  return `${scorer.name}${goals > 1 ? ` x${goals}` : ""}`;
}

function renderScorerRows(match) {
  const homeScorers = match.scorers?.home || [];
  const awayScorers = match.scorers?.away || [];
  const rowCount = Math.max(homeScorers.length, awayScorers.length);
  if (!rowCount) return "";

  return Array.from({ length: rowCount })
    .map((_, index) => {
      const home = scorerText(homeScorers[index]);
      const away = scorerText(awayScorers[index]);
      return `
        <div class="projected-scorer-row">
          <span>${escapeHTML(home)}</span>
          <strong>Goals</strong>
          <span>${escapeHTML(away)}</span>
        </div>
      `;
    })
    .join("");
}

function renderProjectedMatch(match, maps) {
  const scorerRows = renderScorerRows(match);
  const scoreLabel = match.scoreLabel || "Projected Final";
  const scorerLabel = match.scorerLabel || "Projected scorers";
  return `
    <article class="projected-match-card">
      <div class="projected-match-row">
        <span class="projected-match-team">${teamLink(match.homeTeamId, maps)}</span>
        <div class="projected-score-box">
          <small>${escapeHTML(scoreLabel)}</small>
          <strong>${escapeHTML(projectedScore(match))}</strong>
        </div>
        <span class="projected-match-team right">${teamLink(match.awayTeamId, maps)}</span>
      </div>
      ${match.time ? `<p class="projected-match-time">${escapeHTML(match.time)}</p>` : ""}
      ${
        scorerRows
          ? `<details class="projected-scorer-details">
              <summary>${escapeHTML(scorerLabel)}</summary>
              <div class="projected-scorer-board">
                <div class="projected-scorer-head">
                  <span>${teamLink(match.homeTeamId, maps)}</span>
                  <strong>Stat</strong>
                  <span>${teamLink(match.awayTeamId, maps)}</span>
                </div>
                ${scorerRows}
              </div>
            </details>`
          : ""
      }
    </article>
  `;
}

function renderSchedule(projected, maps) {
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected | Not Official</span>
          <h2>Projected Week-By-Week Matches</h2>
          <p>Weeks already played show posted finals. Future weeks stay clearly marked as predictions.</p>
        </div>
      </div>
      <div class="projected-week-list">
      ${list(projected.schedule)
          .map(
            (week) => `
              <article class="projected-week-card">
                <div class="projected-week-head">
                  <span class="pill green">Week ${escapeHTML(week.week)}</span>
                  <strong>Projected matchups</strong>
                </div>
                <div class="projected-match-list">
                  ${list(week.matches)
                    .map((match) => renderProjectedMatch(match, maps))
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function playoffTeamLine(match, side, maps) {
  const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
  const seed = side === "home" ? match.homeSeed : match.awaySeed;
  const score = side === "home" ? match.homeScore : match.awayScore;
  const isWinner = match.winnerTeamId === teamId;
  return `
    <div class="projected-bracket-team${isWinner ? " winner" : ""}">
      <span>${seed ? `#${escapeHTML(seed)}` : "Seed"}</span>
      <strong>${teamLink(teamId, maps)}</strong>
      <b>${Number.isFinite(score) ? escapeHTML(score) : ""}</b>
    </div>
  `;
}

function renderProjectedPlayoffs(projected, maps) {
  const playoffs = projected.playoffs || {};
  const championName = teamName(playoffs.championTeamId, maps);
  return `
    <section class="section-panel projected-playoff-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Projected Playoffs | Not Official</span>
          <h2>Projected Senior Playoff Bracket</h2>
          <p>${escapeHTML(playoffs.formatNote || "Projected playoff format coming soon.")}</p>
        </div>
        <span class="pill green">Prediction</span>
      </div>
      <div class="projected-bracket">
        ${list(playoffs.rounds)
          .map(
            (round) => `
              <section class="projected-bracket-round">
                <h3>${escapeHTML(round.name)}</h3>
                ${list(round.matches)
                  .map(
                    (match) => `
                      <article class="projected-bracket-match">
                        <span class="pill">${escapeHTML(match.label || round.name)}</span>
                        ${playoffTeamLine(match, "home", maps)}
                        ${playoffTeamLine(match, "away", maps)}
                        ${match.note ? `<p class="source-note">${escapeHTML(match.note)}</p>` : ""}
                        ${
                          renderScorerRows(match)
                            ? `<details class="projected-scorer-details compact">
                                <summary>Projected scorers</summary>
                                <div class="projected-scorer-board">
                                  <div class="projected-scorer-head">
                                    <span>${teamLink(match.homeTeamId, maps)}</span>
                                    <strong>Stat</strong>
                                    <span>${teamLink(match.awayTeamId, maps)}</span>
                                  </div>
                                  ${renderScorerRows(match)}
                                </div>
                              </details>`
                            : ""
                        }
                      </article>
                    `
                  )
                  .join("")}
              </section>
            `
          )
          .join("")}
      </div>
      <div class="projected-champion-card">
        <span class="eyebrow">Projected Champion | Prediction Only</span>
        <h3>${escapeHTML(championName)}</h3>
        <p>${escapeHTML(playoffs.championNote || "This champion pick is not official.")}</p>
      </div>
    </section>
  `;
}

function formatExpected(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "Not recorded";
}

function projectionRoleLabel(role) {
  return role === "goalkeeper" ? "Goalkeeper" : role === "field" ? "Field player" : role[0].toUpperCase() + role.slice(1);
}

function projectionSort(players, sort) {
  const sorted = [...players];
  const valueFor = {
    goals: (player) => player.projectedGoals,
    wins: (player) => player.projectedWins,
    games: (player) => player.projectedGames,
    gaa: (player) => player.projectedGaa,
  }[sort];
  if (sort === "name") return sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (!valueFor) return sorted.sort((a, b) => b.projectedGoals - a.projectedGoals || a.name.localeCompare(b.name));
  return sorted.sort((a, b) => {
    const first = valueFor(a);
    const second = valueFor(b);
    if (first === null || first === undefined) return 1;
    if (second === null || second === undefined) return -1;
    return (sort === "gaa" ? first - second : second - first) || a.name.localeCompare(b.name);
  });
}

function renderPlayerProjectionRows(projection, maps, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  const filtered = projection.players.filter((player) => {
    const matchesRole = filters.role === "all" || (filters.role === "field" ? player.role !== "goalkeeper" : player.role === filters.role);
    const matchesQuery = !query || [player.name, player.position, player.teamName, player.id].some((value) => String(value || "").toLocaleLowerCase().includes(query));
    return matchesRole && matchesQuery;
  });
  const sorted = projectionSort(filtered, filters.sort || "goals");
  if (!sorted.length) return { count: 0, markup: `<div class="projection-empty-state">${statusMessage("empty", "No player projections match these filters.")}</div>` };

  const markup = `
    <div class="table-wrap projected-table-wrap projection-player-table-wrap">
      <table class="data-table projected-table projection-player-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player / Position</th>
            <th>Team scenario</th>
            <th class="num">2026 GP*</th>
            <th class="num">2026 goals</th>
            <th class="num">2027 GP</th>
            <th class="num">2027 goals</th>
            <th>2027 W / T / L</th>
            <th class="num">2027 goalie GAA</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((player, index) => `
            <tr>
              <td data-label="Rank"><span class="rank-badge">${index + 1}</span></td>
              <td data-label="Player / Position">
                <div class="projection-player-identity">
                  <a href="./player.html?id=${escapeHTML(player.id)}">${escapeHTML(player.name)}</a>
                  <span>${escapeHTML(projectionRoleLabel(player.role))} · ${escapeHTML(player.position)}</span>
                  <small>${player.ageLabel === "Not recorded" ? "Age not recorded · no age adjustment" : `Age ${escapeHTML(player.ageLabel)} at expected start · model adjustment ${player.ageAdjustment}`}</small>
                </div>
              </td>
              <td data-label="Team scenario">
                <div class="projection-player-team">
                  ${teamLink(player.teamId, maps)}
                  <span>2026 club retention scenario</span>
                </div>
              </td>
              <td class="num" data-label="2026 roster GP*">${formatExpected(player.sourceGames)}</td>
              <td class="num" data-label="2026 credited goals">${player.sourceGoals}</td>
              <td class="num" data-label="2027 expected GP">${formatExpected(player.projectedGames)}</td>
              <td class="num projection-highlight" data-label="2027 expected goals">${formatExpected(player.projectedGoals)}</td>
              <td data-label="2027 expected W / T / L">${formatExpected(player.projectedWins)} / ${formatExpected(player.projectedTies)} / ${formatExpected(player.projectedLosses)}</td>
              <td class="num" data-label="2027 projected goalie GAA">${player.projectedGaa === null ? "—" : formatExpected(player.projectedGaa, 2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  return { count: sorted.length, markup };
}

function renderPlayerProjectionSection(projection, teamData) {
  const players = projection.players || [];
  const ageKnown = players.filter((player) => player.ageLabel !== "Not recorded").length;
  const coverage = projection.coverage || { matches: 0, scoreboardGoals: 0, creditedGoals: 0, unattributedGoals: 0 };
  const coverageRows = (projection.scoringCoverageBySeason || []).map((season) =>
    `${season.year}: ${season.unattributedGoals} goals have no scorer event; ${season.unlinkedGoals} scorer goals are not linked to a player profile`
  );
  const teamMaps = getTeamMaps(teamData);
  const table = renderPlayerProjectionRows(projection, teamMaps, { role: "all", sort: "goals" });
  return `
    <section class="section-panel projected-player-panel" aria-labelledby="projected-players-title">
      <div class="section-head projected-player-heading">
        <div>
          <span class="eyebrow">${escapeHTML(projection.targetSeason)} · Simulation only</span>
          <h2 id="projected-players-title">Player Projections</h2>
          <p>Estimated regular-season output from verified 2024–2026 LSL Seniors records.</p>
        </div>
        <span class="pill green">Not official</span>
      </div>

      <div class="projection-caveat" role="note">
        <strong>2027 teams are not confirmed.</strong>
        <p>Each club shown is a continuity scenario using the player's 2026 team, not a signed roster or team assignment. LSL rosters reset each season.</p>
      </div>

      <div class="projection-stat-grid" aria-label="Projection data summary">
        <div><strong>${players.length}</strong><span>2026 Seniors in the source pool</span></div>
        <div><strong>${formatExpected(projection.scheduleBaseline, 0)}</strong><span>2027 regular games assumed per team</span></div>
        <div><strong>${coverage.unattributedGoals}</strong><span>2026 goals without a player credit</span></div>
        <div><strong>${ageKnown} / ${players.length}</strong><span>Players with recorded birth-year data</span></div>
      </div>

      <details class="projection-method-details">
        <summary>How the estimates work and where the data is incomplete</summary>
        <div class="projection-method-content">
          <ul>
            <li>2027 schedule length uses the median number of completed regular-season games per Seniors team in 2026. Player appearances use roster and absence records as an availability proxy; confirmed lineups and minutes are not consistently recorded.</li>
            <li>Goals use 65% of a player's 2026 regular-season scoring rate and 35% of their earlier recorded career rate, stabilized toward the 2026 role average for small samples. Only scorer events linked to a player ID are used; unrecorded or unlinked goals are never assigned to a player.</li>
            <li>Expected wins, ties, and losses apply the player's 2026 club's regular-season result rates to projected appearances. They are fractional expectations under the club-retention scenario, not match results.</li>
            <li>Goalkeeper GAA uses recorded goals-against per roster-based goalkeeper game, blended with earlier goalkeeper records and the 2026 goalkeeper average. Field-player GAA is not applicable.</li>
            <li>Age is estimated for the expected first week, June 5, 2027. Recorded birth month is used when available; year-only ages are shown as a range. Missing birth data stays unknown and receives no age adjustment. Position-specific age curves are model assumptions, not measured LSL performance facts.</li>
            <li>Age adjustments use assumed experience plateaus of age 24 for goalkeepers, 22 for defenders, 21 for midfielders/field players, and 20 for attackers. The model factor ranges from 0.88 for younger players to 1.00 at the assumed plateau.</li>
            ${coverageRows.length ? `<li>Player-goal attribution gaps in source seasons: ${coverageRows.map(escapeHTML).join("; ")}.</li>` : ""}
            <li>2026 has no recorded Juniors player roster/results for this model, so no Juniors forecasts are generated.</li>
          </ul>
        </div>
      </details>

      <div class="projection-player-controls">
        <label for="projection-player-search">Search players or clubs
          <input id="projection-player-search" type="search" placeholder="Search names, positions, teams..." autocomplete="off">
        </label>
        <label for="projection-role-filter">Position group
          <select id="projection-role-filter">
            <option value="all">All positions</option>
            <option value="field">Field players</option>
            <option value="goalkeeper">Goalkeepers</option>
          </select>
        </label>
        <label for="projection-sort">Sort by
          <select id="projection-sort">
            <option value="goals">Projected goals</option>
            <option value="wins">Projected wins</option>
            <option value="games">Projected games</option>
            <option value="gaa">Goalkeeper GAA</option>
            <option value="name">Player name</option>
          </select>
        </label>
      </div>

      <p class="projection-result-count" id="projection-result-count" role="status">Showing ${table.count} of ${players.length} players</p>
      <div id="projection-player-results">${table.markup}</div>
      <p class="projection-source-note">2026 GP is a roster-based estimate, not verified individual attendance. 2026 goals are credited scorer records only; ${coverage.unattributedGoals} of ${coverage.scoreboardGoals} regular-season scoreboard goals are unattributed.</p>
    </section>
  `;
}

function bindPlayerProjectionControls(projection, teamData) {
  const search = root.querySelector("#projection-player-search");
  const role = root.querySelector("#projection-role-filter");
  const sort = root.querySelector("#projection-sort");
  const resultCount = root.querySelector("#projection-result-count");
  const results = root.querySelector("#projection-player-results");
  if (!search || !role || !sort || !results || !resultCount) return;
  const maps = getTeamMaps(teamData);
  const update = () => {
    const result = renderPlayerProjectionRows(projection, maps, { query: search.value, role: role.value, sort: sort.value });
    resultCount.textContent = `Showing ${result.count} of ${projection.players.length} players`;
    results.innerHTML = result.markup;
  };
  search.addEventListener("input", update);
  role.addEventListener("change", update);
  sort.addEventListener("change", update);
}

function renderPendingTeamProjections(projected) {
  return `
    <section class="section-panel projected-pending-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">${escapeHTML(projected.season || SITE.defaultSeason)} · Team outlook pending</span>
          <h2>Team Projections</h2>
          <p>2027 team finishes, fixtures, and playoffs are not projected yet.</p>
        </div>
      </div>
      <p>Official 2027 team registrations, schedule, and playoff format are not available. This page will not present team placements or matchups as facts before those inputs exist.</p>
    </section>
  `;
}

function render(projected, seasonData, history, playerProjections) {
  const maps = getTeamMaps(seasonData);
  const hasTeamProjection = Boolean(
    (projected.standings || []).length ||
    (projected.teams || []).length ||
    list(projected.schedule).some((week) => list(week.matches).length) ||
    list(projected.playoffs?.rounds).some((round) => list(round.matches).length)
  );
  const latestSourceData = history.find((season) => String(season.year) === String(playerProjections.sourceSeason));
  root.innerHTML = `
    ${renderHero(projected)}
    ${renderOpeningNotes(projected)}
    ${renderPlayerProjectionSection(playerProjections, latestSourceData || seasonData)}
    ${hasTeamProjection
      ? `${renderProjectedStandings(projected, maps)}
    ${renderTeamCards(projected, maps)}
    ${renderSchedule(projected, maps)}
    ${renderProjectedPlayoffs(projected, maps)}`
      : renderPendingTeamProjections(projected)
    }`;
  bindPlayerProjectionControls(playerProjections, latestSourceData || seasonData);
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading projected season...");
  const [seasonData, projected, history] = await Promise.all([
    loadSeasonData(SITE.defaultSeason, ["teams", "coaches"]),
    loadJSON(`./data/${SITE.defaultSeason}/projected.json`, null),
    loadAllSeasons(["2024", "2025", "2026"], ["teams", "players", "matches"]),
  ]);

  if (!projected) {
    root.innerHTML = statusMessage("empty", `Projected ${SITE.defaultSeason} details are coming soon.`);
    return;
  }

  const playerProjections = buildPlayerProjections(history, Number(projected.season || SITE.defaultSeason));
  render(projected, seasonData, history, playerProjections);
}

init().catch((error) => {
  console.error("Could not load LSL projections.", error);
  root.innerHTML = statusMessage("error", "Player projections could not be loaded. Please check your connection and try again.");
});


