import { NAV_LINKS, SITE } from "../js/config.js";
import { loadAllSeasons } from "../js/dataLoader.js";
import { computeCoachSummary, computeCombinedPlayerStats } from "../js/leagueEngine.js";
import { escapeHTML } from "../js/utils.js";

const MAIN_NAV_HREFS = new Set(["index.html", "news.html", "matchday.html", "standings.html", "matches.html", "teams.html", "tournament.html"]);

export function renderNavbar(activeHref = "") {
  const primary = NAV_LINKS.filter((link) => MAIN_NAV_HREFS.has(link.href));
  const secondary = NAV_LINKS.filter((link) => !MAIN_NAV_HREFS.has(link.href));
  const isActive = (href) => href === activeHref || (activeHref === "" && href === "index.html");
  const renderLink = (link) => {
    const featureClass = link.href === "tournament.html" ? " nav-link-imt" : "";
    return `<a class="nav-link${featureClass}${isActive(link.href) ? " active" : ""}" href="./${link.href}">${escapeHTML(link.label)}</a>`;
  };

  return `
    <header class="site-header">
      <div class="nav-inner">
        <a class="brand-link" href="./index.html" aria-label="Lantern Soccer League home">
          <img src="${SITE.logo}" alt="Lantern Soccer League logo">
          <span class="brand-text">
            <strong>${escapeHTML(SITE.name)}</strong>
            <small>Scores, standings, teams</small>
          </span>
        </a>
        <div class="site-search" role="search">
          <label class="site-search-label" for="site-search-input">Search LSL</label>
          <input id="site-search-input" type="search" autocomplete="off" placeholder="Search players, teams, coaches...">
          <div id="site-search-results" class="site-search-results" hidden></div>
        </div>
        <button class="nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false">Menu</button>
        <nav class="nav-links" aria-label="Primary navigation">
          <div class="nav-group">
            <span class="nav-group-label">Main</span>
            ${primary.map(renderLink).join("")}
          </div>
          <div class="nav-group">
            <span class="nav-group-label">More</span>
            <div class="nav-dropdown">
              <button class="nav-dropdown-button nav-more-button${secondary.some((link) => isActive(link.href)) ? " active" : ""}" type="button" aria-label="More navigation" aria-expanded="false">
                <span class="more-label">More</span>
              </button>
              <div class="nav-dropdown-menu" hidden>
                ${secondary
                  .map(
                    (link) =>
                      `<a class="${isActive(link.href) ? "active" : ""}" href="./${link.href}">${escapeHTML(link.label)}</a>`
                  )
                  .join("")}
              </div>
            </div>
          </div>
        </nav>
      </div>
    </header>
  `;
}

function buildSearchIndex(seasons) {
  const pages = NAV_LINKS.map((link) => ({
    type: "Page",
    title: link.label,
    subtitle: "Website section",
    href: `./${link.href}`,
  }));

  const players = computeCombinedPlayerStats(seasons).map((player) => ({
    type: "Player",
    title: player.name,
    subtitle: `${player.division || "Division TBA"} | ${player.position || "Field"}`,
    href: `./player.html?id=${player.id}`,
  }));

  const coaches = computeCoachSummary(seasons).map((coach) => ({
    type: "Coach",
    title: coach.name,
    subtitle: `${coach.division || "Seniors"} | Coach`,
    href: `./coach.html?id=${coach.id}`,
  }));

  const teamMap = new Map();
  seasons.forEach((season) => {
    (season.teams || []).forEach((team) => {
      const key = `${team.id}-${season.year}`;
      teamMap.set(key, {
        type: "Team",
        title: team.name,
        subtitle: `${season.year} | ${team.division}`,
        href: `./team.html?season=${encodeURIComponent(season.year)}&id=${encodeURIComponent(team.id)}`,
      });
    });
  });

  return [...pages, ...players, ...coaches, ...teamMap.values()];
}

function renderSearchResults(items, query) {
  if (!query.trim()) {
    return `<div class="site-search-empty">Start typing to search LSL.</div>`;
  }

  if (!items.length) {
    return `<div class="site-search-empty">No results found.</div>`;
  }

  return items
    .slice(0, 8)
    .map(
      (item) => `
        <a class="site-search-result" href="${escapeHTML(item.href)}">
          <span class="pill">${escapeHTML(item.type)}</span>
          <strong>${escapeHTML(item.title)}</strong>
          <small>${escapeHTML(item.subtitle)}</small>
        </a>
      `
    )
    .join("");
}

export function hydrateNavbar() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  const moreButton = document.querySelector(".nav-dropdown-button");
  const menu = document.querySelector(".nav-dropdown-menu");
  const searchInput = document.getElementById("site-search-input");
  const searchResults = document.getElementById("site-search-results");
  let searchIndex = [];

  toggle?.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  moreButton?.addEventListener("click", () => {
    const isOpen = menu.hasAttribute("hidden");
    menu.toggleAttribute("hidden", !isOpen);
    moreButton.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-dropdown")) {
      menu?.setAttribute("hidden", "");
      moreButton?.setAttribute("aria-expanded", "false");
    }
  });

  if (searchInput && searchResults) {
    searchResults.innerHTML = `<div class="site-search-empty">Loading search...</div>`;
    loadAllSeasons().then((seasons) => {
      searchIndex = buildSearchIndex(seasons);
      if (!searchResults.hidden && searchInput.value.trim()) {
        const query = searchInput.value.trim().toLowerCase();
        const matches = searchIndex.filter((item) => `${item.type} ${item.title} ${item.subtitle}`.toLowerCase().includes(query));
        searchResults.innerHTML = renderSearchResults(matches, query);
      }
    });

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();
      const matches = searchIndex.filter((item) => `${item.type} ${item.title} ${item.subtitle}`.toLowerCase().includes(query));
      searchResults.innerHTML = renderSearchResults(matches, query);
      searchResults.hidden = false;
    });

    searchInput.addEventListener("focus", () => {
      searchResults.innerHTML = renderSearchResults([], searchInput.value);
      searchResults.hidden = false;
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        searchResults.hidden = true;
        searchInput.blur();
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-search")) {
      searchResults?.setAttribute("hidden", "");
    }
  });
}
