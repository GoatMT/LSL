// Imported from the website's teamOVR calculation over its full season roster.
// A match substitution or red card does not change the published team rating.
export function teamOverall(team){
  return Number.isFinite(team?.overall)?team.overall:null;
}
export function captainFor(team){
  const lineup=team?.lineup||[];
  return lineup.find(p=>p.leadershipRole==='captain')||[...lineup].sort((a,b)=>(Number(b.overall)||0)-(Number(a.overall)||0))[0]||team?.bench?.find(p=>p.leadershipRole==='captain')||null;
}
