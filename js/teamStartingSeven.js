const FORMATIONS = {
  "2-3-1": [
    { slot: "GK", x: 0.5, y: 0.87 },
    { slot: "LB", x: 0.27, y: 0.68 },
    { slot: "RB", x: 0.73, y: 0.68 },
    { slot: "LM", x: 0.18, y: 0.45 },
    { slot: "CM", x: 0.5, y: 0.47 },
    { slot: "RM", x: 0.82, y: 0.45 },
    { slot: "ST", x: 0.5, y: 0.23 },
  ],
  "3-2-1": [
    { slot: "GK", x: 0.5, y: 0.87 },
    { slot: "LB", x: 0.19, y: 0.68 },
    { slot: "CB", x: 0.5, y: 0.7 },
    { slot: "RB", x: 0.81, y: 0.68 },
    { slot: "LM", x: 0.31, y: 0.44 },
    { slot: "RM", x: 0.69, y: 0.44 },
    { slot: "ST", x: 0.5, y: 0.23 },
  ],
  "2-2-2": [
    { slot: "GK", x: 0.5, y: 0.87 },
    { slot: "LB", x: 0.27, y: 0.68 },
    { slot: "RB", x: 0.73, y: 0.68 },
    { slot: "LM", x: 0.29, y: 0.46 },
    { slot: "RM", x: 0.71, y: 0.46 },
    { slot: "LW", x: 0.31, y: 0.23 },
    { slot: "RW", x: 0.69, y: 0.23 },
  ],
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function resolveConfirmedStartingSeven(team = {}, season = "") {
  const lineup = team.starting7;
  if (!lineup || lineup.status !== "confirmed") return null;
  if (String(lineup.season || "") !== String(season)) return null;
  if (!lineup.source || !String(lineup.source).trim()) return null;
  if (!lineup.confirmedAt || !Number.isFinite(Date.parse(lineup.confirmedAt))) return null;

  const layout = FORMATIONS[lineup.formation];
  const roster = new Map((team.roster || []).filter((player) => player?.id).map((player) => [String(player.id), player]));
  const entries = Array.isArray(lineup.players) ? lineup.players : [];
  if (!layout || entries.length !== 7) return null;

  const playerIds = entries.map((entry) => String(entry?.playerId || ""));
  const slots = entries.map((entry) => String(entry?.slot || "").toUpperCase());
  if (new Set(playerIds).size !== 7 || new Set(slots).size !== 7) return null;
  if (playerIds.some((id) => !roster.has(id))) return null;
  if (layout.some((position) => !slots.includes(position.slot))) return null;

  const assignmentBySlot = new Map(entries.map((entry, index) => [slots[index], roster.get(playerIds[index])]));
  const players = layout.map((position) => ({ ...position, player: assignmentBySlot.get(position.slot) }));
  if (players.some((position) => !position.player)) return null;
  return {
    formation: lineup.formation,
    season: String(season),
    confirmedAt: String(lineup.confirmedAt),
    source: String(lineup.source).trim(),
    players,
  };
}

export function renderStartingSevenPanel(team = {}, season = "") {
  const lineup = resolveConfirmedStartingSeven(team, season);
  if (!lineup) {
    return '<section class="section-panel team-profile-panel starting-seven-panel" id="starting7" data-team-panel="starting7" hidden>' +
      '<div class="section-head"><div><span class="eyebrow">' + escapeHTML(season) + ' | ' + escapeHTML(team.division || "Division") + '</span>' +
      '<h2>Starting 7 Graphic</h2><p>Formation graphic with verified player names, available jersey numbers, and photos or initials.</p></div></div>' +
      '<div class="starting-seven-empty" role="status"><span class="starting-seven-empty-mark" aria-hidden="true">7</span><div>' +
      '<h3>No confirmed Starting 7 recorded</h3><p>' + escapeHTML(team.name || "This team") + ' ' + escapeHTML(season) +
      ' has a published roster, but no confirmed matchday lineup. A roster is not treated as a starting lineup.</p></div></div>' +
      '<button class="button secondary starting-seven-download-disabled" type="button" disabled aria-disabled="true">Graphic unavailable</button>' +
      '<p class="starting-seven-integrity-note">The graphic will be enabled when a confirmed seven-player lineup is recorded for this season. Unconfirmed selections will never be presented as official.</p></section>';
  }

  const accessiblePlayers = lineup.players.map(({ slot, player }) =>
    '<li><span>' + escapeHTML(slot) + '</span><strong>' + escapeHTML(player.jersey ? '#' + player.jersey : 'Number not listed') +
    '</strong><a href="./player.html?id=' + encodeURIComponent(player.id) + '">' + escapeHTML(player.name || 'Player') + '</a></li>'
  ).join("");

  return '<section class="section-panel team-profile-panel starting-seven-panel" id="starting7" data-team-panel="starting7" hidden>' +
    '<div class="section-head"><div><span class="eyebrow">' + escapeHTML(season) + ' | ' + escapeHTML(team.division || "Division") +
    '</span><h2>Starting 7 Graphic</h2><p>Formation graphic with verified player names, available jersey numbers, and photos or initials.</p></div>' +
    '<span class="starting-seven-confirmed"><span aria-hidden="true"></span> Confirmed lineup</span></div>' +
    '<div class="starting-seven-preview"><canvas class="starting-seven-canvas" id="starting-seven-canvas" width="1200" height="900" role="img" aria-label="' +
    escapeHTML(team.name) + ' confirmed Starting 7, ' + escapeHTML(lineup.formation) + ' formation"></canvas>' +
    '<div class="starting-seven-preview-foot"><span><strong>' + escapeHTML(lineup.formation) + '</strong> formation</span><span>Confirmed ' +
    escapeHTML(lineup.confirmedAt.slice(0, 10)) + ' | ' + escapeHTML(lineup.source) + '</span></div></div>' +
    '<ol class="starting-seven-accessible-list">' + accessiblePlayers + '</ol>' +
    '<div class="starting-seven-actions"><button class="button primary" type="button" id="starting-seven-download" disabled>Download PNG</button>' +
    '<button class="button secondary" type="button" id="starting-seven-share" disabled>Share graphic</button><p id="starting-seven-feedback" aria-live="polite"></p></div></section>';
}

function loadImage(path) {
  if (!path) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    try {
      const url = new URL(path, window.location.href);
      if (url.origin !== window.location.origin) image.crossOrigin = "anonymous";
      image.src = url.href;
    } catch {
      resolve(null);
    }
  });
}

