import { loadJSON } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js?v=1.0";

setupLayout("lsl-pulse.html");
setDocumentTitle("LSL Pulse");

const root = document.getElementById("page-root");
const STORAGE_KEY = "lsl-pulse-user-posts-v1";
const NAME_KEY = "lsl-pulse-display-name";
let state = {
  tab: "league",
  name: "",
  posts: [],
  officialPosts: [],
};

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

function readStoredPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const posts = raw ? JSON.parse(raw) : [];
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

function savePosts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posts));
}

function readName() {
  return (localStorage.getItem(NAME_KEY) || "").trim();
}

function saveName(name) {
  state.name = name.trim();
  if (state.name) localStorage.setItem(NAME_KEY, state.name);
}

function officialFeedItems(news = {}) {
  return (news.items || [])
    .slice(0, 20)
    .map((item, index) => ({
      id: `league-${index}`,
      type: "league",
      author: "LSL Official",
      badge: "League News",
      date: item.date || "Date TBA",
      title: item.label || "League Update",
      body: item.message || item.title || "League update",
      source: item.source || "",
      likes: 0,
      replies: [],
    }));
}

function activePosts() {
  return state.tab === "league" ? state.officialPosts : state.posts;
}

function findUserPost(id) {
  return state.posts.find((post) => post.id === id);
}

function requireName() {
  const input = root.querySelector("[data-pulse-name]");
  const name = (input?.value || state.name || "").trim();
  if (!name) {
    input?.focus();
    return "";
  }
  saveName(name);
  return name;
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
          <p>League updates and fan posts in one clean feed. League News is official-only; User Pulse is for visitor posts, likes, and replies.</p>
        </div>
        <span class="pill green">${state.tab === "league" ? "Official Feed" : "Community Feed"}</span>
      </div>
      ${renderTabs()}
    </section>
  `;
}

function renderNameCard() {
  return `
    <section class="section-panel pulse-name-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Your Name</span>
          <h2>Post As Yourself</h2>
          <p>Add your name before posting, liking, or replying.</p>
        </div>
      </div>
      <div class="pulse-name-row">
        <input data-pulse-name type="text" maxlength="40" placeholder="Your name" value="${escapeHTML(state.name)}">
        <button type="button" class="button secondary" data-pulse-save-name>Save Name</button>
      </div>
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
            <p>Only official LSL updates added through the site files appear here. Visitors can read, but cannot post in League News.</p>
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
          <small>Posts save on this device.</small>
          <button type="button" class="button primary" data-pulse-post>Post</button>
        </div>
      </div>
    </section>
  `;
}

function renderReplyForm(post) {
  if (state.tab === "league") return "";
  return `
    <form class="pulse-reply-form" data-pulse-reply-form="${escapeHTML(post.id)}">
      <input type="text" maxlength="180" placeholder="Write a reply">
      <button type="submit" class="button secondary small">Reply</button>
    </form>
  `;
}

function renderPost(post) {
  const canInteract = state.tab === "users";
  const replies = post.replies || [];
  return `
    <article class="pulse-post-card" data-pulse-post-id="${escapeHTML(post.id)}">
      <div class="pulse-post-head">
        <div class="pulse-avatar">${escapeHTML(post.type === "league" ? "LSL" : post.author.slice(0, 2).toUpperCase())}</div>
        <div>
          <strong>${escapeHTML(post.author)}</strong>
          <p>${escapeHTML([post.badge, post.date].filter(Boolean).join(" | "))}</p>
        </div>
      </div>
      ${post.title ? `<h3>${escapeHTML(post.title)}</h3>` : ""}
      <p class="pulse-post-body">${escapeHTML(post.body)}</p>
      ${post.source ? `<small class="pulse-source">${escapeHTML(post.source)}</small>` : ""}
      <div class="pulse-post-actions">
        <button type="button" ${canInteract ? "" : "disabled"} data-pulse-like="${escapeHTML(post.id)}">
          Like <span>${Number(post.likes) || 0}</span>
        </button>
        <span>${replies.length} repl${replies.length === 1 ? "y" : "ies"}</span>
      </div>
      ${
        replies.length
          ? `<div class="pulse-replies">
              ${replies
                .map(
                  (reply) => `
                    <div class="pulse-reply">
                      <strong>${escapeHTML(reply.author)}</strong>
                      <p>${escapeHTML(reply.body)}</p>
                      <small>${escapeHTML(reply.date)}</small>
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
          <p>${state.tab === "league" ? "Read-only LSL updates." : "Posts, likes, and replies from this browser."}</p>
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
    ${renderHero()}
    ${state.tab === "users" ? renderNameCard() : ""}
    ${renderComposer()}
    ${renderFeed()}
  `;
  bindEvents();
}

function bindEvents() {
  root.querySelectorAll("[data-pulse-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.pulseTab;
      render();
    });
  });

  root.querySelector("[data-pulse-save-name]")?.addEventListener("click", () => {
    requireName();
    render();
  });

  root.querySelector("[data-pulse-post]")?.addEventListener("click", () => {
    const name = requireName();
    if (!name) return;
    const textarea = root.querySelector("[data-pulse-post-text]");
    const body = (textarea?.value || "").trim();
    if (!body) {
      textarea?.focus();
      return;
    }
    state.posts.unshift({
      id: postId(),
      type: "user",
      author: name,
      badge: "User Pulse",
      date: nowLabel(),
      title: "",
      body,
      likes: 0,
      replies: [],
    });
    savePosts();
    render();
  });

  root.querySelectorAll("[data-pulse-like]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.tab !== "users") return;
      if (!requireName()) return;
      const post = findUserPost(button.dataset.pulseLike);
      if (!post) return;
      post.likes = (Number(post.likes) || 0) + 1;
      savePosts();
      render();
    });
  });

  root.querySelectorAll("[data-pulse-reply-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = requireName();
      if (!name) return;
      const input = form.querySelector("input");
      const body = (input?.value || "").trim();
      if (!body) {
        input?.focus();
        return;
      }
      const post = findUserPost(form.dataset.pulseReplyForm);
      if (!post) return;
      post.replies = post.replies || [];
      post.replies.push({ author: name, body, date: nowLabel() });
      savePosts();
      render();
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading LSL Pulse...");
  state.name = readName();
  state.posts = readStoredPosts();
  const news = await loadJSON("./data/news.json", { items: [] });
  state.officialPosts = officialFeedItems(news);
  render();
}

init();
