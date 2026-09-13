import { buildPlayerCareer, computeCombinedPlayerStats, computePlayerStats, getAwards } from "./leagueEngine.js?v=3.12";
import { loadAllSeasons } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage, unique } from "./utils.js";

setupLayout("hall-of-fame.html");
setDocumentTitle("Hall of Fame");

const root = document.getElementById("page-root");

const HALL_OF_FAME_CLASS = [
  {
    id: "hafizullah",
    name: "Hafizullah",
    era: "2024-2025",
    title: "The original scoring standard",
    badge: "Founding Legend",
    accent: "gold",
    teams: "Asif Gangat United",
    titles: 0,
    honors: "2024 Team MVP; 2025 Seniors MVP and Golden Boot",
    achievements: [
      "Set the early LSL Seniors regular-season goals record with 13 goals.",
      "Won the 2025 Seniors MVP and Golden Boot after another outstanding scoring season.",
      "Retired at 17 and left a benchmark that Muzamil Kharooti and Mudassir later chased.",
    ],
    impact: "Hafizullah gave the league its first true scoring benchmark. Even after retirement, his record shaped the conversation around every elite LSL scorer that followed.",
  },
  {
    id: "muzamil-kharooti",
    name: "Muzamil Kharooti",
    era: "2024-2026",
    title: "The championship scorer",
    badge: "Three-Season Great",
    accent: "green",
    teams: "Refuel Juicery Kickers / Umer Memon FC / EM Haulers FC",
    titles: 2,
    honors: "2024 Seniors MVP and Golden Boot; 2025 and 2026 Seniors champion",
    achievements: [
      "Won the 2024 Seniors MVP and Golden Boot with Refuel Juicery Kickers.",
      "Won back-to-back Seniors championships with Umer Memon FC in 2025 and EM Haulers FC in 2026.",
      "Scored in every round of EM's 2026 playoff run, including the Championship Final.",
      "Finished with 24 career goals across three seasons and 24 games played.",
    ],
    impact: "Muzamil combined elite scoring with championship influence. He is one of the few players whose career changed teams, won titles, and still delivered when the trophy was on the line.",
  },
  {
    id: "mudassir",
    name: "Mudassir",
    era: "2025-2026",
    title: "The record-setting season",
    badge: "Record Holder",
    accent: "gold",
    teams: "Islamic Bookstore Runners / Leeward Lions",
    titles: 0,
    honors: "2026 Seniors Golden Boot; 2026 regular-season champion",
    achievements: [
      "Scored 16 regular-season goals in 2026, the best single-season Seniors total on record.",
      "Set the Seniors single-game record with five goals against Memon Mavericks.",
      "Finished the 2026 season with 20 goals across regular-season and playoff matches.",
      "Led Leeward Lions to the 2026 regular-season title and the Championship Final.",
    ],
    impact: "Mudassir changed the scale of LSL scoring. His 2026 season was not only productive; it reset the single-season and single-game standards for every player who comes next.",
  },
  {
    id: "haroon-ahmadi",
    name: "Haroon Ahmadi",
    era: "2026",
    title: "The championship finisher",
    badge: "Finals Hero",
    accent: "green",
    teams: "EM Haulers FC",
    titles: 1,
    honors: "2026 Seniors MVP; 2026 LSL champion",
    achievements: [
      "Scored 13 regular-season goals and finished second in the 2026 Seniors scoring race.",
      "Scored four playoff goals, including goals in every playoff round.",
      "Scored the championship-winning goal in the final five minutes of extra time.",
      "Helped EM Haulers FC complete a perfect 3-0 playoff run.",
    ],
    impact: "Haroon turned a great season into a championship legacy. His scoring was consistent all year, but his defining contribution came when EM needed one final goal to lift the Cup.",
  },
  {
    id: "ajmal-shakkari",
    name: "Ajmal Chakkari",
    era: "2025-2026",
    title: "The cross-division standout",
    badge: "Two-Division Star",
    accent: "blue",
    teams: "Dhahabiya Strikers / Leeward Lions",
    titles: 1,
    honors: "2025 Juniors MVP and Golden Boot; 2025 Juniors champion",
    achievements: [
      "Won the 2025 Juniors MVP and Golden Boot after scoring 10 goals for Dhahabiya Strikers.",
      "Won the 2025 Juniors championship with Dhahabiya Strikers.",
      "Moved into the Seniors League with Leeward Lions and scored eight regular-season goals in 2026.",
      "Added a playoff goal and finished 2026 with nine goals across all competitions.",
    ],
    impact: "Ajmal's place is built on range. He dominated the Juniors division, then carried that scoring ability into the Seniors League and became part of Leeward's record-setting attack.",
  },
  {
    id: "usman-ahmad-popal",
    name: "Usman Ahmad Popal",
    position: "Goalie",
    era: "2026",
    title: "The goalkeeper masterclass",
    badge: "Goalkeeper Great",
    accent: "blue",
    teams: "Leeward Lions",
    titles: 0,
    honors: "2026 Seniors Best Goalkeeper",
    achievements: [
      "Won the 2026 LSL Seniors Best Goalkeeper award.",
      "Helped Leeward Lions finish first in the regular season and reach the Championship Final.",
      "Anchored one of the league's most difficult defenses during Leeward's run to the title match.",
    ],
    impact: "Usman's induction recognizes the other side of greatness. His command of the goal gave Leeward the foundation to turn a powerful attack into a regular-season championship run.",
  },
  {
    id: "m-yahya",
    name: "M Yahya",
    era: "2025-2026",
    title: "The multi-season scorer",
    badge: "Scoring Standout",
    accent: "gold",
    teams: "Refuel Juicery Athletic / Sharp Strikers",
    titles: 0,
    honors: "2026 four-goal performance and multi-season scoring impact",
    achievements: [
      "Produced a four-goal performance for Sharp Strikers in Week 3 of the 2026 season.",
      "Scored important goals across multiple seasons and remained one of the league's most dangerous attacking players.",
      "Continued to provide high-impact attacking performances for Sharp Strikers in 2026.",
    ],
    impact: "M Yahya's Hall of Fame case is built on repeat scoring influence. His four-goal 2026 performance and multi-season attacking impact established him as one of the league's most dangerous scorers.",
  },
  {
    id: "mohammed-ibrahim",
    name: "Mohammad Ibrahim",
    era: "2025-2026",
    title: "The multi-season leader",
    badge: "Team MVP Leader",
    accent: "green",
    teams: "Refuel Juicery Athletic / Rawaha Royals",
    titles: 0,
    honors: "2025 Refuel Juicery Athletic Team MVP; 2026 Rawaha Royals captain",
    achievements: [
      "Won Refuel Juicery Athletic's 2025 Team MVP after leading the club's attack.",
      "Returned as a major scoring presence for Rawaha Royals in the 2026 Seniors season.",
      "Delivered multiple multi-goal performances, including two goals in Week 5 and two more in Week 6.",
      "Continued to influence the league as a captain while competing across multiple seasons.",
    ],
    impact: "Mohammad Ibrahim represents the players who make a league feel continuous. His scoring, leadership, and ability to matter for different clubs made him one of LSL's most reliable multi-season contributors.",
  },
];

