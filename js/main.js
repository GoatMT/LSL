import { renderFooter } from "../components/footer.js";
import { hydrateNavbar, renderNavbar } from "../components/navbar.js";
import { SITE } from "./config.js";
import { loadAllSeasons, loadJSON, loadSeasonData } from "./dataLoader.js?v=1.0";
import { computePlayerStats, getAwards, getLatestCompletedMatches, getUpcomingMatches, isCompletedMatch, winnerTeamId } from "./leagueEngine.js?v=3.3";
import { controlSelect, escapeHTML, formatDate, formatDateWithISO, initials, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";
import { initPageAnimations } from "./animations.js";

function playerHref(playerId = "") {
  return playerId ? `./player.html?id=${encodeURIComponent(playerId)}` : "./players.html";
}

export function setupLayout(activeHref) {
  document.getElementById("site-navbar").innerHTML = renderNavbar(activeHref);
  document.getElementById("site-footer").innerHTML = renderFooter();
  hydrateNavbar();
  initPageAnimations();
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
  const entryTeamId = (entry = {}) => entry.teamId || players.get(entry.playerId)?.teamId || "";
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
        .filter((scorer) => entryTeamId(scorer) === teamId)
        .forEach((scorer) => {
          const row = ensureRow(scorer);
          if (!row) return;
          row.goals += Number(scorer.goals) || 0;
          row.points = row.goals + row.assists;
        });
      (match.assists || [])
        .filter((assist) => entryTeamId(assist) === teamId)
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

// ---------- Live score / upcoming game ticker ----------

function parseClockToMinutes(clock) {
  const parsed = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(clock || "").trim());
  if (!parsed) return null;
  let hours = Number(parsed[1]) % 12;
  if (/PM/i.test(parsed[3])) hours += 12;
  return hours * 60 + Number(parsed[2]);
}

function matchLiveWindow(match) {
  if (!match.date || !match.time) return null;
  const [startRaw, endRaw] = String(match.time).split("-").map((part) => part.trim());
  const startMinutes = parseClockToMinutes(startRaw);
  if (startMinutes === null) return null;
  const endMinutes = endRaw ? parseClockToMinutes(endRaw) : null;
  const start = new Date(`${match.date}T00:00:00`);
  start.setMinutes(start.getMinutes() + startMinutes);
  const end = new Date(`${match.date}T00:00:00`);
  end.setMinutes(end.getMinutes() + (endMinutes !== null ? endMinutes : startMinutes + 45));
  return { start, end };
}

function matchLiveStatus(match) {
  if (isCompletedMatch(match)) return "final";
  const window = matchLiveWindow(match);
  if (!window) return "scheduled";
  const now = new Date();
  return now >= window.start && now <= window.end ? "live" : "scheduled";
}

function tickerSortMinutes(match) {
  const found = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(match.time || ""));
  if (!found) return Number.POSITIVE_INFINITY;
  let hours = Number(found[1]) % 12;
  if (/PM/i.test(found[3])) hours += 12;
  return hours * 60 + Number(found[2]);
}

function teamTickerAbbr(team, fallbackName) {
  return team?.shortName || team?.abbr || initials(team?.name || fallbackName || "TBD");
}

function renderTickerItem(data, match) {
  const teams = new Map((data.teams || []).map((team) => [team.id, team]));
  const home = teams.get(match.homeTeamId);
  const away = teams.get(match.awayTeamId);
  const status = matchLiveStatus(match);
  const statusText = status === "live" ? "LIVE" : status === "final" ? "FINAL" : escapeHTML(match.time || formatDateWithISO(match.date));

  if (match.activityTitle) {
    return `
      <a class="score-ticker-item activity" href="./matchday.html">
        <span class="score-ticker-status ${status}">${status === "live" ? `<span class="score-ticker-live-dot" aria-hidden="true"></span>LIVE` : statusText}</span>
        <span class="score-ticker-activity-name">${escapeHTML(match.activityTitle)}</span>
      </a>
    `;
  }

  return `
    <a class="score-ticker-item" href="./game.html?id=${encodeURIComponent(match.id || "")}&season=${encodeURIComponent(data.year || "")}">
      <span class="score-ticker-status ${status}">${status === "live" ? `<span class="score-ticker-live-dot" aria-hidden="true"></span>LIVE` : statusText}</span>
      <span class="score-ticker-matchup">
        <span class="score-ticker-team">
          <span class="score-ticker-abbr">${escapeHTML(teamTickerAbbr(home, match.homeTeamName))}</span>
          <strong>${escapeHTML(Number.isFinite(match.homeScore) ? match.homeScore : "-")}</strong>
        </span>
        <span class="score-ticker-team">
          <span class="score-ticker-abbr">${escapeHTML(teamTickerAbbr(away, match.awayTeamName))}</span>
          <strong>${escapeHTML(Number.isFinite(match.awayScore) ? match.awayScore : "-")}</strong>
        </span>
      </span>
      ${status !== "scheduled" ? `<span class="score-ticker-time">${escapeHTML(formatDateWithISO(match.date))}</span>` : ""}
    </a>
  `;
}

