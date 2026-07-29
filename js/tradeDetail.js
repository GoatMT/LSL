import { SITE } from "./config.js";
import { loadJSON, loadSeasonData } from "./dataLoader.js";
import { setupLayout } from "./main.js";
import { escapeHTML, getQueryParam, initials, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("transactions.html");
setDocumentTitle("Trade Details");

const root = document.getElementById("page-root");

function playerHref(playerId = "") {
  return playerId ? `./player.html?id=${encodeURIComponent(playerId)}` : "./players.html";
}

function dateLine(transaction = {}) {
  return [transaction.date, transaction.time].filter(Boolean).join(" | ") || "Date TBA";
}

function renderLogo(team = {}, fallbackName = "LSL") {
  const style = team.logoBg ? ` style="--logo-bg: ${escapeHTML(team.logoBg)}"` : "";
  if (team.logo) {
    return `<img class="trade-team-logo detail" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name || fallbackName)} logo"${style}>`;
  }
  return `<span class="trade-team-logo detail trade-team-mark"${style}>${escapeHTML(initials(team.name || fallbackName, 3))}</span>`;
}

function renderReceivedAsset(asset = {}) {
  const href = asset.playerId ? playerHref(asset.playerId) : asset.href || "./transactions.html";
  return `
    <a class="trade-detail-asset" href="${escapeHTML(href)}">
      <strong>${escapeHTML(asset.name || asset.label || "Asset TBA")}</strong>
      <span>${escapeHTML(asset.note || "Roster asset")}</span>
    </a>
  `;
}

function renderTeamDetail(side = {}, teams, season = SITE.defaultSeason) {
  const team = teams.get(side.teamId) || { id: side.teamId, name: side.teamName };
  const teamLabel = escapeHTML(team.name || side.teamName || "Team TBA");
  const teamNameMarkup = side.teamId
    ? `<a href="${escapeHTML(teamProfileHref(side.teamId, season))}">${teamLabel}</a>`
    : `<span class="trade-detail-team-name">${teamLabel}</span>`;
  return `
    <article class="trade-detail-team">
      <div class="trade-detail-team-head">
        ${renderLogo(team, side.teamName)}
        <div>
          <span class="trade-acquire-label">Acquire</span>
          ${teamNameMarkup}
        </div>
      </div>
      <div class="trade-detail-assets">
        ${(side.receives || []).map(renderReceivedAsset).join("") || statusMessage("empty", "No acquired asset listed.")}
      </div>
    </article>
  `;
}

function renderDetail(transaction = {}, teams) {
  return `
    <section class="section-panel trade-detail-hero">
      <div class="section-head">
        <div>
          <span class="eyebrow">${escapeHTML(transaction.status || "Trade")}</span>
          <h1>${escapeHTML(transaction.type || "Trade")} Details</h1>
          <p>${escapeHTML(transaction.summary || "Trade details coming soon.")}</p>
        </div>
        <a class="button" href="./transactions.html">Back to Trades</a>
      </div>
      <div class="trade-detail-meta">
        <span>${escapeHTML(dateLine(transaction))}</span>
        <span>${escapeHTML(transaction.division || "Division TBA")}</span>
        <span>${escapeHTML(transaction.season || SITE.defaultSeason)}</span>
      </div>
    </section>

    <section class="section-panel trade-detail-main">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Teams</span>
          <h2>What Each Team Acquired</h2>
          <p>Click a player name to open their LSL player profile.</p>
        </div>
      </div>
      <div class="trade-detail-team-grid">
        ${(transaction.teams || []).map((side) => renderTeamDetail(side, teams, transaction.season)).join("")}
      </div>
    </section>

    <section class="section-panel trade-detail-impact-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Impact</span>
          <h2>Trade Impact</h2>
          <p>How this move changes the teams involved.</p>
        </div>
      </div>
      ${
        (transaction.impact || []).length
          ? `<ul class="trade-detail-impact-list">${transaction.impact.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`
          : statusMessage("empty", "No impact notes are listed yet.")
      }
    </section>
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading trade details...");
  const data = await loadJSON("./data/transactions.json", { transactions: [] });
  const tradeId = getQueryParam("id");
  const transaction = (data.transactions || []).find((item) => item.id === tradeId);

  if (!transaction) {
    root.innerHTML = `
      <section class="section-panel">
        <div class="section-head">
          <div>
            <span class="eyebrow">Trade</span>
            <h1>Trade Not Found</h1>
            <p>The selected trade could not be found.</p>
          </div>
          <a class="button" href="./transactions.html">Back to Trades</a>
        </div>
      </section>
    `;
    return;
  }

  const seasonData = await loadSeasonData(transaction.season || SITE.defaultSeason);
  const teams = new Map((seasonData.teams || []).map((team) => [team.id, team]));
  root.innerHTML = renderDetail(transaction, teams);
}

init();
