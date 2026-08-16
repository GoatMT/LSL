import { setupLayout } from "./main.js";
import { createPulseCloudStore, fetchAllPulseAccounts } from "./pulseFirebase.js?v=1.2";
import { avatarMarkup, compressImageToDataUrl, compressImageToSquareDataUrl, OFFICIAL_BASE_POSTS, normalizePost, pulseProfileHref, renderPostBody } from "./pulseShared.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js?v=1.0";

setupLayout("lsl-pulse.html");
setDocumentTitle("LSL Pulse");

const root = document.getElementById("page-root");
const STORAGE_KEY = "lsl-pulse-user-posts-v2";
const OLD_STORAGE_KEY = "lsl-pulse-user-posts-v1";
const ACCOUNTS_KEY = "lsl-pulse-accounts-v1";
const ACTIVE_ACCOUNT_KEY = "lsl-pulse-active-account-v1";
const OFFICIAL_INTERACTIONS_KEY = "lsl-pulse-official-interactions-v1";

let state = {
  tab: "league",
  account: null,
  accountPanelOpen: false,
  accountMessage: "",
  avatarMessage: "",
  syncMessage: "",
  posts: [],
  officialPosts: [],
  officialInteractions: {},
};

let cloudStore = null;
let accounts = []; // [{id, username}] - every known Pulse account, for @mention autocomplete and rendering.
let accountsByKey = new Map(); // usernameKey -> {id, username}
// Holds the compressed photo data URL from the moment it's chosen until the
// Post button is clicked (or removed) - kept outside state so selecting a
// photo never needs a full render() that would blow away in-progress typing.
let pendingComposerImage = "";
// Set to a post's id for exactly one render pass right after that post is
// created, so it gets a pop-in animation instead of every post replaying
// the animation on every unrelated re-render.
let justPostedId = "";
// {postId, kind} for exactly one render pass, so only the button that was
// just clicked gets its pop/shake/spin animation - not every already-liked
// button in the feed on every unrelated re-render.
let pendingAction = null;

