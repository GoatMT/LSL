import { loadSeasonData } from "./dataLoader.js";
import { renderFooter } from "../components/footer.js";
import { controlSelect, escapeHTML, initials, setDocumentTitle, statusMessage } from "./utils.js";

document.getElementById("site-navbar").innerHTML = "";
document.getElementById("site-footer").innerHTML = renderFooter();
setDocumentTitle("Inter-Madrasah Tournament");
document.body.classList.add("imt-blue-page");

const root = document.getElementById("page-root");
const YEARS = ["2026", "2025"];
const VIEWS = [
  { id: "home", label: "Tournament Home" },
  { id: "schedule", label: "Schedule" },
  { id: "standings", label: "Standings" },
  { id: "bracket", label: "Playoff Bracket" },
  { id: "teams", label: "Teams" },
  { id: "lantern", label: "Lantern Team" },
  { id: "news", label: "News" },
  { id: "media", label: "Photos" },
];

let state = {
  season: "2026",
  view: window.location.hash?.replace("#", "") || "home",
  standingsView: "",
};

function playerHref(playerId = "") {
  return playerId ? `./player.html?id=${encodeURIComponent(playerId)}` : "./players.html";
}

function eventDate(event = {}) {
  return event.date || event.dates || "Date TBA";
}

function eventTime(event = {}) {
  return event.time || event.schedule || "Time TBA";
}

function allTeams(tournament = {}) {
  return (tournament.divisions || []).flatMap((division) =>
    (division.teams || []).map((team) => ({
      ...team,
      divisionId: division.id,
      divisionName: division.name,
      divisionTheme: division.theme || division.id,
    }))
  );
}

function teamById(tournament = {}) {
  return new Map(allTeams(tournament).map((team) => [team.id, team]));
}

function scoreText(match = {}) {
  if (match.activityTitle) return match.status || "Scheduled";
  if (Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore)) {
    const pens = match.penaltyScore ? `, pens ${match.penaltyScore}` : "";
    return `${match.homeScore}-${match.awayScore}${pens}`;
  }
  return "VS";
}

function winnerText(match = {}) {
  if (match.status) return match.status;
  if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return "Coming Soon";
  if (match.homeScore > match.awayScore) return `${match.homeTeamName} win`;
  if (match.awayScore > match.homeScore) return `${match.awayTeamName} win`;
  return "Draw";
}

function logoMark(team = {}, size = "normal") {
  const style = ` style="--logo-bg: ${escapeHTML(team.logoBg || "#dceeff")}"`;
  const teamClass = team.id ? ` imt-logo-${escapeHTML(team.id)}` : "";
  if (team.logo) {
    return `<img class="imt-team-logo ${escapeHTML(size)}${teamClass}" src="${escapeHTML(team.logo)}" alt="${escapeHTML(team.name)} logo"${style}>`;
  }
  return `<span class="imt-team-logo ${escapeHTML(size)} initials${teamClass}"${style}>${escapeHTML(team.logoText || initials(team.name || "IMT", 3))}</span>`;
}

