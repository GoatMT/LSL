import { loadJSON } from "./dataLoader.js?v=1.0";
import { SITE } from "./config.js";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("forms.html");
setDocumentTitle("Forms");

const root = document.getElementById("page-root");

const CATEGORY_ICONS = {
  "League Registration": "LSL",
  "Inter-Madrasa Tournament": "IMT",
};

const STATUS_STYLES = {
  open: { label: "Open", tone: "green" },
  closed: { label: "Closed", tone: "red" },
  "coming soon": { label: "Coming Soon", tone: "" },
};

function statusMeta(status = "") {
  return STATUS_STYLES[String(status).trim().toLowerCase()] || { label: status || "Status TBA", tone: "" };
}

function splitSchedule(schedule = "") {
  const [day = "Schedule TBA", time = "Time TBA"] = schedule.split(",").map((part) => part.trim());
  return { day, time };
}

function formPurpose(form) {
  if (form.category === "Inter-Madrasa Tournament") {
    return "Tournament interest, team setup, and event planning.";
  }
  if (form.category === "League Registration") {
    return "Lantern Soccer League season registration.";
  }
  return "General league form.";
}

function renderHero(forms) {
  const openCount = forms.filter((form) => statusMeta(form.status).label === "Open").length;
  const closedCount = forms.filter((form) => statusMeta(form.status).label === "Closed").length;
  const comingSoonCount = forms.filter((form) => statusMeta(form.status).label === "Coming Soon").length;
  const currentStatus = openCount ? "Forms Open" : comingSoonCount ? "Next Registration Coming Soon" : "Forms Closed";
  return `
    <section class="hero forms-hero">
      <div class="hero-copy">
        <span class="hero-kicker">Registration Center</span>
        <h1>LSL Forms &amp; Registration</h1>
        <p>Find the right league or tournament form, check its status, and open the official link from one clean page.</p>
        <div class="forms-hero-actions">
          <a class="button primary" href="#forms-list">View Forms</a>
          <a class="button secondary" href="./rules.html">League Rules</a>
        </div>
      </div>
      <aside class="forms-status-board" aria-label="Registration status">
        <span class="eyebrow">Current Status</span>
        <strong>${escapeHTML(currentStatus)}</strong>
        <p>${openCount ? "At least one form is accepting responses." : comingSoonCount ? "The next season registration details will be posted when they are ready." : "Current forms are closed. New links will be posted when registration opens."}</p>
        <div class="forms-status-grid">
          <span><b>${escapeHTML(openCount)}</b><small>Open</small></span>
          <span><b>${escapeHTML(closedCount)}</b><small>Closed</small></span>
          <span><b>${escapeHTML(forms.length)}</b><small>Total</small></span>
        </div>
      </aside>
    </section>
  `;
}

