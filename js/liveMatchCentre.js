import { loadAllSeasons } from "./dataLoader.js?v=20261108-data3";
import { setupLayout } from "./main.js?v=20261109-greenprimary1";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";
import { collectMatchCentreFixtures, fixtureStart, matchScore, matchStatus, statusLabel } from "./liveMatchCentreModel.js?v=20261121-matchcentre3";
import { createLiveMatchCentreClient } from "./liveMatchCentreSync.js?v=20261121-matchcentre3";

setupLayout("live-match-centre.html");
setDocumentTitle("LSL Live Match Centre");

const root = document.getElementById("page-root");
const state = {
  fixtures: [],
  updates: new Map(),
  division: "all",
  stage: "all",
  season: "all",
  syncStatus: "Connecting to live updates...",
  auth: { user: null, isAdmin: false, unauthorized: false },
  authMessage: "",
  publishMessage: "",
  showAllResults: false,
  client: null,
};

function initials(name = "") {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function scoreFor(match) {
  const score = matchScore(match, state.updates.get(match.liveDocumentId));
  return score ? `${score.homeScore} - ${score.awayScore}` : "";
}

function selectedFixtures() {
  return state.fixtures.filter((match) =>
    (state.season === "all" || match.season === state.season) &&
    (state.division === "all" || match.division === state.division) &&
    (state.stage === "all" || match.stage === state.stage)
  );
}

function teamSide(name, logo, alignment = "") {
  return `<div class="match-centre-team ${alignment}"><span class="match-centre-team-mark">${logo ? `<img data-match-logo src="${escapeHTML(logo)}" alt="" loading="lazy">` : ""}<span aria-hidden="true">${escapeHTML(initials(name))}</span></span><strong>${escapeHTML(name)}</strong></div>`;
}

function eventMarkup(events = []) {
  if (!Array.isArray(events) || !events.length) return "";
  return `<ol class="match-centre-events">${[...events].sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0)).map((event) => {
    const minute = event.minute ? `${escapeHTML(event.minute)}'` : "Update";
    const label = event.type === "goal" ? "Goal" : event.type === "card" ? "Card" : "Note";
    const person = event.playerName ? ` · ${escapeHTML(event.playerName)}` : "";
    const note = event.text ? `<p>${escapeHTML(event.text)}</p>` : "";
    const team = event.teamSide === "home" ? event.homeTeamName : event.teamSide === "away" ? event.awayTeamName : "";
    return `<li><span>${minute}</span><strong>${escapeHTML(label)}${person}</strong>${team ? `<small>${escapeHTML(team)}</small>` : ""}${note}</li>`;
  }).join("")}</ol>`;
}

function dateLabel(match) {
  const pieces = [match.date, match.time].filter(Boolean);
  return pieces.length ? pieces.join(" · ") : "Date and kickoff not recorded";
}

function card(match) {
  const update = state.updates.get(match.liveDocumentId);
  const status = matchStatus(match, update);
  const score = scoreFor(match);
  const stageLabel = match.stage === "playoffs" ? `Playoffs · ${match.roundName || "Round"}` : match.stage === "regular" ? "Regular season" : String(match.stage || "Match");
  const href = match.matchType === "league" ? `./game.html?season=${encodeURIComponent(match.season)}&id=${encodeURIComponent(match.id)}` : "";
  return `<article class="match-centre-card status-card-${escapeHTML(status)}">
    <div class="match-centre-card-head"><div><span class="match-centre-stage">${escapeHTML(match.season)} · ${escapeHTML(match.division)} · ${escapeHTML(stageLabel)}</span><h3>${escapeHTML(match.label)}</h3></div><span class="match-centre-status status-${escapeHTML(status)}">${escapeHTML(statusLabel(status))}</span></div>
    <p class="match-centre-datetime">${escapeHTML(dateLabel(match))}</p>
    <div class="match-centre-scoreline">${teamSide(match.homeTeamName, match.homeTeamLogo)}<strong class="match-centre-score">${escapeHTML(score || (status === "scheduled" ? "vs" : "Score not recorded"))}</strong>${teamSide(match.awayTeamName, match.awayTeamLogo, "away")}</div>
    ${eventMarkup((update?.events || []).map((event) => ({ ...event, homeTeamName: match.homeTeamName, awayTeamName: match.awayTeamName })))}
    ${href ? `<a class="match-centre-detail-link" href="${href}">Match details <span aria-hidden="true">→</span></a>` : ""}
  </article>`;
}

function sortUpcoming(matches) {
  return [...matches].sort((a, b) => (fixtureStart(a)?.getTime() || Infinity) - (fixtureStart(b)?.getTime() || Infinity));
}

function sortRecent(matches) {
  return [...matches].sort((a, b) => {
    const startA = fixtureStart(a)?.getTime() || 0;
    const startB = fixtureStart(b)?.getTime() || 0;
    return startB - startA || String(b.date || "").localeCompare(String(a.date || ""));
  });
}

function updateFeed(fixtures) {
  const indexed = new Map(fixtures.map((match) => [match.liveDocumentId, match]));
  return [...state.updates.entries()]
    .filter(([id]) => indexed.has(id))
    .flatMap(([id, update]) => {
      const match = indexed.get(id);
      const statusUpdate = { kind: "match", at: Number(update.updatedAtMs || 0), update, match };
      const eventUpdates = (update.events || []).map((event) => ({ kind: "event", at: Number(event.createdAtMs || 0), event, update, match }));
      return [statusUpdate, ...eventUpdates];
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
}

function renderEventFeed(fixtures) {
  const entries = updateFeed(fixtures);
  if (!entries.length) return statusMessage("empty", "No live event updates have been published yet.");
  return `<div class="match-centre-update-list">${entries.map((entry) => {
    const { event, match, update } = entry;
    if (entry.kind === "match") {
      const currentStatus = statusLabel(matchStatus(match, update));
      return `<article><span>${escapeHTML(match.season)} · ${escapeHTML(entry.at ? new Date(entry.at).toLocaleString() : "Live update")}</span><strong>${escapeHTML(match.homeTeamName)} ${escapeHTML(scoreFor(match) || "Score not recorded")} ${escapeHTML(match.awayTeamName)}</strong><p>${escapeHTML(currentStatus)} update</p></article>`;
    }
    const description = event.type === "goal" ? `Goal${event.playerName ? ` · ${event.playerName}` : ""}` : event.type === "card" ? `Card${event.playerName ? ` · ${event.playerName}` : ""}` : (event.text || "Match note");
    const team = event.teamSide === "home" ? match.homeTeamName : event.teamSide === "away" ? match.awayTeamName : "";
    return `<article><span>${escapeHTML(match.season)} · ${escapeHTML(event.minute ? `${event.minute}'` : "Update")}</span><strong>${escapeHTML(match.homeTeamName)} ${escapeHTML(scoreFor(match))} ${escapeHTML(match.awayTeamName)}</strong><p>${escapeHTML([description, team].filter(Boolean).join(" — "))}</p></article>`;
  }).join("")}</div>`;
}

function renderAdminPanel() {
  const adminRoot = root.querySelector("#match-centre-admin");
  if (!adminRoot) return;
  if (!state.client) {
    adminRoot.innerHTML = `<p class="match-centre-admin-note">${escapeHTML(state.syncStatus || "Live publishing is unavailable until Firebase connects.")}</p>`;
    return;
  }
  if (!state.auth.isAdmin) {
    adminRoot.innerHTML = `${state.auth.unauthorized ? `<p class="match-centre-admin-error" role="status">This account does not have LSL match-admin access.</p>` : ""}
      <form id="match-centre-signin" class="match-centre-admin-form">
        <label>Email<input name="email" type="email" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="button primary" type="submit">Sign in</button>
      </form>
      <p class="match-centre-admin-note">Publishing requires a Firebase account with the server-assigned LSL match-admin permission.</p>
      ${state.authMessage ? `<p class="match-centre-admin-error" role="status">${escapeHTML(state.authMessage)}</p>` : ""}`;
    adminRoot.querySelector("#match-centre-signin")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      state.authMessage = "";
      try {
        await state.client.signIn(String(form.get("email") || ""), String(form.get("password") || ""));
      } catch (error) {
        state.authMessage = error.message || "Could not sign in to match admin.";
        renderAdminPanel();
      } finally {
        button.disabled = false;
      }
    });
    return;
  }

  const choices = [...state.fixtures].sort((a, b) => `${b.season}${b.date || ""}`.localeCompare(`${a.season}${a.date || ""}`));
  const defaultChoice = choices[0];
  adminRoot.innerHTML = `<div class="match-centre-admin-head"><div><span class="match-centre-admin-user">Signed in: ${escapeHTML(state.auth.user?.email || "LSL admin")}</span><p>Publish a verified score, match status, or event.</p></div><button class="button secondary" id="match-centre-signout" type="button">Sign out</button></div>
    <form id="match-centre-update-form" class="match-centre-admin-form match-centre-publish-form">
      <label class="match-centre-admin-wide">Match<select name="matchKey" required>${choices.map((match) => `<option value="${escapeHTML(match.liveDocumentId)}" ${match.liveDocumentId === defaultChoice?.liveDocumentId ? "selected" : ""}>${escapeHTML(match.season)} · ${escapeHTML(match.division)} · ${escapeHTML(match.label)} · ${escapeHTML(match.homeTeamName)} vs ${escapeHTML(match.awayTeamName)}</option>`).join("")}</select></label>
      <label>Status<select name="status">${[["scheduled","Upcoming"],["live","Live"],["halftime","Halftime"],["delayed","Delayed"],["postponed","Postponed"],["cancelled","Cancelled"],["completed","Final"]].map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
      <label>Home score<input name="homeScore" type="number" min="0" max="99" inputmode="numeric"></label>
      <label>Away score<input name="awayScore" type="number" min="0" max="99" inputmode="numeric"></label>
      <label>Event<select name="eventType"><option value="">No event</option><option value="goal">Goal</option><option value="card">Card</option><option value="note">Match note</option></select></label>
      <label>Team<select name="teamSide"><option value="">Not specified</option><option value="home">Home</option><option value="away">Away</option></select></label>
      <label>Minute<input name="minute" type="text" inputmode="numeric" maxlength="8" placeholder="e.g. 12 or 45+1"></label>
      <label>Player<input name="playerName" type="text" maxlength="80" autocomplete="off"></label>
      <label class="match-centre-admin-wide">Event note<input name="eventText" type="text" maxlength="240" autocomplete="off"></label>
      <button class="button primary" type="submit">Publish match update</button>
    </form>
    ${state.publishMessage ? `<p class="match-centre-publish-message" role="status">${escapeHTML(state.publishMessage)}</p>` : ""}`;

  const form = adminRoot.querySelector("#match-centre-update-form");
  form?.querySelector('[name="matchKey"]')?.addEventListener("change", () => fillMatchScore(form));
  if (form) fillMatchScore(form);
  adminRoot.querySelector("#match-centre-signout")?.addEventListener("click", async () => {
    await state.client.signOut();
    state.publishMessage = "";
    renderAdminPanel();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button[type=submit]");
    const selected = state.fixtures.find((match) => match.liveDocumentId === form.elements.matchKey.value);
    if (!selected) return;
    const eventType = form.elements.eventType.value;
    const data = {
      season: selected.season,
      matchId: selected.id,
      status: form.elements.status.value,
      homeScore: form.elements.homeScore.value,
      awayScore: form.elements.awayScore.value,
    };
    if (eventType) data.event = {
      type: eventType,
      teamSide: form.elements.teamSide.value,
      minute: form.elements.minute.value,
      playerName: form.elements.playerName.value,
      text: form.elements.eventText.value,
    };
    submit.disabled = true;
    state.publishMessage = "Publishing...";
    try {
      await state.client.publish(data);
      state.publishMessage = "Match update published.";
      form.elements.eventType.value = "";
      form.elements.teamSide.value = "";
      form.elements.minute.value = "";
      form.elements.playerName.value = "";
      form.elements.eventText.value = "";
    } catch (error) {
      state.publishMessage = error.message || "The update could not be published.";
    } finally {
      submit.disabled = false;
      renderAdminPanel();
    }
  });
}

function fillMatchScore(form) {
  const match = state.fixtures.find((item) => item.liveDocumentId === form.elements.matchKey.value);
  if (!match) return;
  const update = state.updates.get(match.liveDocumentId);
  const score = matchScore(match, update);
  form.elements.homeScore.value = score ? score.homeScore : "";
  form.elements.awayScore.value = score ? score.awayScore : "";
  const status = matchStatus(match, update);
  form.elements.status.value = status === "unreported" ? "scheduled" : status;
}

function renderMatchPanels() {
  const matches = selectedFixtures();
  const statusFor = (match) => matchStatus(match, state.updates.get(match.liveDocumentId));
  const live = matches.filter((match) => ["live", "halftime"].includes(statusFor(match)));
  const upcoming = sortUpcoming(matches.filter((match) => statusFor(match) === "scheduled"));
  const completed = sortRecent(matches.filter((match) => statusFor(match) === "completed"));
  const alerts = sortRecent(matches.filter((match) => ["delayed", "postponed", "cancelled"].includes(statusFor(match))));
  const liveTarget = root.querySelector("#match-centre-live");
  const upcomingTarget = root.querySelector("#match-centre-upcoming");
  const completedTarget = root.querySelector("#match-centre-completed");
  const alertsTarget = root.querySelector("#match-centre-alerts");
  const feedTarget = root.querySelector("#match-centre-feed");
  if (!liveTarget) return;
  liveTarget.innerHTML = live.length ? `<div class="match-centre-grid">${live.map(card).join("")}</div>` : statusMessage("empty", "No fixture is currently marked live.");
  upcomingTarget.innerHTML = upcoming.length ? `<div class="match-centre-grid">${upcoming.map(card).join("")}</div>` : statusMessage("empty", "No upcoming fixtures are published for this selection. 2027 season planning dates are not match schedules.");
  const shownResults = state.showAllResults ? completed : completed.slice(0, 6);
  completedTarget.innerHTML = completed.length ? `<div class="match-centre-grid">${shownResults.map(card).join("")}</div>${completed.length > 6 ? `<button class="button secondary" id="match-centre-show-results" type="button">${state.showAllResults ? "Show fewer results" : `Show all ${completed.length} results`}</button>` : ""}` : statusMessage("empty", "No completed results are recorded for this selection.");
  alertsTarget.innerHTML = alerts.length ? `<div class="match-centre-grid">${alerts.map(card).join("")}</div>` : statusMessage("empty", "No delayed, postponed, or cancelled fixtures are reported.");
  feedTarget.innerHTML = renderEventFeed(matches);
  root.querySelector("#match-centre-show-results")?.addEventListener("click", () => {
    state.showAllResults = !state.showAllResults;
    renderMatchPanels();
  });
  root.querySelectorAll("[data-match-logo]").forEach((image) => image.addEventListener("error", () => image.remove()));
  const sync = root.querySelector("#match-centre-sync");
  if (sync) {
    sync.textContent = state.syncStatus || "Live updates connected";
    sync.classList.toggle("is-connected", !state.syncStatus);
  }
  const indicator = root.querySelector(".match-centre-live-indicator");
  if (indicator) {
    const connected = !state.syncStatus;
    indicator.classList.toggle("is-connected", connected);
    indicator.querySelector("strong").textContent = connected ? "Updates connected" : "Live feed pending";
    indicator.querySelector("small").textContent = connected ? "Score and event changes stream as published" : "Published match records remain available";
  }
}

function renderShell() {
  const seasons = [...new Set(state.fixtures.map((match) => match.season))].sort();
  const divisions = [...new Set(state.fixtures.map((match) => match.division))].sort();
  root.innerHTML = `
    <section class="section-panel match-centre-hero">
      <div><span class="eyebrow">MATCHDAY · LIVE SCORES</span><h1>LSL Live Match Centre</h1><p>Match status, live score changes, event notes, upcoming fixtures, and completed results in one place.</p><span class="match-centre-sync" id="match-centre-sync" role="status" aria-live="polite">${escapeHTML(state.syncStatus)}</span></div>
      <div class="match-centre-live-indicator"><span aria-hidden="true"></span><strong>Live feed pending</strong><small>Published match records remain available</small></div>
    </section>
    <section class="section-panel match-centre-filter-panel"><div class="section-head"><div><span class="eyebrow">FILTER MATCHES</span><h2>Season and competition</h2><p>Filters apply to live matches, upcoming fixtures, results, and alerts.</p></div></div>
      <div class="match-centre-filters">
        <label>Season<select id="match-centre-season"><option value="all">All seasons</option>${seasons.map((season) => `<option value="${escapeHTML(season)}">${escapeHTML(season)}</option>`).join("")}</select></label>
        <label>Division<select id="match-centre-division"><option value="all">All divisions</option>${divisions.map((division) => `<option value="${escapeHTML(division)}">${escapeHTML(division)}</option>`).join("")}</select></label>
        <label>Stage<select id="match-centre-stage"><option value="all">All match types</option><option value="regular">Regular season</option><option value="playoffs">Playoffs</option><option value="exhibition">Exhibition</option></select></label>
      </div>
    </section>
    <section class="section-panel match-centre-feed-panel"><div class="section-head"><div><span class="eyebrow">LATEST</span><h2>Latest score updates</h2><p>Event updates are separate from the season's official statistical records.</p></div></div><div id="match-centre-feed"></div></section>
    <section class="section-panel match-centre-live-panel"><div class="section-head"><div><span class="eyebrow">NOW</span><h2>Live matches</h2></div><span class="match-centre-live-tag"><span aria-hidden="true"></span> LIVE</span></div><div id="match-centre-live"></div></section>
    <section class="section-panel match-centre-upcoming-panel"><div class="section-head"><div><span class="eyebrow">NEXT</span><h2>Upcoming fixtures</h2></div></div><div id="match-centre-upcoming"></div></section>
    <section class="section-panel match-centre-results-panel"><div class="section-head"><div><span class="eyebrow">RESULTS</span><h2>Latest completed results</h2></div></div>
      <div id="match-centre-completed"></div>
    </section>
    <section class="section-panel match-centre-alerts-panel"><div class="section-head"><div><span class="eyebrow">MATCH ALERTS</span><h2>Delayed, postponed, or cancelled</h2></div></div><div id="match-centre-alerts"></div></section>
    <details class="section-panel match-centre-admin-panel"><summary><span class="eyebrow">LSL OPERATIONS</span><strong>Match admin</strong></summary><div id="match-centre-admin" class="match-centre-admin-content"><p>Connecting to secure match publishing...</p></div></details>
  `;

  root.querySelector("#match-centre-season")?.addEventListener("change", (event) => { state.season = event.target.value; state.showAllResults = false; renderMatchPanels(); });
  root.querySelector("#match-centre-division")?.addEventListener("change", (event) => { state.division = event.target.value; state.showAllResults = false; renderMatchPanels(); });
  root.querySelector("#match-centre-stage")?.addEventListener("change", (event) => { state.stage = event.target.value; state.showAllResults = false; renderMatchPanels(); });
  renderMatchPanels();
  renderAdminPanel();
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading match centre...");
  try {
    const seasons = await loadAllSeasons(["2024", "2025", "2026", "2027"], ["matches", "teams", "playoffs"]);
    state.fixtures = collectMatchCentreFixtures(seasons);
    renderShell();
    state.client = await createLiveMatchCentreClient({
      onUpdates(rows) {
        state.updates = new Map(rows.map((update) => [update.documentId, update]));
        renderMatchPanels();
      },
      onStatus(message) {
        state.syncStatus = message || "";
        renderMatchPanels();
        renderAdminPanel();
      },
      onAuthChange(auth) {
        state.auth = auth;
        state.authMessage = auth.unauthorized ? "This account does not have LSL match-admin access." : "";
        renderAdminPanel();
      },
    });
    renderAdminPanel();
  } catch (error) {
    console.error("Could not load match centre fixtures", error);
    root.innerHTML = statusMessage("error", "The Match Centre could not load the published fixture data. Please try again soon.");
  }
}

init();
