import { escapeHTML } from "./utils.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// Fan MVP / Golden Boot voting.
// Candidates come straight from data/award-watch.json's "MVP Watch" and
// "Golden Boot Watch" leader lists, so the poll automatically rotates to a
// new week whenever that file is updated - no separate poll data file to
// maintain.
//
// Votes are stored in Cloud Firestore (project "lsl-fan-vote"), so the tally
// is shared live across every visitor, not just the local browser. Each
// visitor gets a random anonymous voter id saved in localStorage so they can
// change their vote later; there is no login, but a display name is required
// before a vote is accepted (also saved in localStorage so it's remembered).
// Firestore document layout:
//   fanVotePolls/{pollKey}__{categoryKey}
//     { votes: { [voterId]: { playerId, name }, ... } }
// (Older documents may still have a plain playerId string instead of an
// object for a given voterId - readers here handle both shapes.)
// Tallies are derived client-side by counting the values in that map, so a
// vote change is a single-field write and there is nothing to keep in sync.
//
// If Firestore can't be reached (offline, blocked, misconfigured project),
// voting falls back to a local-only tally stored in localStorage so the
// page still works, just without the shared count.

const VOTER_ID_KEY = "lsl-fan-vote-voter-id";
const VOTER_NAME_KEY = "lsl-fan-vote-voter-name";
const LOCAL_FALLBACK_KEY = "lsl-fan-vote-local-fallback";

const firebaseConfig = {
  apiKey: "AIzaSyCQtq6rPa4268ciIOTwkuSaG5EFGZohepc",
  authDomain: "lsl-fan-vote.firebaseapp.com",
  projectId: "lsl-fan-vote",
  storageBucket: "lsl-fan-vote.firebasestorage.app",
  messagingSenderId: "964442750763",
  appId: "1:964442750763:web:0ac864a56a8820f345cf6e",
};

const CATEGORY_META = {
  mvp: { label: "MVP Watch", title: "Fan MVP", icon: "⭐", blurb: "Vote for this week's Fan MVP." },
};

let db = null;
let firebaseReady = false;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseReady = true;
} catch (error) {
  console.error("Fan vote: Firebase failed to initialize, falling back to local-only voting.", error);
}

// docId -> { votes: {voterId: {playerId, name}} } - last snapshot seen, used
// so re-renders (e.g. awards.js re-rendering on a filter change) can paint
// instantly instead of flashing back to zero while a new listener connects.
const pollCache = new Map();
// docId -> Set of DOM list elements currently subscribed via onSnapshot.
const activeSubscriptions = new Map();