function playerHref(id) {
  return `./player.html?id=${encodeURIComponent(id)}`;
}

function numberStat(stats, key) {
  if (!stats) return "Coming Soon";
  return Number.isFinite(Number(stats[key])) ? Number(stats[key]) : 0;
}

function isGoalkeeper(member, stats) {
  return /goal|keeper|goalie|gk/i.test(`${member.position || ""} ${stats?.position || ""}`);
}

function goalkeeperStat(stats, key) {
  const value = Number(stats?.[key]);
  if (!Number.isFinite(value)) return "Coming Soon";
  return key === "goalsAgainstPerGame" ? value.toFixed(2) : value;
}

const HOF_RECORD_MARKS = {
  hafizullah: ["13-goal Seniors regular-season benchmark"],
  "muzamil-kharooti": ["Back-to-back Seniors champion", "Scored in every round of the 2026 playoff run"],
  mudassir: ["2026 Seniors single-season goals record: 16", "Seniors single-game record: 5 goals"],
  "haroon-ahmadi": ["2026 championship-winning goal", "Perfect 3-0 playoff run with EM Haulers FC"],
  "ajmal-shakkari": ["2025 Juniors champion", "Cross-division MVP and Golden Boot winner"],
  "usman-ahmad-popal": ["2026 Best Goalkeeper", "Leeward Lions defensive leader"],
  "m-yahya": ["Four-goal 2026 performance", "Multi-season scoring presence"],
  "mohammed-ibrahim": ["2025 Team MVP", "Multi-season captain and scoring leader"],
};

