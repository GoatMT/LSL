import { loadJSON } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("rules.html");
setDocumentTitle("Rules");

const root = document.getElementById("page-root");
const ruleTabs = ["All", "Matchday", "Equipment", "Discipline", "Weather", "Field Care", "Player Prep"];
const state = { tab: "All", search: "", openRules: new Set() };

const summaryIcons = {
  Arrival: "&#9201;",
  "Start Times": "&#128336;",
  Footwear: "&#9917;",
  Water: "&#128167;",
  "Grass Access": "&#127939;",
};

function ruleText(section) {
  return [section.title, section.tag, section.category, ...(section.body || [])].filter(Boolean).join(" ");
}

function inferCategory(section) {
  const suppliedCategory = ruleTabs.find((tab) => tab.toLowerCase() === String(section.category || "").toLowerCase());
  if (suppliedCategory) return suppliedCategory;
  const text = ruleText(section).toLowerCase();
  if (/weather|rain|cancel/.test(text)) return "Weather";
  if (/garbage|field care|leave the field|snack/.test(text)) return "Field Care";
  if (/equipment|footwear|cleat|shoe|stud|metal blade/.test(text)) return "Equipment";
  if (/sportsmanship|swear|violence|red card|discipline|respect|parent|interfere|bench|goalie/.test(text)) return "Discipline";
  if (/water|player prep|prepare|preparation/.test(text)) return "Player Prep";
  return "Matchday";
}

function inferSeverity(section) {
  if (section.severity) return String(section.severity);
  const text = ruleText(section).toLowerCase();
  if (/automatic red card/.test(text)) return "Automatic Red Card";
  if (/not allowed/.test(text)) return "Not Allowed";
  if (/\brequired\b|\bmust\b/.test(text)) return "Required";
  return "Reminder";
}

function severityClass(severity) {
  if (severity === "Automatic Red Card") return "warning";
  if (severity === "Not Allowed") return "not-allowed";
  if (severity === "Required") return "required";
  return "reminder";
}

function matchesSearch(section) {
  const query = state.search.trim().toLowerCase();
  return !query || ruleText(section).toLowerCase().includes(query);
}

function matchesTab(section) {
  return state.tab === "All" || inferCategory(section) === state.tab;
}

function summaryCard(item) {
  const label = item.label || "Reminder";
  return `
    <article class="rule-summary-card">
      <span class="rule-summary-icon" aria-hidden="true">${item.icon ? escapeHTML(item.icon) : summaryIcons[label] || "&#128204;"}</span>
      <div>
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(item.value || "TBA")}</strong>
        <p>${escapeHTML(item.note || "")}</p>
      </div>
    </article>
  `;
}

function suspensionCard(item) {
  return `
    <article class="suspension-card">
      <div class="suspension-meta">
        <span class="suspension-status">${escapeHTML(item.status || "Suspension")}</span>
        ${item.team ? `<span class="suspension-team">${escapeHTML(item.team)}</span>` : ""}
      </div>
      <h3>${escapeHTML(item.title || "Player Suspension")}</h3>
      <div class="suspension-copy">
        ${(item.body || []).map((line) => `<p>${escapeHTML(line)}</p>`).join("")}
      </div>
    </article>
  `;
}

