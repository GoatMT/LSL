import { loadSeasonData } from "./dataLoader.js?v=20261108-data3";
import { setupLayout } from "./main.js?v=20261108-palette1";
import { buildPlayerPool, FORMATIONS, formationSlots, roleLabel, summarizePlayers } from "./teamBuilderCore.js?v=20261108-palette1";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js?v=1.0";

const STORAGE_KEY = "lsl-team-builder-v1";
const SEASONS = ["2024", "2025", "2026"];
const PLAYER_DATA_FILES = ["teams", "players", "matches", "standings", "playoffs", "awards"];

const state = {
  season: "2026",
  division: "Seniors",
  formation: "4-3-3",
  selectedSlot: "GK",
  lineup: {},
  search: "",
  position: "All",
  sort: "ovr",
  showAllPlayers: false,
  saveName: "My LSL XI",
  editingSaveId: "",
  comparisonId: "",
  comparison: null,
  saves: readSaves(),
  message: "",
  busy: false,
};

const root = document.getElementById("page-root");
let seasonData = null;
let playerPool = [];
let seasonLoadSequence = 0;

function readSaves() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((save) => save && save.id && Array.isArray(save.players)) : [];
  } catch {
    return [];
  }
}

function currentSlots() {
  return formationSlots(state.formation);
}

function currentPlayers() {
  const byId = new Map(playerPool.map((player) => [player.id, player]));
  return currentSlots().flatMap((slot) => {
    const player = byId.get(state.lineup[slot.id]);
    return player ? [{ ...player, slotId: slot.id, slotLabel: slot.label }] : [];
  });
}

function snapshotCurrent() {
  return {
    id: state.editingSaveId || "current",
    name: state.saveName.trim() || "Current lineup",
    season: state.season,
    division: state.division,
    formation: state.formation,
    assignments: { ...state.lineup },
    players: currentPlayers().map(({ id, name, position, ovr, goals, wins, gamesPlayed, slotId, slotLabel }) => ({
      id, name, position, ovr, goals, wins, gamesPlayed, slotId, slotLabel,
    })),
  };
}

function playerResults() {
  const selected = new Set(Object.values(state.lineup));
  return playerPool
    .filter((player) => state.position === "All" || roleLabel(player.position) === state.position)
    .filter((player) => `${player.name} ${player.teamName} ${player.position}`.toLowerCase().includes(state.search.trim().toLowerCase()))
    .sort((a, b) => {
      if (state.sort === "goals") return b.goals - a.goals || b.ovr - a.ovr || a.name.localeCompare(b.name);
      if (state.sort === "games") return b.gamesPlayed - a.gamesPlayed || b.ovr - a.ovr || a.name.localeCompare(b.name);
      return b.ovr - a.ovr || b.goals - a.goals || a.name.localeCompare(b.name);
    })
    .map((player) => ({ ...player, selected: selected.has(player.id) }));
}

function renderControls() {
  const seasons = SEASONS.map((year) => `<option value="${year}"${state.season === year ? " selected" : ""}>${year}</option>`).join("");
  const divisions = ["Seniors", "Juniors", "All"].map((division) => `<option value="${division}"${state.division === division ? " selected" : ""}>${division === "All" ? "Both divisions" : division}</option>`).join("");
  const formations = Object.keys(FORMATIONS).map((formation) => `<option value="${formation}"${state.formation === formation ? " selected" : ""}>${formation}</option>`).join("");
  return `
    <section class="section-panel builder-controls" aria-label="Lineup settings">
      <label class="control"><span>Season</span><select id="builder-season">${seasons}</select></label>
      <label class="control"><span>Division</span><select id="builder-division">${divisions}</select></label>
      <label class="control"><span>Formation</span><select id="builder-formation">${formations}</select></label>
      <label class="control"><span>Lineup name</span><input id="builder-name" type="text" maxlength="40" value="${escapeHTML(state.saveName)}"></label>
    </section>
  `;
}

