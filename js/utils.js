export function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slugify(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function byId(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

export function groupBy(items = [], keyFn) {
  return items.reduce((map, item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
}

export function formatDate(value) {
  if (!value) return "Date TBA";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateWithISO(value) {
  if (!value) return "Date TBA";
  const friendly = formatDate(value);
  return friendly === value ? value : `${friendly} (${value})`;
}

export function formatMatchDateTime(date, time = "") {
  return [formatDateWithISO(date), time].filter(Boolean).join(" | ");
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

export function initials(name = "", max = 2) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "LSL";
  return words.slice(0, max).map((word) => word[0].toUpperCase()).join("");
}

export function pointsLabel(points) {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

export function createOptions(options, selectedValue) {
  return options
    .map((option) => {
      const value = typeof option === "object" ? option.value : option;
      const label = typeof option === "object" ? option.label : option;
      const selected = String(value) === String(selectedValue) ? " selected" : "";
      return `<option value="${escapeHTML(value)}"${selected}>${escapeHTML(label)}</option>`;
    })
    .join("");
}

export function controlSelect(id, label, options, selectedValue) {
  return `
    <div class="control">
      <label for="${escapeHTML(id)}">${escapeHTML(label)}</label>
      <select id="${escapeHTML(id)}">${createOptions(options, selectedValue)}</select>
    </div>
  `;
}

export function controlInput(id, label, placeholder = "") {
  return `
    <div class="control">
      <label for="${escapeHTML(id)}">${escapeHTML(label)}</label>
      <input id="${escapeHTML(id)}" type="search" placeholder="${escapeHTML(placeholder)}">
    </div>
  `;
}

export function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function setDocumentTitle(title) {
  document.title = `${title} | Lantern Soccer League`;
}

export function statusMessage(type, message) {
  return `<div class="${escapeHTML(type)}-state">${escapeHTML(message)}</div>`;
}

export function sortByNumberDesc(items, key) {
  return [...items].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
}

export function joinNames(items = [], fallback = "None listed") {
  const names = items.filter(Boolean);
  return names.length ? names.join(", ") : fallback;
}

export function leadershipRoleLabel(role = "") {
  const normalized = String(role).toLowerCase();
  if (normalized === "captain") return "Captain";
  if (["assistant", "assistant captain", "assistant-captain"].includes(normalized)) return "Assistant Captain";
  return "";
}

export function leadershipRoleShort(role = "") {
  const normalized = String(role).toLowerCase();
  if (normalized === "captain") return "C";
  if (["assistant", "assistant captain", "assistant-captain"].includes(normalized)) return "A";
  return "";
}

export function teamProfileHref(teamId = "", season = "") {
  const params = new URLSearchParams();
  if (season) params.set("season", season);
  if (teamId) params.set("id", teamId);
  return `./team.html?${params.toString()}`;
}
