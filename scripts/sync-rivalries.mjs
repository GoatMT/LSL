import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),source=path.resolve(process.argv[2]||path.join(root,'../LSL Website'));
const seasons=JSON.parse(await fs.readFile(path.join(root,'data/seasons.json'),'utf8')),rivalries=[];
for(const season of seasons){
 const game=JSON.parse(await fs.readFile(path.join(root,season.file),'utf8'));
 const valid=new Set(game.teams.filter(t=>t.roster.length>=7).map(t=>t.id));
 const playoffs=JSON.parse(await fs.readFile(path.join(source,'data',String(season.year),'playoffs.json'),'utf8'));
 const groups=playoffs.divisions||[playoffs],candidates=[];
 for(const group of groups)for(const round of group.rounds||[])for(const m of round.matches||[]){
  if(!valid.has(m.homeTeamId)||!valid.has(m.awayTeamId)||m.homeTeamId===m.awayTeamId)continue;
  const isThird=/3rd|third/i.test(m.label||'');
  if(!isThird&&(!Number.isFinite(m.homeScore)||!Number.isFinite(m.awayScore)))continue;
  const priority=isThird?0:/^finals?$/i.test(round.name)?3:/semi/i.test(round.name)?2:1;
  candidates.push({season:String(season.year),teamIds:[m.homeTeamId,m.awayTeamId],score:[Number.isFinite(m.homeScore)?m.homeScore:0,Number.isFinite(m.awayScore)?m.awayScore:0],round:round.name,
   title:priority===3?'Final rematch':priority===2?'Semi-final showdown':priority===0?'Third-place playoff':'Playoff rematch',priority,pending:isThird&&!Number.isFinite(m.homeScore),
   source:'data/'+season.year+'/playoffs.json'});
 }
 const selected=[];for(const priority of [3,2,1]){
  const next=candidates.filter(c=>c.priority===priority).sort((a,b)=>Math.abs(a.score[0]-a.score[1])-Math.abs(b.score[0]-b.score[1]))[0];if(next)selected.push(next);
 }
 const third=candidates.find(c=>c.priority===0);
 if(third)selected.push(third);
 else {
  const semi=groups.flatMap(g=>g.rounds||[]).find(r=>/semi/i.test(r.name));
  const losers=(semi?.matches||[]).flatMap(m=>[m.homeTeamId,m.awayTeamId]).filter((id,i,all)=>id&&!all.slice(0,i).includes(id)&&!(semi.matches||[]).some(x=>x.winnerId===id));
  if(losers.length===2&&valid.has(losers[0])&&valid.has(losers[1]))selected.push({season:String(season.year),teamIds:losers,score:[0,0],pending:true,round:'Third-place playoff',title:'Third-place playoff',source:'data/'+season.year+'/playoffs.json',priority:0});
 }
 for(const c of selected){const {priority,...entry}=c;rivalries.push({...entry,id:entry.season+'-'+entry.teamIds.slice().sort().join('--')+(priority===0?'--third':'')});}
}
await fs.writeFile(path.join(root,'data/rivalries.json'),JSON.stringify({basis:'Featured game rivalries selected from completed LSL playoff matchups; not an official rivalry designation.',rivalries},null,2)+'\n');
console.log('Synced '+rivalries.length+' featured playoff rematches across '+seasons.length+' seasons.');
