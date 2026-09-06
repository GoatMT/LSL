export const SITE = {
  name: "Lantern Soccer League",
  shortName: "LSL",
  logo: "./Logos/lsl-logo.png",
  defaultSeason: "2027",
  seasons: ["2024", "2025", "2026", "2027"],
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
  { label: "LSL Pulse", href: "lsl-pulse.html", group: "League" },
  { label: "Standings", href: "standings.html", group: "League" },
  { label: "Recap", href: "season-recap.html", group: "League" },
  { label: "All Time Stat", href: "all-time.html", group: "People" },
  { label: "Inter-Madrasah", href: "tournament.html", group: "Tournament" },
  { label: "Matches", href: "matches.html", group: "League" },
  { label: "Teams", href: "teams.html", group: "League" },
  { label: "Players", href: "players.html", group: "People" },
  { label: "Coaches", href: "coaches.html", group: "People" },
  { label: "Awards", href: "awards.html", group: "League" },
  { label: "Advanced Stats", href: "advanced-stats.html", group: "League" },
  { label: "Trades", href: "transactions.html", group: "League" },
  { label: "Team vs Team", href: "team-vs-team.html", group: "League" },
  { label: "Player vs Player", href: "player-vs-player.html", group: "People" },
  { label: "Rules", href: "rules.html", group: "Info" },
  { label: "Forms", href: "forms.html", group: "Info" },
  { label: "Best All-Time Team", href: "best-all-time-team.html", group: "People" },
  { label: "Records", href: "records.html", group: "People" },
  { label: "Playoffs", href: "playoffs.html", group: "League" },
  { label: "Matchday", href: "matchday.html", group: "League" },
  { label: "Media", href: "videos.html", group: "Info" },
  { label: "Owners", href: "owners.html", group: "Info" },
  { label: "Franchise Mode", href: "franchise.html", group: "Franchise" },
  { label: "Admin", href: "admin.html", group: "Franchise" },
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

const SIX_TEAM_SENIOR_RULE = {
  teams: 6,
  cutoff: 6,
  byes: 2,
  description: "Six-team senior playoff field. Seeds 1 and 2 receive semifinal byes.",
};

const FOUR_TEAM_JUNIOR_RULE = {
  teams: 4,
  cutoff: 4,
  byes: 0,
  description: "Top 4 junior teams qualify. Semifinals are 1 vs 4 and 2 vs 3.",
};

// Playoff format is season-specific: the senior field expanded from 6 teams (2024-2025)
// to 8 teams in 2026, so rules are keyed by year first, then division.
export const PLAYOFF_RULES = {
  "2024": {
    Seniors: SIX_TEAM_SENIOR_RULE,
    Juniors: FOUR_TEAM_JUNIOR_RULE,
  },
  "2025": {
    Seniors: SIX_TEAM_SENIOR_RULE,
    Juniors: FOUR_TEAM_JUNIOR_RULE,
  },
  "2026": {
    Seniors: {
      teams: 8,
      cutoff: 8,
      byes: 0,
      description: "Eight-team senior playoff field, no byes. Quarterfinals are 1 vs 8, 2 vs 7, 3 vs 6, and 4 vs 5. Quarterfinals, semifinals, and the championship are all played on Saturday, August 8, 2026.",
    },
    Juniors: FOUR_TEAM_JUNIOR_RULE,
  },
  "2027": {
    Seniors: {
      teams: 0,
      cutoff: 0,
      byes: 0,
      description: "2027 senior playoff format coming soon.",
    },
    Juniors: {
      teams: 0,
      cutoff: 0,
      byes: 0,
      description: "2027 junior playoff format coming soon.",
    },
  },
};

// Fallback used only if a season is ever missing from the map above.
export const DEFAULT_PLAYOFF_RULES = {
  Seniors: SIX_TEAM_SENIOR_RULE,
  Juniors: FOUR_TEAM_JUNIOR_RULE,
};

export function playoffRulesFor(year, division) {
  return (PLAYOFF_RULES[String(year)] && PLAYOFF_RULES[String(year)][division]) || DEFAULT_PLAYOFF_RULES[division] || {};
}