function nowLabel() {
  return new Date().toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function postId() {
  return `pulse-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function usernameKey(username) {
  return username.trim().toLowerCase().replace(/\s+/g, "-");
}

function accountId(username) {
  return usernameKey(username);
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readStoredPosts() {
  const posts = readJSON(STORAGE_KEY, null) || readJSON(OLD_STORAGE_KEY, []);
  return Array.isArray(posts) ? posts.map(normalizePost) : [];
}

function savePosts() {
  writeJSON(STORAGE_KEY, state.posts);
}

function readAccounts() {
  const accounts = readJSON(ACCOUNTS_KEY, {});
  return accounts && typeof accounts === "object" && !Array.isArray(accounts) ? accounts : {};
}

function saveAccount(account) {
  const accounts = readAccounts();
  accounts[account.id] = account;
  writeJSON(ACCOUNTS_KEY, accounts);
  writeJSON(ACTIVE_ACCOUNT_KEY, account);
  state.account = account;
}

function readActiveAccount() {
  const active = readJSON(ACTIVE_ACCOUNT_KEY, null);
  if (!active?.id) return null;
  const accounts = readAccounts();
  return accounts[active.id] || active;
}

function logout() {
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  state.account = null;
  state.accountMessage = "Signed out.";
}

function readOfficialInteractions() {
  const interactions = readJSON(OFFICIAL_INTERACTIONS_KEY, {});
  return interactions && typeof interactions === "object" && !Array.isArray(interactions) ? interactions : {};
}

function saveOfficialInteractions() {
  writeJSON(OFFICIAL_INTERACTIONS_KEY, state.officialInteractions);
}

function interactionFor(postIdValue) {
  if (!state.officialInteractions[postIdValue]) {
    state.officialInteractions[postIdValue] = { likesBy: [], dislikesBy: [], repostsBy: [], replies: [] };
  }
  return state.officialInteractions[postIdValue];
}

function officialFeedItems() {
  return OFFICIAL_BASE_POSTS.map((post) => {
    const saved = interactionFor(post.id);
    return {
      ...post,
      likesBy: Array.isArray(saved.likesBy) ? saved.likesBy : [],
      dislikesBy: Array.isArray(saved.dislikesBy) ? saved.dislikesBy : [],
      repostsBy: Array.isArray(saved.repostsBy) ? saved.repostsBy : [],
      replies: Array.isArray(saved.replies) ? saved.replies : [],
    };
  });
}

function activePosts() {
  return state.tab === "league" ? state.officialPosts : state.posts;
}

function findPost(id) {
  return activePosts().find((post) => post.id === id);
}

function persistPost(post) {
  if (post.type === "league") {
    state.officialInteractions[post.id] = {
      likesBy: post.likesBy || [],
      dislikesBy: post.dislikesBy || [],
      repostsBy: post.repostsBy || [],
      replies: post.replies || [],
    };
    saveOfficialInteractions();
    return;
  }
  savePosts();
}

async function likePost(post, account) {
  pendingAction = { postId: post.id, kind: "like" };
  post.likesBy = Array.isArray(post.likesBy) ? post.likesBy : [];
  post.dislikesBy = Array.isArray(post.dislikesBy) ? post.dislikesBy : [];
  const liked = post.likesBy.includes(account.id);

  if (cloudStore) {
    if (post.type === "league") {
      await (liked ? cloudStore.unlikeOfficialPost(post.id, account.id) : cloudStore.likeOfficialPost(post.id, account.id));
    } else {
      await (liked ? cloudStore.unlikeUserPost(post.id, account.id) : cloudStore.likeUserPost(post.id, account.id));
    }
    return;
  }

  post.likesBy = liked ? post.likesBy.filter((id) => id !== account.id) : [...post.likesBy, account.id];
  if (!liked) post.dislikesBy = post.dislikesBy.filter((id) => id !== account.id);
  persistPost(post);
}

async function dislikePost(post, account) {
  pendingAction = { postId: post.id, kind: "dislike" };
  post.likesBy = Array.isArray(post.likesBy) ? post.likesBy : [];
  post.dislikesBy = Array.isArray(post.dislikesBy) ? post.dislikesBy : [];
  const disliked = post.dislikesBy.includes(account.id);

  if (cloudStore) {
    if (post.type === "league") {
      await (disliked ? cloudStore.undislikeOfficialPost(post.id, account.id) : cloudStore.dislikeOfficialPost(post.id, account.id));
    } else {
      await (disliked ? cloudStore.undislikeUserPost(post.id, account.id) : cloudStore.dislikeUserPost(post.id, account.id));
    }
    return;
  }

  post.dislikesBy = disliked ? post.dislikesBy.filter((id) => id !== account.id) : [...post.dislikesBy, account.id];
  if (!disliked) post.likesBy = post.likesBy.filter((id) => id !== account.id);
  persistPost(post);
}

async function repostPost(post, account) {
  pendingAction = { postId: post.id, kind: "repost" };
  post.repostsBy = Array.isArray(post.repostsBy) ? post.repostsBy : [];
  const reposted = post.repostsBy.includes(account.id);

  if (cloudStore) {
    if (post.type === "league") {
      await (reposted ? cloudStore.unrepostOfficialPost(post.id, account.id) : cloudStore.repostOfficialPost(post.id, account.id));
    } else {
      await (reposted ? cloudStore.unrepostUserPost(post.id, account.id) : cloudStore.repostUserPost(post.id, account.id));
    }
    return;
  }

  post.repostsBy = reposted ? post.repostsBy.filter((id) => id !== account.id) : [...post.repostsBy, account.id];
  persistPost(post);
}

async function replyToPost(post, reply) {
  if (cloudStore) {
    if (post.type === "league") {
      await cloudStore.replyOfficialPost(post.id, reply);
    } else {
      await cloudStore.replyUserPost(post.id, reply);
    }
    return;
  }

  post.replies = post.replies || [];
  post.replies.push(reply);
  persistPost(post);
}

async function deletePost(post) {
  if (post.type !== "user") return;
  if (cloudStore) {
    await cloudStore.deleteUserPost(post.id);
    return;
  }
  state.posts = state.posts.filter((item) => item.id !== post.id);
  savePosts();
}

async function deleteReply(post, replyIndex) {
  const reply = (post.replies || [])[replyIndex];
  if (!reply) return;

  if (cloudStore) {
    if (post.type === "league") {
      await cloudStore.deleteOfficialReply(post.id, reply);
    } else {
      await cloudStore.deleteUserReply(post.id, reply);
    }
    return;
  }

  post.replies = (post.replies || []).filter((_, index) => index !== replyIndex);
  persistPost(post);
}

function rebuildAccountsByKey() {
  accountsByKey = new Map(accounts.map((acc) => [usernameKey(acc.username), acc]));
}

async function loadAccountDirectory() {
  if (cloudStore) {
    accounts = await fetchAllPulseAccounts();
  } else {
    accounts = Object.values(readAccounts()).map((acc) => ({ id: acc.id, username: acc.username }));
  }
  rebuildAccountsByKey();
}

function rememberAccountLocally(account) {
  if (!accounts.some((acc) => acc.id === account.id)) {
    accounts = [...accounts, { id: account.id, username: account.username }];
    rebuildAccountsByKey();
  }
}

function requireAccount() {
  if (state.account?.id) return state.account;
  state.accountPanelOpen = true;
  state.accountMessage = "Log in with a username and 4-digit PIN first.";
  render();
  return null;
}

function renderTabs() {
  return `
    <div class="pulse-tabs" role="tablist" aria-label="LSL Pulse feed type">
      <button type="button" class="${state.tab === "league" ? "active" : ""}" data-pulse-tab="league">League News</button>
      <button type="button" class="${state.tab === "users" ? "active" : ""}" data-pulse-tab="users">User Pulse</button>
    </div>
  `;
}

function renderHero() {
  return `
    <section class="section-panel pulse-hero-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">LSL Pulse</span>
          <h1>LSL Pulse</h1>
          <p>Official league posts and user posts in one clean feed. Log in with a username and PIN to like, dislike, repost, or reply.</p>
        </div>
        <div class="pulse-hero-badges">
          <span class="pill green">${state.tab === "league" ? "Official Feed" : "Community Feed"}</span>
          ${state.syncMessage ? `<span class="pill">${escapeHTML(state.syncMessage)}</span>` : ""}
          ${state.account?.id ? `<a class="pill" href="${escapeHTML(pulseProfileHref(state.account.id, state.account.username))}">My Profile</a>` : ""}
        </div>
      </div>
      ${renderTabs()}
    </section>
  `;
}

function renderAccountCard() {
  const account = state.account;
  return `
    <section class="section-panel pulse-account-panel${state.accountPanelOpen || !account ? " open" : ""}">
      <div class="pulse-account-top">
        <button type="button" class="pulse-account-button" data-pulse-account-toggle aria-label="Open account panel">
          <span>${avatarMarkup(account?.username, account?.avatarDataUrl)}</span>
        </button>
        <div>
          <span class="eyebrow">Account</span>
          <h2>${account ? escapeHTML(account.username) : "Log In To Interact"}</h2>
          <p>${account ? "You can like, dislike, repost, or reply as this account." : "Use a username and 4-digit PIN before liking or replying."}</p>
        </div>
        ${account ? `<button type="button" class="button secondary small" data-pulse-logout>Log Out</button>` : ""}
      </div>
      ${
        account
          ? `<div class="pulse-avatar-change-row">
              <label class="pulse-attach-button" title="Change profile photo">
                📷 Change Photo
                <input type="file" accept="image/*" data-pulse-avatar-input hidden>
              </label>
              <small data-pulse-avatar-message>${escapeHTML(state.avatarMessage || "Any photo works - it's automatically cropped and resized to fit.")}</small>
            </div>`
          : ""
      }
      ${
        state.accountPanelOpen || !account
          ? `<form class="pulse-account-form" data-pulse-account-form>
              <input data-pulse-username type="text" maxlength="28" autocomplete="username" placeholder="Username" value="${escapeHTML(account?.username || "")}">
              <input data-pulse-pin type="password" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" autocomplete="current-password" placeholder="4-digit PIN">
              <button type="submit" class="button primary">Log In</button>
              <small>${escapeHTML(state.accountMessage || (cloudStore ? "Use this same username and PIN on another device." : "Local mode: this account is saved on this device until Firebase is configured."))}</small>
            </form>`
          : ""
      }
    </section>
  `;
}

function renderComposer() {
  if (state.tab === "league") {
    return "";
  }

  return `
    <section class="section-panel pulse-compose-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">User Pulse</span>
          <h2>Create A Post</h2>
          <p>Share a thought, prediction, shoutout, or match reaction. Type @ to mention another Pulse user, or attach a photo.</p>
        </div>
      </div>
      <div class="pulse-composer">
        <div class="pulse-mention-wrap">
          <textarea data-pulse-post-text maxlength="300" placeholder="What's happening in LSL? Use @ to mention someone"></textarea>
          <div class="pulse-mention-menu" data-pulse-mention-menu="composer" hidden></div>
        </div>
        <div class="pulse-image-preview" data-pulse-image-preview hidden>
          <img data-pulse-image-preview-img alt="Attached photo preview">
          <button type="button" class="pulse-image-remove" data-pulse-image-remove aria-label="Remove photo">✕</button>
        </div>
        <div class="pulse-composer-actions">
          <label class="pulse-attach-button" title="Attach a photo">
            📷
            <input type="file" accept="image/*" data-pulse-image-input hidden>
          </label>
          <small>${escapeHTML(cloudStore ? "Posts sync between devices." : "Posts save on this device.")}</small>
          <button type="button" class="button primary" data-pulse-post>Post</button>
        </div>
      </div>
    </section>
  `;
}

function renderReplyForm(post) {
  return `
    <form class="pulse-reply-form pulse-mention-wrap" data-pulse-reply-form="${escapeHTML(post.id)}">
      <input type="text" maxlength="180" placeholder="${state.account ? "Write a reply, @ to mention someone" : "Log in to reply"}">
      <button type="submit" class="button secondary small">Send</button>
      <div class="pulse-mention-menu" data-pulse-mention-menu="reply-${escapeHTML(post.id)}" hidden></div>
    </form>
  `;
}

function authorLink(post) {
  const name = post.type === "league" ? "LSL Official" : post.author;
  if (post.type !== "league" && post.accountId) {
    return `<a class="pulse-author-link" href="${escapeHTML(pulseProfileHref(post.accountId, post.author))}">${escapeHTML(name)}</a>`;
  }
  return escapeHTML(name);
}

function repostIconSvg() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17 2l4 4-4 4"></path>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
      <path d="M7 22l-4-4 4-4"></path>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
    </svg>
  `;
}

// ---------- @mention autocomplete ----------

function accountSuggestions(query) {
  const normalized = query.trim().toLowerCase();
  const pool = normalized ? accounts.filter((acc) => acc.username.toLowerCase().includes(normalized)) : accounts;
  return pool
    .sort((a, b) => a.username.toLowerCase().indexOf(normalized) - b.username.toLowerCase().indexOf(normalized))
    .slice(0, 6);
}

// Finds an in-progress "@partialname" ending exactly at the caret, if any.
// The "@" must start a word (be at the very start of the text, or right
// after whitespace) so an email-looking "a@b" never triggers it, and the
// fragment after "@" cannot contain whitespace (that means the mention was
// already finished and something else is being typed now).
function mentionQueryAt(value, caret) {
  const upToCaret = value.slice(0, caret);
  const atIndex = upToCaret.lastIndexOf("@");
  if (atIndex === -1) return null;
  const before = upToCaret[atIndex - 1];
  if (atIndex > 0 && before && !/\s/.test(before)) return null;
  const fragment = upToCaret.slice(atIndex + 1);
  if (/\s/.test(fragment)) return null;
  return { start: atIndex, query: fragment };
}

function renderMentionMenu(menuEl, suggestions, onPick) {
  if (!suggestions.length) {
    menuEl.hidden = true;
    menuEl.innerHTML = "";
    return;
  }
  menuEl.hidden = false;
  menuEl.innerHTML = suggestions
    .map(
      (acc) => `
        <button type="button" class="pulse-mention-option" data-mention-username="${escapeHTML(acc.username)}">
          <span class="pulse-mention-avatar">${escapeHTML(acc.username.slice(0, 2).toUpperCase())}</span>
          <span>${escapeHTML(acc.username)}</span>
        </button>
      `
    )
    .join("");
  menuEl.querySelectorAll("[data-mention-username]").forEach((button) => {
    // mousedown (not click) so it fires before the field's blur event closes the menu first.
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      onPick(button.dataset.mentionUsername);
    });
  });
}

