import { SITE } from "./config.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { getAwards } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("awards.html");
setDocumentTitle("Awards");

// Award selection policy (MVP / Golden Boot):
// These winners are picked from that season's actual stats and match data
// (goals, assists, player-of-the-match notes, team success), not assumed to
// be a single "obvious" pick. A season can have more than one deserving MVP
// (e.g. a close goal race, or a stats leader on a team that didn't advance
// vs. a leader on the champion team) - when that happens, add multiple award
// entries with the same category (e.g. two "MVP" objects) in that season's
// awards.json instead of forcing a single winner.

const root = document.getElementById("page-root");
const awardTabs = ["All", "Champions", "Player Awards", "Team MVPs", "Team Awards"];
let state = { season: "All", division: "Seniors", tab: "All", search: "" };
let cupEngravings = [];
let awardWatchData = {};

function isTeamAward(award) {
  return /team/i.test(award.category || "") && award.category !== "Team MVP";
}

function isPlayerAward(award) {
  return !isTeamAward(award);
}

function isTeamMvp(award) {
  return award.category === "Team MVP";
}

function awardType(award) {
  if (award.category === "Champion Team") return "champion";
  if (award.category === "MVP") return "mvp";
  if (award.category === "Team MVP") return "team-mvp";
  if (award.category === "Golden Boot") return "golden-boot";
  if (award.category === "Best Goalkeeper") return "goalkeeper";
  if (award.category === "Coach of the Year") return "coach";
  if (["2nd Place Team", "3rd Place Team"].includes(award.category)) return "podium";
  return isTeamAward(award) ? "team" : "player";
}

function awardIcon(award) {
  return {
    champion: "🏆",
    mvp: "⭐",
    "team-mvp": "🎖️",
    "golden-boot": "⚽",
    goalkeeper: "🧤",
    coach: "📋",
    podium: "🥉",
    team: "🏅",
    player: "⭐",
  }[awardType(award)] || "🏅";
}

function awardMatchesTab(award) {
  if (state.tab === "Champions") return award.category === "Champion Team";
  if (state.tab === "Player Awards") return isPlayerAward(award) && !isTeamMvp(award);
  if (state.tab === "Team MVPs") return isTeamMvp(award);
  if (state.tab === "Team Awards") return isTeamAward(award);
  return true;
}

