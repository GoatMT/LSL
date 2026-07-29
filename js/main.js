import { renderFooter } from "../components/footer.js";
import { hydrateNavbar, renderNavbar } from "../components/navbar.js";
import { SITE } from "./config.js";
import { loadAllSeasons, loadJSON, loadSeasonData } from "./dataLoader.js";
import { computePlayerStats, getAwards, getLatestCompletedMatches, getUpcomingMatches, isCompletedMatch } from "./leagueEngine.js?v=3.2";
import { controlSelect, escapeHTML, formatDateWithISO, initials, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

function playerHref(playerId = "") {
  return playerId ? `./player.html?id=${encodeURIComponent(playerId)}` : "./players.html";
}

export function setupLayout(activeHref) {
  document.getElementById("site-navbar").innerHTML = renderNavbar(activeHref);
  document.getElementById("site-footer").innerHTML = renderFooter();
  hydrateNavbar();
}

function renderTeamOfWeek(teamOfWeek = {}) {
  const player = teamOfWeek.playerOfTheWeek || {};
  const topPlayers = teamOfWeek.topPlayers || [];
  if (!player.name && !topPlayers.length) return "";

  const meta = [teamOfWeek.season, teamOfWeek.week, teamOfWeek.division].filter(Boolean).join(" | ");
  return `
    <section class="section-panel team-week-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">${escapeHTML(meta || "Latest Week")}</span>
          <h2>Team of the Week</h2>
          <p>Best performers from the latest LSL week.</p>
        </div>
        ${teamOfWeek.date ? `<span class="pill">${escapeHTML(teamOfWeek.date)}</span>` : ""}
      </div>
      <div class="team-week-grid">
        <article class="team-week-feature">
          <span class="pill green">${escapeHTML(player.tag || "Player of the Week")}</span>
          <a href="${escapeHTML(playerHref(player.playerId))}">${escapeHTML(player.name || "Player TBA")}</a>
          <p>${escapeHTML(player.summary || "Weekly player note coming soon.")}</p>
          ${player.teamName ? `<small>${escapeHTML(player.teamName)}</small>` : ""}
        </article>
        <div class="team-week-list" aria-label="Top 5 players of the week">
          ${topPlayers
            .map(
              (item) => `
                <article class="team-week-row">
                  <span class="team-week-rank">#${escapeHTML(item.rank || "")}</span>
                  <div>
                    <a href="${escapeHTML(playerHref(item.playerId))}">${escapeHTML(item.name || "Player TBA")}</a>
                    <p>${escapeHTML([item.teamName, item.summary].filter(Boolean).join(" - "))}</p>
                  </div>
                </article>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function awardWatchHref(item = {}, season = SITE.defaultSeason) {
  if (item.playerId) return playerHref(item.playerId);
  if (item.teamId) return teamProfileHref(item.teamId, season);
  return "./awards.html";
}

function renderAwardWatch(awardWatch = {}) {
  const categories = awardWatch.categories || [];
  if (!categories.length) return "";
  const meta = [awardWatch.season, awardWatch.week].filter(Boolean).join(" | ");

  return `
    <section class="section-panel home-award-watch-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(meta || "Awards")}</span>
          <h2>${escapeHTML(awardWatch.title || "Award Watch")}</h2>
          <p>${escapeHTML(awardWatch.subtitle || "Early leaders for major LSL season honors.")}</p>
        </div>
        <a class="text-link" href="./awards.html">Awards page</a>
      </div>
      <div class="home-award-watch-grid">
        ${categories
          .map(
            (category) => `
              <article class="home-award-watch-card">
                <div class="home-award-watch-head">
                  <span class="pill green">${escapeHTML(category.label || "Award")}</span>
                  <p>${escapeHTML(category.note || "Current watch list.")}</p>
                </div>
                <div class="home-award-watch-list">
                  ${(category.leaders || [])
                    .map(
                      (leader) => `
                        <a class="home-award-watch-row" href="${escapeHTML(awardWatchHref(leader, awardWatch.season))}">
                          <span class="home-award-watch-rank">#${escapeHTML(leader.rank || "")}</span>
                          <div>
                            <strong>${escapeHTML(leader.name || "Name TBA")}</strong>
                            <small>${escapeHTML(leader.teamName || leader.stat || "LSL")}</small>
                          </div>
                          <span class="home-award-watch-stat">${escapeHTML(leader.stat || "Watch")}</span>
                          <p>${escapeHTML(leader.reason || "Award watch note coming soon.")}</p>
                        </a>
                      `
                    )
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

const HOME_LEADER_TYPES = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
];

const homeLeaderState = {
  year: SITE.defaultSeason,
  division: "Seniors",
  teamId: "All",
  stat: "goals",
};

function homeLeaderRank(rows, index, key) {
  if (index === 0) return 1;
  return rows[index - 1][key] === rows[index][key] ? homeLeaderRank(rows, index - 1, key) : index + 1;
}

function renderHomeLeaderFeature(data, type, player, active = false) {
  return `
    <a
      class="home-leader-feature"
      href="${escapeHTML(playerHref(player.id))}"
      data-home-leader-feature="${escapeHTML(player.id)}"
      aria-label="Open ${escapeHTML(player.name)} player profile"
      ${active ? "" : "hidden"}
    >
      <div class="home-leader-avatar" aria-hidden="true">${escapeHTML(initials(player.name))}</div>
      <div class="home-leader-feature-copy">
        <span>${escapeHTML(data.year)} ${escapeHTML(type.label)} Leader</span>
        <strong>${escapeHTML(player.name)}</strong>
        <small>${escapeHTML(player.teamName || "Team not listed")} | ${escapeHTML(player.division || "Seniors")}</small>
      </div>
      <div class="home-leader-total">
        <span>${escapeHTML(type.label)}</span>
        <strong>${Number(player[type.key]) || 0}</strong>
      </div>
    </a>
  `;
}

function teamContributionRows(data, teamId) {
  const players = new Map(computePlayerStats(data, { stage: "regular" }).map((player) => [player.id, player]));
  const teams = new Map((data.teams || []).map((team) => [team.id, team]));
  const rows = new Map();
  const ensureRow = (entry = {}) => {
    if (!entry.playerId) return null;
    const base = players.get(entry.playerId) || {};
    const team = teams.get(teamId) || {};
    const existing = rows.get(entry.playerId) || {
      ...base,
      id: entry.playerId,
      name: base.name || entry.name || "Player",
      teamId,
      teamName: team.name || base.teamName || "Team",
      division: team.division || base.division || "Seniors",
      goals: 0,
      assists: 0,
      points: 0,
    };
    rows.set(entry.playerId, existing);
    return existing;
  };

  (data.matches || [])
    .filter((match) => match.stage === "regular" && isCompletedMatch(match))
    .forEach((match) => {
      (match.scorers || [])
        .filter((scorer) => scorer.teamId === teamId)
        .forEach((scorer) => {
          const row = ensureRow(scorer);
          if (!row) return;
          row.goals += Number(scorer.goals) || 0;
          row.points = row.goals + row.assists;
        });
      (match.assists || [])
        .filter((assist) => assist.teamId === teamId)
        .forEach((assist) => {
          const row = ensureRow(assist);
          if (!row) return;
          row.assists += Number(assist.assists) || 0;
          row.points = row.goals + row.assists;
        });
    });

  return [...rows.values()];
}

function homeLeaderRows(data, type) {
  const selectedTeamId = homeLeaderState.teamId;
  const selectedDivision = homeLeaderState.division;
  const rows =
    selectedTeamId === "All"
      ? computePlayerStats(data, { stage: "regular" }).filter((player) => player.gamesPlayed > 0)
      : teamContributionRows(data, selectedTeamId);

  return rows
    .filter((player) => selectedDivision === "All" || player.division === selectedDivision)
    .filter((player) => Number(player[type.key]) > 0)
    .sort((a, b) =>
      Number(b[type.key]) - Number(a[type.key]) ||
      b.points - a.points ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name)
    )
    .slice(0, 10);
}

function renderHomeLeaderView(data, type, active = false) {
  const selectedTeamId = homeLeaderState.teamId;
  const selectedTeam = (data.teams || []).find((team) => team.id === selectedTeamId);
  const divisionLabel = homeLeaderState.division === "All" ? "all divisions" : homeLeaderState.division;
  const scopeLabel = selectedTeam?.name || `${divisionLabel} teams`;
  const rows = homeLeaderRows(data, type);

  if (!rows.length) {
    return `<div class="home-leader-view" data-home-leader-panel="${type.key}"${active ? "" : " hidden"}>${statusMessage("empty", `No ${type.label.toLowerCase()} are listed for ${scopeLabel} yet.`)}</div>`;
  }

  return `
    <div class="home-leader-view" data-home-leader-panel="${type.key}"${active ? "" : " hidden"}>
      <div class="home-leader-feature-stack">
        ${rows.map((player, index) => renderHomeLeaderFeature(data, type, player, index === 0)).join("")}
      </div>
      <div class="home-leader-list" aria-label="Top ${escapeHTML(type.label.toLowerCase())} leaders">
        ${rows
          .map(
            (player, index) => `
              <button
                class="home-leader-row${index === 0 ? " active" : ""}"
                type="button"
                data-home-leader-player="${escapeHTML(player.id)}"
                aria-pressed="${index === 0}"
              >
                <span class="home-leader-row-rank">${homeLeaderRank(rows, index, type.key)}.</span>
                <span class="home-leader-row-name">
                  <span>${escapeHTML(player.name)}</span>
                  <small>${escapeHTML(player.teamName || player.division || "LSL")}</small>
                </span>
                <strong>${Number(player[type.key]) || 0}</strong>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function normalizeHomeLeaderState(allData = []) {
  const years = allData.map((season) => season.year);
  if (!years.includes(homeLeaderState.year)) {
    homeLeaderState.year = years.includes(SITE.defaultSeason) ? SITE.defaultSeason : years.at(-1) || SITE.defaultSeason;
  }
  if (!HOME_LEADER_TYPES.some((type) => type.key === homeLeaderState.stat)) {
    homeLeaderState.stat = HOME_LEADER_TYPES[0].key;
  }
  const data = allData.find((season) => season.year === homeLeaderState.year) || allData.at(-1) || {};
  const divisions = [...new Set((data.teams || []).map((team) => team.division).filter(Boolean))];
  if (homeLeaderState.division !== "All" && !divisions.includes(homeLeaderState.division)) {
    homeLeaderState.division = divisions.includes("Seniors") ? "Seniors" : divisions[0] || "All";
  }
  const teams = [...(data.teams || [])]
    .filter((team) => homeLeaderState.division === "All" || team.division === homeLeaderState.division)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (homeLeaderState.teamId !== "All" && !teams.some((team) => team.id === homeLeaderState.teamId)) {
    homeLeaderState.teamId = "All";
  }
  return { data, teams, divisions };
}

function renderHomeLeaders(allData = []) {
  const { data, teams, divisions } = normalizeHomeLeaderState(allData);
  const selectedTeam = teams.find((team) => team.id === homeLeaderState.teamId);
  const selectedDivision = homeLeaderState.division === "All" ? "All divisions" : homeLeaderState.division;
  const scopeLabel = selectedTeam?.name || (homeLeaderState.division === "All" ? "all teams" : `all ${selectedDivision.toLowerCase()} teams`);
  const divisionOptions = [
    { value: "All", label: "All divisions" },
    ...divisions.map((division) => ({ value: division, label: division })),
  ];
  const teamOptions = [
    { value: "All", label: "All teams" },
    ...teams.map((team) => ({ value: team.id, label: team.name })),
  ];

  return `
    <section class="section-panel home-leaders-panel" data-home-leaders-panel>
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">League Leaders</span>
          <h2>${escapeHTML(data.year)} Leaders</h2>
          <p>Regular-season ${escapeHTML(selectedDivision.toLowerCase())} leaders for ${escapeHTML(scopeLabel)}.</p>
        </div>
        <a class="text-link" href="./players.html">All player stats</a>
      </div>
      <div class="controls home-leader-controls">
        ${controlSelect("home-leader-year", "Year", allData.map((season) => ({ value: season.year, label: season.year })), data.year)}
        ${controlSelect("home-leader-division", "Division", divisionOptions, homeLeaderState.division)}
        ${controlSelect("home-leader-team", "Team", teamOptions, homeLeaderState.teamId)}
      </div>
      <div class="home-leader-tabs" role="tablist" aria-label="Leader stat">
        ${HOME_LEADER_TYPES.map(
          (type) => `
            <button type="button" role="tab" class="${type.key === homeLeaderState.stat ? "active" : ""}" data-home-leader-stat="${type.key}" aria-selected="${type.key === homeLeaderState.stat}">
              ${escapeHTML(type.label)}
            </button>
          `
        ).join("")}
      </div>
      ${HOME_LEADER_TYPES.map((type) => renderHomeLeaderView(data, type, type.key === homeLeaderState.stat)).join("")}
    </section>
  `;
}

function hydrateHomeLeaders(allData = []) {
  const leaderPanel = document.querySelector("[data-home-leaders-panel]");
  const refreshLeaders = () => {
    if (!leaderPanel) return;
    leaderPanel.outerHTML = renderHomeLeaders(allData);
    hydrateHomeLeaders(allData);
  };
  const yearSelect = document.getElementById("home-leader-year");
  const divisionSelect = document.getElementById("home-leader-division");
  const teamSelect = document.getElementById("home-leader-team");

  yearSelect?.addEventListener("change", (event) => {
    homeLeaderState.year = event.target.value;
    homeLeaderState.teamId = "All";
    refreshLeaders();
  });

  divisionSelect?.addEventListener("change", (event) => {
    homeLeaderState.division = event.target.value;
    homeLeaderState.teamId = "All";
    refreshLeaders();
  });

  teamSelect?.addEventListener("change", (event) => {
    homeLeaderState.teamId = event.target.value;
    refreshLeaders();
  });

  const buttons = [...document.querySelectorAll("[data-home-leader-stat]")];
  const panels = [...document.querySelectorAll("[data-home-leader-panel]")];

  panels.forEach((panel) => {
    const playerButtons = [...panel.querySelectorAll("[data-home-leader-player]")];
    const features = [...panel.querySelectorAll("[data-home-leader-feature]")];
    const selectPlayer = (playerId) => {
      playerButtons.forEach((item) => {
        const isActive = item.dataset.homeLeaderPlayer === playerId;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
      features.forEach((feature) => {
        feature.hidden = feature.dataset.homeLeaderFeature !== playerId;
      });
    };

    playerButtons.forEach((playerButton) => {
      const select = () => selectPlayer(playerButton.dataset.homeLeaderPlayer);
      playerButton.addEventListener("mouseenter", select);
      playerButton.addEventListener("focus", select);
      playerButton.addEventListener("click", select);
    });
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.homeLeaderStat;
      homeLeaderState.stat = selected;
      buttons.forEach((item) => {
        const isActive = item.dataset.homeLeaderStat === selected;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.homeLeaderPanel !== selected;
      });
    });
  });
}

function homeScoreText(match) {
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    return `${match.homeScore} - ${match.awayScore}`;
  }
  if (match.winnerId) return "Result posted";
  return "vs";
}

function renderHomeMatchCard(data, match) {
  const teams = new Map((data.teams || []).map((team) => [team.id, team]));
  const home = teams.get(match.homeTeamId);
  const away = teams.get(match.awayTeamId);
  const meta = `${escapeHTML(match.division || "LSL")} | ${escapeHTML(formatDateWithISO(match.date))}`;
  const timePill = match.time ? `<span class="home-match-time">${escapeHTML(match.time)}</span>` : "";

  if (match.activityTitle) {
    return `
      <article class="home-match-card activity">
        <div class="home-match-top">
          <span class="pill green">${escapeHTML(match.label || `Week ${match.week}`)}</span>
        </div>
        <h3>${escapeHTML(match.activityTitle)}</h3>
        <div class="home-match-meta">
          <p>${meta}</p>
          ${timePill}
        </div>
      </article>
    `;
  }

  return `
    <article class="home-match-card">
      <div class="home-match-top">
        <span class="pill green">${escapeHTML(match.label || `Week ${match.week}`)}</span>
      </div>
      <div class="home-match-meta">
        <p>${meta}</p>
        ${timePill}
      </div>
      <div class="home-match-line">
        <a href="${escapeHTML(teamProfileHref(match.homeTeamId, data.year))}">${escapeHTML(home?.name || match.homeTeamName || "Home team")}</a>
        <strong>${escapeHTML(homeScoreText(match))}</strong>
        <a href="${escapeHTML(teamProfileHref(match.awayTeamId, data.year))}">${escapeHTML(away?.name || match.awayTeamName || "Away team")}</a>
      </div>
    </article>
  `;
}

function renderHomeContent(data, allData, teamOfWeek = {}, awardWatch = {}) {
  const latest = getLatestCompletedMatches([data], 4).reverse();
  const upcoming = getUpcomingMatches([data], 4);
  const allChampions = getAwards(allData, { division: "Seniors" }).filter((award) => award.category === "Champion Team");

  return `
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-kicker">Lantern Soccer League</span>
        <h1>Lantern Soccer League</h1>
        <p>Follow LSL seasons, playoff brackets, player output, coaching records, awards, and the Inter-Madrasah Tournament.</p>
        <div class="button-row hero-actions">
          <a class="button primary matchday-cta" href="./matchday.html">Matchday</a>
          <a class="button" href="./standings.html">Standings</a>
          <a class="button" href="./matches.html">Matches</a>
        </div>
      </div>
      <aside class="hero-logo-card" aria-label="League logo">
        <img src="${SITE.logo}" alt="Lantern Soccer League logo">
        <strong>Lantern Soccer League</strong>
        <span class="pill">${escapeHTML(data.event?.dates || "Season dates TBA")}</span>
      </aside>
    </section>

    ${renderHomeLeaders(allData)}

    ${renderTeamOfWeek(teamOfWeek)}

    ${renderAwardWatch(awardWatch)}

    <section class="section-panel match-center-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Matches</span>
          <h2>Match Center</h2>
          <p>Check the next schedule first, then review recent completed matches.</p>
        </div>
        <a class="text-link" href="./matches.html">All matches</a>
      </div>
      <div class="home-match-columns">
        <div class="home-match-column">
          <h3>Upcoming Matches</h3>
          <p>Scheduled items will appear here once the next schedule is published.</p>
          <div class="grid match-stack">
            ${upcoming.length ? upcoming.map((match) => renderHomeMatchCard(match.data, match)).join("") : statusMessage("empty", "Next schedule coming soon.")}
          </div>
        </div>
        <div class="home-match-column secondary">
          <h3>Latest Matches</h3>
          <p>Recent completed matches from the selected season.</p>
          <div class="grid match-stack">
            ${latest.length ? latest.map((match) => renderHomeMatchCard(match.data, match)).join("") : statusMessage("empty", "No completed matches are published for this season yet.")}
          </div>
        </div>
      </div>
    </section>

    <section id="history" class="section-panel home-low-priority history-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Senior Champions</span>
          <h2>History</h2>
          <p>Season winners and current title status.</p>
        </div>
        <a class="text-link" href="./awards.html">Awards</a>
      </div>
      <div class="history-grid">
        ${allChampions
          .map(
            (award) => {
              const pending = /to be announced/i.test(award.winner);
              return `
                <article class="card history-card${pending ? " pending" : ""}">
                  <div class="history-card-top">
                    <span class="history-season">${escapeHTML(award.season)}</span>
                    <span class="pill ${pending ? "" : "green"}">${pending ? "Pending" : "Champion"}</span>
                  </div>
                  <h3>${escapeHTML(award.winner)}</h3>
                  <p>${escapeHTML(award.sourceNote || "Season champion.")}</p>
                </article>
              `;
            }
          )
          .join("")}
      </div>
    </section>
  `;
}

async function renderHome() {
  setupLayout("index.html");
  setDocumentTitle("Home");
  const root = document.getElementById("page-root");
  root.innerHTML = statusMessage("loading", "Loading league dashboard...");

  const allData = await loadAllSeasons();
  const teamOfWeekData = await loadJSON("./data/team-of-week.json", {});
  const awardWatchData = await loadJSON("./data/award-watch.json", {});
  let selectedSeason = SITE.defaultSeason;

  async function render() {
    const data = await loadSeasonData(selectedSeason);
    root.innerHTML = renderHomeContent(data, allData, teamOfWeekData, awardWatchData);
    hydrateHomeLeaders(allData);
  }

  render();
}

if ([...document.scripts].some((script) => script.src.includes("/js/main.js"))) {
  renderHome();
}