function renderFormation() {
  const slots = currentSlots();
  const byId = new Map(playerPool.map((player) => [player.id, player]));
  return `
    <section class="section-panel builder-pitch-panel" aria-labelledby="builder-pitch-title">
      <div class="section-head compact-head">
        <div><span class="eyebrow">Starting XI</span><h2 id="builder-pitch-title">${escapeHTML(state.formation)} formation</h2><p>Select a position, then assign a player from the season pool.</p></div>
        <span class="pill">${Object.keys(state.lineup).length} / 11</span>
      </div>
      <div class="builder-pitch" role="group" aria-label="Soccer formation positions">
        ${FORMATIONS[state.formation].map(([line, lineSlots]) => `
          <div class="builder-pitch-line" aria-label="${escapeHTML(line)}">
            ${lineSlots.map((slot) => {
              const player = byId.get(state.lineup[slot.id]);
              const active = state.selectedSlot === slot.id;
              return `
                <div class="builder-position${active ? " selected" : ""}${player ? " occupied" : ""}">
                  <button type="button" class="builder-position-select" data-slot="${escapeHTML(slot.id)}" aria-pressed="${active}" aria-label="${escapeHTML(slot.label)}${player ? `: ${escapeHTML(player.name)}` : ", empty"}">
                    <span class="builder-position-code">${escapeHTML(slot.id)}</span>
                    <strong>${escapeHTML(player?.name || "Select player")}</strong>
                    <small>${player ? `${escapeHTML(player.position)} | OVR ${player.ovr}` : escapeHTML(slot.label)}</small>
                  </button>
                  ${player ? `<button class="builder-position-clear" type="button" data-clear-slot="${escapeHTML(slot.id)}" aria-label="Remove ${escapeHTML(player.name)} from ${escapeHTML(slot.label)}">Remove</button>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        `).join("")}
      </div>
      <div class="builder-pitch-footer"><span>Selected position</span><strong>${escapeHTML(slots.find((slot) => slot.id === state.selectedSlot)?.label || "Choose a position")}</strong></div>
    </section>
  `;
}

function renderPlayerPool() {
  const rows = playerResults();
  const visible = state.showAllPlayers ? rows : rows.slice(0, 16);
  const selectedSlot = currentSlots().find((slot) => slot.id === state.selectedSlot);
  return `
    <section class="section-panel builder-pool-panel" aria-labelledby="builder-pool-title">
      <div class="section-head compact-head">
        <div><span class="eyebrow">Season Player Pool</span><h2 id="builder-pool-title">Choose players</h2><p>${escapeHTML(rows.length)} players | Assigning to ${escapeHTML(selectedSlot?.label || "a position")}</p></div>
      </div>
      <div class="builder-pool-controls">
        <label class="control builder-search"><span>Search players</span><input id="builder-search" type="search" value="${escapeHTML(state.search)}" placeholder="Name, team, position"${state.busy ? " disabled" : ""}></label>
        <label class="control"><span>Position</span><select id="builder-position"${state.busy ? " disabled" : ""}><option value="All">All positions</option>${["Goalkeeper", "Defender", "Midfielder", "Forward", "Field"].map((position) => `<option value="${position}"${state.position === position ? " selected" : ""}>${position}</option>`).join("")}</select></label>
        <label class="control"><span>Sort by</span><select id="builder-sort"${state.busy ? " disabled" : ""}><option value="ovr"${state.sort === "ovr" ? " selected" : ""}>OVR</option><option value="goals"${state.sort === "goals" ? " selected" : ""}>Goals</option><option value="games"${state.sort === "games" ? " selected" : ""}>Games played</option></select></label>
      </div>
      <div class="builder-player-list" aria-live="polite">
        ${state.busy ? statusMessage("loading", `Loading ${escapeHTML(state.season)} player pool...`) : visible.map((player) => `
          <article class="builder-player-row">
            <div class="builder-player-rating" aria-label="Overall ${player.ovr}">${player.ovr}</div>
            <div class="builder-player-copy"><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.teamName || "Team unlisted")} | ${escapeHTML(player.position)}</small></div>
            <div class="builder-player-stats"><span>${player.goals} G</span><span>${player.gamesPlayed} GP</span></div>
            <button type="button" class="button${player.selected ? "" : " primary"}" data-assign-player="${escapeHTML(player.id)}"${player.selected ? " disabled" : ""}>${player.selected ? "In XI" : "Assign"}</button>
          </article>
        `).join("") || statusMessage("empty", rows.length ? "No players match those filters." : `No ${state.division === "All" ? "" : `${escapeHTML(state.division)} `}players are recorded for ${escapeHTML(state.season)}.`)}
      </div>
      ${rows.length > 16 ? `<button type="button" class="button builder-more" data-show-all>${state.showAllPlayers ? "Show fewer players" : `Show all ${rows.length} players`}</button>` : ""}
    </section>
  `;
}

function renderSummary() {
  const summary = summarizePlayers(currentPlayers());
  const values = [
    ["Players", `${summary.count} / 11`],
    ["Average OVR", summary.count ? summary.averageOvr : "--"],
    ["Goals", summary.goals],
    ["Wins", summary.wins],
  ];
  return `<div class="builder-summary-grid">${values.map(([label, value]) => `<article class="builder-summary-stat"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></article>`).join("")}</div>`;
}

function renderSavedTools() {
  const options = state.saves.map((save) => `<option value="${escapeHTML(save.id)}"${state.comparisonId === save.id ? " selected" : ""}>${escapeHTML(save.name)} | ${escapeHTML(save.season)} ${escapeHTML(save.division)}</option>`).join("");
  return `
    <section class="section-panel builder-saved-panel" aria-labelledby="builder-saved-title">
      <div class="section-head compact-head"><div><span class="eyebrow">Lineup Library</span><h2 id="builder-saved-title">Saved builds</h2><p>Saved lineups stay in this browser on this device.</p></div></div>
      <div class="builder-saved-controls">
        <button type="button" class="button primary" data-save${state.busy ? " disabled" : ""}>${state.editingSaveId ? "Update saved lineup" : "Save lineup"}</button>
        <label class="control"><span>Saved lineup</span><select id="builder-saved-select"${state.busy ? " disabled" : ""}><option value="">Choose a saved lineup</option>${options}</select></label>
        <button type="button" class="button" data-load${state.saves.length && !state.busy ? "" : " disabled"}>Load</button>
        <button type="button" class="button" data-compare${state.saves.length && !state.busy ? "" : " disabled"}>Compare</button>
        <button type="button" class="button" data-delete${state.editingSaveId || state.comparisonId ? "" : " disabled"}>Delete</button>
      </div>
      ${state.message ? `<p class="builder-message" role="status">${escapeHTML(state.message)}</p>` : ""}
      ${state.comparison ? renderComparison(state.comparison) : ""}
    </section>
  `;
}

function renderComparison(comparison) {
  const current = comparison.current;
  const saved = comparison.saved;
  const left = summarizePlayers(current.players);
  const right = summarizePlayers(saved.players);
  const leftById = new Set(current.players.map((player) => player.id));
  const common = saved.players.filter((player) => leftById.has(player.id)).map((player) => player.name);
  const metrics = [
    ["Players selected", `${left.count} / 11`, `${right.count} / 11`],
    ["Average OVR", left.averageOvr, right.averageOvr],
    ["Goals", left.goals, right.goals],
    ["Wins", left.wins, right.wins],
    ["Games played", left.games, right.games],
  ];
  return `
    <div class="builder-comparison" aria-labelledby="builder-comparison-title">
      <div class="builder-comparison-head"><div><span class="eyebrow">Side-by-side</span><h3 id="builder-comparison-title">Lineup comparison</h3></div><button class="button" type="button" data-close-comparison>Close</button></div>
      <div class="builder-comparison-table" role="table" aria-label="Lineup comparison">
        <div class="builder-comparison-row labels" role="row"><span role="columnheader">Metric</span><strong role="columnheader">${escapeHTML(current.name)}</strong><strong role="columnheader">${escapeHTML(saved.name)}</strong></div>
        ${metrics.map(([label, a, b]) => `<div class="builder-comparison-row" role="row"><span role="rowheader">${escapeHTML(label)}</span><strong role="cell">${escapeHTML(a)}</strong><strong role="cell">${escapeHTML(b)}</strong></div>`).join("")}
      </div>
      <p class="builder-common-players">${common.length ? `Players in both lineups: ${escapeHTML(common.join(", "))}.` : "No players overlap between these lineups."}</p>
    </div>
  `;
}

function render() {
  root.innerHTML = `
    <section class="team-builder-heading">
      <div><span class="eyebrow">LSL Tools</span><h1>11v11 Team Builder</h1><p>Build a season-specific starting XI, set a formation, and compare lineups using recorded player stats and LSL OVR.</p></div>
      <div class="team-builder-mark" aria-hidden="true"><span>LSL</span><strong>XI</strong></div>
    </section>
    ${renderControls()}
    ${renderSummary()}
    <div class="builder-workspace">
      ${renderFormation()}
      ${renderPlayerPool()}
    </div>
    ${renderSavedTools()}
  `;
  bindControls();
}

async function loadSeason(year) {
  const sequence = ++seasonLoadSequence;
  state.busy = true;
  playerPool = [];
  state.lineup = {};
  state.comparison = null;
  render();
  try {
    const nextSeasonData = await loadSeasonData(year, PLAYER_DATA_FILES);
    if (sequence !== seasonLoadSequence) return false;
    seasonData = nextSeasonData;
    playerPool = buildPlayerPool(seasonData, state.division);
    state.lineup = {};
    state.selectedSlot = currentSlots().find((slot) => slot.id === "GK")?.id || currentSlots()[0]?.id || "GK";
    state.comparison = null;
    state.busy = false;
    state.message = "";
    render();
    return true;
  } catch (error) {
    if (sequence !== seasonLoadSequence) return false;
    console.error("Could not load the team-builder season", error);
    state.busy = false;
    seasonData = null;
    playerPool = [];
    render();
    root.querySelector(".builder-pitch-panel")?.insertAdjacentHTML("beforeend", statusMessage("error", "This season's player pool could not load. Please try again."));
    return false;
  }
}

function nextOpenSlot(currentId) {
  const slots = currentSlots();
  const start = Math.max(0, slots.findIndex((slot) => slot.id === currentId));
  for (let offset = 1; offset <= slots.length; offset += 1) {
    const slot = slots[(start + offset) % slots.length];
    if (!state.lineup[slot.id]) return slot.id;
  }
  return currentId;
}

function assignPlayer(playerId) {
  const player = playerPool.find((item) => item.id === playerId);
  if (!player || Object.values(state.lineup).includes(playerId)) return;
  state.lineup[state.selectedSlot] = playerId;
  state.selectedSlot = nextOpenSlot(state.selectedSlot);
  state.comparison = null;
  state.message = "";
  render();
}

function saveLineup() {
  const snapshot = snapshotCurrent();
  if (!snapshot.players.length) {
    state.message = "Add at least one player before saving a lineup.";
    render();
    return;
  }
  const existing = state.saves.findIndex((save) => save.id === state.editingSaveId);
  const save = { ...snapshot, id: state.editingSaveId || `lineup-${Date.now()}`, updatedAt: new Date().toISOString() };
  const nextSaves = [...state.saves];
  if (existing >= 0) nextSaves[existing] = save;
  else nextSaves.unshift(save);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSaves));
  } catch {
    state.message = "Could not save on this device. Browser storage may be full or unavailable.";
    render();
    return;
  }
  state.saves = nextSaves;
  state.editingSaveId = save.id;
  state.comparisonId = save.id;
  state.message = "Lineup saved on this device.";
  render();
}

