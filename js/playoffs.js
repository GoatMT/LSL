import { renderPlayoffBracket } from "../components/playoffBracket.js";
import { renderStandingsTable } from "../components/standingsTable.js?v=3.1";
import { matchToCalendarEvent, renderCalendarButtons, renderCalendarDownloadButton } from "./calendarLinks.js";
import { playoffRulesFor, SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js?v=1.0";
import { calculateStandings } from "./leagueEngine.js?v=3.3";
import { setupLayout } from "./main.js";
import { controlSelect, escapeHTML, formatDateWithISO, setDocumentTitle, statusMessage, teamProfileHref } from "./utils.js";

setupLayout("playoffs.html");
setDocumentTitle("Playoffs");

const root = document.getElementById("page-root");
let state = { season: SITE.defaultSeason, division: "Seniors" };

function playoffDataForDivision(playoffs = {}, division) {
  if (Array.isArray(playoffs.divisions)) {
    return playoffs.divisions.find((item) => item.division === division) || { rounds: [] };
  }
  if (playoffs.division && playoffs.division !== division) return { rounds: [] };
  return playoffs;
}

function seedTeam(row, fallback = "TBA") {
  if (!row?.team) return { id: "", name: fallback };
  return {
    id: row.team.id,
    name: `${row.team.name} (${row.rankLabel || row.rank})`,
  };
}

function placeholderTeam(name) {
  return { id: "", name };
}

function buildCurrentBracket(data, rows, division) {
  if (data.year !== SITE.defaultSeason || division !== "Seniors") return null;

  // 2026 expanded the senior field to 8 teams with no byes: quarterfinals are
  // 1v8, 2v7, 3v6, and 4v5, all played the same day (August 8) as the semis and final.
  const seeded = rows.filter((row) => row.gp > 0 && !row.scorePending).slice(0, 8);
  if (seeded.length < 8) return null;

  const seed1 = seedTeam(seeded[0]);
  const seed2 = seedTeam(seeded[1]);
  const seed3 = seedTeam(seeded[2]);
  const seed4 = seedTeam(seeded[3]);
  const seed5 = seedTeam(seeded[4]);
  const seed6 = seedTeam(seeded[5]);
  const seed7 = seedTeam(seeded[6]);
  const seed8 = seedTeam(seeded[7]);
  const q1Winner = placeholderTeam("Winner Q1");
  const q2Winner = placeholderTeam("Winner Q2");
  const q3Winner = placeholderTeam("Winner Q3");
  const q4Winner = placeholderTeam("Winner Q4");
  const s1Winner = placeholderTeam("Winner S1");
  const s2Winner = placeholderTeam("Winner S2");

  return {
    season: data.year,
    division,
    layout: "wide",
    champion: "",
    isCurrentProjection: true,
    format: "Eight-team single-day bracket. Quarterfinals, semifinals, and the championship are all played Saturday, August 8, 2026.",
    rounds: [
      {
        name: "Quarterfinals",
        matches: [
          {
            label: "Q1",
            homeTeamId: seed1.id,
            homeTeamName: seed1.name,
            homeSeed: 1,
            awayTeamId: seed8.id,
            awayTeamName: seed8.name,
            awaySeed: 8,
            homeScore: null,
            awayScore: null,
            note: "Current seed 1 vs current seed 8."
          },
          {
            label: "Q2",
            homeTeamId: seed2.id,
            homeTeamName: seed2.name,
            homeSeed: 2,
            awayTeamId: seed7.id,
            awayTeamName: seed7.name,
            awaySeed: 7,
            homeScore: null,
            awayScore: null,
            note: "Current seed 2 vs current seed 7."
          },
          {
            label: "Q3",
            homeTeamId: seed3.id,
            homeTeamName: seed3.name,
            homeSeed: 3,
            awayTeamId: seed6.id,
            awayTeamName: seed6.name,
            awaySeed: 6,
            homeScore: null,
            awayScore: null,
            note: "Current seed 3 vs current seed 6."
          },
          {
            label: "Q4",
            homeTeamId: seed4.id,
            homeTeamName: seed4.name,
            homeSeed: 4,
            awayTeamId: seed5.id,
            awayTeamName: seed5.name,
            awaySeed: 5,
            homeScore: null,
            awayScore: null,
            note: "Current seed 4 vs current seed 5."
          }
        ]
      },
      {
        name: "Semifinals",
        matches: [
          {
            label: "S1",
            homeTeamId: q1Winner.id,
            homeTeamName: q1Winner.name,
            awayTeamId: q4Winner.id,
            awayTeamName: q4Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Winner of Q1 (1v8) faces the winner of Q4 (4v5). No byes in the 8-team format."
          },
          {
            label: "S2",
            homeTeamId: q2Winner.id,
            homeTeamName: q2Winner.name,
            awayTeamId: q3Winner.id,
            awayTeamName: q3Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Winner of Q2 (2v7) faces the winner of Q3 (3v6)."
          }
        ]
      },
      {
        name: "Final",
        matches: [
          {
            label: "Final",
            homeTeamId: s1Winner.id,
            homeTeamName: s1Winner.name,
            awayTeamId: s2Winner.id,
            awayTeamName: s2Winner.name,
            homeScore: null,
            awayScore: null,
            note: "Projected bracket spot only. Not an official result. Championship is played the same day as the quarterfinals and semifinals."
          }
        ]
      }
    ]
  };
}

function qfSortKey(label = "") {
  const match = /Quarterfinal (\d+)/.exec(label);
  return match ? Number(match[1]) : 99;
}

function sfSortKey(label = "") {
  const match = /Semifinal (\d+)/.exec(label);
  return match ? Number(match[1]) : 99;
}

function buildOfficialBracket(data, division) {
  const playoffMatches = (data.matches || []).filter((match) => match.stage === "playoffs" && match.division === division);
  if (!playoffMatches.length) return null;

  const teams = new Map((data.teams || []).map((team) => [team.id, team]));
  const toMatch = (match) => {
    const home = teams.get(match.homeTeamId);
    const away = teams.get(match.awayTeamId);
    const winnerId =
      match.winnerId || (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore) && match.homeScore !== match.awayScore ? (match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId) : "");
    return {
      label: match.label,
      homeTeamId: match.homeTeamId,
      homeTeamName: home?.name || match.homeTeamName || "TBA",
      homeScore: match.homeScore,
      awayTeamId: match.awayTeamId,
      awayTeamName: away?.name || match.awayTeamName || "TBA",
      awayScore: match.awayScore,
      winnerId,
      note: match.time ? `${match.time}${match.status && match.status !== "Complete" ? ` \u2022 ${match.status}` : ""}` : match.status || "",
    };
  };

  const qfMatches = playoffMatches.filter((match) => /^Quarterfinal \d+$/.test(match.label || "")).sort((a, b) => qfSortKey(a.label) - qfSortKey(b.label));
  const sfMatches = playoffMatches.filter((match) => /^Semifinal \d+$/.test(match.label || "")).sort((a, b) => sfSortKey(a.label) - sfSortKey(b.label));
  const finalMatch = playoffMatches.find((match) => /championship final/i.test(match.label || ""));

  const rounds = [];
  if (qfMatches.length) rounds.push({ name: "Quarterfinals", matches: qfMatches.map(toMatch) });
  if (sfMatches.length) rounds.push({ name: "Semifinals", matches: sfMatches.map(toMatch) });
  if (finalMatch) rounds.push({ name: "Final", matches: [toMatch(finalMatch)] });
  if (!rounds.length) return null;

  const champion = finalMatch && Number.isFinite(finalMatch.homeScore) && Number.isFinite(finalMatch.awayScore) ? teams.get(finalMatch.winnerId)?.name || "" : "";

  return {
    season: data.year,
    division,
    layout: "wide",
    champion,
    format: "Eight-team single-day bracket. Quarterfinals, semifinals, and the championship are all played Saturday, August 8, 2026.",
    rounds,
  };
}