function renderCareerTimeline(allData, member) {
  const rows = allData
    .map((data) => {
      const season = computePlayerStats(data, { stage: "all" }).find((player) => player.id === member.id);
      if (!season) return "";
      const awards = getAwards([data], { season: data.year, division: "All" })
        .filter((award) => award.playerId === member.id || award.teamId === season.teamId)
        .map((award) => award.category)
        .filter(Boolean);
      const details = [`${season.gamesPlayed || 0} games`, `${season.goals || 0} goals`, `${season.wins || 0} wins`];
      if (awards.length) details.push(...awards);
      return `
        <div class="hof-timeline-row">
          <strong>${escapeHTML(data.year)}</strong>
          <div>
            <b>${escapeHTML(season.teamName || "Team not listed")}</b>
            <span>${escapeHTML(unique(details).join(" | "))}</span>
          </div>
        </div>
      `;
    })
    .filter(Boolean);

  if (!rows.length) return `<p class="hof-muted-copy">Career timeline coming soon.</p>`;
  return `<div class="hof-timeline-list">${rows.join("")}</div>`;
}

function renderRecordMarks(member) {
  const marks = HOF_RECORD_MARKS[member.id] || [];
  if (!marks.length) return `<p class="hof-muted-copy">Record marks coming soon.</p>`;
  return `<div class="hof-record-mark-list">${marks
    .map((mark) => {
      const isRecord = /record|benchmark|performance|leader/i.test(mark);
      return `<span class="hof-record-mark"><b>${escapeHTML(mark)}</b><small>${isRecord ? "Still Holds Record" : "Career Mark"}</small></span>`;
    })
    .join("")}</div>`;
}