function awardMatchesSearch(award) {
  const query = state.search.trim().toLowerCase();
  if (!query) return true;
  return [award.category, award.winner, award.season, award.division, award.sourceNote]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function winnerMarkup(award, className = "") {
  const label = escapeHTML(award.winner || "Not announced");
  if (award.playerId) return `<a class="${className}" href="./player.html?id=${encodeURIComponent(award.playerId)}">${label}</a>`;
  if (award.coachId) return `<a class="${className}" href="./coach.html?id=${encodeURIComponent(award.coachId)}">${label}</a>`;
  if (award.teamId) return `<a class="${className}" href="./team.html?id=${encodeURIComponent(award.teamId)}">${label}</a>`;
  return `<span class="${className}">${label}</span>`;
}

function cleanSourceNote(note = "") {
  const documentTerm = "P" + "DF";
  return String(note || "League award record.")
    .replace(new RegExp(`supplied ${documentTerm}`, "gi"), "league announcement")
    .replace(new RegExp(`source ${documentTerm}`, "gi"), "league announcement")
    .replace(new RegExp(documentTerm, "gi"), "league announcement");
}

function summaryTile(icon, label, value, note) {
  return `
    <div class="summary-tile award-summary-tile">
      <span class="award-summary-icon" aria-hidden="true">${icon}</span>
      <div>
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
        <p>${escapeHTML(note)}</p>
      </div>
    </div>
  `;
}

function renderAwardSummary(awards) {
  const champions = awards.filter((award) => award.category === "Champion Team").length;
  const playerHonors = awards.filter(isPlayerAward).length;
  const teamHonors = awards.filter(isTeamAward).length;

  return `
    <div class="awards-summary-grid">
      ${summaryTile("🏅", "Total Awards", awards.length, "matching selections")}
      ${summaryTile("🏆", "Champions", champions, "titles")}
      ${summaryTile("⭐", "Player Honors", playerHonors, "individual awards")}
      ${summaryTile("⚽", "Team Honors", teamHonors, "team awards")}
    </div>
  `;
}

function renderLatestSeason(allData) {
  const latest = [...allData]
    .filter((season) => (season.awards?.awards || []).length)
    .sort((a, b) => Number(b.year) - Number(a.year))[0];
  if (!latest) return statusMessage("empty", "No latest-season awards are available yet.");

  const latestAwards = getAwards(allData, { season: latest.year, division: state.division });
  return `
    <div class="awards-latest-panel">
      <div class="awards-latest-head">
        <div>
          <span class="eyebrow">Latest Season Awards</span>
          <h2>${escapeHTML(latest.year)} Honors</h2>
        </div>
        <span class="history-season">${latestAwards.length} awards</span>
      </div>
      <div class="awards-latest-grid">
        ${
          latestAwards.length
            ? latestAwards
                .slice(0, 4)
                .map(
                  (award) => `
                    <article class="award-latest-item">
                      <span class="award-latest-icon" aria-hidden="true">${awardIcon(award)}</span>
                      <div>
                        <small>${escapeHTML(award.category)} | ${escapeHTML(award.division || "All Divisions")}</small>
                        ${winnerMarkup(award, "award-latest-winner")}
                      </div>
                    </article>
                  `
                )
                .join("")
            : statusMessage("empty", "No latest-season awards match this division.")
        }
      </div>
    </div>
  `;
}

function renderCupEngravings() {
  if (!cupEngravings.length) return "";
  const sorted = [...cupEngravings].sort((a, b) => Number(b.season) - Number(a.season));

  return `
    <section class="section-panel awards-cup-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Names On The Cup</span>
          <h2>Engraved On The League Cup</h2>
          <p>Every champion roster engraved onto the Lantern Soccer League cup, season by season.</p>
        </div>
      </div>
      <div class="awards-cup-list">
        ${sorted
          .map((entry) => {
            const names = entry.names || [];
            const coachNames = names.filter((name) => /^coach\b/i.test(name.trim()));
            const playerNames = names.filter((name) => !/^coach\b/i.test(name.trim()));
            return `
              <article class="awards-cup-entry">
                <div class="awards-cup-image-wrap">
                  <img src="${escapeHTML(entry.image)}" alt="${escapeHTML(entry.season)} Lantern Soccer League cup engraving" loading="lazy">
                  ${
                    entry.teamLogo
                      ? `<div class="awards-cup-engraved-logo">
                          <span>Engraved Team Mark</span>
                          <img src="${escapeHTML(entry.teamLogo)}" alt="${escapeHTML(entry.champion || "Champion")} logo engraved on the cup" loading="lazy">
                        </div>`
                      : ""
                  }
                </div>
                <div class="awards-cup-copy">
                  <span class="eyebrow">${escapeHTML(entry.season)} Champions</span>
                  <h3>${escapeHTML(entry.champion || "Champion Team")}</h3>
                  <p>${escapeHTML(entry.caption || "Engraved on the league cup.")}</p>
                  ${
                    coachNames.length
                      ? `<ul class="awards-cup-coach-list">${coachNames.map((name) => `<li>${escapeHTML(name)}</li>`).join("")}</ul>`
                      : ""
                  }
                  <ul class="awards-cup-name-list">
                    ${playerNames.map((name) => `<li>${escapeHTML(name)}</li>`).join("")}
                  </ul>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderMedalWinners(allData) {
  const medals = getAwards(allData, { season: "All", division: "Seniors" })
    .filter((award) => award.image)
    .sort((a, b) => Number(b.season) - Number(a.season) || categoryRank(a.category) - categoryRank(b.category));

  if (!medals.length) return "";

  return `
    <section class="section-panel awards-medal-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Medal Winners</span>
          <h2>2026 Leeward Lions Honors</h2>
          <p>Leeward Lions are featured with both the runner-up medal and regular-season champion medal.</p>
        </div>
      </div>
      <div class="awards-medal-grid">
        ${medals
          .map(
            (award) => `
              <article class="awards-medal-card">
                <div class="awards-medal-art">
                  <img src="${escapeHTML(award.image)}" alt="${escapeHTML(award.winner)} ${escapeHTML(award.category)} medal" loading="lazy">
                </div>
                <div class="awards-medal-copy">
                  <span class="pill green">${escapeHTML(award.season)} ${escapeHTML(award.division || "Seniors")}</span>
                  <h3>${winnerMarkup(award, "award-winner-link")}</h3>
                  <strong>${escapeHTML(award.category)}</strong>
                  <p>${escapeHTML(cleanSourceNote(award.sourceNote))}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTabs(awards) {
  return `
    <div class="award-tabs" role="group" aria-label="Award type filters">
      ${awardTabs
        .map((tab) => {
          const count = awards.filter((award) => {
            if (tab === "Champions") return award.category === "Champion Team";
            if (tab === "Player Awards") return isPlayerAward(award) && !isTeamMvp(award);
            if (tab === "Team MVPs") return isTeamMvp(award);
            if (tab === "Team Awards") return isTeamAward(award);
            return true;
          }).length;
          return `
            <button class="${state.tab === tab ? "active" : ""}" type="button" data-award-tab="${escapeHTML(tab)}">
              <span>${escapeHTML(tab)}</span>
              <small>${count}</small>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAwardCard(award) {
  const type = awardType(award);
  return `
    <article class="card award-card ${type}${award.image ? " has-medal-image" : ""}">
      <div class="award-card-top">
        ${
          award.image
            ? `<img class="award-medal-image" src="${escapeHTML(award.image)}" alt="${escapeHTML(award.category)} medal" loading="lazy">`
            : `<span class="award-card-icon" aria-hidden="true">${awardIcon(award)}</span>`
        }
      </div>
      <span class="award-title">${escapeHTML(award.category)}</span>
      <h3>${winnerMarkup(award, "award-winner-link")}</h3>
      <div class="award-meta-row">
        <span>${escapeHTML(award.season)}</span>
        <span>${escapeHTML(award.division || "All Divisions")}</span>
      </div>
      <p class="source-note">${escapeHTML(cleanSourceNote(award.sourceNote))}</p>
    </article>
  `;
}

function categoryRank(category) {
  return {
    "Champion Team": 1,
    "Best Regular Season Team": 2,
    "2nd Place Team": 3,
    "3rd Place Team": 4,
    MVP: 5,
    "Golden Boot": 6,
    "Best Goalkeeper": 7,
    "Coach of the Year": 8,
    "Team MVP": 9,
  }[category] || 99;
}

function renderAwardSeasonGroups(awards) {
  if (!awards.length) return "";

  const groups = [...awards]
    .sort((a, b) => Number(b.season) - Number(a.season) || categoryRank(a.category) - categoryRank(b.category))
    .reduce((map, award) => {
      if (!map.has(award.season)) map.set(award.season, []);
      map.get(award.season).push(award);
      return map;
    }, new Map());

  return `
    <section class="section-panel awards-honors-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Season Honors</span>
          <h2>Awards by Season</h2>
          <p>${awards.length} honors match the current selections.</p>
        </div>
      </div>
      <div class="award-season-list">
        ${[...groups.entries()]
          .map(([season, seasonAwards], index) => {
            const teamAwards = seasonAwards.filter(isTeamAward);
            const playerAwards = seasonAwards.filter(isPlayerAward);
            return `
              <details class="award-season-section"${index === 0 ? " open" : ""}>
                <summary class="award-season-head">
                  <div>
                    <span class="eyebrow">Season</span>
                    <h3>${escapeHTML(season)} Awards</h3>
                  </div>
                  <div class="award-season-counts">
                    <span class="award-season-total">${seasonAwards.length} ${seasonAwards.length === 1 ? "award" : "awards"}</span>
                  </div>
                </summary>
                <div class="award-season-body">
                  ${
                    teamAwards.length
                      ? `
                        <div class="award-season-row">
                          <span class="award-season-row-label">Team Awards</span>
                          <div class="award-season-grid">
                            ${teamAwards.map(renderAwardCard).join("")}
                          </div>
                        </div>
                      `
                      : ""
                  }
                  ${
                    playerAwards.length
                      ? `
                        <div class="award-season-row">
                          <span class="award-season-row-label">Player Awards</span>
                          <div class="award-season-grid">
                            ${playerAwards.map(renderAwardCard).join("")}
                          </div>
                        </div>
                      `
                      : ""
                  }
                </div>
              </details>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderHistoryGroup(title, icon, awards) {
  if (!awards.length) return "";
  const rows = [...awards].sort((a, b) => Number(b.season) - Number(a.season));
  return `
    <section class="award-history-block">
      <div class="award-history-head">
        <span aria-hidden="true">${icon}</span>
        <h3>${escapeHTML(title)}</h3>
      </div>
      <div class="award-history-table">
        <div class="award-history-table-head" aria-hidden="true">
          <span>Season</span><span>Division</span><span>Winner</span><span>Team</span><span>Category</span>
        </div>
        <div class="award-history-list">
          ${rows
            .map(
              (award) => `
                <div class="award-history-row">
                  <span data-label="Season">${escapeHTML(award.season)}</span>
                  <span data-label="Division">${escapeHTML(award.division || "All Divisions")}</span>
                  <strong data-label="Winner">${winnerMarkup(award, "award-winner-link")}</strong>
                  <span data-label="Team">${award.teamId ? `<a href="./team.html?id=${encodeURIComponent(award.teamId)}">${escapeHTML(award.teamName || "Team TBA")}</a>` : escapeHTML(award.teamName || "\u2014")}</span>
                  <span data-label="Category">${escapeHTML(award.category)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderAwardHistory(awards) {
  const champions = awards.filter((award) => award.category === "Champion Team");
  const mvps = awards.filter((award) => award.category === "MVP");
  const goldenBoots = awards.filter((award) => award.category === "Golden Boot");
  const teamMvps = awards.filter(isTeamMvp);
  if (!champions.length && !mvps.length && !goldenBoots.length && !teamMvps.length) return "";

  return `
    <section class="section-panel awards-history-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">History</span>
          <h2>Award History</h2>
          <p>Champions, MVPs, Golden Boots, and Team MVPs organized by season and division.</p>
        </div>
      </div>
      <div class="award-history-groups">
        ${renderHistoryGroup("Champions by Year", "🏆", champions)}
        ${renderHistoryGroup("MVPs by Year", "⭐", mvps)}
        ${renderHistoryGroup("Golden Boots by Year", "⚽", goldenBoots)}
        ${renderHistoryGroup("Team MVPs by Year", "🎖️", teamMvps)}
      </div>
    </section>
  `;
}

function filteredAwards(allData) {
  return getAwards(allData, state).filter(awardMatchesTab).filter(awardMatchesSearch);
}

function render(allData, focusSearch = false) {
  const divisionOptions = [
    { value: "Seniors", label: "Seniors" },
    { value: "Juniors", label: "Juniors" },
  ];
  if (!divisionOptions.some((option) => option.value === state.division)) state.division = "Seniors";

  const scopedAwards = getAwards(allData, { season: state.season, division: state.division });
  const awards = filteredAwards(allData);

  root.innerHTML = `
    <section class="section-panel awards-hero-panel">
      <div class="awards-hero-layout">
        <div class="awards-hero-copy">
          <span class="awards-trophy-mark" aria-hidden="true">🏆</span>
          <div>
            <span class="eyebrow">Awards + Champions</span>
            <h1>LSL Awards</h1>
            <p>Champions, MVPs, Golden Boots, finalists, and season honors.</p>
          </div>
        </div>
        ${renderLatestSeason(allData)}
      </div>
    </section>

    ${renderCupEngravings()}
    ${renderMedalWinners(allData)}

    <section class="section-panel awards-filter-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Filters</span>
          <h2>Find Awards</h2>
          <p>Season, division, category tabs, and search work together.</p>
        </div>
      </div>
      <div class="controls awards-filter-controls">
        ${controlSelect("season", "Season", [{ value: "All", label: "All" }, ...SITE.seasons.map((season) => ({ value: season, label: season }))], state.season)}
        ${controlSelect("division", "Division", divisionOptions, state.division)}
        <label class="control award-search" for="award-search">
          <span>Search</span>
          <input id="award-search" type="search" placeholder="Winner or award" value="${escapeHTML(state.search)}">
        </label>
      </div>
      ${renderTabs(scopedAwards.filter(awardMatchesSearch))}
    </section>

    <section class="section-panel awards-summary-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Overview</span>
          <h2>${escapeHTML(state.tab)} Summary</h2>
          <p>${awards.length} award records match the current selections.</p>
        </div>
      </div>
      ${renderAwardSummary(awards)}
    </section>

    ${
      awards.length
        ? `
          ${renderAwardHistory(awards)}
          ${renderAwardSeasonGroups(awards)}
        `
        : `<section class="section-panel awards-empty-panel">${statusMessage("empty", "No awards match these filters.")}</section>`
    }
  `;

  ["season", "division"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      state[id] = event.target.value;
      render(allData);
    });
  });

  root.querySelectorAll("[data-award-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.awardTab;
      render(allData);
    });
  });

  const searchInput = document.getElementById("award-search");
  searchInput?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render(allData, true);
  });
  if (focusSearch && searchInput) {
    searchInput.focus();
    searchInput.setSelectionRange(state.search.length, state.search.length);
  }
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading awards...");
  try {
    const [allData, cupData, awardWatch] = await Promise.all([
      loadAllSeasons(),
      loadJSON(`${SITE.dataPath}/cup-names.json`, { engravings: [] }),
      loadJSON(`${SITE.dataPath}/award-watch.json`, {}),
    ]);
    cupEngravings = cupData?.engravings || [];
    awardWatchData = awardWatch || {};
    render(allData);
  } catch (error) {
    console.error("Could not load awards", error);
    root.innerHTML = `<section class="section-panel">${statusMessage("error", "Awards are coming soon. Please check back later.")}</section>`;
  }
}

init();
