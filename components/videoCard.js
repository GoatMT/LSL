import { escapeHTML, formatDate } from "../js/utils.js";

function detailRows(video) {
  return [
    video.uploadDate ? ["Date", formatDate(video.uploadDate)] : null,
    ["Division", video.division === "Tournament" ? "Inter-Madrasa Tournament" : video.division || "All"],
    video.matchReference && video.matchReference !== video.category ? ["Match", video.matchReference] : null,
  ].filter(Boolean);
}

export function renderVideoCard(video) {
  const media = video.videoUrl
    ? `<video controls playsinline preload="metadata" data-media-title="${escapeHTML(video.title || "LSL video")}">
        <source src="${escapeHTML(video.videoUrl)}" type="video/mp4">
        Your browser cannot play this video.
      </video>`
    : video.thumbnail
      ? `<img src="${escapeHTML(video.thumbnail)}" alt="">`
      : escapeHTML(video.category || "LSL Clip");

  return `
    <article class="card media-card video-card">
      ${
        video.videoUrl
          ? `<div class="media-video-actions" aria-label="Video controls">
              <button class="button primary" type="button" data-video-action="toggle">Play</button>
              <button class="button" type="button" data-video-action="stop">Stop</button>
            </div>`
          : ""
      }
      <div class="video-thumb media-frame">${media}</div>
      <span class="pill">${escapeHTML(video.category || "Video")}</span>
      <h3>${escapeHTML(video.title)}</h3>
      <p>${escapeHTML(video.description || "Video details will be posted soon.")}</p>
      <ul class="detail-list">
        ${detailRows(video).map(([label, value]) => `<li><strong>${escapeHTML(label)}</strong><span>${escapeHTML(value)}</span></li>`).join("")}
      </ul>
      ${video.externalUrl ? `<div class="button-row form-actions"><a class="button primary" href="${escapeHTML(video.externalUrl)}" target="_blank" rel="noopener">Watch clip</a></div>` : ""}
    </article>
  `;
}

