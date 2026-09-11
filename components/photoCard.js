import { escapeHTML, formatDate } from "../js/utils.js";

function detailRows(photo) {
  return [
    photo.uploadDate ? ["Date", formatDate(photo.uploadDate)] : null,
    ["Division", photo.division === "Tournament" ? "Inter-Madrasa Tournament" : photo.division || "All"],
  ].filter(Boolean);
}

export function renderPhotoCard(photo) {
  const rows = detailRows(photo);

  return `
    <article class="card media-card">
      <div class="photo-thumb">
        ${photo.imageUrl ? `<img src="${escapeHTML(photo.imageUrl)}" alt="${escapeHTML(photo.title || "LSL photo")}">` : `<span>${escapeHTML(photo.category || "Photo")}</span>`}
      </div>
      <span class="pill">${escapeHTML(photo.category || "Photo")}</span>
      <h3>${escapeHTML(photo.title || "Photo")}</h3>
      <p>${escapeHTML(photo.description || "Photo details will be posted soon.")}</p>
      <ul class="detail-list">
        ${rows.map(([label, value]) => `<li><strong>${escapeHTML(label)}</strong><span>${escapeHTML(value)}</span></li>`).join("")}
      </ul>
    </article>
  `;
}
