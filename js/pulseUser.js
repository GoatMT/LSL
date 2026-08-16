import { setupLayout } from "./main.js";
import { fetchAllPulseAccounts, fetchAllPulsePosts } from "./pulseFirebase.js?v=1.2";
import { avatarMarkup, OFFICIAL_BASE_POSTS, normalizePost, pulseProfileHref, renderPostBody } from "./pulseShared.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js?v=1.0";

setupLayout("lsl-pulse.html");

const root = document.getElementById("page-root");
const STORAGE_KEY = "lsl-pulse-user-posts-v2";
const OLD_STORAGE_KEY = "lsl-pulse-user-posts-v1";
const OFFICIAL_INTERACTIONS_KEY = "lsl-pulse-official-interactions-v1";

const params = new URLSearchParams(window.location.search);
const profileId = params.get("id") || "";
const profileNameFromUrl = params.get("name") || "";

const TABS = [
  { id: "posted", label: "Posted", getItems: postedItems, empty: "This account hasn't posted or replied yet." },
  { id: "liked", label: "Liked", getItems: likedItems, empty: "This account hasn't liked anything yet." },
  { id: "disliked", label: "Disliked", getItems: dislikedItems, empty: "This account hasn't disliked anything yet." },
  { id: "reposted", label: "Reposted", getItems: repostedItems, empty: "This account hasn't reposted anything yet." },
];

