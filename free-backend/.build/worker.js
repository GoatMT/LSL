var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// firebase-rest.js
var enc = new TextEncoder();
var b64 = /* @__PURE__ */ __name((value) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"), "b64");
var json64 = /* @__PURE__ */ __name((value) => b64(enc.encode(JSON.stringify(value))), "json64");
var fail = /* @__PURE__ */ __name((code, message) => Object.assign(new Error(message), { code }), "fail");
function encodeValue(value) {
  if (value === null || value === void 0) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw fail("invalid-argument", "Non-finite database value.");
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(value) } };
}
__name(encodeValue, "encodeValue");
var encodeFields = /* @__PURE__ */ __name((value) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== void 0).map(([k, v]) => [k, encodeValue(v)])), "encodeFields");
function decodeValue(v) {
  if ("nullValue" in v) return null;
  for (const key of ["stringValue", "booleanValue", "referenceValue", "timestampValue"]) if (key in v) return v[key];
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if (v.arrayValue) return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue) return decodeFields(v.mapValue.fields || {});
  return null;
}
__name(decodeValue, "decodeValue");
var decodeFields = /* @__PURE__ */ __name((fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)])), "decodeFields");
var fieldPath = /* @__PURE__ */ __name((key) => key === "__name__" ? key : key.split(".").map((k) => "`" + k.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`").join("."), "fieldPath");
function expanded(data) {
  const root = {};
  for (const [path, value] of Object.entries(data)) {
    const keys = path.split(".");
    let parent = root;
    for (const key of keys.slice(0, -1)) parent = parent[key] ||= /* @__PURE__ */ Object.create(null);
    parent[keys.at(-1)] = value;
  }
  return root;
}
__name(expanded, "expanded");
var FirebaseRest = class {
  static {
    __name(this, "FirebaseRest");
  }
  constructor(env, transport = fetch) {
    this.env = env;
    this.fetch = transport.bind(globalThis);
    try {
      this.credentials = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || "{}");
    } catch {
      throw fail("failed-precondition", "The Firebase service-account secret is not valid JSON.");
    }
    if (!this.credentials.private_key || !this.credentials.client_email || this.credentials.project_id !== env.FIREBASE_PROJECT_ID) throw fail("failed-precondition", "Configure the Firebase service-account secret for this project.");
    this.database = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)`;
    this.documents = this.database + "/documents";
  }
  async signedJWT(payload) {
    if (!this.key) {
      const der = Uint8Array.from(atob(this.credentials.private_key.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
      this.key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    }
    const head = json64({ alg: "RS256", typ: "JWT" }) + "." + json64(payload);
    return head + "." + b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", this.key, enc.encode(head)));
  }
  async accessToken() {
    if (this.token && Date.now() < this.token.until) return this.token.value;
    if (this.tokenPending) return this.tokenPending;
    this.tokenPending = (async () => {
      const now = Math.floor(Date.now() / 1e3), assertion = await this.signedJWT({ iss: this.credentials.client_email, scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
      const response = await this.fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(12e3) }), data = await response.json();
      if (!response.ok || !data.access_token) throw fail("unavailable", "Firebase server credentials were rejected. Check the service account.");
      this.token = { value: data.access_token, until: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1e3 };
      return this.token.value;
    })();
    try {
      return await this.tokenPending;
    } finally {
      this.tokenPending = null;
    }
  }
  async request(path, body, method = "POST") {
    const response = await this.fetch("https://firestore.googleapis.com/v1/" + path, { method, headers: { Authorization: "Bearer " + await this.accessToken(), "Content-Type": "application/json" }, ...body === void 0 ? {} : { body: JSON.stringify(body) }, signal: AbortSignal.timeout(2e4) });
    const data = await response.json();
    if (!response.ok) {
      const status = data.error?.status || "UNAVAILABLE", code = status === "ALREADY_EXISTS" ? 6 : status.toLowerCase().replace(/_/g, "-");
      throw fail(code, status === "RESOURCE_EXHAUSTED" ? "The free Firebase quota is reached. Try again after it resets." : status === "NOT_FOUND" ? "Document not found." : "Firebase request failed (" + status + ").");
    }
    return data;
  }
  doc(path) {
    return new Document(this, path);
  }
  collection(path) {
    return new Query(this, path);
  }
  batch() {
    return new WriteBatch(this);
  }
  async runTransaction(fn) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { transaction } = await this.request(this.documents + ":beginTransaction", {}), batch = new WriteBatch(this, transaction);
      try {
        const result = await fn(batch);
        await batch.commit();
        return result;
      } catch (error2) {
        await this.request(this.documents + ":rollback", { transaction }).catch(() => {
        });
        if (error2.code !== "aborted" || attempt === 3) throw error2;
      }
    }
  }
  async createCustomToken(uid, claims) {
    const now = Math.floor(Date.now() / 1e3);
    return this.signedJWT({ iss: this.credentials.client_email, sub: this.credentials.client_email, aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: now, exp: now + 3600, uid, claims });
  }
  async verifyIdToken(token) {
    const url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(this.env.FIREBASE_API_KEY);
    const response = await this.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(12e3) }), data = await response.json();
    if (!response.ok || !data.users?.[0] || data.users[0].disabled) throw fail("unauthenticated", "Please sign in again.");
    let claims;
    try {
      claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    } catch {
      throw fail("unauthenticated", "Invalid session.");
    }
    const user = data.users[0];
    if (claims.sub !== user.localId || claims.aud !== this.env.FIREBASE_PROJECT_ID || claims.iss !== `https://securetoken.google.com/${this.env.FIREBASE_PROJECT_ID}` || claims.exp * 1e3 <= Date.now() || Number(user.validSince || 0) > claims.auth_time) throw fail("unauthenticated", "Your session expired. Please sign in again.");
    return { uid: user.localId, token: claims };
  }
  async adminAuth(action, body) {
    const response = await this.fetch(`https://identitytoolkit.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/accounts:${action}`, { method: "POST", headers: { Authorization: "Bearer " + await this.accessToken(), "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12e3) });
    if (!response.ok) throw fail("unavailable", "Could not update Firebase Authentication.");
  }
  revokeRefreshTokens(uid) {
    return this.adminAuth("update", { localId: uid, validSince: String(Math.floor(Date.now() / 1e3)) });
  }
  deleteUser(uid) {
    return this.adminAuth("delete", { localId: uid });
  }
};
var Document = class {
  static {
    __name(this, "Document");
  }
  constructor(db, path) {
    if (!path || path.split("/").length % 2 !== 0 || path.split("/").some((s) => !s || s === "." || s === "..")) throw fail("invalid-argument", "Invalid document path.");
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
    this.name = db.documents + "/" + path;
  }
  async get(transaction) {
    try {
      const raw = await this.db.request(this.name + (transaction ? "?transaction=" + encodeURIComponent(transaction) : ""), void 0, "GET");
      return { id: this.id, exists: true, data: /* @__PURE__ */ __name(() => decodeFields(raw.fields || {}), "data") };
    } catch (error2) {
      if (error2.code === "not-found") return { id: this.id, exists: false, data: /* @__PURE__ */ __name(() => void 0, "data") };
      throw error2;
    }
  }
  set(data) {
    return this.db.batch().set(this, data).commit();
  }
  create(data) {
    return this.db.batch().create(this, data).commit();
  }
  update(data) {
    return this.db.batch().update(this, data).commit();
  }
  delete() {
    return this.db.batch().delete(this).commit();
  }
  collection(name) {
    return this.db.collection(this.path + "/" + name);
  }
};
var WriteBatch = class {
  static {
    __name(this, "WriteBatch");
  }
  constructor(db, transaction) {
    this.db = db;
    this.transaction = transaction;
    this.writes = [];
  }
  get(ref) {
    return ref.get(this.transaction);
  }
  set(ref, data) {
    this.writes.push({ update: { name: ref.name, fields: encodeFields(data) } });
    return this;
  }
  create(ref, data) {
    this.set(ref, data);
    this.writes.at(-1).currentDocument = { exists: false };
    return this;
  }
  update(ref, data) {
    this.writes.push({ update: { name: ref.name, fields: encodeFields(expanded(data)) }, updateMask: { fieldPaths: Object.keys(data).map(fieldPath) }, currentDocument: { exists: true } });
    return this;
  }
  delete(ref) {
    this.writes.push({ delete: ref.name });
    return this;
  }
  commit() {
    return this.db.request(this.db.documents + ":commit", { writes: this.writes, ...this.transaction ? { transaction: this.transaction } : {} });
  }
};
var Query = class _Query {
  static {
    __name(this, "Query");
  }
  constructor(db, path, query = {}) {
    this.db = db;
    this.path = path;
    this.query = query;
  }
  doc(id) {
    return this.db.doc(this.path + "/" + id);
  }
  where(field, op, value) {
    if (op !== "==") throw Error("Unsupported query operator");
    return new _Query(this.db, this.path, { ...this.query, where: { fieldFilter: { field: { fieldPath: fieldPath(field) }, op: "EQUAL", value: encodeValue(value) } } });
  }
  limit(n2) {
    return new _Query(this.db, this.path, { ...this.query, limit: n2 });
  }
  orderBy(field) {
    return new _Query(this.db, this.path, { ...this.query, orderBy: [{ field: { fieldPath: fieldPath(field) }, direction: "ASCENDING" }] });
  }
  async get() {
    const parts = this.path.split("/"), collectionId = parts.pop(), parent = this.db.documents + (parts.length ? "/" + parts.join("/") : "");
    const data = await this.db.request(parent + ":runQuery", { structuredQuery: { from: [{ collectionId }], ...this.query } });
    const docs = data.filter((d) => d.document).map(({ document: d }) => ({ id: d.name.split("/").at(-1), exists: true, data: /* @__PURE__ */ __name(() => decodeFields(d.fields || {}), "data") }));
    return { docs };
  }
};

// api.generated.js
import { randomInt, randomUUID, pbkdf2Sync, timingSafeEqual, createHash } from "node:crypto";

// ../functions/policy.js
var allowed = ["easy", "normal", "hard", "insane"];
var formations = ["2-2-2", "2-3-1", "3-2-1", "3-1-2", "1-3-2"];
function require2(condition, message) {
  if (!condition) throw Error(message);
}
__name(require2, "require");
function validateOptions(options = {}, catalog) {
  require2([1, 2, 3, 4, 5, 6].includes(Number(options.duration)), "Choose a match length from 1 to 6 minutes.");
  require2(allowed.includes(options.difficulty), "Choose a supported AI difficulty.");
  require2(catalog[String(options.season)]?.length >= 2, "This LSL season is unavailable.");
  return { duration: Number(options.duration), difficulty: options.difficulty, season: String(options.season), lighting: ["day", "evening", "night"].includes(options.lighting) ? options.lighting : "evening", weather: "clear", minorInjuries: true };
}
__name(validateOptions, "validateOptions");
function applyRoomAction(previous, uid, name, data, catalog, now) {
  const r = structuredClone(previous), host = r.host === uid, member = r.members.includes(uid), lobby = ["OPEN", "LOCKED", "FULL"].includes(r.status);
  require2(r.expiresAt > now, "This room has expired. Create a new room.");
  switch (data.action) {
    case "request":
      require2(r.status === "OPEN" && !member, "This room is not accepting join requests.");
      require2(Object.keys(r.requests).length < 20 || r.requests[uid], "The host has too many pending requests. Try later.");
      r.requests[uid] = { uid, name, status: "pending", at: now };
      break;
    case "accept":
    case "deny":
      require2(host && r.status === "OPEN", "Only the host of an open room can approve requests.");
      require2(r.requests[data.uid]?.status === "pending", "Join request no longer available.");
      require2(now - r.requests[data.uid].at < 3e5, "Join request expired.");
      r.requests[data.uid].status = data.action === "accept" ? "accepted" : "declined";
      if (data.action === "accept") {
        r.guest = data.uid;
        r.members = [r.host, data.uid];
        r.names[data.uid] = r.requests[data.uid].name;
        r.status = "FULL";
        r.ready = {};
      }
      break;
    case "lock":
      require2(host && r.status === "OPEN", "Only an open room can be locked.");
      r.status = "LOCKED";
      break;
    case "unlock":
      require2(host && r.status === "LOCKED", "Only the host can unlock this room.");
      r.status = "OPEN";
      break;
    case "choose": {
      require2(member && lobby, "Team selection is closed.");
      const team = catalog[r.options.season]?.find((t) => t.id === data.team);
      require2(team, "Team unavailable for this season.");
      require2(formations.includes(data.formation), "Choose a supported formation.");
      require2(!Object.entries(r.choices).some(([id, s]) => id !== uid && s.team === team.id), "Opponent already selected this team.");
      const lineup = data.lineup || team.lineup.map((p) => p.id);
      require2(Array.isArray(lineup) && lineup.length === 7 && new Set(lineup).size === 7 && lineup.every((id) => team.roster.some((p) => p.id === id)), "Choose seven players from this team.");
      r.choices[uid] = { team: team.id, name: team.name, formation: data.formation, lineup };
      r.ready = {};
      break;
    }
    case "ready":
      require2(member && r.status === "FULL" && r.choices[uid], "Select your team first.");
      r.ready[uid] = data.ready === true;
      break;
    case "start":
      require2(host && r.status === "FULL" && r.members.every((id) => r.ready[id] && r.choices[id]), "Both players must select teams and be ready.");
      r.status = "STARTING";
      r.connected = {};
      r.startedAt = now + 3e3;
      r.epoch = (r.epoch || 0) + 1;
      r.heartbeats = Object.fromEntries(r.members.map((id) => [id, now]));
      break;
    case "heartbeat":
      require2(member, "Room participant required.");
      r.heartbeats ||= {};
      r.heartbeats[uid] = now;
      break;
    case "reconnect":
      require2(host && ["STARTING", "LIVE", "CLOSE TO END"].includes(r.status), "Only the host can restart this match connection.");
      require2(!r.lastRestart || now - r.lastRestart > 4e3, "Reconnection is already running.");
      r.epoch++;
      r.connected = {};
      r.lastRestart = now;
      break;
    case "disconnect":
      require2(member && ["STARTING", "LIVE", "CLOSE TO END"].includes(r.status), "No active match to disconnect.");
      r.disconnectAt ||= now;
      break;
    case "connected":
      require2(member && ["STARTING", "LIVE", "CLOSE TO END"].includes(r.status), "Active match participant required.");
      r.connected ||= {};
      r.connected[uid] = true;
      if (r.members.every((id) => r.connected[id])) r.disconnectAt = null;
      if (r.members.length === 2 && r.members.every((id) => r.connected[id]) && !r.kickoffAt) {
        r.kickoffAt = now + 3e3;
        r.startedAt = r.kickoffAt;
      }
      break;
    case "timeout":
      require2(member && r.disconnectAt && now - r.disconnectAt >= 25e3, "Reconnection window is still open.");
      r.status = "FULL TIME";
      r.endedAt = now;
      r.expiresAt = now + 3e5;
      r.endReason = "Connection lost \u2014 match abandoned";
      r.verified = false;
      break;
    case "leave":
      require2(member && lobby, "Use End Match to leave an active match.");
      if (host) {
        r.status = "FULL TIME";
        r.endReason = "Room closed";
        r.expiresAt = now + 6e4;
      } else {
        delete r.choices[uid];
        delete r.names[uid];
        r.members = [r.host];
        r.guest = null;
        r.status = "OPEN";
        r.ready = {};
        r.requests = {};
      }
      break;
    case "abandon":
      require2(member && ["STARTING", "LIVE", "CLOSE TO END"].includes(r.status), "No active match.");
      r.status = "FULL TIME";
      r.endReason = name + " left the match";
      r.verified = false;
      r.endedAt = now;
      r.expiresAt = now + 3e5;
      break;
    default:
      throw Error("Unsupported room operation.");
  }
  r.updatedAt = now;
  return r;
}
__name(applyRoomAction, "applyRoomAction");
function personalReport(report, room, side, date) {
  const r = structuredClone(report), uid = room.members[side], opponent = room.members[1 - side];
  r.id = `h2h-${room.code}-${room.startedAt}`;
  r.ownerId = uid;
  r.accountName = room.names[uid];
  r.date = date;
  r.mode = "h2h";
  r.modeLabel = "Live Head to Head";
  r.verified = true;
  r.roomId = room.code;
  r.opponent = { type: "account", uid: opponent, accountName: room.names[opponent] };
  r.aiDifficulty = room.options.difficulty;
  r.competition = { name: "Live Head to Head", stage: "Private room" };
  if (side === 1) {
    r.teams.reverse();
    r.teamIds.reverse();
    r.score.reverse();
    [r.stats.user, r.stats.cpu] = [r.stats.cpu, r.stats.user];
    for (const key of ["startingLineups", "finalLineups", "startingFormations", "finalFormations"]) r[key] = { 0: r[key][1], 1: r[key][0] };
    for (const key of ["players", "goals", "substitutions", "injuries"]) for (const item of r[key] || []) item.team = 1 - item.team;
    if (r.playerOfMatch) r.playerOfMatch.team = 1 - r.playerOfMatch.team;
    for (const key of ["startingLineups", "finalLineups"]) for (const team of [0, 1]) for (const player of r[key][team]) player.team = team;
  }
  r.won = r.score[0] > r.score[1];
  r.tie = r.score[0] === r.score[1];
  return r;
}
__name(personalReport, "personalReport");

// ../functions/engine/match-options.js
var MATCH_DURATIONS = Object.freeze([1, 2, 3, 4, 5, 6]);
var matchDuration = /* @__PURE__ */ __name((value) => MATCH_DURATIONS.includes(Number(value)) ? Number(value) : 6, "matchDuration");

// ../functions/engine/config.js
var PITCH_SCALE = 2;
var PLAYER_VISUAL_SCALE = Object.freeze({ desktop: 1.48, compact: 1.72 });
var fieldUnits = /* @__PURE__ */ __name((value) => value * PITCH_SCALE, "fieldUnits");
var FIELD = Object.freeze({
  halfLength: fieldUnits(32),
  halfWidth: fieldUnits(21),
  goalHalf: fieldUnits(4.5),
  goalHeight: fieldUnits(3.2),
  goalDepth: fieldUnits(2),
  boxDepth: fieldUnits(10),
  boxHalf: fieldUnits(11),
  goalBoxDepth: fieldUnits(4),
  goalBoxHalf: fieldUnits(6),
  penaltyDistance: fieldUnits(8),
  centerRadius: fieldUnits(5),
  restartClearance: fieldUnits(6),
  ballRadius: 0.32,
  postRadius: 0.1,
  playerMargin: 1
});
var PLAY = Object.freeze({
  runSpeed: 7.3,
  sprintSpeed: 11.8,
  acceleration: 32,
  sprintAcceleration: 28,
  braking: 48,
  turnAcceleration: 78,
  turnRate: 14,
  sprintTurnRate: 11,
  groundDrag: 0.38,
  rollingResistance: 3,
  airDrag: 0.095,
  gravity: 16,
  bounceDamping: 0.22,
  stopSpeed: 0.24,
  passMin: 8,
  passMax: 46,
  shotBase: 30,
  shotPower: 19,
  supportGap: fieldUnits(3),
  pressureCover: fieldUnits(4),
  shootingRange: fieldUnits(17)
});
var DIFFICULTY = {
  easy: { reaction: 0.9, pressure: 0.58, accuracy: 0.6, keeper: 0.7, awareness: 0.45, shotRange: 25, coverGap: 6.5, diveLead: 0.42, kickoffShot: 0.025 },
  normal: { reaction: 0.46, pressure: 0.8, accuracy: 0.82, keeper: 0.86, awareness: 0.72, shotRange: 29, coverGap: 5.2, diveLead: 0.52, kickoffShot: 0.04 },
  hard: { reaction: 0.23, pressure: 0.96, accuracy: 0.95, keeper: 0.96, awareness: 0.91, shotRange: 34, coverGap: 4.3, diveLead: 0.62, kickoffShot: 0.055 },
  insane: { reaction: 0.1, pressure: 1, accuracy: 0.992, keeper: 1.03, awareness: 1, shotRange: 38, coverGap: 3.6, diveLead: 0.72, kickoffShot: 0.07 }
};
var FORMATION = Object.freeze([
  { role: "GK", x: -29, z: 0 },
  { role: "DEF", x: -19, z: -8 },
  { role: "DEF", x: -19, z: 8 },
  { role: "MID", x: -10, z: -12 },
  { role: "MID", x: -10, z: 12 },
  { role: "FWD", x: -3, z: -5 },
  { role: "FWD", x: -3, z: 5 }
].map((position) => Object.freeze({ ...position, x: fieldUnits(position.x), z: fieldUnits(position.z) })));
var clamp = /* @__PURE__ */ __name((v, a, b) => Math.max(a, Math.min(b, v)), "clamp");
var distance = /* @__PURE__ */ __name((a, b) => Math.hypot(a.x - b.x, a.z - b.z), "distance");
var normalize = /* @__PURE__ */ __name((x, z) => {
  const n2 = Math.hypot(x, z) || 1;
  return { x: x / n2, z: z / n2 };
}, "normalize");

// ../functions/engine/match/attributes.js
var styleText = /* @__PURE__ */ __name((data) => `${data?.playstyle?.label || ""} ${(data?.playstyle?.traits || []).join(" ")}`.toLowerCase(), "styleText");
function playerRatings(data = {}) {
  const overall = Number.isFinite(data.overall) ? clamp(data.overall, 50, 100) : 70;
  const quality = (overall - 50) / 50, style = styleText(data);
  const isGK = /goal|keeper/.test(data.position || data.role || "") || /goalkeeper/.test(style);
  const creator = /pass|creat|assist/.test(style), finisher = /finish|scor|goal/.test(style), anchor = /defen|tackle|mark|anchor/.test(style);
  const name = String(data.name || "").toLowerCase();
  const speed = name.includes("muhummud teli") || name.includes("muhammad teli") ? 100 : Math.round(clamp(62 + quality * 31 + (finisher ? 2 : 0), 55, 99));
  const ratings = { speed, shooting: Math.round(clamp(58 + quality * 34 + (finisher ? 6 : 0), 50, 99)), passing: Math.round(clamp(57 + quality * 34 + (creator ? 7 : 0), 50, 99)), dribbling: Math.round(clamp(59 + quality * 32 + (creator || finisher ? 4 : 0), 50, 99)), defending: Math.round(clamp(54 + quality * 33 + (anchor ? 8 : 0), 45, 99)), stamina: Math.round(clamp(64 + quality * 28 + (speed > 90 ? 4 : 0), 55, 99)), goalkeeping: isGK ? Math.round(clamp(62 + quality * 35, 55, 99)) : Math.round(clamp(35 + quality * 30, 25, 75)) };
  return Object.freeze(ratings);
}
__name(playerRatings, "playerRatings");
function playerAttributes(data = {}) {
  const quality = Number.isFinite(data.overall) ? clamp((data.overall - 50) / 49, 0, 1) : 0.5;
  const style = data.playstyle?.label || "";
  const finisher = ["Elite Finisher", "Goal-First Attacker"].includes(style);
  return Object.freeze({
    ratings: playerRatings(data),
    speed: 0.97 + quality * 0.06,
    shotPower: 0.97 + quality * 0.06,
    shotError: 1.2 - quality * 0.4 - (finisher ? 0.1 : 0),
    passLead: style === "Creator" ? 1.15 : 1,
    forwardRun: finisher ? 1.1 : 1,
    defending: style === "Defensive Anchor" ? 1.12 : 1,
    keeper: 0.94 + quality * 0.12,
    dribble: clamp(0.4 + quality * 0.45 + (style === "Creator" ? 0.08 : 0), 0.4, 0.94)
  });
}
__name(playerAttributes, "playerAttributes");

// ../functions/engine/match/shooting.js
function preferredFoot(data) {
  const value = String(data.dominantFoot || data.preferredFoot || data.foot || "").toLowerCase();
  if (["left", "l", "right", "r", "both"].includes(value)) return { foot: value === "l" ? "left" : value === "r" ? "right" : value, source: "roster" };
  return { foot: "right", source: "game-default" };
}
__name(preferredFoot, "preferredFoot");
function contactFoot(p, ball) {
  const lateral = (ball.x - p.x) * p.faceZ - (ball.z - p.z) * p.faceX;
  return Math.abs(lateral) > 0.12 ? lateral > 0 ? "right" : "left" : p.touchFoot || (p.dominantFoot === "left" ? "left" : "right");
}
__name(contactFoot, "contactFoot");
function shotTechnique(p, ball, target, { power = 0.5, curve = false, header = false, firstTime = false } = {}) {
  const foot = contactFoot(p, ball), side = foot === "right" ? 1 : -1, goal = normalize(target.x - p.x, target.z - p.z);
  const alignment = p.faceX * goal.x + p.faceZ * goal.z, turn = p.faceX * goal.z - p.faceZ * goal.x;
  const weak = p.dominantFoot !== "both" && foot !== p.dominantFoot;
  const lateral = (ball.x - p.x) * p.faceZ - (ball.z - p.z) * p.faceX;
  const outside = alignment > -0.35 && (turn * side < (weak ? -0.3 : -0.1) || alignment < 0.6 && turn * side < 0 || Math.abs(lateral) > 0.45 && turn * side < -0.03);
  const kind = header ? "header" : firstTime && ball.y > 1.1 ? "volley" : firstTime && ball.y > 0.5 && ball.vy > 0 ? "half-volley" : curve ? outside ? "trivela-shot" : "finesse-shot" : firstTime ? "first-shot" : power > 0.78 ? "power-shot" : power < 0.4 ? "driven-shot" : "shot";
  return { kind, foot, side, weak, alignment, spin: kind === "finesse-shot" ? side * 12 : kind === "trivela-shot" ? -side * 16 : 0 };
}
__name(shotTechnique, "shotTechnique");
function flightDuration(distance2, speed) {
  return -Math.log(Math.max(0.08, 1 - PLAY.airDrag * distance2 / speed)) / PLAY.airDrag;
}
__name(flightDuration, "flightDuration");
function planShot(p, ball, target, { power = 0.5, curve = false, header = false, firstTime = false, accuracySpread = 3, random = Math.random } = {}) {
  power = clamp(power, 0, 1);
  const technique = shotTechnique(p, ball, target, { power, curve, header, firstTime });
  const dx = target.x - p.x, dz = target.z - p.z, close = Math.abs(dx) < 16;
  const poorAngle = clamp(Math.abs(dz) / Math.max(4, Math.abs(dx)), 0, 1), closed = clamp(1 - technique.alignment, 0, 1);
  const sprint = p.boosting || Math.hypot(p.vx, p.vz) > PLAY.runSpeed * 1.12 ? 1 : 0, overcharge = clamp((power - 0.78) / 0.205, 0, 1), max = power >= 0.985;
  const skyRisk = header ? 0 : max ? clamp(0.6 + 0.2 * sprint + 0.18 * poorAngle + 0.1 * closed + (technique.weak ? 0.06 : 0), 0, 0.98) : overcharge * (0.025 + 0.075 * sprint + 0.06 * poorAngle + 0.04 * closed);
  const skied = random() < skyRisk;
  const placement = technique.spin ? 0.55 : 1;
  const error2 = (random() - 0.5) * accuracySpread * (p.attributes?.shotError ?? 1) * placement * (0.45 + power * 0.65 + overcharge * (2 + sprint + poorAngle));
  const aimed = { x: target.x, z: target.z + error2 }, n2 = normalize(aimed.x - p.x, aimed.z - p.z);
  const speed = (header ? 25 + power * 8 : ((close ? PLAY.shotBase - 5 : PLAY.shotBase) + power * PLAY.shotPower) * (p.attributes?.shotPower ?? 1)) * (technique.kind === "finesse-shot" ? 0.84 : technique.kind === "trivela-shot" ? 0.9 : 1);
  const height = header ? 1.95 : firstTime ? Math.min(ball.y, 2.2) : FIELD.ballRadius + 0.04;
  const travel = Math.max(0.7, Math.hypot(dx, aimed.z - p.z) - 0.8), duration = flightDuration(travel, speed);
  let lift = header ? 1 : technique.kind === "driven-shot" ? 0.7 : (close ? 1.7 : 2.5) + power * 2;
  if (technique.spin) lift = clamp((1.2 + power * 0.9 - height + 0.5 * PLAY.gravity * duration * duration) / duration, 2, 20);
  if (skied) lift = (FIELD.goalHeight + 2 + random() * 3 - height + 0.5 * PLAY.gravity * duration * duration) / duration;
  const launchAngle = -technique.spin * 0.018 * duration * 0.46, cos = Math.cos(launchAngle), sin = Math.sin(launchAngle);
  return {
    ...technique,
    power,
    max,
    skyRisk,
    skied,
    speed,
    lift,
    height,
    target: aimed,
    direction: { x: n2.x * cos - n2.z * sin, z: n2.x * sin + n2.z * cos }
  };
}
__name(planShot, "planShot");

// ../functions/engine/match/player.js
var angleDelta = /* @__PURE__ */ __name((from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from)), "angleDelta");
var Player = class {
  static {
    __name(this, "Player");
  }
  constructor(data, team, slot, direction, formation = FORMATION) {
    this.formation = formation?.length === 7 ? formation : FORMATION;
    Object.assign(this, {
      data: { ...data },
      team,
      slot,
      role: this.formation[slot]?.role || FORMATION[slot].role,
      id: data.id,
      name: data.name,
      jersey: data.jersey,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      faceX: direction,
      faceZ: 0,
      cooldown: 0,
      skill: 0,
      animation: "idle",
      animationTime: 0,
      sentOff: false,
      yellow: 0,
      decision: 0,
      holdTime: 0,
      goals: 0,
      assists: 0,
      shots: 0,
      onTarget: 0,
      passes: 0,
      tackles: 0,
      saves: 0,
      involvement: 0,
      gait: 0,
      turn: 0,
      acceleration: 0,
      lookX: direction,
      lookZ: 0,
      locomotion: "idle",
      boosting: false,
      action: null,
      skillPlan: null,
      lastSkill: null,
      keeperState: {},
      lastReceive: -10,
      dribbleX: direction,
      dribbleZ: 0
    });
    const preference = preferredFoot(data);
    this.dominantFoot = preference.foot;
    this.footSource = preference.source;
    this.touchFoot = preference.foot === "left" ? "left" : "right";
    this.attributes = playerAttributes(data);
    this.ratings = playerRatings(data);
    this.reset(direction);
  }
  reset(direction) {
    const h = this.formation[this.slot] || FORMATION[this.slot];
    this.x = h.x * direction;
    this.z = h.z;
    this.vx = this.vz = 0;
    this.faceX = direction;
    this.faceZ = 0;
    this.lookX = direction;
    this.lookZ = 0;
    this.cooldown = 0.35;
    this.action = null;
    this.skillPlan = null;
    this.skill = 0;
    this.animationTime = 0;
    this.animation = this.role === "GK" ? "ready" : "idle";
    this.locomotion = "idle";
    this.keeperState = {};
    this.gait = 0;
    this.hasBall = false;
    this.striking = false;
    this.aiTarget = null;
    this.cutTime = 0;
    this.receivedFrom = null;
  }
  move(dx, dz, intensity, dt, sprint = false, facing = null) {
    if (this.striking) {
      dx = dz = intensity = 0;
      sprint = false;
    }
    const n2 = normalize(dx, dz), moving = Math.hypot(dx, dz) > 0.03 && intensity > 0.01, previousSpeed = Math.hypot(this.vx, this.vz);
    if (moving) {
      this.dribbleX = n2.x;
      this.dribbleZ = n2.z;
    }
    const recovering = this.action && ["fall", "roll-fall", "slide-tackle", "get-up", "keeper-get-up", "keeper-dive"].includes(this.action.name);
    const boosting = sprint && moving && !recovering;
    const settling = this.hasBall && this.lastReceive < 0.24 ? 0.74 : 1;
    const injuryPenalty = this.injured ? 0.72 : 1;
    const speed = (boosting ? PLAY.sprintSpeed : PLAY.runSpeed) * this.attributes.speed * clamp(intensity, 0, 1) * settling * injuryPenalty;
    let tx = moving ? n2.x * speed : 0, tz = moving ? n2.z * speed : 0;
    if (this.skillPlan) {
      const envelope = Math.sin(Math.PI * clamp(this.skillPlan.time / this.skillPlan.duration, 0, 1));
      tx += this.skillPlan.x * this.skillPlan.burst * envelope;
      tz += this.skillPlan.z * this.skillPlan.burst * envelope;
    }
    if (recovering) {
      tx = this.vx * (this.action.name === "slide-tackle" ? 0.92 : 0.25);
      tz = this.vz * (this.action.name === "slide-tackle" ? 0.92 : 0.25);
    }
    const alignment = previousSpeed > 0.1 ? (this.vx * n2.x + this.vz * n2.z) / previousSpeed : 1;
    this.cutTime = moving && alignment < 0.65 ? 0.23 : Math.max(0, (this.cutTime || 0) - dt);
    const control = this.hasBall ? 0.86 + this.attributes.dribble * 0.72 : 1;
    const rate = (!moving ? PLAY.braking : this.cutTime > 0 ? PLAY.turnAcceleration : boosting ? PLAY.sprintAcceleration : PLAY.acceleration) * control;
    const dv = Math.hypot(tx - this.vx, tz - this.vz), step = Math.min(1, rate * dt / (dv || 1));
    this.vx += (tx - this.vx) * step;
    this.vz += (tz - this.vz) * step;
    this.x = clamp(this.x + this.vx * dt, -FIELD.halfLength - FIELD.playerMargin, FIELD.halfLength + FIELD.playerMargin);
    this.z = clamp(this.z + this.vz * dt, -FIELD.halfWidth - FIELD.playerMargin, FIELD.halfWidth + FIELD.playerMargin);
    const actualSpeed = Math.hypot(this.vx, this.vz), oldAngle = Math.atan2(this.faceX, this.faceZ);
    let desired = facing ? normalize(facing.x - this.x, facing.z - this.z) : moving ? n2 : { x: this.faceX, z: this.faceZ };
    if (this.action?.context?.aim && this.action.time < this.action.duration * 0.6) desired = this.action.context.aim;
    const delta = angleDelta(oldAngle, Math.atan2(desired.x, desired.z)), turnRate = (boosting ? PLAY.sprintTurnRate : PLAY.turnRate) * control, angle = oldAngle + clamp(delta, -turnRate * dt, turnRate * dt);
    this.faceX = Math.sin(angle);
    this.faceZ = Math.cos(angle);
    this.turn += (delta - this.turn) * (1 - Math.exp(-9 * dt));
    this.acceleration = (actualSpeed - previousSpeed) / Math.max(dt, 1e-3);
    this.gait += actualSpeed * dt * (boosting ? 1.9 : 2.4);
    const dot2 = (this.vx * this.faceX + this.vz * this.faceZ) / (actualSpeed || 1);
    this.locomotion = actualSpeed < 0.15 ? "idle" : facing && dot2 < -0.45 ? "backpedal" : facing && Math.abs(dot2) < 0.55 ? "sidestep" : boosting ? "sprint" : actualSpeed < 2.4 ? "walk" : actualSpeed < 5 ? "jog" : "run";
    if (boosting && !this.boosting && !this.action) this.animate("sprint-start", 0.32);
    this.boosting = boosting;
    if (!this.action) this.animation = this.role === "GK" && actualSpeed < 0.2 ? "ready" : this.locomotion;
  }
  watch(point) {
    const d = normalize(point.x - this.x, point.z - this.z);
    this.lookX = d.x;
    this.lookZ = d.z;
  }
  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.skill = Math.max(0, this.skill - dt);
    this.decision -= dt;
    this.lastReceive += dt;
    this.footTouch = Math.max(0, (this.footTouch || 0) - dt);
    if (this.skillPlan) {
      this.skillPlan.time -= dt;
      if (this.skillPlan.time <= 0) this.skillPlan = null;
    }
    if (this.action) {
      this.action.time += dt;
      this.animationTime = Math.max(0, this.action.duration - this.action.time);
      if (this.animationTime <= 0) {
        const { name, context } = this.action;
        this.action = null;
        if (["fall", "roll-fall", "slide-tackle"].includes(name)) this.animate("get-up", 0.65, context);
        else if (name === "keeper-dive") this.animate("keeper-get-up", 0.85, context);
        else if (name === "stumble") this.animate("recover", 0.35);
      }
    }
  }
  animate(name, time = 0.45, context = {}) {
    this.animation = name;
    this.animationTime = time;
    this.action = { name, duration: time, time: 0, context };
  }
};

// ../functions/engine/player-label.js
function playerLabel(player) {
  const name = String(player?.name ?? "");
  return name + (Number.isSafeInteger(player?.jersey) && player.jersey >= 0 ? " #" + player.jersey : "");
}
__name(playerLabel, "playerLabel");

