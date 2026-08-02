import { SITE } from "./config.js";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";
import {
  CAP_MAX,
  DRAFT_ROUNDS,
  MAX_CONTRACT_YEARS,
  TRADE_DEADLINE_WEEK,
  autoAdvanceCpuPicks,
  availablePlayers,
  clearFranchiseSave,
  createFranchiseSave,
  currentPick,
  draftPlayer,
  evaluateTradeOffer,
  executeTrade,
  finalizeDraftContracts,
  formatMoney,
  isDraftComplete,
  isTradeDeadlinePassed,
  loadFranchiseConfig,
  loadFranchisePlayerPool,
  loadFranchiseSave,
  pickTradeValue,
  playerTradeValue,
  proposeCpuToCpuTrade,
  saveFranchiseSave,
  startDraft,
  teamCapSpace,
  teamCapUsed,
} from "./franchiseCore.js";

setupLayout("franchise.html");
setDocumentTitle("Franchise Mode");

const root = document.getElementById("page-root");

let pickedTeamId = "";
let playerPool = [];
let draftPositionFilter = "All";
let tradePartnerId = "";
let tradeGivePlayerIds = new Set();
let tradeReceivePlayerIds = new Set();
let tradeGivePick = false;
let tradeReceivePick = false;
let tradeMessage = null;
let cpuTradeMessage = null;

function renderFeaturePills(features = []) {
  return `
    <div class="franchise-feature-pills">
      ${features.map((feature) => `<span class="pill">${escapeHTML(feature)}</span>`).join("")}
    </div>
  `;
}

function renderRoadmap(roadmap = []) {
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Build Roadmap</span>
          <h2>Franchise Mode Parts</h2>
          <p>Franchise Mode is being built in five parts. Parts 1 and 2 are live below; the rest are coming next.</p>
        </div>
      </div>
      <div class="grid franchise-roadmap-grid">
        ${roadmap
          .map(
            (item) => `
              <article class="card franchise-roadmap-card${item.status === "available" ? " available" : ""}">
                <div class="franchise-roadmap-top">
                  <span class="pill${item.status === "available" ? " green" : ""}">Part ${escapeHTML(item.part)}</span>
                  <span class="franchise-roadmap-status">${item.status === "available" ? "Available now" : "Coming soon"}</span>
                </div>
                <h3>${escapeHTML(item.title)}</h3>
                <p>${escapeHTML(item.summary)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
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
  return `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Part 2: Trading</span>
          <h2>Trade Centre</h2>
          <p>Hard-difficulty trading: CPU teams only accept offers where they come out ahead on value. Trades lock after week ${escapeHTML(TRADE_DEADLINE_WEEK)}.</p>
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

function renderDraftCenter(config, save) {
  if (!save) return "";
  if (save.phase === "predraft") return renderDraftIntro();
  if (save.phase === "draft") return renderDraftBoard(config, save);
  return `
    ${renderContractsPanel(config, save)}
    ${renderTradeCenter(config, save)}
  `;
}

function runCpuAndAdvance(save) {
  autoAdvanceCpuPicks(save, playerPool);
  if (isDraftComplete(save)) finalizeDraftContracts(save);
  saveFranchiseSave(save);
}

function attachHandlers(config) {
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
    const save = createFranchiseSave(config, pickedTeamId);
    saveFranchiseSave(save);
    render(config);
  });

  const resetButton = document.getElementById("franchise-reset-button");
  resetButton?.addEventListener("click", () => {
    const confirmed = window.confirm("Reset your franchise? This clears your current save and cannot be undone.");
    if (!confirmed) return;
    clearFranchiseSave();
    pickedTeamId = "";
    tradePartnerId = "";
    tradeGivePlayerIds = new Set();
    tradeReceivePlayerIds = new Set();
    tradeGivePick = false;
    tradeReceivePick = false;
    tradeMessage = null;
    cpuTradeMessage = null;
    render(config);
  });

  const beginDraftButton = document.getElementById("franchise-begin-draft-button");
  beginDraftButton?.addEventListener("click", () => {
    const save = loadFranchiseSave();
    if (!save) return;
    startDraft(save, playerPool);
    runCpuAndAdvance(save);
    render(config);
  });

  [...document.querySelectorAll("[data-draft-filter]")].forEach((button) => {
    button.addEventListener("click", () => {
      draftPositionFilter = button.dataset.draftFilter;
      render(config);
    });
  });

  [...document.querySelectorAll("[data-draft-player]")].forEach((button) => {
    button.addEventListener("click", () => {
      const save = loadFranchiseSave();
      if (!save) return;
      draftPlayer(save, button.dataset.draftPlayer, playerPool);
      runCpuAndAdvance(save);
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
}

function heroBadge(save) {
  if (!save) return "Part 1: League Structure";
  if (save.phase === "predraft") return "Part 2: Ready to Draft";
  if (save.phase === "draft") return "Part 2: Draft in Progress";
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

    ${renderRoadmap(config.roadmap)}
    ${renderTeamPicker(config, save)}
    ${renderDraftCenter(config, save)}
    ${renderSeasonFormat(config, save)}
    ${renderPlayoffFormat(config)}
  `;

  attachHandlers(config);
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading Franchise Mode...");
  const [config, players] = await Promise.all([loadFranchiseConfig(), loadFranchisePlayerPool()]);
  playerPool = players;
  render(config);
}

init();
