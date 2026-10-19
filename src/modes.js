export function seasonRivalries(rivalries,season,teams){
 const ids=new Set(teams.map(t=>t.id));
 return rivalries.filter(r=>String(r.season)===String(season)&&r.teamIds.length===2&&r.teamIds[0]!==r.teamIds[1]&&r.teamIds.every(id=>ids.has(id)));
}
export function findRivalry(rivalries,season,a,b){
 if(a===b)return null;
 return rivalries.find(r=>String(r.season)===String(season)&&r.teamIds.includes(a)&&r.teamIds.includes(b))||null;
}
export function rivalryTeams(rivalry,teams,reverse=false){
 const pair=rivalry.teamIds.map(id=>teams.find(t=>t.id===id));
 if(pair.some(t=>!t))return null;return reverse?pair.reverse():pair;
}
export function rivalryHistory(rivalry,teams){
 const pair=rivalryTeams(rivalry,teams);if(!pair)return '';
 return rivalry.pending?pair[0].name+' · Result not recorded · '+pair[1].name:pair[0].name+' '+rivalry.score[0]+' – '+rivalry.score[1]+' '+pair[1].name;
}