function getVoterId() {
  try {
    let id = localStorage.getItem(VOTER_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `voter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(VOTER_ID_KEY, id);
    }
    return id;
  } catch {
    return `voter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getVoterName() {
  try {
    return (localStorage.getItem(VOTER_NAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

function setVoterName(name) {
  const trimmed = String(name || "").trim().slice(0, 40);
  try {
    if (trimmed) localStorage.setItem(VOTER_NAME_KEY, trimmed);
  } catch {
    // Storage can fail (private browsing, quota, disabled); the name just
    // won't be remembered next visit, but voting still works this session.
  }
  return trimmed;
}

function sanitizeDocId(text) {
  return String(text).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function docIdFor(key, categoryKey) {
  return sanitizeDocId(`${key}__${categoryKey}`);
}

function readLocalFallback() {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalFallback(data) {
  try {
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(data));
  } catch {
    // Storage can fail (private browsing, quota, disabled); voting just
    // won't persist for this visitor, but the page keeps working.
  }
}

// A vote entry can be a plain playerId string (older documents) or
// { playerId, name } (current format). These two helpers normalize that.
function playerIdFromVoteEntry(entry) {
  if (!entry) return "";
  return typeof entry === "string" ? entry : entry.playerId || "";
}

function nameFromVoteEntry(entry) {
  if (!entry || typeof entry === "string") return "";
  return entry.name || "";
}

function tallyFromVotes(votes = {}) {
  const tallies = {};
  Object.values(votes).forEach((entry) => {
    const playerId = playerIdFromVoteEntry(entry);
    if (!playerId) return;
    tallies[playerId] = (tallies[playerId] || 0) + 1;
  });
  return tallies;
}

export function pollKey(awardWatch = {}) {
  return `${awardWatch.season || "season"}-${awardWatch.week || "week"}`;
}

// Pulls the leading number out of a stat string like "16 goals" or "9.5 pts".
function statValue(leader) {
  const match = /(\d+(?:\.\d+)?)/.exec(String(leader?.stat || ""));
  return match ? Number(match[1]) : null;
}

// "Close" enough that both teammates deserve a ballot spot: within 2 of each
// other, or within roughly 15% of the larger value (covers both low- and
// high-count stat lines).
function isCloseRace(a, b) {
  if (a == null || b == null) return false;
  const diff = Math.abs(a - b);
  return diff <= 2 || diff <= Math.max(a, b) * 0.15;
}

// Normally only the best-ranked player from each team makes the ballot, so
// one team can't crowd out the rest of the league. Exception: if a team's
// top two players are in a close race with each other, both get a spot.
function limitToOnePerTeam(leaders) {
  const result = [];
  const countByTeam = new Map();
  const topStatByTeam = new Map();

  leaders.forEach((leader) => {
    const teamKey = leader.teamName || leader.teamId || leader.name;
    const already = countByTeam.get(teamKey) || 0;
    if (already === 0) {
      result.push(leader);
      countByTeam.set(teamKey, 1);
      topStatByTeam.set(teamKey, statValue(leader));
      return;
    }
    if (already === 1 && isCloseRace(topStatByTeam.get(teamKey), statValue(leader))) {
      result.push(leader);
      countByTeam.set(teamKey, 2);
    }
    // A team's 3rd+ leader never makes the ballot, close race or not.
  });

  return result;
}

export function getCandidates(awardWatch = {}, categoryKey) {
  const label = CATEGORY_META[categoryKey]?.label;
  const category = (awardWatch.categories || []).find((item) => item.label === label);
  const ranked = (category?.leaders || []).filter((leader) => leader.playerId).sort((a, b) => (a.rank || 99) - (b.rank || 99));
  return limitToOnePerTeam(ranked).slice(0, 5);
}

export async function castVote(key, categoryKey, playerId) {
  const voterId = getVoterId();
  const name = getVoterName();
  if (!name) return false; // Name is required before a vote is accepted.

  const docId = docIdFor(key, categoryKey);
  const entry = { playerId, name };

  if (firebaseReady && db) {
    try {
      const ref = doc(db, "fanVotePolls", docId);
      await setDoc(ref, { votes: { [voterId]: entry } }, { merge: true });
      return true;
    } catch (error) {
      console.error("Fan vote: could not write to Firestore, falling back to local vote.", error);
    }
  }

  // Local fallback (Firebase unavailable).
  const all = readLocalFallback();
  if (!all[docId]) all[docId] = { votes: {} };
  all[docId].votes[voterId] = entry;
  writeLocalFallback(all);
  pollCache.set(docId, all[docId]);
  return true;
}

function renderCandidateRows(awardWatch, categoryKey, interactive, votesState) {
  const candidates = getCandidates(awardWatch, categoryKey);
  if (!candidates.length) return `<p class="fan-vote-empty">Candidates for this week's watch list aren't published yet.</p>`;

  const voterId = getVoterId();
  const votes = votesState?.votes || {};
  const tallies = tallyFromVotes(votes);
  const myVote = playerIdFromVoteEntry(votes[voterId]);
  const total = Object.values(tallies).reduce((sum, count) => sum + count, 0);
  const leaderCount = Math.max(0, ...candidates.map((candidate) => tallies[candidate.playerId] || 0));

  return candidates
    .map((candidate) => {
      const count = tallies[candidate.playerId] || 0;
      const pct = total ? Math.round((count / total) * 100) : 0;
      const isMine = candidate.playerId === myVote;
      const isLeading = total > 0 && count === leaderCount && count > 0;
      const tag = interactive ? "button" : "a";
      const tagAttrs = interactive
        ? `type="button" data-fan-vote-player="${escapeHTML(candidate.playerId)}"`
        : `href="./player.html?id=${escapeHTML(candidate.playerId)}"`;
      return `
        <${tag} class="fan-vote-row${isMine ? " voted" : ""}${isLeading ? " leading" : ""}" ${tagAttrs}>
          <span class="fan-vote-rank">${isLeading ? "👑" : `#${candidate.rank}`}</span>
          <span class="fan-vote-name">
            <strong>${escapeHTML(candidate.name)}</strong>
            <small>${escapeHTML(candidate.teamName || "")}${candidate.stat ? ` &middot; ${escapeHTML(candidate.stat)}` : ""}</small>
          </span>
          <span class="fan-vote-bar"><span style="width:${pct}%"></span></span>
          <span class="fan-vote-count">${count} vote${count === 1 ? "" : "s"}${isMine ? ` <small>Your pick</small>` : ""}</span>
        </${tag}>
      `;
    })
    .join("");
}

function renderNameBar(editing = false) {
  const name = getVoterName();
  if (name && !editing) {
    return `
      <div class="fan-vote-name-bar" data-fan-vote-name-bar>
        <span class="fan-vote-name-current">Voting as <strong>${escapeHTML(name)}</strong></span>
        <button type="button" class="text-link" data-fan-vote-change-name>Change</button>
      </div>
    `;
  }
  return `
    <div class="fan-vote-name-bar needs-name" data-fan-vote-name-bar>
      <label class="control fan-vote-name-control">
        <span>Enter your name to vote</span>
        <input type="text" maxlength="40" placeholder="Your name" value="${escapeHTML(name)}" data-fan-vote-name-input>
      </label>
      <button type="button" class="button" data-fan-vote-save-name>Save name</button>
    </div>
  `;
}

export function renderFanVoteCard(awardWatch = {}, categoryKey, { interactive = true } = {}) {
  const meta = CATEGORY_META[categoryKey];
  if (!meta) return "";
  const key = pollKey(awardWatch);
  const docId = docIdFor(key, categoryKey);
  const cached = pollCache.get(docId) || readLocalFallback()[docId];
  const rowsMarkup = renderCandidateRows(awardWatch, categoryKey, interactive, cached);

  return `
    <article class="card fan-vote-card${interactive ? "" : " compact"}">
      <div class="fan-vote-head">
        <span class="fan-vote-icon" aria-hidden="true">${meta.icon}</span>
        <div>
          <span class="eyebrow">Fan Vote${awardWatch.week ? ` &middot; ${escapeHTML(awardWatch.week)}` : ""}</span>
          <h3>${escapeHTML(meta.title)}</h3>
          <p>${interactive ? "Enter your name, then tap a candidate to vote. Change your vote anytime this week." : meta.blurb}</p>
        </div>
      </div>
      ${interactive ? renderNameBar() : ""}
      <div class="fan-vote-list" data-fan-vote-list data-fan-vote-key="${escapeHTML(key)}" data-fan-vote-category="${categoryKey}" data-fan-vote-interactive="${interactive}">
        ${rowsMarkup}
      </div>
      <small class="fan-vote-note">${firebaseReady ? "Live vote count, shared across every visitor." : "Votes counted on this device this week."} ${interactive ? "" : `<a href="./voting.html">Cast your vote &rarr;</a>`}</small>
    </article>
  `;
}

function subscribeList(list, awardWatch, categoryKey) {
  const key = list.dataset.fanVoteKey;
  const docId = docIdFor(key, categoryKey);
  const interactive = list.dataset.fanVoteInteractive === "true";

  if (!firebaseReady || !db) return;

  const ref = doc(db, "fanVotePolls", docId);
  const unsubscribe = onSnapshot(
    ref,
    (snapshot) => {
      if (!list.isConnected) {
        unsubscribe();
        const set = activeSubscriptions.get(docId);
        set?.delete(list);
        return;
      }
      const data = snapshot.exists() ? snapshot.data() : { votes: {} };
      pollCache.set(docId, data);
      list.innerHTML = renderCandidateRows(awardWatch, categoryKey, interactive, data);
    },
    (error) => {
      console.error("Fan vote: live listener error, showing local fallback tallies.", error);
    }
  );

  if (!activeSubscriptions.has(docId)) activeSubscriptions.set(docId, new Set());
  activeSubscriptions.get(docId).add(list);
}

function flashNeedsName(nameBar) {
  const input = nameBar.querySelector("[data-fan-vote-name-input]");
  nameBar.classList.add("needs-name", "shake");
  input?.focus();
  window.setTimeout(() => nameBar.classList.remove("shake"), 400);
}

function hydrateNameBar(card, awardWatch, categoryKey) {
  const nameBar = card.querySelector("[data-fan-vote-name-bar]");
  if (!nameBar) return;

  const saveButton = nameBar.querySelector("[data-fan-vote-save-name]");
  const input = nameBar.querySelector("[data-fan-vote-name-input]");
  const changeButton = nameBar.querySelector("[data-fan-vote-change-name]");

  const save = () => {
    const value = input?.value || "";
    if (!value.trim()) {
      flashNeedsName(nameBar);
      return;
    }
    setVoterName(value);
    nameBar.outerHTML = renderNameBar();
    hydrateNameBar(card, awardWatch, categoryKey);
  };

  saveButton?.addEventListener("click", save);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }
  });

  changeButton?.addEventListener("click", () => {
    nameBar.outerHTML = renderNameBar(true);
    hydrateNameBar(card, awardWatch, categoryKey);
    card.querySelector("[data-fan-vote-name-input]")?.focus();
  });
}

export function hydrateFanVote(root, awardWatch = {}) {
  root.querySelectorAll("[data-fan-vote-list]").forEach((list) => {
    const categoryKey = list.dataset.fanVoteCategory;

    subscribeList(list, awardWatch, categoryKey);

    if (list.dataset.fanVoteInteractive !== "true") return;

    const card = list.closest(".fan-vote-card");
    if (card) hydrateNameBar(card, awardWatch, categoryKey);

    if (list.dataset.fanVoteHydrated === "true") return;
    list.dataset.fanVoteHydrated = "true";

    list.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-fan-vote-player]");
      if (!button || !list.contains(button)) return;

      if (!getVoterName()) {
        const nameBar = card?.querySelector("[data-fan-vote-name-bar]");
        if (nameBar) flashNeedsName(nameBar);
        return;
      }

      button.disabled = true;
      await castVote(list.dataset.fanVoteKey, categoryKey, button.dataset.fanVotePlayer);
      button.disabled = false;
      // If Firestore is live, the onSnapshot listener above repaints this
      // list automatically. If we're on the local fallback, repaint now.
      if (!firebaseReady) {
        const docId = docIdFor(list.dataset.fanVoteKey, categoryKey);
        list.innerHTML = renderCandidateRows(awardWatch, categoryKey, true, pollCache.get(docId));
      }
    });
  });
}