// ../functions/engine/match/physics.js
function rollingMotion(speed, seconds) {
  if (speed <= PLAY.stopSpeed || seconds <= 0) return { speed: seconds > 0 ? 0 : speed, distance: 0 };
  const drag = PLAY.groundDrag, resistance = PLAY.rollingResistance, offset = resistance / drag;
  const stop = Math.log((speed + offset) / (PLAY.stopSpeed + offset)) / drag, t = Math.min(seconds, stop);
  const decay = Math.exp(-drag * t);
  return {
    speed: seconds >= stop ? 0 : (speed + offset) * decay - offset,
    distance: (speed + offset) * (1 - decay) / drag - offset * t
  };
}
__name(rollingMotion, "rollingMotion");
function passSpeed(distance2, arrivalSpeed = 8) {
  const drag = PLAY.groundDrag, resistance = PLAY.rollingResistance;
  const range = /* @__PURE__ */ __name((speed) => (speed - arrivalSpeed) / drag - resistance / (drag * drag) * Math.log((drag * speed + resistance) / (drag * arrivalSpeed + resistance)), "range");
  let low = Math.max(PLAY.passMin, arrivalSpeed), high = PLAY.passMax;
  if (range(low) >= distance2) return low;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) * 0.5;
    if (range(mid) < distance2) low = mid;
    else high = mid;
  }
  return high;
}
__name(passSpeed, "passSpeed");
function advanceBallMotion(ball, seconds) {
  let remaining = Math.max(0, seconds), rotation = 0;
  while (remaining > 1e-8) {
    const height = Math.max(0, ball.y - FIELD.ballRadius), airborne = height > 1e-7 || ball.vy > 0;
    if (!airborne) {
      const speed = Math.hypot(ball.vx, ball.vz), motion = rollingMotion(speed, remaining);
      if (speed > 0) {
        ball.x += ball.vx / speed * motion.distance;
        ball.z += ball.vz / speed * motion.distance;
        ball.vx *= motion.speed / speed;
        ball.vz *= motion.speed / speed;
      }
      const decay2 = Math.exp(-1.7 * remaining);
      rotation += ball.spin * (1 - decay2) / 1.7;
      ball.spin *= decay2;
      ball.y = FIELD.ballRadius;
      ball.vy = 0;
      if (!motion.speed) ball.spin = 0;
      break;
    }
    const impact = (ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * PLAY.gravity * height)) / PLAY.gravity;
    const t = Math.min(remaining, Math.max(0, impact)), spinDecay = Math.exp(-0.25 * t);
    const angle = ball.spin * (1 - spinDecay) / 0.25 * 0.018, angular = t > 1e-8 ? angle / t : 0;
    const drag = PLAY.airDrag, decay = Math.exp(-drag * t), cos = Math.cos(angle), sin = Math.sin(angle);
    const denominator = drag * drag + angular * angular;
    let along = (drag * (1 - decay * cos) + angular * decay * sin) / denominator;
    let across = (angular * (1 - decay * cos) - drag * decay * sin) / denominator;
    if (t > 0.04 && Math.abs(ball.spin) > 1e-3) {
      along = 0;
      across = 0;
      for (const [fraction, weight] of [[0.1127016653792583, 5 / 18], [0.5, 4 / 9], [0.8872983346207417, 5 / 18]]) {
        const sample = t * fraction, turn = ball.spin * (1 - Math.exp(-0.25 * sample)) / 0.25 * 0.018, magnitude = t * weight * Math.exp(-drag * sample);
        along += magnitude * Math.cos(turn);
        across += magnitude * Math.sin(turn);
      }
    }
    const vx = ball.vx, vz = ball.vz;
    ball.x += vx * along - vz * across;
    ball.z += vz * along + vx * across;
    ball.vx = (vx * cos - vz * sin) * decay;
    ball.vz = (vz * cos + vx * sin) * decay;
    ball.y += ball.vy * t - PLAY.gravity * t * t * 0.5;
    ball.vy -= PLAY.gravity * t;
    rotation += ball.spin * (1 - spinDecay) / 0.25;
    ball.spin *= spinDecay;
    remaining -= t;
    if (impact <= t + 1e-8) {
      const downward = Math.max(0, -ball.vy), grip = 1 - clamp(downward * 7e-3, 4e-3, 0.16);
      ball.y = FIELD.ballRadius;
      ball.vy = downward > 1.8 ? downward * PLAY.bounceDamping : 0;
      ball.vx *= grip;
      ball.vz *= grip;
      ball.spin *= grip;
    }
  }
  return rotation;
}
__name(advanceBallMotion, "advanceBallMotion");
function predictBall(ball, seconds) {
  const point = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, spin: ball.spin || 0 };
  advanceBallMotion(point, seconds);
  return point;
}
__name(predictBall, "predictBall");
function reflectVelocity(ball, normal, restitution = 0.7, tangent = 0.98) {
  const dot2 = ball.vx * normal.x + ball.vy * normal.y + ball.vz * normal.z;
  if (dot2 >= 0) return;
  ball.vx = (ball.vx - dot2 * normal.x) * tangent - dot2 * normal.x * restitution;
  ball.vy = (ball.vy - dot2 * normal.y) * tangent - dot2 * normal.y * restitution;
  ball.vz = (ball.vz - dot2 * normal.z) * tangent - dot2 * normal.z * restitution;
}
__name(reflectVelocity, "reflectVelocity");

// ../functions/engine/match/ball.js
var Ball = class {
  static {
    __name(this, "Ball");
  }
  constructor() {
    this.flightId = 0;
    this.reset();
  }
  reset(x = 0, z = 0) {
    if (this.owner) this.owner.hasBall = false;
    Object.assign(this, {
      x,
      z,
      y: FIELD.ballRadius,
      vx: 0,
      vz: 0,
      vy: 0,
      owner: null,
      lastTouch: null,
      previousTouch: null,
      lock: 0,
      shot: null,
      pass: null,
      spin: 0,
      rollX: 0,
      rollZ: 0,
      rotationY: 0,
      touchClock: 0,
      touchAge: 0,
      touchCount: 0,
      controlMode: "feet",
      flightTime: 0,
      inNet: false,
      badTouch: false
    });
  }
  touch(player) {
    if (this.pass && player.team !== this.pass.team) this.pass = null;
    if (this.lastTouch !== player) this.previousTouch = this.lastTouch;
    this.lastTouch = player;
    player.involvement += 0.08;
  }
  take(player, { hands = false, pressure = 0, random = /* @__PURE__ */ __name(() => 0.5, "random") } = {}) {
    const incomingSpeed = Math.hypot(this.vx, this.vz), moving = Math.hypot(player.vx, player.vz), quality = player.attributes?.dribble ?? 0.7;
    if (this.pass) {
      if (this.pass.team === player.team && this.pass.from !== player) {
        this.pass.from.passes++;
        this.pass.completed = true;
      }
      this.pass = null;
    }
    if (this.owner) this.owner.hasBall = false;
    this.owner = player;
    player.hasBall = true;
    this.touch(player);
    this.shot = null;
    this.controlMode = hands ? "hands" : "feet";
    this.touchClock = 0.08;
    this.touchAge = 0;
    player.holdTime = 0;
    player.lastReceive = 0;
    this.spin *= 0.15;
    if (hands) {
      this.vx = this.vz = this.vy = 0;
      this.holdInHands();
      return;
    }
    if (distance(this, player) > 2.5) {
      this.x = player.x + player.faceX * 0.85;
      this.z = player.z + player.faceZ * 0.85;
    }
    this.y = FIELD.ballRadius;
    this.vy = 0;
    player.touchFoot = contactFoot(player, this);
    const heavy = clamp(incomingSpeed / 50 * (1 - quality) * (0.6 + pressure * 0.1), 0, 0.45);
    const carry = moving > 0.8 ? normalize(player.vx, player.vz) : { x: player.faceX, z: player.faceZ };
    const touchSpeed = moving > 0.8 ? moving * 0.65 : incomingSpeed < 10 ? 0 : Math.min(2.1, incomingSpeed * 0.045);
    this.vx = carry.x * touchSpeed;
    this.vz = carry.z * touchSpeed;
    const across = player.faceX * carry.z - player.faceZ * carry.x;
    player.animate(moving > 0.8 ? Math.abs(across) > 0.4 ? "receive-turn" : "receive-run" : incomingSpeed < 13 ? "trap" : "cushion", 0.45, { side: Math.sign(across) || 1 });
    this.badTouch = heavy > 0.3 && pressure > 0 && random() < heavy * 0.25;
    if (this.badTouch) {
      this.vx += carry.x * 2.5;
      this.vz += carry.z * 2.5;
      this.touchClock = 0.35;
    }
  }
  holdInHands() {
    const p = this.owner;
    if (!p) return;
    this.x = p.x + p.faceX * 0.55;
    this.z = p.z + p.faceZ * 0.55;
    this.y = 1.64;
    if (p.striking && ["keeper-roll", "keeper-punt"].includes(p.action?.name)) {
      const phase = clamp(p.action.time / (p.action.duration * p.action.context.contactAt), 0, 1), height = p.action.name === "keeper-roll" ? 0.5 : 1.1;
      this.y += (height - this.y) * phase;
      this.x += p.faceZ * 0.12 * phase;
      this.z -= p.faceX * 0.12 * phase;
    }
    this.vx = this.vz = this.vy = 0;
  }
  kick(player, dx, dz, power, lift = 0, { spin = 0, height = null } = {}) {
    const n2 = normalize(dx, dz), previousHeight = this.y;
    if (this.owner) this.owner.hasBall = false;
    this.owner = null;
    this.controlMode = "feet";
    this.touch(player);
    if (distance(this, player) > 2.8 || this.y > 3.4) {
      this.x = player.x + n2.x * 0.9;
      this.z = player.z + n2.z * 0.9;
    } else if (distance(this, player) < 0.65) {
      this.x = player.x + n2.x * 0.75;
      this.z = player.z + n2.z * 0.75;
    }
    this.y = height ?? Math.max(FIELD.ballRadius + 0.04, Math.min(previousHeight, 2.6));
    this.vx = n2.x * power;
    this.vz = n2.z * power;
    this.vy = lift;
    this.spin = spin;
    this.lock = Math.min(0.1, 1.5 / Math.max(power, 1));
    player.cooldown = 0.25;
    this.flightId++;
    this.flightTime = 0;
    this.inNet = false;
  }
  release(vx = this.vx, vz = this.vz, vy = this.vy) {
    if (this.owner) this.owner.hasBall = false;
    this.owner = null;
    this.controlMode = "feet";
    this.vx = vx;
    this.vz = vz;
    this.vy = vy;
    this.touchClock = 0;
  }
  integrate(dt) {
    const x = this.x, z = this.z;
    this.rotationY += advanceBallMotion(this, dt);
    this.rollX += (this.z - z) / FIELD.ballRadius;
    this.rollZ -= (this.x - x) / FIELD.ballRadius;
  }
  update(dt) {
    this.lock = Math.max(0, this.lock - dt);
    this.flightTime += dt;
    if (this.owner && this.controlMode === "hands") {
      this.owner.holdTime += dt;
      this.holdInHands();
      return;
    }
    const p = this.owner;
    if (!p) {
      this.integrate(dt);
      return;
    }
    p.holdTime += dt;
    this.touchClock -= dt;
    this.touchAge += dt;
    const speed = Math.hypot(p.vx, p.vz), quality = p.attributes?.dribble ?? 0.7, gap = distance(this, p);
    if (gap > 2.65 + (p.boosting ? 0.45 : 0) || p.sentOff) {
      this.release();
      this.integrate(dt);
      return;
    }
    const skill = p.skillPlan, closeControl = skill?.kind === "close-control" || p.skill > 0;
    const reach = p.boosting ? 2.25 : 1.95;
    const speedMismatch = Math.hypot(this.vx - p.vx, this.vz - p.vz), behind = (this.x - p.x) * p.faceX + (this.z - p.z) * p.faceZ < -0.15;
    const cut = this.touchAge >= 0.065 && !this.badTouch && gap < reach && (speedMismatch > 2.8 - quality || behind || p.cutTime > 0 && this.touchClock > 0.055 || speed < 0.5 && Math.hypot(this.vx, this.vz) > 1);
    if ((this.touchClock <= 0 || cut) && gap < reach) {
      const forward = speed > 0.7 ? normalize(p.vx, p.vz) : { x: p.faceX, z: p.faceZ }, intent = normalize(p.dribbleX ?? forward.x, p.dribbleZ ?? forward.z), steer = normalize(forward.x * 0.58 + intent.x * 0.42, forward.z * 0.58 + intent.z * 0.42);
      const skillBlend = skill ? Math.sin(Math.PI * clamp(skill.time / skill.duration, 0, 1)) * 0.45 : 0;
      const n2 = skill ? normalize(steer.x + skill.x * skillBlend, steer.z + skill.z * skillBlend) : steer;
      const lead = closeControl ? 0.36 : p.boosting ? 0.74 + (1 - quality) * 0.12 : 0.43 + (1 - quality) * 0.11 + speed * 6e-3;
      p.touchFoot = contactFoot(p, this);
      const side = p.touchFoot === "right" ? 1 : -1;
      const correctionX = p.x + n2.x * lead + p.faceZ * side * 0.14 - this.x, correctionZ = p.z + n2.z * lead - p.faceX * side * 0.14 - this.z;
      const interval2 = (p.boosting ? 0.19 : closeControl ? 0.115 : 0.145) + (1 - quality) * 0.045;
      const compensation = (PLAY.groundDrag * speed + PLAY.rollingResistance) * interval2 * 0.45;
      const response = 8 + quality * 3.5;
      this.vx = p.vx + correctionX * response + n2.x * compensation;
      this.vz = p.vz + correctionZ * response + n2.z * compensation;
      if (speed < 0.15 && gap < 0.95 && !skill) {
        this.vx = this.vz = 0;
      }
      this.vy = 0;
      this.y = FIELD.ballRadius;
      this.touchClock = interval2;
      this.touchAge = 0;
      this.touchCount++;
      this.badTouch = false;
      p.footTouch = 0.16;
    }
    this.integrate(dt);
  }
  settleInNet(side) {
    this.release(this.vx * 0.07, this.vz * 0.09, 0);
    this.x = clamp(this.x, side > 0 ? FIELD.halfLength : -FIELD.halfLength - FIELD.goalDepth, side > 0 ? FIELD.halfLength + FIELD.goalDepth : -FIELD.halfLength);
    this.z = clamp(this.z, -FIELD.goalHalf + 0.35, FIELD.goalHalf - 0.35);
    this.y = FIELD.ballRadius;
    this.inNet = true;
  }
};

// ../functions/engine/match/goalkeeper.js
function saveContext(keeper, ball) {
  const lateral = (ball.x - keeper.x) * keeper.faceZ - (ball.z - keeper.z) * keeper.faceX;
  return { side: Math.sign(lateral) || 1, height: ball.y, reach: Math.min(2.3, Math.abs(lateral)), ball: { x: ball.x, y: ball.y, z: ball.z } };
}
__name(saveContext, "saveContext");
function updateKeeper(match, p, dt) {
  const b = match.ball, d = match.direction(p.team), own = -d * FIELD.halfLength, state = p.keeperState, config = match.aiConfig(p.team);
  p.watch(b);
  if (b.owner === p && p === match.controlled) return;
  if (b.owner === p && b.controlMode === "hands") {
    const goalDepth = (p.x - own) * d, targetX = own + d * clamp(goalDepth, 2, FIELD.boxDepth * 0.55);
    p.move(targetX - p.x, -p.z * 0.2, 0.35, dt, false, { x: p.x + d * 20, z: 0 });
    if (!p.action || p.action.name === "keeper-get-up") p.animate("keeper-hold", 0.6);
    if (p.holdTime > 2.1 && p.action?.name !== "keeper-dive") match.requestPass(p);
    return;
  }
  if (b.owner === p) {
    p.move(0, 0, 0, dt, false, { x: p.x + d * 20, z: 0 });
    if (p.holdTime > 0.9) match.requestPass(p);
    return;
  }
  const depth = (b.x - own) * d, attacker = b.owner && b.owner.team !== p.team ? b.owner : null;
  const cover = match.active(p.team).filter((o) => o !== p).some((o) => distance(o, b) < distance(p, b) - 2);
  const rush = attacker && depth < FIELD.boxDepth * 1.1 && Math.abs(b.z) < FIELD.boxHalf * 0.8 && !cover;
  const forward = rush ? clamp(depth * 0.5, 3.2, 11) : attacker ? clamp(8 - depth * 0.07, 3, 7) : clamp(2.3 + (45 - depth) * 0.06, 2.3, 5.4);
  let tx = own + d * forward, tz = clamp(b.z * (forward / Math.max(depth, forward + 1) + 0.1), -FIELD.goalHalf + 0.65, FIELD.goalHalf - 0.65), sprint = !!rush;
  const incoming = !b.owner && b.vx * d < -0.5 && b.lastTouch?.team !== p.team;
  if (incoming) {
    if (state.flight !== b.flightId) {
      state.flight = b.flightId;
      state.reaction = config.reaction * (0.18 + (1 - p.attributes.dribble) * 0.05);
      state.dived = false;
    }
    state.reaction = Math.max(0, (state.reaction || 0) - dt);
    let time = (tx - b.x) / b.vx, point;
    if (time > 0 && time < 2) {
      for (let i = 0; i < 2; i++) {
        point = predictBall(b, time);
        if (Math.abs(point.vx) < 0.5) break;
        time = clamp(time + (tx - point.x) / point.vx, 1e-3, 3);
      }
    }
    if (time > 0 && time < 2 && state.reaction <= 0) {
      const { z, y } = predictBall(b, time);
      tz = clamp(z, -FIELD.goalHalf + 0.3, FIELD.goalHalf - 0.3);
      sprint = time < 1;
      if (!state.dived && time < config.diveLead && Math.abs(z - p.z) > 1 && Math.abs(z) < FIELD.goalHalf + 1 && y < 3.6 && p.cooldown <= 0) {
        const context = saveContext(p, { x: tx, z, y });
        state.dived = true;
        p.animate("keeper-dive", 0.6, { ...context, high: y > 1.7, oneHand: Math.abs(z - p.z) > 2 });
        p.vz = clamp((z - p.z) / Math.max(time, 0.22), -10.5, 10.5);
        p.vx = d * 0.8;
      }
    }
  }
  if (!b.owner && depth > 0 && depth < FIELD.boxDepth * 0.95 && Math.abs(b.z) < FIELD.boxHalf * 0.9 && Math.hypot(b.vx, b.vz) < 16 && !cover) {
    const rival = match.active(1 - p.team).some((o) => distance(o, b) + 2 < distance(p, b));
    if (!rival) {
      tx = b.x;
      tz = b.z;
      sprint = distance(p, b) > 4;
    }
  }
  if (p.action?.name === "keeper-dive") {
    p.x = clamp(p.x + p.vx * dt, own < 0 ? own + 0.3 : own - FIELD.boxDepth, own < 0 ? own + FIELD.boxDepth : own - 0.3);
    p.z = clamp(p.z + p.vz * dt, -FIELD.boxHalf + 0.4, FIELD.boxHalf - 0.4);
    p.vz *= Math.exp(-3 * dt);
  } else p.move(tx - p.x, tz - p.z, Math.min(1, Math.hypot(tx - p.x, tz - p.z) / 1.4), dt, sprint, b);
  if (!p.action && rush) p.animation = "keeper-rush";
}
__name(updateKeeper, "updateKeeper");
function keeperContact(match, p) {
  const b = match.ball, d = match.direction(p.team), gap = distance(p, b), speed = Math.hypot(b.vx, b.vz);
  if (p.cooldown > 0 || p.x * d > -FIELD.halfLength + FIELD.boxDepth || Math.abs(p.z) > FIELD.boxHalf || gap > 2.5 || b.y > 3.5) return false;
  const context = saveContext(p, b), cross = !!b.pass && b.y > 1.4, close = !!b.owner;
  const config = match.aiConfig(p.team), ability = clamp(config.keeper * (0.65 + p.attributes.keeper * 0.35), 0.4, 1);
  const reaction = (p.keeperState.reaction || 0) > 0 ? config.reaction * 0.1 : 0;
  const toward = speed > 0.1 ? ((p.x - b.x) * b.vx + (p.z - b.z) * b.vz) / (speed * speed) : 0;
  const miss = speed > 0.1 ? Math.abs((b.x - p.x) * b.vz - (b.z - p.z) * b.vx) / speed : gap;
  const atBody = predictBall(b, clamp(toward, 0, 0.15));
  const direct = !close && toward >= -0.015 && toward < 0.16 && miss < 0.82 && atBody.y < 2.65;
  const easy = gap < 1.45 && speed < 24 && b.y < 2.4;
  const probability = direct ? clamp(0.955 + config.keeper * 0.043, 0.97, 0.9995) : clamp(ability - speed * 15e-4 * (1.2 - config.keeper) - reaction - (gap > 1.8 ? 0.1 * (1.2 - config.keeper) : 0), 0.18, 0.995);
  const success = gap < 0.75 || easy || match.random() < probability;
  if (!success) {
    p.cooldown = 0.16;
    if (!p.action) p.animate("keeper-dive", 0.65, { ...context, high: b.y > 1.7 });
    return false;
  }
  if (b.shot) {
    match.onTarget();
    match.stats[p.team].saves++;
    p.saves++;
    if (b.shot.setPiece === "PENALTY" && !b.shot.penaltySaved) {
      match.stats[p.team].penaltiesSaved++;
      b.shot.penaltySaved = true;
    }
    match.react("SAVE");
  }
  const pressure = match.active(1 - p.team).some((o) => distance(o, b) < 3);
  const catchable = (close || speed < 29 || direct && speed < 32 + config.keeper * 6) && b.y < 2.8 && (!cross || !pressure) && gap < 1.9;
  if (catchable) {
    match.claim(p, { hands: true });
    p.animate(close ? "keeper-smother" : cross ? "keeper-cross-catch" : "keeper-catch", 0.65, context);
  } else {
    const punch = cross && (pressure || b.y > 2.6);
    b.release(d * (punch ? 18 : 8 + speed * 0.22), Math.sign(b.z - p.z || context.side) * (punch ? 8 : 10 + speed * 0.1), punch ? 6 : 2.4);
    b.touch(p);
    b.spin *= 0.3;
    b.lock = 0.14;
    p.cooldown = 0.55;
    p.animate(punch ? "keeper-punch" : gap < 1 ? "keeper-block" : "keeper-dive", 0.65, { ...context, high: b.y > 1.7, oneHand: gap > 1.6, parry: true });
  }
  for (const mate of match.active(p.team)) {
    if (mate !== p && distance(mate, p) < 10 && !mate.action) mate.animate("applaud", 0.65);
  }
  return true;
}
__name(keeperContact, "keeperContact");

// ../functions/engine/match/tactics.js
function laneClearance(match, player, target) {
  const dx = target.x - player.x, dz = target.z - player.z, length2 = dx * dx + dz * dz;
  let clearance = 20;
  for (const opponent of match.active(1 - player.team)) {
    if (opponent.role === "GK") continue;
    const t = ((opponent.x - player.x) * dx + (opponent.z - player.z) * dz) / (length2 || 1);
    if (t > 0.035 && t < 0.98) clearance = Math.min(clearance, Math.hypot(opponent.x - player.x - dx * t, opponent.z - player.z - dz * t));
  }
  return clearance;
}
__name(laneClearance, "laneClearance");
function chooseShotTarget(match, player) {
  const x = match.direction(player.team) * FIELD.halfLength, keeper = match.active(1 - player.team).find((p) => p.role === "GK");
  const targets = [-FIELD.goalHalf * 0.72, FIELD.goalHalf * 0.72, 0];
  const score = /* @__PURE__ */ __name((z) => Math.min(laneClearance(match, player, { x, z }), 4) * 2 + Math.abs(z - (keeper?.z || 0)) * 0.8 - Math.abs(z - player.z) * 0.035, "score");
  targets.sort((a, b) => score(b) - score(a));
  return match.random() < match.aiConfig(player.team).awareness ? targets[0] : targets[Math.floor(match.random() * targets.length)];
}
__name(chooseShotTarget, "chooseShotTarget");
function defensivePair(match, team, players, ball) {
  if (!players.length) return [];
  match.defensiveRoles ??= [null, null];
  const previous = match.defensiveRoles[team], direction = match.direction(team);
  const score = /* @__PURE__ */ __name((p) => distance(p, ball) + (p.x * direction > ball.x * direction ? 1.4 : 0) + (p.action && ["fall", "get-up", "slide-tackle"].includes(p.action.name) ? 6 : 0), "score");
  const ranked = [...players].sort((a, b) => score(a) - score(b));
  const press = previous && players.includes(previous.press) && score(previous.press) < score(ranked[0]) + 1.6 ? previous.press : ranked[0];
  const cover = ranked.filter((p) => p !== press).sort((a, b) => score(a) - score(b) + (a.role === "DEF" ? -0.4 : 0) - (b.role === "DEF" ? -0.4 : 0))[0];
  match.defensiveRoles[team] = { ...previous, press, cover };
  return cover ? [press, cover] : [press];
}
__name(defensivePair, "defensivePair");
function defensiveShape(match, team, players, ball) {
  const pair = defensivePair(match, team, players, ball), press = pair[0];
  if (!press) return { chasers: [], marks: /* @__PURE__ */ new Map(), doubleTeam: false };
  const state = match.defensiveRoles[team], direction = match.direction(team), owner = ball.owner;
  const threats = match.active(1 - team).filter((p) => p.role !== "GK" && p !== owner).sort((a, b) => a.x * direction - b.x * direction);
  const marks = /* @__PURE__ */ new Map(), claimed = /* @__PURE__ */ new Set(), old = state.assignments || /* @__PURE__ */ new Map();
  for (const p of players) {
    if (p === press) continue;
    const threat = threats.find((t) => t.id === old.get(p.id));
    if (threat && !claimed.has(threat) && distance(p, threat) < 30) {
      marks.set(p, threat);
      claimed.add(threat);
    }
  }
  for (const threat of threats) {
    if (claimed.has(threat)) continue;
    const p = players.filter((p2) => p2 !== press && !marks.has(p2)).sort((a, b) => distance(a, threat) - distance(b, threat))[0];
    if (p) {
      marks.set(p, threat);
      claimed.add(threat);
    }
  }
  const cover = players.filter((p) => p !== press && !marks.has(p)).sort((a, b) => distance(a, ball) - distance(b, ball))[0];
  const openOutlet = threats.some((t) => distance(t, ball) < 20 && !claimed.has(t));
  const trapped = Math.abs(ball.z) > FIELD.halfWidth - 3 && distance(press, ball) < 2.8;
  const beaten = owner && (press.x - owner.x) * direction > 1.5 && ball.x * direction < -FIELD.halfLength + FIELD.boxDepth;
  const helper = owner && (trapped || beaten) && !openOutlet ? [...marks].find(([p, t]) => distance(p, ball) < 6 && distance(t, ball) > 28)?.[0] : null;
  const support = cover || helper;
  const doubleTeam = !!(support && owner && !openOutlet && (trapped || beaten) && distance(support, ball) < 7);
  if (doubleTeam && helper === support) marks.delete(helper);
  state.cover = support;
  state.doubleTeam = doubleTeam;
  state.assignments = new Map([...marks].map(([p, t]) => [p.id, t.id]));
  return { chasers: support ? [press, support] : [press], marks, doubleTeam };
}
__name(defensiveShape, "defensiveShape");
function pressurePoint(match, team, press) {
  const b = match.ball, owner = b.owner, d = match.direction(team);
  if (!owner) return { x: b.x, z: b.z };
  const goal = normalize(-d * FIELD.halfLength - owner.x, -owner.z);
  const goalSide = (press.x - owner.x) * goal.x + (press.z - owner.z) * goal.z > 0;
  const exposed = distance(owner, b) > 0.95 || owner.skill > 0;
  const stationary = Math.hypot(owner.vx, owner.vz) < 1.4 && owner.holdTime > 1;
  const cushion = exposed ? 0.65 : goalSide ? 1.1 : 0.85;
  const approach = stationary ? normalize(owner.faceX + goal.x * 0.3, owner.faceZ + goal.z * 0.3) : goal;
  return { x: b.x + approach.x * (stationary ? 0.75 : cushion) + owner.vx * 0.1, z: b.z + approach.z * (stationary ? 0.75 : cushion) + owner.vz * 0.1 };
}
__name(pressurePoint, "pressurePoint");
function coverPoint(match, team, press) {
  const ball = match.ball, owner = ball.owner, config = match.aiConfig(team), direction = match.direction(team);
  const point = { x: ball.x + (owner?.vx || 0) * 0.22, z: ball.z + (owner?.vz || 0) * 0.22 };
  const goal = normalize(-direction * FIELD.halfLength - point.x, -point.z);
  const depth = Math.min(Math.max(6, config.coverGap), Math.max(2.5, (FIELD.halfLength + point.x * direction) * 0.28));
  const flank = -Math.sign((press?.z ?? ball.z) - ball.z || 1) * 1.15;
  return { x: point.x + goal.x * depth, z: point.z + goal.z * depth + flank };
}
__name(coverPoint, "coverPoint");
function attackingDecision(match, p, target) {
  const config = match.aiConfig(p.team), direction = match.direction(p.team), ball = match.ball;
  const goalDistance = FIELD.halfLength - p.x * direction, angle = Math.abs(p.z) / Math.max(goalDistance, 1);
  const opponents = match.active(1 - p.team), pressure = opponents.filter((o) => distance(p, o) < 4.2);
  if (p.holdTime < 0.3 + config.reaction * 0.15 || distance(p, ball) > 2.5) return "dribble";
  const shotLane = laneClearance(match, p, { x: direction * FIELD.halfLength, z: 0 });
  const kickoff = match.kickoffAttack;
  if (p.team === 1 && kickoff?.armed && !kickoff.used && match.elapsed <= kickoff.until && Math.abs(p.x) < 14 && Math.abs(p.z) < 14 && p.holdTime > 0.65 && pressure.length === 0 && shotLane > 2) {
    kickoff.used = true;
    return "surprise-shot";
  }
  const closeChance = goalDistance < 16 && angle < 0.95;
  const shootingChance = goalDistance < config.shotRange && angle < 0.62 && p.holdTime > 0.7;
  if (shotLane > 1.45 && (closeChance || shootingChance) && (!shootingChance || closeChance || match.random() < config.awareness)) return "shoot";
  if (target && p.holdTime > 0.6) {
    const lane = laneClearance(match, p, target), progress = (target.x - p.x) * direction;
    const targetSpace = Math.min(20, ...opponents.map((o) => distance(o, target)));
    const returnPass = target === p.receivedFrom && p.holdTime < 3;
    const releasePressure = pressure.length > 0 && lane > 1.25 && targetSpace > 3;
    const improveAttack = progress > 8 && targetSpace > 5 && lane > 2.2 && !returnPass && p.holdTime > 1.4;
    const crossFromWing = Math.abs(p.z) > FIELD.halfWidth * 0.65 && goalDistance < 25 && Math.abs(target.z) < FIELD.boxHalf && lane > 2;
    if ((releasePressure || improveAttack || crossFromWing) && match.random() < 0.65 + config.awareness * 0.35) return "pass";
  }
  if (pressure.length && p.cooldown <= 0 && match.random() < 0.25 + config.awareness * 0.35) return "skill";
  return "dribble";
}
__name(attackingDecision, "attackingDecision");

// ../functions/engine/match/ai.js
function bestPass(match, player, aim = null) {
  const direction = match.direction(player.team), opponents = match.active(1 - player.team);
  let best = null, bestScore = -Infinity, fallback = null;
  for (const mate of match.active(player.team)) {
    if (mate === player || mate.role === "GK" && (player.role === "GK" || player.x * direction > 0)) continue;
    const dist = distance(player, mate);
    if (!fallback || dist < distance(player, fallback)) fallback = mate;
    if (dist < 3 || dist > fieldUnits(49)) continue;
    const dx = mate.x - player.x, dz = mate.z - player.z, n2 = normalize(dx, dz);
    let openness = fieldUnits(8);
    for (const opp of opponents) {
      const t = clamp(((opp.x - player.x) * dx + (opp.z - player.z) * dz) / (dist * dist), 0, 1);
      const gap = Math.hypot(opp.x - player.x - dx * t, opp.z - player.z - dz * t);
      if (t > 0.06 && t < 0.97) openness = Math.min(openness, gap);
    }
    const alignment = aim ? (n2.x * aim.x + n2.z * aim.z) * 18 : dx * direction / fieldUnits(1) * 0.2;
    const nextLine = player.role === "GK" && mate.role === "DEF" || player.role === "DEF" && mate.role === "MID" || player.role === "MID" && mate.role === "FWD";
    const switchWing = Math.abs(player.z) > fieldUnits(9) && mate.z * player.z < 0 && openness > fieldUnits(4);
    const score = alignment + Math.min(openness, fieldUnits(6)) / fieldUnits(1) * 2.8 - dist * 0.12 + (dx * direction > 0 ? 2 : 0) + (nextLine ? 4 : 0) + (switchWing ? 5 : 0) - (!aim && mate === player.receivedFrom && player.holdTime < 3 ? 6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = mate;
    }
  }
  return best || fallback;
}
__name(bestPass, "bestPass");
function ballIntercept(ball, seconds = 0.24) {
  const point = predictBall(ball, seconds);
  return {
    x: clamp(point.x, -FIELD.halfLength + 0.8, FIELD.halfLength - 0.8),
    z: clamp(point.z, -FIELD.halfWidth + 0.8, FIELD.halfWidth - 0.8)
  };
}
__name(ballIntercept, "ballIntercept");
function updateAI(match, dt) {
  const b = match.ball, owner = b.owner, possession = owner?.team ?? b.pass?.team;
  match.tacticalTime = (match.tacticalTime || 0) + dt;
  if (match.kickoffAttack && (match.elapsed > match.kickoffAttack.until || possession === 0)) match.kickoffAttack = null;
  for (const p of match.players) p.watch(b);
  for (let team = 0; team < 2; team++) {
    const direction = match.direction(team), squad = match.active(team), field = squad.filter((p) => p.role !== "GK");
    const config = match.aiConfig(team);
    const defense = possession === team ? { chasers: [], marks: /* @__PURE__ */ new Map(), doubleTeam: false } : defensiveShape(match, team, field, b);
    const { chasers, marks } = defense;
    for (const p of squad) {
      if (match.phase !== "playing") return;
      if (match.isHumanControlled(p)) continue;
      if (p.striking) {
        p.move(0, 0, 0, dt);
        continue;
      }
      const home = match.formations?.[p.team]?.[p.slot] || FORMATION[p.slot];
      let tx = home.x * direction, tz = home.z, sprint = false, pace = 1;
      if (p.role === "GK") {
        updateKeeper(match, p, dt);
        continue;
      } else if (owner === p) {
        const goalDistance = FIELD.halfLength - p.x * direction;
        const defenders = match.active(1 - team).filter((o) => distance(p, o) < 5);
        tx = direction * FIELD.halfLength;
        tz = clamp(p.z * (goalDistance < 28 ? 0.62 : 0.9), -FIELD.halfWidth * 0.8, FIELD.halfWidth * 0.8);
        const forward = normalize(tx - p.x, tz - p.z);
        let avoidX = 0, avoidZ = 0;
        for (const defender of defenders) {
          const dx = defender.x - p.x, dz = defender.z - p.z, dist = Math.hypot(dx, dz);
          if (dx * forward.x + dz * forward.z > -0.4) {
            const side = forward.x * dz - forward.z * dx >= 0 ? -1 : 1, weight = clamp((5 - dist) / 5, 0, 1) * 1.2;
            avoidX += -forward.z * side * weight;
            avoidZ += forward.x * side * weight;
          }
        }
        p.move(forward.x + avoidX, forward.z + avoidZ, defenders.length ? 0.82 : 1, dt, defenders.length === 0 && goalDistance > fieldUnits(8) && p.holdTime > 0.5);
        if (p.decision <= 0) {
          p.decision = config.reaction * (0.9 + match.random() * 0.2);
          const decision = attackingDecision(match, p, bestPass(match, p));
          if (decision === "shoot" || decision === "surprise-shot") {
            const power = decision === "surprise-shot" ? 0.92 : clamp(0.36 + goalDistance / 65, 0.4, 0.92);
            match.requestShot(p, power, null, { curve: decision !== "surprise-shot" && goalDistance > 16 && Math.abs(p.z) > 6 && Math.abs(p.z) < FIELD.boxHalf });
          } else if (decision === "pass") match.requestPass(p);
          else if (decision === "skill") match.skill(p, { ...normalize(direction, -Math.sign(p.z) * 0.7), intensity: 1 });
        }
        continue;
      } else if (b.pass?.target === p) {
        const point = ballIntercept(b, clamp(distance(p, b) / PLAY.runSpeed * 0.25, 0.15, 0.65));
        const meetAtTarget = (b.y > 2 || distance(p, b) > fieldUnits(7)) && Math.hypot(b.vx, b.vz) > 8;
        tx = meetAtTarget ? b.pass.x : point.x;
        tz = meetAtTarget ? b.pass.z : point.z;
        sprint = distance(p, b) > fieldUnits(5);
      } else if (chasers.includes(p)) {
        const first = chasers[0] === p, point = ballIntercept(b);
        if (first) {
          const target = owner ? pressurePoint(match, team, p) : point;
          tx = target.x;
          tz = target.z;
          const gap2 = distance(p, b), closingSpeed = owner ? Math.hypot(owner.vx, owner.vz) : 0;
          sprint = gap2 > 10 || gap2 > 3.2 && closingSpeed > PLAY.runSpeed * 0.9 || gap2 > 4 && !owner;
          pace = sprint ? 1 : gap2 < 3.2 ? 0.6 : Math.max(0.76, Math.min(1, closingSpeed / PLAY.runSpeed + 0.08));
        } else {
          const cover = defense.doubleTeam ? point : coverPoint(match, team, chasers[0]);
          tx = cover.x;
          tz = cover.z;
          const displaced = Math.hypot(tx - p.x, tz - p.z);
          sprint = displaced > 10 && ((p.x - b.x) * direction > 0 || !!owner?.boosting);
          pace = sprint ? 1 : 0.7;
        }
        if ((first || defense.doubleTeam) && owner && owner.team !== team && distance(p, owner) < 2.05 && distance(p, b) < 1.8 && p.cooldown <= 0 && p.decision <= 0) {
          p.decision = config.reaction;
          const approach = normalize(p.x - owner.x, p.z - owner.z);
          if (approach.x * owner.faceX + approach.z * owner.faceZ > -0.3 && match.random() < config.pressure * (0.55 + config.awareness * 0.4)) match.tackle(p, { standing: true });
        }
      } else if (possession === team) {
        const progress = clamp(b.x * direction + fieldUnits(14), -fieldUnits(4), fieldUnits(29));
        tx = clamp(home.x + progress * 0.7, -fieldUnits(25), FIELD.halfLength - fieldUnits(3)) * direction;
        tz = clamp(home.z + (b.z - home.z) * 0.12, -FIELD.halfWidth + fieldUnits(2), FIELD.halfWidth - fieldUnits(2));
        if (p.role === "FWD") {
          tx = clamp(b.x * direction + fieldUnits(11) * p.attributes.forwardRun, -fieldUnits(4), FIELD.halfLength - fieldUnits(2.5)) * direction;
          const nearWing = Math.sign(home.z) === Math.sign(b.z), boxAttack = b.x * direction > FIELD.halfLength - FIELD.boxDepth * 1.6;
          tz = boxAttack ? nearWing ? Math.sign(b.z) * FIELD.goalHalf * 0.6 : -Math.sign(b.z || 1) * FIELD.goalHalf * 0.8 : home.z * 1.85;
          tx -= fieldUnits(1.5) * (1 + Math.sin(match.tacticalTime * 0.6 + p.slot));
          sprint = tx * direction - p.x * direction > fieldUnits(6);
        }
        if (p.role === "MID") {
          const onBallSide = home.z * b.z > 0, overlap = onBallSide && owner?.role === "FWD" && b.x * direction > 0;
          tz = Math.sign(home.z) * FIELD.halfWidth * (overlap ? 0.82 : 0.67) + Math.sin(match.tacticalTime * 0.45 + p.slot) * fieldUnits(1.5);
          if (overlap) tx = clamp(b.x * direction + fieldUnits(6), -fieldUnits(20), FIELD.halfLength - fieldUnits(4)) * direction;
          else if (Math.abs(p.x - b.x) < fieldUnits(5)) tx = b.x - direction * fieldUnits(6);
          sprint = overlap && distance(p, b) > fieldUnits(8);
        }
      } else {
        tx = clamp(home.x + b.x * direction * 0.32, -FIELD.halfLength + fieldUnits(3), fieldUnits(24)) * direction;
        tz = clamp(home.z + b.z * 0.2, -FIELD.halfWidth + fieldUnits(3), FIELD.halfWidth - fieldUnits(3));
        const threat = marks.get(p);
        if (threat) {
          const lead = 0.2 + config.awareness * 0.2;
          const goalSide = normalize(-direction * FIELD.halfLength - threat.x, -threat.z);
          const markingGap = 2.3 + (1 - config.awareness) * 1.3;
          tx = threat.x + threat.vx * lead + goalSide.x * markingGap;
          tz = threat.z + threat.vz * lead + goalSide.z * markingGap;
        }
        const recovery = Math.hypot(tx - p.x, tz - p.z), runnerSpeed = threat ? Math.hypot(threat.vx, threat.vz) : 0;
        sprint = recovery > 10 && ((p.x - b.x) * direction > 3 || runnerSpeed > 6) || !!threat && recovery > 3 && runnerSpeed > PLAY.runSpeed * 0.95;
        pace = sprint ? 1 : threat ? clamp(runnerSpeed / PLAY.runSpeed + 0.14, 0.6, 1) : 0.68;
      }
      if (!chasers.includes(p) && !marks.has(p) && b.pass?.target !== p) {
        tz += Math.sin(match.tacticalTime * 0.4 + p.slot + team) * fieldUnits(p.role === "DEF" ? 1.2 : 0.75);
        tx += Math.sin(match.tacticalTime * 0.28 + p.slot + team) * fieldUnits(p.role === "DEF" ? 1.4 : 0.9) * direction;
      }
      tx = clamp(tx, -FIELD.halfLength + 0.7, FIELD.halfLength - 0.7);
      tz = clamp(tz, -FIELD.halfWidth + 0.7, FIELD.halfWidth - 0.7);
      const direct = chasers.includes(p) || b.pass?.target === p;
      if (!p.aiTarget) p.aiTarget = { x: tx, z: tz };
      const blend = 1 - Math.exp(-(direct ? 18 : 5) * dt);
      p.aiTarget.x += (tx - p.aiTarget.x) * blend;
      p.aiTarget.z += (tz - p.aiTarget.z) * blend;
      tx = p.aiTarget.x;
      tz = p.aiTarget.z;
      const gap = Math.hypot(tx - p.x, tz - p.z);
      let sx = 0, sz = 0;
      for (const mate of squad) {
        if (mate === p) continue;
        const dist = distance(p, mate), space = possession !== team ? 2.1 : PLAY.supportGap;
        if (dist < space && dist > 0.01) {
          sx += (p.x - mate.x) / dist * (space - dist);
          sz += (p.z - mate.z) / dist * (space - dist);
        }
      }
      p.move(tx - p.x + sx, tz - p.z + sz, Math.min(pace, Math.hypot(tx - p.x + sx, tz - p.z + sz) / (direct ? 2 : 3)), dt, sprint, possession !== team && !sprint || b.pass?.target === p && distance(p, b) < 12 ? b : null);
    }
  }
}
__name(updateAI, "updateAI");

