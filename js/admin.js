import { setupLayout } from "./main.js";
import { createPulseAdminStore } from "./pulseFirebase.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js?v=1.0";

// Client-side only gate - this is NOT real security, just a soft deterrent
// so this page doesn't get stumbled into by accident. Anyone who reads this
// file (or knows the URL and guesses) can see the passphrase. Real
// protection has to come from Firestore security rules on the "accounts"
// collection, not from this prompt.
const ADMIN_PASSPHRASE = "password";
const UNLOCK_KEY = "lsl-pulse-admin-unlocked";

setupLayout("admin.html");
setDocumentTitle("LSL Pulse Admin");

const root = document.getElementById("page-root");

let state = {
  unlocked: sessionStorage.getItem(UNLOCK_KEY) === "true",
  passInput: "",
  passError: "",
  loading: false,
  accounts: [],
  message: "",
  error: "",
  mergeFrom: "",
  mergeInto: "",
};

let adminStore = null;

function formatDate(ms) {
  if (!ms) return "Unknown";
  return new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function renderGate() {
  return `
    <section class="section-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">LSL Pulse</span>
          <h1>Admin Access</h1>
          <p>Enter the admin passphrase to manage accounts. This is a soft, client-side gate only - do not rely on it as real security.</p>
        </div>
      </div>
      <form data-admin-unlock-form style="display:grid; gap:12px; max-width:360px;">
        <input type="password" data-admin-pass placeholder="Admin passphrase" style="padding:14px 16px; border-radius:14px; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.06); color:#fff; font:inherit;">
        <button type="submit" class="button primary">Unlock</button>
        ${state.passError ? `<small style="color:#ff8080;">${escapeHTML(state.passError)}</small>` : ""}
      </form>
    </section>
  `;
}

function renderAccountRow(account) {
  return `
    <tr>
      <td data-label="Username"><strong>${escapeHTML(account.username)}</strong><br><small style="color:var(--muted);">${escapeHTML(account.usernameKey)}</small></td>
      <td data-label="Joined">${escapeHTML(formatDate(account.createdAtMs))}</td>
      <td data-label="Posts" class="num">${account.postCount}</td>
      <td data-label="Actions">
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          <button type="button" class="button secondary small" data-admin-reset="${escapeHTML(account.usernameKey)}">Reset PIN</button>
          <button type="button" class="button secondary small" data-admin-delete="${escapeHTML(account.usernameKey)}">Remove Login</button>
        </div>
      </td>
    </tr>
  `;
}

function renderDashboard() {
  if (state.loading) {
    return `<section class="section-panel">${statusMessage("loading", "Loading accounts...")}</section>`;
  }

  if (!adminStore) {
    return `<section class="section-panel">${statusMessage("error", "Could not connect to Firebase. Check js/firebaseConfig.js.")}</section>`;
  }

  const accountOptions = state.accounts
    .map((account) => `<option value="${escapeHTML(account.usernameKey)}">${escapeHTML(account.username)} (${escapeHTML(account.usernameKey)})</option>`)
    .join("");

  return `
    <section class="section-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">LSL Pulse</span>
          <h1>Admin: Accounts</h1>
          <p>${state.accounts.length} account${state.accounts.length === 1 ? "" : "s"} registered. Reset a forgotten PIN, remove a login, or merge two accounts into one.</p>
        </div>
        <button type="button" class="button secondary" data-admin-refresh>Refresh</button>
      </div>
      ${state.message ? `<p style="color:#8fe8a8; font-weight:800;">${escapeHTML(state.message)}</p>` : ""}
      ${state.error ? `<p style="color:#ff8080; font-weight:800;">${escapeHTML(state.error)}</p>` : ""}
      <div class="table-wrap mobile-card-table-wrap">
        <table class="data-table mobile-card-table">
          <thead>
            <tr><th>Username</th><th>Joined</th><th class="num">Posts</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${state.accounts.length ? state.accounts.map(renderAccountRow).join("") : `<tr><td colspan="4">No accounts yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Merge Accounts</span>
          <h2>Combine Two Accounts Into One</h2>
          <p>Moves every post, like, dislike, repost, and reply from the "merge from" account onto the "merge into" account, then removes the "merge from" login. This cannot be undone.</p>
        </div>
      </div>
      <form data-admin-merge-form style="display:grid; gap:12px; max-width:520px;">
        <label style="display:grid; gap:6px;">
          <span>Merge FROM (will be removed)</span>
          <select data-admin-merge-from style="padding:12px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.06); color:#fff; font:inherit;">
            <option value="">Select an account</option>
            ${accountOptions}
          </select>
        </label>
        <label style="display:grid; gap:6px;">
          <span>Merge INTO (keeps this identity)</span>
          <select data-admin-merge-into style="padding:12px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.16); background:rgba(255,255,255,0.06); color:#fff; font:inherit;">
            <option value="">Select an account</option>
            ${accountOptions}
          </select>
        </label>
        <button type="submit" class="button primary">Merge Accounts</button>
      </form>
    </section>
  `;
}

function render() {
  root.innerHTML = state.unlocked ? renderDashboard() : renderGate();
  bindEvents();
}

async function loadAccounts() {
  state.loading = true;
  render();
  adminStore = await createPulseAdminStore();
  state.accounts = adminStore ? await adminStore.listAccounts() : [];
  state.loading = false;
  render();
}

function bindEvents() {
  root.querySelector("[data-admin-unlock-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = root.querySelector("[data-admin-pass]");
    if ((input?.value || "") === ADMIN_PASSPHRASE) {
      state.unlocked = true;
      state.passError = "";
      sessionStorage.setItem(UNLOCK_KEY, "true");
      render();
      await loadAccounts();
    } else {
      state.passError = "Incorrect passphrase.";
      render();
    }
  });

  root.querySelector("[data-admin-refresh]")?.addEventListener("click", loadAccounts);

  root.querySelectorAll("[data-admin-reset]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.adminReset;
      const newPin = prompt(`New 4-digit PIN for ${key}:`);
      if (!newPin) return;
      if (!/^\d{4}$/.test(newPin)) {
        alert("PIN must be exactly 4 numbers.");
        return;
      }
      await adminStore.resetAccountPin(key, newPin);
      state.message = `PIN reset for ${key}.`;
      state.error = "";
      render();
    });
  });

  root.querySelectorAll("[data-admin-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.adminDelete;
      if (!confirm(`Remove the login for "${key}"? Their existing posts stay, but no one can log back into this exact account (a new account would need to be created for the same username).`)) return;
      await adminStore.deleteAccount(key);
      state.message = `Removed login for ${key}.`;
      state.error = "";
      await loadAccounts();
    });
  });

  root.querySelector("[data-admin-merge-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fromKey = root.querySelector("[data-admin-merge-from]")?.value || "";
    const intoKey = root.querySelector("[data-admin-merge-into]")?.value || "";
    if (!fromKey || !intoKey) {
      state.error = "Choose both an account to merge from and an account to merge into.";
      render();
      return;
    }
    if (!confirm(`Merge "${fromKey}" into "${intoKey}"? This moves all their posts, likes, dislikes, reposts, and replies, then deletes the "${fromKey}" login. This cannot be undone.`)) return;

    try {
      const result = await adminStore.mergeAccounts(fromKey, intoKey);
      state.message = `Merged ${fromKey} into ${intoKey}: moved ${result.postsMoved} post${result.postsMoved === 1 ? "" : "s"} and ${result.repliesMoved} repl${result.repliesMoved === 1 ? "y" : "ies"}.`;
      state.error = "";
      await loadAccounts();
    } catch (error) {
      state.error = error.message || "Could not merge accounts.";
      render();
    }
  });
}

async function init() {
  render();
  if (state.unlocked) await loadAccounts();
}

init();
