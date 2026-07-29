import { SITE } from "./config.js";
import { loadAllSeasons } from "./dataLoader.js";
import { getAwards } from "./leagueEngine.js?v=3.2";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("awards.html");
setDocumentTitle("Awards");

const root = document.getElementById("page-root");
const awardTabs = ["All", "Champions", "Player Awards", "Team Awards", "Pending"];
let state = { season: "All", division: "All", tab: "All", search: "" };

function isPendingAward(award) {
  if (String(award.status || "").toLowerCase() === "pending") return true;
  return /not listed|not announced|to be announced|pending|\btba\b/i.test(award.winner || "");
}

function awardStatus(award) {
  return isPendingAward(award) ? "Pending" : "Confirmed";
}

function isTeamAward(award) {
  return /team/i.test(award.category || "");
}

function isPlayerAward(award) {
  return !isTeamAward(award);
}

function awardType(award) {
  if (award.category === "Champion Team") return "champion";
  if (award.category === "MVP") return "mvp";
  if (award.category === "Golden Boot") return "golden-boot";
  if (["2nd Place Team", "3rd Place Team"].includes(award.category)) return "podium";
  return isTeamAward(award) ? "team" : "player";
}

function awardIcon(award) {
  return {
    champion: "🏆",
    mvp: "⭐",
    "golden-boot": "⚽",
    podium: "🥉",
    team: "🏅",
    player: "⭐",
  }[awardType(award)] || "🏅";
}

