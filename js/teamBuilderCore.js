import { computePlayerStats, playersWithOVR } from "./leagueEngine.js?v=3.24-playoff-threshold";

export const FORMATIONS = {
  "4-3-3": [
    ["Attack", [{ id: "LW", label: "Left wing" }, { id: "ST", label: "Striker" }, { id: "RW", label: "Right wing" }]],
    ["Midfield", [{ id: "LM", label: "Left midfield" }, { id: "CM", label: "Centre midfield" }, { id: "RM", label: "Right midfield" }]],
    ["Defence", [{ id: "LB", label: "Left back" }, { id: "LCB", label: "Centre back" }, { id: "RCB", label: "Centre back" }, { id: "RB", label: "Right back" }]],
    ["Goalkeeper", [{ id: "GK", label: "Goalkeeper" }]],
  ],
  "4-4-2": [
    ["Attack", [{ id: "ST1", label: "Striker" }, { id: "ST2", label: "Striker" }]],
    ["Midfield", [{ id: "LM", label: "Left midfield" }, { id: "LCM", label: "Centre midfield" }, { id: "RCM", label: "Centre midfield" }, { id: "RM", label: "Right midfield" }]],
    ["Defence", [{ id: "LB", label: "Left back" }, { id: "LCB", label: "Centre back" }, { id: "RCB", label: "Centre back" }, { id: "RB", label: "Right back" }]],
    ["Goalkeeper", [{ id: "GK", label: "Goalkeeper" }]],
  ],
  "3-5-2": [
    ["Attack", [{ id: "ST1", label: "Striker" }, { id: "ST2", label: "Striker" }]],
    ["Midfield", [{ id: "LM", label: "Left midfield" }, { id: "LCM", label: "Centre midfield" }, { id: "CM", label: "Centre midfield" }, { id: "RCM", label: "Centre midfield" }, { id: "RM", label: "Right midfield" }]],
    ["Defence", [{ id: "LCB", label: "Centre back" }, { id: "CB", label: "Centre back" }, { id: "RCB", label: "Centre back" }]],
    ["Goalkeeper", [{ id: "GK", label: "Goalkeeper" }]],
  ],
  "4-2-3-1": [
    ["Attack", [{ id: "ST", label: "Striker" }]],
    ["Attacking midfield", [{ id: "LW", label: "Left wing" }, { id: "CAM", label: "Attacking midfield" }, { id: "RW", label: "Right wing" }]],
    ["Defensive midfield", [{ id: "LDM", label: "Defensive midfield" }, { id: "RDM", label: "Defensive midfield" }]],
    ["Defence", [{ id: "LB", label: "Left back" }, { id: "LCB", label: "Centre back" }, { id: "RCB", label: "Centre back" }, { id: "RB", label: "Right back" }]],
    ["Goalkeeper", [{ id: "GK", label: "Goalkeeper" }]],
  ],
  "5-3-2": [
    ["Attack", [{ id: "ST1", label: "Striker" }, { id: "ST2", label: "Striker" }]],
    ["Midfield", [{ id: "LM", label: "Left midfield" }, { id: "CM", label: "Centre midfield" }, { id: "RM", label: "Right midfield" }]],
    ["Defence", [{ id: "LWB", label: "Left wing back" }, { id: "LCB", label: "Centre back" }, { id: "CB", label: "Centre back" }, { id: "RCB", label: "Centre back" }, { id: "RWB", label: "Right wing back" }]],
    ["Goalkeeper", [{ id: "GK", label: "Goalkeeper" }]],
  ],
};

export function formationSlots(formation) {
  return (FORMATIONS[formation] || FORMATIONS["4-3-3"])
    .flatMap(([line, slots]) => slots.map((slot) => ({ ...slot, line })));
}

export function isGoalkeeper(player = {}) {
  return /goal\s*keeper|goalie|\bgk\b/i.test(String(player.position || ""));
}

export function roleLabel(position = "") {
  if (isGoalkeeper({ position })) return "Goalkeeper";
  if (/defend|back/i.test(position)) return "Defender";
  if (/mid|wing/i.test(position)) return "Midfielder";
  if (/forward|strik|attack/i.test(position)) return "Forward";
  return "Field";
}

export function buildPlayerPool(seasonData, division = "All") {
  const stats = computePlayerStats(seasonData, { stage: "all" });
  return playersWithOVR(stats, stats)
    .filter((player) => division === "All" || player.division === division)
    .map((player) => ({ ...player, division: player.division || "Seniors", teamName: player.teamName || "Team unlisted" }))
    .sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
}

export function summarizePlayers(players) {
  const count = players.length;
  const sum = (key) => players.reduce((total, player) => total + (Number(player[key]) || 0), 0);
  return {
    count,
    averageOvr: count ? Math.round(sum("ovr") / count) : 0,
    goals: sum("goals"),
    wins: sum("wins"),
    games: sum("gamesPlayed"),
  };
}