function renderMember(member, stats, index, allData) {
  const name = stats?.name || member.name;
  const goalkeeper = isGoalkeeper(member, stats);
  const flameSparks = [
    ["8px", "17px", "-0.2s", "-8px"],
    ["18px", "25px", "-1.1s", "6px"],
    ["29px", "14px", "-1.8s", "-5px"],
    ["39px", "22px", "-0.6s", "9px"],
    ["49px", "12px", "-2.3s", "-7px"],
  ]
    .map(([left, height, delay, drift]) => `<i style="--spark-left:${left};--spark-height:${height};--spark-delay:${delay};--spark-drift:${drift}"></i>`)
    .join("");
  return `
    <article class="hof-member-card hof-member-card--${escapeHTML(member.accent)}" style="--hof-order: ${index + 1}">
      <div class="hof-player-flame" aria-hidden="true">${flameSparks}</div>
      <div class="hof-member-topline">
        <span class="hof-member-number">${String(index + 1).padStart(2, "0")}</span>
        <div class="hof-member-topline-right">
          <span class="hof-member-trophy-count">${escapeHTML(member.titles)} ${member.titles === 1 ? "Trophy" : "Trophies"}</span>
          <span class="hof-member-badge">${escapeHTML(member.badge)}</span>
        </div>
      </div>
      <div class="hof-member-heading">
        <div>
          <span class="eyebrow">${escapeHTML(member.era)} LSL Career</span>
          <h2>${escapeHTML(name)}</h2>
          <p>${escapeHTML(member.title)}</p>
        </div>
        <span class="hof-laurel" aria-hidden="true">HOF</span>
      </div>
      <div class="hof-member-teams">
        <span>Clubs</span>
        <strong>${escapeHTML(member.teams)}</strong>
      </div>
      <div class="hof-career-stats" aria-label="Career snapshot">
        <span class="${goalkeeper ? "hof-career-stat--goalie" : ""}"><strong>${escapeHTML(goalkeeper ? goalkeeperStat(stats, "goalsAgainstPerGame") : numberStat(stats, "goals"))}</strong><small>${goalkeeper ? "Goals Against Average" : "Goals"}</small></span>
        <span><strong>${escapeHTML(numberStat(stats, "gamesPlayed"))}</strong><small>Games</small></span>
        <span><strong>${escapeHTML(goalkeeper ? goalkeeperStat(stats, "cleanSheets") : numberStat(stats, "wins"))}</strong><small>${goalkeeper ? "Clean Sheets" : "Wins"}</small></span>
        <span><strong>${escapeHTML(member.titles)}</strong><small>Titles</small></span>
      </div>
      <div class="hof-member-detail-block">
        <div class="hof-member-detail-head"><span class="eyebrow">Career Timeline</span></div>
        ${renderCareerTimeline(allData, member)}
      </div>
      <div class="hof-member-detail-block">
        <div class="hof-member-detail-head"><span class="eyebrow">Records & Marks</span></div>
        ${renderRecordMarks(member)}
      </div>
      <div class="hof-member-copy">
        <h3>Why they earned a spot</h3>
        <ul>${member.achievements.map((achievement) => `<li>${escapeHTML(achievement)}</li>`).join("")}</ul>
        <p>${escapeHTML(member.impact)}</p>
      </div>
      <a class="button small" href="${escapeHTML(playerHref(member.id))}">View player profile</a>
    </article>
  `;
}