function renderTabs(sections) {
  const searchable = sections.filter(matchesSearch);
  return `
    <div class="rules-tabs" role="group" aria-label="Rule categories">
      ${ruleTabs
        .map((tab) => {
          const count = tab === "All" ? searchable.length : searchable.filter((section) => inferCategory(section) === tab).length;
          return `
            <button class="rules-tab${state.tab === tab ? " active" : ""}" type="button" data-rule-tab="${escapeHTML(tab)}">
              <span>${escapeHTML(tab)}</span>
              <small>${count}</small>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function ruleCard(section, index) {
  const ruleId = `rule-${index}`;
  const bodyId = `${ruleId}-body`;
  const severity = inferSeverity(section);
  const severityType = severityClass(severity);
  const open = state.openRules.has(ruleId);
  return `
    <article class="rule-card ${severityType}${open ? " open" : ""}" data-rule-id="${ruleId}">
      <button class="rule-toggle" type="button" aria-expanded="${open}" aria-controls="${bodyId}">
        <span class="rule-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="rule-heading">
          <span class="rule-heading-meta">
            <small>${escapeHTML(section.tag || inferCategory(section))}</small>
            <span class="rule-badge ${severityType}">${escapeHTML(severity)}</span>
          </span>
          <strong>${escapeHTML(section.title || "League Rule")}</strong>
        </span>
        <span class="rule-toggle-icon" aria-hidden="true"></span>
      </button>
      <div class="rule-body" id="${bodyId}" aria-hidden="${!open}">
        <div class="rule-body-inner">
          ${(section.body || []).map((line) => `<p>${escapeHTML(line)}</p>`).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderRulesList(sections) {
  const filtered = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => matchesSearch(section) && matchesTab(section));

  if (!filtered.length) return statusMessage("empty", "No rules match your filters.");
  return filtered.map(({ section, index }) => ruleCard(section, index)).join("");
}

function findRule(sections, category) {
  return sections.find((section) => inferCategory(section) === category);
}

function render(data, focusSearch = false) {
  const sections = data.sections || [];
  const disciplineRule = findRule(sections, "Discipline");
  const weatherRule = findRule(sections, "Weather");

  root.innerHTML = `
    <section class="section-panel rules-hero-panel">
      <div class="rules-hero-layout">
        <div class="rules-hero-icons" aria-hidden="true">
          <span>&#128737;</span>
          <span>&#127942;</span>
          <span>&#128227;</span>
        </div>
        <div class="rules-hero-copy">
          <span class="eyebrow">${escapeHTML(data.label || "League Information")}</span>
          <h1>${escapeHTML(data.title || "Rules")}</h1>
          <p>${escapeHTML(data.subtitle || "Important information for players and families.")}</p>
          <strong>Know the rules before matchday. Be ready, be respectful, and keep the league organized.</strong>
        </div>
        <div class="rules-hero-meta">
          <span>Last Updated</span>
          <strong>${escapeHTML(data.updated || "Recently")}</strong>
        </div>
      </div>
    </section>

    <section class="section-panel rules-suspensions-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Player Discipline</span>
          <h2>Suspensions & Discipline</h2>
          <p>Current player suspensions, kept separate from the official rule book.</p>
        </div>
      </div>
      <div class="suspension-grid">
        ${(data.suspensions || []).map(suspensionCard).join("") || statusMessage("empty", "No player suspensions are posted right now.")}
      </div>
    </section>

    <section class="section-panel rules-summary-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Most Important Rules</span>
          <h2>Matchday Essentials</h2>
          <p>Four quick checks before leaving home.</p>
        </div>
      </div>
      <div class="rules-summary-grid">
        ${(data.summary || []).map(summaryCard).join("") || statusMessage("empty", "No matchday essentials are posted.")}
      </div>
    </section>

    <section class="rules-prep-layout">
      <section class="section-panel rules-checklist">
        <div class="section-head compact-head">
          <div>
            <span class="eyebrow">Player Prep</span>
            <h2>Matchday Checklist</h2>
          </div>
        </div>
        <ul>
          <li>Arrive 20 minutes early</li>
          <li>Bring indoor shoes</li>
          <li>Bring water</li>
          <li>Find your coach</li>
          <li>Be ready before kickoff</li>
          <li>Stay off the grass unless it is your game time</li>
          <li>Respect players, coaches, and referees</li>
          <li>Line up for handshakes after the final whistle</li>
        </ul>
      </section>

      <section class="section-panel rules-spotlight">
        <div class="rules-spotlight-icon" aria-hidden="true">!</div>
        <div>
          <span class="eyebrow">Discipline & Respect</span>
          <h2>${escapeHTML(disciplineRule?.title || "Respect The Game")}</h2>
          <ul>
            <li>No swearing</li>
            <li>No violence</li>
            <li>Respect referees, coaches, teammates, and opponents</li>
            <li>Parents should stay off the grass and bring concerns to their child's coach</li>
            <li>Handshakes are mandatory after every game</li>
            <li>Serious behaviour can lead to an automatic red card</li>
          </ul>
        </div>
      </section>
    </section>

    <section class="section-panel weather-card">
      <div class="weather-card-icon" aria-hidden="true">&#127783;</div>
      <div>
        <span class="eyebrow">Weather Decisions</span>
        <h2>${escapeHTML(weatherRule?.title || "Check The Morning Update")}</h2>
        <p>Light rain does not automatically cancel games. Check morning updates before travelling to the field.</p>
      </div>
      <a class="button primary" href="./matchday.html">Open Matchday</a>
    </section>

    <section class="section-panel rules-guide-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">LSL Rulebook</span>
          <h2>Full Rules & Guidance</h2>
          <p>Filter the rulebook, then open a rule for its complete details.</p>
        </div>
      </div>
      <div class="rules-toolbar">
        <label class="rules-search" for="rules-search">
          <span>Search Rules</span>
          <input id="rules-search" type="search" placeholder="Search rules or topics" value="${escapeHTML(state.search)}">
        </label>
        ${renderTabs(sections)}
      </div>
      <div class="rules-accordion">
        ${renderRulesList(sections)}
      </div>
    </section>
  `;

  root.querySelectorAll("[data-rule-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.ruleTab;
      render(data);
    });
  });

  const searchInput = document.getElementById("rules-search");
  searchInput?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render(data, true);
  });
  if (focusSearch && searchInput) {
    searchInput.focus();
    searchInput.setSelectionRange(state.search.length, state.search.length);
  }

  root.querySelectorAll(".rule-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".rule-card");
      const body = card?.querySelector(".rule-body");
      const ruleId = card?.dataset.ruleId;
      if (!card || !body || !ruleId) return;
      const willOpen = !card.classList.contains("open");
      card.classList.toggle("open", willOpen);
      button.setAttribute("aria-expanded", String(willOpen));
      body.setAttribute("aria-hidden", String(!willOpen));
      if (willOpen) state.openRules.add(ruleId);
      else state.openRules.delete(ruleId);
    });
  });
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading rules...");
  try {
    const data = await loadJSON("./data/rules.json", null);
    if (!data) throw new Error("Rules are unavailable");
    render(data);
  } catch (error) {
    console.error("Could not load rules", error);
    root.innerHTML = `<section class="section-panel">${statusMessage("error", "Rules are coming soon. Please check back later.")}</section>`;
  }
}

init();