function firstStartClock24(match) {
  const startRaw = String(match.time || "").split(/\s+(?:-|to)\s+/i)[0] || "";
  const parsed = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(startRaw.trim());
  if (!parsed) return "09:00:00";
  let hours = Number(parsed[1]) % 12;
  if (/PM/i.test(parsed[3])) hours += 12;
  return `${String(hours).padStart(2, "0")}:${parsed[2]}:00`;
}

function renderQfCentralCard(data, teams, match) {
  const home = teams.get(match.homeTeamId);
  const away = teams.get(match.awayTeamId);
  const decided = Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
  const event = matchToCalendarEvent(match, data, { home: home?.name || match.homeTeamName, away: away?.name || match.awayTeamName });
  const targetIso = `${match.date}T${firstStartClock24(match)}`;

  return `
    <article class="card qf-central-card${decided ? " decided" : ""}">
      <div class="qf-central-head">
        <span class="pill green">${escapeHTML(match.label || "Quarterfinal")}</span>
        <span class="qf-central-time">${escapeHTML(match.time || "Time TBA")}</span>
      </div>
      <div class="qf-central-matchup">
        <a href="${escapeHTML(teamProfileHref(match.homeTeamId, data.year))}">${escapeHTML(home?.name || match.homeTeamName || "Home team")}</a>
        <span>vs</span>
        <a href="${escapeHTML(teamProfileHref(match.awayTeamId, data.year))}">${escapeHTML(away?.name || match.awayTeamName || "Away team")}</a>
      </div>
      ${
        decided
          ? `<div class="qf-central-result">Final: ${match.homeScore}-${match.awayScore}</div>`
          : `<div class="qf-central-countdown" data-countdown-target="${escapeHTML(targetIso)}">
              <strong data-countdown-compact>Calculating...</strong>
            </div>`
      }
      ${event ? renderCalendarButtons(event, { compact: true }) : ""}
    </article>
  `;
}

