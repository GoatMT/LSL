import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("lsl-timeline.html");
setDocumentTitle("LSL Timeline");

const root = document.getElementById("page-root");

function awardFor(data, category, division = "") {
  return (data.awards?.awards || []).find((award) => award.category === category && (!division || award.division === division));
}

function seasonEntry(data) {
  const matches = (data.matches || []).filter((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore));
  if (!matches.length && !(data.awards?.awards || []).length) return null;
  const champion = awardFor(data, "Champion Team", "Seniors") || awardFor(data, "Champion Team");
  const juniorChampion = awardFor(data, "Champion Team", "Juniors");
  const goldenBoot = awardFor(data, "Golden Boot");
  const mvp = awardFor(data, "MVP");
  const biggestGame = [...matches].sort((a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore))[0];
  const biggestGameGoals = biggestGame ? biggestGame.homeScore + biggestGame.awayScore : 0;
  return { data, matches, champion, juniorChampion, goldenBoot, mvp, biggestGame, biggestGameGoals };
}

function renderEntry(entry) {
  const { data } = entry;
  const facts = [
    entry.champion?.winner ? `Seniors champion: ${entry.champion.winner}` : "Seniors champion pending",
    entry.juniorChampion?.winner ? `Juniors champion: ${entry.juniorChampion.winner}` : "Juniors champion pending",
    `${entry.matches.length} completed games`,
    entry.biggestGame ? `${entry.biggestGameGoals}-goal game recorded` : "Scoring records pending",
  ];
  return `
    <article class="timeline-season">
      <div class="timeline-season-year">${escapeHTML(data.year)}</div>
      <div>
        <span class="eyebrow">Season archive</span>
        <h3>${escapeHTML(data.event?.name || `${data.year} LSL season`)}</h3>
        <p>${escapeHTML(entry.champion?.sourceNote || "A season of league matches, standings, awards, and playoff moments.")}</p>
        <div class="timeline-facts">${facts.map((fact) => `<span class="timeline-fact">${escapeHTML(fact)}</span>`).join("")}</div>
        <div class="button-row">
          ${entry.goldenBoot?.playerId ? `<a class="text-link" href="./player.html?id=${encodeURIComponent(entry.goldenBoot.playerId)}">Golden Boot: ${escapeHTML(entry.goldenBoot.winner)}</a>` : ""}
          ${entry.mvp?.playerId ? `<a class="text-link" href="./player.html?id=${encodeURIComponent(entry.mvp.playerId)}">MVP: ${escapeHTML(entry.mvp.winner)}</a>` : ""}
          <a class="text-link" href="./season-recap.html?season=${encodeURIComponent(data.year)}">Season recap</a>
        </div>
      </div>
    </article>
  `;
}

function render(allData) {
  const entries = allData.map(seasonEntry).filter(Boolean).sort((a, b) => Number(a.data.year) - Number(b.data.year));
  root.innerHTML = `
    <section class="section-panel archive-hero">
      <div><span class="eyebrow">The League Story</span><h1>LSL Timeline</h1><p>Follow the league from season to season through champions, awards, scoring peaks, and the matches that defined each archive.</p><div class="button-row"><a class="button primary" href="./records.html">Explore Records</a><a class="button" href="./captaincy.html">Captaincy History</a></div></div>
      <div class="archive-hero-mark" aria-hidden="true">LSL</div>
    </section>
    <section class="section-panel archive-section">
      <div class="archive-section-head"><div><span class="eyebrow">Oldest to latest</span><h2>Every recorded season</h2><p>The timeline grows automatically as new season files are added.</p></div><span class="pill green">${entries.length} seasons</span></div>
      <div class="timeline-list">${entries.length ? entries.map(renderEntry).join("") : statusMessage("empty", "No completed season archive is available yet.")}</div>
    </section>
  `;
}

async function init() {
  root.innerHTML = `<section class="section-panel">${statusMessage("loading", "Loading the LSL timeline...")}</section>`;
  try { render(await loadAllSeasons()); } catch (error) {
    console.error("Could not load LSL timeline", error);
    root.innerHTML = `<section class="section-panel">${statusMessage("error", "The LSL Timeline is temporarily unavailable. Please try again soon.")}</section>`;
  }
}

init();