// ../functions/engine/match/contacts.js
function interval(ax, az, dx, dz, radius) {
  const a = dx * dx + dz * dz, c = ax * ax + az * az - radius * radius;
  if (a < 1e-12) return c <= 0 ? [0, 1] : null;
  const b = ax * dx + az * dz, disc = b * b - a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc), enter = Math.max(0, (-b - root) / a), leave = Math.min(1, (-b + root) / a);
  return enter <= leave ? [enter, leave] : null;
}
__name(interval, "interval");
function playerContact(player, start, end, radius, maxHeight, minHeight = 0, moving = false) {
  const px = moving ? player.previousX ?? player.x : player.x, pz = moving ? player.previousZ ?? player.z : player.z;
  const ax = start.x - px, az = start.z - pz, dx = end.x - player.x - ax, dz = end.z - player.z - az;
  const range = interval(ax, az, dx, dz, radius);
  if (!range) return null;
  const dy = end.y - start.y;
  if (Math.abs(dy) < 1e-9) {
    if (start.y < minHeight || start.y > maxHeight) return null;
  } else {
    const a = (minHeight - start.y) / dy, b = (maxHeight - start.y) / dy;
    range[0] = Math.max(range[0], Math.min(a, b));
    range[1] = Math.min(range[1], Math.max(a, b));
  }
  const t = range[0];
  if (t > range[1] || t < 0 || t > 1) return null;
  const rx = ax + dx * t, rz = az + dz * t, length = Math.hypot(rx, rz), fallback = Math.hypot(dx, dz) || 1;
  return {
    t,
    x: start.x + (end.x - start.x) * t,
    y: start.y + dy * t,
    z: start.z + (end.z - start.z) * t,
    normal: { x: length > 1e-6 ? rx / length : -dx / fallback, y: 0, z: length > 1e-6 ? rz / length : -dz / fallback }
  };
}
__name(playerContact, "playerContact");
var dot = /* @__PURE__ */ __name((a, b) => a.x * b.x + a.y * b.y + a.z * b.z, "dot");
var subtract = /* @__PURE__ */ __name((a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }), "subtract");
function capsuleContact(start, end, a, b, radius) {
  const axis = subtract(b, a), length = Math.sqrt(dot(axis, axis));
  axis.x /= length;
  axis.y /= length;
  axis.z /= length;
  const offset = subtract(start, a), motion = subtract(end, start), along = dot(offset, axis), travel = dot(motion, axis);
  const radial = { x: offset.x - axis.x * along, y: offset.y - axis.y * along, z: offset.z - axis.z * along };
  const velocity = { x: motion.x - axis.x * travel, y: motion.y - axis.y * travel, z: motion.z - axis.z * travel };
  const times = [];
  const roots = /* @__PURE__ */ __name((offset2, velocity2, accept) => {
    const aa = dot(velocity2, velocity2), bb = dot(offset2, velocity2), cc = dot(offset2, offset2) - radius * radius;
    if (cc <= 0) {
      if (accept(0)) times.push(0);
      return;
    }
    const disc = bb * bb - aa * cc;
    if (aa < 1e-12 || disc < 0) return;
    const t = (-bb - Math.sqrt(disc)) / aa;
    if (t >= 0 && t <= 1 && accept(t)) times.push(t);
  }, "roots");
  roots(radial, velocity, (t) => along + travel * t >= 0 && along + travel * t <= length);
  roots(offset, motion, () => true);
  roots(subtract(start, b), motion, () => true);
  times.sort((a2, b2) => a2 - b2);
  for (const t of times) {
    const point = { x: start.x + motion.x * t, y: start.y + motion.y * t, z: start.z + motion.z * t };
    const s = clamp(along + travel * t, 0, length), center = { x: a.x + axis.x * s, y: a.y + axis.y * s, z: a.z + axis.z * s };
    const n2 = subtract(point, center), gap = Math.sqrt(dot(n2, n2)), fallback = Math.sqrt(dot(motion, motion)) || 1;
    const normal = gap > 1e-7 ? { x: n2.x / gap, y: n2.y / gap, z: n2.z / gap } : { x: -motion.x / fallback, y: -motion.y / fallback, z: -motion.z / fallback };
    if (dot(normal, motion) >= -1e-9) continue;
    return { t, x: center.x + normal.x * (radius + 2e-3), y: center.y + normal.y * (radius + 2e-3), z: center.z + normal.z * (radius + 2e-3), normal };
  }
  return null;
}
__name(capsuleContact, "capsuleContact");

// ../functions/engine/match/rules.js
function boundaryEvent(ball, previous, teamsDirection) {
  const L = FIELD.halfLength, W = FIELD.halfWidth, R = FIELD.ballRadius;
  const crossings = [];
  if (Math.abs(ball.x) > L + R && Math.abs(previous.x) <= L + R) {
    const side = Math.sign(ball.x), t = (side * (L + R) - previous.x) / (ball.x - previous.x);
    crossings.push({ axis: "x", side, t, z: previous.z + (ball.z - previous.z) * t, y: previous.y + (ball.y - previous.y) * t });
  }
  if (Math.abs(ball.z) > W + R && Math.abs(previous.z) <= W + R) {
    const side = Math.sign(ball.z), t = (side * (W + R) - previous.z) / (ball.z - previous.z);
    crossings.push({ axis: "z", side, t, x: previous.x + (ball.x - previous.x) * t });
  }
  crossings.sort((a, b) => a.t - b.t);
  const crossing = crossings[0];
  if (!crossing) return null;
  const last = ball.lastTouch?.team ?? 0;
  if (crossing.axis === "z") return { type: "THROW-IN", time: crossing.t, team: 1 - last, x: clamp(crossing.x, -L + 0.6, L - 0.6), z: crossing.side * (W - 0.2) };
  const attacking = teamsDirection.findIndex((d) => d === crossing.side), defending = 1 - attacking;
  if (Math.abs(crossing.z) < FIELD.goalHalf - R && crossing.y < FIELD.goalHeight - R)
    return { type: "GOAL", time: crossing.t, team: attacking, side: crossing.side };
  return last === defending ? { type: "CORNER", time: crossing.t, team: attacking, x: crossing.side * (L - 0.3), z: Math.sign(crossing.z || 1) * (W - 0.3) } : { type: "GOAL KICK", time: crossing.t, team: defending, x: crossing.side * (L - FIELD.goalBoxDepth), z: 0 };
}
__name(boundaryEvent, "boundaryEvent");
function goalFrameContact(ball, previous) {
  if (ball.owner) return null;
  const reach = FIELD.ballRadius + FIELD.postRadius;
  let first = null;
  for (const side of [-1, 1]) {
    const x = side * FIELD.halfLength;
    if (Math.min(previous.x, ball.x) > x + reach || Math.max(previous.x, ball.x) < x - reach) continue;
    const left = { x, y: FIELD.goalHeight, z: -FIELD.goalHalf }, right = { x, y: FIELD.goalHeight, z: FIELD.goalHalf };
    const segments = [[{ x, y: 0, z: -FIELD.goalHalf }, left], [{ x, y: 0, z: FIELD.goalHalf }, right], [left, right]];
    for (const [a, b] of segments) {
      const hit = capsuleContact(previous, ball, a, b, reach);
      if (hit && (!first || hit.t < first.t)) first = hit;
    }
  }
  return first;
}
__name(goalFrameContact, "goalFrameContact");
function resolveFrameContact(ball, hit) {
  ball.x = hit.x;
  ball.y = Math.max(FIELD.ballRadius, hit.y);
  ball.z = hit.z;
  reflectVelocity(ball, hit.normal, 0.72, 0.97);
  ball.spin *= 0.65;
}
__name(resolveFrameContact, "resolveFrameContact");
function foulRestart(victim, direction) {
  const inBox = victim.x * direction > FIELD.halfLength - FIELD.boxDepth && Math.abs(victim.z) < FIELD.boxHalf;
  return {
    type: inBox ? "PENALTY" : "FREE KICK",
    team: victim.team,
    x: inBox ? direction * (FIELD.halfLength - FIELD.penaltyDistance) : clamp(victim.x, -FIELD.halfLength + 0.5, FIELD.halfLength - 0.5),
    z: inBox ? 0 : clamp(victim.z, -FIELD.halfWidth + 0.5, FIELD.halfWidth - 0.5)
  };
}
__name(foulRestart, "foulRestart");

// ../functions/engine/match/stats.js
function teamStats() {
  return { goals: 0, shots: 0, onTarget: 0, possession: 0, passes: 0, completed: 0, fouls: 0, yellows: 0, reds: 0, corners: 0, saves: 0, substitutions: 0, injuries: 0, penalties: 0, penaltiesScored: 0, penaltiesSaved: 0, freeKickGoals: 0, cornerGoals: 0 };
}
__name(teamStats, "teamStats");
function performance(p) {
  return p.goals * 5 + p.assists * 3 + p.saves * 1.4 + p.tackles * 0.6 + p.passes * 0.15 + p.involvement * 0.1 - p.yellow * 0.7 - (p.sentOff ? 3 : 0);
}
__name(performance, "performance");
function playerOfMatch(players) {
  return [...players].sort((a, b) => performance(b) - performance(a))[0];
}
__name(playerOfMatch, "playerOfMatch");

// ../functions/engine/match-history.js
var MODE_LABELS = { all: "All modes", quick: "Play Now", rivalry: "Rivalry Matches", tournament: "Tournament Mode", season: "Season Mode", dream: "LSL Dream F.C.", h2h: "Live Head to Head" };
var DIFFICULTY_LABELS = Object.freeze({ all: "All difficulties", easy: "Easy", normal: "Medium (Normal)", hard: "Hard", insane: "Insane" });
var modeFor = /* @__PURE__ */ __name((m) => m.dream ? "dream" : m.rivalry ? "rivalry" : m.tournament ? "tournament" : m.seasonMatch ? "season" : "quick", "modeFor");
var n = /* @__PURE__ */ __name((v) => Number.isFinite(Number(v)) ? Number(v) : 0, "n");
var copy = /* @__PURE__ */ __name((v) => JSON.parse(JSON.stringify(v)), "copy");
var sides = /* @__PURE__ */ __name((values) => Object.fromEntries([0, 1].map((team) => [team, copy(values?.[team] || [])])), "sides");
var playerSnapshot = /* @__PURE__ */ __name((p) => ({ id: p.id ?? p.data?.id ?? "", name: p.name ?? p.data?.name ?? "", jersey: p.jersey ?? p.data?.jersey ?? null, position: p.role ?? p.position ?? "", team: p.team ?? 0, slot: p.slot ?? null }), "playerSnapshot");
function captureMatch(match, account = {}) {
  account = match.playingAccount || account;
  const players = [...match.archive || [], ...match.players || []], goals = copy(match.goalEvents || []), mode = modeFor(match);
  const score = (match.stats || [{}, {}]).map((s) => n(s.goals)), potm = players.length ? playerOfMatch(players) : null;
  return copy({
    schemaVersion: 2,
    id: crypto.randomUUID(),
    ownerId: account.uid || "",
    accountName: account.username || "",
    date: Date.now(),
    mode,
    modeLabel: MODE_LABELS[mode],
    season: String(match.tournament?.season || match.teams?.[0]?.season || match.settings?.season || ""),
    competition: match.tournament ? { name: "Inter-Madrasah", stage: match.tournament.stage || "", fixtureId: match.tournament.id || "" } : match.seasonMatch ? { name: "LSL Season", stage: match.seasonMatch.stage || "", fixtureId: match.seasonMatch.id || "" } : match.dream ? { name: "Dream F.C.", stage: match.dream.event ? "Event" : "CPU match" } : null,
    teams: (match.teams || []).map((t) => t.name),
    teamIds: (match.teams || []).map((t) => t.id || ""),
    score,
    won: score[0] > score[1],
    tie: score[0] === score[1],
    duration: n(match.elapsed),
    scheduledDuration: n(match.settings?.duration) * 60,
    opponent: { type: "cpu", difficulty: match.settings?.difficulty || "normal" },
    stats: { user: copy(match.stats?.[0] || {}), cpu: copy(match.stats?.[1] || {}) },
    goals,
    substitutions: copy(match.subEvents || []),
    injuries: copy(match.injuryEvents || []),
    startingLineups: sides(match.startingLineups),
    finalLineups: sides([0, 1].map((team) => (match.players || []).filter((p) => p.team === team && !p.sentOff).map(playerSnapshot))),
    startingFormations: sides(match.startingFormations),
    finalFormations: sides(match.formations),
    playerOfMatch: potm ? playerSnapshot(potm) : null,
    players: players.map((p) => ({ ...playerSnapshot(p), goals: n(p.goals), assists: n(p.assists), shots: n(p.shots), onTarget: n(p.onTarget), passes: n(p.passes), tackles: n(p.tackles), saves: n(p.saves), yellows: n(p.yellow), reds: p.sentOff ? 1 : 0, involvement: n(p.involvement) }))
  });
}
__name(captureMatch, "captureMatch");

// ../functions/engine/match/skills.js
function performSkill(match, p, aim = null) {
  if (p.cooldown > 0 || p.sentOff || match.ball.controlMode === "hands") return;
  if (match.ball.owner !== p) {
    p.animate("jockey", 0.4);
    return;
  }
  const defenders = match.active(1 - p.team).sort((a, b) => distance(a, p) - distance(b, p)), nearest = defenders[0];
  const gap = nearest ? distance(nearest, p) : 99, speed = Math.hypot(p.vx, p.vz), rating = p.attributes.dribble;
  const desired = aim && aim.intensity > 0.1 ? normalize(aim.x, aim.z) : { x: p.faceX, z: p.faceZ };
  const dot2 = desired.x * p.faceX + desired.z * p.faceZ, cross = desired.x * p.faceZ - desired.z * p.faceX;
  let options = match.charge > 0.1 ? ["fake-shot"] : dot2 < -0.35 ? ["drag-back", "roulette"] : Math.abs(cross) > 0.55 ? ["quick-cut", "ball-roll", "directional-touch"] : speed > 7 ? ["heel-to-heel", "stop-go", "directional-touch"] : gap < 3 ? ["body-feint", "step-over", "double-step", "roulette", "close-control"] : ["step-over", "ball-roll", "close-control", "stop-go"];
  options = options.filter((k) => k === "fake-shot" || k !== p.lastSkill);
  if (!options.length) options = ["body-feint"];
  const kind = options[Math.floor(match.random() * options.length)], complex = ["roulette", "double-step", "heel-to-heel"].includes(kind);
  const side = Math.sign(cross) || (nearest ? Math.sign((p.x - nearest.x) * p.faceZ - (p.z - nearest.z) * p.faceX) : 1) || 1;
  let n2 = desired;
  if (["ball-roll", "step-over", "double-step", "body-feint"].includes(kind)) n2 = normalize(p.faceX * 0.4 + p.faceZ * side, p.faceZ * 0.4 - p.faceX * side);
  if (kind === "drag-back") n2 = { x: -p.faceX, z: -p.faceZ };
  const burst = ["heel-to-heel", "directional-touch", "quick-cut"].includes(kind) ? 2.6 : kind === "stop-go" ? -1.2 : 0.65;
  const duration = kind === "roulette" ? 0.7 : 0.55;
  p.skillPlan = { kind, x: n2.x, z: n2.z, burst, time: duration, duration };
  p.lastSkill = kind;
  p.skill = 0.55;
  p.cooldown = 1.15;
  p.animate(kind, duration, { side, aim: desired });
  match.charge = 0;
  match.cancelShotUntilRelease = kind === "fake-shot";
  const failure = (complex ? 0.09 : 0.02) + (1 - rating) * (complex ? 0.4 : 0.13) + (gap < 2 ? 0.06 : 0);
  if (match.random() < failure) {
    match.ball.release(p.vx + n2.x * (4 + (1 - rating) * 5), p.vz + n2.z * (4 + (1 - rating) * 5), 0.25);
    p.skill = 0.05;
    p.animate("stumble", 0.4, { side });
  } else {
    match.ball.touchClock = 0;
    match.ball.vx = p.vx + n2.x * 0.6;
    match.ball.vz = p.vz + n2.z * 0.6;
  }
  p.x = clamp(p.x, -FIELD.halfLength + 0.4, FIELD.halfLength - 0.4);
  p.z = clamp(p.z, -FIELD.halfWidth + 0.4, FIELD.halfWidth - 0.4);
}
__name(performSkill, "performSkill");

// ../functions/engine/match/striking.js
function startStrike(match, p, kind, duration, context, contact, windup) {
  if (p.striking) return false;
  const turn = context.aim ? Math.acos(clamp(p.faceX * context.aim.x + p.faceZ * context.aim.z, -1, 1)) : 0;
  const delay = (kind.includes("shot") || kind === "keeper-punt" ? 0.18 : 0.12) + turn * 0.045;
  p.animate(kind, duration, { ...context, contactAt: delay / duration });
  if (windup && match.ball.owner === p) {
    p.striking = true;
    match.pendingStrike = { p, kind, remaining: delay, contact };
  } else {
    p.action.time = delay;
    contact();
  }
  return true;
}
__name(startStrike, "startStrike");
function advanceStrike(match, dt) {
  const strike = match.pendingStrike;
  if (!strike) return;
  if (match.ball.owner !== strike.p || strike.p.sentOff || !["playing", "restart"].includes(match.phase)) {
    strike.p.striking = false;
    match.pendingStrike = null;
    if (strike.p.action?.name === strike.kind) strike.p.action = null;
    return;
  }
  strike.remaining -= dt;
  if (strike.remaining <= 0) {
    match.pendingStrike = null;
    strike.p.striking = false;
    strike.contact();
  }
}
__name(advanceStrike, "advanceStrike");

// ../functions/engine/presentation.js
var INTRO = Object.freeze({ versus: 3.5, user: 7, cpu: 28, watch: 49, walk: 54, duration: 60, playerSeconds: 3 });
var PRESENTATION = Object.freeze({ goal: 8.5, replay: 4.5, replayLead: 1.15, replayTransition: 0.8, foul: 4, card: 5.5, injury: 4.5, substitution: 5 });
var restartPresentation = /* @__PURE__ */ __name((type) => ({ "KICK OFF": 1.2, "THROW-IN": 1.6, "GOAL KICK": 2, "CORNER": 3, "FREE KICK": 3.5, "PENALTY": 4 })[type] || 2, "restartPresentation");