function renderPlayoffCentral(data) {
  if (data.year !== SITE.defaultSeason) return "";
  const qfMatches = (data.matches || [])
    .filter((match) => match.stage === "playoffs" && /^Quarterfinal \d$/.test(match.label || ""))
    .sort((a, b) => (a.label || "").localeCompare(b.label || "", undefined, { numeric: true }));
  if (!qfMatches.length) return "";

  const allDecided = qfMatches.every((match) => Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore));
  if (allDecided) return "";

  const teams = new Map((data.teams || []).map((team) => [team.id, team]));
  const earliest = [...qfMatches].sort((a, b) => firstStartClock24(a).localeCompare(firstStartClock24(b)))[0];
  const heroTarget = `${earliest.date}T${firstStartClock24(earliest)}`;
  const calendarEvents = qfMatches
    .map((match) => matchToCalendarEvent(match, data, { home: teams.get(match.homeTeamId)?.name || match.homeTeamName, away: teams.get(match.awayTeamId)?.name || match.awayTeamName }))
    .filter(Boolean);

  return `
    <section class="section-panel playoff-central-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Playoff Central</span>
          <h2>Finals Day &mdash; ${escapeHTML(formatDateWithISO(earliest.date))}</h2>
          <p>All four quarterfinals, both semifinals, and the championship are played the same day. Every QF kickoff and a calendar reminder, all in one place.</p>
        </div>
        ${renderCalendarDownloadButton(calendarEvents, `lsl-quarterfinals-${earliest.date}.ics`, "Add All QFs To Calendar")}
      </div>
      <div class="playoff-central-countdown" data-countdown-target="${escapeHTML(heroTarget)}">
        <span class="playoff-central-countdown-label">First Kickoff In</span>
        <div class="playoff-central-countdown-clock" aria-live="polite">
          <div><strong data-countdown-days>--</strong><small>Days</small></div>
          <div><strong data-countdown-hours>--</strong><small>Hrs</small></div>
          <div><strong data-countdown-minutes>--</strong><small>Min</small></div>
          <div><strong data-countdown-seconds>--</strong><small>Sec</small></div>
        </div>
      </div>
      <div class="playoff-central-grid">
        ${qfMatches.map((match) => renderQfCentralCard(data, teams, match)).join("")}
      </div>
    </section>
  `;
}

let countdownInterval = null;

