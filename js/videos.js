import { renderPhotoCard } from "../components/photoCard.js";
import { renderVideoCard } from "../components/videoCard.js";
import { SITE } from "./config.js";
import { loadSeasonData } from "./dataLoader.js?v=1.0";
import { setupLayout } from "./main.js";
import { controlSelect, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("videos.html");
setDocumentTitle("Photos and Videos");

const root = document.getElementById("page-root");
let state = {
  photoSeason: "2025",
  photoDivision: "all",
  videoSeason: "2025",
  videoDivision: "all",
};

const MEDIA_DIVISIONS = [
  { value: "all", label: "All media" },
  { value: "Seniors", label: "Seniors" },
  { value: "Juniors", label: "Juniors" },
  { value: "Tournament", label: "Inter-Madrasa Tournament" },
];

function byDivision(items = [], division = "all") {
  return items.filter((item) => division === "all" || item.division === division);
}

function divisionLabel(division) {
  if (division === "Tournament") return "Inter-Madrasa Tournament";
  if (division === "All") return "General";
  return division || "General";
}

function groupedPhotos(photos = []) {
  return photos.reduce((groups, photo) => {
    const key = photo.division || "All";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
    return groups;
  }, new Map());
}

function renderPhotoGroups(photos = []) {
  if (!photos.length) return statusMessage("empty", "No photos are published for this selection yet.");
  return [...groupedPhotos(photos).entries()]
    .map(
      ([division, items]) => `
        <details class="clean-details media-details">
          <summary>${divisionLabel(division)} photos (${items.length})</summary>
          <div class="grid two media-grid photo-grid">
            ${items.map(renderPhotoCard).join("")}
          </div>
        </details>
      `
    )
    .join("");
}

async function render() {
  const [photoData, videoData] = await Promise.all([loadSeasonData(state.photoSeason), loadSeasonData(state.videoSeason)]);
  const photos = byDivision(photoData.photos || [], state.photoDivision);
  const videos = byDivision(videoData.videos || [], state.videoDivision);

  root.innerHTML = `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Photos and Videos</span>
          <h1>LSL Media Gallery</h1>
          <p>Photos and video cards are organized by year so the gallery stays clean and easy to update.</p>
        </div>
      </div>
    </section>

    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Photos</span>
          <h2>Photo Gallery</h2>
          <p>Choose a season and division to view posted league photos and event pictures.</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("photoSeason", "Photo season", SITE.seasons, state.photoSeason)}
        ${controlSelect("photoDivision", "Photo division", MEDIA_DIVISIONS, state.photoDivision)}
      </div>
      <div class="media-groups">
        ${renderPhotoGroups(photos)}
      </div>
    </section>

    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Videos</span>
          <h2>Video Clips</h2>
          <p>Choose a season and division to watch posted league clips and tournament videos.</p>
        </div>
      </div>
      <div class="controls">
        ${controlSelect("videoSeason", "Video season", SITE.seasons, state.videoSeason)}
        ${controlSelect("videoDivision", "Video division", MEDIA_DIVISIONS, state.videoDivision)}
      </div>
      <div class="grid two media-video-grid">
        ${videos.length ? videos.map(renderVideoCard).join("") : statusMessage("empty", "No video clips are published for this selection yet.")}
      </div>
    </section>
  `;

  hydrateVideoControls();
}

function updateVideoButton(card) {
  const video = card?.querySelector("video");
  const button = card?.querySelector('[data-video-action="toggle"]');
  if (!video || !button) return;
  button.textContent = video.paused || video.ended ? "Play" : "Pause";
}

function pauseOtherVideos(activeVideo) {
  root.querySelectorAll(".video-card video").forEach((video) => {
    if (video === activeVideo || video.paused) return;
    video.pause();
    updateVideoButton(video.closest(".video-card"));
  });
}

function hydrateVideoControls() {
  root.querySelectorAll(".video-card").forEach((card) => {
    const video = card.querySelector("video");
    if (!video) return;
    ["play", "pause", "ended"].forEach((eventName) => {
      video.addEventListener(eventName, () => updateVideoButton(card));
    });
    updateVideoButton(card);
  });
}

root.addEventListener("change", (event) => {
  if (!["photoSeason", "photoDivision", "videoSeason", "videoDivision"].includes(event.target.id)) return;
  state[event.target.id] = event.target.value;
  render();
});

root.addEventListener("click", (event) => {
  const control = event.target.closest("[data-video-action]");
  if (!control) return;
  const card = control.closest(".video-card");
  const video = card?.querySelector("video");
  if (!video) return;

  if (control.dataset.videoAction === "toggle") {
    if (video.paused || video.ended) {
      pauseOtherVideos(video);
      video.play().catch(() => updateVideoButton(card));
    } else {
      video.pause();
    }
  }

  if (control.dataset.videoAction === "stop") {
    video.pause();
    video.currentTime = 0;
  }

  updateVideoButton(card);
});

async function init() {
  root.innerHTML = statusMessage("loading", "Loading photos and videos...");
  render();
}

init();
