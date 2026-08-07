import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { initShareButtons, renderShareButtons } from "./shareLinks.js";
import { escapeHTML, getQueryParam, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("news.html");
setDocumentTitle("News");

const root = document.getElementById("page-root");
let state = { articleId: getQueryParam("id") || "", storiesExpanded: false };

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

function articleDateValue(article) {
  const value = Date.parse(`${article.date || ""} 12:00:00`);
  return Number.isFinite(value) ? value : 0;
}

function monthDayKey(dateStr = "") {
  const parts = String(dateStr).split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : "";
}

function findOnThisDay(allSeasons) {
  const today = new Date();
  const todayKey = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const hits = [];
  (allSeasons || []).forEach((data) => {
    const teamsById = new Map((data.teams || []).map((team) => [team.id, team]));
    (data.matches || [])
      .filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore))
      .filter((match) => monthDayKey(match.date) === todayKey)
      .filter((match) => new Date(`${match.date} 12:00:00`) < today)
      .forEach((match) => {
        hits.push({
          match,
          year: data.year,
          home: teamsById.get(match.homeTeamId),
          away: teamsById.get(match.awayTeamId),
        });
      });
  });

  return hits
    .sort((a, b) => Number(b.year) - Number(a.year) || b.match.homeScore + b.match.awayScore - (a.match.homeScore + a.match.awayScore))
    .slice(0, 2);
}

function renderOnThisDay(hits) {
  if (!hits.length) return "";
  return `
    <aside class="news-on-this-day" aria-label="On this day in LSL history">
      <span class="eyebrow">On This Day</span>
      <div class="news-on-this-day-list">
        ${hits
          .map(({ match, year, home, away }) => {
            const homeName = home?.name || "Home";
            const awayName = away?.name || "Away";
            const summary =
              match.homeScore === match.awayScore
                ? `${homeName} and ${awayName} drew ${match.homeScore}-${match.awayScore}`
                : `${match.homeScore > match.awayScore ? homeName : awayName} beat ${match.homeScore > match.awayScore ? awayName : homeName} ${Math.max(match.homeScore, match.awayScore)}-${Math.min(match.homeScore, match.awayScore)}`;
            return `
              <a class="news-on-this-day-card" href="./game.html?id=${encodeURIComponent(match.id)}&season=${encodeURIComponent(year)}">
                <span class="news-on-this-day-year">${escapeHTML(year)}</span>
                <strong>${escapeHTML(homeName)} vs ${escapeHTML(awayName)}</strong>
                <span>${escapeHTML(summary)}</span>
              </a>
            `;
          })
          .join("")}
      </div>
    </aside>
  `;
}

function isDevelopingArticle(article) {
  return article?.isDeveloping === true && Boolean(article.storyline);
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
  return `
    <a class="news-story-card${article.id === activeId ? " active" : ""}" href="${escapeHTML(articleHref(article))}" data-news-id="${escapeHTML(article.id)}">
      ${storyThumbnailMarkup(article)}
      <div class="news-story-card-body">
        <div class="news-story-tags">
          <span class="news-story-type">${escapeHTML(group)}</span>
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
      ${renderShareButtons(articleHref(article), article.headline || "LSL News", { label: "Share This Story" })}
      ${renderTradeStats(article)}
      <div class="news-article-body">
        ${(article.body || []).map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("") || "<p>Article details coming soon.</p>"}
      </div>
    </article>
  `;
}

function render(articles, onThisDay = []) {
  const selected = selectArticle(articles, state.articleId);
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
        ${renderOnThisDay(onThisDay)}
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
    return;
  }

  state.articleId = selected.id;
  setDocumentTitle(`${selected.headline} | News`);
  const collapsedArticles = articles.slice(0, 10);
  const listedArticles = state.storiesExpanded ? articles : collapsedArticles;
  const hasOlderStories = articles.length > collapsedArticles.length;

  root.innerHTML = `
    <section class="section-panel news-page-shell">
      <div class="section-head">
        <div>
          <span class="eyebrow">LSL News</span>
          <h1>News</h1>
          <p>League updates, match results, roster notes, and announcements in one clean article view.</p>
        </div>
      </div>
      ${renderOnThisDay(onThisDay)}
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
      history.pushState(null, "", articleHref({ id: state.articleId }));
      render(articles, onThisDay);
    });
  });

  root.querySelector("[data-news-expand]")?.addEventListener("click", () => {
    state.storiesExpanded = !state.storiesExpanded;
    render(articles, onThisDay);
  });

  initShareButtons(root);
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading news...");
  const [data, allSeasons] = await Promise.all([
    loadJSON("./data/news-articles.json", { articles: [] }),
    loadAllSeasons().catch(() => []),
  ]);
  const articles = [...(data.articles || [])].sort(
    (a, b) => articleDateValue(b) - articleDateValue(a) || Number(b.isLatest === true) - Number(a.isLatest === true)
  );
  const onThisDay = findOnThisDay(allSeasons);
  render(articles, onThisDay);
  window.addEventListener("popstate", () => {
    state.articleId = getQueryParam("id") || "";
    state.storiesExpanded = false;
    render(articles, onThisDay);
  });
}

init();