function attachMentionAutocomplete(fieldEl, menuEl) {
  function update() {
    const caret = fieldEl.selectionStart ?? fieldEl.value.length;
    const active = mentionQueryAt(fieldEl.value, caret);
    if (!active) {
      menuEl.hidden = true;
      menuEl.innerHTML = "";
      return;
    }
    renderMentionMenu(menuEl, accountSuggestions(active.query), (username) => {
      const before = fieldEl.value.slice(0, active.start);
      const after = fieldEl.value.slice(caret);
      const inserted = `@${username} `;
      fieldEl.value = `${before}${inserted}${after}`;
      const newCaret = before.length + inserted.length;
      fieldEl.focus();
      fieldEl.setSelectionRange(newCaret, newCaret);
      menuEl.hidden = true;
      menuEl.innerHTML = "";
    });
  }

  fieldEl.addEventListener("input", update);
  fieldEl.addEventListener("click", update);
  fieldEl.addEventListener("keyup", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) update();
  });
  fieldEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menuEl.hidden = true;
      menuEl.innerHTML = "";
    }
  });
  fieldEl.addEventListener("blur", () => {
    // Delay so a mousedown on a suggestion registers before the menu disappears.
    setTimeout(() => {
      menuEl.hidden = true;
      menuEl.innerHTML = "";
    }, 150);
  });
}