async function loadSavedLineup() {
  const save = state.saves.find((item) => item.id === state.comparisonId);
  if (!save) return;
  if (save.season !== state.season || save.division !== state.division) {
    state.season = save.season;
    state.division = save.division;
    const loaded = await loadSeason(save.season);
    if (!loaded) return;
  }
  const knownIds = new Set(playerPool.map((player) => player.id));
  state.formation = FORMATIONS[save.formation] ? save.formation : "4-3-3";
  const validSlots = new Set(currentSlots().map((slot) => slot.id));
  const usedIds = new Set();
  state.lineup = Object.fromEntries(Object.entries(save.assignments || {}).filter(([slotId, id]) => {
    if (!validSlots.has(slotId) || !knownIds.has(id) || usedIds.has(id)) return false;
    usedIds.add(id);
    return true;
  }));
  if (!Object.keys(state.lineup).length) {
    state.lineup = Object.fromEntries(save.players.filter((player) => {
      if (!validSlots.has(player.slotId) || !knownIds.has(player.id) || usedIds.has(player.id)) return false;
      usedIds.add(player.id);
      return true;
    }).map((player) => [player.slotId, player.id]));
  }
  state.selectedSlot = currentSlots().find((slot) => !state.lineup[slot.id])?.id || currentSlots()[0]?.id;
  state.saveName = save.name;
  state.editingSaveId = save.id;
  state.message = "Saved lineup loaded.";
  render();
}

