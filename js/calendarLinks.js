import { escapeHTML } from "./utils.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseClockToDate(baseDate, clock = "") {
  const parsed = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(clock).trim());
  if (!parsed) return null;
  let hours = Number(parsed[1]) % 12;
  if (/PM/i.test(parsed[3])) hours += 12;
  const date = new Date(baseDate);
  date.setHours(hours, Number(parsed[2]), 0, 0);
  return date;
}

// Floating local date/time for ICS (no trailing Z) - calendar apps read this as
// wall-clock time in whatever timezone the device/app is set to, which matches
// how match times are already shown everywhere else on the site.
function icsLocalStamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

// UTC stamp for the Google Calendar render URL, which requires either a "Z"
// suffixed UTC time or an all-day date. Converting through the same Date
// object keeps it consistent with the ICS version above.
function icsUtcStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

function escapeIcsText(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/**
 * Turns a match/activity row into a calendar event descriptor.
 * Returns null when there isn't a usable date to anchor the event to.
 */
export function matchToCalendarEvent(match, data = {}, teamNames = {}) {
  if (!match?.date) return null;
  const base = new Date(`${match.date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;

  const [startRaw, endRaw] = String(match.time || "").split(/\s+(?:-|to|\u2013)\s+/i);
  const start = parseClockToDate(base, startRaw) || (() => {
    const fallback = new Date(base);
    fallback.setHours(9, 0, 0, 0);
    return fallback;
  })();
  const parsedEnd = endRaw ? parseClockToDate(base, endRaw) : null;
  const end = parsedEnd && parsedEnd > start ? parsedEnd : new Date(start.getTime() + 45 * 60000);

  const title = match.activityTitle || `${teamNames.home || match.homeTeamName || "Home team"} vs ${teamNames.away || match.awayTeamName || "Away team"}`;
  const location = [data.event?.venue, data.event?.address].filter(Boolean).join(", ");
  const description = match.activityTitle
    ? `${data.year || ""} ${match.division || "LSL"} activity: ${match.activityTitle}.`.trim()
    : `${data.year || ""} ${match.division || "LSL"} ${match.label || ""} - ${title}.`.replace(/\s+/g, " ").trim();

  return {
    uid: `${match.id || title}-${match.date}@lanternsoccerleague`,
    title,
    location,
    description,
    start,
    end,
  };
}

export function buildIcsCalendar(events = []) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lantern Soccer League//Schedule//EN", "CALSCALE:GREGORIAN"];
  events.filter(Boolean).forEach((event) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${icsLocalStamp(new Date())}`,
      `DTSTART:${icsLocalStamp(event.start)}`,
      `DTEND:${icsLocalStamp(event.end)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      event.location ? `LOCATION:${escapeIcsText(event.location)}` : "",
      event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : "",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

export function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsUtcStamp(event.start)}/${icsUtcStamp(event.end)}`,
    details: event.description || "",
    location: event.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsDataHref(events) {
  const content = buildIcsCalendar(events);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(content)}`;
}

// Detects whether the visitor is on an Apple device (iOS/iPadOS/macOS),
// where downloading an .ics file is treated as "add to Calendar" natively.
// Everyone else gets the Google Calendar web link instead. Either way, only
// one "Add to Calendar" action is ever shown - never both.
function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const isMac = /Macintosh/.test(ua);
  return isIOS || isIPadOS || isMac;
}

/**
 * Single "Add to Calendar" link for one event. Detects whether the visitor
 * is on an Apple device: Apple devices get an .ics download (opens directly
 * in Apple Calendar), everyone else gets a Google Calendar link. Only one
 * link is ever rendered, never both.
 */
export function renderCalendarButtons(event, { compact = false } = {}) {
  if (!event) return "";
  const filename = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  const apple = isApplePlatform();
  const label = apple ? "Add to Apple Calendar" : "Add to Google Calendar";
  const extraAttrs = apple ? `download="${escapeHTML(filename)}"` : `target="_blank" rel="noopener"`;
  const href = apple ? icsDataHref([event]) : googleCalendarUrl(event);
  return `
    <div class="calendar-add-row${compact ? " compact" : ""}">
      <a class="calendar-add-link ${apple ? "apple" : "google"}" href="${escapeHTML(href)}" ${extraAttrs} title="${escapeHTML(label)}">
        <span>${escapeHTML(label)}</span>
      </a>
    </div>
  `;
}

/**
 * "Add to Calendar" for a whole set of events (e.g. every real game on a
 * matchday) as a single .ics download. Google Calendar's URL scheme only
 * supports one event at a time, so the multi-game action is .ics-only -
 * that file still imports fine into Google Calendar, Apple Calendar, and
 * Outlook.
 */
export function renderCalendarDownloadButton(events, filename, label = "Add To Calendar") {
  const usable = events.filter(Boolean);
  if (!usable.length) return "";
  return `
    <a class="button calendar-download-button" href="${escapeHTML(icsDataHref(usable))}" download="${escapeHTML(filename)}">
      ${escapeHTML(label)}
    </a>
  `;
}