// ../functions/engine/match/match.js
var Match = class {
  static {
    __name(this, "Match");
  }
  constructor(teams, settings, { event = /* @__PURE__ */ __name(() => {
  }, "event"), random = Math.random } = {}) {
    this.teams = teams;
    this.settings = { ...settings, duration: matchDuration(settings.duration) };
    this.inputTeam = 0;
    this.event = event;
    this.random = random;
    this.formations = teams.map((team) => team.formation?.length === 7 ? team.formation : FORMATION);
    this.players = teams.flatMap((team, index) => team.lineup.map((data, slot) => new Player(data, index, slot, index === 0 ? 1 : -1, this.formations[index])));
    this.startingLineups = [0, 1].map((team) => this.players.filter((p) => p.team === team).map(playerSnapshot));
    this.startingFormations = JSON.parse(JSON.stringify(this.formations));
    this.benches = teams.map((t) => t.bench.map((p) => ({ ...p })));
    this.used = [[], []];
    this.archive = [];
    this.pending = [];
    this.stats = [teamStats(), teamStats()];
    this.goalEvents = [];
    this.subEvents = [];
    this.injuryEvents = [];
    this.lastReaction = null;
    this.ball = new Ball();
    this.controlled = this.players[5];
    this.phase = "intro";
    this.phaseTime = 0;
    this.elapsed = 0;
    this.half = 1;
    this.paused = false;
    this.charge = 0;
    this.aimZ = 0;
    this.switchCooldown = 0;
    this.receiverAssist = false;
    this.restart = null;
    this.message = "";
    this.replayBuffer = [];
    this.replayFrames = [];
    this.replayActive = false;
    this.replayClock = 0;
    this.replayFocus = null;
    this.replayStage = "celebrate";
    this.replayStageTime = 0;
    this.replayPlayback = 0;
    this.referee = new Player({ id: "referee", name: "Referee", jersey: null }, -1, 3, 1);
    this.referee.x = -fieldUnits(8);
    this.referee.z = fieldUnits(6);
    for (const team of [0, 1]) {
      const captain = this.players.filter((p) => p.team === team).find((p) => p.data.leadershipRole === "captain") || this.players.filter((p) => p.team === team && p.role !== "GK").sort((a, b) => (Number(b.data.overall) || 0) - (Number(a.data.overall) || 0))[0];
      if (captain) captain.data.leadershipRole = "captain";
    }
    this.resetFormation();
    this.passHeldTime = 0;
    this.holdSwitchTime = 0;
    this.curveRequested = false;
    for (const p of this.players) {
      p.x -= this.direction(p.team) * 5;
      p.z += 2;
    }
  }
  enableH2H() {
    this.humanKeys = ["controlled", "charge", "aimZ", "switchCooldown", "receiverAssist", "manualKeeper", "keeperReturn", "passHeldTime", "holdSwitchTime", "curveRequested", "cancelShotUntilRelease"];
    this.humanSeats = [0, 1].map((team) => ({ ...Object.fromEntries(this.humanKeys.map((key) => [key, this[key]])), controlled: this.players.find((p) => p.team === team && p.slot === 5) }));
    return this;
  }
  withHuman(team, fn) {
    const saved = Object.fromEntries(this.humanKeys.map((key) => [key, this[key]])), previous = this.inputTeam;
    Object.assign(this, this.humanSeats[team]);
    this.inputTeam = team;
    try {
      return fn();
    } finally {
      for (const key of this.humanKeys) this.humanSeats[team][key] = this[key];
      Object.assign(this, saved);
      this.inputTeam = previous;
    }
  }
  isHumanControlled(p) {
    return this.humanSeats ? this.humanSeats.some((s) => s.controlled === p && (p.role !== "GK" || this.ball.owner === p || s.manualKeeper)) : p === this.controlled && (p.role !== "GK" || this.ball.owner === p || this.manualKeeper);
  }
  direction(team) {
    return (team === 0 ? 1 : -1) * (this.half === 1 ? 1 : -1);
  }
  aiConfig(team) {
    return DIFFICULTY[this.humanSeats || team === 1 ? this.settings.difficulty : "normal"] || DIFFICULTY.normal;
  }
  active(team) {
    return this.players.filter((p) => p.team === team && !p.sentOff);
  }
  react(kind) {
    if (kind) this.lastReaction = { kind, time: this.elapsed };
  }
  notify(title, subtitle = "", seconds = 2.5) {
    this.message = title;
    const reaction = /GOAL|SAVE|MISS|FOUL|CARD|CORNER|PENALTY/.test(title) ? title : null;
    this.react(reaction);
    this.event("notice", { title, subtitle, seconds });
  }
  setPhase(phase) {
    if (this.pendingStrike && phase !== "playing") {
      this.pendingStrike.p.striking = false;
      this.pendingStrike = null;
    }
    if (phase !== "playing") {
      this.manualKeeper = false;
      this.keeperReturn = false;
      this.defensiveRoles = null;
      this.kickoffAttack = null;
    }
    if (this.humanSeats && phase !== "playing") for (const seat of this.humanSeats) {
      seat.charge = 0;
      seat.curveRequested = false;
      seat.manualKeeper = false;
      seat.keeperReturn = false;
    }
    this.phase = phase;
    this.phaseTime = 0;
    this.charge = 0;
    this.curveRequested = false;
    this.event("phase", phase);
  }
  resetFormation() {
    this.players.forEach((p) => p.reset(this.direction(p.team)));
    this.ball.reset();
    this.replayBuffer = [];
    this.replayFrames = [];
    this.replayActive = false;
    this.replayFocus = null;
    this.replayStage = "celebrate";
    this.replayStageTime = 0;
    this.replayPlayback = 0;
  }
  captureReplayFrame() {
    return { time: this.elapsed, ball: { x: this.ball.x, y: this.ball.y, z: this.ball.z, vx: this.ball.vx, vy: this.ball.vy, vz: this.ball.vz, rotationY: this.ball.rotationY, rollX: this.ball.rollX, rollZ: this.ball.rollZ }, players: this.players.map((p) => ({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, faceX: p.faceX, faceZ: p.faceZ })) };
  }
  recordReplayFrame() {
    if (this.phase !== "playing") return;
    this.replayBuffer.push(this.captureReplayFrame());
    while (this.replayBuffer.length > 2 && this.replayBuffer[0].time < this.elapsed - 4.5) this.replayBuffer.shift();
  }
  startReplay(finalFrame) {
    let frames = [...this.replayBuffer, finalFrame].filter((frame, index, array) => index === 0 || frame.time >= array[index - 1].time);
    if (frames.length < 2) {
      const rewind = 0.9;
      frames = [{ time: finalFrame.time - rewind, ball: { ...finalFrame.ball, x: finalFrame.ball.x - finalFrame.ball.vx * rewind, y: Math.max(0, finalFrame.ball.y - finalFrame.ball.vy * rewind), z: finalFrame.ball.z - finalFrame.ball.vz * rewind }, players: finalFrame.players.map((p) => ({ ...p, x: p.x - p.vx * rewind, z: p.z - p.vz * rewind })) }, finalFrame];
    }
    const end = frames.at(-1).time, start = Math.max(frames[0].time, end - 4.5);
    this.replayFrames = frames.filter((frame) => frame.time >= start);
    this.replayClock = 0;
    this.replayStage = "celebrate";
    this.replayStageTime = 0;
    this.replayPlayback = Math.max(2.4, Math.min(PRESENTATION.replay, this.replayFrames.at(-1).time - this.replayFrames[0].time || 2.4));
    this.replayActive = true;
    this.replayFocus = { x: finalFrame.ball.x, z: finalFrame.ball.z };
  }
  applyReplayFrame(frame, next, blend) {
    const b = frame.ball, n2 = next?.ball || b;
    this.ball.owner = null;
    this.ball.controlMode = "feet";
    for (const p of this.players) p.hasBall = false;
    this.ball.x = b.x + (n2.x - b.x) * blend;
    this.ball.y = b.y + (n2.y - b.y) * blend;
    this.ball.z = b.z + (n2.z - b.z) * blend;
    this.ball.vx = b.vx + (n2.vx - b.vx) * blend;
    this.ball.vy = b.vy + (n2.vy - b.vy) * blend;
    this.ball.vz = b.vz + (n2.vz - b.vz) * blend;
    this.ball.rotationY = b.rotationY + (n2.rotationY - b.rotationY) * blend;
    this.ball.rollX = b.rollX + (n2.rollX - b.rollX) * blend;
    this.ball.rollZ = b.rollZ + (n2.rollZ - b.rollZ) * blend;
    this.replayFocus = { x: this.ball.x, z: this.ball.z };
    this.players.forEach((p, index) => {
      const a = frame.players[index], q = next?.players[index] || a;
      p.x = a.x + (q.x - a.x) * blend;
      p.z = a.z + (q.z - a.z) * blend;
      p.vx = a.vx + (q.vx - a.vx) * blend;
      p.vz = a.vz + (q.vz - a.vz) * blend;
      p.faceX = a.faceX + (q.faceX - a.faceX) * blend;
      p.faceZ = a.faceZ + (q.faceZ - a.faceZ) * blend;
      p.action = null;
      p.animation = Math.hypot(p.vx, p.vz) > 0.2 ? "run" : "idle";
      p.locomotion = Math.hypot(p.vx, p.vz) > 0.2 ? "run" : "idle";
    });
  }
  updateReplay(dt) {
    if (!this.replayFrames.length) {
      this.finishReplay();
      return;
    }
    let remaining = Math.max(0, dt);
    while (remaining > 0 && this.replayActive) {
      if (this.replayStage === "celebrate") {
        const left = Math.max(0, PRESENTATION.replayLead - this.replayStageTime);
        if (remaining < left) {
          this.replayStageTime += remaining;
          return;
        }
        remaining -= left;
        this.replayStage = "transition";
        this.replayStageTime = 0;
        continue;
      }
      if (this.replayStage === "transition") {
        const left = Math.max(0, PRESENTATION.replayTransition - this.replayStageTime);
        if (remaining < left) {
          this.replayStageTime += remaining;
          return;
        }
        remaining -= left;
        this.replayStage = "playback";
        this.replayStageTime = 0;
        continue;
      }
      const step = Math.min(remaining, Math.max(0, this.replayPlayback - this.replayClock));
      this.replayClock += step;
      remaining -= step;
      const ratio = clamp(this.replayClock / this.replayPlayback, 0, 1), time = this.replayFrames[0].time + (this.replayFrames.at(-1).time - this.replayFrames[0].time) * ratio;
      let index = 0;
      while (index < this.replayFrames.length - 2 && this.replayFrames[index + 1].time < time) index++;
      const frame = this.replayFrames[index], next = this.replayFrames[index + 1] || frame, blend = clamp((time - frame.time) / Math.max(1e-3, next.time - frame.time), 0, 1);
      this.applyReplayFrame(frame, next, blend);
      if (this.replayClock >= this.replayPlayback) this.finishReplay();
    }
  }
  finishReplay() {
    if (!this.replayActive) return;
    this.replayActive = false;
    this.replayStage = "done";
    this.replayStageTime = 0;
    this.replayFocus = null;
    this.ball.settleInNet(this.direction(this.scoringTeam));
    const lead = this.celebratingPlayer;
    if (lead) lead.animate(this.goalCelebration || "celebrate-arms", PRESENTATION.goal - 0.5);
    this.players.filter((p) => p.team !== this.scoringTeam).forEach((p) => p.animate(p.role === "GK" ? "concede" : "miss", 2.4));
  }
  skipReplay() {
    if (this.phase === "goal" && this.replayActive) this.finishReplay();
  }
  skipIntro() {
    if (this.phase === "intro") {
      this.resetFormation();
      this.beginRestart({ type: "KICK OFF", team: 0, x: 0, z: 0 });
    }
  }
  pause(value = true) {
    if (["intro", "playing", "restart", "goal"].includes(this.phase)) {
      this.paused = value;
      this.charge = 0;
      this.curveRequested = false;
      this.event("pause", value);
    }
  }
  continueHalf() {
    if (this.phase !== "halftime") return;
    this.applySubstitutions();
    this.half = 2;
    this.resetFormation();
    this.beginRestart({ type: "KICK OFF", team: 1, x: 0, z: 0 });
    this.notify("SECOND HALF", "Ends changed \xB7 " + this.teams[1].name + " kickoff");
  }
  possessionTeam() {
    return this.ball.owner?.team ?? this.ball.pass?.team ?? this.ball.lastTouch?.team;
  }
  bestOutfield() {
    const point = ballIntercept(this.ball, 0.18), dir = this.direction(this.inputTeam);
    const score = /* @__PURE__ */ __name((p) => {
      const gap = distance(p, this.ball);
      return gap < 3 ? gap : gap * 0.7 + distance(p, point) * 0.3 + (p.x * dir > this.ball.x * dir ? 0.45 : 0) + (p.striking ? 3 : 0);
    }, "score");
    return this.active(this.inputTeam).filter((p) => p.role !== "GK").sort((a, b) => score(a) - score(b))[0];
  }
  toggleGoalkeeper() {
    if (this.phase !== "playing") return;
    const keeper = this.active(this.inputTeam).find((p) => p.role === "GK");
    if (!keeper) return;
    this.receiverAssist = false;
    this.charge = 0;
    this.curveRequested = false;
    if (this.controlled === keeper) {
      this.controlled = this.bestOutfield() || keeper;
      this.manualKeeper = false;
      this.keeperReturn = true;
      this.switchCooldown = 2.3;
    } else {
      this.controlled = keeper;
      this.manualKeeper = true;
      this.keeperReturn = false;
    }
  }
  selectPlayer(manual = false) {
    if (manual) {
      this.manualKeeper = false;
      this.keeperReturn = false;
    }
    if (!manual && this.manualKeeper && !this.controlled?.sentOff) return;
    if (!manual && this.keeperReturn && this.ball.owner?.team === this.inputTeam && this.ball.owner.role === "GK") return;
    this.keeperReturn = false;
    if (manual) this.receiverAssist = false;
    if (this.restart && this.phase === "restart") {
      if (this.restart.team === this.inputTeam) this.controlled = this.restart.taker;
      return;
    }
    if (this.ball.owner?.team === this.inputTeam && !this.ball.owner.sentOff) {
      this.controlled = this.ball.owner;
      return;
    }
    if (!manual && this.receiverAssist && this.ball.pass?.team === this.inputTeam && !this.ball.pass.target?.sentOff && this.ball.pass.target) {
      this.controlled = this.ball.pass.target;
      return;
    }
    const candidates = this.active(this.inputTeam).filter((p) => p.role !== "GK").sort((a, b) => distance(a, this.ball) - distance(b, this.ball));
    if (!candidates.length) return;
    if (manual) {
      this.controlled = this.bestOutfield() || candidates[0];
      this.switchCooldown = 2.3;
    } else if (this.controlled?.role === "GK" || this.switchCooldown <= 0 && (!this.controlled || this.controlled.sentOff || distance(this.controlled, this.ball) > distance(candidates[0], this.ball) + 5)) {
      this.controlled = candidates[0];
      this.switchCooldown = 0.8;
    }
  }
  update(dt, input) {
    if (this.paused) return;
    this.phaseTime += dt;
    this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    this.players.forEach((p) => p.tick(dt));
    this.referee.tick(dt);
    advanceStrike(this, dt);
    if (this.moment) {
      this.moment.time -= dt;
      if (this.moment.time <= 0) this.moment = null;
    }
    if (["halftime", "fulltime"].includes(this.phase)) {
      this.players.forEach((p) => p.move(0, 0, 0, dt));
      return;
    }
    if (this.phase === "home") {
      for (const p of this.players) {
        p.move(Math.cos(this.phaseTime * 0.4 + p.slot) * 0.5, Math.sin(this.phaseTime * 0.4 + p.slot) * 0.5, 0.25, dt);
      }
      return;
    }
    if (this.phase === "intro") {
      if (this.phaseTime >= INTRO.walk) for (const p of this.players) {
        const h = this.formations[p.team]?.[p.slot] || FORMATION[p.slot], x = h.x * this.direction(p.team);
        p.move(x - p.x, h.z - p.z, Math.min(0.42, Math.hypot(x - p.x, h.z - p.z) * 0.6), dt);
        p.watch({ x: 0, z: 0 });
      }
      if (this.phaseTime >= INTRO.duration) this.skipIntro();
      return;
    }
    if (this.phase === "goal") {
      if (this.replayActive) {
        this.updateReplay(dt);
        if (this.replayActive) return;
      }
      this.ball.integrate(dt);
      this.players.forEach((p) => {
        const lead = this.celebratingPlayer;
        if (p === lead && p.action?.name === "celebrate-slide") {
          p.x = clamp(p.x + p.vx * dt, -FIELD.halfLength + 0.5, FIELD.halfLength - 0.5);
          p.z = clamp(p.z + p.vz * dt, -FIELD.halfWidth + 0.5, FIELD.halfWidth - 0.5);
          p.vx *= Math.exp(-1.4 * dt);
          p.vz *= Math.exp(-1.4 * dt);
        } else if (p === lead && p.action?.name === "celebrate-arms" && this.phaseTime < 2.4) p.move(-this.direction(p.team) * 0.3, Math.sign(p.z) || 1, 0.35, dt);
        else if (p.team === this.scoringTeam && p !== lead && p.role !== "GK" && lead && distance(p, lead) > 2.3) p.move(lead.x - p.x, lead.z - p.z, 0.5, dt);
        else p.move(0, 0, 0, dt);
        if (p.team === this.scoringTeam && p !== lead && lead && distance(p, lead) < 3 && !p.action) p.animate("applaud", 1);
      });
      if (this.phaseTime > PRESENTATION.goal) {
        this.resetFormation();
        this.beginRestart({ type: "KICK OFF", team: 1 - this.scoringTeam, x: 0, z: 0 });
      }
      return;
    }
    if (this.phase === "restart") {
      if (this.humanSeats) this.withHuman(this.restart.team, () => this.updateRestart(dt, this.restart.team === 0 ? input : this.remoteInput));
      else this.updateRestart(dt, input);
      return;
    }
    if (this.phase !== "playing") return;
    this.elapsed += dt;
    for (const p of this.players) {
      p.previousX = p.x;
      p.previousZ = p.z;
    }
    if (this.ball.owner) this.stats[this.ball.owner.team].possession += dt;
    if (this.humanSeats) {
      for (let team = 0; team < 2; team++) this.withHuman(team, () => this.updateHuman(dt, team === 0 ? input : this.remoteInput));
    } else this.updateHuman(dt, input);
    updateAI(this, dt);
    if (this.phase !== "playing") return;
    if (this.humanSeats) {
      for (const seat of this.humanSeats) this.autoSteal(seat.controlled);
    } else this.autoSteal(this.controlled);
    if (this.phase !== "playing") return;
    this.separatePlayers();
    const refX = clamp(this.ball.x - this.direction(this.ball.owner?.team ?? 0) * fieldUnits(5), -FIELD.halfLength + fieldUnits(4), FIELD.halfLength - fieldUnits(4));
    const refZ = clamp(this.ball.z + fieldUnits(5), -FIELD.halfWidth + fieldUnits(3), FIELD.halfWidth - fieldUnits(3));
    this.referee.watch(this.ball);
    this.referee.move(refX - this.referee.x, refZ - this.referee.z, 0.9, dt, distance(this.referee, this.ball) > fieldUnits(18));
    const previous = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
    this.ball.update(dt);
    this.recordReplayFrame();
    const frame = goalFrameContact(this.ball, previous), boundary = boundaryEvent(this.ball, previous, [this.direction(0), this.direction(1)]);
    const limit = Math.min(frame?.t ?? 1, boundary?.time ?? 1);
    const contact = (!this.ball.owner || !boundary) && this.collisions(dt, previous, limit);
    if (!contact && frame && frame.t <= (boundary?.time ?? 1)) resolveFrameContact(this.ball, frame);
    else if (!contact && boundary) {
      if (boundary.type === "GOAL") this.goal(boundary.team);
      else {
        if (this.ball.shot) {
          this.ball.shot.player.animate("miss", 1.6);
          this.moment = { type: "miss", player: this.ball.shot.player, time: 1.5 };
          this.notify("MISS", playerLabel(this.ball.shot.player), 1.6);
        }
        this.beginRestart(boundary);
      }
      return;
    }
    if (this.half === 1 && this.elapsed >= this.settings.duration * 30) {
      this.elapsed = this.settings.duration * 30;
      this.ball.release();
      this.setPieceContext = null;
      this.applySubstitutions();
      this.autoSubstitute();
      this.setPhase("halftime");
    } else if (this.half === 2 && this.elapsed >= this.settings.duration * 60) {
      this.elapsed = this.settings.duration * 60;
      this.setPhase("fulltime");
      this.players.forEach((p) => p.animate(this.stats[p.team].goals > this.stats[1 - p.team].goals ? "celebrate-arms" : this.stats[p.team].goals < this.stats[1 - p.team].goals ? "concede" : "applaud", 4));
    }
  }
  updateHuman(dt, input) {
    const touchPass = input?.isTouchHeld?.("pass");
    this.passHeldTime = input?.held.has("pass") && !touchPass ? this.passHeldTime + dt : 0;
    const owner = this.ball.owner;
    this.selectPlayer();
    const move = input?.movement() || { x: 0, z: 0, intensity: 0 };
    if (input?.pressed.has("switch")) this.selectPlayer(true);
    if (input?.pressed.has("goalie")) this.toggleGoalkeeper();
    if (input?.pressed.has("pass")) {
      if (owner?.team === this.inputTeam) {
        this.manualKeeper = false;
        this.keeperReturn = false;
        this.controlled = owner;
      } else this.selectPlayer(true);
    }
    if (touchPass && !this.manualKeeper && this.possessionTeam() !== this.inputTeam && (this.humanSeats ? input.holdAutoSwitch !== false : this.settings.holdAutoSwitch !== false)) {
      this.holdSwitchTime += dt;
      if (this.holdSwitchTime >= 0.22) {
        this.selectPlayer(true);
        this.holdSwitchTime = 0;
      }
    } else this.holdSwitchTime = 0;
    if (this.controlled && !this.controlled.sentOff) {
      if (input?.held.has("pass") && !touchPass && owner && owner.team !== this.inputTeam && move.intensity < 0.1) {
        const n2 = normalize(owner.x - this.controlled.x, owner.z - this.controlled.z);
        this.controlled.move(n2.x, n2.z, 1, dt, input.held.has("sprint"));
      } else if (!owner && this.ball.pass?.target === this.controlled && move.intensity < 0.1) {
        const point = (this.ball.y > 2 || distance(this.ball, this.controlled) > fieldUnits(7)) && Math.hypot(this.ball.vx, this.ball.vz) > 8 ? this.ball.pass : ballIntercept(this.ball, 0.35), gap = distance(point, this.controlled);
        this.controlled.move(point.x - this.controlled.x, point.z - this.controlled.z, Math.min(1, gap / 2), dt, gap > fieldUnits(5));
      } else this.controlled.move(move.x, move.z, move.intensity, dt, input?.held.has("sprint"), owner?.team === 1 - this.inputTeam && move.intensity < 0.7 && distance(this.controlled, this.ball) < 10 ? this.ball : null);
      if (owner === this.controlled && this.ball.controlMode === "hands") {
        const keeper = this.controlled, dir = this.direction(keeper.team), depth = clamp(keeper.x * dir + FIELD.halfLength, 0.65, FIELD.boxDepth - 0.65);
        keeper.x = (depth - FIELD.halfLength) * dir;
        keeper.z = clamp(keeper.z, -FIELD.boxHalf + 0.65, FIELD.boxHalf - 0.65);
        if (!keeper.action) keeper.animate("keeper-hold", 0.7);
      }
      if (input?.pressed.has("pass")) {
        if (owner === this.controlled) this.requestPass(this.controlled, move.intensity > 0.15 ? move : null);
      }
      if (input?.pressed.has("skill")) this.skill(this.controlled, move);
      this.chargeShot(dt, input, owner === this.controlled && !this.cancelShotUntilRelease);
      if (this.charge > 0) this.aimZ = clamp(move.z * FIELD.goalHalf * 1.15 + this.controlled.z * 0.1, -FIELD.goalHalf * 1.08, FIELD.goalHalf * 1.08);
      if (input?.pressed.has("shoot") && owner !== this.controlled) {
        if (!owner && this.ball.y < 3.1 && distance(this.ball, this.controlled) < 2.2) {
          const { y, vy } = this.ball, high = y > 2;
          this.claim(this.controlled);
          this.ball.y = y;
          this.ball.vy = vy;
          this.shoot(this.controlled, 0.55, null, { firstTime: true, header: high });
        }
      }
      if (input?.released.has("shoot")) {
        if (owner === this.controlled && !this.cancelShotUntilRelease) this.requestShot(this.controlled, Math.max(0.15, this.charge), move.intensity > 0.1 ? move : null, { curve: this.curveRequested });
        this.charge = 0;
        this.curveRequested = false;
        this.cancelShotUntilRelease = false;
      }
      if (owner !== this.controlled) {
        this.charge = 0;
        this.curveRequested = false;
      }
    }
  }
  separatePlayers() {
    const active = this.players.filter((p) => !p.sentOff);
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j], gap = distance(a, b);
      if (gap < 0.82) {
        const n2 = gap > 1e-3 ? normalize(b.x - a.x, b.z - a.z) : { x: (i + j) % 2 ? 1 : 0, z: (i + j) % 2 ? 0 : 1 }, push = (0.82 - gap) * 0.5;
        a.x = clamp(a.x - n2.x * push, -FIELD.halfLength - FIELD.playerMargin, FIELD.halfLength + FIELD.playerMargin);
        a.z = clamp(a.z - n2.z * push, -FIELD.halfWidth - FIELD.playerMargin, FIELD.halfWidth + FIELD.playerMargin);
        b.x = clamp(b.x + n2.x * push, -FIELD.halfLength - FIELD.playerMargin, FIELD.halfLength + FIELD.playerMargin);
        b.z = clamp(b.z + n2.z * push, -FIELD.halfWidth - FIELD.playerMargin, FIELD.halfWidth + FIELD.playerMargin);
        const closing = (a.vx - b.vx) * n2.x + (a.vz - b.vz) * n2.z;
        if (closing > 0) {
          const impulse = closing * 0.5;
          a.vx -= n2.x * impulse;
          a.vz -= n2.z * impulse;
          b.vx += n2.x * impulse;
          b.vz += n2.z * impulse;
        }
      }
    }
  }
  claim(p, options = {}) {
    if (this.setPieceContext && this.setPieceContext.team !== p.team) this.setPieceContext = null;
    p.receivedFrom = this.ball.pass?.team === p.team ? this.ball.pass.from : null;
    if (this.ball.pass?.team === p.team && this.ball.pass.from !== p) this.stats[p.team].completed++;
    const pressure = this.active(1 - p.team).filter((o) => distance(o, p) < 4).length;
    this.ball.take(p, { pressure, random: this.random, ...options });
    this.ball.lock = Math.max(this.ball.lock, 0.09);
    if (this.humanSeats) {
      const seat = this.humanSeats[p.team];
      if (!seat.manualKeeper) seat.controlled = p;
    } else if (p.team === 0 && !this.manualKeeper) this.controlled = p;
  }
  onTarget() {
    if (this.ball.shot && !this.ball.shot.counted) {
      this.stats[this.ball.shot.team].onTarget++;
      this.ball.shot.player.onTarget = (this.ball.shot.player.onTarget || 0) + 1;
      this.ball.shot.counted = true;
    }
  }
  collisions(dt, previous = null, maxTime = 1) {
    const b = this.ball;
    if (b.lock > 0) return false;
    if (b.owner) {
      const p = b.owner;
      if (b.controlMode === "hands") return false;
      for (const o of this.active(1 - p.team)) {
        if (o.role === "GK" && keeperContact(this, o)) return true;
        if (distance(o, b) < (p.skill > 0 ? 0.43 : 0.7) && o.cooldown <= 0 && p.cooldown <= 0) {
          this.claim(o);
          o.animate("intercept", 0.45);
          p.animate("stumble", 0.4);
          o.tackles++;
          o.cooldown = 0.5;
          return true;
        }
      }
      return false;
    }
    const end = { x: b.x, y: b.y, z: b.z }, start = previous || end, speed = Math.hypot(b.vx, b.vz), candidates = [];
    for (const p of this.players) {
      if (p.sentOff || p.cooldown > 0) continue;
      const keeper = p.role === "GK" && p.team !== b.lastTouch?.team && p.x * this.direction(p.team) <= -FIELD.halfLength + FIELD.boxDepth && Math.abs(p.z) <= FIELD.boxHalf;
      const add = /* @__PURE__ */ __name((kind, radius, height, min = 0) => {
        const hit = playerContact(p, start, end, radius, height, min, !!previous);
        if (hit && hit.t <= maxTime + 1e-8) candidates.push({ p, kind, hit });
      }, "add");
      if (keeper) add("keeper", p.action?.name === "keeper-dive" ? 2.45 : 1.25, 3.5);
      else {
        add("feet", 1, 1.12);
        if (p.role !== "GK" && (p === this.controlled && this.passHeldTime > 0.18 || p.team === 1 && p.x * this.direction(p.team) > FIELD.halfLength - FIELD.boxDepth * 1.2)) add("header", 1.2, 2.85, 1.15);
        if (b.lastTouch?.team !== p.team && (b.shot || speed > 26)) add("block", 0.72, 2.45, 1.12);
      }
    }
    candidates.sort((a, b2) => a.hit.t - b2.hit.t);
    for (const { p, kind, hit } of candidates) {
      if (p.cooldown > 0) continue;
      b.x = hit.x;
      b.y = hit.y;
      b.z = hit.z;
      if (kind === "keeper") {
        if (keeperContact(this, p)) return true;
        Object.assign(b, end);
        continue;
      }
      if (kind === "block" || kind === "feet" && speed > 26 && b.lastTouch?.team !== p.team) {
        reflectVelocity(b, hit.normal, 0.33, 0.72);
        b.touch(p);
        b.spin *= 0.5;
        b.lock = 0.1;
        p.cooldown = 0.3;
        p.tackles++;
        p.animate("block", 0.5);
        return true;
      }
      if (kind === "header") {
        if (p === this.controlled) this.pass(p, null, { firstTime: true, header: true });
        else this.header(p);
        return true;
      }
      const firstTime = p === this.controlled && this.passHeldTime > 0.18 && b.pass?.team === p.team;
      this.claim(p);
      if (firstTime) this.pass(p, null, { firstTime: true });
      return true;
    }
    Object.assign(b, end);
    return false;
  }
  requestPass(p, aim = null, options = {}) {
    if (!p.striking) this.pass(p, aim, { ...options, windup: true });
  }
  requestShot(p, power = 0.5, aim = null, options = {}) {
    if (!p.striking) this.shoot(p, power, aim, { ...options, windup: true });
  }
  pass(p, aim = null, { firstTime = false, header = false, windup = false } = {}) {
    let target = bestPass(this, p, aim);
    if (header) target = this.active(p.team).filter((o) => o !== p && o.role !== "GK").sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (!target) return;
    const direction = this.direction(p.team), d = distance(p, target);
    const cross = (this.restart?.type === "CORNER" || Math.abs(p.z) > FIELD.halfWidth * 0.64) && p.x * direction > fieldUnits(10) && Math.abs(target.z) < FIELD.boxHalf;
    const through = target.x * direction > p.x * direction + fieldUnits(3), lead = through ? fieldUnits(3.2) * p.attributes.passLead : 0;
    const anticipation = clamp(d / 50, 0.35, 0.9);
    const tx = clamp(target.x + target.vx * anticipation + direction * lead, -FIELD.halfLength + 1.5, FIELD.halfLength - 1.5);
    const tz = clamp(target.z + target.vz * anticipation, -FIELD.halfWidth + 1.5, FIELD.halfWidth - 1.5);
    const travel = Math.hypot(tx - p.x, tz - p.z), flight = clamp(travel / 30, 1, 2);
    const hands = this.ball.controlMode === "hands" && this.ball.owner === p;
    const speed = cross ? clamp(travel * PLAY.airDrag / (1 - Math.exp(-PLAY.airDrag * flight)), PLAY.passMin, PLAY.passMax) : passSpeed(travel, clamp(5 + travel * 0.07, 5, 10));
    const aimDirection = normalize(tx - p.x, tz - p.z), backheel = p.faceX * aimDirection.x + p.faceZ * aimDirection.z < -0.65 && d < 13;
    const distribution = hands ? d < 24 ? "keeper-roll" : d < 45 ? "keeper-throw" : "keeper-punt" : p.role === "GK" ? "goal-kick" : null;
    const kind = distribution || (header ? "header-pass" : firstTime ? "first-pass" : backheel ? "backheel" : cross ? "cross" : through ? "through-pass" : d > 35 ? "long-pass" : d > 18 ? "firm-pass" : "short-pass");
    const leg = contactFoot(p, this.ball) === "right" ? 1 : -1;
    startStrike(this, p, kind, distribution ? 0.85 : cross ? 0.75 : 0.64, { side: leg, aim: aimDirection }, () => {
      this.ball.kick(
        p,
        tx - p.x,
        tz - p.z,
        header ? Math.min(speed, 28) : speed,
        header ? 1 : cross ? PLAY.gravity * flight * 0.5 : distribution === "keeper-throw" ? 4 : distribution === "keeper-punt" ? 7 : 0.45,
        { height: header ? 1.9 : distribution === "keeper-throw" ? 1.65 : distribution === "keeper-punt" ? 1.1 : FIELD.ballRadius + 0.04, spin: cross ? Math.sign(p.z) * 0.7 : 0 }
      );
      this.ball.pass = { from: p, team: p.team, target, x: tx, z: tz };
      this.ball.shot = null;
      this.stats[p.team].passes++;
      p.involvement += 0.4;
      if (this.humanSeats) {
        Object.assign(this.humanSeats[p.team], { controlled: target, switchCooldown: 1.4, receiverAssist: true });
      } else if (p.team === 0 && !this.manualKeeper) {
        this.controlled = target;
        this.switchCooldown = 1.4;
        this.receiverAssist = true;
      }
      if (this.phase === "restart") this.finishRestart();
    }, windup);
  }
  chargeShot(dt, input, allowed2 = true) {
    if (!allowed2 || input?.cancelled?.has("shoot") || !input?.held.has("shoot") && !input?.released.has("shoot")) {
      this.charge = 0;
      this.curveRequested = false;
      return;
    }
    if (input.held.has("shoot")) this.charge = clamp(this.charge + dt / 1.2, 0, 1);
    if (input.held.has("curve") || input.pressed.has("curve") || input.released.has("curve")) this.curveRequested = true;
  }
  previewShot() {
    return shotTechnique(this.controlled, this.ball, { x: this.direction(this.controlled?.team || 0) * FIELD.halfLength, z: this.aimZ }, { power: this.charge, curve: this.curveRequested });
  }
  shoot(p, power = 0.5, aim = null, { firstTime = false, header = false, curve = false, windup = false } = {}) {
    if (p.role === "GK" && this.ball.owner === p) {
      this.distributeKeeper(p, power, aim, windup);
      return;
    }
    const direction = this.direction(p.team), goalX = direction * FIELD.halfLength, config = this.aiConfig(p.team);
    let targetZ = this.phase === "restart" ? this.aimZ : clamp((aim?.z || 0) * FIELD.goalHalf * 1.15 + p.z * 0.1, -FIELD.goalHalf * 1.08, FIELD.goalHalf * 1.08);
    if (!this.humanSeats && p.team === 1) targetZ = chooseShotTarget(this, p);
    const shot = planShot(p, this.ball, { x: goalX, z: targetZ }, { power, curve, firstTime, header, random: this.random, accuracySpread: this.humanSeats || p.team === 0 ? fieldUnits(1.5) : (1 - config.accuracy) * fieldUnits(12) });
    startStrike(this, p, shot.kind, power > 0.8 ? 0.85 : 0.72, { side: shot.side, aim: shot.direction, power, skied: shot.skied }, () => {
      this.ball.kick(p, shot.direction.x, shot.direction.z, shot.speed, shot.lift, { height: shot.height, spin: shot.spin });
      this.ball.shot = { player: p, team: p.team, counted: false, setPiece: this.restart?.type || (this.setPieceContext?.team === p.team && this.elapsed - this.setPieceContext.time <= 8 ? this.setPieceContext.type : null), kind: shot.kind, foot: shot.foot, skied: shot.skied, power, assist: this.ball.previousTouch?.team === p.team ? this.ball.previousTouch : null };
      this.ball.pass = null;
      this.stats[p.team].shots++;
      p.shots = (p.shots || 0) + 1;
      p.touchFoot = shot.foot;
      p.involvement++;
      if (this.phase === "restart") this.finishRestart();
    }, windup);
  }
  distributeKeeper(p, power = 0.6, aim = null, windup = false) {
    const dir = this.direction(p.team), target = bestPass(this, p, aim || { x: dir, z: 0 }), hands = this.ball.controlMode === "hands";
    const x = clamp(p.x + dir * (38 + power * 35), -FIELD.halfLength + 3, FIELD.halfLength - 3), z = clamp(aim?.intensity > 0.1 ? p.z + aim.z * 24 : target?.z || 0, -FIELD.halfWidth + 3, FIELD.halfWidth - 3);
    const flight = 1.5 + power * 0.7, travel = Math.hypot(x - p.x, z - p.z), speed = clamp(travel * PLAY.airDrag / (1 - Math.exp(-PLAY.airDrag * flight)), 26, 48);
    startStrike(this, p, hands ? "keeper-punt" : "goal-kick", 0.85, { side: p.touchFoot === "left" ? -1 : 1, aim: normalize(x - p.x, z - p.z) }, () => {
      this.ball.kick(p, x - p.x, z - p.z, speed, PLAY.gravity * flight * 0.5, { height: hands ? 1.1 : FIELD.ballRadius + 0.04 });
      this.ball.pass = { from: p, team: p.team, target, x, z };
      this.ball.shot = null;
      this.stats[p.team].passes++;
      if (this.humanSeats && target) Object.assign(this.humanSeats[p.team], { controlled: target, manualKeeper: false, receiverAssist: true });
      if (p.team === 0 && target && (!this.manualKeeper || this.controlled === p)) {
        this.manualKeeper = false;
        this.controlled = target;
        this.receiverAssist = true;
        this.switchCooldown = 1;
      }
      if (this.phase === "restart") this.finishRestart();
    }, windup);
  }
  header(p) {
    this.shoot(p, 0.55, null, { firstTime: true, header: true });
  }
  skill(p, aim = null) {
    if (!p.striking) performSkill(this, p, aim);
  }
  autoSteal(p) {
    if (this.ball.lock > 0) return false;
    const b = this.ball, victim = b.owner;
    if (!p || p.sentOff || p.role === "GK" || p.striking || p.cooldown > 0 || this.paused || this.phase !== "playing" || b.controlMode === "hands") return false;
    if (victim?.team === p.team || b.y > 1.2 || distance(p, b) > 1.55) return false;
    if (p.action && ["fall", "roll-fall", "get-up", "slide-tackle", "stumble", "recover"].includes(p.action.name)) return false;
    if (victim) {
      const approach = normalize(p.x - victim.x, p.z - victim.z);
      if (distance(p, victim) > 2.15 || approach.x * victim.faceX + approach.z * victim.faceZ < -0.35) return false;
    } else if (Math.hypot(b.vx, b.vz) > 22) return false;
    this.tackle(p, { standing: true });
    p.cooldown = Math.max(p.cooldown, 0.85);
    return true;
  }
  tackle(p, { standing = false } = {}) {
    if (this.ball.lock > 0) return;
    if (p.cooldown > 0 || p.sentOff) return;
    const sliding = !standing && Math.hypot(p.vx, p.vz) > PLAY.runSpeed * 0.85;
    p.cooldown = sliding ? 1.1 : 0.65;
    p.animate(sliding ? "slide-tackle" : "standing-tackle", sliding ? 0.55 : 0.45, { side: 1 });
    const victim = this.ball.owner;
    if (victim && this.ball.controlMode === "hands") return;
    if (!victim) {
      if (standing && this.ball.y < 1.3 && distance(p, this.ball) < 1.65) {
        this.claim(p);
        p.animate("standing-tackle", 0.45);
        p.tackles++;
      }
      return;
    }
    if (victim.team === p.team || distance(p, victim) > (sliding ? 3.2 : 2.25)) return;
    const toward = normalize(p.x - victim.x, p.z - victim.z), behind = toward.x * victim.faceX + toward.z * victim.faceZ < -0.45;
    const late = distance(p, this.ball) > 1.95, protectedBall = victim.skill > 0;
    const foulChance = behind ? 0.55 : late ? 0.35 : protectedBall ? 0.28 : 0.06 / p.attributes.defending;
    if (this.random() < foulChance) {
      const severity = behind && Math.hypot(p.vx, p.vz) > PLAY.runSpeed * 1.15 ? "red" : behind || late ? "yellow" : "none";
      this.foul(p, victim, severity);
      return;
    }
    if (protectedBall && this.random() < 0.65) return;
    if (sliding) {
      this.ball.release(p.faceX * 7, p.faceZ * 7, 0.4);
      this.ball.touch(p);
      victim.animate("stumble", 0.55, { side: 1 });
    } else {
      this.claim(p);
      p.animate(distance(p, victim) < 1.1 ? "shoulder" : "standing-tackle", 0.5);
      victim.animate("stumble", 0.4, { side: -1 });
    }
    p.tackles++;
    p.cooldown = 0.5;
    victim.cooldown = 0.7;
    if (this.settings.minorInjuries !== false && this.random() < 0.045) this.minorInjury(victim, p);
  }
  minorInjury(player, opponent = null) {
    if (!player || player.injured || player.sentOff || this.settings.minorInjuries === false) return;
    player.injured = true;
    player.injuryTime = 3.5;
    this.stats[player.team].injuries = (this.stats[player.team].injuries || 0) + 1;
    const event = { team: player.team, player: player.name, jersey: player.jersey ?? null, playerId: player.id, time: this.elapsed };
    this.injuryEvents.push(event);
    player.animate("stumble", 0.8);
    this.notify("MINOR INJURY", playerLabel(player) + " needs attention", PRESENTATION.injury);
    this.event("injury", { player, opponent, event });
    const bench = this.benches[player.team] || [];
    if (bench.length && !this.pending.some((s) => s.out === player)) {
      const role = /* @__PURE__ */ __name((p) => /goal|keeper/i.test(p.position) ? "GK" : /def/i.test(p.position) ? "DEF" : /mid/i.test(p.position) ? "MID" : "FWD", "role");
      const incoming = bench.find((p) => role(p) === player.role) || bench[0];
      if (incoming) this.pending.push({ out: player, incoming, team: player.team });
    }
  }
  foul(offender, victim, severity = "none") {
    const foulNames = playerLabel(offender) + " \xB7 Foul on " + playerLabel(victim);
    this.stats[offender.team].fouls++;
    let title = "FOUL";
    if (severity === "yellow") {
      offender.yellow++;
      this.stats[offender.team].yellows++;
      title = "YELLOW CARD";
    }
    if (severity === "red" || offender.yellow >= 2) {
      offender.sentOff = true;
      this.stats[offender.team].reds++;
      title = "RED CARD";
    }
    if (this.ball.owner === offender) this.ball.release();
    const decisionTime = severity === "none" ? PRESENTATION.foul : PRESENTATION.card;
    this.referee.animate("card", decisionTime);
    this.referee.cardColor = title === "RED CARD" ? "#f43d38" : title === "YELLOW CARD" ? "#ffe24b" : null;
    this.beginRestart(foulRestart(victim, this.direction(victim.team)));
    victim.animate(severity === "red" ? "roll-fall" : "fall", 0.8, { side: Math.sign(victim.z - offender.z) || 1 });
    this.restart.readyAt = Math.max(this.restart.readyAt, decisionTime);
    offender.animate("card-reaction", decisionTime);
    this.moment = { type: "card", player: this.referee, time: decisionTime - 0.6 };
    this.referee.watch(offender);
    this.notify(title, foulNames, decisionTime);
    this.event("card", { player: offender, card: title });
    if (offender.sentOff && this.active(offender.team).length < 3) {
      this.stats[1 - offender.team].goals = Math.max(this.stats[1 - offender.team].goals, this.stats[offender.team].goals + 3);
      this.notify("MATCH AWARDED", "Too few players to continue");
      this.setPhase("fulltime");
    }
  }
  goal(team) {
    const last = this.ball.lastTouch, shot = this.ball.shot;
    const replayFrame = this.captureReplayFrame();
    const scorer = shot?.team === team ? shot.player : last, assist = shot?.team === team ? shot.assist : this.ball.previousTouch;
    this.stats[team].goals++;
    this.onTarget();
    const origin = shot?.team === team ? shot.setPiece : null;
    if (origin === "PENALTY") this.stats[team].penaltiesScored++;
    if (origin === "FREE KICK") this.stats[team].freeKickGoals++;
    if (origin === "CORNER") this.stats[team].cornerGoals++;
    if (scorer?.team === team) scorer.goals++;
    const assistant = assist && assist !== scorer && assist.team === team && scorer?.team === team ? assist : null;
    if (assistant) assistant.assists++;
    this.goalEvents.push({ team, name: scorer?.name || this.teams[team].name, jersey: scorer?.jersey ?? null, playerId: scorer?.id, assist: assistant?.name || null, assistJersey: assistant?.jersey ?? null, assistId: assistant?.id ?? null, setPiece: origin, ownGoal: scorer?.team !== team, time: this.elapsed });
    this.scoringTeam = team;
    this.ball.settleInNet(this.direction(team));
    this.celebratingPlayer = scorer?.team === team ? scorer : this.active(team).find((p) => p.role === "FWD");
    const celebrations = ["celebrate-slide", "celebrate-jump", "celebrate-arms", "celebrate-point", "celebrate-fist", "celebrate-calm"];
    const lateWinner = this.elapsed > this.settings.duration * 48 && this.stats[team].goals === this.stats[1 - team].goals + 1;
    const celebration = lateWinner ? "celebrate-jump" : this.celebratingPlayer?.data.leadershipRole === "captain" ? "celebrate-arms" : celebrations[Math.floor(this.random() * celebrations.length)];
    this.goalCelebration = celebration;
    this.celebratingPlayer?.animate(celebration, PRESENTATION.goal - 0.5);
    if (celebration === "celebrate-slide" && this.celebratingPlayer) {
      this.celebratingPlayer.vx = this.direction(team) * 3.2;
      this.celebratingPlayer.vz = 0;
    }
    this.players.filter((p) => p.team !== team).forEach((p) => p.animate(p.role === "GK" ? "concede" : "miss", 2.4));
    this.setPhase("goal");
    this.startReplay(replayFrame);
    this.notify("GOAL!", playerLabel(scorer) + " \xB7 " + this.teams[team].name, PRESENTATION.goal);
    this.event("goal", this.goalEvents.at(-1));
  }
  beginRestart(data) {
    this.setPieceContext = null;
    this.applySubstitutions();
    this.autoSubstitute();
    if (data.type === "PENALTY") this.stats[data.team].penalties++;
    if (data.type === "CORNER") this.stats[data.team].corners++;
    this.ball.reset(data.x, data.z);
    const direction = this.direction(data.team);
    let eligible = this.active(data.team);
    if (data.type === "GOAL KICK") eligible = eligible.filter((p) => p.role === "GK");
    else eligible = eligible.filter((p) => p.role !== "GK");
    const captain = this.active(data.team).find((p) => p.data.leadershipRole === "captain" && eligible.includes(p));
    const taker = ["PENALTY", "FREE KICK", "CORNER"].includes(data.type) && captain || [...eligible].sort((a, b) => distance(a, data) - distance(b, data))[0] || this.active(data.team)[0];
    if (!taker) {
      this.setPhase("fulltime");
      return;
    }
    this.restart = { ...data, taker, readyAt: Math.max(restartPresentation(data.type), this.moment?.time || 0) };
    this.aimZ = 0;
    if (data.type === "KICK OFF") this.resetFormation();
    for (const p of this.players) {
      if (p.sentOff || p === taker) continue;
      if (data.type === "PENALTY") {
        if (p.role === "GK") {
          p.x = -this.direction(p.team) * (FIELD.halfLength - 0.7);
          p.z = 0;
        } else {
          p.x = direction * (FIELD.halfLength - FIELD.boxDepth - fieldUnits(2 + p.slot % 3 * 2));
          p.z = (p.slot % 2 ? 1 : -1) * fieldUnits(6 + p.slot);
        }
      } else if (data.type === "CORNER") {
        if (p.role === "GK") {
          p.reset(this.direction(p.team));
        } else if (p.team === data.team && p.role === "DEF") {
          p.x = direction * fieldUnits(7);
          p.z = (p.slot % 2 ? 1 : -1) * fieldUnits(10);
        } else {
          p.x = direction * (FIELD.halfLength - fieldUnits(5 + p.slot % 3 * 3 + (p.team === data.team ? 0 : 1)));
          p.z = (p.slot % 2 ? 1 : -1) * fieldUnits(2 + p.slot);
        }
      } else if (data.type === "KICK OFF") {
        if (p.team !== data.team && distance(p, data) < FIELD.restartClearance) p.x = -this.direction(p.team) * FIELD.restartClearance;
      } else if (p.team !== data.team && distance(p, data) < FIELD.restartClearance) {
        let n2 = normalize(p.x - data.x || -direction, p.z - data.z || 1);
        p.x = clamp(data.x + n2.x * FIELD.restartClearance, -FIELD.halfLength + 0.8, FIELD.halfLength - 0.8);
        p.z = clamp(data.z + n2.z * FIELD.restartClearance, -FIELD.halfWidth + 0.8, FIELD.halfWidth - 0.8);
        if (distance(p, data) < FIELD.restartClearance - 0.1) {
          n2 = normalize(-data.x || -direction, -data.z || 1);
          p.x = data.x + n2.x * FIELD.restartClearance;
          p.z = data.z + n2.z * FIELD.restartClearance;
        }
      }
      p.vx = p.vz = 0;
    }
    taker.x = data.x - direction * 0.9;
    taker.z = data.z;
    taker.faceX = direction;
    taker.faceZ = 0;
    taker.vx = taker.vz = 0;
    this.ball.x = data.x;
    this.ball.z = data.z;
    this.ball.y = FIELD.ballRadius;
    this.ball.owner = taker;
    taker.hasBall = true;
    this.ball.lastTouch = taker;
    taker.holdTime = 0;
    if (this.humanSeats) {
      this.humanSeats[data.team].controlled = taker;
      this.humanSeats[data.team].aimZ = 0;
    } else if (data.team === 0) this.controlled = taker;
    this.setPhase("restart");
    this.notify(data.type, this.teams[data.team].name, this.restart.readyAt);
  }
  updateRestart(dt, input) {
    const r = this.restart;
    if (!r) return;
    if (this.pendingStrike) {
      r.taker.move(0, 0, 0, dt);
      return;
    }
    if (this.phaseTime < r.readyAt) {
      this.charge = 0;
      this.curveRequested = false;
      return;
    }
    const move = input?.movement() || { x: 0, z: 0, intensity: 0 };
    if (this.humanSeats || r.team === 0) {
      this.aimZ = clamp(this.aimZ + (move.z || move.x) * dt * FIELD.goalHalf * 0.9, -FIELD.goalHalf * 1.08, FIELD.goalHalf * 1.08);
      this.chargeShot(dt, input);
      if (this.phaseTime > 0.7) {
        if (input?.pressed.has("pass")) {
          this.requestPass(r.taker, move.intensity > 0.1 ? move : null);
          return;
        }
        if (input?.released.has("shoot")) {
          this.requestShot(r.taker, Math.max(0.15, this.charge), null, { curve: this.curveRequested });
          this.charge = 0;
          this.curveRequested = false;
          return;
        }
      }
    }
    const automatic = r.readyAt + (!this.humanSeats && r.team === 1 ? 2.4 : { "KICK OFF": 4, "THROW-IN": 6, "GOAL KICK": 8, "CORNER": 12, "FREE KICK": 14, "PENALTY": 16 }[r.type] || 10);
    if (this.phaseTime > automatic) {
      if (r.type === "PENALTY" || r.type === "FREE KICK" && FIELD.halfLength - r.x * this.direction(r.team) < PLAY.shootingRange) this.requestShot(r.taker, 0.65);
      else this.requestPass(r.taker);
    }
  }
  finishRestart() {
    const r = this.restart;
    this.setPieceContext = r?.type === "CORNER" ? { type: r.type, team: r.team, time: this.elapsed } : null;
    if (r?.type === "THROW-IN") {
      this.ball.y = 2;
      this.ball.vy = 3;
      r.taker.animate("keeper-throw", 0.6);
    }
    this.restart = null;
    this.setPhase("playing");
    if (!this.humanSeats && r?.type === "KICK OFF" && r.team === 1) this.kickoffAttack = { armed: this.random() < this.aiConfig(1).kickoffShot, used: false, until: this.elapsed + 12 };
  }
  queueSubstitution(outId, inId, team = 0) {
    const out = this.active(team).find((p) => p.id === outId), incoming = this.benches[team].find((p) => p.id === inId);
    if (!out || !incoming) throw Error("Select one active player and one available substitute.");
    if (this.pending.some((s) => s.out === out || s.incoming.id === inId)) throw Error("That player is already part of a pending substitution.");
    this.pending.push({ out, incoming, team });
    if (this.phase === "halftime" || this.phase === "restart") this.applySubstitutions();
    else this.notify("SUBSTITUTION QUEUED", "At the next stoppage");
  }
  applySubstitutions() {
    for (const sub of this.pending) {
      const { out, incoming, team } = sub;
      if (out.sentOff) continue;
      if (this.pendingStrike?.p === out) {
        out.striking = false;
        this.pendingStrike = null;
        this.charge = 0;
        this.curveRequested = false;
      }
      this.archive.push({ ...out });
      this.used[team].push(out.data);
      const saved = { x: out.x, z: out.z, slot: out.slot, team: out.team, role: out.role }, incomingData = { ...incoming };
      if (out.data.leadershipRole === "captain") incomingData.leadershipRole = "captain";
      const next = new Player(incomingData, team, out.slot, this.direction(team), this.formations[team]);
      Object.assign(out, next, saved);
      out.hasBall = this.ball.owner === out;
      this.benches[team] = this.benches[team].filter((p) => p.id !== incoming.id);
      this.stats[team].substitutions++;
      const event = { team, out: this.archive.at(-1).name, outJersey: this.archive.at(-1).jersey ?? null, in: incoming.name, inJersey: incoming.jersey ?? null, time: this.elapsed };
      this.subEvents.push(event);
      this.event("substitution", { player: out, ...event });
      out.animate("wave", 3.5);
      this.moment = { type: "substitution", player: out, time: PRESENTATION.substitution };
      if (this.phase === "restart" && this.restart) this.restart.readyAt = Math.max(this.restart.readyAt, this.phaseTime + PRESENTATION.substitution);
    }
    this.pending = [];
  }
  autoSubstitute() {
    if (this.humanSeats) return;
    if (this.stats[1].substitutions >= 3 || !this.benches[1].length) return;
    const threshold = this.settings.duration * 60 * (0.5 + this.stats[1].substitutions * 0.16);
    if (this.elapsed < threshold) return;
    const out = this.active(1).filter((p) => p.role !== "GK" && !this.used[1].some((q) => q.id === p.id)).sort((a, b) => b.yellow - a.yellow || a.involvement - b.involvement)[0];
    if (!out) return;
    const options = this.benches[1].filter((p) => !/goal|keeper/i.test(p.position));
    const role = /* @__PURE__ */ __name((p) => /def/i.test(p.position) ? "DEF" : /mid/i.test(p.position) ? "MID" : "FWD", "role");
    const incoming = options.find((p) => role(p) === out.role) || options[0];
    if (!incoming) return;
    this.pending.push({ out, incoming, team: 1 });
    this.applySubstitutions();
  }
};