function compareLineup() {
  const saved = state.saves.find((item) => item.id === state.comparisonId);
  if (!saved) return;
  state.comparison = { current: snapshotCurrent(), saved };
  state.message = "Comparing current lineup with the saved snapshot.";
  render();
}

function deleteSavedLineup() {
  const id = state.comparisonId || state.editingSaveId;
  if (!id) return;
  const nextSaves = state.saves.filter((save) => save.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSaves));
  } catch {
    state.message = "Could not delete this lineup from browser storage.";
    render();
    return;
  }
  state.saves = nextSaves;
  if (state.editingSaveId === id) state.editingSaveId = "";
  if (state.comparisonId === id) state.comparisonId = "";
  state.comparison = null;
  state.message = "Saved lineup deleted from this device.";
  render();
}

function bindSavedControls() {
  document.getElementById("builder-saved-select")?.addEventListener("change", (event) => {
    state.comparisonId = event.target.value;
    state.editingSaveId = "";
    state.comparison = null;
    state.message = "";
    renderSavedPanelOnly();
  });
  root.querySelector("[data-save]")?.addEventListener("click", saveLineup);
  root.querySelector("[data-load]")?.addEventListener("click", () => void loadSavedLineup());
  root.querySelector("[data-compare]")?.addEventListener("click", compareLineup);
  root.querySelector("[data-delete]")?.addEventListener("click", deleteSavedLineup);
  root.querySelector("[data-close-comparison]")?.addEventListener("click", () => {
    state.comparison = null;
    render();
  });
}