function renderTrophyRoom(allData) {
  const champions = getAwards(allData, { season: "All", division: "All" })
    .filter((award) => award.category === "Champion Team")
    .sort((a, b) => Number(a.season) - Number(b.season));

  if (!champions.length) return "";
  const trophyImages = [
    { test: /2024.*shifa/i, src: "./Photos and Videos/HOF/2024 Shifa.png" },
    { test: /2025.*dhahabiya/i, src: "./Photos and Videos/HOF/2025 Dhahabiya Strikers .jpg" },
    { test: /2025.*umer memon/i, src: "./Photos and Videos/HOF/2025 Umer Memon FC.jpg" },
    { test: /2026.*em haulers/i, src: "./Photos and Videos/HOF/2026 EM Haulers FC.jpg" },
  ];
  const trophyCounts = new Map();
  champions.forEach((award) => trophyCounts.set(award.teamId, (trophyCounts.get(award.teamId) || 0) + 1));
  return `
    <section class="section-panel hof-trophy-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">The Trophy Room</span>
          <h2>Championship Gallery</h2>
          <p>Each championship season gets its own place in the LSL archive. Trophy photos are coming soon.</p>
        </div>
      </div>
      <div class="hof-trophy-grid">
        ${champions
          .map(
            (award, index) => {
              const trophyImage = trophyImages.find(({ test }) => test.test(`${award.season} ${award.teamName || award.winner || ""}`))?.src;
              const seasonData = allData.find((data) => String(data.year) === String(award.season));
              const team = seasonData?.teams?.find((item) => item.id === award.teamId);
              const teamName = award.teamName || team?.name || award.winner || "Champion Team";
              const photoAlt = `${award.season} ${teamName} championship team`;
              const trophyClass = award.season === "2024" && award.division === "Seniors"
                ? " hof-trophy-card--2024-seniors"
                : award.season === "2026" && award.division === "Seniors"
                  ? " hof-trophy-card--2026-seniors"
                  : award.season === "2025" && award.division === "Seniors"
                    ? " hof-trophy-card--2025-seniors"
                    : award.season === "2025" && award.division === "Juniors"
                      ? " hof-trophy-card--2025-juniors"
                      : "";
              const photoMarkup = trophyImage
                ? `<button class="hof-trophy-photo has-image" type="button" data-hof-photo="${escapeHTML(trophyImage)}" data-hof-photo-alt="${escapeHTML(photoAlt)}" aria-label="Open full-size ${escapeHTML(photoAlt)} photo"><img src="${escapeHTML(trophyImage)}" alt="${escapeHTML(photoAlt)}"><span class="hof-photo-open">Open Photo</span></button>`
                : `<div class="hof-trophy-photo" aria-label="${escapeHTML(`${award.season} trophy photo coming soon`)}"><span>PHOTO</span><strong>Coming Soon</strong></div>`;
              return `
              <article class="hof-trophy-card${trophyClass}" style="--hof-order: ${index + 1}">
                ${photoMarkup}
                <div>
                  <span class="eyebrow">${escapeHTML(award.season)} ${escapeHTML(award.division || "")} Champions</span>
                  <div class="hof-trophy-title-row">
                    ${team?.logo ? `<img class="hof-trophy-team-logo" src="${escapeHTML(team.logo)}" alt="${escapeHTML(teamName)} logo">` : ""}
                    <h3>${escapeHTML(teamName)}</h3>
                  </div>
                  <span class="hof-trophy-count">${trophyCounts.get(award.teamId) || 1} ${(trophyCounts.get(award.teamId) || 1) === 1 ? "Trophy" : "Trophies"}</span>
                  <p>${escapeHTML(trophyImage ? "Championship team photo" : "Championship photo coming soon")}</p>
                </div>
              </article>
              `;
            }
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHallTools() {
  const options = HALL_OF_FAME_CLASS.map((member) => `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)}</option>`).join("");
  const secondOptions = HALL_OF_FAME_CLASS.map((member, index) => `<option value="${escapeHTML(member.id)}"${index === 1 ? " selected" : ""}>${escapeHTML(member.name)}</option>`).join("");
  return `
    <section class="section-panel hof-tools-panel">
      <div class="hof-tool-toggle-row">
        <div>
          <span class="eyebrow">Compare The Legends</span>
          <h2>Player Comparison</h2>
          <p>Open the tool to compare Hall of Fame careers side by side.</p>
        </div>
        <button class="button secondary" type="button" data-hof-toggle="comparison" aria-expanded="false" aria-controls="hof-comparison-body">Show Comparison</button>
      </div>
      <div id="hof-comparison-body" class="hof-tool-body" hidden>
        <div class="hof-comparison-controls">
          <label><span>Player One</span><select data-hof-compare="one">${options}</select></label>
          <label><span>Player Two</span><select data-hof-compare="two">${secondOptions}</select></label>
        </div>
        <div data-hof-comparison-result></div>
      </div>
    </section>
    <section class="section-panel hof-tools-panel">
      <div class="hof-tool-toggle-row">
        <div>
          <span class="eyebrow">The Ceremony</span>
          <h2>Induction Notes</h2>
          <p>The official notes behind the current Hall of Fame class.</p>
        </div>
      </div>
      <div id="hof-ceremony-body" class="hof-tool-body">
        <p class="hof-ceremony-intro">This is the founding Hall of Fame class. Each player was selected for a combination of records, championships, major honors, goalkeeper excellence, or lasting influence on the league.</p>
        <div class="hof-ceremony-list">
          ${HALL_OF_FAME_CLASS.map((member) => `<div><strong>${escapeHTML(member.name)}</strong><span>${escapeHTML(member.badge)} | ${escapeHTML(member.honors)}</span></div>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderComparison(allData, firstId, secondId) {
  const stats = new Map(computeCombinedPlayerStats(allData, { stage: "all" }).map((player) => [player.id, player]));
  const first = stats.get(firstId) || {};
  const second = stats.get(secondId) || {};
  const firstMember = HALL_OF_FAME_CLASS.find((member) => member.id === firstId) || {};
  const secondMember = HALL_OF_FAME_CLASS.find((member) => member.id === secondId) || {};
  const metrics = [
    ["Goals", numberStat(first, "goals"), numberStat(second, "goals")],
    ["Games Played", numberStat(first, "gamesPlayed"), numberStat(second, "gamesPlayed")],
    ["Wins", numberStat(first, "wins"), numberStat(second, "wins")],
    ["Championships", firstMember.titles || 0, secondMember.titles || 0],
  ];
  const decisionMetrics = metrics.filter(([label]) => label !== "Games Played");
  const firstEdges = decisionMetrics.filter(([, left, right]) => Number(left) > Number(right)).length;
  const secondEdges = decisionMetrics.filter(([, left, right]) => Number(right) > Number(left)).length;
  const verdict = firstEdges === secondEdges
    ? "Even matchup"
    : firstEdges > secondEdges
      ? `Better Player: ${first.name || firstMember.name}`
      : `Better Player: ${second.name || secondMember.name}`;
  const verdictDetail = firstEdges === secondEdges
    ? "The selected players are level across the comparison categories."
    : `${Math.max(firstEdges, secondEdges)} of ${decisionMetrics.length} career categories favor the winner.`;
  return `
    <div class="hof-comparison-table">
      <div class="hof-comparison-head"><strong>${escapeHTML(first.name || firstMember.name)}</strong><span>Career Metric</span><strong>${escapeHTML(second.name || secondMember.name)}</strong></div>
      ${metrics.map(([label, left, right]) => `<div class="hof-comparison-row"><strong>${escapeHTML(left)}</strong><span>${escapeHTML(label)}</span><strong>${escapeHTML(right)}</strong></div>`).join("")}
    </div>
    <div class="hof-comparison-verdict">
      <span class="eyebrow">Career Verdict</span>
      <strong>${escapeHTML(verdict)}</strong>
      <small>${escapeHTML(verdictDetail)}</small>
    </div>
  `;
}

function setupHallControls(allData) {
  const search = document.querySelector("[data-hof-search]");
  const cards = [...document.querySelectorAll("[data-hof-card]")];
  const empty = document.querySelector("[data-hof-search-empty]");
  search?.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const visible = !query || card.textContent.toLowerCase().includes(query);
      card.hidden = !visible;
      if (visible) shown += 1;
    });
    if (empty) empty.hidden = shown > 0;
  });

  document.querySelectorAll("[data-hof-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(`hof-${button.dataset.hofToggle}-body`);
      if (!panel) return;
      const isOpen = !panel.hidden;
      panel.hidden = isOpen;
      button.setAttribute("aria-expanded", String(!isOpen));
      button.textContent = isOpen
        ? button.dataset.hofToggle === "comparison" ? "Show Comparison" : "Show Ceremony Notes"
        : button.dataset.hofToggle === "comparison" ? "Hide Comparison" : "Hide Ceremony Notes";
    });
  });

  const updateComparison = () => {
    const selects = [...document.querySelectorAll("[data-hof-compare]")];
    const first = selects.find((select) => select.dataset.hofCompare === "one")?.value;
    const second = selects.find((select) => select.dataset.hofCompare === "two")?.value;
    const target = document.querySelector("[data-hof-comparison-result]");
    if (target) target.innerHTML = renderComparison(allData, first, second);
  };
  document.querySelectorAll("[data-hof-compare]").forEach((select) => select.addEventListener("change", updateComparison));
  updateComparison();

  document.querySelector("[data-hof-replay]")?.addEventListener("click", () => {
    document.body.classList.remove("hof-is-ready");
    void document.body.offsetWidth;
    startHallOfFameReveal();
  });

  const lightbox = document.querySelector("[data-hof-lightbox]");
  const lightboxImage = lightbox?.querySelector("[data-hof-lightbox-image]");
  const lightboxCaption = lightbox?.querySelector("[data-hof-lightbox-caption]");
  const closeLightbox = () => {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.classList.remove("hof-lightbox-open");
    if (lightboxImage) lightboxImage.removeAttribute("src");
  };
  document.querySelectorAll("[data-hof-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!lightbox || !lightboxImage) return;
      lightboxImage.src = button.dataset.hofPhoto || "";
      lightboxImage.alt = button.dataset.hofPhotoAlt || "Championship team photo";
      if (lightboxCaption) lightboxCaption.textContent = button.dataset.hofPhotoAlt || "Championship team photo";
      lightbox.hidden = false;
      document.body.classList.add("hof-lightbox-open");
      lightbox.querySelector("[data-hof-lightbox-close]")?.focus();
    });
  });
  lightbox?.querySelector("[data-hof-lightbox-close]")?.addEventListener("click", closeLightbox);
  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox && !lightbox.hidden) closeLightbox();
  });
}

function launchHallOfFameConfetti() {
  const container = document.querySelector(".hof-confetti");
  if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const colors = ["#d4af37", "#f4df9b", "#4fa56a", "#6a9bd7", "#ffffff"];
  const pieces = Array.from({ length: 42 }, (_, index) => {
    const piece = document.createElement("span");
    piece.className = "hof-confetti-piece";
    piece.style.setProperty("--confetti-x", `${Math.round(Math.random() * 100)}%`);
    piece.style.setProperty("--confetti-delay", `${(Math.random() * 1.1).toFixed(2)}s`);
    piece.style.setProperty("--confetti-duration", `${(3.3 + Math.random() * 1.8).toFixed(2)}s`);
    piece.style.setProperty("--confetti-drift", `${Math.round((Math.random() - 0.5) * 180)}px`);
    piece.style.setProperty("--confetti-rotate", `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.backgroundColor = colors[index % colors.length];
    return piece;
  });

  container.replaceChildren(...pieces);
  window.setTimeout(() => container.classList.add("is-complete"), 5200);
}

