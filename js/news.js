import { loadJSON } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { escapeHTML, getQueryParam, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("news.html");
setDocumentTitle("News");

const root = document.getElementById("page-root");
let state = { articleId: getQueryParam("id") || "", category: "All", search: "", storiesExpanded: false };
const categoryOptions = ["All", "Game Recaps", "Trades", "Player Milestones", "Tournament", "Postgame", "League Updates"];

function articleHref(article) {
  return `./news.html?id=${encodeURIComponent(article.id)}`;
}

function playerHref(playerId = "") {
  return `./player.html?id=${encodeURIComponent(playerId)}`;
}

function articleTime(article) {
  return [article.date, article.time].filter(Boolean).join(" | ") || "Date TBA";
}

function mediaMarkup(article, className = "news-article-hero") {
  if (article.heroName) {
    return `
      <div class="news-name-hero ${className}" role="img" aria-label="${escapeHTML(article.heroName)}">
        <span>${escapeHTML(article.category || "LSL")}</span>
        <strong>${escapeHTML(article.heroName)}</strong>
        ${article.storyLabel ? `<small>${escapeHTML(article.storyLabel)}</small>` : ""}
      </div>
    `;
  }

  const src = article.heroVideo || article.heroImage || article.thumbnail || "./assets/lsl-logo.png";
  if (article.heroVideo) {
    return `
      <video class="${className}" controls preload="metadata" poster="${escapeHTML(article.heroImage || article.thumbnail || "")}">
        <source src="${escapeHTML(src)}">
      </video>
    `;
  }
  const fitClass = article.mediaFit === "cover" ? " news-article-photo" : "";
  return `<img class="${className}${fitClass}" src="${escapeHTML(src)}" alt="${escapeHTML(article.headline)}">`;
}

function storyThumbnailMarkup(article) {
  if (article.thumbnailName) {
    return `
      <div class="news-story-name-thumb" aria-label="${escapeHTML(article.thumbnailName)}">
        <strong>${escapeHTML(article.thumbnailName)}</strong>
      </div>
    `;
  }

  const fitClass = article.mediaFit === "cover" ? " class=\"news-story-thumb-cover\"" : "";
  return `<img${fitClass} src="${escapeHTML(article.thumbnail || article.heroImage || "./assets/lsl-logo.png")}" alt="${escapeHTML(article.headline)} thumbnail">`;
}

function renderArticleActions(article) {
  const profiles = Array.isArray(article.playerProfiles)
    ? article.playerProfiles
    : article.playerProfileId
      ? [{ id: article.playerProfileId, label: article.playerProfileLabel || "View Player Profile" }]
      : [];

  if (!profiles.length) return "";
  return `
    <div class="news-article-actions">
      ${profiles
        .map(
          (profile) => `
            <a class="button primary small" href="${escapeHTML(playerHref(profile.id))}">
              ${escapeHTML(profile.label || "View Player Profile")}
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function selectArticle(articles, id) {
  return articles.find((article) => article.id === id) || articles[0] || null;
}

function articleCategoryGroup(article) {
  const category = String(article.category || "").toLowerCase();
  const headline = String(article.headline || "").toLowerCase();
  if (category.includes("inter-madrasah") || category.includes("tournament")) return "Tournament";
  if (category.includes("trade") || headline.includes("trade")) return "Trades";
  if (category.includes("postgame") || headline.includes("disputed") || headline.includes("calls")) return "Postgame";
  if (["recaps", "results", "final"].some((item) => category.includes(item))) return "Game Recaps";
  if (["record", "retirement", "player spotlight"].some((item) => category.includes(item))) return "Player Milestones";
  if (category.includes("league notes") || category.includes("league update")) return "League Updates";
  if (category.includes("league analysis")) return "League Updates";
  return "League Updates";
}

function filterArticles(articles) {
  const categoryFiltered = state.category === "All" ? articles : articles.filter((article) => articleCategoryGroup(article) === state.category);
  const query = state.search.trim().toLowerCase();
  if (!query) return categoryFiltered;
  return categoryFiltered.filter((article) => articleMatchesSearch(article, query));
}

function articleMatchesSearch(article, query) {
  const searchable = [
    article.headline,
    article.subtitle,
    article.category,
    article.storyLabel,
    article.reportStatus,
    article.author,
    article.caption,
    ...(article.tags || []),
    ...(article.body || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return searchable.includes(query);
}

function articleDateValue(article) {
  const value = Date.parse(`${article.date || ""} 12:00:00`);
  return Number.isFinite(value) ? value : 0;
}

function renderCategoryFilters(articles) {
  return `
    <div class="news-category-filter" aria-label="News category filters">
      ${categoryOptions
        .map((category) => {
          const count = category === "All" ? articles.length : articles.filter((article) => articleCategoryGroup(article) === category).length;
          return `
            <button class="${state.category === category ? "active" : ""}" type="button" data-news-category="${escapeHTML(category)}">
              <span>${escapeHTML(category)}</span>
              <small>${count}</small>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderNewsSearch(totalCount, visibleCount) {
  const query = state.search.trim();
  return `
    <div class="news-search-panel">
      <label for="news-search">
        <span class="eyebrow">Search News</span>
        <strong>Find articles</strong>
      </label>
      <input
        id="news-search"
        class="news-search-input"
        type="search"
        value="${escapeHTML(state.search)}"
        placeholder="Search titles, tags, players, teams, or story text..."
        autocomplete="off"
        data-news-search
      >
      <small>${escapeHTML(query ? `${visibleCount} of ${totalCount} articles match` : `${totalCount} articles available`)}</small>
    </div>
  `;
}

function isDevelopingArticle(article) {
  return article?.isDeveloping === true && Boolean(article.storyline);
}

function reportStatus(article) {
  if (article.reportStatus) return article.reportStatus;
  if (isDevelopingArticle(article)) return "Developing";
  const category = String(article.category || "").toLowerCase();
  if (["final", "results", "postgame"].some((item) => category.includes(item))) return "Reported Result";
  if (category.includes("league notes") || category.includes("league update")) return "League Update";
  return "Feature";
}

function renderDevelopingStoryBlock(article, articles) {
  if (!isDevelopingArticle(article)) return "";

  const connectedArticles = articles.filter((item) => item.storyline === article.storyline && item.id !== article.id);

  return `
    <aside class="news-developing-simple" aria-label="Developing story updates">
      <div class="news-developing-simple-head">
        <span class="pill">Developing Story</span>
        <p>This story has multiple updates.</p>
      </div>
      ${
        connectedArticles.length
          ? `<div class="news-developing-simple-links">
              ${connectedArticles
                .map(
                  (target) => `
                    <a href="${escapeHTML(articleHref(target))}" data-news-id="${escapeHTML(target.id)}">
                      <span>${escapeHTML(target.reportStatus === "Official" ? "Official Update" : articleTime(target))}</span>
                      <strong>${escapeHTML(target.headline)}</strong>
                    </a>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
    </aside>
  `;
}

function renderTradeStats(article) {
  const rows = article.tradeStats || [];
  if (!rows.length) return "";
  return `
    <section class="news-trade-stats" aria-label="Traded player stats">
      <div class="news-related-head">
        <span class="eyebrow">Player Stats</span>
        <strong>2026 and career totals</strong>
      </div>
      <div class="news-trade-stat-grid">
        ${rows
          .map(
            (row) => `
              <a class="news-trade-stat-card" href="${escapeHTML(playerHref(row.id))}">
                <span>${escapeHTML(row.team)}</span>
                <h3>${escapeHTML(row.name)}</h3>
                <div><small>2026</small><strong>${escapeHTML(row.season)}</strong></div>
                <div><small>Career</small><strong>${escapeHTML(row.career)}</strong></div>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderStoryCard(article, activeId) {
  const group = articleCategoryGroup(article);
  const status = reportStatus(article);
  return `
    <a class="news-story-card${article.id === activeId ? " active" : ""}" href="${escapeHTML(articleHref(article))}" data-news-id="${escapeHTML(article.id)}">
      ${storyThumbnailMarkup(article)}
      <div class="news-story-card-body">
        <div class="news-story-tags">
          <span class="news-story-type">${escapeHTML(group)}</span>
          <span class="news-story-status">${escapeHTML(status)}</span>
        </div>
        <strong>${escapeHTML(article.headline)}</strong>
        <time>${escapeHTML(articleTime(article))}</time>
      </div>
    </a>
  `;
}

function renderArticle(article, articles) {
  return `
    <article class="news-article-card">
      <div class="news-article-kicker">
        <span class="pill green">${escapeHTML(articleCategoryGroup(article))}</span>
        <span class="news-report-status${reportStatus(article) === "Official" ? " official" : ""}">${escapeHTML(reportStatus(article))}</span>
        ${article.storyLabel && !isDevelopingArticle(article) ? `<span class="news-story-label">${escapeHTML(article.storyLabel)}</span>` : ""}
        <time>${escapeHTML(articleTime(article))}</time>
      </div>
      <h1>${escapeHTML(article.headline || "News Update")}</h1>
      ${article.subtitle ? `<p class="news-article-subtitle">${escapeHTML(article.subtitle)}</p>` : ""}
      ${renderDevelopingStoryBlock(article, articles)}
      <figure class="news-article-media">
        ${mediaMarkup(article)}
        ${article.caption ? `<figcaption>${escapeHTML(article.caption)}</figcaption>` : ""}
      </figure>
      <div class="news-article-meta">
        <strong>${escapeHTML(article.author || "LSL News Desk")}</strong>
        <span>${escapeHTML(articleTime(article))}</span>
      </div>
      ${renderArticleActions(article)}
      ${renderTradeStats(article)}
      <div class="news-article-body">
        ${(article.body || []).map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("") || "<p>Article details coming soon.</p>"}
      </div>
    </article>
  `;
}

function render(articles) {
  const visibleArticles = filterArticles(articles);
  const selected = selectArticle(visibleArticles, state.articleId);
  if (!selected) {
    root.innerHTML = `
      <section class="section-panel news-page-shell">
        <div class="section-head">
          <div>
            <span class="eyebrow">LSL News</span>
            <h1>News</h1>
            <p>League updates, match results, roster notes, and announcements in one clean article view.</p>
          </div>
        </div>
        ${renderNewsSearch(articles.length, visibleArticles.length)}
        ${renderCategoryFilters(articles)}
        <div class="news-layout">
          <aside class="news-sidebar" aria-label="News stories">
            <div class="news-sidebar-head">
              <span class="eyebrow">Latest Stories</span>
              <strong>0</strong>
            </div>
            <div class="news-empty-state">No news articles found.</div>
          </aside>
          <div class="news-article-wrap">
            <article class="news-article-card">
              ${statusMessage("empty", "No news articles found.")}
            </article>
          </div>
        </div>
      </section>
    `;
    root.querySelector("[data-news-search]")?.addEventListener("input", (event) => {
      state.search = event.target.value;
      state.articleId = "";
      state.storiesExpanded = false;
      render(articles);
      root.querySelector("[data-news-search]")?.focus();
    });
    root.querySelectorAll("[data-news-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.category = button.dataset.newsCategory;
        state.articleId = "";
        state.storiesExpanded = false;
        history.pushState(null, "", "./news.html");
        render(articles);
      });
    });
    return;
  }

  state.articleId = selected.id;
  setDocumentTitle(`${selected.headline} | News`);
  const collapsedArticles = visibleArticles.slice(0, 10);
  const listedArticles = state.storiesExpanded ? visibleArticles : collapsedArticles;
  const hasOlderStories = visibleArticles.length > collapsedArticles.length;

  root.innerHTML = `
    <section class="section-panel news-page-shell">
      <div class="section-head">
        <div>
          <span class="eyebrow">LSL News</span>
          <h1>News</h1>
          <p>League updates, match results, roster notes, and announcements in one clean article view.</p>
        </div>
      </div>
      ${renderNewsSearch(articles.length, visibleArticles.length)}
      ${renderCategoryFilters(articles)}
      <div class="news-layout">
        <aside class="news-sidebar" aria-label="News stories">
          <div class="news-sidebar-head">
            <span class="eyebrow">Latest Stories</span>
            <strong>${listedArticles.length}</strong>
          </div>
          <div class="news-story-list">
            ${listedArticles.length ? listedArticles.map((article) => renderStoryCard(article, selected.id)).join("") : `<div class="news-empty-state">No news articles found.</div>`}
          </div>
          ${
            hasOlderStories
              ? `<div class="news-sidebar-actions">
                  <button class="button primary small" type="button" data-news-expand>
                    ${state.storiesExpanded ? "Show Less" : "View More"}
                  </button>
                </div>`
              : ""
          }
        </aside>
        <div class="news-article-wrap">
          ${renderArticle(selected, articles)}
        </div>
      </div>
    </section>
  `;

  root.querySelectorAll("[data-news-id]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.articleId = link.dataset.newsId;
      const target = articles.find((article) => article.id === state.articleId);
      if (target && state.category !== "All" && articleCategoryGroup(target) !== state.category) state.category = "All";
      history.pushState(null, "", articleHref({ id: state.articleId }));
      render(articles);
    });
  });

  root.querySelectorAll("[data-news-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.newsCategory;
      state.articleId = "";
      state.storiesExpanded = false;
      history.pushState(null, "", "./news.html");
      render(articles);
    });
  });

  root.querySelector("[data-news-expand]")?.addEventListener("click", () => {
    state.storiesExpanded = !state.storiesExpanded;
    render(articles);
  });

  root.querySelector("[data-news-search]")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    state.articleId = "";
    state.storiesExpanded = false;
    history.replaceState(null, "", "./news.html");
    render(articles);
    root.querySelector("[data-news-search]")?.focus();
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading news...");
  const data = await loadJSON("./data/news-articles.json", { articles: [] });
  const articles = [...(data.articles || [])].sort(
    (a, b) => articleDateValue(b) - articleDateValue(a) || Number(b.isLatest === true) - Number(a.isLatest === true)
  );
  render(articles);
  window.addEventListener("popstate", () => {
    state.articleId = getQueryParam("id") || "";
    state.search = "";
    state.storiesExpanded = false;
    render(articles);
  });
}

init();
