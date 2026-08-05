import { SITE } from "./config.js";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";
import {
  CAP_MAX,
  CAPTAIN_MORALE_BONUS,
  CAPTAIN_RATING_BONUS,
  DIFFICULTIES,
  DRAFT_ROUNDS,
  FORMATIONS,
  MAX_CONTRACT_YEARS,
  SEASON_WEEKS,
  STARTING_XI_SIZE,
  TRADE_DEADLINE_WEEK,
  advanceWeek,
  applyTraining,
  autoAdvanceCpuPicks,
  availablePlayers,
  clearFranchiseSave,
  computeChemistry,
  computeFranchiseRecords,
  createFranchiseSave,
  currentPick,
  difficultySettings,
  draftPlayer,
  evaluateTradeOffer,
  executeTrade,
  finalizeDraftContracts,
  formatMoney,
  freeAgentPool,
  isDraftComplete,
  isTradeDeadlinePassed,
  loadFranchiseConfig,
  loadFranchisePlayerPool,
  loadFranchiseSave,
  pickTradeValue,
  playerTradeValue,
  proposeCpuToCpuTrade,
  runPlayoffs,
  saveFranchiseSave,
  seasonStatLeaders,
  setAssistantCaptain,
  setCaptain,
  setLineup,
  signFreeAgent,
  standingsForSave,
  startDraft,
  startNextSeason,
  startSeason,
  teamCapSpace,
  teamCapUsed,
  waivePlayer,
} from "./franchiseCore.js";

setupLayout("franchise.html");
setDocumentTitle("Franchise Mode");

const root = document.getElementById("page-root");

let pickedTeamId = "";
let pickedDifficulty = "medium";
let playerPool = [];
let draftPositionFilter = "All";
let tradePartnerId = "";
let tradeGivePlayerIds = new Set();
let tradeReceivePlayerIds = new Set();
let tradeGivePick = false;
let tradeReceivePick = false;
let tradeMessage = null;
let cpuTradeMessage = null;
let trainingPlayerId = "";
let trainingMessage = null;
let lineupFormation = "";
let lineupSelection = new Set();
let lineupSelectionInit = false;
let lineupMessage = null;
let freeAgencyPositionFilter = "All";
let freeAgencyMessage = null;
let nextSeasonMessage = null;
let currentPage = "home";
let draftBoardTeamId = "";

const PAGES = [
  { id: "home", label: "Home" },
  { id: "hub", label: "Franchise Hub" },
  { id: "draft", label: "Draft Centre" },
  { id: "team", label: "Team Management" },
  { id: "trade", label: "Trade Centre" },
  { id: "freeagency", label: "Free Agency" },
  { id: "stats", label: "Statistics" },
  { id: "records", label: "Records" },
  { id: "awards", label: "Awards" },
];

function renderPageNav(save) {
  return `
    <nav class="imt-subnav franchise-subnav" aria-label="Franchise Mode navigation">
      ${PAGES.map(
        (page) => `
          <button class="${page.id === currentPage ? "active" : ""}" type="button" data-franchise-page="${escapeHTML(page.id)}" ${!save && page.id !== "home" ? "disabled" : ""}>
            ${escapeHTML(page.label)}
          </button>
        `
      ).join("")}
    </nav>
  `;
}

function phaseGate(save, ready, note) {
  if (ready) return null;
  return `
    <section class="section-panel">
      ${statusMessage("empty", note)}
      <div class="button-row">
        <button type="button" class="button primary" data-franchise-page="draft">Go To Draft Centre</button>
      </div>
    </section>
  `;
}

function renderFeaturePills(features = []) {
  return `
    <div class="franchise-feature-pills">
      ${features.map((feature) => `<span class="pill">${escapeHTML(feature)}</span>`).join("")}
    </div>
  `;
}

function renderTutorial() {
  return `
    <section class="section-panel franchise-tutorial">
      <div class="section-head">
        <div>
          <span class="eyebrow">Getting Started</span>
          <h2>How Franchise Mode Works</h2>
          <p>A quick primer before you pick a team and start your first draft.</p>
        </div>
      </div>
      <div class="franchise-tutorial-grid">
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">1</span>
          <h3>Pick your team and difficulty</h3>
          <p>Choose one of six teams to run below. The CPU manages the other five. Difficulty controls training limits, trade resistance, and whether an OVR cap applies to your roster, and it locks in once you start.</p>
        </article>
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">2</span>
          <h3>Draft a balanced roster</h3>
          <p>The snake draft reverses order every round. Don't just take the highest OVR available &mdash; you need enough Forwards, Midfielders, Defenders, and at least one Goalkeeper to compete.</p>
        </article>
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">3</span>
          <h3>Watch your salary cap</h3>
          <p>Every drafted player signs a contract against your salary cap. Check the Contracts panel for your cap space before signing free agents or taking on salary in a trade.</p>
        </article>
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">4</span>
          <h3>Name a captain and assistant captain</h3>
          <p>From Team Management, assign a captain and an assistant captain. Both roles give that player +${CAPTAIN_RATING_BONUS} OVR and +${CAPTAIN_MORALE_BONUS} morale, so put the armbands on players you're building around.</p>
        </article>
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">5</span>
          <h3>Train, trade, and sign free agents</h3>
          <p>Training sessions have a chance to permanently boost a player's rating, though your difficulty may limit how many you get. Use the Trade Centre and Free Agency Centre to fill roster gaps the draft didn't solve.</p>
        </article>
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">6</span>
          <h3>Simulate the season</h3>
          <p>Advance one week at a time from the Franchise Hub or Team Management page. Wins boost morale, losses hurt it, and morale feeds directly into team chemistry and your overall rating.</p>
        </article>
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">7</span>
          <h3>Make the playoffs</h3>
          <p>The top teams qualify, with the top two seeds earning a bye. Reach the semifinals, win the championship, and finish with a winning record to complete your owner objectives.</p>
        </article>
        <article class="franchise-tutorial-step">
          <span class="franchise-tutorial-number">8</span>
          <h3>Track stats, records, and awards</h3>
          <p>The Statistics, Records, and Awards pages update automatically as you simulate games and seasons, so you can follow the scoring race and chase franchise history.</p>
        </article>
      </div>
    </section>
  `;
}

