import { loadSeasonData } from "./dataLoader.js";
import { calculateStandings, isCompletedMatch, winnerTeamId } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatPercent, initials, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("advanced-stats.html");
setDocumentTitle("Advanced Stats");

const root = document.getElementById("page-root");
const state = {
  season: "2026",
  division: "Seniors",
  week: "all",
};

const TIERS = [
  { key: "elite", label: "Elite", note: "Top 3" },
  { key: "mid", label: "Mid", note: "Middle 2" },
  { key: "bad", label: "Bad", note: "Bottom 3" },
];

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function pct(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function scaleToBounds(value, max, bounds = [6, 94]) {
  const raw = pct(value, max);
  return bounds[0] + (raw / 100) * (bounds[1] - bounds[0]);
}

function declutterDots(points, { xUnit = 9, yUnit = 15, bounds = [6, 94], iterations = 60 } = {}) {
  const positioned = points.map((point) => ({ ...point }));

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i];
        const b = positioned[j];
        const dx = (b.x - a.x) / xUnit;
        const dy = (b.y - a.y) / yUnit;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        if (dist < 1) {
          moved = true;
          const overlap = (1 - dist) / 2;
          const angle = dist < 0.02 ? ((i * 53 + j * 29) % 360) * (Math.PI / 180) : Math.atan2(dy, dx);
          const pushX = Math.cos(angle) * overlap * xUnit;
          const pushY = Math.sin(angle) * overlap * yUnit;
          a.x -= pushX;
          a.y -= pushY;
          b.x += pushX;
          b.y += pushY;
        }
      }
    }
    positioned.forEach((point) => {
      point.x = Math.max(bounds[0], Math.min(bounds[1], point.x));
      point.y = Math.max(bounds[0], Math.min(bounds[1], point.y));
    });
    if (!moved) break;
  }

  return positioned;
}

function teamLogo(team = {}) {
  const style = team.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team.logo) {
    return `<img class="team-logo small" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${style}>`;
  }
  return `<span class="team-mark small"${style}>${escapeHTML(initials(team.name || "LSL", 3))}</span>`;
}

function completedMatches(data) {
  return (data.matches || [])
    .filter((match) => match.division === state.division && match.stage === "regular")
    .filter((match) => state.week === "all" || Number(match.week) <= Number(state.week))
    .filter(isCompletedMatch)
    .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore));
}

function weeks(data) {
  const values = [...new Set((data.matches || [])
    .filter((match) => match.division === state.division && match.stage === "regular")
    .map((match) => Number(match.week))
    .filter(Number.isFinite))].sort((a, b) => a - b);
  return [{ value: "all", label: "All completed weeks" }, ...values.map((week) => ({ value: week, label: `Through Week ${week}` }))];
}

function tierForRank(index) {
  if (index < 3) return "elite";
  if (index < 5) return "mid";
  return "bad";
}

function blankRecord() {
  return { gp: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0, gd: 0, ppg: 0, avgGd: 0 };
}

function addMatch(record, gf, ga, winner, teamId) {
  record.gp += 1;
  record.gf += gf;
  record.ga += ga;
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
  record.ppg = record.gp ? record.pts / record.gp : 0;
  record.avgGd = record.gp ? record.gd / record.gp : 0;
}

function hydrateRecord(record) {
  record.gd = record.gf - record.ga;
  record.ppg = record.gp ? record.pts / record.gp : 0;
  record.avgGd = record.gp ? record.gd / record.gp : 0;
  return record;
}

