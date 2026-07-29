export const SITE = {
  name: "Lantern Soccer League",
  shortName: "LSL",
  logo: "./Logos/lsl-logo.png",
  defaultSeason: "2026",
  seasons: ["2024", "2025", "2026"],
  divisions: ["Seniors", "Juniors"],
  dataPath: "./data",
  venue: "Grenoble P.S. Field, 9 Grenoble Dr, Toronto, ON",
  lastUpdated: "May 28, 2026 at 7:30 PM",
  pointsSystem: [
    { label: "Win", value: "3 pts" },
    { label: "Draw", value: "1 pt" },
    { label: "Loss", value: "0 pts" },
  ],
};

export const NAV_LINKS = [
  { label: "Home", href: "index.html", group: "League" },
  { label: "News", href: "news.html", group: "League" },
  { label: "Matchday", href: "matchday.html", group: "League" },
  { label: "Standings", href: "standings.html", group: "League" },
  { label: "Matches", href: "matches.html", group: "League" },
  { label: "Teams", href: "teams.html", group: "League" },
  { label: "Inter-Madrasah", href: "tournament.html", group: "Tournament" },
  { label: "Players", href: "players.html", group: "People" },
  { label: "Playoffs", href: "playoffs.html", group: "League" },
  { label: "Projected", href: "projected.html", group: "League" },
  { label: "Coaches", href: "coaches.html", group: "People" },
  { label: "Awards", href: "awards.html", group: "League" },
  { label: "Advanced Stats", href: "advanced-stats.html", group: "League" },
  { label: "Trades", href: "transactions.html", group: "League" },
  { label: "Team vs Team", href: "team-vs-team.html", group: "League" },
  { label: "Rules", href: "rules.html", group: "Info" },
  { label: "Forms", href: "forms.html", group: "Info" },
  { label: "All Time", href: "all-time.html", group: "People" },
  { label: "Best All-Time Team", href: "best-all-time-team.html", group: "People" },
  { label: "Records", href: "records.html", group: "People" },
  { label: "Recap", href: "season-recap.html", group: "League" },
  { label: "Media", href: "videos.html", group: "Info" },
  { label: "Owners", href: "owners.html", group: "Info" },
];

export const DATA_FILES = [
  "teams",
  "players",
  "coaches",
  "matches",
  "standings",
  "playoffs",
  "awards",
  "tournament",
  "photos",
  "videos",
];

export const PLAYOFF_RULES = {
  Seniors: {
    teams: 6,
    cutoff: 6,
    byes: 2,
    description: "Six-team senior playoff field. Seeds 1 and 2 receive semifinal byes.",
  },
  Juniors: {
    teams: 4,
    cutoff: 4,
    byes: 0,
    description: "Top 4 junior teams qualify. Semifinals are 1 vs 4 and 2 vs 3.",
  },
};