// ../functions/engine/formation.js
var FORMATION_PRESETS = Object.freeze({
  "2-2-2": [
    { role: "GK", x: -0.9, z: 0 },
    { role: "DEF", x: -0.56, z: -0.42 },
    { role: "DEF", x: -0.56, z: 0.42 },
    { role: "MID", x: -0.16, z: -0.42 },
    { role: "MID", x: -0.16, z: 0.42 },
    { role: "FWD", x: 0.4, z: -0.28 },
    { role: "FWD", x: 0.4, z: 0.28 }
  ],
  "3-2-1": [
    { role: "GK", x: -0.9, z: 0 },
    { role: "DEF", x: -0.56, z: -0.56 },
    { role: "DEF", x: -0.56, z: 0 },
    { role: "DEF", x: -0.56, z: 0.56 },
    { role: "MID", x: -0.12, z: -0.38 },
    { role: "MID", x: -0.12, z: 0.38 },
    { role: "FWD", x: 0.4, z: 0 }
  ],
  "2-3-1": [
    { role: "GK", x: -0.9, z: 0 },
    { role: "DEF", x: -0.56, z: -0.4 },
    { role: "DEF", x: -0.56, z: 0.4 },
    { role: "MID", x: -0.1, z: -0.58 },
    { role: "MID", x: -0.1, z: 0 },
    { role: "MID", x: -0.1, z: 0.58 },
    { role: "FWD", x: 0.42, z: 0 }
  ],
  "3-1-2": [
    { role: "GK", x: -0.9, z: 0 },
    { role: "DEF", x: -0.56, z: -0.55 },
    { role: "DEF", x: -0.56, z: 0 },
    { role: "DEF", x: -0.56, z: 0.55 },
    { role: "MID", x: -0.08, z: 0 },
    { role: "FWD", x: 0.4, z: -0.35 },
    { role: "FWD", x: 0.4, z: 0.35 }
  ],
  "1-3-2": [
    { role: "GK", x: -0.9, z: 0 },
    { role: "DEF", x: -0.48, z: 0 },
    { role: "MID", x: -0.1, z: -0.56 },
    { role: "MID", x: -0.1, z: 0 },
    { role: "MID", x: -0.1, z: 0.56 },
    { role: "FWD", x: 0.42, z: -0.35 },
    { role: "FWD", x: 0.42, z: 0.35 }
  ]
});
var FORMATION_ORDER = Object.freeze(Object.keys(FORMATION_PRESETS));
var DEFAULT_FORMATION_ID = "2-2-2";
var FORMATION_LIMITS = Object.freeze({ xMin: -0.93, xMax: 0.92, zMin: -0.88, zMax: 0.88 });
function clampFormationPoint(point) {
  return { x: clamp(Number(point?.x) || 0, FORMATION_LIMITS.xMin, FORMATION_LIMITS.xMax), z: clamp(Number(point?.z) || 0, FORMATION_LIMITS.zMin, FORMATION_LIMITS.zMax) };
}
__name(clampFormationPoint, "clampFormationPoint");
function presetSlots(id = DEFAULT_FORMATION_ID) {
  const preset = FORMATION_PRESETS[id] || FORMATION_PRESETS[DEFAULT_FORMATION_ID];
  return preset.map((slot) => ({ ...slot }));
}
__name(presetSlots, "presetSlots");
function formationToWorld(slots) {
  return slots.map((slot, index) => {
    const point = clampFormationPoint(slot);
    return { role: slot.role || FORMATION[index]?.role || "MID", x: point.x * FIELD.halfLength, z: point.z * FIELD.halfWidth };
  });
}
__name(formationToWorld, "formationToWorld");

// ../functions/engine/h2h/simulation.js
var STEP = 1 / 120;
var ACTIONS = ["sprint", "pass", "shoot", "skill", "curve", "goalie"];
function seedRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 1831565813;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
__name(seedRandom, "seedRandom");
var idlePacket = /* @__PURE__ */ __name(() => ({ x: 0, z: 0, held: [], pressed: [], released: [], cancelled: [], touch: false }), "idlePacket");
function cleanInput(value = {}) {
  const x = Math.max(-1, Math.min(1, Number(value.x) || 0)), z = Math.max(-1, Math.min(1, Number(value.z) || 0)), n2 = Math.max(1, Math.hypot(x, z));
  const list = /* @__PURE__ */ __name((key) => [...new Set(Array.isArray(value[key]) ? value[key].filter((a) => ACTIONS.includes(a)) : [])], "list");
  return { x: Math.round(x / n2 * 1e3) / 1e3, z: Math.round(z / n2 * 1e3) / 1e3, held: list("held"), pressed: list("pressed"), released: list("released"), cancelled: list("cancelled"), touch: value.touch === true, holdAutoSwitch: value.holdAutoSwitch !== false };
}
__name(cleanInput, "cleanInput");
function decodeInput(packet) {
  const p = cleanInput(packet);
  return { ...p, held: new Set(p.held), pressed: new Set(p.pressed), released: new Set(p.released), cancelled: new Set(p.cancelled), movement: /* @__PURE__ */ __name(() => ({ x: p.x, z: p.z, intensity: Math.hypot(p.x, p.z) }), "movement"), isTouchHeld: /* @__PURE__ */ __name((a) => a === "pass" && p.touch, "isTouchHeld") };
}
__name(decodeInput, "decodeInput");
function buildSquad(team, selection) {
  if (!team || !FORMATION_PRESETS[selection.formation]) throw Error("Team or formation unavailable.");
  const ids = selection.lineup || team.lineup.map((p) => p.id);
  if (ids.length !== 7 || new Set(ids).size !== 7) throw Error("Choose seven different players.");
  const lineup = ids.map((id) => team.roster.find((p) => p.id === id));
  if (lineup.some((p) => !p)) throw Error("A selected player is not on this season\u2019s roster.");
  return { ...structuredClone(team), lineup: structuredClone(lineup), bench: structuredClone(team.roster.filter((p) => !ids.includes(p.id))), formation: formationToWorld(presetSlots(selection.formation)) };
}
__name(buildSquad, "buildSquad");
var LiveSimulation = class {
  static {
    __name(this, "LiveSimulation");
  }
  constructor(teams, settings, seed, event = () => {
  }) {
    this.match = new Match(teams, { ...settings, duration: matchDuration(settings.duration) }, { random: seedRandom(seed), event }).enableH2H();
    this.tick = 0;
    this.inputs = [decodeInput(idlePacket()), decodeInput(idlePacket())];
    this.halfReady = [false, false];
  }
  input(team, packet) {
    this.inputs[team] = decodeInput(packet);
  }
  command(team, command) {
    const m = this.match;
    if (command.type === "skipIntro") m.skipIntro();
    if (command.type === "skipReplay") m.skipReplay();
    if (command.type === "continue" && m.phase === "halftime") {
      this.halfReady[team] = true;
      if (this.halfReady.every(Boolean)) m.continueHalf();
    }
    if (command.type === "sub" && ["playing", "halftime", "restart"].includes(m.phase)) m.queueSubstitution(command.out, command.in, team);
  }
  step() {
    Object.assign(this.match, this.match.humanSeats[0]);
    this.match.remoteInput = this.inputs[1];
    this.match.update(STEP, this.inputs[0]);
    for (const p of this.inputs) {
      p.pressed.clear();
      p.released.clear();
      p.cancelled.clear();
    }
    this.tick++;
  }
};
function replayTrace(teams, settings, seed, events, endTick) {
  if (!Number.isInteger(endTick) || endTick < 1 || endTick > 24e4 || !Array.isArray(events) || events.length > 1e5) throw Error("Invalid match timeline.");
  const sim = new LiveSimulation(teams, settings, seed);
  let index = 0, previous = -1;
  for (const e of events) {
    if (!Number.isInteger(e.t) || e.t < previous || e.t >= endTick || ![0, 1].includes(e.side)) throw Error("Invalid input ordering.");
    previous = e.t;
  }
  while (sim.tick < endTick) {
    while (events[index]?.t === sim.tick) {
      const e = events[index++];
      if (e.input) sim.input(e.side, e.input);
      else if (e.command) sim.command(e.side, e.command);
      else throw Error("Empty input event.");
    }
    sim.step();
    if (sim.match.phase === "fulltime" && sim.tick !== endTick) throw Error("Inputs continued after full time.");
  }
  if (sim.match.phase !== "fulltime") throw Error("Match did not reach full time.");
  return sim.match;
}
__name(replayTrace, "replayTrace");

