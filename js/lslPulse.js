import { setupLayout } from "./main.js";
import { createPulseCloudStore } from "./pulseFirebase.js";
import { OFFICIAL_BASE_POSTS, normalizePost, pulseProfileHref } from "./pulseShared.js";
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
  syncMessage: "Local mode.",
  posts: [],
  officialPosts: [],
  officialInteractions: {},
};

let cloudStore = null;
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
          <span class="pill">${escapeHTML(state.syncMessage)}</span>
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
          <span>${account ? escapeHTML(account.username.slice(0, 2).toUpperCase()) : "👤"}</span>
        </button>
        <div>
          <span class="eyebrow">Account</span>
          <h2>${account ? escapeHTML(account.username) : "Log In To Interact"}</h2>
          <p>${account ? "You can like, dislike, repost, or reply as this account." : "Use a username and 4-digit PIN before liking or replying."}</p>
        </div>
        ${account ? `<button type="button" class="button secondary small" data-pulse-logout>Log Out</button>` : ""}
      </div>
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
    return `
      <section class="section-panel pulse-compose-panel locked">
        <div class="section-head compact-head">
          <div>
            <span class="eyebrow">Official Only</span>
            <h2>League News Is Locked</h2>
            <p>Only official LSL posts appear here. Logged-in users can like, dislike, repost, and reply, but cannot create League News posts.</p>
          </div>
          <a class="button secondary" href="./news.html">Open News</a>
        </div>
      </section>
    `;
  }

  return `
    <section class="section-panel pulse-compose-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">User Pulse</span>
          <h2>Create A Post</h2>
          <p>Share a thought, prediction, shoutout, or match reaction.</p>
        </div>
      </div>
      <div class="pulse-composer">
        <textarea data-pulse-post-text maxlength="300" placeholder="What's happening in LSL?"></textarea>
        <div class="pulse-composer-actions">
          <small>${escapeHTML(cloudStore ? "Posts sync between devices." : "Posts save on this device.")}</small>
          <button type="button" class="button primary" data-pulse-post>Post</button>
        </div>
      </div>
    </section>
  `;
}

function renderReplyForm(post) {
  return `
    <form class="pulse-reply-form" data-pulse-reply-form="${escapeHTML(post.id)}">
      <input type="text" maxlength="180" placeholder="${state.account ? "Write a reply" : "Log in to reply"}">
      <button type="submit" class="button secondary small">Send</button>
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
    <article class="pulse-post-card${post.type !== "league" ? " pulse-post-user" : ""}" data-pulse-post-id="${escapeHTML(post.id)}">
      <div class="pulse-post-head">
        <div class="pulse-avatar">${escapeHTML(post.type === "league" ? "LSL" : post.author.slice(0, 2).toUpperCase())}</div>
        <div>
          <strong>${authorLink(post)}</strong>
          <p>${escapeHTML(meta)}</p>
        </div>
        ${canDeletePost ? `<button type="button" class="pulse-delete-button" data-pulse-delete-post="${escapeHTML(post.id)}">Remove</button>` : ""}
      </div>
      ${post.title ? `<h3>${escapeHTML(post.title)}</h3>` : ""}
      <p class="pulse-post-body">${escapeHTML(post.body)}</p>
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
                        <p>${escapeHTML(reply.body)}</p>
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
  render();
}

init();
