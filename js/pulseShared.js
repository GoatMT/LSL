// Shared between js/lslPulse.js (the main feed) and js/pulseUser.js (a
// single account's profile page), so both agree on what an official post
// looks like and how a raw post object gets normalized to a safe shape.

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