function renderPageChrome(tournament) {
  const event = tournament.event || {};
  const activeView = VIEWS.some((view) => view.id === state.view) ? state.view : "home";
  state.view = activeView;

  const tournamentNav = `
    <nav class="imt-subnav" aria-label="Inter-Madrasah navigation">
      ${VIEWS.map(
        (view) => `
          <button class="${view.id === activeView ? "active" : ""}" type="button" data-imt-view="${escapeHTML(view.id)}">
            ${escapeHTML(view.label)}
          </button>
        `
      ).join("")}
    </nav>
  `;

  return `
    <section class="imt-site-bar">
      <a class="imt-lsl-home" href="./index.html">Back To LSL Home</a>
      <div class="imt-year-control">
        ${controlSelect("imt-year", "Tournament Year", YEARS.map((year) => ({ value: year, label: year })), state.season)}
      </div>
    </section>

    ${tournamentNav}

    <section class="imt-blue-hero">
      <div class="imt-blue-hero-copy">
        <span class="imt-blue-kicker">${escapeHTML(event.edition || "Inter-Madrasah")}</span>
        <h1>${escapeHTML(event.name || "Inter-Madrasah Soccer Tournament")}</h1>
        <p>${escapeHTML(event.headline || "Tournament schedule, teams, standings, and playoff path.")}</p>
        <div class="imt-hero-facts">
          <span>${escapeHTML(eventDate(event))}</span>
          <span>${escapeHTML(eventTime(event))}</span>
          <span>${escapeHTML(event.venue || "Venue TBA")}</span>
        </div>
      </div>
      <aside class="imt-live-card">
        <span>${escapeHTML(event.statusLabel || "Tournament Status")}</span>
        <strong>${escapeHTML(event.currentStatus || event.champion || "Coming Soon")}</strong>
        <p>${escapeHTML(event.address || event.gameLength || "Tournament details coming soon.")}</p>
      </aside>
    </section>
  `;
}

function renderStatusPanel(tournament) {
  const event = tournament.event || {};
  const champion = tournament.playoffs?.champion || event.champion || "Coming Soon";
  const runnerUp = tournament.playoffs?.runnerUp || event.runnerUp || "Coming Soon";
  const nextMatch = (tournament.matches || []).find((match) => !Number.isFinite(match.homeScore) && !match.activityTitle);

  return `
    <section class="imt-status-panel">
      <div class="imt-status-main">
        <span class="imt-blue-kicker">${nextMatch ? "Next Match" : "Tournament Complete"}</span>
        <h2>${escapeHTML(nextMatch ? `${nextMatch.homeTeamName} vs ${nextMatch.awayTeamName}` : `Champion: ${champion}`)}</h2>
        <p>${escapeHTML(nextMatch ? `${nextMatch.time || "Time TBA"} | ${eventDate(event)}` : `Runner-up: ${runnerUp}`)}</p>
      </div>
      <div class="imt-status-mini-grid">
        <article>
          <span>Institutions</span>
          <strong>${allTeams(tournament).length || "TBA"}</strong>
        </article>
        <article>
          <span>Divisions</span>
          <strong>${(tournament.divisions || []).length || "TBA"}</strong>
        </article>
        <article>
          <span>Match Day</span>
          <strong>${escapeHTML(event.gameLength || "25-30 mins")}</strong>
        </article>
      </div>
    </section>
  `;
}

function renderIntroPanel(tournament) {
  const event = tournament.event || {};
  const intro = Array.isArray(event.intro) ? event.intro : [event.intro || "Tournament information is coming soon."];
  return `
    <section class="imt-section imt-intro-panel">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Tournament Intro</span>
        <h2>The Inter-Madrasah Soccer Tournament Is Back</h2>
      </div>
      <div class="imt-intro-copy">
        ${intro.map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("")}
      </div>
      <div class="imt-event-detail-grid">
        <article><span>Date</span><strong>${escapeHTML(eventDate(event))}</strong></article>
        <article><span>Time</span><strong>${escapeHTML(eventTime(event))}</strong></article>
        <article><span>Location</span><strong>${escapeHTML(event.venue || "Venue TBA")}</strong><small>${escapeHTML(event.address || "")}</small></article>
        <article><span>Format</span><strong>${escapeHTML(event.gameLength || "Tournament day")}</strong></article>
      </div>
    </section>
  `;
}

function renderQuickButtons() {
  const buttons = [
    ["schedule", "Schedule"],
    ["standings", "Standings"],
    ["bracket", "Bracket"],
    ["teams", "Teams"],
    ["lantern", "Lantern Team"],
    ["news", "News"],
  ];
  return `
    <section class="imt-quick-actions">
      ${buttons
        .map(
          ([view, label]) => `<button type="button" data-imt-view="${escapeHTML(view)}">${escapeHTML(label)}</button>`
        )
        .join("")}
    </section>
  `;
}