let state = {
  tab: "posted",
  loading: true,
  allPosts: [],
  accountsByKey: new Map(),
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function readLocalUserPosts() {
  const posts = readJSON(STORAGE_KEY, null) || readJSON(OLD_STORAGE_KEY, []);
  return Array.isArray(posts) ? posts.map(normalizePost) : [];
}

function readLocalOfficialInteractions() {
  const interactions = readJSON(OFFICIAL_INTERACTIONS_KEY, {});
  return interactions && typeof interactions === "object" && !Array.isArray(interactions) ? interactions : {};
}

function buildOfficialPosts(interactions) {
  return OFFICIAL_BASE_POSTS.map((post) => {
    const saved = interactions[post.id] || {};
    return {
      ...post,
      likesBy: Array.isArray(saved.likesBy) ? saved.likesBy : [],
      dislikesBy: Array.isArray(saved.dislikesBy) ? saved.dislikesBy : [],
      repostsBy: Array.isArray(saved.repostsBy) ? saved.repostsBy : [],
      replies: Array.isArray(saved.replies) ? saved.replies : [],
    };
  });
}

// Cloud data (if Firebase is configured) is the source of truth across
// devices; local storage is only a fallback so the page still shows
// something useful when Firebase isn't configured or hasn't loaded yet.
async function loadAllPosts() {
  let userPosts = readLocalUserPosts();
  let officialInteractions = readLocalOfficialInteractions();

  const cloud = await fetchAllPulsePosts();
  if (cloud.userPosts.length) userPosts = cloud.userPosts.map(normalizePost);
  if (Object.keys(cloud.officialInteractions).length) officialInteractions = cloud.officialInteractions;

  return [...buildOfficialPosts(officialInteractions), ...userPosts];
}

function initials(name) {
  return String(name || "?").trim().slice(0, 2).toUpperCase();
}

function displayName() {
  for (const post of state.allPosts) {
    if (post.accountId === profileId) return post.author;
    const reply = (post.replies || []).find((item) => item.accountId === profileId);
    if (reply) return reply.author;
  }
  return profileNameFromUrl || profileId || "This user";
}

function postedItems() {
  const items = [];
  state.allPosts.forEach((post) => {
    if (post.accountId === profileId) items.push({ kind: "post", post });
    (post.replies || []).forEach((reply, replyIndex) => {
      if (reply.accountId === profileId) items.push({ kind: "reply", post, reply, replyIndex });
    });
  });
  return items;
}

function likedItems() {
  return state.allPosts.filter((post) => (post.likesBy || []).includes(profileId)).map((post) => ({ kind: "post", post }));
}

function dislikedItems() {
  return state.allPosts.filter((post) => (post.dislikesBy || []).includes(profileId)).map((post) => ({ kind: "post", post }));
}

function repostedItems() {
  return state.allPosts.filter((post) => (post.repostsBy || []).includes(profileId)).map((post) => ({ kind: "post", post }));
}

function renderOriginalContext(post) {
  return `
    <div class="pulse-user-original">
      <span class="eyebrow">Replying to</span>
      <strong>${escapeHTML(post.type === "league" ? "LSL Official" : post.author)}</strong>
      <p>${renderPostBody(post.body, state.accountsByKey)}</p>
    </div>
  `;
}

function renderPostMeta(post) {
  return [post.badge, post.date].filter(Boolean).join(" | ");
}

function renderActionRow(post) {
  const replyCount = (post.replies || []).length;
  return `
    <div class="pulse-post-actions">
      <span>\u2665 ${(post.likesBy || []).length}</span>
      <span>\ud83d\udc4e ${(post.dislikesBy || []).length}</span>
      <span>\ud83d\udd01 ${(post.repostsBy || []).length}</span>
      <span>${replyCount} repl${replyCount === 1 ? "y" : "ies"}</span>
    </div>
  `;
}

function renderItem(item) {
  const { kind, post } = item;

  if (kind === "reply") {
    const reply = item.reply;
    return `
      <article class="pulse-post-card${post.type !== "league" ? " pulse-post-user" : ""}">
        <span class="pulse-user-reply-kind">Reply</span>
        <div class="pulse-post-head">
          <div class="pulse-avatar">${avatarMarkup(reply.author, state.accountsByKey.get(reply.accountId)?.avatarDataUrl)}</div>
          <div>
            <strong>${escapeHTML(reply.author)}</strong>
            <p>${escapeHTML(reply.date || "")}</p>
          </div>
        </div>
        ${renderOriginalContext(post)}
        <p class="pulse-post-body">${renderPostBody(reply.body, state.accountsByKey)}</p>
      </article>
    `;
  }

  return `
    <article class="pulse-post-card${post.type !== "league" ? " pulse-post-user" : ""}">
      <div class="pulse-post-head">
        <div class="pulse-avatar">${avatarMarkup(post.type === "league" ? "LSL" : post.author, post.type === "league" ? "" : state.accountsByKey.get(post.accountId)?.avatarDataUrl)}</div>
        <div>
          <strong>${escapeHTML(post.type === "league" ? "LSL Official" : post.author)}</strong>
          <p>${escapeHTML(renderPostMeta(post))}</p>
        </div>
      </div>
      ${post.title ? `<h3>${escapeHTML(post.title)}</h3>` : ""}
      <p class="pulse-post-body">${renderPostBody(post.body, state.accountsByKey)}</p>
      ${renderActionRow(post)}
    </article>
  `;
}

function renderTabs() {
  return `
    <div class="pulse-tabs pulse-user-tabs" role="tablist" aria-label="Profile categories">
      ${TABS.map(
        (tab) => `
          <button type="button" class="${state.tab === tab.id ? "active" : ""}" data-pulse-user-tab="${tab.id}">
            ${escapeHTML(tab.label)}
          </button>
        `
      ).join("")}
    </div>
  `;
}

function render() {
  if (!profileId) {
    root.innerHTML = `<section class="section-panel">${statusMessage("empty", "No LSL Pulse profile was specified.")}</section>`;
    return;
  }

  if (state.loading) {
    root.innerHTML = statusMessage("loading", "Loading profile...");
    return;
  }

  const name = displayName();
  const activeTab = TABS.find((tab) => tab.id === state.tab) || TABS[0];
  const items = activeTab.getItems();

  root.innerHTML = `
    <section class="section-panel pulse-hero-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">LSL Pulse Profile</span>
          <h1>${escapeHTML(name)}</h1>
          <p>Everything this account has posted (including replies), liked, disliked, and reposted on LSL Pulse.</p>
        </div>
        <div class="pulse-hero-badges">
          <a class="pill" href="./lsl-pulse.html">&larr; Back to Pulse</a>
        </div>
      </div>
      ${renderTabs()}
    </section>

    <section class="section-panel pulse-feed-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">${escapeHTML(activeTab.label)}</span>
          <h2>${items.length} ${items.length === 1 ? "item" : "items"}</h2>
        </div>
      </div>
      <div class="pulse-feed">
        ${items.length ? items.map(renderItem).join("") : statusMessage("empty", activeTab.empty)}
      </div>
    </section>
  `;

  root.querySelectorAll("[data-pulse-user-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.pulseUserTab;
      render();
    });
  });
}

async function init() {
  setDocumentTitle(profileNameFromUrl ? `${profileNameFromUrl} | LSL Pulse` : "LSL Pulse Profile");
  render();
  const [allPosts, accountList] = await Promise.all([
    profileId ? loadAllPosts() : Promise.resolve([]),
    fetchAllPulseAccounts(),
  ]);
  state.allPosts = allPosts;
  state.accountsByKey = new Map(accountList.map((acc) => [acc.username.trim().toLowerCase().replace(/\s+/g, "-"), acc]));
  state.loading = false;
  setDocumentTitle(`${displayName()} | LSL Pulse`);
  render();
}

init();