function bindControls() {
  document.getElementById("builder-season")?.addEventListener("change", (event) => {
    state.season = event.target.value;
    state.editingSaveId = "";
    state.saveName = "My LSL XI";
    void loadSeason(state.season);
  });
  document.getElementById("builder-division")?.addEventListener("change", (event) => {
    state.division = event.target.value;
    state.editingSaveId = "";
    state.saveName = "My LSL XI";
    void loadSeason(state.season);
  });
  document.getElementById("builder-formation")?.addEventListener("change", (event) => {
    if (Object.keys(state.lineup).length && !window.confirm("Changing formation clears the current lineup. Continue?")) {
      event.target.value = state.formation;
      return;
    }
    state.formation = event.target.value;
    state.lineup = {};
    state.selectedSlot = currentSlots()[0]?.id || "GK";
    state.comparison = null;
    render();
  });
  document.getElementById("builder-name")?.addEventListener("input", (event) => {
    state.saveName = event.target.value;
  });
  document.getElementById("builder-search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    state.showAllPlayers = false;
    const list = root.querySelector(".builder-player-list");
    const actions = root.querySelector("[data-show-all]");
    if (list) list.outerHTML = renderPlayerListOnly();
    if (actions) actions.outerHTML = renderShowAllOnly();
    bindPlayerActions();
  });
  document.getElementById("builder-position")?.addEventListener("change", (event) => {
    state.position = event.target.value;
    render();
  });
  document.getElementById("builder-sort")?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  root.querySelectorAll("[data-slot]").forEach((button) => button.addEventListener("click", () => {
    state.selectedSlot = button.dataset.slot;
    render();
  }));
  root.querySelectorAll("[data-clear-slot]").forEach((button) => button.addEventListener("click", () => {
    delete state.lineup[button.dataset.clearSlot];
    state.selectedSlot = button.dataset.clearSlot;
    state.comparison = null;
    render();
  }));
  bindPlayerActions();
  bindSavedControls();
}

function renderPlayerListOnly() {
  return `<div class="builder-player-list" aria-live="polite">${playerResults().slice(0, state.showAllPlayers ? undefined : 16).map((player) => `
    <article class="builder-player-row"><div class="builder-player-rating" aria-label="Overall ${player.ovr}">${player.ovr}</div><div class="builder-player-copy"><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.teamName)} | ${escapeHTML(player.position)}</small></div><div class="builder-player-stats"><span>${player.goals} G</span><span>${player.gamesPlayed} GP</span></div><button type="button" class="button${player.selected ? "" : " primary"}" data-assign-player="${escapeHTML(player.id)}"${player.selected ? " disabled" : ""}>${player.selected ? "In XI" : "Assign"}</button></article>
  `).join("") || statusMessage("empty", "No players match those filters.")}</div>`;
}

function renderShowAllOnly() {
  const count = playerResults().length;
  return count > 16 ? `<button type="button" class="button builder-more" data-show-all>${state.showAllPlayers ? "Show fewer players" : `Show all ${count} players`}</button>` : "";
}

function renderSavedPanelOnly() {
  const savedPanel = root.querySelector(".builder-saved-panel");
  if (!savedPanel) return;
  savedPanel.outerHTML = renderSavedTools();
  bindSavedControls();
}

function bindPlayerActions() {
  root.querySelectorAll("[data-assign-player]").forEach((button) => button.addEventListener("click", () => assignPlayer(button.dataset.assignPlayer)));
  root.querySelector("[data-show-all]")?.addEventListener("click", () => {
    state.showAllPlayers = !state.showAllPlayers;
    const list = root.querySelector(".builder-player-list");
    const action = root.querySelector("[data-show-all]");
    if (list) list.outerHTML = renderPlayerListOnly();
    if (action) action.outerHTML = renderShowAllOnly();
    bindPlayerActions();
  });
}

setupLayout("team-builder.html");
setDocumentTitle("11v11 Team Builder");
loadSeason("2026");