// ../functions/engine/account-store.js
function attributedHistory(profile) {
  return (profile.history || []).map((r) => ({ ...r, ownerId: r.ownerId || profile.uid, accountName: r.accountName || profile.username, accountNameInferred: r.accountNameInferred || !r.accountName }));
}
__name(attributedHistory, "attributedHistory");
function mergeAccountProfiles(source, target) {
  const merged = structuredClone(target), sum = /* @__PURE__ */ __name((a = {}, b = {}) => Object.fromEntries([.../* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, (Number(a[key]) || 0) + (Number(b[key]) || 0)])), "sum");
  merged.stats = sum(target.stats, source.stats);
  merged.modes = { ...target.modes };
  for (const mode of Object.keys(source.modes || {})) merged.modes[mode] = sum(target.modes?.[mode], source.modes[mode]);
  merged.modes.all = merged.stats;
  merged.trophies = [...target.trophies || [], ...source.trophies || []].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index).slice(0, 20);
  merged.history = [...attributedHistory(target), ...attributedHistory(source)].sort((a, b) => b.date - a.date).filter((item, index, list) => !item.id || list.findIndex((other) => other.id === item.id) === index).slice(0, 50);
  merged.records = { ...target.records };
  for (const [key, value] of Object.entries(source.records || {})) {
    if (value == null) continue;
    const current = merged.records[key];
    if (key === "longestWinningStreak") {
      merged.records[key] = Math.max(Number(current) || 0, Number(value) || 0);
      continue;
    }
    const metric = key.startsWith("fastest") ? "seconds" : key === "biggestWin" ? "margin" : "goals";
    if (current == null || (metric === "seconds" ? value[metric] < current[metric] : value[metric] > current[metric])) merged.records[key] = value;
  }
  merged.currentStreak = target.currentStreak || 0;
  return merged;
}
__name(mergeAccountProfiles, "mergeAccountProfiles");

// ../functions/catalog.json
var catalog_default = { "2024": [{ id: "silver-suits-strikers", name: "Silver Suits Strikers", shortName: "SSS", division: "Seniors", logo: "assets/logos/2024-silver-suits-strikers.png", logoBg: "#f8f8f8", colors: null, roster: [{ id: "abdul-wahab-dastagiri", name: "Abdul Wahab Dastagiri", jersey: 1, position: "Field", leadershipRole: null, profileId: "abdul-wahab-dastagiri", overall: 52, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Wahab Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abdul-jalil-alosman", name: "AbdulJalil Alosman", jersey: 2, position: "Field", leadershipRole: null, profileId: "abdul-jalil-alosman", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "AbdulJalil Alosman is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ahmad-ingar", name: "Ahmad Ingar", jersey: 3, position: "Field", leadershipRole: "assistant", profileId: "ahmad-ingar", overall: 65, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ahmad Ingar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ayaan-jogiyat", name: "Ayaan Jogiyat", jersey: 4, position: "Field", leadershipRole: null, profileId: "ayaan-jogiyat", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ayaan Jogiyat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "hussain-rizvi", name: "Hussain Rizvi", jersey: 5, position: "Field", leadershipRole: null, profileId: "hussain-rizvi", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hussain Rizvi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "marwan-ahmad", name: "Marwan Ahmad", jersey: 6, position: "Field", leadershipRole: "captain", profileId: "marwan-ahmad", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Marwan Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mustafa-sakhiyar", name: "Mustafa Sakhiyar", jersey: 7, position: "Field", leadershipRole: null, profileId: "mustafa-sakhiyar", overall: 51, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mustafa Sakhiyar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mustafa-hussain-rizvi", name: "Mustafa Hussain Rizvi", jersey: 8, position: "Field", leadershipRole: null, profileId: "mustafa-hussain-rizvi", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mustafa Hussain Rizvi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "muhammad-zahran", name: "Muhammad Zahran", jersey: 9, position: "Field", leadershipRole: null, profileId: "muhammad-zahran", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Zahran is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "mohammed-hanzala", name: "Mohammed Hanzala", jersey: 10, position: "Field", leadershipRole: null, profileId: "mohammed-hanzala", overall: 64, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Hanzala Hasan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-hammad-syed", name: "Mohammed Hammad Syed", jersey: 11, position: "Field", leadershipRole: null, profileId: "mohammed-hammad-syed", overall: 95, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Hammad Syed plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "uzair-sidat", name: "Uzair Sidat", jersey: 12, position: "Field", leadershipRole: null, profileId: "uzair-sidat", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uzair Sidat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hammad-shaikh", name: "Hammad Shaikh", jersey: 13, position: "Goalkeeper", leadershipRole: "assistant", profileId: "hammad-shaikh", overall: 83, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hammad Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }], overall: 62, season: "2024", lineup: [{ id: "hammad-shaikh", name: "Hammad Shaikh", jersey: 13, position: "Goalkeeper", leadershipRole: "assistant", profileId: "hammad-shaikh", overall: 83, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hammad Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "abdul-wahab-dastagiri", name: "Abdul Wahab Dastagiri", jersey: 1, position: "Field", leadershipRole: null, profileId: "abdul-wahab-dastagiri", overall: 52, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Wahab Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 1 }, { id: "abdul-jalil-alosman", name: "AbdulJalil Alosman", jersey: 2, position: "Field", leadershipRole: null, profileId: "abdul-jalil-alosman", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "AbdulJalil Alosman is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 2 }, { id: "ahmad-ingar", name: "Ahmad Ingar", jersey: 3, position: "Field", leadershipRole: "assistant", profileId: "ahmad-ingar", overall: 65, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ahmad Ingar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "ayaan-jogiyat", name: "Ayaan Jogiyat", jersey: 4, position: "Field", leadershipRole: null, profileId: "ayaan-jogiyat", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ayaan Jogiyat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 4 }, { id: "hussain-rizvi", name: "Hussain Rizvi", jersey: 5, position: "Field", leadershipRole: null, profileId: "hussain-rizvi", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hussain Rizvi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 5 }, { id: "marwan-ahmad", name: "Marwan Ahmad", jersey: 6, position: "Field", leadershipRole: "captain", profileId: "marwan-ahmad", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Marwan Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "mustafa-sakhiyar", name: "Mustafa Sakhiyar", jersey: 7, position: "Field", leadershipRole: null, profileId: "mustafa-sakhiyar", overall: 51, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mustafa Sakhiyar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mustafa-hussain-rizvi", name: "Mustafa Hussain Rizvi", jersey: 8, position: "Field", leadershipRole: null, profileId: "mustafa-hussain-rizvi", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mustafa Hussain Rizvi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "muhammad-zahran", name: "Muhammad Zahran", jersey: 9, position: "Field", leadershipRole: null, profileId: "muhammad-zahran", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Zahran is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "mohammed-hanzala", name: "Mohammed Hanzala", jersey: 10, position: "Field", leadershipRole: null, profileId: "mohammed-hanzala", overall: 64, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Hanzala Hasan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-hammad-syed", name: "Mohammed Hammad Syed", jersey: 11, position: "Field", leadershipRole: null, profileId: "mohammed-hammad-syed", overall: 95, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Hammad Syed plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "uzair-sidat", name: "Uzair Sidat", jersey: 12, position: "Field", leadershipRole: null, profileId: "uzair-sidat", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uzair Sidat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "refuel-juicery-kickers", name: "Refuel Juicery Kickers", shortName: "RJK", division: "Seniors", logo: "assets/logos/2024-refuel-juicery-kickers.png", logoBg: "#2a4b47", colors: null, roster: [{ id: "abubakr-amirat", name: "Abubakr Amirat", jersey: 1, position: "Field", leadershipRole: null, profileId: "abubakr-amirat", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abubakr Amirat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "muzamil-kharooti", name: "Muzamil Kharooti", jersey: 9, position: "Forward", leadershipRole: "captain", profileId: "muzamil-kharooti", overall: 99, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Muzamil Kharooti is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "muhammad-hassan", name: "Muhammad Hassan", jersey: 3, position: "Field", leadershipRole: null, profileId: "muhammad-hassan", overall: 72, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Hassan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "muhammad-iqrash", name: "Muhammad Iqrash", jersey: 4, position: "Field", leadershipRole: null, profileId: "muhammad-iqrash", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Iqrash is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "muhammad-zaidan", name: "Muhammad Zaidan", jersey: 5, position: "Field", leadershipRole: null, profileId: "muhammad-zaidan", overall: 78, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Muhammad Zaidan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "reda-alijalam", name: "Mohamad Reda Alijalam", jersey: 6, position: "Field", leadershipRole: null, profileId: "reda-alijalam", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamad Reda Alijalam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "omar-ajmal", name: "Omar Ajmal", jersey: 7, position: "Field", leadershipRole: null, profileId: "omar-ajmal", overall: 83, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Omar Ajmal brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "subhanullah-sharza", name: "Subhanullah Sharza", jersey: 8, position: "Field", leadershipRole: null, profileId: "subhanullah-sharza", overall: 82, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Subhanallah Sharzah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "sufyan-munshi", name: "Sufyan Munshi", jersey: 9, position: "Field", leadershipRole: null, profileId: "sufyan-munshi", overall: 71, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Sufyan Munshi brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "taha-ahmed", name: "Taha Ahmed", jersey: 10, position: "Field", leadershipRole: null, profileId: "taha-ahmed", overall: 76, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "umar-nakhuda", name: "Umar Nakhuda", jersey: 11, position: "Field", leadershipRole: null, profileId: "umar-nakhuda", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Umar Nakhuda is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "yousuf-haqqani", name: "Yousuf Haqqani", jersey: 12, position: "Field", leadershipRole: null, profileId: "yousuf-haqqani", overall: 72, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Yousuf Haqqani is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ziyad-adam", name: "Ziyad Adam", jersey: 13, position: "Field", leadershipRole: "assistant", profileId: "ziyad-adam", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ziyad Adam profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "saad-khan", name: "Saad Khan", jersey: 14, position: "Goalkeeper", leadershipRole: "assistant", profileId: "saad-khan", overall: 99, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Saad Khan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }], overall: 78, season: "2024", lineup: [{ id: "saad-khan", name: "Saad Khan", jersey: 14, position: "Goalkeeper", leadershipRole: "assistant", profileId: "saad-khan", overall: 99, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Saad Khan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "abubakr-amirat", name: "Abubakr Amirat", jersey: 1, position: "Field", leadershipRole: null, profileId: "abubakr-amirat", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abubakr Amirat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 1 }, { id: "muhammad-hassan", name: "Muhammad Hassan", jersey: 3, position: "Field", leadershipRole: null, profileId: "muhammad-hassan", overall: 72, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Hassan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 2 }, { id: "muhammad-iqrash", name: "Muhammad Iqrash", jersey: 4, position: "Field", leadershipRole: null, profileId: "muhammad-iqrash", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Iqrash is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 3 }, { id: "muhammad-zaidan", name: "Muhammad Zaidan", jersey: 5, position: "Field", leadershipRole: null, profileId: "muhammad-zaidan", overall: 78, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Muhammad Zaidan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "MID", slot: 4 }, { id: "muzamil-kharooti", name: "Muzamil Kharooti", jersey: 9, position: "Forward", leadershipRole: "captain", profileId: "muzamil-kharooti", overall: 99, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Muzamil Kharooti is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", slot: 5 }, { id: "reda-alijalam", name: "Mohamad Reda Alijalam", jersey: 6, position: "Field", leadershipRole: null, profileId: "reda-alijalam", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamad Reda Alijalam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "omar-ajmal", name: "Omar Ajmal", jersey: 7, position: "Field", leadershipRole: null, profileId: "omar-ajmal", overall: 83, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Omar Ajmal brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "subhanullah-sharza", name: "Subhanullah Sharza", jersey: 8, position: "Field", leadershipRole: null, profileId: "subhanullah-sharza", overall: 82, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Subhanallah Sharzah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "sufyan-munshi", name: "Sufyan Munshi", jersey: 9, position: "Field", leadershipRole: null, profileId: "sufyan-munshi", overall: 71, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Sufyan Munshi brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "taha-ahmed", name: "Taha Ahmed", jersey: 10, position: "Field", leadershipRole: null, profileId: "taha-ahmed", overall: 76, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "umar-nakhuda", name: "Umar Nakhuda", jersey: 11, position: "Field", leadershipRole: null, profileId: "umar-nakhuda", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Umar Nakhuda is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "yousuf-haqqani", name: "Yousuf Haqqani", jersey: 12, position: "Field", leadershipRole: null, profileId: "yousuf-haqqani", overall: 72, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Yousuf Haqqani is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ziyad-adam", name: "Ziyad Adam", jersey: 13, position: "Field", leadershipRole: "assistant", profileId: "ziyad-adam", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ziyad Adam profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "shifa-pharmacy-fc", name: "Shifa Pharmacy F.C.", shortName: "SPF", division: "Seniors", logo: "assets/logos/2024-shifa-pharmacy-fc.png", logoBg: "#94bcc5", colors: null, roster: [{ id: "abdul-ghiyas-solyman", name: "Abdul Ghiyas Solyman", jersey: 8, position: "Field", leadershipRole: "captain", profileId: "abdul-ghiyas-solyman", overall: 92, playstyle: { label: "Creator", traits: ["Passing", "Chance creation", "Unselfish play"], description: "Abdul Ghiyas Solyman plays more like a setup player, moving the ball into better areas and helping teammates get cleaner looks at goal." } }, { id: "ali-shadab-shaikh", name: "Ali Shadab Shaikh", jersey: 2, position: "Field", leadershipRole: null, profileId: "ali-shadab-shaikh", overall: 63, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ali Shadab Shaikh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ayaz-a-tutla", name: "Ayaz A Tutla", jersey: 3, position: "Field", leadershipRole: null, profileId: "ayaz-a-tutla", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ayaz A Tutla is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ayub-jan", name: "Ayub Jan", jersey: 4, position: "Field", leadershipRole: null, profileId: "ayub-jan", overall: 85, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ayub Jan profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "bayizedsha", name: "Bayizedsha", jersey: 5, position: "Field", leadershipRole: null, profileId: "bayizedsha", overall: 81, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Bayizedsha is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "basir-ahmad-dastagiri", name: "Basir Ahmad Dastagiri", jersey: 6, position: "Field", leadershipRole: null, profileId: "basir-ahmad-dastagiri", overall: 66, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Basir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ilyas-salim", name: "Ilyas Salim", jersey: 7, position: "Field", leadershipRole: null, profileId: "ilyas-salim", overall: 71, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ilyas Salim profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "muhammad-affan", name: "Muhammad Affan", jersey: 8, position: "Forward", leadershipRole: "assistant", profileId: "muhammad-affan", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M. Affan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammad-hamzah-wahab", name: "Mohammad hamzah wahab", jersey: 9, position: "Field", leadershipRole: null, profileId: "mohammad-hamzah-wahab", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mohammad hamzah wahab is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "taha-nakhuda", name: "Taha Nakhuda", jersey: 10, position: "Field", leadershipRole: null, profileId: "taha-nakhuda", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taaha Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tayyib-mohammed", name: "Tayyib Mohammad", jersey: 11, position: "Field", leadershipRole: null, profileId: "tayyib-mohammed", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tayyib Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tulha-ahmad", name: "Tulha Ahmad", jersey: 12, position: "Field", leadershipRole: null, profileId: "tulha-ahmed", overall: 84, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tulha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "aneeq-shaikh", name: "Aneeq Shaikh", jersey: 13, position: "Goalkeeper", leadershipRole: "assistant", profileId: "aneeq-shaikh", overall: 94, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Aneeq Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }], overall: 79, season: "2024", lineup: [{ id: "aneeq-shaikh", name: "Aneeq Shaikh", jersey: 13, position: "Goalkeeper", leadershipRole: "assistant", profileId: "aneeq-shaikh", overall: 94, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Aneeq Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "abdul-ghiyas-solyman", name: "Abdul Ghiyas Solyman", jersey: 8, position: "Field", leadershipRole: "captain", profileId: "abdul-ghiyas-solyman", overall: 92, playstyle: { label: "Creator", traits: ["Passing", "Chance creation", "Unselfish play"], description: "Abdul Ghiyas Solyman plays more like a setup player, moving the ball into better areas and helping teammates get cleaner looks at goal." }, role: "DEF", slot: 1 }, { id: "ali-shadab-shaikh", name: "Ali Shadab Shaikh", jersey: 2, position: "Field", leadershipRole: null, profileId: "ali-shadab-shaikh", overall: 63, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ali Shadab Shaikh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 2 }, { id: "ayaz-a-tutla", name: "Ayaz A Tutla", jersey: 3, position: "Field", leadershipRole: null, profileId: "ayaz-a-tutla", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ayaz A Tutla is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 3 }, { id: "ayub-jan", name: "Ayub Jan", jersey: 4, position: "Field", leadershipRole: null, profileId: "ayub-jan", overall: 85, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ayub Jan profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 4 }, { id: "muhammad-affan", name: "Muhammad Affan", jersey: 8, position: "Forward", leadershipRole: "assistant", profileId: "muhammad-affan", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M. Affan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "bayizedsha", name: "Bayizedsha", jersey: 5, position: "Field", leadershipRole: null, profileId: "bayizedsha", overall: 81, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Bayizedsha is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 6 }], bench: [{ id: "basir-ahmad-dastagiri", name: "Basir Ahmad Dastagiri", jersey: 6, position: "Field", leadershipRole: null, profileId: "basir-ahmad-dastagiri", overall: 66, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Basir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ilyas-salim", name: "Ilyas Salim", jersey: 7, position: "Field", leadershipRole: null, profileId: "ilyas-salim", overall: 71, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ilyas Salim profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammad-hamzah-wahab", name: "Mohammad hamzah wahab", jersey: 9, position: "Field", leadershipRole: null, profileId: "mohammad-hamzah-wahab", overall: 65, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mohammad hamzah wahab is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "taha-nakhuda", name: "Taha Nakhuda", jersey: 10, position: "Field", leadershipRole: null, profileId: "taha-nakhuda", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taaha Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tayyib-mohammed", name: "Tayyib Mohammad", jersey: 11, position: "Field", leadershipRole: null, profileId: "tayyib-mohammed", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tayyib Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tulha-ahmad", name: "Tulha Ahmad", jersey: 12, position: "Field", leadershipRole: null, profileId: "tulha-ahmed", overall: 84, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tulha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "jogiat-palace", name: "Jogiat Palace", shortName: "JOG", division: "Seniors", logo: "assets/logos/2024-jogiat-palace.png", logoBg: "#08684c", colors: null, roster: [{ id: "aamir-jogiat", name: "Aamir Jogiat", jersey: 1, position: "Field", leadershipRole: null, profileId: "aamir-jogiat", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Aamir Jogiat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mubashir-kharooti", name: "Mubashir Kharooti", jersey: 4, position: "Field", leadershipRole: null, profileId: "mubashir-kharooti", overall: 80, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abdur-rakib", name: "Abdur Rakib", jersey: 3, position: "Field", leadershipRole: "assistant", profileId: "abdur-rakib", overall: 79, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdur Rakib brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ayhaam-khalefa", name: "Ayhaam Khalefa", jersey: 11, position: "Field", leadershipRole: null, profileId: "ayhaam-khalefa", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ayhaam Khalefa brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "elyas-roien", name: "Elyas Roien", jersey: 5, position: "Field", leadershipRole: null, profileId: "elyas-roien", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Elyas Roien brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ismail-mohammed", name: "Ismail Mohammed", jersey: 6, position: "Field", leadershipRole: null, profileId: "ismail-mohammed", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ismail Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "m-yahya", name: "M Yahya", jersey: 7, position: "Field", leadershipRole: null, profileId: "m-yahya", overall: 95, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M Yahya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-nakhuda", name: "Muhammad Nakhuda", jersey: 8, position: "Field", leadershipRole: null, profileId: "muhammad-nakhuda", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhammad Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-teli", name: "Muhummud Teli", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "muhammad-teli", overall: 92, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhummud Teli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohamed-aathif", name: "Mohamed Aathif", jersey: 10, position: "Field", leadershipRole: null, profileId: "mohamed-aathif", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamed Aathif brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "rehaan-adam", name: "Rehaan Adam", jersey: 6, position: "Forward", leadershipRole: "captain", profileId: "rehaan-adam", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehaan Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zakariya-chhibu", name: "Zakariya Chhibu", jersey: 12, position: "Field", leadershipRole: null, profileId: "zakariya-chhibu", overall: 84, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zakariya Chhibu profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ali-razzaq", name: "Ali Razzaq", jersey: 13, position: "Goalkeeper", leadershipRole: null, profileId: "ali-razzaq", overall: 97, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Ali Razzaq plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }], overall: 77, season: "2024", lineup: [{ id: "ali-razzaq", name: "Ali Razzaq", jersey: 13, position: "Goalkeeper", leadershipRole: null, profileId: "ali-razzaq", overall: 97, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Ali Razzaq plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "aamir-jogiat", name: "Aamir Jogiat", jersey: 1, position: "Field", leadershipRole: null, profileId: "aamir-jogiat", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Aamir Jogiat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 1 }, { id: "mubashir-kharooti", name: "Mubashir Kharooti", jersey: 4, position: "Field", leadershipRole: null, profileId: "mubashir-kharooti", overall: 80, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 2 }, { id: "abdur-rakib", name: "Abdur Rakib", jersey: 3, position: "Field", leadershipRole: "assistant", profileId: "abdur-rakib", overall: 79, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdur Rakib brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "ayhaam-khalefa", name: "Ayhaam Khalefa", jersey: 11, position: "Field", leadershipRole: null, profileId: "ayhaam-khalefa", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ayhaam Khalefa brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "rehaan-adam", name: "Rehaan Adam", jersey: 6, position: "Forward", leadershipRole: "captain", profileId: "rehaan-adam", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehaan Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "elyas-roien", name: "Elyas Roien", jersey: 5, position: "Field", leadershipRole: null, profileId: "elyas-roien", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Elyas Roien brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "ismail-mohammed", name: "Ismail Mohammed", jersey: 6, position: "Field", leadershipRole: null, profileId: "ismail-mohammed", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ismail Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "m-yahya", name: "M Yahya", jersey: 7, position: "Field", leadershipRole: null, profileId: "m-yahya", overall: 95, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M Yahya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-nakhuda", name: "Muhammad Nakhuda", jersey: 8, position: "Field", leadershipRole: null, profileId: "muhammad-nakhuda", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhammad Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-teli", name: "Muhummud Teli", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "muhammad-teli", overall: 92, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhummud Teli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohamed-aathif", name: "Mohamed Aathif", jersey: 10, position: "Field", leadershipRole: null, profileId: "mohamed-aathif", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamed Aathif brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zakariya-chhibu", name: "Zakariya Chhibu", jersey: 12, position: "Field", leadershipRole: null, profileId: "zakariya-chhibu", overall: 84, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zakariya Chhibu profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "asif-gangat-united", name: "Asif Gangat United", shortName: "AGU", division: "Seniors", logo: "assets/logos/2024-asif-gangat-united.png", logoBg: "#766078", colors: null, roster: [{ id: "abdul-basit-mesbah", name: "Abdul Basit Mesbah", jersey: 1, position: "Field", leadershipRole: null, profileId: "abdul-basit-mesbah", overall: 74, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Basit Mesbah brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "azizullah", name: "Azizullah", jersey: 2, position: "Field", leadershipRole: null, profileId: "azizullah", overall: 79, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Azizullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "hafizullah", name: "Hafizullah", jersey: 3, position: "Forward", leadershipRole: "captain", profileId: "hafizullah", overall: 97, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Hafizullah is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "hamzah-gangat", name: "Hamzah Gangat", jersey: 4, position: "Field", leadershipRole: null, profileId: "hamzah-gangat", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hamzah Gangat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "huzaifa-ahmad-vadia", name: "Huzaifa Ahmad Vadia", jersey: 5, position: "Field", leadershipRole: null, profileId: "huzaifa-ahmad-vadia", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Huzaifa Ahmed Vadia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "muhammad-badin", name: "Muhammad Badin", jersey: 6, position: "Field", leadershipRole: null, profileId: "muhammad-badin", overall: 57, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhammed Badin brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-salim", name: "Muhammad Salim", jersey: 7, position: "Field", leadershipRole: "assistant", profileId: "muhammad-salim", overall: 76, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Salim profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "muhammad-okasha", name: "Muhammad Okasha", jersey: 8, position: "Field", leadershipRole: null, profileId: "muhammad-okasha", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Okasha is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "mussadiq-khan", name: "Mussadiq Khan", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "mussadiq-khan", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mussadiq Khan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "rehan-ahmad", name: "Rehan Ahmad", jersey: 10, position: "Field", leadershipRole: null, profileId: "rehan-ahmad", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rehan Ahmad is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "rizwaan-amirat", name: "Rizwaan Amirat", jersey: 11, position: "Field", leadershipRole: null, profileId: "rizwaan-amirat", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rizwaan Amirat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "rizwan-khan", name: "Rizwan Khan", jersey: 12, position: "Field", leadershipRole: null, profileId: "rizwan-khan", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rizwan Khan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "saifan-mohammed", name: "Saifan Mohammed", jersey: 13, position: "Field", leadershipRole: null, profileId: "saifan-mohammed", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Saifan Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], overall: 65, season: "2024", lineup: [{ id: "abdul-basit-mesbah", name: "Abdul Basit Mesbah", jersey: 1, position: "Goalkeeper", leadershipRole: null, profileId: "abdul-basit-mesbah", overall: 74, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Basit Mesbah brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "GK", designation: "Backup Goalie", slot: 0 }, { id: "azizullah", name: "Azizullah", jersey: 2, position: "Field", leadershipRole: null, profileId: "azizullah", overall: 79, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Azizullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "hamzah-gangat", name: "Hamzah Gangat", jersey: 4, position: "Field", leadershipRole: null, profileId: "hamzah-gangat", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hamzah Gangat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 2 }, { id: "huzaifa-ahmad-vadia", name: "Huzaifa Ahmad Vadia", jersey: 5, position: "Field", leadershipRole: null, profileId: "huzaifa-ahmad-vadia", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Huzaifa Ahmed Vadia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 3 }, { id: "muhammad-badin", name: "Muhammad Badin", jersey: 6, position: "Field", leadershipRole: null, profileId: "muhammad-badin", overall: 57, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhammed Badin brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "hafizullah", name: "Hafizullah", jersey: 3, position: "Forward", leadershipRole: "captain", profileId: "hafizullah", overall: 97, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Hafizullah is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", designation: "Best Forward", slot: 5 }, { id: "muhammad-salim", name: "Muhammad Salim", jersey: 7, position: "Field", leadershipRole: "assistant", profileId: "muhammad-salim", overall: 76, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Salim profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "FWD", slot: 6 }], bench: [{ id: "muhammad-okasha", name: "Muhammad Okasha", jersey: 8, position: "Field", leadershipRole: null, profileId: "muhammad-okasha", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Okasha is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "mussadiq-khan", name: "Mussadiq Khan", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "mussadiq-khan", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mussadiq Khan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "rehan-ahmad", name: "Rehan Ahmad", jersey: 10, position: "Field", leadershipRole: null, profileId: "rehan-ahmad", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rehan Ahmad is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "rizwaan-amirat", name: "Rizwaan Amirat", jersey: 11, position: "Field", leadershipRole: null, profileId: "rizwaan-amirat", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rizwaan Amirat is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "rizwan-khan", name: "Rizwan Khan", jersey: 12, position: "Field", leadershipRole: null, profileId: "rizwan-khan", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rizwan Khan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "saifan-mohammed", name: "Saifan Mohammed", jersey: 13, position: "Field", leadershipRole: null, profileId: "saifan-mohammed", overall: 56, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Saifan Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "umer-memon-fc", name: "Umer Memon F.C.", shortName: "UMF", division: "Seniors", logo: "assets/logos/2024-umer-memon-fc.png", logoBg: "#d8d3d3", colors: null, roster: [{ id: "anan-abrar", name: "Anan Abrar", jersey: 1, position: "Field", leadershipRole: null, profileId: "anan-abrar", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Anan Abrar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "asad-khan", name: "Asad Khan", jersey: 2, position: "Field", leadershipRole: null, profileId: "asad-khan", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Asad Khan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "saad-saud", name: "Saad Saud", jersey: 66, position: "Field", leadershipRole: null, profileId: "saad-saud", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Saad Saud brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "bashir-ahmad-dastagiri", name: "Bashir Ahmad Dadtagiri", jersey: 3, position: "Field", leadershipRole: null, profileId: "bashir-ahmad-dastagiri", overall: 69, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bashir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "bilal-sami-ahmad", name: "Bilal Sami Ahmad", jersey: 4, position: "Field", leadershipRole: null, profileId: "bilal-sami-ahmad", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bilal Sami Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "haroon-sarood", name: "Haroon Sarood", jersey: 5, position: "Field", leadershipRole: "captain", profileId: "haroon-sarood", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Haroon Sarood brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hashir-hassan", name: "Hashir Hassan", jersey: 6, position: "Field", leadershipRole: null, profileId: "hashir-hassan", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hashir Hassan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ibrahim-mohamed", name: "Ibrahim Mohamed", jersey: 56, position: "Field", leadershipRole: null, profileId: "ibrahim-mohamed", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ibrahim Mohamed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "imran-abdulimiti", name: "Imran Abdulimiti", jersey: 8, position: "Field", leadershipRole: null, profileId: "imran-abdulimiti", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Imran Abdulimiti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "md-ismail-rayyan", name: "MD Ismail Rayyan", jersey: 9, position: "Field", leadershipRole: null, profileId: "md-ismail-rayyan", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "MD Ismail Rayyan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mubashir-khan", name: "Mubashir Khan", jersey: 10, position: "Field", leadershipRole: null, profileId: "mubashir-khan", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Khan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mubeen-tagari", name: "Mubeen Tagari", jersey: 11, position: "Field", leadershipRole: null, profileId: "mubeen-tagari", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubeen Tagari brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "uwais-bemat", name: "Uwais Bemat", jersey: 12, position: "Field", leadershipRole: "assistant", profileId: "uwais-bemat", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uwais Bemat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zain-adam", name: "Zain Adam", jersey: 13, position: "Field", leadershipRole: null, profileId: "zain-adam", overall: 54, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Zain Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-rayyan-sayed", name: "Mohammed Rayyan Sayed", jersey: 14, position: "Goalkeeper", leadershipRole: "assistant", profileId: "mohammed-rayyan-sayed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Rayyan Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 62, season: "2024", lineup: [{ id: "mohammed-rayyan-sayed", name: "Mohammed Rayyan Sayed", jersey: 14, position: "Goalkeeper", leadershipRole: "assistant", profileId: "mohammed-rayyan-sayed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Rayyan Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "GK", slot: 0 }, { id: "anan-abrar", name: "Anan Abrar", jersey: 1, position: "Field", leadershipRole: null, profileId: "anan-abrar", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Anan Abrar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 1 }, { id: "asad-khan", name: "Asad Khan", jersey: 2, position: "Field", leadershipRole: null, profileId: "asad-khan", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Asad Khan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 2 }, { id: "saad-saud", name: "Saad Saud", jersey: 66, position: "Field", leadershipRole: null, profileId: "saad-saud", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Saad Saud brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "bashir-ahmad-dastagiri", name: "Bashir Ahmad Dadtagiri", jersey: 3, position: "Field", leadershipRole: null, profileId: "bashir-ahmad-dastagiri", overall: 69, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bashir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "bilal-sami-ahmad", name: "Bilal Sami Ahmad", jersey: 4, position: "Field", leadershipRole: null, profileId: "bilal-sami-ahmad", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bilal Sami Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "haroon-sarood", name: "Haroon Sarood", jersey: 5, position: "Field", leadershipRole: "captain", profileId: "haroon-sarood", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Haroon Sarood brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "hashir-hassan", name: "Hashir Hassan", jersey: 6, position: "Field", leadershipRole: null, profileId: "hashir-hassan", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hashir Hassan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ibrahim-mohamed", name: "Ibrahim Mohamed", jersey: 56, position: "Field", leadershipRole: null, profileId: "ibrahim-mohamed", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ibrahim Mohamed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "imran-abdulimiti", name: "Imran Abdulimiti", jersey: 8, position: "Field", leadershipRole: null, profileId: "imran-abdulimiti", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Imran Abdulimiti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "md-ismail-rayyan", name: "MD Ismail Rayyan", jersey: 9, position: "Field", leadershipRole: null, profileId: "md-ismail-rayyan", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "MD Ismail Rayyan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mubashir-khan", name: "Mubashir Khan", jersey: 10, position: "Field", leadershipRole: null, profileId: "mubashir-khan", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Khan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mubeen-tagari", name: "Mubeen Tagari", jersey: 11, position: "Field", leadershipRole: null, profileId: "mubeen-tagari", overall: 53, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubeen Tagari brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "uwais-bemat", name: "Uwais Bemat", jersey: 12, position: "Field", leadershipRole: "assistant", profileId: "uwais-bemat", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uwais Bemat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zain-adam", name: "Zain Adam", jersey: 13, position: "Field", leadershipRole: null, profileId: "zain-adam", overall: 54, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Zain Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }], "2025": [{ id: "asif-gangat-united-2025", name: "Asif Gangat United", shortName: "AGU", division: "Seniors", logo: "assets/logos/2025-asif-gangat-united-2025.jpg", logoBg: "#868a69", colors: null, roster: [{ id: "mohammed-rayyan-sayed", name: "Mohammed Rayyan Sayed", jersey: 1, position: "Goalkeeper", leadershipRole: null, profileId: "mohammed-rayyan-sayed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Rayyan Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hafizullah", name: "Hafizullah", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "hafizullah", overall: 97, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Hafizullah is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "muhammad-affan", name: "Mohammed Affan", jersey: 3, position: "Forward", leadershipRole: "assistant", profileId: "muhammad-affan", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M. Affan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "sayem-mohammed-sadi", name: "Sayem Mohammed Sadi", jersey: 4, position: "Field", leadershipRole: null, profileId: "sayem-mohammed-sadi", overall: 80, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Sayem Mohamed Saad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "abdul-ghiyas-solyman", name: "Abdul Ghiya Solyman", jersey: 1, position: "Field", leadershipRole: "assistant", profileId: "abdul-ghiyas-solyman", overall: 92, playstyle: { label: "Creator", traits: ["Passing", "Chance creation", "Unselfish play"], description: "Abdul Ghiyas Solyman plays more like a setup player, moving the ball into better areas and helping teammates get cleaner looks at goal." } }, { id: "hammad-shaikh", name: "Hammad Shaikh", jersey: 6, position: "Field", leadershipRole: null, profileId: "hammad-shaikh", overall: 83, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hammad Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "muhammad-salim", name: "Mohammed Salim", jersey: 7, position: "Field", leadershipRole: null, profileId: "muhammad-salim", overall: 76, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Salim profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "huzaifa-ahmad-vadia", name: "Huzaifa Ahmed Vadia", jersey: 8, position: "Field", leadershipRole: null, profileId: "huzaifa-ahmad-vadia", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Huzaifa Ahmed Vadia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "haroon-sarood", name: "Haroon Sarood", jersey: 9, position: "Field", leadershipRole: null, profileId: "haroon-sarood", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Haroon Sarood brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-shah", name: "Muhammad Shah", jersey: 10, position: "Field", leadershipRole: null, profileId: "muhammad-shah", overall: 72, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Shah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "abdullah-patel", name: "Abdullah Patel", jersey: 11, position: "Field", leadershipRole: null, profileId: "abdullah-patel", overall: 60, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abdullah Patel is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "bilal-sami-ahmad", name: "Bilal Sami Syed", jersey: 12, position: "Field", leadershipRole: null, profileId: "bilal-sami-ahmad", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bilal Sami Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 79, season: "2025", lineup: [{ id: "mohammed-rayyan-sayed", name: "Mohammed Rayyan Sayed", jersey: 1, position: "Goalkeeper", leadershipRole: null, profileId: "mohammed-rayyan-sayed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Rayyan Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "GK", slot: 0 }, { id: "sayem-mohammed-sadi", name: "Sayem Mohammed Sadi", jersey: 4, position: "Field", leadershipRole: null, profileId: "sayem-mohammed-sadi", overall: 80, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Sayem Mohamed Saad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "abdul-ghiyas-solyman", name: "Abdul Ghiya Solyman", jersey: 1, position: "Field", leadershipRole: "assistant", profileId: "abdul-ghiyas-solyman", overall: 92, playstyle: { label: "Creator", traits: ["Passing", "Chance creation", "Unselfish play"], description: "Abdul Ghiyas Solyman plays more like a setup player, moving the ball into better areas and helping teammates get cleaner looks at goal." }, role: "DEF", slot: 2 }, { id: "hammad-shaikh", name: "Hammad Shaikh", jersey: 6, position: "Field", leadershipRole: null, profileId: "hammad-shaikh", overall: 83, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hammad Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "MID", slot: 3 }, { id: "muhammad-salim", name: "Mohammed Salim", jersey: 7, position: "Field", leadershipRole: null, profileId: "muhammad-salim", overall: 76, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Salim profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 4 }, { id: "hafizullah", name: "Hafizullah", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "hafizullah", overall: 97, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Hafizullah is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", designation: "Best Forward", slot: 5 }, { id: "muhammad-affan", name: "Mohammed Affan", jersey: 3, position: "Forward", leadershipRole: "assistant", profileId: "muhammad-affan", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M. Affan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "huzaifa-ahmad-vadia", name: "Huzaifa Ahmed Vadia", jersey: 8, position: "Field", leadershipRole: null, profileId: "huzaifa-ahmad-vadia", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Huzaifa Ahmed Vadia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "haroon-sarood", name: "Haroon Sarood", jersey: 9, position: "Field", leadershipRole: null, profileId: "haroon-sarood", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Haroon Sarood brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-shah", name: "Muhammad Shah", jersey: 10, position: "Field", leadershipRole: null, profileId: "muhammad-shah", overall: 72, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Shah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "abdullah-patel", name: "Abdullah Patel", jersey: 11, position: "Field", leadershipRole: null, profileId: "abdullah-patel", overall: 60, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abdullah Patel is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "bilal-sami-ahmad", name: "Bilal Sami Syed", jersey: 12, position: "Field", leadershipRole: null, profileId: "bilal-sami-ahmad", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bilal Sami Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "umer-memon-fc-2025", name: "Umer Memon FC", shortName: "UMF", division: "Seniors", logo: "assets/logos/2025-umer-memon-fc-2025.jpg", logoBg: "#b8b088", colors: null, roster: [{ id: "saad-khan", name: "Saad Khan", jersey: 1, position: "Goalkeeper", leadershipRole: null, profileId: "saad-khan", overall: 99, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Saad Khan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "muzamil-kharooti", name: "Muzamil Kharooti", jersey: 7, position: "Forward", leadershipRole: "captain", profileId: "muzamil-kharooti", overall: 99, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Muzamil Kharooti is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "yousaf-hosseinzada", name: "Yousaf Hosseinzada", jersey: 3, position: "Field", leadershipRole: null, profileId: "yousaf-hosseinzada", overall: 75, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yousaf Hosseinzada brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "azizullah", name: "Azizullah", jersey: 4, position: "Field", leadershipRole: null, profileId: "azizullah", overall: 79, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Azizullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "muhammad-teli", name: "Muhummud Teli", jersey: 5, position: "Field", leadershipRole: "assistant", profileId: "muhammad-teli", overall: 92, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhummud Teli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ishaaq-ali", name: "Ishaaq Ali", jersey: 6, position: "Field", leadershipRole: null, profileId: "ishaaq-ali", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ishaaq Ali profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "adil-mubashir", name: "Adil Mubashir", jersey: 7, position: "Field", leadershipRole: null, profileId: "adil-mubashir", overall: 90, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Adil Mubashir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-hanzala", name: "Mohammed Hanzala Hasan", jersey: 8, position: "Field", leadershipRole: null, profileId: "mohammed-hanzala", overall: 64, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Hanzala Hasan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "yusuf-ahmed-baharustani", name: "Yusuf Ahmed Baharustani", jersey: 9, position: "Field", leadershipRole: null, profileId: "yusuf-ahmed-baharustani", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yusuf Ahmed Baharustani brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "uwais-bemat", name: "Uwais Bemat", jersey: 10, position: "Field", leadershipRole: "assistant", profileId: "uwais-bemat", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uwais Bemat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hasan-hatia", name: "Hasan Hatia", jersey: 11, position: "Field", leadershipRole: null, profileId: "hasan-hatia", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hasan Hatia brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abdul-ahad-muabir", name: "Abdul Ahad Muabir", jersey: 12, position: "Field", leadershipRole: null, profileId: "abdul-ahad-muabir", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Ahad Muabir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 80, season: "2025", lineup: [{ id: "saad-khan", name: "Saad Khan", jersey: 1, position: "Goalkeeper", leadershipRole: null, profileId: "saad-khan", overall: 99, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Saad Khan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "yousaf-hosseinzada", name: "Yousaf Hosseinzada", jersey: 3, position: "Field", leadershipRole: null, profileId: "yousaf-hosseinzada", overall: 75, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yousaf Hosseinzada brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 1 }, { id: "azizullah", name: "Azizullah", jersey: 4, position: "Field", leadershipRole: null, profileId: "azizullah", overall: 79, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Azizullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "muhammad-teli", name: "Muhummud Teli", jersey: 5, position: "Field", leadershipRole: "assistant", profileId: "muhammad-teli", overall: 92, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhummud Teli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "ishaaq-ali", name: "Ishaaq Ali", jersey: 6, position: "Field", leadershipRole: null, profileId: "ishaaq-ali", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ishaaq Ali profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 4 }, { id: "muzamil-kharooti", name: "Muzamil Kharooti", jersey: 7, position: "Forward", leadershipRole: "captain", profileId: "muzamil-kharooti", overall: 99, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Muzamil Kharooti is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", slot: 5 }, { id: "adil-mubashir", name: "Adil Mubashir", jersey: 7, position: "Field", leadershipRole: null, profileId: "adil-mubashir", overall: 90, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Adil Mubashir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "mohammed-hanzala", name: "Mohammed Hanzala Hasan", jersey: 8, position: "Field", leadershipRole: null, profileId: "mohammed-hanzala", overall: 64, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Hanzala Hasan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "yusuf-ahmed-baharustani", name: "Yusuf Ahmed Baharustani", jersey: 9, position: "Field", leadershipRole: null, profileId: "yusuf-ahmed-baharustani", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yusuf Ahmed Baharustani brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "uwais-bemat", name: "Uwais Bemat", jersey: 10, position: "Field", leadershipRole: "assistant", profileId: "uwais-bemat", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uwais Bemat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hasan-hatia", name: "Hasan Hatia", jersey: 11, position: "Field", leadershipRole: null, profileId: "hasan-hatia", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hasan Hatia brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abdul-ahad-muabir", name: "Abdul Ahad Muabir", jersey: 12, position: "Field", leadershipRole: null, profileId: "abdul-ahad-muabir", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Ahad Muabir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "islamic-bookstore-runners", name: "Islamic Bookstore Runners", shortName: "IBR", division: "Seniors", logo: "assets/logos/2025-islamic-bookstore-runners.jpg", logoBg: "#6a603c", colors: null, roster: [{ id: "rayyan-kazi-mohammed", name: "Rayyan Kazi Mohammed", jersey: 1, position: "Field", leadershipRole: null, profileId: "rayyan-kazi-mohammed", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rayyan Kazi Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "mudassir", name: "Mudassir", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "mudassir", overall: 98, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mudassir is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "ahmad-ingar", name: "Ahmad Ingar", jersey: 3, position: "Field", leadershipRole: "assistant", profileId: "ahmad-ingar", overall: 65, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ahmad Ingar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tayyib-mohammed", name: "Tayyib Mohammed", jersey: 4, position: "Field", leadershipRole: null, profileId: "tayyib-mohammed", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tayyib Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zain-adam", name: "Zain Adam", jersey: 5, position: "Field", leadershipRole: null, profileId: "zain-adam", overall: 54, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Zain Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-farooq", name: "Muhammad Farooq", jersey: 6, position: "Field", leadershipRole: null, profileId: "muhammad-farooq", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Farooq is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "mohammed-hasan", name: "Mohammed Hasan", jersey: 7, position: "Field", leadershipRole: "assistant", profileId: "mohammed-hasan", overall: 74, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mohammed Hasan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "basir-ahmad-dastagiri", name: "Basir Ahmad Dastagiri", jersey: 8, position: "Field", leadershipRole: null, profileId: "basir-ahmad-dastagiri", overall: 66, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Basir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abubakar-mamun", name: "Abubakar Mamun", jersey: 9, position: "Field", leadershipRole: null, profileId: "abubakar-mamun", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abubakar Mamun is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "abdul-wahab-dastagiri", name: "Abdul Wahab Dastagiri", jersey: 10, position: "Field", leadershipRole: null, profileId: "abdul-wahab-dastagiri", overall: 52, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Wahab Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-badin", name: "Muhammed Badin", jersey: 11, position: "Field", leadershipRole: null, profileId: "muhammad-badin", overall: 57, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhammed Badin brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zakariyya-dualeh", name: "Zakariyya Dualeh", jersey: 12, position: "Field", leadershipRole: null, profileId: "zakariyya-dualeh", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Zakariyya Dualeh is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], overall: 63, season: "2025", lineup: [{ id: "rayyan-kazi-mohammed", name: "Rayyan Kazi Mohammed", jersey: 1, position: "Field", leadershipRole: null, profileId: "rayyan-kazi-mohammed", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Rayyan Kazi Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "GK", slot: 0 }, { id: "ahmad-ingar", name: "Ahmad Ingar", jersey: 3, position: "Field", leadershipRole: "assistant", profileId: "ahmad-ingar", overall: 65, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ahmad Ingar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 1 }, { id: "tayyib-mohammed", name: "Tayyib Mohammed", jersey: 4, position: "Field", leadershipRole: null, profileId: "tayyib-mohammed", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tayyib Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 2 }, { id: "zain-adam", name: "Zain Adam", jersey: 5, position: "Field", leadershipRole: null, profileId: "zain-adam", overall: 54, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Zain Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "muhammad-farooq", name: "Muhammad Farooq", jersey: 6, position: "Field", leadershipRole: null, profileId: "muhammad-farooq", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Farooq is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 4 }, { id: "mudassir", name: "Mudassir", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "mudassir", overall: 98, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mudassir is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", slot: 5 }, { id: "mohammed-hasan", name: "Mohammed Hasan", jersey: 7, position: "Field", leadershipRole: "assistant", profileId: "mohammed-hasan", overall: 74, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mohammed Hasan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 6 }], bench: [{ id: "basir-ahmad-dastagiri", name: "Basir Ahmad Dastagiri", jersey: 8, position: "Field", leadershipRole: null, profileId: "basir-ahmad-dastagiri", overall: 66, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Basir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abubakar-mamun", name: "Abubakar Mamun", jersey: 9, position: "Field", leadershipRole: null, profileId: "abubakar-mamun", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abubakar Mamun is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "abdul-wahab-dastagiri", name: "Abdul Wahab Dastagiri", jersey: 10, position: "Field", leadershipRole: null, profileId: "abdul-wahab-dastagiri", overall: 52, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Wahab Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-badin", name: "Muhammed Badin", jersey: 11, position: "Field", leadershipRole: null, profileId: "muhammad-badin", overall: 57, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhammed Badin brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zakariyya-dualeh", name: "Zakariyya Dualeh", jersey: 12, position: "Field", leadershipRole: null, profileId: "zakariyya-dualeh", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Zakariyya Dualeh is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "amax-optical-kickers", name: "Amax Optical Kickers", shortName: "AOK", division: "Seniors", logo: "assets/logos/2025-amax-optical-kickers.jpg", logoBg: "#b4ad83", colors: null, roster: [{ id: "ataa-shaikh", name: "Ataa Shaikh", jersey: 1, position: "Field", leadershipRole: null, profileId: "ataa-shaikh", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ataa Shaikh is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "uthman", name: "Uthman", jersey: 2, position: "Field", leadershipRole: "assistant", profileId: "uthman", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uthman Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tulha-ahmed", name: "Tulha Ahmed", jersey: 3, position: "Field", leadershipRole: null, profileId: "tulha-ahmed", overall: 84, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tulha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "taha-nakhuda", name: "Taaha Nakhuda", jersey: 4, position: "Field", leadershipRole: "captain", profileId: "taha-nakhuda", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taaha Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hamza-akalwala", name: "Hamza Akalwala", jersey: 5, position: "Field", leadershipRole: null, profileId: "hamza-akalwala", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hamza Akalwala is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ammar-mamun", name: "Ammar Mamun", jersey: 6, position: "Field", leadershipRole: null, profileId: "ammar-mamun", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ammar Mamun is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "subhan-ali-syed", name: "Subhan Ali Syed", jersey: 7, position: "Field", leadershipRole: null, profileId: "subhan-ali-syed", overall: 58, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Subhan Ali Syed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "mumin-milhan", name: "Mumin Milhan", jersey: 8, position: "Forward", leadershipRole: null, profileId: "mumin-milhan", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mumin Milhan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "aamir-jogiat", name: "Aamir Jogiat", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "aamir-jogiat", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Aamir Jogiat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "maaz", name: "Maaz", jersey: 10, position: "Field", leadershipRole: null, profileId: "maaz", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Maaz is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "hammad-hatia", name: "Hammad Hatia", jersey: 11, position: "Field", leadershipRole: null, profileId: "hammad-hatia", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hammad Hatia is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "zakariyya-motala", name: "Zakariyya Motala", jersey: 12, position: "Field", leadershipRole: null, profileId: "zakariyya-motala", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Zakariyya Motala is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "sufyan-munshi", name: "Sufyan Munshi", jersey: 13, position: "Field", leadershipRole: null, profileId: "sufyan-munshi", overall: 71, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Sufyan Munshi brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 63, season: "2025", lineup: [{ id: "ataa-shaikh", name: "Ataa Shaikh", jersey: 1, position: "Field", leadershipRole: null, profileId: "ataa-shaikh", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ataa Shaikh is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "GK", slot: 0 }, { id: "uthman", name: "Uthman", jersey: 2, position: "Field", leadershipRole: "assistant", profileId: "uthman", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uthman Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 1 }, { id: "tulha-ahmed", name: "Tulha Ahmed", jersey: 3, position: "Field", leadershipRole: null, profileId: "tulha-ahmed", overall: 84, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tulha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 2 }, { id: "taha-nakhuda", name: "Taaha Nakhuda", jersey: 4, position: "Field", leadershipRole: "captain", profileId: "taha-nakhuda", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taaha Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "hamza-akalwala", name: "Hamza Akalwala", jersey: 5, position: "Field", leadershipRole: null, profileId: "hamza-akalwala", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hamza Akalwala is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 4 }, { id: "mumin-milhan", name: "Mumin Milhan", jersey: 8, position: "Forward", leadershipRole: null, profileId: "mumin-milhan", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Mumin Milhan is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 5 }, { id: "ammar-mamun", name: "Ammar Mamun", jersey: 6, position: "Field", leadershipRole: null, profileId: "ammar-mamun", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ammar Mamun is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 6 }], bench: [{ id: "subhan-ali-syed", name: "Subhan Ali Syed", jersey: 7, position: "Field", leadershipRole: null, profileId: "subhan-ali-syed", overall: 58, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Subhan Ali Syed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "aamir-jogiat", name: "Aamir Jogiat", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "aamir-jogiat", overall: 67, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Aamir Jogiat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "maaz", name: "Maaz", jersey: 10, position: "Field", leadershipRole: null, profileId: "maaz", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Maaz is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "hammad-hatia", name: "Hammad Hatia", jersey: 11, position: "Field", leadershipRole: null, profileId: "hammad-hatia", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hammad Hatia is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "zakariyya-motala", name: "Zakariyya Motala", jersey: 12, position: "Field", leadershipRole: null, profileId: "zakariyya-motala", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Zakariyya Motala is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "sufyan-munshi", name: "Sufyan Munshi", jersey: 13, position: "Field", leadershipRole: null, profileId: "sufyan-munshi", overall: 71, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Sufyan Munshi brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "im-construction-sc", name: "IM Construction SC", shortName: "IMC", division: "Seniors", logo: "assets/logos/2025-im-construction-sc.jpg", logoBg: "#675f3d", colors: null, roster: [{ id: "muhammad-hasan-faraz", name: "Muhammad Hasan Faraz", jersey: 1, position: "Field", leadershipRole: null, profileId: "muhammad-hasan-faraz", overall: 60, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Hasan Faraz is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "rehaan-adam", name: "Rehaan Adam", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "rehaan-adam", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehaan Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "omar-ajmal", name: "Omar Ajmal", jersey: 3, position: "Forward", leadershipRole: "assistant", profileId: "omar-ajmal", overall: 83, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Omar Ajmal brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "waise-sherzi", name: "Waise Sherzi", jersey: 4, position: "Field", leadershipRole: null, profileId: "waise-sherzi", overall: 60, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Waise Sherzi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "amadu", name: "Amadu", jersey: 5, position: "Forward", leadershipRole: "assistant", profileId: "amadu", overall: 90, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Amadu is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "abdul-basit-mesbah", name: "Abdul Basit Mesbah", jersey: 6, position: "Field", leadershipRole: null, profileId: "abdul-basit-mesbah", overall: 74, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Basit Mesbah brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ayub-jan", name: "Ayub Jan", jersey: 7, position: "Field", leadershipRole: null, profileId: "ayub-jan", overall: 85, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ayub Jan profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "rehan-ahmed-mohammed", name: "Rehan Ahmed Mohammed", jersey: 8, position: "Field", leadershipRole: null, profileId: "rehan-ahmed-mohammed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehan Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "zakariya-chhibu", name: "Zakariya Chhibu", jersey: 9, position: "Field", leadershipRole: null, profileId: "zakariya-chhibu", overall: 84, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zakariya Chhibu profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammed-ali-siddiqui", name: "Mohammed Ali Siddiqui", jersey: 10, position: "Field", leadershipRole: null, profileId: "mohammed-ali-siddiqui", overall: 81, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Mohammed Ali Siddiqui profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ayaan-tutla", name: "Ayaan Tutla", jersey: 11, position: "Field", leadershipRole: null, profileId: "ayaan-tutla", overall: 68, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ayaan Tutla profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ali-razzaq", name: "Ali Razzaq", jersey: 12, position: "Goalkeeper", leadershipRole: null, profileId: "ali-razzaq", overall: 97, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Ali Razzaq plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }], overall: 80, season: "2025", lineup: [{ id: "abdul-basit-mesbah", name: "Abdul Basit Mesbah", jersey: 6, position: "Goalkeeper", leadershipRole: null, profileId: "abdul-basit-mesbah", overall: 74, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdul Basit Mesbah brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "GK", designation: "Backup Goalie", slot: 0 }, { id: "muhammad-hasan-faraz", name: "Muhammad Hasan Faraz", jersey: 1, position: "Field", leadershipRole: null, profileId: "muhammad-hasan-faraz", overall: 60, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Muhammad Hasan Faraz is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 1 }, { id: "waise-sherzi", name: "Waise Sherzi", jersey: 4, position: "Field", leadershipRole: null, profileId: "waise-sherzi", overall: 60, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Waise Sherzi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 2 }, { id: "ayub-jan", name: "Ayub Jan", jersey: 7, position: "Field", leadershipRole: null, profileId: "ayub-jan", overall: 85, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ayub Jan profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 3 }, { id: "rehan-ahmed-mohammed", name: "Rehan Ahmed Mohammed", jersey: 8, position: "Field", leadershipRole: null, profileId: "rehan-ahmed-mohammed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehan Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "rehaan-adam", name: "Rehaan Adam", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "rehaan-adam", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehaan Adam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "omar-ajmal", name: "Omar Ajmal", jersey: 3, position: "Forward", leadershipRole: "assistant", profileId: "omar-ajmal", overall: 83, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Omar Ajmal brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "amadu", name: "Amadu", jersey: 5, position: "Forward", leadershipRole: "assistant", profileId: "amadu", overall: 90, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Amadu is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "zakariya-chhibu", name: "Zakariya Chhibu", jersey: 9, position: "Field", leadershipRole: null, profileId: "zakariya-chhibu", overall: 84, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zakariya Chhibu profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammed-ali-siddiqui", name: "Mohammed Ali Siddiqui", jersey: 10, position: "Field", leadershipRole: null, profileId: "mohammed-ali-siddiqui", overall: 81, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Mohammed Ali Siddiqui profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ayaan-tutla", name: "Ayaan Tutla", jersey: 11, position: "Field", leadershipRole: null, profileId: "ayaan-tutla", overall: 68, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ayaan Tutla profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ali-razzaq", name: "Ali Razzaq", jersey: 12, position: "Goalkeeper", leadershipRole: null, profileId: "ali-razzaq", overall: 97, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Ali Razzaq plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "refuel-juicery-athletic", name: "Refuel Juicery Athletic", shortName: "RJA", division: "Seniors", logo: "assets/logos/2025-refuel-juicery-athletic.jpg", logoBg: "#67613d", colors: null, roster: [{ id: "usman", name: "Usman", jersey: 1, position: "Field", leadershipRole: null, profileId: "usman", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Usman brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "marwan-ahmad", name: "Marwan Ahmed", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "marwan-ahmad", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Marwan Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "reda-alijalam", name: "Mohamad Reda Alijalam", jersey: 3, position: "Forward", leadershipRole: null, profileId: "reda-alijalam", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamad Reda Alijalam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-ibrahim", name: "Mohammed Ibrahim", jersey: 4, position: "Forward", leadershipRole: "assistant", profileId: "mohammed-ibrahim", overall: 94, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mohammad Ibrahim is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "ziyad-adam", name: "Ziyad Adam", jersey: 5, position: "Defender", leadershipRole: null, profileId: "ziyad-adam", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ziyad Adam profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "abdur-rakib", name: "Abdur Rakib", jersey: 6, position: "Field", leadershipRole: null, profileId: "abdur-rakib", overall: 79, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdur Rakib brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "nasibullah", name: "Nasibullah", jersey: 7, position: "Forward", leadershipRole: null, profileId: "nasibullah", overall: 78, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Nasibullah Barak brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tamzid-ahmed", name: "Tamzid Ahmed", jersey: 8, position: "Forward", leadershipRole: null, profileId: "tamzid-ahmed", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tamzid Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "bashir-ahmad-dastagiri", name: "Bashir Ahmad Dastagiri", jersey: 9, position: "Field", leadershipRole: null, profileId: "bashir-ahmad-dastagiri", overall: 69, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bashir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "taha-ahmed", name: "Taha Ahmed", jersey: 10, position: "Field", leadershipRole: null, profileId: "taha-ahmed", overall: 76, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abubakr-manjra", name: "Abubakr Manjra", jersey: 11, position: "Defender", leadershipRole: null, profileId: "abubakr-manjra", overall: 83, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Abu Bakr Manjra profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "rizwan-haque", name: "Rizwan Haque", jersey: 12, position: "Goalkeeper", leadershipRole: null, profileId: "rizwan-haque", overall: 93, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Rizwan Haque plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "m-yahya", name: "M Yahya", jersey: 11, position: "Forward", leadershipRole: "assistant", profileId: "m-yahya", overall: 95, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M Yahya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 80, season: "2025", lineup: [{ id: "rizwan-haque", name: "Rizwan Haque", jersey: 12, position: "Goalkeeper", leadershipRole: null, profileId: "rizwan-haque", overall: 93, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Rizwan Haque plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "ziyad-adam", name: "Ziyad Adam", jersey: 5, position: "Defender", leadershipRole: null, profileId: "ziyad-adam", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ziyad Adam profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "abubakr-manjra", name: "Abubakr Manjra", jersey: 11, position: "Defender", leadershipRole: null, profileId: "abubakr-manjra", overall: 83, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Abu Bakr Manjra profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "usman", name: "Usman", jersey: 1, position: "Field", leadershipRole: null, profileId: "usman", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Usman brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "abdur-rakib", name: "Abdur Rakib", jersey: 6, position: "Field", leadershipRole: null, profileId: "abdur-rakib", overall: 79, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdur Rakib brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "marwan-ahmad", name: "Marwan Ahmed", jersey: 2, position: "Forward", leadershipRole: "captain", profileId: "marwan-ahmad", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Marwan Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "reda-alijalam", name: "Mohamad Reda Alijalam", jersey: 3, position: "Forward", leadershipRole: null, profileId: "reda-alijalam", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamad Reda Alijalam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "mohammed-ibrahim", name: "Mohammed Ibrahim", jersey: 4, position: "Forward", leadershipRole: "assistant", profileId: "mohammed-ibrahim", overall: 94, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mohammad Ibrahim is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "nasibullah", name: "Nasibullah", jersey: 7, position: "Forward", leadershipRole: null, profileId: "nasibullah", overall: 78, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Nasibullah Barak brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "tamzid-ahmed", name: "Tamzid Ahmed", jersey: 8, position: "Forward", leadershipRole: null, profileId: "tamzid-ahmed", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tamzid Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "bashir-ahmad-dastagiri", name: "Bashir Ahmad Dastagiri", jersey: 9, position: "Field", leadershipRole: null, profileId: "bashir-ahmad-dastagiri", overall: 69, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Bashir Ahmad Dastagiri brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "taha-ahmed", name: "Taha Ahmed", jersey: 10, position: "Field", leadershipRole: null, profileId: "taha-ahmed", overall: 76, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "m-yahya", name: "M Yahya", jersey: 11, position: "Forward", leadershipRole: "assistant", profileId: "m-yahya", overall: 95, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M Yahya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "dhahabiya-strikers", name: "Dhahabiya Strikers", shortName: "DHS", division: "Juniors", logo: null, logoBg: "#ffffff", colors: null, roster: [{ id: "azaan", name: "Azaan", jersey: 1, position: "Field", leadershipRole: null, profileId: "azaan", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Azaan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "saifan", name: "Saifan", jersey: 2, position: "Field", leadershipRole: null, profileId: "saifan", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Saifan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mustafa-sakhiyar", name: "Mustafa Sakhiyar", jersey: 3, position: "Field", leadershipRole: null, profileId: "mustafa-sakhiyar", overall: 51, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mustafa Sakhiyar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "shafiullah", name: "Shafiullah", jersey: 4, position: "Field", leadershipRole: null, profileId: "shafiullah", overall: 57, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Shafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammed-wahedi", name: "Mohammed Wahedi", jersey: 5, position: "Field", leadershipRole: null, profileId: "mohammed-wahedi", overall: 96, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Wahedi plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "abdullah-juniors", name: "Abdullah", jersey: 6, position: "Field", leadershipRole: null, profileId: "abdullah-juniors", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdullah brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hasibullah-kharooti", name: "Hasibullah Kharooti", jersey: 8, position: "Field", leadershipRole: "assistant", profileId: "hasibullah-kharooti", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hasibullah Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-maaz-aswat", name: "Mohammed Maaz Aswat", jersey: 9, position: "Field", leadershipRole: null, profileId: "mohammed-maaz-aswat", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Maaz Aswat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "aijaz-khan", name: "Aijaz Khan", jersey: 10, position: "Field", leadershipRole: null, profileId: "aijaz-khan", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Aijaz Khan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ajmal-shakkari", name: "Ajmal Shakkari", jersey: 11, position: "Forward", leadershipRole: "captain", profileId: "ajmal-shakkari", overall: 91, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Ajmal Chakkari is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "rafiullah", name: "Rafiullah", jersey: 12, position: "Field", leadershipRole: "assistant", profileId: "rafiullah", overall: 54, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Rafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], overall: 66, season: "2025", lineup: [{ id: "azaan", name: "Azaan", jersey: 1, position: "Field", leadershipRole: null, profileId: "azaan", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Azaan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "GK", slot: 0 }, { id: "saifan", name: "Saifan", jersey: 2, position: "Field", leadershipRole: null, profileId: "saifan", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Saifan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 1 }, { id: "mustafa-sakhiyar", name: "Mustafa Sakhiyar", jersey: 3, position: "Field", leadershipRole: null, profileId: "mustafa-sakhiyar", overall: 51, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mustafa Sakhiyar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 2 }, { id: "shafiullah", name: "Shafiullah", jersey: 4, position: "Field", leadershipRole: null, profileId: "shafiullah", overall: 57, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Shafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 3 }, { id: "mohammed-wahedi", name: "Mohammed Wahedi", jersey: 5, position: "Field", leadershipRole: null, profileId: "mohammed-wahedi", overall: 96, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Wahedi plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "MID", slot: 4 }, { id: "ajmal-shakkari", name: "Ajmal Shakkari", jersey: 11, position: "Forward", leadershipRole: "captain", profileId: "ajmal-shakkari", overall: 91, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Ajmal Chakkari is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", slot: 5 }, { id: "abdullah-juniors", name: "Abdullah", jersey: 6, position: "Field", leadershipRole: null, profileId: "abdullah-juniors", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Abdullah brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "hasibullah-kharooti", name: "Hasibullah Kharooti", jersey: 8, position: "Field", leadershipRole: "assistant", profileId: "hasibullah-kharooti", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hasibullah Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-maaz-aswat", name: "Mohammed Maaz Aswat", jersey: 9, position: "Field", leadershipRole: null, profileId: "mohammed-maaz-aswat", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Maaz Aswat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "aijaz-khan", name: "Aijaz Khan", jersey: 10, position: "Field", leadershipRole: null, profileId: "aijaz-khan", overall: 62, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Aijaz Khan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "rafiullah", name: "Rafiullah", jersey: 12, position: "Field", leadershipRole: "assistant", profileId: "rafiullah", overall: 54, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Rafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "the-travel-builder-united", name: "Travel Builder United", shortName: "TBU", division: "Juniors", logo: null, logoBg: "#ffffff", colors: null, roster: [{ id: "syed-zaeem-arshad", name: "Syed Zaeem Arshad", jersey: 2, position: "Field", leadershipRole: null, profileId: "syed-zaeem-arshad", overall: 60, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Syed Zaeem Arshad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "hammad-parekh", name: "Hammad Parekh", jersey: 3, position: "Field", leadershipRole: null, profileId: "hammad-parekh", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hammad Parekh is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ammar-haque", name: "Ammar Haque", jersey: 4, position: "Field", leadershipRole: null, profileId: "ammar-haque", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ammar Haque is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "arsham", name: "Arsham", jersey: 5, position: "Field", leadershipRole: "captain", profileId: "arsham", overall: 58, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Arsham is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "umar-manjra", name: "Umar Manjra", jersey: 6, position: "Field", leadershipRole: "assistant", profileId: "umar-manjra", overall: 70, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Umar Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ahmed-ibadullah-minhas", name: "Ahmed Ibadullah Minhas", jersey: 7, position: "Field", leadershipRole: null, profileId: "ahmed-ibadullah-minhas", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ahmed Ibadullah Minhas is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "suleman-asmal", name: "Suleman Asmal", jersey: 8, position: "Field", leadershipRole: null, profileId: "suleman-asmal", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Suleman Asmal is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "yahya-mohammed", name: "Yahya Mohammed", jersey: 9, position: "Field", leadershipRole: null, profileId: "yahya-mohammed", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Yahya Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ali-shadab-shaikh", name: "Ali Shadab Shaikh", jersey: 10, position: "Field", leadershipRole: null, profileId: "ali-shadab-shaikh", overall: 63, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ali Shadab Shaikh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "idrees-nawabi-travel", name: "Idrees Nawabi", jersey: 17, position: "Field", leadershipRole: "assistant", profileId: "idrees-nawabi-travel", overall: 58, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Idrees Nawabi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], overall: 55, season: "2025", lineup: [{ id: "syed-zaeem-arshad", name: "Syed Zaeem Arshad", jersey: 2, position: "Field", leadershipRole: null, profileId: "syed-zaeem-arshad", overall: 60, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Syed Zaeem Arshad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "GK", slot: 0 }, { id: "hammad-parekh", name: "Hammad Parekh", jersey: 3, position: "Field", leadershipRole: null, profileId: "hammad-parekh", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Hammad Parekh is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 1 }, { id: "ammar-haque", name: "Ammar Haque", jersey: 4, position: "Field", leadershipRole: null, profileId: "ammar-haque", overall: 52, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ammar Haque is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 2 }, { id: "arsham", name: "Arsham", jersey: 5, position: "Field", leadershipRole: "captain", profileId: "arsham", overall: 58, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Arsham is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 3 }, { id: "umar-manjra", name: "Umar Manjra", jersey: 6, position: "Field", leadershipRole: "assistant", profileId: "umar-manjra", overall: 70, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Umar Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "ahmed-ibadullah-minhas", name: "Ahmed Ibadullah Minhas", jersey: 7, position: "Field", leadershipRole: null, profileId: "ahmed-ibadullah-minhas", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Ahmed Ibadullah Minhas is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 5 }, { id: "suleman-asmal", name: "Suleman Asmal", jersey: 8, position: "Field", leadershipRole: null, profileId: "suleman-asmal", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Suleman Asmal is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 6 }], bench: [{ id: "yahya-mohammed", name: "Yahya Mohammed", jersey: 9, position: "Field", leadershipRole: null, profileId: "yahya-mohammed", overall: 48, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Yahya Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "ali-shadab-shaikh", name: "Ali Shadab Shaikh", jersey: 10, position: "Field", leadershipRole: null, profileId: "ali-shadab-shaikh", overall: 63, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ali Shadab Shaikh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "idrees-nawabi-travel", name: "Idrees Nawabi", jersey: 17, position: "Field", leadershipRole: "assistant", profileId: "idrees-nawabi-travel", overall: 58, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Idrees Nawabi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "em-truck-repair-fc", name: "EM Truck Repair FC", shortName: "EMT", division: "Juniors", logo: null, logoBg: "#ffffff", colors: null, roster: [{ id: "mubashir-kharooti", name: "Mubashir Kharooti", jersey: 1, position: "Field", leadershipRole: "captain", profileId: "mubashir-kharooti", overall: 80, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "umair", name: "Umair", jersey: 2, position: "Field", leadershipRole: null, profileId: "umair", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Umair is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "arifur-rahman", name: "Arifur Rahman", jersey: 3, position: "Field", leadershipRole: null, profileId: "arifur-rahman", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Arifur Rahman is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "azizur-rahman", name: "Azizur Rahman", jersey: 4, position: "Field", leadershipRole: null, profileId: "azizur-rahman", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Azizur Rahman is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "raees-gauri", name: "Raees Gauri", jersey: 6, position: "Field", leadershipRole: null, profileId: "raees-gauri", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Raees Gauri is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "jamal-mujaddidi", name: "Jamal Mujaddidi", jersey: 7, position: "Field", leadershipRole: "assistant", profileId: "jamal-mujaddidi", overall: 66, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Jamal Mujaddidi profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "raffan-mohammed", name: "Raffan Mohammed", jersey: 8, position: "Field", leadershipRole: null, profileId: "raffan-mohammed", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Raffan Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "murtaza-ahmadi", name: "Murtaza Ahmadi", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "murtaza-ahmadi", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Murtaza Ahmadi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "huzaifa-kotwal", name: "Huzaifa Kotwal", jersey: 10, position: "Field", leadershipRole: null, profileId: "huzaifa-kotwal", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Huzaifa Kotwal is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "abrar-makrod", name: "Abrar Makrod", jersey: 11, position: "Field", leadershipRole: null, profileId: "abrar-makrod", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abrar Makrod is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], overall: 51, season: "2025", lineup: [{ id: "mubashir-kharooti", name: "Mubashir Kharooti", jersey: 1, position: "Field", leadershipRole: "captain", profileId: "mubashir-kharooti", overall: 80, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "GK", slot: 0 }, { id: "umair", name: "Umair", jersey: 2, position: "Field", leadershipRole: null, profileId: "umair", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Umair is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 1 }, { id: "arifur-rahman", name: "Arifur Rahman", jersey: 3, position: "Field", leadershipRole: null, profileId: "arifur-rahman", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Arifur Rahman is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "DEF", slot: 2 }, { id: "azizur-rahman", name: "Azizur Rahman", jersey: 4, position: "Field", leadershipRole: null, profileId: "azizur-rahman", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Azizur Rahman is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 3 }, { id: "raees-gauri", name: "Raees Gauri", jersey: 6, position: "Field", leadershipRole: null, profileId: "raees-gauri", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Raees Gauri is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "MID", slot: 4 }, { id: "jamal-mujaddidi", name: "Jamal Mujaddidi", jersey: 7, position: "Field", leadershipRole: "assistant", profileId: "jamal-mujaddidi", overall: 66, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Jamal Mujaddidi profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "FWD", slot: 5 }, { id: "raffan-mohammed", name: "Raffan Mohammed", jersey: 8, position: "Field", leadershipRole: null, profileId: "raffan-mohammed", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Raffan Mohammed is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." }, role: "FWD", slot: 6 }], bench: [{ id: "murtaza-ahmadi", name: "Murtaza Ahmadi", jersey: 9, position: "Field", leadershipRole: "assistant", profileId: "murtaza-ahmadi", overall: 50, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Murtaza Ahmadi is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "huzaifa-kotwal", name: "Huzaifa Kotwal", jersey: 10, position: "Field", leadershipRole: null, profileId: "huzaifa-kotwal", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Huzaifa Kotwal is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }, { id: "abrar-makrod", name: "Abrar Makrod", jersey: 11, position: "Field", leadershipRole: null, profileId: "abrar-makrod", overall: 45, playstyle: { label: "Developing Profile", traits: ["More to show", "Role building", "Coming soon"], description: "Abrar Makrod is still building a clearer LSL profile. More matches will show whether the style leans toward scoring, creating, defending, or all-around impact." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }, { id: "rafik-enterprise-fc", name: "Rafik Enterprise FC", shortName: "REF", division: "Juniors", logo: null, logoBg: "#ffffff", colors: null, roster: [{ id: "zakariya", name: "Zakariya", jersey: 1, position: "Field", leadershipRole: null, profileId: "zakariya", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Zakariya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ilyas-salim", name: "Ilyas Salim", jersey: 2, position: "Field", leadershipRole: "captain", profileId: "ilyas-salim", overall: 71, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ilyas Salim profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "yonus-dualeh", name: "Yonus Dualeh", jersey: 3, position: "Field", leadershipRole: null, profileId: "yonus-dualeh", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yonus Dualeh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-hammad-syed", name: "Mohammed Hammad Syed", jersey: 4, position: "Field", leadershipRole: "assistant", profileId: "mohammed-hammad-syed", overall: 95, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Hammad Syed plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "ibad-sheikh", name: "Ibad Sheikh", jersey: 5, position: "Field", leadershipRole: null, profileId: "ibad-sheikh", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ibad Sheikh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ibrahim-syed", name: "Ibrahim Syed", jersey: 6, position: "Field", leadershipRole: "assistant", profileId: "ibrahim-syed", overall: 63, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ibrahim Syed profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "raiyan-jahir", name: "Raiyan Jahir", jersey: 7, position: "Field", leadershipRole: null, profileId: "raiyan-jahir", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Raiyan Jahir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ammar-kazi", name: "Ammar Kazi", jersey: 8, position: "Field", leadershipRole: null, profileId: "ammar-kazi", overall: 73, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ammar Kazi profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ibrahim-jawal-ahmed", name: "Ibrahim Jawal Ahmed", jersey: 9, position: "Field", leadershipRole: null, profileId: "ibrahim-jawal-ahmed", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ibrahim Jawal Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "rehan-patel", name: "Rehan Patel", jersey: 10, position: "Field", leadershipRole: null, profileId: "rehan-patel", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehan Patel brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 63, season: "2025", lineup: [{ id: "zakariya", name: "Zakariya", jersey: 1, position: "Field", leadershipRole: null, profileId: "zakariya", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Zakariya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "GK", slot: 0 }, { id: "ilyas-salim", name: "Ilyas Salim", jersey: 2, position: "Field", leadershipRole: "captain", profileId: "ilyas-salim", overall: 71, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ilyas Salim profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "yonus-dualeh", name: "Yonus Dualeh", jersey: 3, position: "Field", leadershipRole: null, profileId: "yonus-dualeh", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yonus Dualeh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "DEF", slot: 2 }, { id: "mohammed-hammad-syed", name: "Mohammed Hammad Syed", jersey: 4, position: "Field", leadershipRole: "assistant", profileId: "mohammed-hammad-syed", overall: 95, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Hammad Syed plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "MID", slot: 3 }, { id: "ibad-sheikh", name: "Ibad Sheikh", jersey: 5, position: "Field", leadershipRole: null, profileId: "ibad-sheikh", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ibad Sheikh brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "ibrahim-syed", name: "Ibrahim Syed", jersey: 6, position: "Field", leadershipRole: "assistant", profileId: "ibrahim-syed", overall: 63, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ibrahim Syed profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "FWD", slot: 5 }, { id: "raiyan-jahir", name: "Raiyan Jahir", jersey: 7, position: "Field", leadershipRole: null, profileId: "raiyan-jahir", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Raiyan Jahir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "ammar-kazi", name: "Ammar Kazi", jersey: 8, position: "Field", leadershipRole: null, profileId: "ammar-kazi", overall: 73, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ammar Kazi profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ibrahim-jawal-ahmed", name: "Ibrahim Jawal Ahmed", jersey: 9, position: "Field", leadershipRole: null, profileId: "ibrahim-jawal-ahmed", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ibrahim Jawal Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "rehan-patel", name: "Rehan Patel", jersey: 10, position: "Field", leadershipRole: null, profileId: "rehan-patel", overall: 55, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehan Patel brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }], "2026": [{ id: "refuel-rovers", name: "Refuel Rovers", shortName: "RFR", division: "Seniors", logo: "assets/logos/2026-refuel-rovers.jpg", logoBg: "#f8f8f8", colors: null, roster: [{ id: "mosa-fazli", name: "Mosa Fazli", jersey: 1, position: "Striker", leadershipRole: "assistant", profileId: "mosa-fazli", overall: 85, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mosa Fazli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "yousaf-hosseinzada", name: "Yousaf Hosseinzada", jersey: 2, position: "Midfielder", leadershipRole: null, profileId: "yousaf-hosseinzada", overall: 75, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yousaf Hosseinzada brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abdul-ghiyas-solyman", name: "Abdul Ghiyas Solyman", jersey: 7, position: "Striker/Winger", leadershipRole: "assistant", profileId: "abdul-ghiyas-solyman", overall: 92, playstyle: { label: "Creator", traits: ["Passing", "Chance creation", "Unselfish play"], description: "Abdul Ghiyas Solyman plays more like a setup player, moving the ball into better areas and helping teammates get cleaner looks at goal." } }, { id: "ishaaq-ali", name: "Ishaaq Ali", jersey: 4, position: "Defender", leadershipRole: "captain", profileId: "ishaaq-ali", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ishaaq Ali profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ibrahim-syed", name: "Ibrahim Syed", jersey: 5, position: "Defender", leadershipRole: null, profileId: "ibrahim-syed", overall: 63, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ibrahim Syed profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "azizullah", name: "Azizullah", jersey: 6, position: "Defender", leadershipRole: null, profileId: "azizullah", overall: 79, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Azizullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammad-usman", name: "Mohammad Usman", jersey: 7, position: "Defender", leadershipRole: null, profileId: "mohammad-usman", overall: 62, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Mohammad Usman profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "zakariya-mohmed-bemat", name: "Zakariya Mohmed Bemat", jersey: null, position: "Goalie", leadershipRole: null, profileId: "zakariya-mohmed-bemat", overall: 93, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Zakariya Mohmed Bemat plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "ayub-jan", name: "Ayub Jan", jersey: 9, position: "Defender", leadershipRole: null, profileId: "ayub-jan", overall: 85, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ayub Jan profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "hasibullah-kharooti", name: "Hasibullah Kharooti", jersey: null, position: "Midfielder", leadershipRole: null, profileId: "hasibullah-kharooti", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hasibullah Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 78, season: "2026", lineup: [{ id: "zakariya-mohmed-bemat", name: "Zakariya Mohmed Bemat", jersey: null, position: "Goalie", leadershipRole: null, profileId: "zakariya-mohmed-bemat", overall: 93, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Zakariya Mohmed Bemat plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "ishaaq-ali", name: "Ishaaq Ali", jersey: 4, position: "Defender", leadershipRole: "captain", profileId: "ishaaq-ali", overall: 77, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ishaaq Ali profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "ibrahim-syed", name: "Ibrahim Syed", jersey: 5, position: "Defender", leadershipRole: null, profileId: "ibrahim-syed", overall: 63, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ibrahim Syed profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "yousaf-hosseinzada", name: "Yousaf Hosseinzada", jersey: 2, position: "Midfielder", leadershipRole: null, profileId: "yousaf-hosseinzada", overall: 75, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yousaf Hosseinzada brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "hasibullah-kharooti", name: "Hasibullah Kharooti", jersey: null, position: "Midfielder", leadershipRole: null, profileId: "hasibullah-kharooti", overall: 68, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Hasibullah Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "mosa-fazli", name: "Mosa Fazli", jersey: 1, position: "Striker", leadershipRole: "assistant", profileId: "mosa-fazli", overall: 85, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mosa Fazli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "abdul-ghiyas-solyman", name: "Abdul Ghiyas Solyman", jersey: 7, position: "Striker/Winger", leadershipRole: "assistant", profileId: "abdul-ghiyas-solyman", overall: 92, playstyle: { label: "Creator", traits: ["Passing", "Chance creation", "Unselfish play"], description: "Abdul Ghiyas Solyman plays more like a setup player, moving the ball into better areas and helping teammates get cleaner looks at goal." }, role: "FWD", slot: 6 }], bench: [{ id: "azizullah", name: "Azizullah", jersey: 6, position: "Defender", leadershipRole: null, profileId: "azizullah", overall: 79, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Azizullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammad-usman", name: "Mohammad Usman", jersey: 7, position: "Defender", leadershipRole: null, profileId: "mohammad-usman", overall: 62, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Mohammad Usman profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ayub-jan", name: "Ayub Jan", jersey: 9, position: "Defender", leadershipRole: null, profileId: "ayub-jan", overall: 85, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ayub Jan profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#f0efeb", uniform: { primary: "#f0efeb", secondary: "#3466a2", trim: "#2b5390", shorts: "#254c87", socks: "#263b61", pattern: "sleeves" } }, { id: "rawaha-royals", name: "Rawaha Royals", shortName: "RWR", division: "Seniors", logo: "assets/logos/2026-rawaha-royals.jpg", logoBg: "#0a0a0a", colors: null, roster: [{ id: "uthman", name: "Uthman Manjra", jersey: 1, position: "Striker", leadershipRole: "assistant", profileId: "uthman", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uthman Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "saad-khan", name: "Saad Khan", jersey: 2, position: "Goalie", leadershipRole: "assistant", profileId: "saad-khan", overall: 99, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Saad Khan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "mubashir-kharooti", name: "Mubashir Kharooti", jersey: 3, position: "Midfielder", leadershipRole: null, profileId: "mubashir-kharooti", overall: 80, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "umair-saiyad", name: "Umair Saiyad", jersey: 4, position: "Defender", leadershipRole: null, profileId: "umair-saiyad", overall: 61, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Umair Saiyad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "tulha-ahmed", name: "Tulha Ahmed", jersey: 5, position: "Midfielder", leadershipRole: null, profileId: "tulha-ahmed", overall: 84, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tulha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muneeb", name: "Muneeb", jersey: 6, position: "Defender", leadershipRole: null, profileId: "muneeb", overall: 61, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muneeb profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "syed-zaeem-arshad", name: "Syed Zaeem Arshad", jersey: 7, position: "Defender", leadershipRole: null, profileId: "syed-zaeem-arshad", overall: 60, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Syed Zaeem Arshad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "murtaza-syed", name: "Murtaza Syed", jersey: 8, position: "Defender", leadershipRole: null, profileId: "murtaza-syed", overall: 61, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Murtaza Syed profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammed-ibrahim", name: "Mohammad Ibrahim", jersey: 9, position: "Striker", leadershipRole: "captain", profileId: "mohammed-ibrahim", overall: 94, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mohammad Ibrahim is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "zakariya-chhibu", name: "Zakariya Chhibu", jersey: 10, position: "Defender", leadershipRole: null, profileId: "zakariya-chhibu", overall: 84, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zakariya Chhibu profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], overall: 77, season: "2026", lineup: [{ id: "saad-khan", name: "Saad Khan", jersey: 2, position: "Goalie", leadershipRole: "assistant", profileId: "saad-khan", overall: 99, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Saad Khan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "umair-saiyad", name: "Umair Saiyad", jersey: 4, position: "Defender", leadershipRole: null, profileId: "umair-saiyad", overall: 61, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Umair Saiyad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "muneeb", name: "Muneeb", jersey: 6, position: "Defender", leadershipRole: null, profileId: "muneeb", overall: 61, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muneeb profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "mubashir-kharooti", name: "Mubashir Kharooti", jersey: 3, position: "Midfielder", leadershipRole: null, profileId: "mubashir-kharooti", overall: 80, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mubashir Kharooti brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "tulha-ahmed", name: "Tulha Ahmed", jersey: 5, position: "Midfielder", leadershipRole: null, profileId: "tulha-ahmed", overall: 84, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tulha Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "uthman", name: "Uthman Manjra", jersey: 1, position: "Striker", leadershipRole: "assistant", profileId: "uthman", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uthman Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "mohammed-ibrahim", name: "Mohammad Ibrahim", jersey: 9, position: "Striker", leadershipRole: "captain", profileId: "mohammed-ibrahim", overall: 94, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mohammad Ibrahim is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", slot: 6 }], bench: [{ id: "syed-zaeem-arshad", name: "Syed Zaeem Arshad", jersey: 7, position: "Defender", leadershipRole: null, profileId: "syed-zaeem-arshad", overall: 60, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Syed Zaeem Arshad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "murtaza-syed", name: "Murtaza Syed", jersey: 8, position: "Defender", leadershipRole: null, profileId: "murtaza-syed", overall: 61, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Murtaza Syed profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "zakariya-chhibu", name: "Zakariya Chhibu", jersey: 10, position: "Defender", leadershipRole: null, profileId: "zakariya-chhibu", overall: 84, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zakariya Chhibu profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#442d6c", uniform: { primary: "#442d6c", secondary: "#756091", trim: "#c3b5d0", shorts: "#242833", socks: "#242833", pattern: "sash" } }, { id: "em-haulers-fc", name: "EM Haulers FC", shortName: "EMH", division: "Seniors", logo: "assets/logos/2026-em-haulers-fc.jpg", logoBg: "#080c11", colors: null, roster: [{ id: "muzamil-kharooti", name: "Muzamil Kharooti", jersey: 7, position: "Striker", leadershipRole: "assistant", profileId: "muzamil-kharooti", overall: 99, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Muzamil Kharooti is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "ammar-kazi", name: "Ammar Kazi", jersey: null, position: "Defender", leadershipRole: null, profileId: "ammar-kazi", overall: 73, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ammar Kazi profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammed-wahedi", name: "Mohammed Wahedi", jersey: null, position: "Goalie", leadershipRole: null, profileId: "mohammed-wahedi", overall: 96, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Wahedi plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "maaz-andurrahman", name: "Maaz Abdurrahman", jersey: null, position: "Defender", leadershipRole: null, profileId: "maaz-andurrahman", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Maaz Abdurrahman profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "sulaim-nakhuda", name: "Sulaim Nakhuda", jersey: null, position: "Defender", leadershipRole: null, profileId: "sulaim-nakhuda", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Sulaim Nakhuda profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "azeez-ur-rehman", name: "Azeez ur Rehman", jersey: null, position: "Defender", leadershipRole: null, profileId: "azeez-ur-rehman", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Azeez ur Rehman profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ahmed-adeeb-kamga", name: "Ahmed Adeeb Kamga", jersey: null, position: "Defender", leadershipRole: null, profileId: "ahmed-adeeb-kamga", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ahmed Adeeb Kamga profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "uwais-bemat", name: "Uwais Bemat", jersey: null, position: "Attacking Midfielder", leadershipRole: "assistant", profileId: "uwais-bemat", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uwais Bemat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "haroon-ahmadi", name: "Haroon Ahmadi", jersey: 10, position: "Striker", leadershipRole: "captain", profileId: "haroon-ahmadi", overall: 98, playstyle: { label: "Elite Finisher", traits: ["High goal rate", "Big scoring threat", "Efficient chances"], description: "Haroon Ahmadi plays like a main scoring option. The profile is direct, aggressive in front of goal, and dangerous whenever the team creates space." } }, { id: "tayyib-mohammed", name: "Tayyib Mohammed", jersey: null, position: "Attacking Midfielder", leadershipRole: null, profileId: "tayyib-mohammed", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tayyib Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }], overall: 84, season: "2026", lineup: [{ id: "mohammed-wahedi", name: "Mohammed Wahedi", jersey: null, position: "Goalie", leadershipRole: null, profileId: "mohammed-wahedi", overall: 96, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Wahedi plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "ammar-kazi", name: "Ammar Kazi", jersey: null, position: "Defender", leadershipRole: null, profileId: "ammar-kazi", overall: 73, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ammar Kazi profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "maaz-andurrahman", name: "Maaz Abdurrahman", jersey: null, position: "Defender", leadershipRole: null, profileId: "maaz-andurrahman", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Maaz Abdurrahman profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "uwais-bemat", name: "Uwais Bemat", jersey: null, position: "Attacking Midfielder", leadershipRole: "assistant", profileId: "uwais-bemat", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uwais Bemat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "tayyib-mohammed", name: "Tayyib Mohammed", jersey: null, position: "Attacking Midfielder", leadershipRole: null, profileId: "tayyib-mohammed", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Tayyib Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "muzamil-kharooti", name: "Muzamil Kharooti", jersey: 7, position: "Striker", leadershipRole: "assistant", profileId: "muzamil-kharooti", overall: 99, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Muzamil Kharooti is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", slot: 5 }, { id: "haroon-ahmadi", name: "Haroon Ahmadi", jersey: 10, position: "Striker", leadershipRole: "captain", profileId: "haroon-ahmadi", overall: 98, playstyle: { label: "Elite Finisher", traits: ["High goal rate", "Big scoring threat", "Efficient chances"], description: "Haroon Ahmadi plays like a main scoring option. The profile is direct, aggressive in front of goal, and dangerous whenever the team creates space." }, role: "FWD", slot: 6 }], bench: [{ id: "sulaim-nakhuda", name: "Sulaim Nakhuda", jersey: null, position: "Defender", leadershipRole: null, profileId: "sulaim-nakhuda", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Sulaim Nakhuda profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "azeez-ur-rehman", name: "Azeez ur Rehman", jersey: null, position: "Defender", leadershipRole: null, profileId: "azeez-ur-rehman", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Azeez ur Rehman profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ahmed-adeeb-kamga", name: "Ahmed Adeeb Kamga", jersey: null, position: "Defender", leadershipRole: null, profileId: "ahmed-adeeb-kamga", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Ahmed Adeeb Kamga profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#1653b5", uniform: { primary: "#1653b5", secondary: "#124494", trim: "#b4c3db", shorts: "#164b9f", socks: "#164b9f", pattern: "solid" } }, { id: "leeward-lions", name: "Leeward Lions", shortName: "LWL", division: "Seniors", logo: "assets/logos/2026-leeward-lions.jpg", logoBg: "#f0eff0", colors: null, roster: [{ id: "mudassir", name: "Mudassir", jersey: 2, position: "Attacking Midfielder", leadershipRole: "captain", profileId: "mudassir", overall: 98, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mudassir is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "ajmal-shakkari", name: "Ajmal Chakkari", jersey: 3, position: "Winger", leadershipRole: null, profileId: "ajmal-shakkari", overall: 91, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Ajmal Chakkari is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." } }, { id: "subhanullah-sharza", name: "Subhanallah Sharzah", jersey: 4, position: "Defender", leadershipRole: null, profileId: "subhanullah-sharza", overall: 82, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Subhanallah Sharzah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "abdullah-hosseinzadah", name: "Abdullah Hosseinzadah", jersey: null, position: "Defender", leadershipRole: null, profileId: "abdullah-hosseinzadah", overall: 73, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Abdullah Hosseinzadah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "zayd-badin", name: "Zaid Badin", jersey: null, position: "Defender", leadershipRole: null, profileId: "zayd-badin", overall: 62, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zaid Badin profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ibrahim-kadam", name: "Ibrahim Kadam", jersey: null, position: "Defender", leadershipRole: null, profileId: "ibrahim-kadam", overall: 66, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ibrahim Kadam profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "usman-ahmad-popal", name: "Usman Ahmad Popal", jersey: 6, position: "Goalie", leadershipRole: null, profileId: "usman-ahmad-popal", overall: 96, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Usman Ahmad Popal plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "muhammad-teli", name: "Muhummud Teli", jersey: 8, position: "Winger", leadershipRole: "assistant", profileId: "muhammad-teli", overall: 92, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhummud Teli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abubakr-manjra", name: "Abu Bakr Manjra", jersey: 9, position: "Defender", leadershipRole: "assistant", profileId: "abubakr-manjra", overall: 83, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Abu Bakr Manjra profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "sayem-mohammed-sadi", name: "Sayem Mohamed Saad", jersey: 7, position: "Defender", leadershipRole: null, profileId: "sayem-mohammed-sadi", overall: 80, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Sayem Mohamed Saad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], overall: 82, season: "2026", lineup: [{ id: "usman-ahmad-popal", name: "Usman Ahmad Popal", jersey: 6, position: "Goalie", leadershipRole: null, profileId: "usman-ahmad-popal", overall: 96, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Usman Ahmad Popal plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "abubakr-manjra", name: "Abu Bakr Manjra", jersey: 9, position: "Defender", leadershipRole: "assistant", profileId: "abubakr-manjra", overall: 83, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Abu Bakr Manjra profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "sayem-mohammed-sadi", name: "Sayem Mohamed Saad", jersey: 7, position: "Defender", leadershipRole: null, profileId: "sayem-mohammed-sadi", overall: 80, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Sayem Mohamed Saad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "mudassir", name: "Mudassir", jersey: 2, position: "Attacking Midfielder", leadershipRole: "captain", profileId: "mudassir", overall: 98, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Scoring spark"], description: "Mudassir is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "MID", slot: 3 }, { id: "subhanullah-sharza", name: "Subhanallah Sharzah", jersey: 4, position: "Defender", leadershipRole: null, profileId: "subhanullah-sharza", overall: 82, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Subhanallah Sharzah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 4 }, { id: "ajmal-shakkari", name: "Ajmal Chakkari", jersey: 3, position: "Winger", leadershipRole: null, profileId: "ajmal-shakkari", overall: 91, playstyle: { label: "Goal-First Attacker", traits: ["Finishing", "Forward runs", "Helps winning teams"], description: "Ajmal Chakkari is at the best when attacking the box and looking for goals. The style is simple to understand: find space, get shots, and finish chances." }, role: "FWD", slot: 5 }, { id: "muhammad-teli", name: "Muhummud Teli", jersey: 8, position: "Winger", leadershipRole: "assistant", profileId: "muhammad-teli", overall: 92, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Muhummud Teli brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "abdullah-hosseinzadah", name: "Abdullah Hosseinzadah", jersey: null, position: "Defender", leadershipRole: null, profileId: "abdullah-hosseinzadah", overall: 73, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Abdullah Hosseinzadah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "zayd-badin", name: "Zaid Badin", jersey: null, position: "Defender", leadershipRole: null, profileId: "zayd-badin", overall: 62, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zaid Badin profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ibrahim-kadam", name: "Ibrahim Kadam", jersey: null, position: "Defender", leadershipRole: null, profileId: "ibrahim-kadam", overall: 66, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ibrahim Kadam profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#ed804a", uniform: { primary: "#ed804a", secondary: "#233779", trim: "#f1dcc4", shorts: "#233779", socks: "#172c65", pattern: "gradient" } }, { id: "memon-mavericks", name: "Memon Mavericks", shortName: "MMV", division: "Seniors", logo: "assets/logos/2026-memon-mavericks.jpg", logoBg: "#ececec", colors: null, roster: [{ id: "omar-hicham", name: "Omar Hicham", jersey: null, position: "Defender", leadershipRole: null, profileId: "omar-hicham", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Omar Hicham profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "hasan-hamraz", name: "Hasan Hamraz", jersey: null, position: "Goalie", leadershipRole: "captain", profileId: "hasan-hamraz", overall: 55, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hasan Hamraz plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "muhammad-affan", name: "M. Affan", jersey: null, position: "Midfielder", leadershipRole: null, profileId: "muhammad-affan", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M. Affan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "abidullah-khalil", name: "Abidullah Khalil", jersey: null, position: "Defender", leadershipRole: null, profileId: "abidullah-khalil", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Abidullah Khalil profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammad-bilal-noorzai", name: "Mohammad Bilal Noorzai", jersey: null, position: "Defender", leadershipRole: null, profileId: "mohammad-bilal-noorzai", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Mohammad Bilal Noorzai profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "muhammad-hashim-ali", name: "Muhammad Hashim Ali", jersey: null, position: "Defender", leadershipRole: null, profileId: "muhammad-hashim-ali", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Hashim Ali profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "muhammad-zaidan", name: "Muhammad Zaidan", jersey: null, position: "Field/Goalie", leadershipRole: null, profileId: "muhammad-zaidan", overall: 78, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Muhammad Zaidan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "nasibullah", name: "Nasibullah Barak", jersey: null, position: "Striker", leadershipRole: "assistant", profileId: "nasibullah", overall: 78, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Nasibullah Barak brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hassan-muhammad", name: "Hassan Muhammad", jersey: null, position: "Defender", leadershipRole: null, profileId: "hassan-muhammad", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Hassan Muhammad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "idrees-nawabi", name: "Idris Nawabi", jersey: null, position: "Defender", leadershipRole: "assistant", profileId: "idrees-nawabi", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Idris Nawabi profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], overall: 60, season: "2026", lineup: [{ id: "hasan-hamraz", name: "Hasan Hamraz", jersey: null, position: "Goalie", leadershipRole: "captain", profileId: "hasan-hamraz", overall: 55, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hasan Hamraz plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "omar-hicham", name: "Omar Hicham", jersey: null, position: "Defender", leadershipRole: null, profileId: "omar-hicham", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Omar Hicham profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "abidullah-khalil", name: "Abidullah Khalil", jersey: null, position: "Defender", leadershipRole: null, profileId: "abidullah-khalil", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Abidullah Khalil profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "muhammad-affan", name: "M. Affan", jersey: null, position: "Midfielder", leadershipRole: null, profileId: "muhammad-affan", overall: 87, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M. Affan brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "muhammad-zaidan", name: "Muhammad Zaidan", jersey: null, position: "Field/Goalie", leadershipRole: null, profileId: "muhammad-zaidan", overall: 78, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Muhammad Zaidan plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "MID", slot: 4 }, { id: "nasibullah", name: "Nasibullah Barak", jersey: null, position: "Striker", leadershipRole: "assistant", profileId: "nasibullah", overall: 78, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Nasibullah Barak brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "mohammad-bilal-noorzai", name: "Mohammad Bilal Noorzai", jersey: null, position: "Defender", leadershipRole: null, profileId: "mohammad-bilal-noorzai", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Mohammad Bilal Noorzai profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "FWD", slot: 6 }], bench: [{ id: "muhammad-hashim-ali", name: "Muhammad Hashim Ali", jersey: null, position: "Defender", leadershipRole: null, profileId: "muhammad-hashim-ali", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Hashim Ali profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "hassan-muhammad", name: "Hassan Muhammad", jersey: null, position: "Defender", leadershipRole: null, profileId: "hassan-muhammad", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Hassan Muhammad profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "idrees-nawabi", name: "Idris Nawabi", jersey: null, position: "Defender", leadershipRole: "assistant", profileId: "idrees-nawabi", overall: 51, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Idris Nawabi profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#216b50", uniform: { primary: "#216b50", secondary: "#194d3c", trim: "#d7ddbe", shorts: "#233830", socks: "#233830", pattern: "solid" } }, { id: "gangat-warriors", name: "Gangat Warriors", shortName: "GW", division: "Seniors", logo: "assets/logos/2026-gangat-warriors.jpg", logoBg: "#070708", colors: null, roster: [{ id: "taha-nakhuda", name: "Taaha Nakhuda", jersey: null, position: "Striker", leadershipRole: "captain", profileId: "taha-nakhuda", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taaha Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "hammad-shaikh", name: "Hammad Shaikh", jersey: 2, position: "Goalie", leadershipRole: "assistant", profileId: "hammad-shaikh", overall: 83, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hammad Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "ahmad-ingar", name: "Ahmad Ingar", jersey: 3, position: "Winger", leadershipRole: "assistant", profileId: "ahmad-ingar", overall: 65, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ahmad Ingar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "huzaifa-ahmad-vadia", name: "Huzaifa Ahmed Vadia", jersey: null, position: "Defender", leadershipRole: null, profileId: "huzaifa-ahmad-vadia", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Huzaifa Ahmed Vadia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ayaan-tutla", name: "Ayaan Tutla", jersey: null, position: "Defender", leadershipRole: null, profileId: "ayaan-tutla", overall: 68, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ayaan Tutla profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "yahya-adil-butt", name: "Yahya Adill Butt", jersey: null, position: "Attacking Midfielder", leadershipRole: null, profileId: "yahya-adil-butt", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yahya Adill Butt brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "rafiullah", name: "Rafiullah", jersey: null, position: "Defender", leadershipRole: null, profileId: "rafiullah", overall: 54, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Rafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "bayram-loukil", name: "Byram Loukil", jersey: null, position: "Defender", leadershipRole: null, profileId: "bayram-loukil", overall: 59, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Byram Loukil profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "umar-manjra", name: "Umar Manjra", jersey: null, position: "Winger", leadershipRole: null, profileId: "umar-manjra", overall: 70, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Umar Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ali-imran", name: "Ali Imran", jersey: null, position: "Defender", leadershipRole: null, profileId: "ali-imran", overall: 53, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ali Imran profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ilyas-salim", name: "Ilyas Salim", jersey: 10, position: "Defender", leadershipRole: null, profileId: "ilyas-salim", overall: 71, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ilyas Salim profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }], overall: 68, season: "2026", lineup: [{ id: "hammad-shaikh", name: "Hammad Shaikh", jersey: 2, position: "Goalie", leadershipRole: "assistant", profileId: "hammad-shaikh", overall: 83, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Hammad Shaikh plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "huzaifa-ahmad-vadia", name: "Huzaifa Ahmed Vadia", jersey: null, position: "Defender", leadershipRole: null, profileId: "huzaifa-ahmad-vadia", overall: 75, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Huzaifa Ahmed Vadia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "ayaan-tutla", name: "Ayaan Tutla", jersey: null, position: "Defender", leadershipRole: null, profileId: "ayaan-tutla", overall: 68, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ayaan Tutla profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "yahya-adil-butt", name: "Yahya Adill Butt", jersey: null, position: "Attacking Midfielder", leadershipRole: null, profileId: "yahya-adil-butt", overall: 58, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Yahya Adill Butt brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "rafiullah", name: "Rafiullah", jersey: null, position: "Defender", leadershipRole: null, profileId: "rafiullah", overall: 54, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Rafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "MID", slot: 4 }, { id: "taha-nakhuda", name: "Taaha Nakhuda", jersey: null, position: "Striker", leadershipRole: "captain", profileId: "taha-nakhuda", overall: 88, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Taaha Nakhuda brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "ahmad-ingar", name: "Ahmad Ingar", jersey: 3, position: "Winger", leadershipRole: "assistant", profileId: "ahmad-ingar", overall: 65, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Ahmad Ingar brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "bayram-loukil", name: "Byram Loukil", jersey: null, position: "Defender", leadershipRole: null, profileId: "bayram-loukil", overall: 59, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Byram Loukil profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "umar-manjra", name: "Umar Manjra", jersey: null, position: "Winger", leadershipRole: null, profileId: "umar-manjra", overall: 70, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Umar Manjra brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "ali-imran", name: "Ali Imran", jersey: null, position: "Defender", leadershipRole: null, profileId: "ali-imran", overall: 53, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ali Imran profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ilyas-salim", name: "Ilyas Salim", jersey: 10, position: "Defender", leadershipRole: null, profileId: "ilyas-salim", overall: 71, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ilyas Salim profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#eeeee9", uniform: { primary: "#eeeee9", secondary: "#bd293e", trim: "#243459", shorts: "#243459", socks: "#233557", pattern: "stripe" } }, { id: "sharp-strikers", name: "Sharp Strikers", shortName: "SHP", division: "Seniors", logo: "assets/logos/2026-sharp-strikers.jpg", logoBg: "#030e1d", colors: null, roster: [{ id: "marwan-ahmad", name: "Marwan Ahmed", jersey: null, position: "Striker", leadershipRole: "assistant", profileId: "marwan-ahmad", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Marwan Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammed-hammad-syed", name: "Mohammed Hammad Syed", jersey: null, position: "Goalie", leadershipRole: null, profileId: "mohammed-hammad-syed", overall: 95, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Hammad Syed plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "m-yahya", name: "M Yahya", jersey: null, position: "Striker", leadershipRole: "captain", profileId: "m-yahya", overall: 95, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M Yahya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "rehan-ahmed-mohammed", name: "Rehan Mohammed", jersey: null, position: "Striker", leadershipRole: "assistant", profileId: "rehan-ahmed-mohammed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehan Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "mohammad-erfan-noorzai", name: "Mohammad Erfan Noorzai", jersey: null, position: "Defender", leadershipRole: null, profileId: "mohammad-erfan-noorzai", overall: 70, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Mohammad Erfan Noorzai profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammed-rayyan-sayed", name: "Mohammed Rayyan Syed", jersey: null, position: "Striker", leadershipRole: null, profileId: "mohammed-rayyan-sayed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Rayyan Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "younes-meraidia", name: "Younes Meraidia", jersey: null, position: "Defender", leadershipRole: null, profileId: "younes-meraidia", overall: 70, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Younes Meraidia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "mohammed-ali-siddiqui", name: "Mohammed Ali Siddiqui", jersey: null, position: "Defender", leadershipRole: null, profileId: "mohammed-ali-siddiqui", overall: 81, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Mohammed Ali Siddiqui profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "jamal-mujaddidi", name: "Jamal Mujaddidi", jersey: null, position: "Defender", leadershipRole: null, profileId: "jamal-mujaddidi", overall: 66, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Jamal Mujaddidi profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "samiullah-naimat", name: "Samiullah Naimat", jersey: null, position: "Defender", leadershipRole: null, profileId: "samiullah-naimat", overall: 70, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Samiullah Naimat profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], overall: 82, season: "2026", lineup: [{ id: "mohammed-hammad-syed", name: "Mohammed Hammad Syed", jersey: null, position: "Goalie", leadershipRole: null, profileId: "mohammed-hammad-syed", overall: 95, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Mohammed Hammad Syed plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "mohammad-erfan-noorzai", name: "Mohammad Erfan Noorzai", jersey: null, position: "Defender", leadershipRole: null, profileId: "mohammad-erfan-noorzai", overall: 70, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Mohammad Erfan Noorzai profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "younes-meraidia", name: "Younes Meraidia", jersey: null, position: "Defender", leadershipRole: null, profileId: "younes-meraidia", overall: 70, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Younes Meraidia profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "rehan-ahmed-mohammed", name: "Rehan Mohammed", jersey: null, position: "Striker", leadershipRole: "assistant", profileId: "rehan-ahmed-mohammed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Rehan Mohammed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "mohammed-rayyan-sayed", name: "Mohammed Rayyan Syed", jersey: null, position: "Striker", leadershipRole: null, profileId: "mohammed-rayyan-sayed", overall: 89, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohammed Rayyan Syed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "marwan-ahmad", name: "Marwan Ahmed", jersey: null, position: "Striker", leadershipRole: "assistant", profileId: "marwan-ahmad", overall: 91, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Marwan Ahmed brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "m-yahya", name: "M Yahya", jersey: null, position: "Striker", leadershipRole: "captain", profileId: "m-yahya", overall: 95, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "M Yahya brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 6 }], bench: [{ id: "mohammed-ali-siddiqui", name: "Mohammed Ali Siddiqui", jersey: null, position: "Defender", leadershipRole: null, profileId: "mohammed-ali-siddiqui", overall: 81, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Mohammed Ali Siddiqui profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "jamal-mujaddidi", name: "Jamal Mujaddidi", jersey: null, position: "Defender", leadershipRole: null, profileId: "jamal-mujaddidi", overall: 66, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Jamal Mujaddidi profiles as a defense-first player who also adds surprise attacking value when chances open up. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "samiullah-naimat", name: "Samiullah Naimat", jersey: null, position: "Defender", leadershipRole: null, profileId: "samiullah-naimat", overall: 70, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Winning impact"], description: "Samiullah Naimat profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#d3b280", uniform: { primary: "#d3b280", secondary: "#b58c5e", trim: "#27272b", shorts: "#c6a473", socks: "#252730", pattern: "solid" } }, { id: "amax-visionaries", name: "Amax Visionaries", shortName: "AMX", division: "Seniors", logo: "assets/logos/2026-amax-visionaries.jpg", logoBg: "#e8e7e5", colors: null, roster: [{ id: "ahmed-bhaiyat", name: "Ahmed Bhaiyat", jersey: 1, position: "Defender", leadershipRole: null, profileId: "ahmed-bhaiyat", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ahmed Bhaiyat profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "ali-razzaq", name: "Ali Razzaq", jersey: 2, position: "Goalie", leadershipRole: "assistant", profileId: "ali-razzaq", overall: 97, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Ali Razzaq plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." } }, { id: "muhammad-salim", name: "Muhammad Salim", jersey: 3, position: "Defender", leadershipRole: "assistant", profileId: "muhammad-salim", overall: 76, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Salim profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "yousuf-nathani", name: "Yousuf Nathani", jersey: 4, position: "Defender", leadershipRole: null, profileId: "yousuf-nathani", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Yousuf Nathani profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "shafiullah", name: "Shafiullah", jersey: 5, position: "Defender", leadershipRole: null, profileId: "shafiullah", overall: 57, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Shafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "zaeem-kapil-parakot", name: "Zaeem Kapil Parakot", jersey: 6, position: "Defender", leadershipRole: null, profileId: "zaeem-kapil-parakot", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zaeem Kapil Parakot profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "adil-mubashir", name: "Adil Mubashir", jersey: null, position: "Striker", leadershipRole: "captain", profileId: "adil-mubashir", overall: 90, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Adil Mubashir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "reda-alijalam", name: "Mohamad Reda Alijalam", jersey: null, position: "Midfielder", leadershipRole: null, profileId: "reda-alijalam", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamad Reda Alijalam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "uzair-sidat", name: "Uzair Sidat", jersey: 8, position: "Midfielder", leadershipRole: null, profileId: "uzair-sidat", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uzair Sidat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." } }, { id: "muhammad-shah", name: "Muhammad Shah", jersey: 9, position: "Defender", leadershipRole: null, profileId: "muhammad-shah", overall: 72, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Shah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "sajadullah-khalil", name: "Sajadullah Khalil", jersey: 10, position: "Defender", leadershipRole: null, profileId: "sajadullah-khalil", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Sajadullah Khalil profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], overall: 69, season: "2026", lineup: [{ id: "ali-razzaq", name: "Ali Razzaq", jersey: 2, position: "Goalie", leadershipRole: "assistant", profileId: "ali-razzaq", overall: 97, playstyle: { label: "Goalkeeper", traits: ["Shot stopper", "Back line voice", "Penalty box presence"], description: "Ali Razzaq plays as a goalkeeper, so the biggest impact is organizing the defense, staying composed under pressure, and giving the team a steady last line." }, role: "GK", slot: 0 }, { id: "ahmed-bhaiyat", name: "Ahmed Bhaiyat", jersey: 1, position: "Defender", leadershipRole: null, profileId: "ahmed-bhaiyat", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Ahmed Bhaiyat profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 1 }, { id: "muhammad-salim", name: "Muhammad Salim", jersey: 3, position: "Defender", leadershipRole: "assistant", profileId: "muhammad-salim", overall: 76, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Salim profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "DEF", slot: 2 }, { id: "reda-alijalam", name: "Mohamad Reda Alijalam", jersey: null, position: "Midfielder", leadershipRole: null, profileId: "reda-alijalam", overall: 86, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Mohamad Reda Alijalam brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 3 }, { id: "uzair-sidat", name: "Uzair Sidat", jersey: 8, position: "Midfielder", leadershipRole: null, profileId: "uzair-sidat", overall: 61, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Uzair Sidat brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "MID", slot: 4 }, { id: "adil-mubashir", name: "Adil Mubashir", jersey: null, position: "Striker", leadershipRole: "captain", profileId: "adil-mubashir", overall: 90, playstyle: { label: "Steady Contributor", traits: ["Experience", "Team role", "Consistency"], description: "Adil Mubashir brings a steady role across seasons. The profile is less about one stat and more about being available, competing, and fitting into the team structure." }, role: "FWD", slot: 5 }, { id: "yousuf-nathani", name: "Yousuf Nathani", jersey: 4, position: "Defender", leadershipRole: null, profileId: "yousuf-nathani", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Yousuf Nathani profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." }, role: "FWD", slot: 6 }], bench: [{ id: "shafiullah", name: "Shafiullah", jersey: 5, position: "Defender", leadershipRole: null, profileId: "shafiullah", overall: 57, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Shafiullah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "zaeem-kapil-parakot", name: "Zaeem Kapil Parakot", jersey: 6, position: "Defender", leadershipRole: null, profileId: "zaeem-kapil-parakot", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Zaeem Kapil Parakot profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "muhammad-shah", name: "Muhammad Shah", jersey: 9, position: "Defender", leadershipRole: null, profileId: "muhammad-shah", overall: 72, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Muhammad Shah profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }, { id: "sajadullah-khalil", name: "Sajadullah Khalil", jersey: 10, position: "Defender", leadershipRole: null, profileId: "sajadullah-khalil", overall: 56, playstyle: { label: "Defensive Anchor", traits: ["Physical defending", "Team shape", "Reliable coverage"], description: "Sajadullah Khalil profiles as a defense-first player who keeps the game simple and protects space first. The style is built around positioning, effort, and helping the team stay organized." } }], kit: "#34657a", uniform: { primary: "#34657a", secondary: "#34657a", trim: "#eee7d2", shorts: "#102a30", socks: "#34657a", pattern: "solid" } }] };

// api.generated.js
var HttpsError = class extends Error {
  static {
    __name(this, "HttpsError");
  }
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var onCall = /* @__PURE__ */ __name((_options, handler) => handler, "onCall");
var base = {};
function createApi({ db, auth, adminUids = "" }) {
  const ADMIN_UIDS = { value: /* @__PURE__ */ __name(() => adminUids, "value") };
  const err = /* @__PURE__ */ __name((code, message) => {
    throw new HttpsError(code, message);
  }, "err");
  const enabled = /* @__PURE__ */ __name(async () => {
    if ((await db.doc("runtime/live").get()).data()?.enabled !== true) err("failed-precondition", "Online services are not enabled yet.");
  }, "enabled");
  const signed = /* @__PURE__ */ __name(async (request) => {
    await enabled();
    const uid = request.auth?.uid;
    if (!uid) err("unauthenticated", "Sign in again to verify your Lantern Rush account.");
    const login = (await db.doc("gameLogins/" + uid).get()).data();
    if (!login || login.revision !== request.auth.token.revision) err("unauthenticated", "Your session expired. Sign in again.");
    return uid;
  }, "signed");
  const equal = /* @__PURE__ */ __name((a, b) => {
    const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
    return x.length === y.length && timingSafeEqual(x, y);
  }, "equal");
  async function rate(key, limit, windowMs) {
    const ref = db.doc("h2hLimits/" + key);
    await db.runTransaction(async (t) => {
      const old = (await t.get(ref)).data(), now = Date.now(), count = old && now - old.at < windowMs ? old.count + 1 : 1;
      if (count > limit) err("resource-exhausted", "Too many attempts. Please wait and try again.");
      t.set(ref, { at: count === 1 ? now : old.at, count, expiresAt: now + windowMs });
    });
  }
  __name(rate, "rate");
  async function identity(uid) {
    const profile = (await db.doc("gameProfiles/" + uid).get()).data();
    if (!profile) err("not-found", "Account not found.");
    return profile;
  }
  __name(identity, "identity");
  const accountAuth = onCall(base, async (request) => {
    await enabled();
    const { action, username, passcode } = request.data || {}, name = String(username || "").trim(), pin = String(passcode || "");
    if (!/^[a-zA-Z0-9_]{2,12}$/.test(name) || !/^\d{6}$/.test(pin)) err("invalid-argument", "Use a 2\u201312 character username and six-digit passcode.");
    const key = name.toLowerCase();
    await rate("login-" + key, 12, 15 * 60 * 1e3);
    let uid;
    if (action === "create") {
      uid = randomUUID();
      const now = Date.now(), profile = { uid, username: name, usernameKey: key, avatarDataUrl: "", createdAtMs: now, updatedAtMs: now, stats: {}, modes: {}, records: {}, trophies: [], currentStreak: 0, history: [] };
      await db.runTransaction(async (t) => {
        const ref = db.doc("gameUsernames/" + key);
        if ((await t.get(ref)).exists) err("already-exists", "That username is already taken.");
        t.create(ref, { uid });
        t.create(db.doc("gameProfiles/" + uid), profile);
        t.create(db.doc("gameLogins/" + uid), { passcode: pin, revision: randomUUID(), algorithm: "plain-v1" });
      });
    } else if (action === "login") {
      uid = (await db.doc("gameUsernames/" + key).get()).data()?.uid;
      if (!uid) {
        const old = await db.collection("gameProfiles").where("usernameKey", "==", key).limit(1).get();
        uid = old.docs[0]?.id;
      }
      if (!uid) err("permission-denied", "Username or passcode is incorrect.");
      const ref = db.doc("gameLogins/" + uid), login = (await ref.get()).data();
      const valid = login?.algorithm === "plain-v1" ? equal(login.passcode, pin) : login?.salt && equal(login.pinHash, pbkdf2Sync(pin, login.salt, 12e4, 32, "sha256").toString("hex"));
      if (!valid) err("permission-denied", "Username or passcode is incorrect.");
      if (login.algorithm !== "plain-v1") await ref.set({ passcode: pin, revision: login.revision, algorithm: "plain-v1" });
    } else err("invalid-argument", "Unknown account action.");
    return { token: await auth.createCustomToken(uid, { revision: (await db.doc("gameLogins/" + uid).get()).data().revision }), profile: await identity(uid) };
  });
  const accountProfile = onCall(base, async (request) => {
    const uid = await signed(request), { action, value } = request.data || {}, ref = db.doc("gameProfiles/" + uid);
    if (action === "avatar") {
      if (typeof value !== "string" || value.length > 4e5 || !/^data:image\/(webp|png|jpeg);base64,/.test(value)) err("invalid-argument", "Choose a valid profile image.");
      await ref.update({ avatarDataUrl: value, updatedAtMs: Date.now() });
    }
    return { profile: await identity(uid) };
  });
  const h2hRoom = onCall(base, async (request) => {
    const uid = await signed(request), data = request.data || {};
    await rate("room-" + uid, 90, 6e4);
    const profile = await identity(uid);
    if (data.action === "create") {
      const options = validateOptions(data.options, catalog_default);
      let code2;
      for (let attempt = 0; attempt < 8; attempt++) {
        code2 = "LR-" + randomInt(1e5, 1e6);
        try {
          await db.doc("h2hRooms/" + code2).create({ code: code2, host: uid, guest: null, members: [uid], names: { [uid]: profile.username }, options, choices: {}, ready: {}, requests: {}, status: "OPEN", createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 72e5, score: [0, 0], elapsed: 0, remaining: options.duration * 60, seed: randomInt(1, 2147483647), epoch: 0 });
          return { code: code2 };
        } catch (error2) {
          if (error2.code !== 6) throw error2;
        }
      }
      err("unavailable", "Could not reserve a room ID. Try again.");
    }
    const code = String(data.code || "").toUpperCase();
    if (!/^LR-\d{6}$/.test(code)) err("invalid-argument", "Enter a room ID such as LR-482731.");
    const ref = db.doc("h2hRooms/" + code);
    try {
      return await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) err("not-found", "Room not found.");
        const room = snap.data();
        const next = applyRoomAction(room, uid, profile.username, data, catalog_default, Date.now());
        t.set(ref, next);
        return { code, status: next.status };
      });
    } catch (error2) {
      if (error2 instanceof HttpsError) throw error2;
      err("failed-precondition", error2.message);
    }
  });
  const h2hInvite = onCall(base, async (request) => {
    const uid = await signed(request), { code, username, action } = request.data || {};
    await rate("invite-" + uid, 20, 6e4);
    const room = (await db.doc("h2hRooms/" + String(code)).get()).data();
    if (!room) err("not-found", "Room not found.");
    if (action === "decline") {
      await db.doc(`h2hInvites/${uid}/items/${code}`).delete();
      return {};
    }
    if (room.host !== uid || room.status !== "OPEN" || room.expiresAt < Date.now()) err("permission-denied", "Only the host of an open room can invite players.");
    const target = (await db.doc("gameUsernames/" + String(username || "").toLowerCase()).get()).data()?.uid;
    if (!target || target === uid) err("not-found", "Choose another Lantern Rush account.");
    await db.doc(`h2hInvites/${target}/items/${code}`).set({ code, from: uid, fromName: room.names[uid], createdAt: Date.now(), expiresAt: room.expiresAt });
    return {};
  });
  const h2hPresence = onCall(base, async (request) => {
    const uid = await signed(request);
    await rate("presence-" + uid, 8, 6e4);
    let roomId = null;
    if (request.data?.code) {
      const r = (await db.doc("h2hRooms/" + request.data.code).get()).data();
      if (r?.members.includes(uid) && r.expiresAt > Date.now()) roomId = r.code;
    }
    await db.doc("h2hPresence/" + uid).set({ lastSeen: Date.now(), roomId });
    return {};
  });
  const h2hConnection = onCall(base, async (request) => {
    const uid = await signed(request), room = (await db.doc("h2hRooms/" + request.data?.code).get()).data();
    if (!room?.members.includes(uid) || room.members.length !== 2 || room.expiresAt < Date.now() || !["STARTING", "LIVE", "CLOSE TO END"].includes(room.status)) err("permission-denied", "Only accepted players in an active match can connect.");
    await rate("connection-" + uid, 15, 6e4);
    return { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], relay: false };
  });
  const h2hProgress = onCall(base, async (request) => {
    const uid = await signed(request), data = request.data || {};
    await rate("progress-" + uid, 40, 6e4);
    const ref = db.doc("h2hRooms/" + data.code);
    await db.runTransaction(async (t) => {
      const snap = await t.get(ref), r = snap.data();
      if (!r || r.host !== uid || !["STARTING", "LIVE", "CLOSE TO END"].includes(r.status)) err("permission-denied", "This room is not your live match.");
      const elapsed = Number(data.elapsed), score = data.score, now = Date.now();
      if (!Number.isFinite(elapsed) || elapsed < r.elapsed || elapsed > r.options.duration * 60 || elapsed > (now - r.startedAt) / 1e3 + 2 || !Array.isArray(score) || score.length !== 2 || score.some((v, i) => !Number.isInteger(v) || v < r.score[i] || v > r.score[i] + 1)) err("invalid-argument", "Invalid live match progress.");
      t.update(ref, { elapsed, remaining: Math.max(0, r.options.duration * 60 - elapsed), score, status: elapsed >= r.options.duration * 60 * 0.82 ? "CLOSE TO END" : "LIVE", updatedAt: now });
    });
    return {};
  });
  const h2hTrace = onCall({ ...base, memory: "512MiB" }, async (request) => {
    const uid = await signed(request), data = request.data || {}, ref = db.doc("h2hRooms/" + data.code), r = (await ref.get()).data();
    if (!r?.members.includes(uid) || !r.startedAt || r.expiresAt < Date.now()) err("permission-denied", "Match participant required.");
    if (data.action === "chunk") {
      if (r.host !== uid || !Number.isInteger(data.index) || data.index < 0 || data.index > 400 || !Array.isArray(data.events) || data.events.length > 300 || Buffer.byteLength(JSON.stringify(data.events)) > 2e5) err("invalid-argument", "Invalid match input chunk.");
      await ref.collection("trace").doc(String(data.index).padStart(4, "0")).set({ events: data.events });
      return {};
    }
    if (data.action === "confirm") {
      if (typeof data.digest !== "string" || !/^\w{64}$/.test(data.digest) || !Number.isInteger(data.tick) || data.tick < 1 || data.tick > 24e4) err("invalid-argument", "Invalid result confirmation.");
      await ref.update({ ["confirmations." + uid]: { digest: data.digest, tick: data.tick } });
      return {};
    }
    err("invalid-argument", "Unknown trace action.");
  });
  const h2hFinalize = onCall({ ...base, memory: "1GiB", timeoutSeconds: 540, maxInstances: 3 }, async (request) => {
    const uid = await signed(request), ref = db.doc("h2hRooms/" + request.data?.code), room = (await ref.get()).data();
    if (!room?.members.includes(uid)) err("permission-denied", "Match participant required.");
    if (room.status === "FULL TIME") {
      if (!room.verified) err("failed-precondition", "This match ended without a verified result.");
      return { saved: true };
    }
    const confirmations = room.members.map((id) => room.confirmations?.[id]);
    if (confirmations.some((v) => !v) || confirmations[0].digest !== confirmations[1].digest || confirmations[0].tick !== confirmations[1].tick) err("failed-precondition", "Waiting for both players to confirm the same match timeline.");
    const { tick, digest } = confirmations[0];
    if (tick > (Date.now() - room.startedAt) / 1e3 * 120 + 240) err("invalid-argument", "Match timeline exceeds elapsed real time.");
    const chunks = await ref.collection("trace").orderBy("__name__").get(), events = chunks.docs.flatMap((d) => d.data().events);
    if (createHash("sha256").update(JSON.stringify(events)).digest("hex") !== digest) err("invalid-argument", "Match inputs do not match both confirmations.");
    const teams = room.members.map((id) => buildSquad(catalog_default[room.options.season].find((t) => t.id === room.choices[id].team), room.choices[id]));
    let match;
    try {
      match = replayTrace(teams, room.options, room.seed, events, tick);
    } catch (error2) {
      err("invalid-argument", "Result verification failed: " + error2.message);
    }
    const report = captureMatch(match), now = Date.now();
    await db.runTransaction(async (t) => {
      const current = (await t.get(ref)).data();
      if (current.status === "FULL TIME") {
        if (!current.verified) err("failed-precondition", "This match was abandoned before verification.");
        return;
      }
      if (!["LIVE", "CLOSE TO END", "STARTING"].includes(current.status)) err("failed-precondition", "Room already ended.");
      if (current.startedAt !== room.startedAt || current.members.some((id) => current.confirmations?.[id]?.digest !== digest || current.confirmations?.[id]?.tick !== tick)) err("failed-precondition", "Match confirmations changed. Retry verification.");
      for (let side = 0; side < 2; side++) {
        const player = room.members[side], opponent = room.members[1 - side], record = personalReport(report, room, side, now);
        t.create(db.doc(`gameProfiles/${player}/matches/h2h-${room.code}-${room.startedAt}`), record);
        t.set(db.doc(`h2hRecent/${player}/players/${opponent}`), { uid: opponent, username: room.names[opponent], code: room.code, playedAt: now });
      }
      t.update(ref, { status: "FULL TIME", score: report.score, elapsed: report.duration, remaining: 0, verified: true, endedAt: now, expiresAt: now + 3e5, updatedAt: now });
    });
    return { saved: true };
  });
  const accountAdmin = onCall(base, async (request) => {
    const actor = await signed(request);
    if (!ADMIN_UIDS.value().split(",").map((x) => x.trim()).includes(actor)) err("permission-denied", "Sign in with an account listed in the server ADMIN_UIDS setting.");
    const d = request.data || {};
    if (d.action === "authorize") return { allowed: true };
    if (d.action === "merge") {
      if (d.source === d.target) err("invalid-argument", "Choose two accounts.");
      const profiles = await Promise.all([identity(d.source), identity(d.target)]);
      for (const profile2 of profiles) for (const record of profile2.history || []) {
        if (!record.id) continue;
        const ref2 = db.doc(`gameProfiles/${profile2.uid}/matches/${record.id}`);
        await db.runTransaction(async (t) => {
          if (!(await t.get(ref2)).exists) t.create(ref2, { ...record, ownerId: profile2.uid, accountName: record.accountName || profile2.username });
        });
      }
      await db.runTransaction(async (t) => {
        const aRef = db.doc("gameProfiles/" + d.source), bRef = db.doc("gameProfiles/" + d.target), a = (await t.get(aRef)).data(), b = (await t.get(bRef)).data();
        if (!a || !b) err("not-found", "Account no longer exists.");
        const merged = mergeAccountProfiles(a, b);
        t.set(bRef, { ...merged, historySources: [.../* @__PURE__ */ new Set([...a.historySources || [], ...b.historySources || [], d.source])], updatedAtMs: Date.now() });
        t.delete(aRef);
        t.delete(db.doc("gameLogins/" + d.source));
        t.delete(db.doc("gameUsernames/" + a.usernameKey));
      });
      return {};
    }
    const uid = String(d.uid || ""), profile = await identity(uid), ref = db.doc("gameProfiles/" + uid);
    if (d.action === "rename") {
      const name = String(d.username || "").trim(), key = name.toLowerCase();
      if (!/^[a-zA-Z0-9_]{2,12}$/.test(name)) err("invalid-argument", "Invalid username.");
      await db.runTransaction(async (t) => {
        const n2 = db.doc("gameUsernames/" + key), exists = (await t.get(n2)).data();
        if (exists && exists.uid !== uid) err("already-exists", "Username taken.");
        t.set(n2, { uid });
        t.update(ref, { username: name, usernameKey: key, updatedAtMs: Date.now() });
        if (key !== profile.usernameKey) t.delete(db.doc("gameUsernames/" + profile.usernameKey));
      });
    } else if (d.action === "reset") {
      if (!/^\d{6}$/.test(d.passcode)) err("invalid-argument", "Passcode must contain six digits.");
      await db.doc("gameLogins/" + uid).set({ passcode: d.passcode, revision: randomUUID(), algorithm: "plain-v1" });
      await auth.revokeRefreshTokens(uid).catch(() => {
      });
    } else if (d.action === "remove") {
      const b = db.batch();
      b.delete(ref);
      b.delete(db.doc("gameLogins/" + uid));
      b.delete(db.doc("gameUsernames/" + profile.usernameKey));
      await b.commit();
      await auth.deleteUser(uid).catch(() => {
      });
    } else err("invalid-argument", "Unsupported admin operation.");
    return {};
  });
  return { accountAuth, accountProfile, h2hRoom, h2hInvite, h2hPresence, h2hConnection, h2hProgress, h2hTrace, h2hFinalize, accountAdmin };
}
__name(createApi, "createApi");

