import { escapeHTML } from "../js/utils.js";

function resultClass(result = "") {
  const value = String(result).toUpperCase();
  if (value === "W") return "win";
  if (value === "D") return "draw";
  if (value === "L") return "loss";
  return "empty";
}

export function renderFormStrip(form = [], label = "Last 5") {
  const results = (form || []).map((item) => (typeof item === "string" ? item : item?.result)).filter(Boolean);
  if (!results.length) {
    return `
      <div class="form-strip empty">
        <span class="form-strip-label">${escapeHTML(label)}</span>
        <span class="form-empty-text">No games yet</span>
      </div>
    `;
  }

  return `
    <div class="form-strip">
      <span class="form-strip-label">${escapeHTML(label)}</span>
      <div class="form-badges" aria-label="${escapeHTML(label)} results">
        ${results
          .map((result) => {
            const value = String(result).toUpperCase();
            return `<span class="form-badge ${resultClass(value)}">${escapeHTML(value)}</span>`;
          })
          .join("")}
      </div>
    </div>
  `;
}