function buildAnalytics(data) {
  const teams = new Map((data.teams || []).filter((team) => team.division === state.division).map((team) => [team.id, team]));
  const standings = calculateStandings(data, { division: state.division, upToWeek: state.week });
  const tierMap = new Map(standings.map((row, index) => [row.teamId, tierForRank(index)]));
  const rows = standings.map((row, index) => ({
    ...row,
    team: teams.get(row.teamId) || row.team,
    tier: tierForRank(index),
    tiers: {
      elite: blankRecord(),
      mid: blankRecord(),
      bad: blankRecord(),
    },
  }));
  const rowMap = new Map(rows.map((row) => [row.teamId, row]));

  completedMatches(data).forEach((match) => {
    const winner = winnerTeamId(match);
    const home = rowMap.get(match.homeTeamId);
    const away = rowMap.get(match.awayTeamId);
    if (!home || !away) return;

    addMatch(home.tiers[tierMap.get(match.awayTeamId) || "bad"], match.homeScore, match.awayScore, winner, match.homeTeamId);
    addMatch(away.tiers[tierMap.get(match.homeTeamId) || "bad"], match.awayScore, match.homeScore, winner, match.awayTeamId);
  });

  rows.forEach((row) => {
    TIERS.forEach((tier) => hydrateRecord(row.tiers[tier.key]));
    row.gfPerGame = row.gp ? row.gf / row.gp : 0;
    row.gaPerGame = row.gp ? row.ga / row.gp : 0;
    row.winPct = row.gp ? (row.w / row.gp) * 100 : 0;
  });

  return {
    rows,
    matches: completedMatches(data),
    standings,
  };
}

function recordLabel(record = {}) {
  return `${record.w}-${record.d}-${record.l}`;
}

function renderHero(rows, matchCount) {
  const leader = rows[0];
  const attack = [...rows].sort((a, b) => b.gf - a.gf || b.pts - a.pts)[0];
  const defense = [...rows].sort((a, b) => a.ga - b.ga || b.pts - a.pts)[0];
  const volatile = [...rows].sort((a, b) => b.gf + b.ga - (a.gf + a.ga))[0];

  return `
    <section class="section-panel advanced-hero-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Advanced Stats</span>
          <h1>LSL 2026 Analytics</h1>
          <p>Team performance charts for attack, defense, tiers, momentum, and matchup strength.</p>
        </div>
        <span class="pill green">${escapeHTML(matchCount)} matches counted</span>
      </div>
      <div class="advanced-quick-grid">
        <article><span>Best Team</span><strong>${escapeHTML(leader?.team?.name || "Coming Soon")}</strong><small>${leader ? `${leader.pts} pts | ${recordLabel(leader)}` : "No results yet"}</small></article>
        <article><span>Most Goals</span><strong>${escapeHTML(attack?.team?.name || "Coming Soon")}</strong><small>${attack ? `${attack.gf} goals for` : "No results yet"}</small></article>
        <article><span>Best Defense</span><strong>${escapeHTML(defense?.team?.name || "Coming Soon")}</strong><small>${defense ? `${defense.ga} goals allowed` : "No results yet"}</small></article>
        <article><span>Most Volatile</span><strong>${escapeHTML(volatile?.team?.name || "Coming Soon")}</strong><small>${volatile ? `${volatile.gf + volatile.ga} total goals` : "No results yet"}</small></article>
      </div>
    </section>
  `;
}

function renderControls(data) {
  return `
    <section class="section-panel advanced-filter-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Controls</span>
          <h2>Choose The Scope</h2>
          <p>Review 2026 senior results by completed week.</p>
        </div>
      </div>
      <div class="controls advanced-controls">
        ${controlSelect("season", "Season", [{ value: "2026", label: "2026" }], state.season)}
        ${controlSelect("division", "Division", [{ value: "Seniors", label: "Seniors" }], state.division)}
        ${controlSelect("week", "Week", weeks(data), state.week)}
      </div>
    </section>
  `;
}

