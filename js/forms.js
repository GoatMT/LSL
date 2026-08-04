import { loadJSON } from "./dataLoader.js?v=1.0";
import { SITE } from "./config.js";
import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("forms.html");
setDocumentTitle("Forms");

const root = document.getElementById("page-root");

function splitSchedule(schedule = "") {
  const [day = "Schedule TBA", time = "Time TBA"] = schedule.split(",").map((part) => part.trim());
  return { day, time };
}

function renderSeasonDetails(event = {}) {
  const schedule = splitSchedule(event.schedule);
  const details = [
    {
      label: "First Day",
      value: event.firstDay || event.dates || "Date TBA",
      note: "Opening day",
      mark: "01",
    },
    {
      label: "Ages",
      value: event.eligibleAges || "Ages TBA",
      note: event.openSpotsNote || "Open spots will be updated here.",
      mark: "A",
    },
    {
      label: "Cost",
      value: event.cost || "Cost TBA",
      note: "Season fee",
      mark: "$",
    },
    {
      label: "Schedule",
      value: schedule.day,
      note: schedule.time,
      mark: "S",
    },
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
          <h1>Season Details</h1>
          <p>${escapeHTML(event.name || "Lantern Soccer League season information")}</p>
        </div>
        <span class="pill green">${escapeHTML(event.dates || "Dates TBA")}</span>
      </div>
      <div class="season-detail-grid">
        ${details
          .map(
            (detail) => `
              <article class="season-detail-card">
                <span class="season-detail-mark">${escapeHTML(detail.mark)}</span>
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

function renderFormCard(form) {
  return `
    <article class="card">
      <span class="pill green">${escapeHTML(form.status || "Open")}</span>
      <h3>${escapeHTML(form.title || "Form")}</h3>
      <p>${escapeHTML(form.description || "Form details coming soon.")}</p>
      <div class="stat-grid">
        <div class="stat-box"><span>Season</span><strong>${escapeHTML(form.season || "TBA")}</strong></div>
        <div class="stat-box"><span>Category</span><strong>${escapeHTML(form.category || "General")}</strong></div>
      </div>
      <div class="button-row form-actions">
        <a class="button primary" href="${escapeHTML(form.url || "#")}" target="_blank" rel="noopener">Open form</a>
      </div>
    </article>
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
    ${renderSeasonDetails(seasonData.event || {})}
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Forms</span>
          <h1>League Forms</h1>
          <p>League and tournament links are kept here so players and families can find them quickly.</p>
        </div>
      </div>
      <div class="grid two">
        ${forms.length ? forms.map(renderFormCard).join("") : statusMessage("empty", "No active forms are listed yet.")}
      </div>
    </section>
  `;
}

init();
