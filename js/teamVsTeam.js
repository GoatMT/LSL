import { SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js?v=1.0";
import { calculateStandings, getWeeks, isCompletedMatch, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatPercent, initials, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("team-vs-team.html");
setDocumentTitle("Team vs Team");

const root = document.getElementById("page-root");
const TIERS = [
  { key: "elite", label: "Elite", range: "Top 3", tone: "green" },
  { key: "mid", label: "Mid", range: "Middle 2", tone: "gold" },
  { key: "bad", label: "Bad", range: "Bottom 3", tone: "red" },
];

let state = {
  season: SITE.defaultSeason,
  division: "Seniors",
  week: "all",
};

function blankRecord() {
  return { gp: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0, gd: 0 };
}

function addMatchToRecord(record, ownScore, opponentScore, winner, teamId) {
  record.gp += 1;
  record.gf += Number(ownScore) || 0;
  record.ga += Number(opponentScore) || 0;
  if (winner === teamId) {
    record.w += 1;
    record.pts += 3;
  } else if (winner) {
    record.l += 1;
  } else {
    record.d += 1;
    record.pts += 1;
  }
  record.gd = record.gf - record.ga;
}

function recordText(record) {
  return `${record.w}-${record.d}-${record.l}`;
}

function pointsText(record) {
  return `${record.pts} ${record.pts === 1 ? "pt" : "pts"}`;
}

function gdText(record) {
  return record.gd > 0 ? `+${record.gd}` : String(record.gd);
}

function gdLabel(record) {
  return `${gdText(record)} GD`;
}

function winPct(record) {
  return record.gp ? (record.w / record.gp) * 100 : 0;
}

function teamLogo(team) {
  const logoStyle = team?.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team?.logo) {
    return `<img class="team-logo small" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${logoStyle}>`;
  }
  return `<span class="team-mark small"${logoStyle}>${escapeHTML(initials(team?.name || "LSL", 3))}</span>`;
}

function teamLink(team, season = state.season) {
  if (!team) return "Team TBA";
  return `<a href="${escapeHTML(teamProfileHref(team.id, season))}">${escapeHTML(team.name)}</a>`;
}

function weekOptions(data) {
  const weeks = getWeeks(data.matches || [], state.division, "regular");
  return [{ value: "all", label: "All completed weeks" }].concat(weeks.map((week) => ({ value: week, label: `Through Week ${week}` })));
}

function tierForIndex(index) {
  if (index < 3) return "elite";
  if (index < 5) return "mid";
  return "bad";
}

function buildTiers(standingsRows) {
  const tierMap = new Map();
  const tierTeams = {
    elite: [],
    mid: [],
    bad: [],
  };

  standingsRows.forEach((row, index) => {
    const tier = tierForIndex(index);
    tierMap.set(row.teamId, tier);
    tierTeams[tier].push(row);
  });

  return { tierMap, tierTeams };
}

function filteredMatches(data) {
  return (data.matches || [])
    .filter((match) => match.division === state.division && match.stage === "regular")
    .filter((match) => state.week === "all" || Number(match.week) <= Number(state.week))
    .filter((match) => isCompletedMatch(match))
    .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore));
}

function buildRows(data) {
  const standingsRows = calculateStandings(data, { division: state.division, upToWeek: state.week });
  const teamsById = new Map((data.teams || []).map((team) => [team.id, team]));
  const { tierMap, tierTeams } = buildTiers(standingsRows);
  const rows = standingsRows.map((standing) => ({
    ...standing,
    team: teamsById.get(standing.teamId) || standing.team,
    overall: blankRecord(),
    tiers: {
      elite: blankRecord(),
      mid: blankRecord(),
      bad: blankRecord(),
    },
    opponents: {
      elite: new Set(),
      mid: new Set(),
      bad: new Set(),
    },
  }));
  const rowsById = new Map(rows.map((row) => [row.teamId, row]));

  filteredMatches(data).forEach((match) => {
    const home = rowsById.get(match.homeTeamId);
    const away = rowsById.get(match.awayTeamId);
    if (!home || !away) return;

    const winner = winnerTeamId(match);
    const homeOpponentTier = tierMap.get(match.awayTeamId) || "bad";
    const awayOpponentTier = tierMap.get(match.homeTeamId) || "bad";

    addMatchToRecord(home.overall, match.homeScore, match.awayScore, winner, match.homeTeamId);
    addMatchToRecord(home.tiers[homeOpponentTier], match.homeScore, match.awayScore, winner, match.homeTeamId);
    home.opponents[homeOpponentTier].add(match.awayTeamId);

    addMatchToRecord(away.overall, match.awayScore, match.homeScore, winner, match.awayTeamId);
    addMatchToRecord(away.tiers[awayOpponentTier], match.awayScore, match.homeScore, winner, match.awayTeamId);
    away.opponents[awayOpponentTier].add(match.homeTeamId);
  });

  return { rows, tierTeams, matches: filteredMatches(data) };
}