function awardMatchesTab(award) {
  if (state.tab === "Champions") return award.category === "Champion Team";
  if (state.tab === "Player Awards") return isPlayerAward(award);
  if (state.tab === "Team Awards") return isTeamAward(award);
  if (state.tab === "Pending") return isPendingAward(award);
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
  const confirmed = awards.filter((award) => !isPendingAward(award)).length;
  const pending = awards.length - confirmed;
  const champions = awards.filter((award) => award.category === "Champion Team" && !isPendingAward(award)).length;
  const playerHonors = awards.filter(isPlayerAward).length;
  const teamHonors = awards.filter(isTeamAward).length;

  return `
    <div class="awards-summary-grid">
      ${summaryTile("🏅", "Total Awards", awards.length, "matching selections")}
      ${summaryTile("✓", "Confirmed", confirmed, "winners announced")}
      ${summaryTile("🏆", "Champions", champions, "confirmed titles")}
      ${summaryTile("⏳", "Pending", pending, "awaiting announcement")}
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
                    <article class="award-latest-item${isPendingAward(award) ? " pending" : ""}">
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

function renderTabs(awards) {
  return `
    <div class="award-tabs" role="group" aria-label="Award type filters">
      ${awardTabs
        .map((tab) => {
          const count = awards.filter((award) => {
            if (tab === "Champions") return award.category === "Champion Team";
            if (tab === "Player Awards") return isPlayerAward(award);
            if (tab === "Team Awards") return isTeamAward(award);
            if (tab === "Pending") return isPendingAward(award);
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

function renderChampionStrip(awards) {
  const champions = awards.filter((award) => award.category === "Champion Team");
  if (!champions.length) return "";

  return `
    <section class="section-panel awards-champions-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Champions</span>
          <h2>Champion Teams</h2>
          <p>League title winners appear before every other season honor.</p>
        </div>
      </div>
      <div class="awards-champion-grid">
        ${champions
          .map((award) => {
            const pending = isPendingAward(award);
            return `
              <article class="card award-champion-card${pending ? " pending" : ""}">
                <div class="award-champion-topline">
                  <span class="award-champion-trophy" aria-hidden="true">🏆</span>
                  <span class="award-status-badge ${pending ? "pending" : "confirmed"}">${escapeHTML(awardStatus(award))}</span>
                </div>
                <div class="award-champion-badges">
                  <span>${escapeHTML(award.season)}</span>
                  <span>${escapeHTML(award.division || "All Divisions")}</span>
                </div>
                <span class="award-title">Champion Team</span>
                <h3>${winnerMarkup(award, "award-winner-link")}</h3>
                <p class="source-note">${escapeHTML(cleanSourceNote(award.sourceNote))}</p>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderAwardCard(award) {
  const pending = isPendingAward(award);
  const type = awardType(award);
  return `
    <article class="card award-card ${type}${pending ? " pending" : ""}">
      <div class="award-card-top">
        <span class="award-card-icon" aria-hidden="true">${awardIcon(award)}</span>
        <span class="award-status-badge ${pending ? "pending" : "confirmed"}">${escapeHTML(awardStatus(award))}</span>
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
    "2nd Place Team": 2,
    "3rd Place Team": 3,
    "Best Regular Season Team": 4,
    MVP: 5,
    "Golden Boot": 6,
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
          <p>${awards.length} non-championship honors match the current selections.</p>
        </div>
      </div>
      <div class="award-season-list">
        ${[...groups.entries()]
          .map(([season, seasonAwards], index) => {
            const confirmed = seasonAwards.filter((award) => !isPendingAward(award)).length;
            const pending = seasonAwards.length - confirmed;
            return `
              <details class="award-season-section"${index === 0 ? " open" : ""}>
                <summary class="award-season-head">
                  <div>
                    <span class="eyebrow">Season</span>
                    <h3>${escapeHTML(season)} Awards</h3>
                  </div>
                  <div class="award-season-counts">
                    <span class="award-status-badge confirmed">${confirmed} confirmed</span>
                    ${pending ? `<span class="award-status-badge pending">${pending} pending</span>` : ""}
                    <span class="award-season-total">${seasonAwards.length} ${seasonAwards.length === 1 ? "award" : "awards"}</span>
                  </div>
                </summary>
                <div class="award-season-grid">
                  ${seasonAwards.map(renderAwardCard).join("")}
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
          <span>Season</span><span>Division</span><span>Winner</span><span>Category</span>
        </div>
        <div class="award-history-list">
          ${rows
            .map(
              (award) => `
                <div class="award-history-row${isPendingAward(award) ? " pending" : ""}">
                  <span data-label="Season">${escapeHTML(award.season)}</span>
                  <span data-label="Division">${escapeHTML(award.division || "All Divisions")}</span>
                  <strong data-label="Winner">${winnerMarkup(award, "award-winner-link")}</strong>
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
  if (!champions.length && !mvps.length && !goldenBoots.length) return "";

  return `
    <section class="section-panel awards-history-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">History</span>
          <h2>Award History</h2>
          <p>Champions, MVPs, and Golden Boots organized by season and division.</p>
        </div>
      </div>
      <div class="award-history-groups">
        ${renderHistoryGroup("Champions by Year", "🏆", champions)}
        ${renderHistoryGroup("MVPs by Year", "⭐", mvps)}
        ${renderHistoryGroup("Golden Boots by Year", "⚽", goldenBoots)}
      </div>
    </section>
  `;
}

function filteredAwards(allData) {
  return getAwards(allData, state).filter(awardMatchesTab).filter(awardMatchesSearch);
}

function render(allData, focusSearch = false) {
  const selectedSeasons = state.season === "All" ? allData : allData.filter((season) => season.year === state.season);
  const divisions = [...new Set(selectedSeasons.flatMap((season) => (season.awards?.awards || []).map((award) => award.division)).filter(Boolean))];
  const divisionOptions = [{ value: "All", label: "All" }, ...divisions.map((division) => ({ value: division, label: division }))];
  if (!divisionOptions.some((option) => option.value === state.division)) state.division = "All";

  const scopedAwards = getAwards(allData, { season: state.season, division: state.division });
  const awards = filteredAwards(allData);
  const champions = awards.filter((award) => award.category === "Champion Team");
  const otherAwards = awards.filter((award) => award.category !== "Champion Team");

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
          ${renderChampionStrip(champions)}
          ${renderAwardHistory(awards)}
          ${renderAwardSeasonGroups(otherAwards)}
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
    const allData = await loadAllSeasons();
    render(allData);
  } catch (error) {
    console.error("Could not load awards", error);
    root.innerHTML = `<section class="section-panel">${statusMessage("error", "Awards are coming soon. Please check back later.")}</section>`;
  }
}

init();