// worker.js
var apiNames = /* @__PURE__ */ new Set(["accountAuth", "accountProfile", "accountAdmin", "h2hRoom", "h2hInvite", "h2hPresence", "h2hConnection", "h2hProgress", "h2hTrace", "h2hFinalize"]);
var statusCode = { "invalid-argument": 400, unauthenticated: 401, "permission-denied": 403, "not-found": 404, "already-exists": 409, "failed-precondition": 409, "resource-exhausted": 429, unavailable: 503 };
var json = /* @__PURE__ */ __name((body, status = 200, headers = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } }), "json");
var error = /* @__PURE__ */ __name((code, message) => Object.assign(new Error(message), { code }), "error");
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !!origin && String(env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).includes(origin);
}
__name(allowedOrigin, "allowedOrigin");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ service: "Lantern Rush Free H2H", version: 1, backend: "workers-free", relay: false });
    if (!allowedOrigin(request, env)) return json({ error: { code: "permission-denied", message: "This website is not allowed to use the match service." } }, 403);
    const headers = { "Access-Control-Allow-Origin": request.headers.get("Origin"), "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const name = url.pathname.match(/^\/api\/(\w+)$/)?.[1];
    if (request.method !== "POST" || !apiNames.has(name)) return json({ error: { code: "not-found", message: "Unknown online operation." } }, 404, headers);
    if (Number(request.headers.get("Content-Length") || 0) > 6e5) return json({ error: { code: "invalid-argument", message: "Request is too large." } }, 413, headers);
    try {
      const response = await env.LIVE_BACKEND.get(env.LIVE_BACKEND.idFromName("lantern-rush-v1")).fetch(request);
      const result = new Response(response.body, response);
      for (const [k, v] of Object.entries(headers)) result.headers.set(k, v);
      return result;
    } catch {
      return json({ error: { code: "resource-exhausted", message: "The free match service is unavailable or its quota has been reached. Please try again later; no paid fallback is used." } }, 503, headers);
    }
  }
};
var LiveBackend = class {
  static {
    __name(this, "LiveBackend");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.clients = /* @__PURE__ */ new Map();
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS daily_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL)");
  }
  reserveBudget() {
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), sql = this.ctx.storage.sql;
    const row = [...sql.exec("SELECT calls FROM daily_budget WHERE day = ?", day)][0];
    const configured = Number(this.env.MAX_DAILY_REQUESTS) || 6e3, limit = Math.max(100, Math.min(1e4, configured));
    if ((row?.calls || 0) >= limit) throw error("resource-exhausted", "The free daily online limit has been reached. It resets at midnight UTC. Offline modes are still available.");
    sql.exec("INSERT INTO daily_budget (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1", day);
    if (!row) sql.exec("DELETE FROM daily_budget WHERE day < ?", day);
  }
  limitClient(ip) {
    const now = Date.now();
    for (const [key, value] of this.clients) if (value.until <= now) this.clients.delete(key);
    if (this.clients.size > 5e3) throw error("resource-exhausted", "The free service is busy. Try again shortly.");
    const entry = this.clients.get(ip) || { count: 0, until: now + 6e4 };
    if (++entry.count > 180) throw error("resource-exhausted", "Too many requests. Please wait a minute.");
    this.clients.set(ip, entry);
  }
  async fetch(request) {
    try {
      this.reserveBudget();
      this.limitClient(request.headers.get("CF-Connecting-IP") || "local");
      const reader = request.body?.getReader();
      let size = 0;
      const chunks = [];
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 6e5) {
          await reader.cancel();
          throw error("invalid-argument", "Request is too large.");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of chunks) {
        bytes.set(part, offset);
        offset += part.length;
      }
      let data;
      try {
        data = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw error("invalid-argument", "Invalid request JSON.");
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) throw error("invalid-argument", "Invalid request.");
      if (!this.db) {
        this.db = new FirebaseRest(this.env);
        this.api = createApi({ db: this.db, auth: this.db, adminUids: this.env.ADMIN_UIDS || "" });
      }
      const name = new URL(request.url).pathname.split("/").at(-1);
      if (!Object.hasOwn(this.api, name)) throw error("not-found", "Unknown online operation.");
      let auth = null;
      if (name !== "accountAuth") {
        const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
        if (!token) throw error("unauthenticated", "Sign in before using online play.");
        auth = await this.db.verifyIdToken(token);
      }
      const result = await this.api[name]({ data, auth });
      return json({ data: result });
    } catch (e) {
      const code = Object.hasOwn(statusCode, e.code) ? e.code : "unavailable";
      return json({ error: { code, message: code === "unavailable" ? "The free online service could not complete this request. Check Firebase setup or try again later." : e.message } }, statusCode[code]);
    }
  }
};
export {
  LiveBackend,
  allowedOrigin,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