function renderQuickStatus(forms) {
  const currentStatus = forms.some((form) => statusMeta(form.status).label === "Open") ? "Open Now" : "Closed Now";
  const cards = [
    { label: "Status", value: currentStatus, note: "Check each form card before opening a link." },
    { label: "Next Step", value: "Choose Form", note: "League and tournament forms are separate." },
    { label: "Need Help", value: "Ask LSL", note: "Speak with a coach or league contact." },
  ];

  return `
    <section class="section-panel forms-office-panel" aria-label="Forms quick status">
      <div class="forms-office-grid">
        ${cards
          .map(
            (card) => `
              <article class="forms-office-card">
                <span>${escapeHTML(card.label)}</span>
                <strong>${escapeHTML(card.value)}</strong>
                <p>${escapeHTML(card.note)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSeasonDetails(event = {}) {
  const schedule = splitSchedule(event.schedule);
  const details = [
    { label: "Season", value: event.dates || "Dates TBA", note: event.name || "Lantern Soccer League season information" },
    { label: "Ages", value: event.eligibleAges || "Ages TBA", note: event.openSpotsNote || "Registration updates will be posted here." },
    { label: "Cost", value: event.cost || "Cost TBA", note: "Season fee" },
    { label: "Schedule", value: schedule.day, note: schedule.time },
  ];

  const infoRows = [
    ["Venue", event.venue || SITE.venue],
    ["Address", event.address || "Address TBA"],
    ["Registration Deadline", event.registrationDeadline || "TBA"],
    ["Combine Day", event.combineDay || "TBA"],
  ];

  return `
    <section class="section-panel season-details-panel forms-season-panel">
      <div class="season-details-head">
        <div>
          <span class="eyebrow">${escapeHTML(SITE.defaultSeason)} Season</span>
          <h2>Season At A Glance</h2>
          <p>Key season information families may need before registering.</p>
        </div>
        <span class="pill green">${escapeHTML(event.firstDay || "Date TBA")}</span>
      </div>
      <div class="season-detail-grid">
        ${details
          .map(
            (detail) => `
              <article class="season-detail-card">
                <span class="season-detail-label">${escapeHTML(detail.label)}</span>
                <strong>${escapeHTML(detail.value)}</strong>
                <p>${escapeHTML(detail.note)}</p>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="season-info-list">
        ${infoRows
          .map(
            ([label, value]) => `
              <div class="season-info-row">
                <strong>${escapeHTML(label)}</strong>
                <span>${escapeHTML(value)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderStepsSection() {
  const steps = [
    { number: "1", title: "Check Status", body: "Look for Open, Closed, or Coming Soon before opening a form." },
    { number: "2", title: "Pick The Right Form", body: "Use LSL Registration for the league season and Inter-Madrasa for the tournament." },
    { number: "3", title: "Open The Link", body: "Forms open in a new tab. Read the form carefully before submitting." },
    { number: "4", title: "Watch For Updates", body: "If a form is closed, return later or check with league organizers." },
  ];

  return `
    <section class="section-panel forms-steps-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">How It Works</span>
          <h2>Simple Form Guide</h2>
          <p>Use this quick guide to avoid choosing the wrong form.</p>
        </div>
      </div>
      <div class="forms-step-grid">
        ${steps
          .map(
            (step) => `
              <article class="forms-step-card">
                <span class="forms-step-number">${escapeHTML(step.number)}</span>
                <h3>${escapeHTML(step.title)}</h3>
                <p>${escapeHTML(step.body)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFormCard(form) {
  const meta = statusMeta(form.status);
  const icon = CATEGORY_ICONS[form.category] || "FORM";
  const isClosed = meta.label === "Closed";
  const isComingSoon = meta.label === "Coming Soon";
  const cardClass = isClosed ? "closed" : isComingSoon ? "coming-soon" : "open";
  const action = isComingSoon
    ? `<span class="button secondary" aria-disabled="true">Coming Soon</span>`
    : `<a class="button ${isClosed ? "secondary" : "primary"}" href="${escapeHTML(form.url || "#")}" target="_blank" rel="noopener">${isClosed ? "View Closed Form" : "Open Form"} -&gt;</a>`;
  return `
    <article class="form-list-card ${cardClass}">
      <div class="form-list-icon" aria-hidden="true">${escapeHTML(icon)}</div>
      <div class="form-list-main">
        <div class="form-list-title-row">
          <div>
            <span class="eyebrow">${escapeHTML(form.category || "General")}</span>
            <h3>${escapeHTML(form.title || "Form")}</h3>
          </div>
          <span class="pill ${escapeHTML(meta.tone)}">${escapeHTML(meta.label)}</span>
        </div>
        <p>${escapeHTML(form.description || "Form details coming soon.")}</p>
        <div class="form-purpose-box">
          <strong>Purpose</strong>
          <span>${escapeHTML(formPurpose(form))}</span>
        </div>
        <div class="form-card-pro-meta">
          <span><strong>Season</strong>${escapeHTML(form.season || "TBA")}</span>
          <span><strong>Status</strong>${escapeHTML(meta.label)}</span>
        </div>
      </div>
      <div class="form-list-action">
        ${action}
      </div>
    </article>
  `;
}

function renderFormsSection(forms) {
  if (!forms.length) {
    return `<section class="section-panel" id="forms-list">${statusMessage("empty", "No forms are listed yet. Check back soon.")}</section>`;
  }

  return `
    <section class="section-panel forms-list-panel" id="forms-list">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Choose A Form</span>
          <h2>Forms Center</h2>
          <p>${escapeHTML(forms.length)} form${forms.length === 1 ? "" : "s"} listed. Open forms are marked clearly.</p>
        </div>
      </div>
      <div class="forms-list">
        ${forms.map(renderFormCard).join("")}
      </div>
    </section>
  `;
}

function renderHelpStrip() {
  return `
    <section class="section-panel forms-help-panel">
      <div class="forms-help-strip">
        <div>
          <span class="eyebrow">Questions</span>
          <h2>Not Sure Which Form To Use?</h2>
          <p>Ask your coach or a league contact before submitting. If a form is closed, wait for the next registration update.</p>
        </div>
        <div class="forms-help-actions">
          <a class="button secondary" href="./rules.html">League Rules</a>
          <a class="button secondary" href="./owners.html">League Contacts</a>
        </div>
      </div>
    </section>
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading forms...");
  const [data, seasonData] = await Promise.all([
    loadJSON("./data/forms.json", { forms: [] }),
    loadJSON(`./data/${SITE.defaultSeason}/teams.json`, { event: {} }),
  ]);
  const forms = data.forms || [];

  root.innerHTML = `
    ${renderHero(forms)}
    ${renderQuickStatus(forms)}
    ${renderFormsSection(forms)}
    ${renderSeasonDetails(seasonData.event || {})}
    ${renderStepsSection()}
    ${renderHelpStrip()}
  `;
}

init();