function updateCountdowns() {
  document.querySelectorAll("[data-countdown-target]").forEach((el) => {
    const target = new Date(el.dataset.countdownTarget);
    if (Number.isNaN(target.getTime())) return;
    const diffMs = target.getTime() - Date.now();
    const clamped = Math.max(0, diffMs);
    const totalSeconds = Math.floor(clamped / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const daysEl = el.querySelector("[data-countdown-days]");
    if (daysEl) {
      daysEl.textContent = days;
      el.querySelector("[data-countdown-hours]").textContent = String(hours).padStart(2, "0");
      el.querySelector("[data-countdown-minutes]").textContent = String(minutes).padStart(2, "0");
      el.querySelector("[data-countdown-seconds]").textContent = String(seconds).padStart(2, "0");
      return;
    }

    const compactEl = el.querySelector("[data-countdown-compact]");
    if (compactEl) {
      compactEl.textContent =
        diffMs <= 0 ? "Starting now" : days > 0 ? `Kicks off in ${days}d ${hours}h` : hours > 0 ? `Kicks off in ${hours}h ${minutes}m` : `Kicks off in ${minutes}m ${seconds}s`;
    }
  });
}

function startCountdownTicker() {
  if (countdownInterval) clearInterval(countdownInterval);
  if (!document.querySelector("[data-countdown-target]")) return;
  updateCountdowns();
  countdownInterval = setInterval(updateCountdowns, 1000);
}

function bracketNotice(playoffData, seasonComplete) {
  if (!playoffData?.isCurrentProjection) return "";
  if (seasonComplete) {
    return `
      <div class="card playoff-current-notice">
        <span class="pill green">Official Bracket</span>
        <h3>Quarterfinal matchups are set</h3>
        <p>The ${escapeHTML(state.season)} regular season is complete, so these are the official quarterfinal matchups based on final standings. Scores will be added as each game is played.</p>
      </div>
    `;
  }
  return `
    <div class="card playoff-current-notice">
      <span class="pill green">Current Bracket</span>
      <h3>If the playoffs started today</h3>
      <p>This bracket is built from the current ${escapeHTML(state.season)} standings. It is not official and will change as more regular season games are completed.</p>
    </div>
  `;
}

function regularSeasonComplete(data, division) {
  const regularMatches = (data.matches || []).filter((match) => match.division === division && match.stage === "regular");
  return regularMatches.length > 0 && regularMatches.every((match) => match.homeScore != null && match.awayScore != null);
}

function divisionOptions(data) {
  const available = [...new Set((data.teams || []).map((team) => team.division).filter(Boolean))];
  return available.length ? available : SITE.divisions;
}

function render(data) {
  const divisions = divisionOptions(data);
  if (!divisions.includes(state.division)) state.division = divisions[0] || "Seniors";
  const rule = playoffRulesFor(state.season, state.division);
  const rows = calculateStandings(data, { division: state.division });
  const publishedPlayoffData = playoffDataForDivision(data.playoffs, state.division);
  const playoffData = (publishedPlayoffData.rounds || []).length ? publishedPlayoffData : buildOfficialBracket(data, state.division) || buildCurrentBracket(data, rows, state.division) || publishedPlayoffData;

  root.innerHTML = `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Playoffs</span>
          <h1>${escapeHTML(state.season)} Bracket</h1>
          <p>${escapeHTML(rule?.description || "Select a division to view playoff format.")}</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("season", "Season", SITE.seasons, state.season)}
        ${controlSelect("division", "Division", divisions, state.division)}
      </div>
      ${bracketNotice(playoffData, regularSeasonComplete(data, state.division))}
      ${renderPlayoffBracket(playoffData)}
    </section>

    ${renderPlayoffCentral(data)}

    <section class="section-panel">
      <div class="section-head">
        <div>
          <h2>Seeding Table</h2>
          <p>Seeds are calculated from regular season results.</p>
        </div>
      </div>
      ${rows.length ? renderStandingsTable(rows, data.year) : statusMessage("empty", "No seeding table is available yet.")}
    </section>
  `;

  startCountdownTicker();

  ["season", "division"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async (event) => {
      state[id] = event.target.value;
      const nextData = id === "season" ? await loadSeasonData(state.season) : data;
      render(nextData);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading playoffs...");
  render(await loadSeasonData(state.season));
}

init();
