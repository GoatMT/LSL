import { loadJSON } from "./dataLoader.js?v=1.0";
import { renderFanVoteCard, hydrateFanVote } from "./fanVote.js";
import { setupLayout } from "./main.js";
import { setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("voting.html");
setDocumentTitle("Voting");

const root = document.getElementById("page-root");
let awardWatchData = {};

function hasCandidates() {
  return (awardWatchData.categories || []).some((category) => (category.leaders || []).some((leader) => leader.playerId));
}

function render() {
  if (!hasCandidates()) {
    root.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <span class="hero-kicker">Fan Vote</span>
          <h1>Voting</h1>
          <p>Cast your pick for this week's Fan MVP.</p>
        </div>
      </section>
      <section class="section-panel">
        ${statusMessage("empty", "Voting opens once this week's award watch list is published. Check back soon.")}
      </section>
    `;
    return;
  }

  root.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-kicker">Fan Vote${awardWatchData.week ? ` &middot; ${awardWatchData.week}` : ""}</span>
        <h1>Cast Your Vote</h1>
        <p>Pick this week's Fan MVP. Votes are live and shared across every visitor to the site &mdash; change your pick anytime before the week wraps up.</p>
        <div class="button-row hero-actions">
          <a class="button" href="./awards.html">&larr; Back to Awards</a>
        </div>
      </div>
    </section>

    <section class="section-panel">
      <div class="section-head compact-head">
        <div>
          <span class="eyebrow">Fan Vote</span>
          <h2>Fan MVP</h2>
          <p>Tap a name to vote. One vote per browser, changeable anytime this week.</p>
        </div>
      </div>
      <div class="fan-vote-grid">
        ${renderFanVoteCard(awardWatchData, "mvp", { interactive: true })}
      </div>
    </section>
  `;

  hydrateFanVote(root, awardWatchData);
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading voting...");
  try {
    awardWatchData = await loadJSON("./data/award-watch.json", {});
    render();
  } catch (error) {
    console.error("Could not load voting data", error);
    root.innerHTML = `<section class="section-panel">${statusMessage("error", "Voting is coming soon. Please check back later.")}</section>`;
  }
}

init();