function renderTacticalQuadrant(rows) {
  const maxAttack = Math.max(1, ...rows.map((row) => row.gfPerGame));
  const maxConceded = Math.max(1, ...rows.map((row) => row.gaPerGame));
  const bounds = [7, 93];
  const points = declutterDots(
    rows.map((row) => {
      const defenseScore = maxConceded - row.gaPerGame;
      return {
        row,
        x: scaleToBounds(row.gfPerGame, maxAttack, bounds),
        y: 100 - scaleToBounds(defenseScore, maxConceded, bounds),
      };
    }),
    { xUnit: 9, yUnit: 15, bounds }
  );

  return `
    <article class="advanced-chart-card tactical">
      <div class="advanced-chart-head">
        <span>Attack vs Defense</span>
        <h3>Tactical Quadrant</h3>
      </div>
      <div class="advanced-scatter">
        <span class="axis top-left">Park The Bus</span>
        <span class="axis top-right">Elite Balance</span>
        <span class="axis bottom-left">Struggling</span>
        <span class="axis bottom-right">Open Attack</span>
        ${points
          .map(
            ({ row, x, y }) => `
              <a class="advanced-dot ${escapeHTML(row.tier)}" style="left:${x}%; top:${y}%;" href="${escapeHTML(teamProfileHref(row.teamId, state.season))}" title="${escapeHTML(row.team.name)}">
                ${escapeHTML(row.team.shortName || initials(row.team.name, 3))}
              </a>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderPointsBreakdown(rows) {
  return `
    <article class="advanced-chart-card">
      <div class="advanced-chart-head">
        <span>Points Breakdown</span>
        <h3>Where Points Came From</h3>
      </div>
      <div class="advanced-stack-list">
        ${rows
          .map((row) => {
            const total = Math.max(1, TIERS.reduce((sum, tier) => sum + row.tiers[tier.key].pts, 0));
            return `
              <div class="advanced-stack-row">
                <strong>${escapeHTML(row.team.name)}</strong>
                <div class="advanced-stack-bar">
                  ${TIERS.map((tier) => `<span class="${tier.key}" style="width:${pct(row.tiers[tier.key].pts, total)}%" title="${tier.label}: ${row.tiers[tier.key].pts} pts"></span>`).join("")}
                </div>
                <small>${TIERS.map((tier) => `${tier.label}: ${row.tiers[tier.key].pts}`).join(" | ")}</small>
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function renderGoalsVsWins(rows) {
  const maxGoals = Math.max(1, ...rows.map((row) => row.gf));
  const maxPoints = Math.max(1, ...rows.map((row) => row.pts));
  const bounds = [7, 93];
  const points = declutterDots(
    rows.map((row) => ({
      row,
      x: scaleToBounds(row.gf, maxGoals, bounds),
      y: 100 - scaleToBounds(row.pts, maxPoints, bounds),
    })),
    { xUnit: 9, yUnit: 15, bounds }
  );

  return `
    <article class="advanced-chart-card">
      <div class="advanced-chart-head">
        <span>Goals vs Wins</span>
        <h3>Stat Padding Check</h3>
      </div>
      <div class="advanced-scatter compact">
        ${points
          .map(
            ({ row, x, y }) => `
              <a class="advanced-dot ${escapeHTML(row.tier)}" style="left:${x}%; top:${y}%;" href="${escapeHTML(teamProfileHref(row.teamId, state.season))}" title="${escapeHTML(`${row.team.name}: ${row.gf} GF, ${row.pts} pts`)}">
                ${escapeHTML(row.team.shortName || initials(row.team.name, 3))}
              </a>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderPpgHeatmap(rows) {
  return `
    <article class="advanced-chart-card wide">
      <div class="advanced-chart-head">
        <span>Tier Heatmap</span>
        <h3>Points Per Game By Opponent Tier</h3>
      </div>
      <div class="advanced-heatmap">
        <div class="advanced-heat-head"></div>
        ${TIERS.map((tier) => `<div class="advanced-heat-head">${escapeHTML(tier.label)}</div>`).join("")}
        ${rows
          .map((row) => `
            <div class="advanced-heat-team">${escapeHTML(row.team.name)}</div>
            ${TIERS.map((tier) => {
              const value = row.tiers[tier.key].ppg;
              const intensity = pct(value, 3);
              return `<div class="advanced-heat-cell" style="--heat:${intensity}%"><strong>${value ? value.toFixed(2) : "0.00"}</strong><small>${escapeHTML(recordLabel(row.tiers[tier.key]))}</small></div>`;
            }).join("")}
          `)
          .join("")}
      </div>
    </article>
  `;
}

function renderTugOfWar(rows) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.gf, row.ga)));
  return `
    <article class="advanced-chart-card wide">
      <div class="advanced-chart-head">
        <span>Playstyle Balance</span>
        <h3>Goals For vs Goals Against</h3>
      </div>
      <div class="advanced-tug-list">
        ${rows
          .map((row) => `
            <div class="advanced-tug-row">
              <strong>${escapeHTML(row.team.name)}</strong>
              <div class="advanced-tug-bar">
                <span class="against" style="width:${pct(row.ga, max)}%">${row.ga}</span>
                <i></i>
                <span class="for" style="width:${pct(row.gf, max)}%">${row.gf}</span>
              </div>
            </div>
          `)
          .join("")}
      </div>
    </article>
  `;
}

