import { loadJSON } from "./dataLoader.js?v=1.0";
import { SITE } from "./config.js";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("forms.html");
setDocumentTitle("Forms");

const root = document.getElementById("page-root");

const CATEGORY_ICONS = {
  "League Registration": "📝",
  "Inter-Madrasa Tournament": "🏆",
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

function renderHero(forms) {
  const openCount = forms.filter((form) => statusMeta(form.status).label === "Open").length;
  const closedCount = forms.filter((form) => statusMeta(form.status).label === "Closed").length;
  return `
    <section class="hero forms-hero">
      <div class="hero-copy">
        <span class="hero-kicker">Official Registration Desk</span>
        <h1>LSL Forms &amp; Registration</h1>
        <p>Registration links, tournament interest forms, and league paperwork are organized here for players, families, coaches, and volunteers.</p>
        <div class="forms-hero-status">
          <span class="pill green">${escapeHTML(openCount)} open</span>
          <span class="pill red">${escapeHTML(closedCount)} closed</span>
          <span class="pill">${escapeHTML(SITE.defaultSeason)} season</span>
        </div>
      </div>
      <aside class="hero-logo-card" aria-label="Forms">
        <img src="${escapeHTML(SITE.logo)}" alt="Lantern Soccer League logo">
        <strong>Lantern Soccer League</strong>
        <span class="pill">Registration Center</span>
      </aside>
    </section>
  `;
}

function renderOfficeStrip(forms) {
  const currentStatus = forms.some((form) => statusMeta(form.status).label === "Open") ? "Forms Open" : "Forms Closed";
  const cards = [
    { label: "Current Status", value: currentStatus, note: "Check individual cards below before submitting." },
    { label: "Official Links", value: String(forms.length), note: "League and tournament forms in one place." },
    { label: "Questions", value: "Ask LSL", note: "Speak with a coach or league contact before submitting." },
  ];

  return `
    <section class="section-panel forms-office-panel">
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
    { label: "First Day", value: event.firstDay || event.dates || "Date TBA", note: "Opening day", mark: "📅" },
    { label: "Ages", value: event.eligibleAges || "Ages TBA", note: event.openSpotsNote || "Open spots will be updated here.", mark: "👥" },
    { label: "Cost", value: event.cost || "Cost TBA", note: "Season fee", mark: "💵" },
    { label: "Schedule", value: schedule.day, note: schedule.time, mark: "⏱️" },
  ];

  const infoRows = [
    ["Venue", event.venue || SITE.venue],
    ["Address", event.address || "Address TBA"],
    ["Registration Deadline", event.registrationDeadline || "TBA"],
    ["Combine Day", event.combineDay || "TBA"],
  ];

  return `
    <section class="section-panel season-details-panel">
      <div class="season-details-head">
        <div>
          <span class="eyebrow">${escapeHTML(SITE.defaultSeason)} Season</span>
          <h2>Season Details</h2>
          <p>${escapeHTML(event.name || "Lantern Soccer League season information")}</p>
        </div>
        <span class="pill green">${escapeHTML(event.dates || "Dates TBA")}</span>
      </div>
      <div class="season-detail-grid">
        ${details
          .map(
            (detail) => `
              <article class="season-detail-card">
                <span class="season-detail-mark" aria-hidden="true">${escapeHTML(detail.mark)}</span>
                <div>
                  <span class="season-detail-label">${escapeHTML(detail.label)}</span>
                  <strong>${escapeHTML(detail.value)}</strong>
                </div>
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
    { number: "1", title: "Review Details", body: "Check ages, cost, schedule, location, and the registration deadline before opening a form." },
    { number: "2", title: "Choose Form", body: "League registration and tournament interest forms are separate. Pick the one that matches what you need." },
    { number: "3", title: "Submit Early", body: "Forms open in a new tab. Submit before deadlines because spots can close quickly." },
  ];

  return `
    <section class="section-panel forms-steps-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">How It Works</span>
          <h2>Registering In 3 Steps</h2>
          <p>New to LSL paperwork? Here's the quickest path from "which form?" to "submitted."</p>
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
  const icon = CATEGORY_ICONS[form.category] || "📄";
  const isClosed = meta.label === "Closed";
  return `
    <article class="card form-card-pro ${isClosed ? "closed" : "open"}">
      <div class="form-card-pro-top">
        <span class="form-card-pro-icon" aria-hidden="true">${escapeHTML(icon)}</span>
        <span class="pill ${escapeHTML(meta.tone)}">${escapeHTML(meta.label)}</span>
      </div>
      <h3>${escapeHTML(form.title || "Form")}</h3>
      <p>${escapeHTML(form.description || "Form details coming soon.")}</p>
      <div class="form-card-pro-meta">
        <span><strong>Season</strong>${escapeHTML(form.season || "TBA")}</span>
        <span><strong>Category</strong>${escapeHTML(form.category || "General")}</span>
      </div>
      <div class="button-row form-actions">
        <a class="button ${isClosed ? "secondary" : "primary"}" href="${escapeHTML(form.url || "#")}" target="_blank" rel="noopener">${isClosed ? "View Closed Form" : "Open Form"} ↗</a>
      </div>
    </article>
  `;
}

function renderFormsByCategory(forms) {
  if (!forms.length) {
    return `<section class="section-panel">${statusMessage("empty", "No active forms are listed yet.")}</section>`;
  }

  const categories = [];
  forms.forEach((form) => {
    const category = form.category || "General";
    let bucket = categories.find((item) => item.name === category);
    if (!bucket) {
      bucket = { name: category, forms: [] };
      categories.push(bucket);
    }
    bucket.forms.push(form);
  });

  return categories
    .map(
      (bucket) => `
        <section class="section-panel forms-category-panel">
          <div class="section-head compact-head">
            <div>
              <span class="eyebrow">${escapeHTML(CATEGORY_ICONS[bucket.name] || "📄")} Category</span>
              <h2>${escapeHTML(bucket.name)}</h2>
              <p>${escapeHTML(bucket.forms.length)} form${bucket.forms.length === 1 ? "" : "s"} listed.</p>
            </div>
          </div>
          <div class="grid two forms-grid">
            ${bucket.forms.map(renderFormCard).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderHelpStrip() {
  return `
    <section class="section-panel forms-help-panel">
      <div class="forms-help-strip">
        <div>
          <span class="eyebrow">Need Help?</span>
          <h2>Questions About A Form?</h2>
          <p>If a link is broken, a deadline looks wrong, or you're not sure which form applies to you, reach out to your team's coach or league contact before submitting.</p>
        </div>
        <a class="button secondary" href="./rules.html">League Rules</a>
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
    ${renderOfficeStrip(forms)}
    ${renderSeasonDetails(seasonData.event || {})}
    ${renderStepsSection()}
    ${renderFormsByCategory(forms)}
    ${renderHelpStrip()}
  `;
}

init();