function renderTierBadges(tierTeams) {
  return `
    <div class="team-vs-tier-grid">
      ${TIERS.map((tier) => {
        const teams = tierTeams[tier.key] || [];
        return `
          <article class="team-vs-tier-card ${tier.key}">
            <div>
              <span class="eyebrow">${escapeHTML(tier.range)}</span>
              <h3>${escapeHTML(tier.label)} Competition</h3>
            </div>
            <div class="team-vs-tier-list">
              ${teams.length ? teams.map((row) => `<span>${escapeHTML(row.rankLabel || row.rank)}. ${escapeHTML(row.team?.name || "Team TBA")}</span>`).join("") : `<span>Coming Soon</span>`}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderSummaryTiles(rows, matchCount) {
  const eliteGames = rows.reduce((sum, row) => sum + row.tiers.elite.gp, 0);
  const bestVsElite = [...rows].sort((a, b) => b.tiers.elite.pts - a.tiers.elite.pts || b.tiers.elite.w - a.tiers.elite.w || b.tiers.elite.gd - a.tiers.elite.gd)[0];
  const mostGoals = [...rows].sort((a, b) => b.overall.gf - a.overall.gf || b.overall.gd - a.overall.gd)[0];

  return `
    <div class="summary-grid team-vs-summary-grid">
      <article class="summary-tile">
        <span>Matches Counted</span>
        <strong>${escapeHTML(matchCount)}</strong>
        <p>${state.week === "all" ? "all completed weeks" : `through Week ${escapeHTML(state.week)}`}</p>
      </article>
      <article class="summary-tile">
        <span>Elite Tests</span>
        <strong>${escapeHTML(eliteGames)}</strong>
        <p>team games vs top-three opponents</p>
      </article>
      <article class="summary-tile">
        <span>Best vs Elite</span>
        <strong>${escapeHTML(bestVsElite?.team?.name || "Coming Soon")}</strong>
        <p>${bestVsElite ? `${recordText(bestVsElite.tiers.elite)} | ${pointsText(bestVsElite.tiers.elite)}` : "no results yet"}</p>
      </article>
      <article class="summary-tile">
        <span>Most Goals</span>
        <strong>${escapeHTML(mostGoals?.team?.name || "Coming Soon")}</strong>
        <p>${mostGoals ? `${mostGoals.overall.gf} GF | ${gdText(mostGoals.overall)} GD` : "no results yet"}</p>
      </article>
    </div>
  `;
}

function tierCell(row, tierKey) {
  const record = row.tiers[tierKey];
  const opponents = [...row.opponents[tierKey]]
    .map((teamId) => row.teamLookup?.get(teamId)?.name || "Team TBA")
    .join(", ");

  return `
    <div class="team-vs-record-cell">
      <strong>${escapeHTML(recordText(record))}</strong>
      <span>${escapeHTML(pointsText(record))} | ${escapeHTML(gdLabel(record))}</span>
      <small>${escapeHTML(opponents || "No games yet")}</small>
    </div>
  `;
}

function bestTier(row) {
  const entries = TIERS.map((tier) => ({ tier, record: row.tiers[tier.key] })).filter((entry) => entry.record.gp);
  if (!entries.length) return { label: "Coming Soon", value: "No games yet" };
  entries.sort((a, b) => b.record.pts - a.record.pts || b.record.w - a.record.w || b.record.gd - a.record.gd);
  const best = entries[0];
  return {
    label: best.tier.label,
    value: `${recordText(best.record)} | ${pointsText(best.record)}`,
  };
}

function renderTable(rows, teamsById) {
  const hydratedRows = rows.map((row) => ({ ...row, teamLookup: teamsById }));
  return `
    <div class="table-wrap mobile-card-table-wrap team-vs-table-wrap">
      <table class="data-table mobile-card-table team-vs-table">
        <thead>
          <tr>
            <th>Team</th>
            <th class="num">Rank</th>
            <th>Overall</th>
            <th>vs Elite</th>
            <th>vs Mid</th>
            <th>vs Bad</th>
            <th>Best Tier</th>
          </tr>
        </thead>
        <tbody>
          ${hydratedRows.map((row) => {
            const best = bestTier(row);
            return `
              <tr>
                <td data-label="Team">
                  <div class="team-vs-team-cell">
                    ${teamLogo(row.team)}
                    <div>
                      <strong>${teamLink(row.team)}</strong>
                      <span>${escapeHTML(state.division)}</span>
                    </div>
                  </div>
                </td>
                <td class="num" data-label="Rank"><span class="rank-badge">${escapeHTML(row.rankLabel || row.rank)}</span></td>
                <td data-label="Overall">${tierCell({ ...row, teamLookup: teamsById, tiers: { overall: row.overall }, opponents: { overall: new Set() } }, "overall")}</td>
                <td data-label="vs Elite">${tierCell({ ...row, teamLookup: teamsById }, "elite")}</td>
                <td data-label="vs Mid">${tierCell({ ...row, teamLookup: teamsById }, "mid")}</td>
                <td data-label="vs Bad">${tierCell({ ...row, teamLookup: teamsById }, "bad")}</td>
                <td data-label="Best Tier">
                  <div class="team-vs-record-cell">
                    <strong>${escapeHTML(best.label)}</strong>
                    <span>${escapeHTML(best.value)}</span>
                    <small>${escapeHTML(formatPercent(winPct(row.overall)))} win rate overall</small>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTeamCards(rows, teamsById) {
  return `
    <div class="team-vs-card-grid">
      ${rows.map((row) => {
        const best = bestTier(row);
        return `
          <article class="card team-vs-card">
            <div class="team-vs-card-head">
              ${teamLogo(row.team)}
              <div>
                <span class="pill green">Rank ${escapeHTML(row.rankLabel || row.rank)}</span>
                <h3>${teamLink(row.team)}</h3>
                <p>${escapeHTML(recordText(row.overall))} | ${escapeHTML(pointsText(row.overall))} | ${escapeHTML(gdLabel(row.overall))}</p>
              </div>
            </div>
            <div class="team-vs-mini-grid">
              ${TIERS.map((tier) => `
                <div class="team-vs-mini ${tier.key}">
                  <span>${escapeHTML(tier.label)}</span>
                  <strong>${escapeHTML(recordText(row.tiers[tier.key]))}</strong>
                  <small>${escapeHTML(pointsText(row.tiers[tier.key]))}</small>
                </div>
              `).join("")}
            </div>
            <p><strong>Best tier:</strong> ${escapeHTML(best.label)} (${escapeHTML(best.value)})</p>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function render(data) {
  const weeks = weekOptions(data);
  if (!weeks.some((item) => String(item.value) === String(state.week))) state.week = "all";
  const { rows, tierTeams, matches } = buildRows(data);
  const teamsById = new Map((data.teams || []).map((team) => [team.id, team]));

  root.innerHTML = `
    <section class="section-panel team-vs-header-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Team vs Team</span>
          <h1>Competition Tiers</h1>
          <p>See how every team performs against Elite, Mid, and Bad competition based on the selected standings.</p>
        </div>
        <span class="pill green">${escapeHTML(state.season)}</span>
      </div>
    </section>

    <section class="section-panel team-vs-filter-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Filters</span>
          <h2>Choose The Scope</h2>
          <p>Elite means top 3, Mid means the next 2, and Bad means the bottom teams for the selected view.</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("season", "Season", SITE.seasons, state.season)}
        ${controlSelect("division", "Division", SITE.divisions, state.division)}
        ${controlSelect("week", "Week", weeks, state.week)}
      </div>
      ${renderTierBadges(tierTeams)}
    </section>

    <section class="section-panel team-vs-main-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Results</span>
          <h2>Records By Competition Level</h2>
          <p>Records use completed regular-season games only.</p>
        </div>
      </div>
      ${renderSummaryTiles(rows, matches.length)}
      ${rows.length ? renderTable(rows, teamsById) : statusMessage("empty", "No teams are available for this selection yet.")}
    </section>

    <section class="section-panel team-vs-card-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Team Cards</span>
          <h2>Quick Team Breakdown</h2>
          <p>A card view for scanning each team's tier performance.</p>
        </div>
      </div>
      ${rows.length ? renderTeamCards(rows, teamsById) : statusMessage("empty", "Team breakdowns are coming soon.")}
    </section>
  `;

  ["season", "division", "week"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async (event) => {
      state[id] = event.target.value;
      if (id === "season" || id === "division") state.week = "all";
      const nextData = id === "season" ? await loadSeasonData(state.season) : data;
      render(nextData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading team comparison...");
  render(await loadSeasonData(state.season));
}

init();
