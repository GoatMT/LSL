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
// change their vote later; there is no login. Firestore document layout:
//   fanVotePolls/{pollKey}__{categoryKey}
//     { votes: { [voterId]: playerId, ... } }
// Tallies are derived client-side by counting the values in that map, so a
// vote change is a single-field write and there is nothing to keep in sync.
//
// If Firestore can't be reached (offline, blocked, misconfigured project),
// voting falls back to a local-only tally stored in localStorage so the
// page still works, just without the shared count.

const VOTER_ID_KEY = "lsl-fan-vote-voter-id";
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
  mvp: { label: "MVP Watch", title: "Fan MVP", icon: "⭐", blurb: "Vote for this week's MVP." },
  goldenBoot: { label: "Golden Boot Watch", title: "Fan Golden Boot", icon: "⚽", blurb: "Vote for this week's Golden Boot leader." },
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

// docId -> { votes: {voterId: playerId} } - last snapshot seen, used so
// re-renders (e.g. awards.js re-rendering on a filter change) can paint
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

function tallyFromVotes(votes = {}) {
  const tallies = {};
  Object.values(votes).forEach((playerId) => {
    if (!playerId) return;
    tallies[playerId] = (tallies[playerId] || 0) + 1;
  });
  return tallies;
}

export function pollKey(awardWatch = {}) {
  return `${awardWatch.season || "season"}-${awardWatch.week || "week"}`;
}

export function getCandidates(awardWatch = {}, categoryKey) {
  const label = CATEGORY_META[categoryKey]?.label;
  const category = (awardWatch.categories || []).find((item) => item.label === label);
  return (category?.leaders || []).filter((leader) => leader.playerId).slice(0, 5);
}

export async function castVote(key, categoryKey, playerId) {
  const voterId = getVoterId();
  const docId = docIdFor(key, categoryKey);

  if (firebaseReady && db) {
    try {
      const ref = doc(db, "fanVotePolls", docId);
      await setDoc(ref, { votes: { [voterId]: playerId } }, { merge: true });
      return;
    } catch (error) {
      console.error("Fan vote: could not write to Firestore, falling back to local vote.", error);
    }
  }

  // Local fallback (Firebase unavailable).
  const all = readLocalFallback();
  if (!all[docId]) all[docId] = { votes: {} };
  all[docId].votes[voterId] = playerId;
  writeLocalFallback(all);
  pollCache.set(docId, all[docId]);
}

function renderCandidateRows(awardWatch, categoryKey, interactive, votesState) {
  const key = pollKey(awardWatch);
  const candidates = getCandidates(awardWatch, categoryKey);
  if (!candidates.length) return `<p class="fan-vote-empty">Candidates for this week's watch list aren't published yet.</p>`;

  const voterId = getVoterId();
  const votes = votesState?.votes || {};
  const tallies = tallyFromVotes(votes);
  const myVote = votes[voterId] || "";
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
          <p>${interactive ? "Tap a name to vote. Change your vote anytime this week." : meta.blurb}</p>
        </div>
      </div>
      <div class="fan-vote-list" data-fan-vote-list data-fan-vote-key="${escapeHTML(key)}" data-fan-vote-category="${categoryKey}" data-fan-vote-interactive="${interactive}">
        ${rowsMarkup}
      </div>
      <small class="fan-vote-note">${firebaseReady ? "Live vote count, shared across every visitor." : "Votes counted on this device this week."} ${interactive ? "" : `<a href="./awards.html">Cast your vote &rarr;</a>`}</small>
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

export function hydrateFanVote(root, awardWatch = {}) {
  root.querySelectorAll("[data-fan-vote-list]").forEach((list) => {
    const categoryKey = list.dataset.fanVoteCategory;

    subscribeList(list, awardWatch, categoryKey);

    if (list.dataset.fanVoteInteractive !== "true") return;
    if (list.dataset.fanVoteHydrated === "true") return;
    list.dataset.fanVoteHydrated = "true";

    list.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-fan-vote-player]");
      if (!button || !list.contains(button)) return;
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
