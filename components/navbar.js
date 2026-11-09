import { NAV_LINKS, SITE } from "../js/config.js";
import { loadAllSeasons } from "../js/dataLoader.js?v=20261108-data3";
import { computeCoachSummary, computeCombinedPlayerStats, regularSeasonGameLabel } from "../js/leagueEngine.js";
import { escapeHTML } from "../js/utils.js";

const MAIN_NAV_HREFS = new Set(["index.html", "news.html", "lsl-pulse.html", "free-agents.html", "season-recap.html", "all-time.html", "tournament.html"]);

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
          <input id="site-search-input" type="search" autocomplete="off" placeholder="Search players, teams, matches..." role="combobox" aria-autocomplete="list" aria-controls="site-search-results" aria-expanded="false">
          <div id="site-search-results" class="site-search-results" role="listbox" aria-label="Search results" hidden></div>
        </div>
        <button class="nav-toggle" type="button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded="false">Menu</button>
        <nav id="primary-navigation" class="nav-links" aria-label="Primary navigation">
          <div class="nav-group">
            <span class="nav-group-label">Main</span>
            ${primary.map(renderLink).join("")}
          </div>
          <div class="nav-group">
            <span class="nav-group-label">More</span>
            <div class="nav-dropdown">
              <button id="nav-more-button" class="nav-dropdown-button nav-more-button${secondary.some((link) => isActive(link.href)) ? " active" : ""}" type="button" aria-label="Open more navigation" aria-controls="nav-more-menu" aria-haspopup="true" aria-expanded="false">
                <span class="more-label">More</span>
              </button>
              <div id="nav-more-menu" class="nav-dropdown-menu" hidden>
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

  const matches = seasons.flatMap((season) => (season.matches || []).filter((match) => match.id).map((match) => ({
    type: "Match",
    title: `${match.homeTeamName || match.homeTeamId || "Team TBA"} vs ${match.awayTeamName || match.awayTeamId || "Team TBA"}`,
    subtitle: `${season.year} | ${match.division || "Seniors"} | ${regularSeasonGameLabel(season.matches, match)} | ${match.date || match.weekLabel || "Date TBA"}`,
    href: `./game.html?season=${encodeURIComponent(season.year)}&id=${encodeURIComponent(match.id || "")}`,
  })));
  const tournaments = seasons.flatMap((season) => {
    const event = season.tournament?.event;
    return event?.name ? [{
      type: "Tournament",
      title: `${season.year} ${event.name}`,
      subtitle: event.date || event.dates || event.currentStatus || "Tournament information",
      href: "./tournament.html",
    }] : [];
  });
  const records = [
    { title: "Player Records", subtitle: "Goals, games, and individual milestones" },
    { title: "Team Records", subtitle: "Standings, results, and team milestones" },
    { title: "Coach Records", subtitle: "Coaching history and achievements" },
    { title: "LSL Cup Records", subtitle: "Cup winners and championship history" },
  ].map((record) => ({ ...record, type: "Record", href: "./records.html" }));

  return [...pages, ...players, ...coaches, ...teamMap.values(), ...matches, ...tournaments, ...records];
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
        <a class="site-search-result" href="${escapeHTML(item.href)}" role="option" aria-selected="false" tabindex="-1">
          <span class="pill">${escapeHTML(item.type)}</span>
          <strong>${escapeHTML(item.title)}</strong>
          <small>${escapeHTML(item.subtitle)}</small>
        </a>
      `
    )
    .join("");
}

function initStickyHeaderFade() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const FADE_DISTANCE = 140; // px of scroll over which the header fades from transparent to solid
  let ticking = false;

  const applyOpacity = () => {
    const opacity = Math.max(0, Math.min(1, window.scrollY / FADE_DISTANCE));
    header.style.setProperty("--nav-opacity", opacity.toFixed(3));
    ticking = false;
  };

  applyOpacity();
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(applyOpacity);
    },
    { passive: true }
  );
}

export function hydrateNavbar() {
  initStickyHeaderFade();

  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  const moreButton = document.querySelector(".nav-dropdown-button");
  const menu = document.querySelector(".nav-dropdown-menu");
  const searchInput = document.getElementById("site-search-input");
  const searchResults = document.getElementById("site-search-results");
  let searchIndex = [];
  let searchIndexReady = false;
  let searchIndexRequest = null;

  const closeNavigation = (returnFocus = false) => {
    links?.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.setAttribute("aria-label", "Open navigation");
    if (returnFocus) toggle?.focus();
  };

  const closeMoreMenu = (returnFocus = false) => {
    menu?.setAttribute("hidden", "");
    moreButton?.setAttribute("aria-expanded", "false");
    moreButton?.setAttribute("aria-label", "Open more navigation");
    if (returnFocus) moreButton?.focus();
  };

  const setSearchOpen = (open) => {
    if (!searchResults || !searchInput) return;
    searchResults.hidden = !open;
    searchInput.setAttribute("aria-expanded", String(open));
  };

  toggle?.addEventListener("click", () => {
    const isOpen = links?.classList.toggle("open") || false;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  moreButton?.addEventListener("click", () => {
    const isOpen = menu?.hasAttribute("hidden") || false;
    menu?.toggleAttribute("hidden", !isOpen);
    moreButton.setAttribute("aria-expanded", String(isOpen));
    moreButton.setAttribute("aria-label", isOpen ? "Close more navigation" : "Open more navigation");
    if (isOpen && window.matchMedia("(max-width: 1040px)").matches) {
      menu?.querySelector("a")?.focus();
    }
  });

  const renderCurrentSearch = () => {
    const query = searchInput?.value.trim().toLowerCase() || "";
    const matches = searchIndex.filter((item) => `${item.type} ${item.title} ${item.subtitle}`.toLowerCase().includes(query));
    if (searchResults) searchResults.innerHTML = renderSearchResults(matches, query);
  };

  const loadSearchIndex = () => {
    if (searchIndexReady || searchIndexRequest) return searchIndexRequest;
    if (searchResults) {
      searchResults.innerHTML = `<div class="site-search-empty" role="status">Loading search...</div>`;
      searchResults.setAttribute("aria-busy", "true");
    }
    searchIndexRequest = loadAllSeasons()
      .then((seasons) => {
        searchIndex = buildSearchIndex(seasons);
        searchIndexReady = true;
        if (searchResults && !searchResults.hidden) renderCurrentSearch();
      })
      .catch((error) => {
        console.warn("Could not load search data", error);
        if (searchResults && !searchResults.hidden) searchResults.innerHTML = `<div class="site-search-empty" role="status">Search is temporarily unavailable. Type again to retry.</div>`;
      })
      .finally(() => {
        searchIndexRequest = null;
        searchResults?.removeAttribute("aria-busy");
      });
    return searchIndexRequest;
  };

  if (searchInput && searchResults) {
    const stepSearchFocus = (direction) => {
      const options = [...searchResults.querySelectorAll("[role=option]")];
      if (!options.length) return;
      const current = options.indexOf(document.activeElement);
      const next = current < 0
        ? (direction > 0 ? 0 : options.length - 1)
        : Math.max(0, Math.min(options.length - 1, current + direction));
      options.forEach((option, index) => option.setAttribute("aria-selected", String(index === next)));
      options[next].focus();
    };

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();
      setSearchOpen(true);
      if (searchIndexReady) renderCurrentSearch();
      else if (query) loadSearchIndex();
      else searchResults.innerHTML = renderSearchResults([], query);
    });

    searchInput.addEventListener("focus", () => {
      setSearchOpen(true);
      if (searchIndexReady) renderCurrentSearch();
      else {
        searchResults.innerHTML = renderSearchResults([], "");
        if (searchInput.value.trim()) loadSearchIndex();
      }
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!searchIndexReady && searchInput.value.trim()) loadSearchIndex()?.then(() => stepSearchFocus(1));
        else stepSearchFocus(1);
      }
    });

    searchResults.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        stepSearchFocus(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Escape") {
        setSearchOpen(false);
        searchInput.focus();
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-dropdown")) closeMoreMenu();
    if (!event.target.closest(".nav-links") && !event.target.closest(".nav-toggle")) closeNavigation();
    if (!event.target.closest(".site-search")) {
      setSearchOpen(false);
    }
  });

  document.addEventListener("focusin", (event) => {
    if (!event.target.closest?.(".site-search")) setSearchOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (menu && !menu.hidden) closeMoreMenu(true);
    else if (links?.classList.contains("open")) closeNavigation(true);
    else if (searchResults && !searchResults.hidden) setSearchOpen(false);
  });

  links?.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeNavigation();
      closeMoreMenu();
    }
  });
}