function renderElasticity(rows) {
  const maxPpg = 3;
  const width = 520;
  const height = 260;
  const xFor = (index) => 60 + index * 200;
  const yFor = (value) => 230 - pct(value, maxPpg) * 1.8;
  const topRows = rows.slice(0, 6);
  return `
    <article class="advanced-chart-card wide">
      <div class="advanced-chart-head">
        <span>Elasticity Gap</span>
        <h3>PPG Drop By Competition Level</h3>
      </div>
      <svg class="advanced-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Team PPG from bad to mid to elite opponents">
        <line x1="60" y1="230" x2="460" y2="230"></line>
        <line x1="60" y1="30" x2="60" y2="230"></line>
        ${["Bad", "Mid", "Elite"].map((label, index) => `<text x="${xFor(index)}" y="250">${label}</text>`).join("")}
        ${topRows
          .map((row, index) => {
            const points = ["bad", "mid", "elite"].map((tier, tierIndex) => `${xFor(tierIndex)},${yFor(row.tiers[tier].ppg)}`).join(" ");
            return `<polyline class="line-${index}" points="${points}"></polyline>`;
          })
          .join("")}
      </svg>
      <div class="advanced-chart-legend">
        ${topRows.map((row, index) => `<span class="line-${index}">${escapeHTML(row.team.name)}</span>`).join("")}
      </div>
    </article>
  `;
}

function radarPoint(cx, cy, radius, index, total, value) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const r = radius * value;
  return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
}

function renderRadar(rows) {
  const [first, second] = rows;
  if (!first || !second) return "";
  const max = {
    pts: Math.max(1, ...rows.map((row) => row.pts)),
    gf: Math.max(1, ...rows.map((row) => row.gf)),
    defense: Math.max(1, ...rows.map((row) => Math.max(0, 20 - row.ga))),
    gd: Math.max(1, ...rows.map((row) => row.gd + 20)),
  };
  const metrics = [
    ["Points", (row) => row.pts / max.pts],
    ["Attack", (row) => row.gf / max.gf],
    ["Defense", (row) => Math.max(0, 20 - row.ga) / max.defense],
    ["Margin", (row) => (row.gd + 20) / max.gd],
  ];
  const polygon = (row) => metrics.map((metric, index) => radarPoint(150, 150, 95, index, metrics.length, metric[1](row))).join(" ");
  return `
    <article class="advanced-chart-card">
      <div class="advanced-chart-head">
        <span>Radar DNA</span>
        <h3>${escapeHTML(first.team.name)} vs ${escapeHTML(second.team.name)}</h3>
      </div>
      <svg class="advanced-radar" viewBox="0 0 300 300" role="img" aria-label="Radar comparison for top two teams">
        <polygon class="radar-grid" points="${metrics.map((_, index) => radarPoint(150, 150, 95, index, metrics.length, 1)).join(" ")}"></polygon>
        ${metrics.map((metric, index) => `<text x="${radarPoint(150, 150, 122, index, metrics.length, 1).split(",")[0]}" y="${radarPoint(150, 150, 122, index, metrics.length, 1).split(",")[1]}">${metric[0]}</text>`).join("")}
        <polygon class="radar-a" points="${polygon(first)}"></polygon>
        <polygon class="radar-b" points="${polygon(second)}"></polygon>
      </svg>
      <div class="advanced-chart-legend">
        <span class="radar-a">${escapeHTML(first.team.name)}</span>
        <span class="radar-b">${escapeHTML(second.team.name)}</span>
      </div>
    </article>
  `;
}