function renderPost(post) {
  const replies = post.replies || [];
  const likesBy = Array.isArray(post.likesBy) ? post.likesBy : [];
  const dislikesBy = Array.isArray(post.dislikesBy) ? post.dislikesBy : [];
  const repostsBy = Array.isArray(post.repostsBy) ? post.repostsBy : [];
  const liked = state.account?.id ? likesBy.includes(state.account.id) : false;
  const disliked = state.account?.id ? dislikesBy.includes(state.account.id) : false;
  const reposted = state.account?.id ? repostsBy.includes(state.account.id) : false;
  const canDeletePost = post.type === "user" && state.account?.id && post.accountId === state.account.id;
  const meta = [post.badge, post.date, post.reporter].filter(Boolean).join(" | ");
  const justClicked = pendingAction?.postId === post.id ? pendingAction.kind : "";

  return `
    <article class="pulse-post-card${post.type !== "league" ? " pulse-post-user" : ""}${post.id === justPostedId ? " pulse-post-fresh" : ""}" data-pulse-post-id="${escapeHTML(post.id)}">
      <div class="pulse-post-head">
        <div class="pulse-avatar">${avatarMarkup(post.type === "league" ? "LSL" : post.author, post.type === "league" ? "" : accountsByKey.get(post.accountId)?.avatarDataUrl)}</div>
        <div>
          <strong>${authorLink(post)}</strong>
          <p>${escapeHTML(meta)}</p>
        </div>
        ${canDeletePost ? `<button type="button" class="pulse-delete-button" data-pulse-delete-post="${escapeHTML(post.id)}">Remove</button>` : ""}
      </div>
      ${post.title ? `<h3>${escapeHTML(post.title)}</h3>` : ""}
      <p class="pulse-post-body">${renderPostBody(post.body, accountsByKey)}</p>
      ${post.imageDataUrl ? `<img class="pulse-post-image" src="${escapeHTML(post.imageDataUrl)}" alt="Photo attached by ${escapeHTML(post.author)}">` : ""}
      ${post.source ? `<small class="pulse-source">${escapeHTML(post.source)}</small>` : ""}
      <div class="pulse-post-actions">
        <button type="button" class="pulse-heart-button${liked ? " liked" : ""}${justClicked === "like" ? " just-clicked" : ""}" data-pulse-like="${escapeHTML(post.id)}" aria-label="${liked ? "Unlike post" : "Like post"}">
          <span class="pulse-heart-icon">♥</span>
          <span>${likesBy.length}</span>
        </button>
        <button type="button" class="pulse-dislike-button${disliked ? " disliked" : ""}${justClicked === "dislike" ? " just-clicked" : ""}" data-pulse-dislike="${escapeHTML(post.id)}" aria-label="${disliked ? "Remove dislike" : "Dislike post"}">
          <span class="pulse-dislike-icon">👎</span>
          <span>${dislikesBy.length}</span>
        </button>
        <button type="button" class="pulse-repost-button${reposted ? " reposted" : ""}${justClicked === "repost" ? " just-clicked" : ""}" data-pulse-repost="${escapeHTML(post.id)}" aria-label="${reposted ? "Undo repost" : "Repost"}">
          <span class="pulse-repost-icon">${repostIconSvg()}</span>
          <span class="pulse-repost-label">${reposted ? "Reposted" : "Repost"}</span>
          <span>${repostsBy.length}</span>
        </button>
        <span>${replies.length} repl${replies.length === 1 ? "y" : "ies"}</span>
      </div>
      ${
        replies.length
          ? `<div class="pulse-replies">
              ${replies
                .map(
                  (reply, index) => `
                    <div class="pulse-reply">
                      <div>
                        <strong>${reply.accountId ? `<a class="pulse-author-link" href="${escapeHTML(pulseProfileHref(reply.accountId, reply.author))}">${escapeHTML(reply.author)}</a>` : escapeHTML(reply.author)}</strong>
                        <p>${renderPostBody(reply.body, accountsByKey)}</p>
                      </div>
                      <small>${escapeHTML(reply.date)}</small>
                      ${state.account?.id && reply.accountId === state.account.id ? `<button type="button" class="pulse-delete-button small" data-pulse-delete-reply="${escapeHTML(post.id)}" data-reply-index="${index}">Remove</button>` : ""}
                    </div>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
      ${renderReplyForm(post)}
    </article>
  `;
}

function renderFeed() {
  const posts = activePosts();
  return `
    <section class="section-panel pulse-feed-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">${state.tab === "league" ? "League News" : "User Pulse"}</span>
          <h2>${state.tab === "league" ? "Official Updates" : "Community Posts"}</h2>
          <p>${state.tab === "league" ? "Official posts with account-only likes, dislikes, reposts, and replies." : "Posts, likes, dislikes, reposts, and replies from this browser."}</p>
        </div>
      </div>
      <div class="pulse-feed">
        ${posts.length ? posts.map(renderPost).join("") : statusMessage("empty", state.tab === "league" ? "Official updates will appear here." : "No user posts yet. Be first.")}
      </div>
    </section>
  `;
}

function render() {
  root.innerHTML = `
    <div class="pulse-page-layout">
      <div class="pulse-main-column">
        ${renderHero()}
        ${renderAccountCard()}
        ${renderComposer()}
        ${renderFeed()}
      </div>
    </div>
  `;
  pendingAction = null;
  bindEvents();
}

function bindEvents() {
  root.querySelectorAll("[data-pulse-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.pulseTab;
      state.accountMessage = "";
      render();
    });
  });

  root.querySelectorAll("[data-pulse-account-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      state.accountPanelOpen = !state.accountPanelOpen;
      render();
    });
  });

  root.querySelector("[data-pulse-logout]")?.addEventListener("click", () => {
    logout();
    state.accountPanelOpen = true;
    render();
  });

  root.querySelector("[data-pulse-account-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const usernameInput = root.querySelector("[data-pulse-username]");
    const pinInput = root.querySelector("[data-pulse-pin]");
    const username = (usernameInput?.value || "").trim();
    const pin = (pinInput?.value || "").trim();

    if (!username) {
      usernameInput?.focus();
      state.accountMessage = "Username is required.";
      render();
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      pinInput?.focus();
      state.accountMessage = "PIN must be exactly 4 numbers.";
      render();
      return;
    }

    try {
      let account;
      if (cloudStore) {
        account = await cloudStore.login(username, pin);
      } else {
        const key = usernameKey(username);
        const id = accountId(username);
        const accounts = readAccounts();
        const existingAccount = accounts[id] || Object.values(accounts).find((item) => item.usernameKey === key);
        if (existingAccount && existingAccount.pin !== pin) {
          state.accountMessage = "That PIN does not match this username.";
          render();
          return;
        }
        account = existingAccount || { id, username, usernameKey: key, pin };
      }

      saveAccount(account);
      rememberAccountLocally(account);
      state.accountPanelOpen = false;
      state.accountMessage = "Logged in.";
      render();
    } catch (error) {
      state.accountMessage = error.message || "Could not log in.";
      render();
    }
  });

  root.querySelector("[data-pulse-post]")?.addEventListener("click", async () => {
    const account = requireAccount();
    if (!account) return;
    const textarea = root.querySelector("[data-pulse-post-text]");
    const body = (textarea?.value || "").trim();
    if (!body) {
      textarea?.focus();
      return;
    }
    const post = {
      id: postId(),
      type: "user",
      author: account.username,
      accountId: account.id,
      badge: "User Pulse",
      date: nowLabel(),
      title: "",
      body,
      imageDataUrl: pendingComposerImage,
      likesBy: [],
      dislikesBy: [],
      repostsBy: [],
      replies: [],
    };
    if (cloudStore) {
      await cloudStore.createUserPost(post);
    } else {
      state.posts.unshift(post);
      savePosts();
    }
    pendingComposerImage = "";
    justPostedId = post.id;
    // Cloud mode doesn't add the post to state.posts locally - it arrives
    // moments later via the Firestore onSnapshot listener, which calls
    // render() on its own. Clear on a timer instead of inside render()
    // itself, so the animation still plays whenever the post actually
    // shows up, not just on whichever render happens to run first.
    setTimeout(() => {
      justPostedId = "";
    }, 900);
    render();
  });

  root.querySelectorAll("[data-pulse-like]").forEach((button) => {
    button.addEventListener("click", async () => {
      const account = requireAccount();
      if (!account) return;
      const post = findPost(button.dataset.pulseLike);
      if (!post) return;
      await likePost(post, account);
      render();
    });
  });

  root.querySelectorAll("[data-pulse-dislike]").forEach((button) => {
    button.addEventListener("click", async () => {
      const account = requireAccount();
      if (!account) return;
      const post = findPost(button.dataset.pulseDislike);
      if (!post) return;
      await dislikePost(post, account);
      render();
    });
  });

  root.querySelectorAll("[data-pulse-repost]").forEach((button) => {
    button.addEventListener("click", async () => {
      const account = requireAccount();
      if (!account) return;
      const post = findPost(button.dataset.pulseRepost);
      if (!post) return;
      await repostPost(post, account);
      render();
    });
  });

  root.querySelectorAll("[data-pulse-delete-post]").forEach((button) => {
    button.addEventListener("click", async () => {
      const account = requireAccount();
      if (!account) return;
      const post = findPost(button.dataset.pulseDeletePost);
      if (!post || post.accountId !== account.id) return;
      await deletePost(post);
      render();
    });
  });

  root.querySelectorAll("[data-pulse-reply-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const account = requireAccount();
      if (!account) return;
      const input = form.querySelector("input");
      const body = (input?.value || "").trim();
      if (!body) {
        input?.focus();
        return;
      }
      const post = findPost(form.dataset.pulseReplyForm);
      if (!post) return;
      await replyToPost(post, { author: account.username, accountId: account.id, body, date: nowLabel() });
      render();
    });
  });

  root.querySelectorAll("[data-pulse-delete-reply]").forEach((button) => {
    button.addEventListener("click", async () => {
      const account = requireAccount();
      if (!account) return;
      const post = findPost(button.dataset.pulseDeleteReply);
      const replyIndex = Number(button.dataset.replyIndex);
      const reply = post?.replies?.[replyIndex];
      if (!post || !reply || reply.accountId !== account.id) return;
      await deleteReply(post, replyIndex);
      render();
    });
  });

  const composerField = root.querySelector("[data-pulse-post-text]");
  const composerMenu = root.querySelector('[data-pulse-mention-menu="composer"]');
  if (composerField && composerMenu) attachMentionAutocomplete(composerField, composerMenu);

  const imageInput = root.querySelector("[data-pulse-image-input]");
  const imagePreview = root.querySelector("[data-pulse-image-preview]");
  const imagePreviewImg = root.querySelector("[data-pulse-image-preview-img]");

  imageInput?.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    try {
      pendingComposerImage = await compressImageToDataUrl(file);
      if (imagePreviewImg) imagePreviewImg.src = pendingComposerImage;
      if (imagePreview) imagePreview.hidden = false;
    } catch (error) {
      console.error("Could not attach that photo", error);
    }
  });

  root.querySelector("[data-pulse-image-remove]")?.addEventListener("click", () => {
    pendingComposerImage = "";
    if (imageInput) imageInput.value = "";
    if (imagePreviewImg) imagePreviewImg.src = "";
    if (imagePreview) imagePreview.hidden = true;
  });

  root.querySelectorAll("[data-pulse-reply-form]").forEach((form) => {
    const input = form.querySelector("input");
    const menu = form.querySelector("[data-pulse-mention-menu]");
    if (input && menu) attachMentionAutocomplete(input, menu);
  });

  root.querySelector("[data-pulse-avatar-input]")?.addEventListener("change", async (event) => {
    const account = state.account;
    if (!account) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const messageEl = root.querySelector("[data-pulse-avatar-message]");
    try {
      if (messageEl) messageEl.textContent = "Uploading...";
      const avatarDataUrl = await compressImageToSquareDataUrl(file);

      if (cloudStore) {
        await cloudStore.updateAvatar(account.id, avatarDataUrl);
      } else {
        saveAccount({ ...account, avatarDataUrl });
      }

      state.account = { ...account, avatarDataUrl };
      accounts = accounts.map((acc) => (acc.id === account.id ? { ...acc, avatarDataUrl } : acc));
      rebuildAccountsByKey();
      state.avatarMessage = "Photo updated.";
      render();
    } catch (error) {
      state.avatarMessage = error.message || "Could not update that photo.";
      render();
    }
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading LSL Pulse...");
  state.account = readActiveAccount();
  state.posts = readStoredPosts();
  state.officialInteractions = readOfficialInteractions();
  state.officialPosts = officialFeedItems();
  cloudStore = await createPulseCloudStore({
    onStatus(message) {
      state.syncMessage = message;
      render();
    },
    onUserPosts(posts) {
      state.posts = posts;
      render();
    },
    onOfficialInteractions(interactions) {
      state.officialInteractions = interactions;
      state.officialPosts = officialFeedItems();
      render();
    },
  });
  await loadAccountDirectory();
  render();
}

init();