function renderScoreTicker(data) {
  const matches = (data.matches || []).filter((match) => match.stage === "regular" || match.stage === "playoffs" || match.stage === "exhibition");
  if (!matches.length) return "";

  const todayIso = new Date().toISOString().slice(0, 10);
  let tickerMatches = matches.filter((match) => match.date === todayIso);
  let tickerLabel = formatDate(todayIso);

  if (!tickerMatches.length) {
    const upcomingDates = [...new Set(matches.filter((match) => !isCompletedMatch(match) && match.date >= todayIso).map((match) => match.date))].sort();
    const nextDate = upcomingDates[0];
    if (nextDate) {
      tickerMatches = matches.filter((match) => match.date === nextDate);
      tickerLabel = formatDate(nextDate);
    } else {
      const pastDates = [...new Set(matches.filter((match) => isCompletedMatch(match)).map((match) => match.date))].sort();
      const lastDate = pastDates.at(-1);
      if (lastDate) {
        tickerMatches = matches.filter((match) => match.date === lastDate);
        tickerLabel = formatDate(lastDate);
      }
    }
  }

  if (!tickerMatches.length) return "";
  tickerMatches = [...tickerMatches].sort((a, b) => tickerSortMinutes(a) - tickerSortMinutes(b));
  const hasLive = tickerMatches.some((match) => matchLiveStatus(match) === "live");

  return `
    <section class="score-ticker-bar" aria-label="Live scores and upcoming games">
      <div class="score-ticker-label">
        ${hasLive ? `<span class="score-ticker-live-badge"><span class="score-ticker-live-dot" aria-hidden="true"></span>LIVE</span>` : `<span class="score-ticker-kicker">Scores</span>`}
        <span>${escapeHTML(tickerLabel)}</span>
      </div>
      <div class="score-ticker-track">
        ${tickerMatches.map((match) => renderTickerItem(data, match)).join("")}
      </div>
    </section>
  `;
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

function playerNameById(data, playerId) {
  return (data.players || []).find((player) => player.id === playerId)?.name || "";
}

function scorersSummary(data, match) {
  return (match.scorers || [])
    .map((scorer) => {
      const name = playerNameById(data, scorer.playerId) || scorer.name || "";
      const goals = Number(scorer.goals) || 1;
      return name ? `${name}${goals > 1 ? ` (${goals})` : ""}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

function resolvePlayoffTeam(data, placeholderName, playoffMatches) {
  const parsed = /^Winner (QF|SF)(\d)$/i.exec(String(placeholderName || "").trim());
  if (!parsed) return null;
  const roundLabel = parsed[1].toUpperCase() === "QF" ? "Quarterfinal" : "Semifinal";
  const source = playoffMatches.find((match) => match.label === `${roundLabel} ${parsed[2]}`);
  if (!source || !isCompletedMatch(source)) return null;
  const winnerId = winnerTeamId(source);
  if (!winnerId) return null;
  return (data.teams || []).find((team) => team.id === winnerId) || null;
}

function resolvedMatchTeams(data, match, playoffMatches) {
  const teams = new Map((data.teams || []).map((team) => [team.id, team]));
  const home = match.homeTeamId ? teams.get(match.homeTeamId) : resolvePlayoffTeam(data, match.homeTeamName, playoffMatches);
  const away = match.awayTeamId ? teams.get(match.awayTeamId) : resolvePlayoffTeam(data, match.awayTeamName, playoffMatches);
  return {
    homeName: home?.name || match.homeTeamName || "TBD",
    awayName: away?.name || match.awayTeamName || "TBD",
    homeId: home?.id || match.homeTeamId || "",
    awayId: away?.id || match.awayTeamId || "",
  };
}

function renderImportantNewsCard({ tag, tone, headline, detail, href }) {
  return `
    <a class="important-news-card ${escapeHTML(tone)}" href="${escapeHTML(href || "./matchday.html")}">
      <span class="important-news-tag ${escapeHTML(tone)}">${tone === "live" ? `<span class="score-ticker-live-dot" aria-hidden="true"></span>` : ""}${escapeHTML(tag)}</span>
      <strong>${escapeHTML(headline)}</strong>
      <p>${escapeHTML(detail)}</p>
    </a>
  `;
}

function renderImportantNews(data, newsData = {}) {
  const playoffMatches = (data.matches || []).filter((match) => match.stage === "playoffs" && !match.activityTitle);
  const items = [];

  if (playoffMatches.length) {
    const resolved = playoffMatches.map((match) => ({ match, ...resolvedMatchTeams(data, match, playoffMatches) }));
    const live = resolved.find(({ match }) => matchLiveStatus(match) === "live");
    const completed = resolved.filter(({ match }) => isCompletedMatch(match));
    const upcoming = resolved.filter(({ match }) => !isCompletedMatch(match) && matchLiveStatus(match) !== "live");

    if (live) {
      items.push({
        tag: "LIVE NOW",
        tone: "live",
        headline: `${live.homeName} vs ${live.awayName}`,
        detail: `${live.match.label} \u2014 ${live.match.time || "In progress"}`,
        href: live.homeId ? teamProfileHref(live.homeId, data.year) : "./matchday.html",
      });
    }

    const latestResult = completed.at(-1);
    if (latestResult) {
      const winnerId = winnerTeamId(latestResult.match);
      const winnerName = winnerId === latestResult.match.homeTeamId ? latestResult.homeName : latestResult.awayName;
      const scorers = scorersSummary(data, latestResult.match);
      items.push({
        tag: "FINAL",
        tone: "final",
        headline: winnerName ? `${winnerName} win ${latestResult.match.homeScore}-${latestResult.match.awayScore}` : `${latestResult.homeName} ${latestResult.match.homeScore}-${latestResult.match.awayScore} ${latestResult.awayName}`,
        detail: `${latestResult.match.label}${scorers ? ` \u2014 Goals: ${scorers}` : ""}`,
        href: winnerId ? teamProfileHref(winnerId, data.year) : "./matchday.html",
      });
    }

    const nextMatch = upcoming[0];
    if (nextMatch) {
      items.push({
        tag: live ? "UP NEXT" : "NEXT MATCHUP",
        tone: "next",
        headline: `${nextMatch.homeName} vs ${nextMatch.awayName}`,
        detail: `${nextMatch.match.label} \u2014 ${nextMatch.match.time || "Time TBA"}`,
        href: "./matchday.html",
      });
    }
  }

  const featured = (newsData.items || []).filter((item) => item.homeFeatured);
  if (featured.length) {
    const top = featured[0];
    items.push({
      tag: top.label || "League News",
      tone: "news",
      headline: top.label || "League News",
      detail: top.message || "",
      href: "./news.html",
    });
  }

  if (!items.length) return "";

  return `
    <section class="section-panel important-news-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Don't Miss This</span>
          <h2>🚨 Extremely Important News</h2>
          <p>Live scores, playoff matchups, and the latest league news, all in one place.</p>
        </div>
        <a class="text-link" href="./matchday.html">Matchday hub</a>
      </div>
      <div class="important-news-grid">
        ${items.map(renderImportantNewsCard).join("")}
      </div>
    </section>
  `;
}

function renderHomeContent(data, allData, teamOfWeek = {}, awardWatch = {}, newsData = {}) {
  const latest = getLatestCompletedMatches([data], 4).reverse();
  const upcoming = getUpcomingMatches([data], 4);
  const allChampions = getAwards(allData, { division: "Seniors" }).filter((award) => award.category === "Champion Team");

  return `
    ${renderScoreTicker(data)}

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

    ${renderImportantNews(data, newsData)}

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
  const newsData = await loadJSON("./data/news.json", { items: [] });
  let selectedSeason = SITE.defaultSeason;

  async function render() {
    const data = await loadSeasonData(selectedSeason);
    root.innerHTML = renderHomeContent(data, allData, teamOfWeekData, awardWatchData, newsData);
    hydrateHomeLeaders(allData);
  }

  render();
}

if ([...document.scripts].some((script) => script.src.includes("/js/main.js"))) {
  renderHome();
}
