// Shared between js/lslPulse.js (the main feed) and js/pulseUser.js (a
// single account's profile page), so both agree on what an official post
// looks like and how a raw post object gets normalized to a safe shape.

import { escapeHTML } from "./utils.js?v=1.0";

export const OFFICIAL_BASE_POSTS = [
  {
    id: "league-first-official-pulse",
    type: "league",
    author: "LSL Official",
    reporter: "Reported by Arshad Petal",
    badge: "League News",
    date: "August 14, 2026",
    title: "First Official LSL Pulse Update",
    body:
      "This is the first of many official LSL Pulse news updates. League News will be used for direct league updates, important announcements, schedule notes, and quick information as soon as possible.",
    source: "LSL Pulse",
  },
];

export function normalizePost(post) {
  const likes = Array.isArray(post.likesBy)
    ? post.likesBy
    : Array.from({ length: Number(post.likes) || 0 }, (_, index) => `old-like-${index}`);
  const dislikes = Array.isArray(post.dislikesBy) ? post.dislikesBy : [];
  const reposts = Array.isArray(post.repostsBy) ? post.repostsBy : [];

  return {
    id: post.id || `pulse-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: post.type || "user",
    author: post.author || "LSL User",
    accountId: post.accountId || "",
    badge: post.badge || "User Pulse",
    date: post.date || "Date TBA",
    title: post.title || "",
    body: post.body || "",
    imageDataUrl: post.imageDataUrl || "",
    source: post.source || "",
    reporter: post.reporter || "",
    likesBy: likes,
    dislikesBy: dislikes,
    repostsBy: reposts,
    replies: Array.isArray(post.replies) ? post.replies : [],
  };
}

export function pulseProfileHref(accountId, username) {
  const params = new URLSearchParams({ id: accountId });
  if (username) params.set("name", username);
  return `./pulse-user.html?${params.toString()}`;
}

const MAX_IMAGE_DIMENSION = 1000;
const IMAGE_QUALITY = 0.62;

// Resizes/compresses an <input type="file"> image down to a data URL small
// enough to store as a plain field on a Firestore post document (no Storage
// bucket needed, no separate upload step, and it works identically whether
// or not Firebase is configured - the local-only fallback just saves the
// same data URL string to localStorage). Caps the longer side at 1000px and
// re-encodes as JPEG, which keeps most phone photos well under ~200KB.
export function compressImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const AVATAR_SIZE = 240;
const AVATAR_QUALITY = 0.82;

// Turns any chosen photo - any dimensions, any aspect ratio, portrait or
// landscape - into a fixed 240x240 square, auto-cropped to the center of
// the image (the "auto adjust"). Same data-URL approach as post photos:
// no Storage bucket, works identically with or without Firebase.
export function compressImageToSquareDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        // Crop to a centered square from whichever dimension is smaller,
        // then scale that square down/up to a fixed output size - this is
        // what makes it "auto adjust" regardless of the source photo's shape.
        const side = Math.min(img.width, img.height);
        const sourceX = (img.width - side) / 2;
        const sourceY = (img.height - side) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sourceX, sourceY, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

        resolve(canvas.toDataURL("image/jpeg", AVATAR_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Fills a `.pulse-avatar` circle with either the account's photo (if set)
// or the usual two-letter initials fallback, so every place an avatar
// shows up (post cards, the account panel, profile pages) renders it the
// same way.
export function avatarMarkup(name, avatarDataUrl) {
  if (avatarDataUrl) {
    return `<img class="pulse-avatar-img" src="${escapeHTML(avatarDataUrl)}" alt="${escapeHTML(name || "Account")} photo">`;
  }
  return escapeHTML(String(name || "?").trim().slice(0, 2).toUpperCase());
}

const MENTION_PATTERN = /@([A-Za-z0-9_-]{2,28})/g;

// Renders post/reply body text as safe HTML: plain text stays escaped,
// but any @word that matches a known account (case-insensitive, spaces
// folded to dashes, same as usernameKey) becomes a clickable, underlined
// link to that account's Pulse profile. Unknown @words are left as plain
// escaped text, so a stray "@" in normal writing never turns into a dead
// link.
export function renderPostBody(text = "", accountsByKey = new Map()) {
  const raw = String(text || "");
  let result = "";
  let lastIndex = 0;
  let match;

  MENTION_PATTERN.lastIndex = 0;
  while ((match = MENTION_PATTERN.exec(raw))) {
    const [full, handle] = match;
    const key = handle.trim().toLowerCase().replace(/\s+/g, "-");
    const account = accountsByKey.get(key);

    result += escapeHTML(raw.slice(lastIndex, match.index));

    if (account) {
      result += `<a class="pulse-mention" href="${escapeHTML(pulseProfileHref(account.id, account.username))}">@${escapeHTML(account.username)}</a>`;
    } else {
      result += escapeHTML(full);
    }

    lastIndex = match.index + full.length;
  }

  result += escapeHTML(raw.slice(lastIndex));
  return result;
}