function renderDivisionCards(tournament) {
  const divisions = tournament.divisions || [];
  if (!divisions.length) return statusMessage("empty", "Tournament divisions are coming soon.");
  return `
    <section class="imt-section">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Two Conferences</span>
        <h2>Western And Eastern Division</h2>
      </div>
      <div class="imt-division-card-grid">
        ${divisions
          .map(
            (division) => `
              <article class="imt-division-card ${escapeHTML(division.theme || division.id)}">
                <div class="imt-division-card-head">
                  <span>${escapeHTML(division.name)}</span>
                  <strong>${escapeHTML((division.teams || []).length)} teams</strong>
                </div>
                <p>${escapeHTML(division.description || "Division details coming soon.")}</p>
                <div class="imt-institution-grid">
                  ${(division.teams || [])
                    .map(
                      (team) => `
                        <div class="imt-institution-chip">
                          ${logoMark(team, "small")}
                          <strong>${escapeHTML(team.name)}</strong>
                          ${team.role ? `<small>${escapeHTML(team.role)}</small>` : ""}
                        </div>
                      `
                    )
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderInterestForm(tournament) {
  const form = tournament.event?.interestForm || {};
  const event = tournament.event || {};
  if (!event.interestFormUrl && !form.title) return "";
  return `
    <section class="imt-section imt-form-panel">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Registration Interest</span>
        <h2>${escapeHTML(form.title || event.interestFormLabel || "Inter-Madrasah Interest Form")}</h2>
      </div>
      <div class="imt-form-layout">
        <div>
          ${form.greeting ? `<strong>${escapeHTML(form.greeting)}</strong>` : ""}
          ${(form.body || []).map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join("")}
        </div>
        <aside>
          <span>Team Cost</span>
          <strong>$300</strong>
          <small>Youth born in 2011 or younger.</small>
          ${event.interestFormUrl ? `<a class="imt-blue-button" href="${escapeHTML(event.interestFormUrl)}" target="_blank" rel="noopener">Open Interest Form</a>` : ""}
          ${(form.contacts || []).map((contact) => `<small>${escapeHTML(contact)}</small>`).join("")}
        </aside>
      </div>
    </section>
  `;
}

function renderMediaStrip(tournament) {
  const media = tournament.media || [];
  if (!media.length) return "";
  return `
    <section class="imt-section">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Tournament Photos</span>
        <h2>2026 Gallery</h2>
      </div>
      <div class="imt-media-grid">
        ${media
          .map(
            (item) => `
              <article class="imt-media-card">
                <img src="${escapeHTML(item.src)}" alt="${escapeHTML(item.title)}">
                <div>
                  <strong>${escapeHTML(item.title)}</strong>
                  <p>${escapeHTML(item.caption || "Tournament photo.")}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderNewsPanel(tournament) {
  const news = tournament.news || [];
  if (!news.length) return "";
  return `
    <section class="imt-section">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Tournament News</span>
        <h2>Latest Tournament Notes</h2>
      </div>
      <div class="imt-news-grid">
        ${news
          .map(
            (item) => `
              <article class="imt-news-card">
                <span>${escapeHTML(item.label || "News")}</span>
                <h3>${escapeHTML(item.title || "Tournament update")}</h3>
                <p>${escapeHTML(item.body || "More information coming soon.")}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHome(tournament) {
  return `
    ${renderStatusPanel(tournament)}
    ${renderIntroPanel(tournament)}
    ${renderDivisionCards(tournament)}
    ${renderInterestForm(tournament)}
  `;
}

function renderScheduleRow(match, index) {
  if (match.activityTitle) {
    return `
      <article class="imt-schedule-row break">
        <div class="imt-schedule-time">${escapeHTML(match.time || "Time TBA")}</div>
        <div class="imt-schedule-match">
          <strong>${escapeHTML(match.activityTitle)}</strong>
          <small>${escapeHTML(match.round || "Break")}</small>
        </div>
        <div class="imt-schedule-result">${escapeHTML(match.status || "Break")}</div>
      </article>
    `;
  }

  return `
    <article class="imt-schedule-row ${index % 4 === 2 ? "highlight" : ""}">
      <div class="imt-schedule-time">${escapeHTML(match.time || "Time TBA")}</div>
      <div class="imt-schedule-match">
        <span>${escapeHTML(match.homeTeamName || "Team TBA")}</span>
        <b>VS</b>
        <span>${escapeHTML(match.awayTeamName || "Team TBA")}</span>
        <small>${escapeHTML(match.label || match.round || "Match")}</small>
      </div>
      <div class="imt-schedule-result">
        <strong>${escapeHTML(scoreText(match))}</strong>
        <small>${escapeHTML(winnerText(match))}</small>
      </div>
    </article>
  `;
}

function renderSchedule(tournament) {
  const matches = tournament.matches || [];
  const groups = ["Group Stage", "Break", "Quarter-Finals", "Semi-Finals", "Final"];
  return `
    <section class="imt-section">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Tournament Schedule</span>
        <h2>Saturday Match Timeline</h2>
        <p>${escapeHTML(tournament.event?.gameLength || "Games are 25-30 minutes.")}</p>
      </div>
      <div class="imt-schedule-list">
        ${groups
          .map((group) => {
            const groupMatches = matches.filter((match) => (match.round || "Group Stage") === group);
            if (!groupMatches.length) return "";
            return `
              <div class="imt-schedule-group">
                <h3>${escapeHTML(group)}</h3>
                ${groupMatches.map(renderScheduleRow).join("")}
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function groupStageMatches(tournament, divisionId) {
  return (tournament.matches || []).filter(
    (match) => !match.activityTitle && (!match.round || match.round === "Group Stage") && (!divisionId || match.divisionId === divisionId)
  );
}

function computeDivisionStandings(tournament, division) {
  const records = new Map();
  const ensureRecord = (id, name) => {
    if (!records.has(id)) records.set(id, { teamId: id, team: name, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
    return records.get(id);
  };
  (division.teams || []).forEach((team) => ensureRecord(team.id, team.name));

  groupStageMatches(tournament, division.id).forEach((match) => {
    if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return;
    [
      { id: match.homeTeamId, name: match.homeTeamName, gf: match.homeScore, ga: match.awayScore },
      { id: match.awayTeamId, name: match.awayTeamName, gf: match.awayScore, ga: match.homeScore },
    ].forEach((side) => {
      const record = ensureRecord(side.id, side.name);
      record.gp += 1;
      record.gf += side.gf;
      record.ga += side.ga;
      if (side.gf > side.ga) record.w += 1;
      else if (side.gf < side.ga) record.l += 1;
      else record.d += 1;
    });
  });

  return [...records.values()].map((record) => ({ ...record, gd: record.gf - record.ga, pts: record.w * 3 + record.d }));
}

function sortStandings(rows) {
  return [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
}

function standingsRows(tournament, mode) {
  const divisions = tournament.divisions || [];
  const teams = teamById(tournament);
  const withTeamInfo = (row) => ({ ...row, teamInfo: teams.get(row.teamId) || {} });

  if (mode === "combined") {
    const combined = divisions.flatMap((division) =>
      computeDivisionStandings(tournament, division).map((row) => ({ ...row, divisionName: division.name, divisionTheme: division.theme || division.id }))
    );
    return sortStandings(combined).map((row, index) => ({ ...row, rank: index + 1 })).map(withTeamInfo);
  }

  const selected = divisions.filter((division) => division.id === mode);
  return selected.flatMap((division) =>
    sortStandings(computeDivisionStandings(tournament, division)).map((row, index) => ({
      ...row,
      rank: index + 1,
      divisionName: division.name,
      divisionTheme: division.theme || division.id,
    }))
  ).map(withTeamInfo);
}

function renderStandingsList(rows) {
  if (!rows.length) return statusMessage("empty", "Standings are coming soon.");
  return `
    <div class="imt-standings-list">
      ${rows
        .map(
          (row) => `
            <article class="imt-standings-row ${escapeHTML(row.divisionTheme || "")}">
              <div class="imt-standing-rank ${escapeHTML(row.divisionTheme || "")}">
                <span class="imt-standing-position">${escapeHTML(row.rank)}</span>
                ${logoMark(row.teamInfo, "small")}
              </div>
              <div class="imt-standing-name-text">
                <strong>${escapeHTML(row.team)}</strong>
                <span>${escapeHTML(row.divisionName || "Division")}</span>
              </div>
              <div class="imt-standing-stat"><span>GP</span><strong>${escapeHTML(row.gp)}</strong></div>
              <div class="imt-standing-stat"><span>W</span><strong>${escapeHTML(row.w)}</strong></div>
              <div class="imt-standing-stat"><span>D</span><strong>${escapeHTML(row.d)}</strong></div>
              <div class="imt-standing-stat"><span>L</span><strong>${escapeHTML(row.l)}</strong></div>
              <div class="imt-standing-stat"><span>GF</span><strong>${escapeHTML(row.gf)}</strong></div>
              <div class="imt-standing-stat"><span>GA</span><strong>${escapeHTML(row.ga)}</strong></div>
              <div class="imt-standing-stat"><span>GD</span><strong>${Number(row.gd) > 0 ? `+${row.gd}` : row.gd}</strong></div>
              <div class="imt-standing-stat points"><span>PTS</span><strong>${escapeHTML(row.pts)}</strong></div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStandings(tournament) {
  const options = [
    ...(tournament.divisions || []).map((division) => ({ id: division.id, label: division.name })),
    { id: "combined", label: "Combined" },
  ];
  const activeStandingsView = options.some((option) => option.id === state.standingsView) ? state.standingsView : options[0]?.id || "combined";
  state.standingsView = activeStandingsView;
  const rows = standingsRows(tournament, activeStandingsView);

  return `
    <section class="imt-section">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Standings</span>
        <h2>Division Tables</h2>
        <p>Round robin standings only (no playoff results). Western teams use red accents. Eastern teams use blue accents.</p>
      </div>
      <div class="imt-choice-row" role="tablist" aria-label="Tournament standings view">
        ${options
          .map(
            (option) => `<button class="${activeStandingsView === option.id ? "active" : ""}" type="button" data-imt-standings="${escapeHTML(option.id)}">${escapeHTML(option.label)}</button>`
          )
          .join("")}
      </div>
      ${renderStandingsList(rows)}
    </section>
  `;
}

function renderBracket(tournament) {
  const rounds = tournament.playoffs?.rounds || [];
  const teams = teamById(tournament);
  if (!rounds.length) return statusMessage("empty", "Playoff bracket coming soon.");
  return `
    <section class="imt-section">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Playoff Bracket</span>
        <h2>Road To The Championship</h2>
        <p>${escapeHTML(tournament.playoffs?.format || "Tournament knockout rounds.")}</p>
      </div>
      <div class="imt-bracket">
        ${rounds
          .map(
            (round) => `
              <div class="imt-bracket-round">
                <h3>${escapeHTML(round.name)}</h3>
                ${(round.matches || [])
                  .map(
                    (match) => `
                      <article class="imt-bracket-match">
                        <span>${escapeHTML(match.label || round.name)}</span>
                        <div class="${match.winnerId === match.homeTeamId ? "winner" : ""}">
                          <span class="imt-bracket-team-name">
                            ${logoMark(teams.get(match.homeTeamId) || {}, "small")}
                            <strong>${escapeHTML(match.homeTeamName)}</strong>
                          </span>
                          <b>${escapeHTML(match.homeScore)}</b>
                        </div>
                        <div class="${match.winnerId === match.awayTeamId ? "winner" : ""}">
                          <span class="imt-bracket-team-name">
                            ${logoMark(teams.get(match.awayTeamId) || {}, "small")}
                            <strong>${escapeHTML(match.awayTeamName)}</strong>
                          </span>
                          <b>${escapeHTML(match.awayScore)}</b>
                        </div>
                        ${match.note ? `<p>${escapeHTML(match.note)}</p>` : ""}
                      </article>
                    `
                  )
                  .join("")}
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTeamSchedule(tournament, teamId) {
  const matches = (tournament.matches || []).filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId);
  if (!matches.length) return `<p>Schedule coming soon.</p>`;
  return `
    <div class="imt-team-match-list">
      ${matches
        .map((match) => {
          const opponent = match.homeTeamId === teamId ? match.awayTeamName : match.homeTeamName;
          return `
            <div>
              <span>${escapeHTML(match.time || match.label || "Match")}</span>
              <strong>${escapeHTML(opponent || "Opponent TBA")}</strong>
              <small>${escapeHTML(scoreText(match))}</small>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderRoster(team = {}) {
  const roster = team.roster || [];
  if (!roster.length) return `<p>Roster coming soon.</p>`;
  return `
    <ul class="imt-roster-list">
      ${roster
        .map((player) => {
          const playerId = typeof player === "object" ? player.id : "";
          const name = typeof player === "object" ? player.name : player;
          const jersey = typeof player === "object" && player.jersey ? `#${player.jersey}` : "";
          const role = typeof player === "object" && player.role ? player.role : "Player";
          return `
            <li>
              <a href="${escapeHTML(playerHref(playerId))}">${escapeHTML(name)}</a>
              <span>${escapeHTML([jersey, role].filter(Boolean).join(" | "))}</span>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderTeamCard(tournament, team) {
  return `
    <article class="imt-team-card ${escapeHTML(team.divisionTheme || "")}" id="imt-team-${escapeHTML(team.id)}">
      <div class="imt-team-card-top">
        ${logoMark(team)}
        <div>
          <span>${escapeHTML(team.divisionName || "Tournament Team")}</span>
          <h3>${escapeHTML(team.name)}</h3>
          ${team.role ? `<small>${escapeHTML(team.role)}</small>` : ""}
        </div>
      </div>
      <div class="imt-team-meta">
        ${team.owner ? `<span>Owner: ${escapeHTML(team.owner)}</span>` : ""}
        ${team.coach ? `<span>Coach: ${escapeHTML(team.coach)}</span>` : ""}
        ${team.assistantCoach ? `<span>Assistant: ${escapeHTML(team.assistantCoach)}</span>` : ""}
      </div>
      <details>
        <summary>Roster</summary>
        ${renderRoster(team)}
      </details>
      <details>
        <summary>Schedule</summary>
        ${renderTeamSchedule(tournament, team.id)}
      </details>
    </article>
  `;
}

function renderTeams(tournament) {
  const teams = allTeams(tournament);
  if (!teams.length) return statusMessage("empty", "Tournament teams are coming soon.");
  return `
    <section class="imt-section">
      <div class="imt-section-head">
        <span class="imt-blue-kicker">Teams</span>
        <h2>Institutions And Team Details</h2>
        <p>Open a team card to view roster and schedule details.</p>
      </div>
      <div class="imt-team-grid">
        ${teams.map((team) => renderTeamCard(tournament, team)).join("")}
      </div>
    </section>
  `;
}

function renderLanternTeam(tournament) {
  const lantern = tournament.lanternTeam || allTeams(tournament).find((team) => /lantern/i.test(team.name)) || {};
  const roster = lantern.roster || [];
  const lanternMatches = (tournament.matches || []).filter((match) => match.homeTeamId === "lantern-of-knowledge-academy" || match.awayTeamId === "lantern-of-knowledge-academy");

  return `
    <section class="imt-section">
      <div class="imt-section-head imt-lantern-head">
        ${logoMark(lantern, "small")}
        <div>
          <span class="imt-blue-kicker">Lantern Team</span>
          <h2>${escapeHTML(lantern.name || "Lantern Team")}</h2>
          <p>${escapeHTML(lantern.record || "Lantern tournament details coming soon.")}</p>
        </div>
      </div>
      <div class="imt-lantern-layout">
        <aside class="imt-staff-panel">
          <div><span>Owner</span><strong>${escapeHTML(lantern.owner || "Moulana Junaid")}</strong></div>
          <div><span>Head Coach</span><strong>${escapeHTML(lantern.headCoach || lantern.coach || "Ashique")}</strong></div>
          <div><span>Assistant Coach</span><strong>${escapeHTML(lantern.assistantCoach || "Hafizullah")}</strong></div>
        </aside>
        <div class="imt-lantern-roster">
          ${roster.length ? renderRoster({ roster }) : statusMessage("empty", "Lantern roster coming soon.")}
        </div>
      </div>
      <div class="imt-lantern-results">
        ${lanternMatches
          .map(
            (match) => `
              <article>
                <span>${escapeHTML(match.round || match.label || "Match")}</span>
                <strong>${escapeHTML(match.homeTeamName)} ${escapeHTML(scoreText(match))} ${escapeHTML(match.awayTeamName)}</strong>
                <small>${escapeHTML(match.status || "Result")}</small>
              </article>
            `
          )
          .join("") || statusMessage("empty", "Lantern results coming soon.")}
      </div>
    </section>
  `;
}

function renderView(tournament) {
  switch (state.view) {
    case "schedule":
      return renderSchedule(tournament);
    case "standings":
      return renderStandings(tournament);
    case "bracket":
      return renderBracket(tournament);
    case "teams":
      return renderTeams(tournament);
    case "lantern":
      return renderLanternTeam(tournament);
    case "news":
      return renderNewsPanel(tournament) + renderInterestForm(tournament);
    case "media":
      return renderMediaStrip(tournament);
    case "home":
    default:
      return renderHome(tournament);
  }
}

function hydrate(tournament) {
  document.getElementById("imt-year")?.addEventListener("change", async (event) => {
    state.season = event.target.value;
    state.view = "home";
    state.standingsView = "";
    window.history.replaceState(null, "", window.location.pathname);
    render(await loadSeasonData(state.season));
  });

  root.querySelectorAll("[data-imt-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.imtView || "home";
      window.history.replaceState(null, "", `#${state.view}`);
      render({ tournament });
    });
  });

  root.querySelectorAll("[data-imt-standings]").forEach((button) => {
    button.addEventListener("click", () => {
      state.standingsView = button.dataset.imtStandings || "combined";
      render({ tournament });
    });
  });
}

function normalize2025Tournament(tournament = {}) {
  if (tournament.event?.date || tournament.event?.headline) return tournament;
  const champion = tournament.playoffs?.champion || "Hifz City";
  return {
    ...tournament,
    event: {
      ...(tournament.event || {}),
      edition: tournament.season ? `${tournament.season} Tournament` : "Tournament Archive",
      headline: "Tournament archive with divisions, teams, match results, and playoff history.",
      statusLabel: "Tournament Archive",
      currentStatus: `Champion: ${champion}`,
      champion,
      date: tournament.event?.dates,
      time: tournament.event?.schedule,
      gameLength: "Full day tournament",
      intro: [
        "The first Inter-Madrasah Soccer Tournament brought together multiple madrasah teams for a full day of competition.",
        "Use the year selector to compare tournament seasons."
      ],
    },
  };
}

function render(data) {
  const tournament = normalize2025Tournament(data.tournament || {});
  if (!tournament) {
    root.innerHTML = statusMessage("empty", "Tournament page coming soon.");
    return;
  }

  root.innerHTML = `
    <div class="imt-page-shell">
      ${renderPageChrome(tournament)}
      ${renderView(tournament)}
    </div>
  `;
  hydrate(tournament);
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading tournament...");
  try {
    render(await loadSeasonData(state.season));
  } catch (error) {
    console.error(error);
    root.innerHTML = statusMessage("error", "Tournament page is coming soon.");
  }
}

init();