function drawPhoto(ctx, image, x, y, radius, player) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    const side = Math.min(image.width, image.height);
    const sx = (image.width - side) / 2;
    const sy = (image.height - side) / 2;
    ctx.drawImage(image, sx, sy, side, side, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = "#1b5630";
    ctx.fill();
    const playerInitials = String(player.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    ctx.fillStyle = "#f5f5f2";
    ctx.font = "800 31px system-ui, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(playerInitials, x, y);
  }
  ctx.restore();
}

function drawGraphic(canvas, team, lineup, images) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#252725";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d1b166";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(18, 18, width - 36, height - 36, 28);
  ctx.stroke();

  ctx.fillStyle = "#d1b166";
  ctx.font = "800 22px system-ui, 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("LANTERN SOCCER LEAGUE  |  CONFIRMED STARTING 7", 58, 65);
  ctx.fillStyle = "#f5f5f2";
  let titleSize = 42;
  ctx.font = "900 " + titleSize + "px system-ui, 'Segoe UI', sans-serif";
  while (ctx.measureText(team.name || "Team").width > 780 && titleSize > 26) {
    titleSize -= 2;
    ctx.font = "900 " + titleSize + "px system-ui, 'Segoe UI', sans-serif";
  }
  ctx.fillText(team.name || "Team", 58, 118);
  ctx.textAlign = "right";
  ctx.beginPath();
  ctx.roundRect(960, 76, 180, 58, 15);
  ctx.fillStyle = "#303230";
  ctx.fill();
  ctx.strokeStyle = "#d1b166";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#e1c783";
  ctx.font = "800 25px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText(lineup.formation, 1120, 112);

  const field = { x: 58, y: 162, w: 1084, h: 650 };
  ctx.beginPath();
  ctx.roundRect(field.x, field.y, field.w, field.h, 20);
  ctx.fillStyle = "#113d25";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(field.x, field.y, field.w, field.h, 20);
  ctx.clip();
  for (let index = 0; index < 8; index += 1) {
    if (index % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fillRect(field.x + index * field.w / 8, field.y, field.w / 8, field.h);
    }
  }
  ctx.strokeStyle = "rgba(236, 243, 235, 0.65)";
  ctx.lineWidth = 3;
  ctx.strokeRect(field.x + 16, field.y + 16, field.w - 32, field.h - 32);
  ctx.beginPath();
  ctx.moveTo(field.x + 16, field.y + field.h / 2);
  ctx.lineTo(field.x + field.w - 16, field.y + field.h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, field.y + field.h / 2, 72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(width / 2 - 155, field.y + 16, 310, 115);
  ctx.strokeRect(width / 2 - 155, field.y + field.h - 131, 310, 115);
  ctx.strokeRect(width / 2 - 70, field.y + 16, 140, 36);
  ctx.strokeRect(width / 2 - 70, field.y + field.h - 52, 140, 36);
  ctx.restore();

  const radius = 43;
  lineup.players.forEach(({ slot, x, y, player }) => {
    const px = field.x + x * field.w;
    const py = field.y + y * field.h;
    ctx.beginPath();
    ctx.arc(px, py, radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = "#252725";
    ctx.fill();
    ctx.strokeStyle = "#d1b166";
    ctx.lineWidth = 4;
    ctx.stroke();
    drawPhoto(ctx, images.get(player.id), px, py, radius, player);

    const jersey = player.jersey ? "#" + player.jersey : "NO #";
    ctx.font = "800 18px system-ui, 'Segoe UI', sans-serif";
    const jerseyWidth = Math.max(62, ctx.measureText(jersey).width + 22);
    ctx.beginPath();
    ctx.roundRect(px - jerseyWidth / 2, py - radius - 23, jerseyWidth, 31, 10);
    ctx.fillStyle = "#d1b166";
    ctx.fill();
    ctx.fillStyle = "#252725";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(jersey, px, py - radius - 8);

    const name = String(player.name || "Player");
    let nameSize = 19;
    ctx.font = "800 " + nameSize + "px system-ui, 'Segoe UI', sans-serif";
    while (ctx.measureText(name).width > 190 && nameSize > 14) {
      nameSize -= 1;
      ctx.font = "800 " + nameSize + "px system-ui, 'Segoe UI', sans-serif";
    }
    const labelWidth = Math.max(105, ctx.measureText(name).width + 20);
    ctx.beginPath();
    ctx.roundRect(px - labelWidth / 2, py + radius + 7, labelWidth, 31, 9);
    ctx.fillStyle = "#252725";
    ctx.fill();
    ctx.strokeStyle = "rgba(209,177,102,0.75)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#f5f5f2";
    ctx.fillText(name, px, py + radius + 23);
    ctx.fillStyle = "#e1c783";
    ctx.font = "800 15px system-ui, 'Segoe UI', sans-serif";
    ctx.fillText(slot, px, py + radius + 49);
  });

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#c0c3bf";
  ctx.font = "600 17px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText("Confirmed " + lineup.confirmedAt.slice(0, 10) + " | " + lineup.source, width - 58, height - 38);
  ctx.textAlign = "left";
}

export function setupStartingSevenGraphic(team = {}, season = "") {
  const lineup = resolveConfirmedStartingSeven(team, season);
  if (!lineup) return;
  const canvas = document.getElementById("starting-seven-canvas");
  if (!canvas) return;
  const feedback = document.getElementById("starting-seven-feedback");
  const downloadButton = document.getElementById("starting-seven-download");
  const shareButton = document.getElementById("starting-seven-share");
  canvas.setAttribute("aria-busy", "true");
  if (downloadButton) downloadButton.disabled = true;
  if (shareButton) shareButton.disabled = true;
  feedback.textContent = "Preparing confirmed lineup graphic...";
  const images = new Map();
  Promise.all(lineup.players.map(async ({ player }) => {
    images.set(player.id, await loadImage(player.photo));
  })).then(() => {
    drawGraphic(canvas, team, lineup, images);
    canvas.setAttribute("aria-busy", "false");
    if (downloadButton) downloadButton.disabled = false;
    if (shareButton) shareButton.disabled = false;
    feedback.textContent = "Graphic ready.";
  }).catch(() => {
    canvas.setAttribute("aria-busy", "false");
    feedback.textContent = "The confirmed lineup graphic could not be prepared.";
  });

  document.getElementById("starting-seven-download")?.addEventListener("click", () => {
    canvas.toBlob((blob) => {
      if (!blob) {
        feedback.textContent = "This graphic could not be created in the current browser.";
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = team.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + season + "-starting-7.png";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback.textContent = "Confirmed Starting 7 PNG downloaded.";
    }, "image/png");
  });

  document.getElementById("starting-seven-share")?.addEventListener("click", async () => {
    const url = new URL(window.location.href);
    url.hash = "starting7";
    try {
      if (navigator.share) {
        await navigator.share({
          title: team.name + " | Confirmed Starting 7",
          text: team.name + " confirmed " + season + " Starting 7 (" + lineup.formation + ").",
          url: url.href,
        });
        feedback.textContent = "Starting 7 link shared.";
      } else {
        await navigator.clipboard.writeText(url.href);
        feedback.textContent = "Starting 7 page link copied.";
      }
    } catch (error) {
      if (error?.name !== "AbortError") feedback.textContent = "Sharing is unavailable in this browser.";
    }
  });
}