function renderGoalMarginHeatmap(rows) {
  return `
    <article class="advanced-chart-card wide">
      <div class="advanced-chart-head">
        <span>Goal Margin Heatmap</span>
        <h3>Average Goal Difference Per Tier</h3>
      </div>
      <div class="advanced-heatmap margin">
        <div class="advanced-heat-head"></div>
        ${TIERS.map((tier) => `<div class="advanced-heat-head">${escapeHTML(tier.label)}</div>`).join("")}
        ${rows
          .map((row) => `
            <div class="advanced-heat-team">${escapeHTML(row.team.name)}</div>
            ${TIERS.map((tier) => {
              const value = row.tiers[tier.key].avgGd;
              const positive = value >= 0;
              const intensity = Math.min(100, Math.abs(value) * 30);
              return `<div class="advanced-heat-cell ${positive ? "positive" : "negative"}" style="--heat:${intensity}%"><strong>${value > 0 ? "+" : ""}${value.toFixed(2)}</strong><small>${escapeHTML(recordLabel(row.tiers[tier.key]))}</small></div>`;
            }).join("")}
          `)
          .join("")}
      </div>
    </article>
  `;
}

function renderTeamTable(rows) {
  if (!rows.length) return statusMessage("empty", "Team analytics coming soon.");
  return `
    <section class="section-panel advanced-table-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Team Snapshot</span>
          <h2>2026 Advanced Team Table</h2>
          <p>Ranked by points, wins, then goal difference.</p>
        </div>
      </div>
      <div class="table-wrap mobile-card-table-wrap">
        <table class="data-table mobile-card-table advanced-table">
          <thead>
            <tr>
              <th>Team</th>
              <th class="num">GP</th>
              <th class="num">W</th>
              <th class="num">D</th>
              <th class="num">L</th>
              <th class="num">PTS</th>
              <th class="num">GF</th>
              <th class="num">GA</th>
              <th class="num">GD</th>
              <th class="num">Win %</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td data-label="Team">
                      <div class="team-cell">
                        ${teamLogo(row.team)}
                        <div>
                          <a class="team-name" href="${escapeHTML(teamProfileHref(row.teamId, state.season))}">${escapeHTML(row.team.name)}</a>
                          <small>${escapeHTML(TIERS.find((tier) => tier.key === row.tier)?.label || "Tier")}</small>
                        </div>
                      </div>
                    </td>
                    <td class="num" data-label="GP">${row.gp}</td>
                    <td class="num" data-label="W">${row.w}</td>
                    <td class="num" data-label="D">${row.d}</td>
                    <td class="num" data-label="L">${row.l}</td>
                    <td class="num" data-label="PTS">${row.pts}</td>
                    <td class="num" data-label="GF">${row.gf}</td>
                    <td class="num" data-label="GA">${row.ga}</td>
                    <td class="num" data-label="GD">${row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                    <td class="num" data-label="Win %">${formatPercent(row.winPct)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function render(data) {
  const { rows, matches } = buildAnalytics(data);
  root.innerHTML = `
    ${renderHero(rows, matches.length)}
    ${renderControls(data)}
    <section class="section-panel advanced-chart-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Charts</span>
          <h2>Team Analytics Dashboard</h2>
          <p>Each chart highlights a different way teams are winning, defending, or handling stronger opponents.</p>
        </div>
      </div>
      <div class="advanced-chart-grid">
        ${renderTacticalQuadrant(rows)}
        ${renderGoalsVsWins(rows)}
        ${renderPointsBreakdown(rows)}
        ${renderRadar(rows)}
        ${renderPpgHeatmap(rows)}
        ${renderTugOfWar(rows)}
        ${renderElasticity(rows)}
        ${renderGoalMarginHeatmap(rows)}
      </div>
    </section>
    ${renderTeamTable(rows)}
  `;

  ["season", "division", "week"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", async (event) => {
      state[id] = event.target.value;
      render(await loadSeasonData(state.season));
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading advanced stats...");
  try {
    render(await loadSeasonData(state.season));
  } catch (error) {
    console.error(error);
    root.innerHTML = statusMessage("error", "Advanced stats are coming soon.");
  }
}

init();
