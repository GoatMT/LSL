import { buildHomeFacts } from "./homeFacts.js?v=4";
import { findOnThisDayHighlight, renderOnThisDayCallout } from "./onThisDay.js";
import { escapeHTML } from "./utils.js?v=1.0";

function recordWatchFacts(allData) {
  const facts = buildHomeFacts(allData).filter((fact) => fact.scope.startsWith("2026 | Seniors |"));
  const seen = new Set();
  return facts.filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}

function recordLabel(fact) {
  if (fact.unit === "combined goals") return "Highest-scoring match";
  if (fact.unit === "goal margin") return "Biggest winning margin";
  if (fact.unit === "goals in one game") return "Single-game scoring mark";
  return "Season record";
}

function renderWatchSlide(fact, index, total) {
  const stageLabel = fact.scope.split("|").at(-1)?.trim() || "2026 Seniors";
  return `
    <article class="home-record-watch-slide" data-home-watch-slide role="group" aria-roledescription="slide" aria-label="Record ${index + 1} of ${total}"${index ? " hidden" : ""}>
      <div class="home-record-watch-meta">
        <span>${escapeHTML(stageLabel)}</span>
        <span>${escapeHTML(recordLabel(fact))}</span>
      </div>
      <div class="home-record-watch-value">
        <strong>${escapeHTML(fact.value)}</strong>
        <span>${escapeHTML(fact.unit)}</span>
      </div>
      <h3>${escapeHTML(fact.title)}</h3>
      <p>${escapeHTML(fact.note)}</p>
      <a href="${escapeHTML(fact.href)}">${escapeHTML(fact.detail)} <span aria-hidden="true">&rarr;</span></a>
    </article>
  `;
}

export function renderHomeRecordWatch(allData = []) {
  const facts = recordWatchFacts(allData);
  const cards = facts.length
    ? `
        <div class="home-record-watch-viewport" data-home-watch-viewport aria-live="polite" aria-atomic="true">
          ${facts.map((fact, index) => renderWatchSlide(fact, index, facts.length)).join("")}
        </div>
        <div class="home-record-watch-controls" data-home-watch-controls${facts.length < 2 ? " hidden" : ""}>
          <button class="button secondary" type="button" data-home-watch-previous aria-label="Previous record">Previous</button>
          <span data-home-watch-position aria-live="polite">1 / ${facts.length}</span>
          <button class="button secondary" type="button" data-home-watch-next aria-label="Next record">Next</button>
        </div>
      `
    : `<p class="home-record-watch-empty">No qualifying 2026 Seniors record mark is available yet.</p>`;

  return `
    <section class="section-panel home-record-watch" aria-labelledby="home-record-watch-title" aria-roledescription="carousel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">2026 Seniors</span>
          <h2 id="home-record-watch-title">Record Watch</h2>
          <p>Verified season highs from completed regular-season and playoff matches.</p>
        </div>
        <a class="text-link" href="./record-watch.html">All record watch</a>
      </div>
      ${cards}
    </section>
  `;
}

export function hydrateHomeRecordWatch(root = document) {
  const panel = root.querySelector(".home-record-watch");
  if (!panel) return;
  const slides = [...panel.querySelectorAll("[data-home-watch-slide]")];
  const position = panel.querySelector("[data-home-watch-position]");
  const previous = panel.querySelector("[data-home-watch-previous]");
  const next = panel.querySelector("[data-home-watch-next]");
  if (slides.length < 2) return;

  let activeIndex = 0;
  const show = (index) => {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      slide.hidden = slideIndex !== activeIndex;
      slide.setAttribute("aria-label", `Record ${slideIndex + 1} of ${slides.length}`);
    });
    if (position) position.textContent = `${activeIndex + 1} / ${slides.length}`;
  };

  previous?.addEventListener("click", () => show(activeIndex - 1));
  next?.addEventListener("click", () => show(activeIndex + 1));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      show(activeIndex + 1);
    }
  });
}

export function renderHomeOnThisDay(allData = []) {
  const highlight = findOnThisDayHighlight(allData);
  const content = highlight
    ? renderOnThisDayCallout(highlight)
    : `<p class="home-on-this-day-empty">No completed LSL match is recorded on this calendar date yet.</p>`;

  return `
    <section class="section-panel home-on-this-day" aria-labelledby="home-on-this-day-title">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">League Archive</span>
          <h2 id="home-on-this-day-title">On This Day</h2>
          <p>A look back at a match played on today's date.</p>
        </div>
        <a class="text-link" href="./lsl-timeline.html">League timeline</a>
      </div>
      ${content}
    </section>
  `;
}