function launchHallOfFameEmbers() {
  const field = document.querySelector(".hof-ember-field");
  if (!field || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const embers = Array.from({ length: 22 }, (_, index) => {
    const ember = document.createElement("span");
    ember.className = "hof-ember";
    ember.style.setProperty("--ember-x", `${Math.round(Math.random() * 100)}%`);
    ember.style.setProperty("--ember-delay", `${(Math.random() * 3.6).toFixed(2)}s`);
    ember.style.setProperty("--ember-duration", `${(4.2 + Math.random() * 3).toFixed(2)}s`);
    ember.style.setProperty("--ember-drift", `${Math.round((Math.random() - 0.5) * 110)}px`);
    ember.style.setProperty("--ember-size", `${(2.5 + Math.random() * 4).toFixed(1)}px`);
    ember.style.setProperty("--ember-hue", index % 3 === 0 ? "#fff1b7" : index % 3 === 1 ? "#f4b45b" : "#d4af37");
    return ember;
  });

  field.replaceChildren(...embers);
}

function startHallOfFameReveal() {
  window.requestAnimationFrame(() => {
    document.body.classList.add("hof-is-ready");
    launchHallOfFameConfetti();
    launchHallOfFameEmbers();
  });
}

function render(allData) {
  const stats = computeCombinedPlayerStats(allData, { stage: "all" });
  const statsById = new Map(stats.map((player) => [player.id, player]));
  root.innerHTML = `
    <div class="hof-confetti" aria-hidden="true"></div>
    <section class="section-panel hof-hero-panel">
      <div class="hof-cinema-lights" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="hof-ember-field" aria-hidden="true"></div>
      <div class="hof-boom-wave" aria-hidden="true"></div>
      <div class="hof-hero-copy">
        <span class="eyebrow">Lantern Soccer League</span>
        <h1>The LSL Hall of Fame</h1>
        <p>Players whose records, championships, awards, and influence changed the story of the league.</p>
        <div class="hof-hero-actions">
          <a class="button primary" href="./records.html">Explore LSL Records</a>
          <button class="button secondary" type="button" data-hof-replay>Replay Ceremony</button>
          <span class="hof-hero-note">Hall of Fame Class | ${HALL_OF_FAME_CLASS.length} players</span>
        </div>
      </div>
      <div class="hof-hero-emblem" aria-hidden="true">
        <div class="hof-emblem-coin">
          <span>LSL</span>
          <strong>HOF</strong>
          <small>LEGENDS</small>
        </div>
        <i class="hof-burn-mark hof-burn-mark--one"></i>
        <i class="hof-burn-mark hof-burn-mark--two"></i>
        <i class="hof-burn-mark hof-burn-mark--three"></i>
        <i class="hof-emblem-spark hof-emblem-spark--one"></i>
        <i class="hof-emblem-spark hof-emblem-spark--two"></i>
        <i class="hof-emblem-spark hof-emblem-spark--three"></i>
        <i class="hof-emblem-spark hof-emblem-spark--four"></i>
        <i class="hof-emblem-spark hof-emblem-spark--five"></i>
      </div>
    </section>

    <section class="section-panel hof-standard-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">The Standard</span>
          <h2>What earns a place in the Hall?</h2>
          <p>Hall of Fame recognition is reserved for players whose influence reaches beyond one match or one season.</p>
        </div>
      </div>
      <div class="hof-standard-grid">
        <div><strong>Records</strong><span>Set or chased marks that define LSL history.</span></div>
        <div><strong>Championships</strong><span>Delivered when the league's biggest games mattered most.</span></div>
        <div><strong>Honors</strong><span>Won MVP, Golden Boot, goalkeeper, or division awards.</span></div>
        <div><strong>Legacy</strong><span>Left a lasting impact on teammates, clubs, and the league.</span></div>
      </div>
    </section>

    ${renderTrophyRoom(allData)}

    <section class="hof-members-section" aria-labelledby="hof-members-title">
      <div class="section-head compact-head hof-section-heading">
        <div>
          <span class="eyebrow">The Legends</span>
          <h2 id="hof-members-title">LSL Hall of Fame Class</h2>
          <p>${HALL_OF_FAME_CLASS.length} players whose careers represent the records, moments, and character that make the LSL special.</p>
        </div>
        <label class="hof-search-control">
          <span>Find a legend</span>
          <input type="search" data-hof-search placeholder="Search by name, badge, or team">
        </label>
      </div>
      <div class="hof-member-grid">
        ${HALL_OF_FAME_CLASS.map((member, index) => `<div data-hof-card>${renderMember(member, statsById.get(member.id), index, allData)}</div>`).join("")}
      </div>
      <p class="hof-search-empty" data-hof-search-empty hidden>No Hall of Fame players match that search.</p>
    </section>

    ${renderHallTools()}
    <div class="hof-lightbox" data-hof-lightbox hidden role="dialog" aria-modal="true" aria-label="Championship photo viewer">
      <div class="hof-lightbox-panel">
        <button class="hof-lightbox-close" type="button" data-hof-lightbox-close aria-label="Close photo viewer">Close</button>
        <img data-hof-lightbox-image alt="">
        <p data-hof-lightbox-caption></p>
      </div>
    </div>
  `;

  setupHallControls(allData);
  startHallOfFameReveal();
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading the LSL Hall of Fame...");
  try {
    render(await loadAllSeasons());
  } catch (error) {
    console.error("Could not load the LSL Hall of Fame", error);
    root.innerHTML = statusMessage("error", "The Hall of Fame is temporarily unavailable. Please try again soon.");
  }
}

init();
