import { loadAllSeasons } from "./dataLoader.js?v=20261108-data3";
import { computeCombinedPlayerStats, computePlayerStats, getAwards, playerOVR } from "./leagueEngine.js?v=3.24-playoff-threshold";
import { setupLayout } from "./main.js?v=20261109-greenprimary1";
import { escapeHTML, getQueryParam, initials, setDocumentTitle, statusMessage, unique } from "./utils.js";

setupLayout("player-card-studio.html");

const root = document.getElementById("page-root");

function clean(value, fallback = "Not recorded") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isGoalkeeperOnly(position = "") {
  const text = String(position);
  const keeper = /goalkeeper|goalie|\bgk\b/i.test(text);
  const field = /field|forward|defender|midfielder|striker|winger/i.test(text);
  return keeper && !field;
}

function makePlayerCardRows(seasons) {
  const players = computeCombinedPlayerStats(seasons, { stage: "all" });
  const awards = getAwards(seasons, { season: "All", division: "All" });
  const careerByPlayer = new Map();
  seasons.forEach((data) => {
    computePlayerStats(data, { stage: "all" }).forEach((row) => {
      if (!careerByPlayer.has(row.id)) careerByPlayer.set(row.id, []);
      careerByPlayer.get(row.id).push({
        year: data.year,
        team: unique([row.previousTeamName, row.teamName]).join(" / ") || "Unassigned",
        jersey: row.jersey || "",
      });
    });
  });
  return players.map((player) => {
    const latest = (careerByPlayer.get(player.id) || [])
      .filter((row) => Number(row.year) <= 2026)
      .sort((a, b) => Number(b.year) - Number(a.year))[0];
    const playerAwards = awards
      .filter((award) => award.playerId === player.id)
      .map((award) => clean(award.category, "Award") + " | " + clean(award.season));
    const storedAchievements = (player.achievements || []).map((achievement) => String(achievement).trim()).filter(Boolean);
    return {
      ...player,
      latestSeason: latest?.year || "",
      latestTeam: latest?.team || "",
      latestJersey: latest?.jersey || player.jersey || "",
      honors: unique([...playerAwards, ...storedAchievements]),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function roundedRect(ctx, x, y, width, height, radius, fill, stroke, lineWidth = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function fitText(ctx, text, maxWidth, fontSize, weight = 800) {
  let size = fontSize;
  ctx.font = weight + " " + size + "px system-ui, 'Segoe UI', sans-serif";
  while (ctx.measureText(text).width > maxWidth && size > 24) {
    size -= 2;
    ctx.font = weight + " " + size + "px system-ui, 'Segoe UI', sans-serif";
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const attempt = line ? line + " " + word : word;
    if (line && ctx.measureText(attempt).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = attempt;
    }
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((entry, index) => {
    const isLast = index === maxLines - 1 && lines.length > maxLines;
    let visible = isLast ? entry.slice(0, Math.max(8, entry.length - 3)) + "..." : entry;
    while (ctx.measureText(visible).width > maxWidth && visible.length > 12) {
      visible = visible.slice(0, -4).trimEnd() + "...";
    }
    ctx.fillText(visible, x, y + index * lineHeight);
  });
}

function loadPlayerImage(path) {
  if (!path) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    try {
      const source = new URL(path, window.location.href);
      if (source.origin !== window.location.origin) image.crossOrigin = "anonymous";
      image.src = source.href;
    } catch {
      resolve(null);
    }
  });
}

function drawCover(ctx, image, x, y, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 28);
  ctx.clip();
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
}

function renderCard(ctx, player, photo) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#252725";
  ctx.fillRect(0, 0, width, height);
  roundedRect(ctx, 20, 20, width - 40, height - 40, 40, "#303230", "#d1b166", 4);
  roundedRect(ctx, 22, 22, width - 44, 335, 38, "#0d4923", null);
  ctx.fillStyle = "#d1b166";
  ctx.fillRect(22, 350, width - 44, 7);

  ctx.fillStyle = "#e1c783";
  ctx.font = "800 27px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText("LANTERN SOCCER LEAGUE  /  PLAYER CARD", 72, 90);
  ctx.fillStyle = "#f5f5f2";
  fitText(ctx, player.name, 1030, 76, 900);
  ctx.fillText(player.name, 72, 190);
  ctx.fillStyle = "#c0c3bf";
  ctx.font = "600 28px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText(clean(player.position, "Position not recorded") + "  |  " + clean(player.division, "Division not recorded"), 76, 250);

  const portrait = { x: 72, y: 410, width: 430, height: 500 };
  roundedRect(ctx, portrait.x - 8, portrait.y - 8, portrait.width + 16, portrait.height + 16, 36, "#252725", "#d1b166", 3);
  if (photo) {
    drawCover(ctx, photo, portrait.x, portrait.y, portrait.width, portrait.height);
  } else {
    roundedRect(ctx, portrait.x, portrait.y, portrait.width, portrait.height, 28, "#1b5630", null);
    ctx.fillStyle = "#f5f5f2";
    ctx.textAlign = "center";
    fitText(ctx, initials(player.name), 360, 124, 900);
    ctx.fillText(initials(player.name), portrait.x + portrait.width / 2, portrait.y + portrait.height / 2 + 40);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = "#d1b166";
  ctx.font = "900 26px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText("JERSEY", 570, 445);
  ctx.fillStyle = "#f5f5f2";
  const jersey = player.latestJersey ? "#" + player.latestJersey : "Not listed";
  fitText(ctx, jersey, 520, 72, 900);
  ctx.fillText(jersey, 570, 525);
  roundedRect(ctx, 570, 585, 280, 190, 24, "#252725", "#484b48", 2);
  ctx.fillStyle = "#d1b166";
  ctx.font = "900 25px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText("LSL OVR", 600, 632);
  ctx.fillStyle = "#f5f5f2";
  ctx.font = "900 92px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText(String(player.ovr), 598, 732);

  ctx.fillStyle = "#d1b166";
  ctx.font = "900 25px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText("LATEST RECORDED CLUB  |  " + clean(player.latestSeason, "Season not listed"), 570, 838);
  ctx.fillStyle = "#f5f5f2";
  ctx.font = "800 37px system-ui, 'Segoe UI', sans-serif";
  wrapText(ctx, clean(player.latestTeam, "Club not recorded"), 570, 888, 520, 47, 2);

  const keeper = isGoalkeeperOnly(player.position);
  const goalieGames = Number(player.goalkeeperGames) || 0;
  const goalRate = Number(player.gamesPlayed) ? (Number(player.goals || 0) / Number(player.gamesPlayed)).toFixed(2) : "Not recorded";
  const gaa = goalieGames > 0 && Number.isFinite(player.goalsAgainstPerGame) ? Number(player.goalsAgainstPerGame).toFixed(2) : "Not recorded";
  const winLoss = (Number(player.wins) || 0) + "-" + (Number(player.ties) || 0) + "-" + (Number(player.losses) || 0);
  const statValues = keeper
    ? [["GOALIE GAMES", goalieGames || "Not recorded"], ["GAA", gaa], ["CLEAN SHEETS", Number.isFinite(player.cleanSheets) ? player.cleanSheets : "Not recorded"], ["W-T-L", winLoss]]
    : [["GAMES", player.gamesPlayed || 0], ["GOALS", player.goals || 0], ["GOALS / GAME", goalRate], ["W-T-L", winLoss]];
  const statX = 72;
  const statY = 980;
  const statGap = 16;
  const statWidth = (1056 - statGap * 3) / 4;
  statValues.forEach(([label, value], index) => {
    const x = statX + index * (statWidth + statGap);
    roundedRect(ctx, x, statY, statWidth, 150, 18, "#252725", "#484b48", 2);
    ctx.fillStyle = "#d1b166";
    ctx.font = "900 20px system-ui, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + statWidth / 2, statY + 43);
    ctx.fillStyle = "#f5f5f2";
    fitText(ctx, String(value), statWidth - 24, 48, 900);
    ctx.fillText(String(value), x + statWidth / 2, statY + 105);
    ctx.textAlign = "left";
  });

  roundedRect(ctx, 72, 1170, 1056, 235, 22, "#3a3c3a", "#484b48", 2);
  ctx.fillStyle = "#d1b166";
  ctx.font = "900 25px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText("HONORS & ACHIEVEMENTS", 105, 1220);
  ctx.fillStyle = "#f5f5f2";
  ctx.font = "600 25px system-ui, 'Segoe UI', sans-serif";
  const honors = player.honors.slice(0, 3);
  if (honors.length) {
    honors.forEach((honor, index) => wrapText(ctx, "- " + honor, 108, 1270 + index * 43, 980, 32, 1));
    if (player.honors.length > 3) {
      ctx.fillStyle = "#c0c3bf";
      ctx.font = "600 20px system-ui, 'Segoe UI', sans-serif";
      ctx.fillText("+ " + (player.honors.length - 3) + " more listed honor" + (player.honors.length === 4 ? "" : "s"), 108, 1390);
    }
  } else {
    ctx.fillStyle = "#c0c3bf";
    ctx.fillText("No verified honors recorded", 108, 1270);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = "#c0c3bf";
  ctx.font = "600 18px system-ui, 'Segoe UI', sans-serif";
  ctx.fillText("Verified LSL data through 2026", 1095, 1450);
  ctx.textAlign = "left";
}

function playerTranscript(player) {
  const keeper = isGoalkeeperOnly(player.position);
  const stats = keeper
    ? "Goalie games: " + (player.goalkeeperGames || "Not recorded") + "; goals-against average: " + (Number.isFinite(player.goalsAgainstPerGame) ? player.goalsAgainstPerGame.toFixed(2) : "Not recorded") + "; clean sheets: " + (Number.isFinite(player.cleanSheets) ? player.cleanSheets : "Not recorded") + "."
    : "Games: " + (player.gamesPlayed || 0) + "; goals: " + (player.goals || 0) + "; goals per game: " + (player.gamesPlayed ? (player.goals / player.gamesPlayed).toFixed(2) : "Not recorded") + ".";
  return player.name + ", " + clean(player.position, "position not recorded") + ". OVR " + player.ovr + ". Latest recorded club: " + clean(player.latestTeam) + " (" + clean(player.latestSeason) + "). " + stats + " Wins, ties, losses: " + (player.wins || 0) + "-" + (player.ties || 0) + "-" + (player.losses || 0) + ". Honors: " + (player.honors.join("; ") || "none recorded") + ".";
}

async function init() {
  root.innerHTML = '<section class="section-panel">' + statusMessage("loading", "Loading verified player records...") + "</section>";
  const seasons = await loadAllSeasons(["2024", "2025", "2026"], ["teams", "players", "matches", "awards"]);
  const players = makePlayerCardRows(seasons);
  if (!players.length) throw new Error("No player records were available.");

  const requestedId = getQueryParam("id");
  const initialId = players.some((player) => player.id === requestedId) ? requestedId : players[0].id;
  setDocumentTitle("Player Card Studio");
  root.innerHTML = [
    '<section class="player-card-studio">',
    '<header class="card-studio-heading"><div><span class="eyebrow">LSL Player Card Studio</span><h1>Build a player card</h1><p>Make a shareable card from recorded LSL career stats, awards, OVR and available player photos.</p></div><a class="button secondary card-studio-back" href="./players.html">Players</a></header>',
    '<div class="card-studio-layout">',
    '<section class="card-studio-controls" aria-label="Player card controls">',
    '<div><label for="card-player-search">Find a player</label><input id="card-player-search" type="search" placeholder="Search name, position or club" autocomplete="off"></div>',
    '<div><label for="card-player-select">Player</label><select id="card-player-select"></select></div>',
    '<div class="card-studio-actions"><button class="button primary" type="button" id="card-download">Download PNG</button><button class="button secondary" type="button" id="card-share">Share card</button><button class="button secondary" type="button" id="card-copy-link">Copy link</button></div>',
    '<p class="card-studio-source">Stats and honors use recorded LSL data from 2024-2026. 2027 projections are not included. Missing goalkeeper or photo data stays unfilled.</p>',
    '<p class="card-studio-feedback" id="card-studio-feedback" aria-live="polite"></p>',
    '</section>',
    '<section class="card-studio-preview-panel" aria-label="Player card preview"><canvas class="card-studio-canvas" id="player-card-canvas" width="1200" height="1500" role="img"></canvas><div class="card-studio-transcript" id="card-studio-transcript" aria-live="polite"></div></section>',
    '</div></section>',
  ].join("");

  const select = document.getElementById("card-player-select");
  const search = document.getElementById("card-player-search");
  const canvas = document.getElementById("player-card-canvas");
  const ctx = canvas.getContext("2d");
  const feedback = document.getElementById("card-studio-feedback");
  const transcript = document.getElementById("card-studio-transcript");
  const ratedPlayers = new Map();
  let renderToken = 0;

  select.innerHTML = players.map((player) => '<option value="' + escapeHTML(player.id) + '">' + escapeHTML(player.name) + " - " + escapeHTML(player.position || "Position not recorded") + "</option>").join("");
  select.value = initialId;

  async function updateCard() {
    const record = players.find((item) => item.id === select.value);
    if (!record) return;
    let player = ratedPlayers.get(record.id);
    if (!player) {
      player = { ...record, ovr: playerOVR(record, players) };
      ratedPlayers.set(record.id, player);
    }
    const token = ++renderToken;
    feedback.textContent = "";
    const photo = await loadPlayerImage(player.photo);
    if (token !== renderToken) return;
    renderCard(ctx, player, photo);
    canvas.setAttribute("aria-label", "LSL player card for " + player.name + ". " + playerTranscript(player));
    transcript.innerHTML = "<h2>" + escapeHTML(player.name) + "</h2><p>" + escapeHTML(playerTranscript(player)) + "</p>";
    const url = new URL(window.location.href);
    url.searchParams.set("id", player.id);
    window.history.replaceState({}, "", url);
  }

  search.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase();
    [...select.options].forEach((option) => {
      const player = players.find((item) => item.id === option.value);
      const searchText = [player.name, player.position || "", player.latestTeam || ""].join(" ").toLocaleLowerCase();
      option.hidden = Boolean(query) && !searchText.includes(query);
    });
    if (select.selectedOptions[0]?.hidden) {
      const next = [...select.options].find((option) => !option.hidden);
      if (next) {
        select.value = next.value;
        updateCard();
      }
    }
  });
  select.addEventListener("change", updateCard);

  document.getElementById("card-download").addEventListener("click", () => {
    const player = players.find((item) => item.id === select.value);
    if (!player) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        feedback.textContent = "The card image could not be created in this browser.";
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-lsl-player-card.png";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      feedback.textContent = "Player card PNG downloaded.";
    }, "image/png");
  });

  async function copyShareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("id", select.value);
    await navigator.clipboard.writeText(url.href);
    feedback.textContent = "Share link copied.";
  }
  document.getElementById("card-copy-link").addEventListener("click", async () => {
    try {
      await copyShareLink();
    } catch {
      feedback.textContent = "Copying is unavailable in this browser. Use the address bar link for this player.";
    }
  });
  document.getElementById("card-share").addEventListener("click", async () => {
    try {
      const player = players.find((item) => item.id === select.value);
      const url = new URL(window.location.href);
      url.searchParams.set("id", select.value);
      if (navigator.share) {
        await navigator.share({ title: player.name + " | LSL Player Card", text: "View this LSL player card.", url: url.href });
        feedback.textContent = "Player card shared.";
      } else {
        await copyShareLink();
      }
    } catch (error) {
      if (error?.name !== "AbortError") feedback.textContent = "Sharing is unavailable. Use Copy link instead.";
    }
  });

  await updateCard();
}

init().catch((error) => {
  console.error("Could not load the player card studio", error);
  root.innerHTML = '<section class="section-panel">' + statusMessage("error", "Player Card Studio could not load its verified records. Please try again.") + "</section>";
});