function renderDifficultyPicker(save) {
  const activeDifficulty = save?.difficulty || pickedDifficulty;
  return `
    <div class="franchise-difficulty-block">
      <span class="eyebrow">Before You Start</span>
      <h3>Choose Your Difficulty</h3>
      <p class="franchise-note">Difficulty locks in once your franchise starts and can't be changed mid-save.</p>
      <div class="grid franchise-difficulty-grid">
        ${Object.values(DIFFICULTIES)
          .map((mode) => {
            const isActive = mode.key === activeDifficulty;
            const trainingNote =
              mode.key === "hard"
                ? "Training disabled"
                : mode.key === "medium"
                ? "10 training sessions max"
                : "Unlimited training";
            const tradeNote = mode.key === "hard" ? "Much harder trades" : mode.key === "medium" ? "Standard trade resistance" : "Easier trades";
            const capNote = mode.key === "hard" ? "95 OVR cap on your players" : "No OVR cap";
            return `
              <button
                type="button"
                class="franchise-difficulty-card ${escapeHTML(mode.key)}${isActive ? " selected" : ""}"
                data-franchise-difficulty="${escapeHTML(mode.key)}"
                ${save ? "disabled" : ""}
              >
                <strong>${escapeHTML(mode.label)}</strong>
                <span>${escapeHTML(trainingNote)}</span>
                <span>${escapeHTML(tradeNote)}</span>
                <span>${escapeHTML(capNote)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderTeamPicker(config, save) {
  const teams = config.teams || [];
  const activeTeamId = save?.userTeamId || pickedTeamId;

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Fantasy Draft</span>
          <h2>${save ? "Your Franchise Team" : "Choose Your Team"}</h2>
          <p>${save ? "This is the team you are general manager of for this franchise save." : "Pick one of six teams to control. The CPU runs the other five."}</p>
        </div>
      </div>
      <div class="grid franchise-team-grid" ${save ? 'data-locked="true"' : ""}>
        ${teams
          .map((team) => {
            const isActive = team.id === activeTeamId;
            const isCpu = save && !isActive;
            return `
              <button
                type="button"
                class="franchise-team-card${isActive ? " selected" : ""}${isCpu ? " cpu" : ""}"
                data-franchise-team="${escapeHTML(team.id)}"
                ${save ? "disabled" : ""}
                style="--franchise-team-color: ${escapeHTML(team.color || "#15803d")}"
              >
                <span class="franchise-team-badge">${escapeHTML(team.abbr || "")}</span>
                <strong>${escapeHTML(team.name)}</strong>
                <span class="franchise-team-role">${isActive ? "General Manager: You" : save ? "CPU-controlled" : "Tap to select"}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      ${renderDifficultyPicker(save)}
      ${
        save
          ? `<div class="button-row"><button type="button" class="button" id="franchise-reset-button">Reset League</button></div>`
          : `<div class="button-row"><button type="button" class="button primary" id="franchise-start-button" ${pickedTeamId ? "" : "disabled"}>Start New Franchise</button></div>`
      }
    </section>
  `;
}

function renderSeasonFormat(config, save) {
  const season = config.season || {};
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">League Structure</span>
          <h2>Season Format</h2>
          <p>${save ? `Season ${escapeHTML(save.season)}, Week ${escapeHTML(save.week)} of ${escapeHTML(season.weeks)}.` : "Every Franchise Mode season runs on the same clock."}</p>
        </div>
      </div>
      <div class="rule-strip">
        <div class="rule-pill"><span>Teams</span><strong>${escapeHTML(config.totalTeams)}</strong></div>
        <div class="rule-pill"><span>User-controlled</span><strong>${escapeHTML(config.userTeams)}</strong></div>
        <div class="rule-pill"><span>CPU-controlled</span><strong>${escapeHTML(config.cpuTeams)}</strong></div>
        <div class="rule-pill"><span>Season length</span><strong>${escapeHTML(season.weeks)} weeks</strong></div>
        <div class="rule-pill"><span>Game day</span><strong>${escapeHTML(season.gameDay)}</strong></div>
        <div class="rule-pill"><span>Simulation</span><strong>Daily</strong></div>
        ${save ? `<div class="rule-pill"><span>Difficulty</span><strong class="franchise-difficulty-tag ${escapeHTML(save.difficulty)}">${escapeHTML(difficultySettings(save).label)}</strong></div>` : ""}
      </div>
      <p class="franchise-note">${escapeHTML(season.note || "")}</p>
    </section>
  `;
}

function renderPlayoffFormat(config) {
  const rounds = config.playoffFormat?.rounds || [];
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Postseason</span>
          <h2>Playoffs</h2>
          <p>Top ${escapeHTML(config.playoffFormat?.qualifiers || 6)} teams qualify. Seeds 1 and 2 receive quarterfinal byes.</p>
        </div>
      </div>
      <div class="franchise-bracket">
        ${rounds
          .map(
            (round) => `
              <article class="franchise-bracket-round">
                <span class="pill">${escapeHTML(round.shortName)}</span>
                <strong>${escapeHTML(round.name)}</strong>
                <p>${escapeHTML(round.matchup)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

// ---------- Part 2: Draft ----------

function renderDraftIntro() {
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 2: Draft</span>
          <h2>Fantasy Snake Draft</h2>
          <p>Six teams draft in snake order across ${escapeHTML(DRAFT_ROUNDS)} rounds. Order reverses every round, and the CPU weighs both player rating and roster needs when it's on the clock.</p>
        </div>
      </div>
      <div class="button-row">
        <button type="button" class="button primary" id="franchise-begin-draft-button">Begin Snake Draft</button>
      </div>
    </section>
  `;
}

function renderDraftBoard(config, save) {
  const pick = currentPick(save);
  const teamsById = new Map(save.teams.map((team) => [team.id, team]));
  const totalPicks = save.draftOrder.length;
  const recent = [...save.draftLog].slice(-8).reverse();
  const onTheClock = pick ? teamsById.get(pick.teamId) : null;
  const isUserPick = pick && pick.teamId === save.userTeamId;
  const positions = ["All", "Forward", "Midfielder", "Defender", "Goalkeeper"];

  const otherTeams = save.teams.filter((team) => team.id !== save.userTeamId);
  if (!draftBoardTeamId || draftBoardTeamId === save.userTeamId) draftBoardTeamId = otherTeams[0]?.id || "";
  const yourPicks = save.draftLog.filter((entry) => entry.teamId === save.userTeamId);
  const viewedTeamPicks = save.draftLog.filter((entry) => entry.teamId === draftBoardTeamId);
  const viewedTeam = teamsById.get(draftBoardTeamId);

  const pool = availablePlayers(save, playerPool)
    .filter((player) => draftPositionFilter === "All" || player.position === draftPositionFilter)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 60);

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 2: Draft</span>
          <h2>Live Draft Board</h2>
          <p>${pick ? `Pick ${escapeHTML(pick.overall)} of ${escapeHTML(totalPicks)} | Round ${escapeHTML(pick.round)} of ${escapeHTML(DRAFT_ROUNDS)}` : "Draft complete."}</p>
        </div>
      </div>
      <div class="rule-strip">
        <div class="rule-pill"><span>On the clock</span><strong style="color:${escapeHTML(onTheClock?.color || "inherit")}">${escapeHTML(onTheClock?.name || "-")}</strong></div>
        <div class="rule-pill"><span>Round</span><strong>${escapeHTML(pick?.round ?? DRAFT_ROUNDS)} / ${escapeHTML(DRAFT_ROUNDS)}</strong></div>
        <div class="rule-pill"><span>Overall pick</span><strong>${escapeHTML(pick?.overall ?? totalPicks)} / ${escapeHTML(totalPicks)}</strong></div>
        <div class="rule-pill"><span>Players left</span><strong>${escapeHTML(save.freeAgents.length)}</strong></div>
      </div>

      <div class="franchise-draft-picks-columns">
        <div class="franchise-draft-picks-panel">
          <h3>Your Picks (${yourPicks.length})</h3>
          ${
            yourPicks.length
              ? `<div class="franchise-draft-log no-border">
                  ${yourPicks
                    .map(
                      (entry) => `
                        <div class="franchise-draft-log-row you">
                          <span>#${escapeHTML(entry.overall)}</span>
                          <strong>Rd ${escapeHTML(entry.round)}</strong>
                          <span>${escapeHTML(entry.playerName)}</span>
                        </div>
                      `
                    )
                    .join("")}
                </div>`
              : `<p class="franchise-note">You haven't made a pick yet.</p>`
          }
        </div>

        <div class="franchise-draft-picks-panel">
          <div class="control">
            <label for="draft-team-select">View another team's picks</label>
            <select id="draft-team-select">
              ${otherTeams
                .map((team) => `<option value="${escapeHTML(team.id)}" ${team.id === draftBoardTeamId ? "selected" : ""}>${escapeHTML(team.name)}</option>`)
                .join("")}
            </select>
          </div>
          <h3>${escapeHTML(viewedTeam?.name || "Team")}'s Picks (${viewedTeamPicks.length})</h3>
          ${
            viewedTeamPicks.length
              ? `<div class="franchise-draft-log no-border">
                  ${viewedTeamPicks
                    .map(
                      (entry) => `
                        <div class="franchise-draft-log-row${entry.teamId === save.userTeamId ? " you" : ""}">
                          <span>#${escapeHTML(entry.overall)}</span>
                          <strong>Rd ${escapeHTML(entry.round)}</strong>
                          <span>${escapeHTML(entry.playerName)}</span>
                        </div>
                      `
                    )
                    .join("")}
                </div>`
              : `<p class="franchise-note">No picks yet.</p>`
          }
        </div>
      </div>

      ${
        isUserPick
          ? `
            <div class="franchise-draft-filters">
              ${positions
                .map(
                  (position) =>
                    `<button type="button" class="pill${draftPositionFilter === position ? " green" : ""}" data-draft-filter="${escapeHTML(position)}">${escapeHTML(position)}</button>`
                )
                .join("")}
            </div>
            <div class="franchise-draft-pool">
              ${pool
                .map(
                  (player) => `
                    <article class="franchise-draft-player">
                      <div class="franchise-draft-player-name">
                        <strong>${escapeHTML(player.name)}</strong>
                        <span>${escapeHTML(player.position)} | ${escapeHTML(player.sourceTeamName || "Free Agent")}</span>
                      </div>
                      <div class="franchise-draft-player-stats">
                        <span>OVR ${escapeHTML(player.rating)}</span>
                        <span>${escapeHTML(player.goals2026 || 0)}G ${escapeHTML(player.assists2026 || 0)}A</span>
                      </div>
                      <button type="button" class="button primary" data-draft-player="${escapeHTML(player.id)}">Draft</button>
                    </article>
                  `
                )
                .join("")}
              ${pool.length ? "" : statusMessage("empty", "No players match this filter.")}
            </div>
          `
          : `<p class="franchise-note">${escapeHTML(onTheClock?.name || "A CPU team")} is on the clock, picking automatically.</p>`
      }

      ${
        recent.length
          ? `
            <div class="franchise-draft-log">
              <h3>Recent Picks</h3>
              ${recent
                .map(
                  (entry) => `
                    <div class="franchise-draft-log-row${entry.teamId === save.userTeamId ? " you" : ""}">
                      <span>#${escapeHTML(entry.overall)}</span>
                      <strong>${escapeHTML(teamsById.get(entry.teamId)?.abbr || "")}</strong>
                      <span>${escapeHTML(entry.playerName)}</span>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
    </section>
  `;
}

// ---------- Part 2: Contracts ----------

function renderContractsPanel(config, save) {
  const userRoster = save.rosters[save.userTeamId] || [];
  const capUsed = teamCapUsed(save, save.userTeamId);
  const capSpace = teamCapSpace(save, save.userTeamId);
  const capPct = Math.min(100, Math.round((capUsed / CAP_MAX) * 100));
  const sortedRoster = [...userRoster].sort((a, b) => (b.contract?.salary || 0) - (a.contract?.salary || 0));

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 2: Contracts</span>
          <h2>Roster &amp; Salary Cap</h2>
          <p>Every drafted player signed a contract against your ${escapeHTML(formatMoney(CAP_MAX))} salary cap. Higher-rated players demanded bigger deals, and every contract runs ${escapeHTML(MAX_CONTRACT_YEARS)} years or less.</p>
        </div>
      </div>
      <div class="rule-strip">
        <div class="rule-pill"><span>Cap used</span><strong>${escapeHTML(formatMoney(capUsed))}</strong></div>
        <div class="rule-pill"><span>Cap space</span><strong>${escapeHTML(formatMoney(capSpace))}</strong></div>
        <div class="rule-pill"><span>Roster size</span><strong>${escapeHTML(userRoster.length)}</strong></div>
        <div class="rule-pill"><span>Max contract</span><strong>${escapeHTML(MAX_CONTRACT_YEARS)} years</strong></div>
      </div>
      <div class="franchise-cap-bar" role="img" aria-label="${escapeHTML(capPct)}% of salary cap used">
        <span style="width:${capPct}%"></span>
      </div>
      <div class="franchise-roster-list">
        ${sortedRoster
          .map(
            (player) => `
              <article class="franchise-roster-row">
                <div>
                  <strong>${escapeHTML(player.name)}</strong>
                  <span>${escapeHTML(player.position)} | OVR ${escapeHTML(player.rating)}</span>
                </div>
                <div class="franchise-roster-contract">
                  <span>${escapeHTML(formatMoney(player.contract?.salary || 0))}</span>
                  <small>${escapeHTML(player.contract?.years || 1)}-year deal</small>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

// ---------- Part 2: Trading ----------

function renderTradeBlock(save) {
  const roster = save.rosters[save.userTeamId] || [];
  const block = new Set(save.tradeBlock[save.userTeamId] || []);

  return `
    <div class="franchise-trade-block">
      <h3>Your Trade Block</h3>
      <p class="franchise-note">Mark players as available. Blocked players still play for you, but CPU teams know you're willing to move them.</p>
      <div class="franchise-roster-list">
        ${roster
          .map(
            (player) => `
              <article class="franchise-roster-row">
                <div>
                  <strong>${escapeHTML(player.name)}</strong>
                  <span>${escapeHTML(player.position)} | OVR ${escapeHTML(player.rating)} | ${escapeHTML(formatMoney(player.contract?.salary || 0))}</span>
                </div>
                <button type="button" class="pill${block.has(player.id) ? " green" : ""}" data-trade-block-toggle="${escapeHTML(player.id)}">
                  ${block.has(player.id) ? "On Block" : "Add to Block"}
                </button>
              </article>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderTradeBuilder(save) {
  const cpuTeams = save.teams.filter((team) => team.id !== save.userTeamId);
  if (!tradePartnerId) tradePartnerId = cpuTeams[0]?.id || "";
  const yourRoster = save.rosters[save.userTeamId] || [];
  const theirRoster = save.rosters[tradePartnerId] || [];
  const yourPick = (save.futurePicks[save.userTeamId] || [])[0];
  const theirPick = (save.futurePicks[tradePartnerId] || [])[0];

  const giveValue =
    yourRoster.filter((player) => tradeGivePlayerIds.has(player.id)).reduce((sum, player) => sum + playerTradeValue(player), 0) +
    (tradeGivePick && yourPick ? pickTradeValue(yourPick) : 0);
  const receiveValue =
    theirRoster.filter((player) => tradeReceivePlayerIds.has(player.id)).reduce((sum, player) => sum + playerTradeValue(player), 0) +
    (tradeReceivePick && theirPick ? pickTradeValue(theirPick) : 0);

  const renderPlayerCheckbox = (player, set, attr) => `
    <label class="franchise-trade-checkbox">
      <input type="checkbox" data-${attr}="${escapeHTML(player.id)}" ${set.has(player.id) ? "checked" : ""}>
      <span>${escapeHTML(player.name)} <small>${escapeHTML(player.position)} | OVR ${escapeHTML(player.rating)}</small></span>
    </label>
  `;

  return `
    <div class="franchise-trade-builder">
      <h3>Propose a Trade</h3>
      <div class="control">
        <label for="trade-partner">Trade with</label>
        <select id="trade-partner">
          ${cpuTeams.map((team) => `<option value="${escapeHTML(team.id)}" ${team.id === tradePartnerId ? "selected" : ""}>${escapeHTML(team.name)}</option>`).join("")}
        </select>
      </div>
      <div class="franchise-trade-columns">
        <div class="franchise-trade-side">
          <span class="eyebrow">You Give</span>
          ${yourRoster.map((player) => renderPlayerCheckbox(player, tradeGivePlayerIds, "trade-give-player")).join("") || `<p class="franchise-note">No players on your roster.</p>`}
          ${
            yourPick
              ? `<label class="franchise-trade-checkbox"><input type="checkbox" id="trade-give-pick" ${tradeGivePick ? "checked" : ""}><span>Season ${escapeHTML(yourPick.season)}, Round ${escapeHTML(yourPick.round)} pick</span></label>`
              : ""
          }
          <p class="franchise-trade-value">Value sent: ${giveValue.toFixed(1)}</p>
        </div>
        <div class="franchise-trade-side">
          <span class="eyebrow">You Receive</span>
          ${theirRoster.map((player) => renderPlayerCheckbox(player, tradeReceivePlayerIds, "trade-receive-player")).join("") || `<p class="franchise-note">No players on their roster.</p>`}
          ${
            theirPick
              ? `<label class="franchise-trade-checkbox"><input type="checkbox" id="trade-receive-pick" ${tradeReceivePick ? "checked" : ""}><span>Season ${escapeHTML(theirPick.season)}, Round ${escapeHTML(theirPick.round)} pick</span></label>`
              : ""
          }
          <p class="franchise-trade-value">Value received: ${receiveValue.toFixed(1)}</p>
        </div>
      </div>
      ${tradeMessage ? `<p class="franchise-trade-message${tradeMessage.accepted ? " accepted" : " rejected"}">${escapeHTML(tradeMessage.text)}</p>` : ""}
      <div class="button-row">
        <button type="button" class="button primary" id="franchise-propose-trade-button" ${isTradeDeadlinePassed(save) ? "disabled" : ""}>Propose Trade</button>
      </div>
    </div>
  `;
}

function renderTradeHistory(save) {
  const teamsById = new Map(save.teams.map((team) => [team.id, team]));
  const recent = [...save.trades].slice(-6).reverse();
  if (!recent.length) return `<p class="franchise-note">No trades have been made yet.</p>`;
  return `
    <div class="franchise-trade-history">
      <h3>Recent Trades</h3>
      ${recent
        .map((trade) => {
          const teamA = teamsById.get(trade.teamAId);
          const teamB = teamsById.get(trade.teamBId);
          const aGivesNames = (trade.teamAGives.playerIds || []).length + (trade.teamAGives.picks || []).length;
          const bGivesNames = (trade.teamBGives.playerIds || []).length + (trade.teamBGives.picks || []).length;
          return `
            <div class="franchise-trade-history-row">
              <strong>${escapeHTML(teamA?.name || "Team")}</strong>
              <span>traded ${escapeHTML(aGivesNames)} asset${aGivesNames === 1 ? "" : "s"} to</span>
              <strong>${escapeHTML(teamB?.name || "Team")}</strong>
              <span>for ${escapeHTML(bGivesNames)} asset${bGivesNames === 1 ? "" : "s"}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTradeCenter(config, save) {
  const deadlinePassed = isTradeDeadlinePassed(save);
  const settings = difficultySettings(save);
  const marginPct = Math.round((settings.tradeMargin - 1) * 100);
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 2: Trading</span>
          <h2>Trade Centre</h2>
          <p>${escapeHTML(settings.label)} difficulty: CPU teams want at least ${marginPct}% more value coming in than going out before they'll accept an offer. Trades lock after week ${escapeHTML(TRADE_DEADLINE_WEEK)}.</p>
        </div>
        <span class="pill${deadlinePassed ? "" : " green"}">${deadlinePassed ? "Trade deadline passed" : `Week ${escapeHTML(save.week)} of ${escapeHTML(TRADE_DEADLINE_WEEK)} deadline`}</span>
      </div>
      ${renderTradeBlock(save)}
      ${renderTradeBuilder(save)}
      <div class="button-row">
        <button type="button" class="button" id="franchise-simulate-cpu-trade-button" ${deadlinePassed ? "disabled" : ""}>Simulate a CPU-to-CPU Trade</button>
      </div>
      ${cpuTradeMessage ? `<p class="franchise-trade-message${cpuTradeMessage.accepted ? " accepted" : " rejected"}">${escapeHTML(cpuTradeMessage.text)}</p>` : ""}
      ${renderTradeHistory(save)}
    </section>
  `;
}

// ---------- Part 3: Season Hub ----------

function renderSeasonHub(config, save) {
  const standings = standingsForSave(save);
  const teamsById = new Map(save.teams.map((team) => [team.id, team]));
  const weekIndex = save.week - 1;
  const upcoming = save.phase === "season" ? (save.schedule || [])[weekIndex] || [] : [];
  const recentResults = [...(save.results || [])].slice(-6).reverse();

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 3: Season Hub</span>
          <h2>${
            save.phase === "offseason"
              ? `Ready for Season ${escapeHTML(save.season)}`
              : `Season ${escapeHTML(save.season)}, Week ${escapeHTML(save.week)} of ${escapeHTML(SEASON_WEEKS)}`
          }</h2>
          <p>${
            save.phase === "offseason"
              ? "Manage your roster, then kick off the season when you're ready."
              : save.phase === "postseason-ready"
              ? "Regular season complete. Simulate the playoffs to see who takes home the title."
              : "Simulate each week to advance the season. Results affect morale, injuries, and player development."
          }</p>
        </div>
        <span class="pill green">${escapeHTML(standings[0]?.name || "")} leads</span>
      </div>

      <div class="franchise-standings-table">
        <div class="franchise-standings-head">
          <span>#</span><span>Team</span><span>W</span><span>D</span><span>L</span><span>PTS</span><span>GD</span>
        </div>
        ${standings
          .map((team, index) => {
            const gd = team.goalsFor - team.goalsAgainst;
            return `
              <div class="franchise-standings-row${team.id === save.userTeamId ? " you" : ""}">
                <span>${index + 1}</span>
                <strong style="color:${escapeHTML(team.color || "inherit")}">${escapeHTML(team.name)}</strong>
                <span>${escapeHTML(team.wins)}</span>
                <span>${escapeHTML(team.draws)}</span>
                <span>${escapeHTML(team.losses)}</span>
                <span>${escapeHTML(team.points)}</span>
                <span>${gd > 0 ? "+" : ""}${escapeHTML(gd)}</span>
              </div>
            `;
          })
          .join("")}
      </div>

      ${
        upcoming.length
          ? `
            <div class="franchise-week-preview">
              <h3>Week ${escapeHTML(save.week)} Matchups</h3>
              ${upcoming
                .map(
                  (match) => `
                    <div class="franchise-week-match">
                      <span>${escapeHTML(teamsById.get(match.homeTeamId)?.abbr || "")}</span>
                      <small>vs</small>
                      <span>${escapeHTML(teamsById.get(match.awayTeamId)?.abbr || "")}</span>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }

      ${
        recentResults.length
          ? `
            <div class="franchise-week-preview">
              <h3>Recent Results</h3>
              ${recentResults
                .map(
                  (result) => `
                    <div class="franchise-week-match">
                      <span>${escapeHTML(teamsById.get(result.homeTeamId)?.abbr || "")} ${escapeHTML(result.homeScore)}</span>
                      <small>&ndash;</small>
                      <span>${escapeHTML(result.awayScore)} ${escapeHTML(teamsById.get(result.awayTeamId)?.abbr || "")}</span>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }

      <div class="button-row">
        ${
          save.phase === "offseason"
            ? `<button type="button" class="button primary" id="franchise-start-season-button">Start Season ${escapeHTML(save.season)}</button>`
            : save.phase === "season"
            ? `<button type="button" class="button primary" id="franchise-simulate-week-button">Simulate Week ${escapeHTML(save.week)}</button>`
            : save.phase === "postseason-ready"
            ? `<button type="button" class="button primary" id="franchise-simulate-playoffs-button">Simulate Playoffs</button>`
            : ""
        }
      </div>
    </section>
  `;
}

// ---------- Franchise Hub (Part 5) ----------

function renderFranchiseHub(config, save) {
  const team = save.teams.find((item) => item.id === save.userTeamId);
  const chemistry = computeChemistry(save, save.userTeamId);
  const capUsed = teamCapUsed(save, save.userTeamId);
  const capSpace = teamCapSpace(save, save.userTeamId);
  const objectives = save.ownerObjectives || {};
  const recentTrades = [...save.trades].slice(-3).reverse();
  const recentDraft = [...(save.draftLog || [])].slice(-3).reverse();
  const news = [
    ...recentTrades.map((trade) => {
      const teamA = save.teams.find((item) => item.id === trade.teamAId);
      const teamB = save.teams.find((item) => item.id === trade.teamBId);
      return `${escapeHTML(teamA?.name || "A team")} completed a trade with ${escapeHTML(teamB?.name || "another team")}.`;
    }),
    ...recentDraft.map((entry) => `${escapeHTML(entry.playerName)} was drafted with pick #${escapeHTML(entry.overall)}.`),
  ].slice(0, 5);

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Franchise Hub</span>
          <h2>${escapeHTML(team?.name || "Your Franchise")}</h2>
          <p>Season ${escapeHTML(save.season)} | ${escapeHTML(save.phase)} | Record ${escapeHTML(team?.wins ?? 0)}-${escapeHTML(team?.losses ?? 0)}-${escapeHTML(team?.draws ?? 0)}</p>
        </div>
        <span class="pill${chemistry >= 70 ? " green" : ""}">Chemistry: ${escapeHTML(chemistry)}</span>
      </div>
      <div class="rule-strip">
        <div class="rule-pill"><span>Team record</span><strong>${escapeHTML(team?.wins ?? 0)}-${escapeHTML(team?.losses ?? 0)}-${escapeHTML(team?.draws ?? 0)}</strong></div>
        <div class="rule-pill"><span>Points</span><strong>${escapeHTML(team?.points ?? 0)}</strong></div>
        <div class="rule-pill"><span>Salary used</span><strong>${escapeHTML(formatMoney(capUsed))}</strong></div>
        <div class="rule-pill"><span>Cap space</span><strong>${escapeHTML(formatMoney(capSpace))}</strong></div>
      </div>

      <div class="franchise-award-grid">
        <div class="franchise-award-row"><span class="franchise-award-name">Reach Semifinals</span><strong>${objectives.reachedSemis ? "Achieved" : "Not Yet"}</strong></div>
        <div class="franchise-award-row"><span class="franchise-award-name">Win Championship</span><strong>${objectives.wonChampionship ? "Achieved" : "Not Yet"}</strong></div>
        <div class="franchise-award-row"><span class="franchise-award-name">Winning Record</span><strong>${objectives.winningRecord ? "Achieved" : "Not Yet"}</strong></div>
      </div>
    </section>

    ${renderSeasonHub(config, save)}

    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Franchise Hub</span>
          <h2>League News</h2>
        </div>
      </div>
      ${
        news.length
          ? `<div class="franchise-roster-list">${news.map((item) => `<article class="franchise-roster-row"><div><strong>${item}</strong></div></article>`).join("")}</div>`
          : `<p class="franchise-note">No league news yet. Make some trades or start the draft.</p>`
      }
    </section>
  `;
}

// ---------- Part 3: Team Management ----------

function renderTeamManagementPanel(config, save) {
  const roster = save.rosters[save.userTeamId] || [];
  const chemistry = computeChemistry(save, save.userTeamId);
  const captainId = save.captains?.[save.userTeamId];
  const assistantId = save.assistantCaptains?.[save.userTeamId];
  const settings = difficultySettings(save);
  const trainingUsed = save.userTrainingCount || 0;
  const trainingBlocked = settings.trainingLimit <= 0;
  const trainingExhausted = !trainingBlocked && Number.isFinite(settings.trainingLimit) && trainingUsed >= settings.trainingLimit;
  const trainingDisabled = trainingBlocked || trainingExhausted;
  const trainingStatusText = trainingBlocked
    ? `Training is disabled on ${settings.label} difficulty.`
    : Number.isFinite(settings.trainingLimit)
    ? `Training sessions used: ${trainingUsed} / ${settings.trainingLimit}`
    : "Unlimited training sessions.";

  if (!lineupFormation) lineupFormation = save.lineups?.[save.userTeamId]?.formation || FORMATIONS[0];
  if (!lineupSelectionInit) {
    lineupSelection = new Set(save.lineups?.[save.userTeamId]?.startingIds || []);
    lineupSelectionInit = true;
  }

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 3: Team Management</span>
          <h2>Chemistry, Captaincy &amp; Roster</h2>
          <p>Team chemistry blends roster balance, leadership, and average morale. A captain and an assistant captain each give that player +${CAPTAIN_RATING_BONUS} OVR and +${CAPTAIN_MORALE_BONUS} morale, so put those armbands on players you want to lean on.${
            settings.ovrCap < 99 ? ` Your players are capped at ${settings.ovrCap} OVR on ${settings.label} difficulty.` : ""
          }</p>
        </div>
        <span class="pill${chemistry >= 70 ? " green" : ""}">Chemistry: ${escapeHTML(chemistry)}</span>
      </div>

      <p class="franchise-note franchise-training-status ${trainingBlocked ? "blocked" : ""}">${escapeHTML(trainingStatusText)}</p>

      <div class="franchise-roster-list">
        ${roster
          .map((player) => {
            const isCaptain = player.id === captainId;
            const isAssistant = player.id === assistantId;
            const roleTag = isCaptain ? " (C)" : isAssistant ? " (AC)" : "";
            return `
              <article class="franchise-roster-row franchise-management-row">
                <div>
                  <strong>${escapeHTML(player.name)}${roleTag}</strong>
                  <span>${escapeHTML(player.position)} | OVR ${escapeHTML(player.rating)} | Morale ${escapeHTML(player.morale ?? 70)}${isCaptain || isAssistant ? " | Captaincy boost active" : ""}</span>
                </div>
                <div class="franchise-management-actions">
                  <button type="button" class="pill${isCaptain ? " green" : ""}" data-set-captain="${escapeHTML(player.id)}" ${isCaptain ? "disabled" : ""}>${isCaptain ? "Captain" : "Make Captain"}</button>
                  <button type="button" class="pill${isAssistant ? " green" : ""}" data-set-assistant="${escapeHTML(player.id)}" ${isAssistant || isCaptain ? "disabled" : ""}>${isAssistant ? "Assistant Captain" : "Make Assistant"}</button>
                  <button type="button" class="pill" data-train-player="${escapeHTML(player.id)}" ${trainingDisabled ? "disabled" : ""}>Train</button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
      ${trainingMessage ? `<p class="franchise-trade-message${trainingMessage.success ? " accepted" : " rejected"}">${escapeHTML(trainingMessage.text)}</p>` : ""}

      <div class="franchise-lineup-builder">
        <h3>Lineup Builder</h3>
        <div class="control">
          <label for="lineup-formation">Formation</label>
          <select id="lineup-formation">
            ${FORMATIONS.map((formation) => `<option value="${escapeHTML(formation)}" ${formation === lineupFormation ? "selected" : ""}>${escapeHTML(formation)}</option>`).join("")}
          </select>
        </div>
        <p class="franchise-note">Starting XI: ${lineupSelection.size} / ${STARTING_XI_SIZE} selected</p>
        <div class="franchise-lineup-grid">
          ${roster
            .map(
              (player) => `
                <label class="franchise-trade-checkbox">
                  <input type="checkbox" data-lineup-player="${escapeHTML(player.id)}" ${lineupSelection.has(player.id) ? "checked" : ""}>
                  <span>${escapeHTML(player.name)} <small>${escapeHTML(player.position)} | OVR ${escapeHTML(player.rating)}</small></span>
                </label>
              `
            )
            .join("")}
        </div>
        ${lineupMessage ? `<p class="franchise-trade-message${lineupMessage.success ? " accepted" : " rejected"}">${escapeHTML(lineupMessage.text)}</p>` : ""}
        <div class="button-row">
          <button type="button" class="button primary" id="franchise-save-lineup-button">Save Lineup</button>
        </div>
      </div>
    </section>
  `;
}

// ---------- Part 3: Free Agency ----------

function renderFreeAgencyCenter(config, save) {
  const positions = ["All", "Forward", "Midfielder", "Defender", "Goalkeeper"];
  const pool = freeAgentPool(save, playerPool)
    .filter((player) => freeAgencyPositionFilter === "All" || player.position === freeAgencyPositionFilter)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 40);
  const roster = save.rosters[save.userTeamId] || [];
  const capSpace = teamCapSpace(save, save.userTeamId);

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 3: Free Agency</span>
          <h2>Free Agency Centre</h2>
          <p>Sign free agents to fill roster needs. The CPU may enter a competing bid on any offer you make, so there's no guarantee you land your target.</p>
        </div>
        <span class="pill green">Cap space: ${escapeHTML(formatMoney(capSpace))}</span>
      </div>

      <div class="franchise-draft-filters">
        ${positions
          .map(
            (position) =>
              `<button type="button" class="pill${freeAgencyPositionFilter === position ? " green" : ""}" data-fa-filter="${escapeHTML(position)}">${escapeHTML(position)}</button>`
          )
          .join("")}
      </div>
      <div class="franchise-draft-pool">
        ${pool
          .map(
            (player) => `
              <article class="franchise-draft-player">
                <div class="franchise-draft-player-name">
                  <strong>${escapeHTML(player.name)}</strong>
                  <span>${escapeHTML(player.position)} | ${escapeHTML(player.sourceTeamName || "Free Agent")}</span>
                </div>
                <div class="franchise-draft-player-stats">
                  <span>OVR ${escapeHTML(player.rating)}</span>
                </div>
                <button type="button" class="button primary" data-sign-player="${escapeHTML(player.id)}">Sign</button>
              </article>
            `
          )
          .join("")}
        ${pool.length ? "" : statusMessage("empty", "No free agents match this filter.")}
      </div>
      ${freeAgencyMessage ? `<p class="franchise-trade-message${freeAgencyMessage.success ? " accepted" : " rejected"}">${escapeHTML(freeAgencyMessage.text)}</p>` : ""}

      <div class="franchise-roster-list">
        <h3>Your Roster</h3>
        ${roster
          .map(
            (player) => `
              <article class="franchise-roster-row">
                <div>
                  <strong>${escapeHTML(player.name)}</strong>
                  <span>${escapeHTML(player.position)} | OVR ${escapeHTML(player.rating)} | ${escapeHTML(formatMoney(player.contract?.salary || 0))}</span>
                </div>
                <button type="button" class="pill" data-waive-player="${escapeHTML(player.id)}">Waive</button>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

// ---------- Part 3: Playoff Results ----------

function renderPlayoffResultsPanel(config, save) {
  const results = save.playoffResults;
  if (!results) return "";
  const objectives = save.ownerObjectives || {};
  const rounds = [
    { label: "Quarterfinal 1", data: results.qf1 },
    { label: "Quarterfinal 2", data: results.qf2 },
    { label: "Semifinal 1", data: results.sf1 },
    { label: "Semifinal 2", data: results.sf2 },
    { label: "Final", data: results.final },
  ];

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 3: Playoffs</span>
          <h2>${escapeHTML(results.champion?.name || "Playoffs")} ${results.champion?.id === save.userTeamId ? `are your Season ${escapeHTML(save.season)} Champions!` : `won the Season ${escapeHTML(save.season)} title`}</h2>
          <p>Here's how the bracket played out.</p>
        </div>
      </div>
      <div class="franchise-bracket">
        ${rounds
          .map(
            (round) => `
              <article class="franchise-bracket-round${round.data?.winner?.id === save.userTeamId ? " you" : ""}">
                <span class="pill">${escapeHTML(round.label)}</span>
                <strong>${escapeHTML(round.data?.teamA?.name || "TBD")} vs ${escapeHTML(round.data?.teamB?.name || "TBD")}</strong>
                <p>Winner: ${escapeHTML(round.data?.winner?.name || "TBD")}</p>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="rule-strip">
        <div class="rule-pill"><span>Reach Semifinals</span><strong>${objectives.reachedSemis ? "&#9989;" : "&#10060;"}</strong></div>
        <div class="rule-pill"><span>Win Championship</span><strong>${objectives.wonChampionship ? "&#9989;" : "&#10060;"}</strong></div>
        <div class="rule-pill"><span>Winning Record</span><strong>${objectives.winningRecord ? "&#9989;" : "&#10060;"}</strong></div>
      </div>
      <div class="button-row">
        <button type="button" class="button primary" id="franchise-next-season-button">Start Season ${escapeHTML(save.season + 1)}</button>
      </div>
    </section>
  `;
}

// ---------- Part 4: Statistics and Awards ----------

function awardRow(label, entry, statLabel) {
  return `
    <div class="franchise-award-row">
      <span class="franchise-award-name">${escapeHTML(label)}</span>
      ${entry ? `<strong>${escapeHTML(entry.name)}</strong><span>${escapeHTML(statLabel)}</span>` : `<span class="franchise-note">Not enough games played yet.</span>`}
    </div>
  `;
}

function renderAwardsPanel(config, save) {
  const teamsById = new Map(save.teams.map((team) => [team.id, team]));
  const awards = save.lastSeasonAwards;

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Awards</span>
          <h2>${awards ? `Season ${escapeHTML(awards.season)} Awards` : "Awards"}</h2>
          <p>Awards are handed out automatically once the playoffs are simulated.</p>
        </div>
      </div>
      ${
        awards
          ? `
            <div class="franchise-award-grid">
              ${awardRow("MVP", awards.mvp, awards.mvp ? `${awards.mvp.goals}G ${awards.mvp.assists}A - ${teamsById.get(awards.mvp.teamId)?.abbr || ""}` : "")}
              ${awardRow("Golden Boot", awards.goldenBoot, awards.goldenBoot ? `${awards.goldenBoot.goals} goals - ${teamsById.get(awards.goldenBoot.teamId)?.abbr || ""}` : "")}
              ${awardRow("Best Goalkeeper", awards.bestGoalkeeper, awards.bestGoalkeeper ? `${awards.bestGoalkeeper.cleanSheets} clean sheets - ${teamsById.get(awards.bestGoalkeeper.teamId)?.abbr || ""}` : "")}
              ${awardRow("Rookie of the Year", awards.rookieOfTheYear, awards.rookieOfTheYear ? `${awards.rookieOfTheYear.goals}G ${awards.rookieOfTheYear.assists}A - ${teamsById.get(awards.rookieOfTheYear.teamId)?.abbr || ""}` : "")}
              ${awardRow("Most Improved Player", awards.mostImprovedPlayer, awards.mostImprovedPlayer ? `${awards.mostImprovedPlayer.startRating} &rarr; ${awards.mostImprovedPlayer.endRating} OVR - ${teamsById.get(awards.mostImprovedPlayer.teamId)?.abbr || ""}` : "")}
            </div>
          `
          : `<p class="franchise-note">Awards are handed out once the playoffs are simulated.</p>`
      }
    </section>
  `;
}

function renderRecordsPanel(config, save) {
  const records = computeFranchiseRecords(save);
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Records</span>
          <h2>Franchise Records</h2>
          <p>All-time marks across every season played in this franchise save.</p>
        </div>
      </div>
      <div class="rule-strip">
        <div class="rule-pill"><span>Most goals (career)</span><strong>${records.mostGoals ? `${escapeHTML(records.mostGoals.name)} (${escapeHTML(records.mostGoals.value)})` : "-"}</strong></div>
        <div class="rule-pill"><span>Most assists (career)</span><strong>${records.mostAssists ? `${escapeHTML(records.mostAssists.name)} (${escapeHTML(records.mostAssists.value)})` : "-"}</strong></div>
        <div class="rule-pill"><span>Most points (career)</span><strong>${records.mostPoints ? `${escapeHTML(records.mostPoints.name)} (${escapeHTML(records.mostPoints.value)})` : "-"}</strong></div>
        <div class="rule-pill"><span>Longest win streak</span><strong>${records.longestWinningStreak ? `${escapeHTML(records.longestWinningStreak.teamName)} (${escapeHTML(records.longestWinningStreak.best)})` : "-"}</strong></div>
        <div class="rule-pill"><span>Most championships</span><strong>${records.mostChampionships ? `${escapeHTML(records.mostChampionships.teamName)} (${escapeHTML(records.mostChampionships.count)})` : "-"}</strong></div>
      </div>
      ${
        save.history?.length
          ? `
            <div class="franchise-roster-list">
              ${save.history
                .map(
                  (entry) => `
                    <article class="franchise-roster-row">
                      <div><strong>Season ${escapeHTML(entry.season)}</strong><span>Champion: ${escapeHTML(entry.champion || "-")}</span></div>
                      <span>${escapeHTML(entry.userResult)} (${escapeHTML(entry.record)})</span>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
          : `<p class="franchise-note">Season history will appear here once a season is completed.</p>`
      }
    </section>
  `;
}

function renderStatsPanel(config, save) {
  const teamsById = new Map(save.teams.map((team) => [team.id, team]));
  const topGoals = seasonStatLeaders(save, "goals", 10);
  const topAssists = seasonStatLeaders(save, "assists", 10);

  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Statistics</span>
          <h2>Season Stat Leaders</h2>
          <p>Goals and assists update automatically as weeks are simulated.</p>
        </div>
      </div>
      <div class="franchise-stat-columns">
        <div>
          <h3>Goals</h3>
          ${
            topGoals.length
              ? topGoals
                  .map(
                    (line, index) => `
                      <div class="franchise-stat-row">
                        <span>${index + 1}</span>
                        <strong>${escapeHTML(line.name)}</strong>
                        <span>${escapeHTML(teamsById.get(line.teamId)?.abbr || "")}</span>
                        <span>${escapeHTML(line.goals)}</span>
                      </div>
                    `
                  )
                  .join("")
              : `<p class="franchise-note">No games simulated yet this season.</p>`
          }
        </div>
        <div>
          <h3>Assists</h3>
          ${
            topAssists.length
              ? topAssists
                  .map(
                    (line, index) => `
                      <div class="franchise-stat-row">
                        <span>${index + 1}</span>
                        <strong>${escapeHTML(line.name)}</strong>
                        <span>${escapeHTML(teamsById.get(line.teamId)?.abbr || "")}</span>
                        <span>${escapeHTML(line.assists)}</span>
                      </div>
                    `
                  )
                  .join("")
              : `<p class="franchise-note">No games simulated yet this season.</p>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderHomePage(config, save) {
  return `
    ${renderTutorial()}
    ${renderTeamPicker(config, save)}
    ${renderSeasonFormat(config, save)}
    ${renderPlayoffFormat(config)}
  `;
}

function renderDraftPage(config, save) {
  if (!save) return statusMessage("empty", "Start a franchise from the Home page first.");
  if (save.phase === "predraft") return renderDraftIntro();
  if (save.phase === "draft") return renderDraftBoard(config, save);
  return `
    <section class="section-panel">
      ${statusMessage("empty", "The draft is complete for this season.")}
    </section>
    ${renderContractsPanel(config, save)}
  `;
}

function rosterReady(save) {
  return !!save && (save.rosters[save.userTeamId] || []).length > 0;
}

function renderPageContent(config, save) {
  if (currentPage === "home") return renderHomePage(config, save);
  if (!save) return renderHomePage(config, save);

  if (currentPage === "draft") return renderDraftPage(config, save);

  const gate = phaseGate(save, rosterReady(save), "Finish the fantasy draft first to unlock this page.");
  if (gate) return gate;

  if (currentPage === "hub") {
    return `
      ${renderFranchiseHub(config, save)}
      ${
        nextSeasonMessage
          ? `<section class="section-panel"><p class="franchise-trade-message accepted">${escapeHTML(nextSeasonMessage)}</p></section>`
          : ""
      }
      ${save.phase === "playoffs-complete" ? renderPlayoffResultsPanel(config, save) : ""}
    `;
  }
  if (currentPage === "team") {
    return `
      ${renderTeamManagementPanel(config, save)}
      ${renderContractsPanel(config, save)}
    `;
  }
  if (currentPage === "trade") return renderTradeCenter(config, save);
  if (currentPage === "freeagency") return renderFreeAgencyCenter(config, save);
  if (currentPage === "stats") return renderStatsPanel(config, save);
  if (currentPage === "records") return renderRecordsPanel(config, save);
  if (currentPage === "awards") return renderAwardsPanel(config, save);
  return renderFranchiseHub(config, save);
}

function runCpuAndAdvance(save) {
  autoAdvanceCpuPicks(save, playerPool);
  if (isDraftComplete(save)) finalizeDraftContracts(save);
  saveFranchiseSave(save);
}

function attachHandlers(config) {
  [...document.querySelectorAll("[data-franchise-page]")].forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      currentPage = button.dataset.franchisePage;
      render(config);
    });
  });

  [...document.querySelectorAll("[data-franchise-difficulty]")].forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      pickedDifficulty = button.dataset.franchiseDifficulty;
      render(config);
    });
  });

  const teamButtons = [...document.querySelectorAll("[data-franchise-team]")];
  teamButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      pickedTeamId = button.dataset.franchiseTeam;
      render(config);
    });
  });

  const startButton = document.getElementById("franchise-start-button");
  startButton?.addEventListener("click", () => {
    if (!pickedTeamId) return;
    const save = createFranchiseSave(config, pickedTeamId, pickedDifficulty);
    saveFranchiseSave(save);
    currentPage = "draft";
    render(config);
  });

  const resetButton = document.getElementById("franchise-reset-button");
  resetButton?.addEventListener("click", () => {
    const confirmed = window.confirm("Reset your franchise? This clears your current save and cannot be undone.");
    if (!confirmed) return;
    clearFranchiseSave();
    pickedTeamId = "";
    pickedDifficulty = "medium";
    tradePartnerId = "";
    tradeGivePlayerIds = new Set();
    tradeReceivePlayerIds = new Set();
    tradeGivePick = false;
    tradeReceivePick = false;
    tradeMessage = null;
    cpuTradeMessage = null;
    trainingMessage = null;
    lineupFormation = "";
    lineupSelection = new Set();
    lineupSelectionInit = false;
    lineupMessage = null;
    freeAgencyPositionFilter = "All";
    freeAgencyMessage = null;
    nextSeasonMessage = null;
    draftBoardTeamId = "";
    currentPage = "home";
    render(config);
  });

  const beginDraftButton = document.getElementById("franchise-begin-draft-button");
  beginDraftButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    startDraft(save, playerPool);
    runCpuAndAdvance(save);
    currentPage = "draft";
    render(config);
  });

  [...document.querySelectorAll("[data-draft-filter]")].forEach((button) => {
    button.addEventListener("click", () => {
      draftPositionFilter = button.dataset.draftFilter;
      render(config);
    });
  });

  document.getElementById("draft-team-select")?.addEventListener("change", (event) => {
    draftBoardTeamId = event.target.value;
    render(config);
  });

  [...document.querySelectorAll("[data-draft-player]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      draftPlayer(save, button.dataset.draftPlayer, playerPool);
      runCpuAndAdvance(save);
      if (isDraftComplete(save)) currentPage = "hub";
      render(config);
    });
  });

  // Trading handlers
  [...document.querySelectorAll("[data-trade-block-toggle]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      const playerId = button.dataset.tradeBlockToggle;
      const list = new Set(save.tradeBlock[save.userTeamId] || []);
      if (list.has(playerId)) list.delete(playerId);
      else list.add(playerId);
      save.tradeBlock[save.userTeamId] = [...list];
      saveFranchiseSave(save);
      render(config);
    });
  });

  const tradePartnerSelect = document.getElementById("trade-partner");
  tradePartnerSelect?.addEventListener("change", (event) => {
    tradePartnerId = event.target.value;
    tradeGivePlayerIds = new Set();
    tradeReceivePlayerIds = new Set();
    tradeGivePick = false;
    tradeReceivePick = false;
    tradeMessage = null;
    render(config);
  });

  [...document.querySelectorAll("[data-trade-give-player]")].forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.tradeGivePlayer;
      if (input.checked) tradeGivePlayerIds.add(id);
      else tradeGivePlayerIds.delete(id);
      tradeMessage = null;
      render(config);
    });
  });

  [...document.querySelectorAll("[data-trade-receive-player]")].forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.tradeReceivePlayer;
      if (input.checked) tradeReceivePlayerIds.add(id);
      else tradeReceivePlayerIds.delete(id);
      tradeMessage = null;
      render(config);
    });
  });

  const givePickInput = document.getElementById("trade-give-pick");
  givePickInput?.addEventListener("change", (event) => {
    tradeGivePick = event.target.checked;
    tradeMessage = null;
    render(config);
  });

  const receivePickInput = document.getElementById("trade-receive-pick");
  receivePickInput?.addEventListener("change", (event) => {
    tradeReceivePick = event.target.checked;
    tradeMessage = null;
    render(config);
  });

  const proposeTradeButton = document.getElementById("franchise-propose-trade-button");
  proposeTradeButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save || !tradePartnerId) return;
    const teamA = save.teams.find((team) => team.id === save.userTeamId);
    const teamB = save.teams.find((team) => team.id === tradePartnerId);
    const yourPick = (save.futurePicks[save.userTeamId] || [])[0];
    const theirPick = (save.futurePicks[tradePartnerId] || [])[0];

    const offer = {
      teamAId: save.userTeamId,
      teamBId: tradePartnerId,
      teamAName: teamA?.name,
      teamBName: teamB?.name,
      teamAGives: { playerIds: [...tradeGivePlayerIds], picks: tradeGivePick && yourPick ? [yourPick] : [] },
      teamBGives: { playerIds: [...tradeReceivePlayerIds], picks: tradeReceivePick && theirPick ? [theirPick] : [] },
    };

    if (!offer.teamAGives.playerIds.length && !offer.teamAGives.picks.length && !offer.teamBGives.playerIds.length && !offer.teamBGives.picks.length) {
      tradeMessage = { accepted: false, text: "Select at least one asset on each side before proposing a trade." };
      render(config);
      return;
    }

    const evaluation = evaluateTradeOffer(save, offer);
    if (evaluation.cpuAccepts) {
      executeTrade(save, offer);
      saveFranchiseSave(save);
      tradeMessage = { accepted: true, text: `${teamB?.name || "The CPU"} accepted the trade.` };
      tradeGivePlayerIds = new Set();
      tradeReceivePlayerIds = new Set();
      tradeGivePick = false;
      tradeReceivePick = false;
    } else {
      tradeMessage = { accepted: false, text: evaluation.reason };
    }
    render(config);
  });

  const simulateCpuTradeButton = document.getElementById("franchise-simulate-cpu-trade-button");
  simulateCpuTradeButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    const result = proposeCpuToCpuTrade(save, playerPool);
    if (result.executed) {
      saveFranchiseSave(save);
      cpuTradeMessage = { accepted: true, text: `${result.playerFromA.name} and ${result.playerFromB.name} swapped teams in a CPU-to-CPU trade.` };
    } else {
      cpuTradeMessage = { accepted: false, text: "No CPU teams found a trade they both agreed on this time. Try again." };
    }
    render(config);
  });

  // Season Hub handlers
  const startSeasonButton = document.getElementById("franchise-start-season-button");
  startSeasonButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    startSeason(save);
    nextSeasonMessage = null;
    saveFranchiseSave(save);
    render(config);
  });

  const simulateWeekButton = document.getElementById("franchise-simulate-week-button");
  simulateWeekButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    advanceWeek(save);
    saveFranchiseSave(save);
    render(config);
  });

  const simulatePlayoffsButton = document.getElementById("franchise-simulate-playoffs-button");
  simulatePlayoffsButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    runPlayoffs(save);
    saveFranchiseSave(save);
    render(config);
  });

  const nextSeasonButton = document.getElementById("franchise-next-season-button");
  nextSeasonButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    const { retired } = startNextSeason(save);
    nextSeasonMessage = retired.length
      ? `${retired.length} player${retired.length === 1 ? "" : "s"} retired in the offseason: ${retired.map((entry) => entry.player.name).join(", ")}.`
      : "No players retired this offseason.";
    saveFranchiseSave(save);
    render(config);
  });

  // Team Management handlers
  [...document.querySelectorAll("[data-set-captain]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      setCaptain(save, save.userTeamId, button.dataset.setCaptain);
      saveFranchiseSave(save);
      render(config);
    });
  });

  [...document.querySelectorAll("[data-set-assistant]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      setAssistantCaptain(save, save.userTeamId, button.dataset.setAssistant);
      saveFranchiseSave(save);
      render(config);
    });
  });

  [...document.querySelectorAll("[data-train-player]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      const result = applyTraining(save, save.userTeamId, button.dataset.trainPlayer);
      trainingMessage = result.blocked
        ? { success: false, text: result.reason }
        : {
            success: result.success,
            text: result.success
              ? `${result.player.name} improved during training (now OVR ${result.player.rating}).`
              : `${result.player?.name || "The player"} showed no improvement this session.`,
          };
      saveFranchiseSave(save);
      render(config);
    });
  });

  const lineupFormationSelect = document.getElementById("lineup-formation");
  lineupFormationSelect?.addEventListener("change", (event) => {
    lineupFormation = event.target.value;
    lineupMessage = null;
    render(config);
  });

  [...document.querySelectorAll("[data-lineup-player]")].forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.lineupPlayer;
      if (input.checked) {
        if (lineupSelection.size >= STARTING_XI_SIZE) {
          lineupMessage = { success: false, text: `You can only start ${STARTING_XI_SIZE} players.` };
          render(config);
          return;
        }
        lineupSelection.add(id);
      } else {
        lineupSelection.delete(id);
      }
      lineupMessage = null;
      render(config);
    });
  });

  const saveLineupButton = document.getElementById("franchise-save-lineup-button");
  saveLineupButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    setLineup(save, save.userTeamId, lineupFormation, [...lineupSelection]);
    saveFranchiseSave(save);
    lineupMessage = { success: true, text: `Lineup saved: ${lineupFormation} with ${lineupSelection.size} starters.` };
    render(config);
  });

  // Free Agency handlers
  [...document.querySelectorAll("[data-fa-filter]")].forEach((button) => {
    button.addEventListener("click", () => {
      freeAgencyPositionFilter = button.dataset.faFilter;
      render(config);
    });
  });

  [...document.querySelectorAll("[data-sign-player]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      const result = signFreeAgent(save, save.userTeamId, button.dataset.signPlayer, playerPool);
      freeAgencyMessage = {
        success: result.success,
        text: result.success ? `Signed ${result.player.name}.` : result.reason || "Could not sign that player.",
      };
      saveFranchiseSave(save);
      render(config);
    });
  });

  [...document.querySelectorAll("[data-waive-player]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      const result = waivePlayer(save, save.userTeamId, button.dataset.waivePlayer);
      freeAgencyMessage = {
        success: result.success,
        text: result.success ? `${result.player.name} was waived and is now a free agent.` : "Could not waive that player.",
      };
      saveFranchiseSave(save);
      render(config);
    });
  });
}

function heroBadge(save) {
  if (!save) return "Part 1: League Structure";
  if (save.phase === "predraft") return "Part 2: Ready to Draft";
  if (save.phase === "draft") return "Part 2: Draft in Progress";
  if (save.phase === "offseason") return `Part 3: Season ${save.season} Offseason`;
  if (save.phase === "season") return `Part 3: Season ${save.season}, Week ${save.week}`;
  if (save.phase === "postseason-ready") return "Part 3: Playoffs Ready";
  if (save.phase === "playoffs-complete") return "Part 3: Playoffs Complete";
  return "Part 2: Contracts & Trading Live";
}

function render(config) {
  const save = loadFranchiseSave();

  root.innerHTML = `
    <section class="hero franchise-hero">
      <div class="hero-copy">
        <span class="hero-kicker">${escapeHTML(config.modeName || "Franchise Mode")}</span>
        <h1>${escapeHTML(config.subModeName || "Fantasy Draft")}</h1>
        <p>${escapeHTML(config.description || config.tagline || "")}</p>
        ${renderFeaturePills(config.features)}
      </div>
      <aside class="hero-logo-card" aria-label="Franchise Mode">
        <img src="${escapeHTML(SITE.logo)}" alt="Lantern Soccer League logo">
        <strong>${escapeHTML(config.modeName || "Franchise Mode")}</strong>
        <span class="pill">${escapeHTML(heroBadge(save))}</span>
      </aside>
    </section>

    ${renderPageNav(save)}
    ${renderPageContent(config, save)}
  `;

  attachHandlers(config);
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading Franchise Mode...");
  const [config, players] = await Promise.all([loadFranchiseConfig(), loadFranchisePlayerPool()]);
  playerPool = players;
  if (loadFranchiseSave()) currentPage = "hub";
  render(config);
}

init();
