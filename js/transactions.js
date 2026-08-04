import { SITE } from "./config.js";
import { loadAllSeasons, loadJSON } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { escapeHTML, initials, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("transactions.html");
setDocumentTitle("Trades");

const root = document.getElementById("page-root");
let state = { division: "Seniors" };

const DIVISION_FILTERS = [
  { value: "Seniors", label: "Seniors" },
  { value: "Juniors", label: "Juniors" },
];

function playerHref(playerId = "") {
  return playerId ? `./player.html?id=${encodeURIComponent(playerId)}` : "./players.html";
}

function tradeHref(tradeId = "") {
  return tradeId ? `./trade.html?id=${encodeURIComponent(tradeId)}` : "./transactions.html";
}

function transactionDateLine(transaction = {}) {
  return [transaction.date, transaction.time].filter(Boolean).join(" | ") || "Date TBA";
}

function renderTradeLogo(team = {}, fallbackName = "LSL") {
  const style = team.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team.logo) {
    return `<img class="trade-team-logo" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name || fallbackName)} logo"${style}>`;
  }
  return `<span class="trade-team-logo trade-team-mark"${style}>${escapeHTML(initials(team.name || fallbackName, 3))}</span>`;
}

function renderAsset(asset = {}) {
  const href = asset.playerId ? playerHref(asset.playerId) : asset.href || "./transactions.html";
  return `
    <a class="trade-asset-link" href="${escapeHTML(href)}">
      ${escapeHTML(asset.name || asset.label || "Asset TBA")}
    </a>
  `;
}

function renderTradeSide(side = {}, teams, season = SITE.defaultSeason, align = "left") {
  const team = teams.get(side.teamId) || { id: side.teamId, name: side.teamName };
  const teamLabel = escapeHTML(team.name || side.teamName || "Team TBA");
  const teamNameMarkup = side.teamId
    ? `<a class="trade-team-name" href="${escapeHTML(teamProfileHref(side.teamId, season))}">${teamLabel}</a>`
    : `<span class="trade-team-name">${teamLabel}</span>`;
  return `
    <article class="trade-side ${align === "right" ? "right" : "left"}">
      <div class="trade-team-line">
        ${align === "right" ? teamNameMarkup : ""}
        ${renderTradeLogo(team, side.teamName)}
        ${align === "left" ? teamNameMarkup : ""}
      </div>
      <span class="trade-acquire-label">Acquire</span>
      <div class="trade-assets">
        ${(side.receives || []).map(renderAsset).join("") || `<span class="trade-asset-empty">Asset TBA</span>`}
      </div>
    </article>
  `;
}

function renderTradeRow(transaction = {}, teams) {
  const sides = transaction.teams || [];
  return `
    <article class="trade-row">
      <div class="trade-row-date">
        <span>${escapeHTML(transactionDateLine(transaction))}</span>
        <a href="${escapeHTML(tradeHref(transaction.id))}">Details</a>
      </div>
      <div class="trade-row-body">
        ${renderTradeSide(sides[0] || {}, teams, transaction.season, "left")}
        <div class="trade-row-divider" aria-hidden="true"></div>
        ${renderTradeSide(sides[1] || {}, teams, transaction.season, "right")}
      </div>
    </article>
  `;
}

function renderDivisionFilter(transactions = []) {
  return `
    <div class="trade-filter-bar">
      <div>
        <span class="eyebrow">Division</span>
        <h2>Filter Trades</h2>
      </div>
      <div class="trade-division-toggle" role="tablist" aria-label="Trade division filter">
        ${DIVISION_FILTERS.map((option) => {
          const count = transactions.filter((item) => item.division === option.value).length;
          const active = state.division === option.value;
          return `
            <button type="button" class="${active ? "active" : ""}" data-trade-division="${escapeHTML(option.value)}" aria-selected="${active}" role="tab">
              ${escapeHTML(option.label)}
              <small>${count}</small>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function filteredTransactions(transactions = []) {
  return transactions.filter((transaction) => transaction.division === state.division);
}

function renderTradeGroups(transactions = [], seasonTeams) {
  if (!transactions.length) return statusMessage("empty", "No trades match this division.");
  const groups = transactions.reduce((map, transaction) => {
    const season = String(transaction.season || "Season TBA");
    if (!map.has(season)) map.set(season, []);
    map.get(season).push(transaction);
    return map;
  }, new Map());

  return [...groups.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(
      ([season, group]) => `
        <section class="trade-year-group">
          <div class="trade-year-divider">
            <span>${escapeHTML(season)} Season</span>
          </div>
          ${group
            .map((transaction) => renderTradeRow(transaction, seasonTeams.get(String(transaction.season)) || new Map()))
            .join("")}
        </section>
      `
    )
    .join("");
}

function renderPage(data, seasonTeams) {
  const transactions = data.transactions || [];
  const visibleTransactions = filteredTransactions(transactions);

  root.innerHTML = `
    <section class="section-panel trades-page-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">${escapeHTML(data.label || "Trade Tracker")}</span>
          <h1>${escapeHTML(data.title || "Trades")}</h1>
          <p>${escapeHTML(data.subtitle || "Official LSL trade activity.")}</p>
        </div>
        <span class="pill">${escapeHTML(data.updated ? `Updated ${data.updated}` : "Updated TBA")}</span>
      </div>
      ${renderDivisionFilter(transactions)}
      <div class="trade-list-shell">
        ${renderTradeGroups(visibleTransactions, seasonTeams)}
      </div>
    </section>
  `;

  document.querySelectorAll("[data-trade-division]").forEach((button) => {
    button.addEventListener("click", () => {
      state.division = button.dataset.tradeDivision || "Seniors";
      renderPage(data, seasonTeams);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading trades...");
  const [data, allSeasons] = await Promise.all([loadJSON("./data/transactions.json", { transactions: [] }), loadAllSeasons()]);
  const seasonTeams = new Map(allSeasons.map((season) => [season.year, new Map((season.teams || []).map((team) => [team.id, team]))]));
  renderPage(data, seasonTeams);
}

init();
