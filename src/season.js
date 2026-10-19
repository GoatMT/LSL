const asNumber=value=>Number.isFinite(Number(value))?Number(value):0;
const hash=(text)=>{let h=2166136261;for(const char of String(text)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const rngFrom=(seed)=>{let state=(seed>>>0)||1;return()=>{state=(state+0x6D2B79F5)|0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};};
const teamMap=(teams)=>new Map((teams||[]).map(team=>[team.id,team]));
const defaultSeasonRules={trades:true,injuries:true,suspensions:true,fantasyDraft:false};
const fixture=(year,round,home,away,index)=>({id:`season-${year}-league-${round+1}-${index+1}`,stage:'league',round:round+1,label:`MATCHDAY ${round+1}`,homeTeamId:home.id,homeTeamName:home.name,awayTeamId:away.id,awayTeamName:away.name});
export function buildSeasonFixtures(teams,year){
  const entries=(teams||[]).map(team=>({id:team.id,name:team.name}));
  if(entries.length<2)return[];
  if(entries.length%2)entries.push(null);
  const rounds=entries.length-1,half=entries.length/2,current=[...entries],out=[];
  for(let round=0;round<rounds;round++){
    for(let i=0;i<half;i++){
      const left=current[i],right=current[current.length-1-i];
      if(!left||!right)continue;
      const home=(round+i)%2===0?left:right,away=home===left?right:left;
      out.push(fixture(year,round,home,away,i));
    }
    const fixed=current[0],tail=current.slice(1);tail.unshift(tail.pop());current.splice(0,current.length,fixed,...tail);
  }
  return out;
}
export function makeSeasonState(year,teams,teamId,saved=null){
  if(saved&&String(saved.year)===String(year)&&saved.teamId===teamId&&Array.isArray(saved.fixtures)&&saved.fixtures.length)return {...saved,rules:{...defaultSeasonRules,...(saved.rules||{})},draft:saved.draft||null,results:saved.results||{},playerStats:saved.playerStats||{},availability:saved.availability||{},playoffs:saved.playoffs||null};
  return {year:String(year),teamId,stage:'league',fixtures:buildSeasonFixtures(teams,year),results:{},playerStats:{},availability:{},trades:[],rules:{...defaultSeasonRules},draft:null,playoffs:null,awards:null};
}
export function seasonStandings(state,teams){
  const rows=new Map((teams||[]).map(team=>[team.id,{teamId:team.id,name:team.name,shortName:team.shortName||team.name,gp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0,form:[]}])) ;
  for(const item of state?.fixtures||[]){if(item.stage!=='league')continue;const result=state.results?.[item.id];if(!result)continue;const home=rows.get(item.homeTeamId),away=rows.get(item.awayTeamId);if(!home||!away)continue;const hg=asNumber(result.homeScore),ag=asNumber(result.awayScore);home.gp++;away.gp++;home.gf+=hg;home.ga+=ag;away.gf+=ag;away.ga+=hg;if(hg>ag){home.w++;away.l++;home.pts+=3;home.form.push('W');away.form.push('L');}else if(ag>hg){away.w++;home.l++;away.pts+=3;away.form.push('W');home.form.push('L');}else{home.d++;away.d++;home.pts++;away.pts++;home.form.push('D');away.form.push('D');}}
  return [...rows.values()].map(row=>({...row,gd:row.gf-row.ga})).sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));
}
export function leagueComplete(state){return (state?.fixtures||[]).filter(f=>f.stage==='league').every(f=>state.results?.[f.id]);}
export function ensurePlayoffs(state,teams){
  if(!leagueComplete(state)||state.playoffs)return state;
  const top=seasonStandings(state,teams).slice(0,4);if(top.length<4)return state;
  const [a,b,c,d]=top;
  state.playoffs={semifinals:[
    {id:`season-${state.year}-sf-1`,stage:'semifinal',round:'SEMIFINAL',label:'SEMIFINAL 1',homeTeamId:a.teamId,homeTeamName:a.name,awayTeamId:d.teamId,awayTeamName:d.name},
    {id:`season-${state.year}-sf-2`,stage:'semifinal',round:'SEMIFINAL',label:'SEMIFINAL 2',homeTeamId:b.teamId,homeTeamName:b.name,awayTeamId:c.teamId,awayTeamName:c.name}
  ],third:null,final:null};
  state.fixtures.push(...state.playoffs.semifinals);state.stage='playoffs';return state;
}
const winner=(fixture,result)=>result?.winnerId||((asNumber(result?.homeScore)>=asNumber(result?.awayScore))?fixture.homeTeamId:fixture.awayTeamId);
export function ensureFinals(state){
  if(!state.playoffs||state.playoffs.final)return state;
  const semis=state.playoffs.semifinals||[],done=semis.every(f=>state.results?.[f.id]);if(!done)return state;
  const first=winner(semis[0],state.results[semis[0].id]),second=winner(semis[1],state.results[semis[1].id]);
  const loser=(f,r)=>winner(f,r)===f.homeTeamId?f.awayTeamId:f.homeTeamId;
  const firstLoser=loser(semis[0],state.results[semis[0].id]),secondLoser=loser(semis[1],state.results[semis[1].id]);
  const name=id=>{const f=semis.find(x=>x.homeTeamId===id||x.awayTeamId===id);return f?.homeTeamId===id?f.homeTeamName:f?.awayTeamName||'Team';};
  state.playoffs.third={id:`season-${state.year}-third`,stage:'third-place',round:'THIRD PLACE',label:'THIRD-PLACE PLAYOFF',homeTeamId:firstLoser,homeTeamName:name(firstLoser),awayTeamId:secondLoser,awayTeamName:name(secondLoser)};
  state.playoffs.final={id:`season-${state.year}-final`,stage:'final',round:'FINAL',label:'FINAL',homeTeamId:first,homeTeamName:name(first),awayTeamId:second,awayTeamName:name(second)};
  state.fixtures.push(state.playoffs.third,state.playoffs.final);return state;
}
export function seasonFinished(state){return Boolean(state?.playoffs?.final&&state.results?.[state.playoffs.final.id]);}
export function seasonStatCharts(state,teams){
  const source=new Map(),teamMapByPlayer=new Map();for(const team of teams||[])for(const player of team.roster||[])teamMapByPlayer.set(player.id,team);
  for(const team of teams||[])for(const player of team.roster||[]){const key=team.id+':'+player.id,raw=state?.playerStats?.[key]||state?.playerStats?.[player.id]||{};source.set(key,{playerId:player.id,name:player.name,jersey:player.jersey,position:player.position||player.role||'PLAYER',teamId:team.id,teamName:team.shortName||team.name,overall:player.overall||0,appearances:raw.appearances||0,goals:raw.goals||0,assists:raw.assists||0,shots:raw.shots||0,onTarget:raw.onTarget||0,saves:raw.saves||0,goalsAgainst:raw.goalsAgainst||0,shotsAgainst:raw.shotsAgainst||0});}
  const players=[...source.values()],keepers=players.filter(player=>/goal|keeper/i.test(player.position));
  return {players,goals:[...players].sort((a,b)=>b.goals-a.goals||b.assists-a.assists||b.overall-a.overall),assists:[...players].sort((a,b)=>b.assists-a.assists||b.goals-a.goals||b.overall-a.overall),shots:[...players].sort((a,b)=>b.shots-a.shots||b.onTarget-a.onTarget||b.goals-a.goals),keepers:keepers.sort((a,b)=>b.saves-a.saves||b.shotsAgainst-a.shotsAgainst||a.name.localeCompare(b.name)).map(player=>({...player,savePct:player.shotsAgainst?player.saves/player.shotsAgainst*100:0,gaa:player.appearances?player.goalsAgainst/player.appearances:0}))};
}
export function nextSeasonFixture(state){return (state?.fixtures||[]).find(f=>!state.results?.[f.id]);}
export function nextUserFixture(state){return (state?.fixtures||[]).find(f=>(f.homeTeamId===state.teamId||f.awayTeamId===state.teamId)&&!state.results?.[f.id]);}
export function simulateSeasonFixture(fixture,teams,seed=1){
  const map=teamMap(teams),home=map.get(fixture.homeTeamId),away=map.get(fixture.awayTeamId),random=rngFrom(seed),rating=(team)=>Math.max(55,Math.min(99,asNumber(team?.overall)||75));
  const edge=(rating(home)-rating(away))/34+.12,homeScore=Math.max(0,Math.min(5,Math.floor(random()*2.5+Math.max(0,edge)+random()*.8))),awayScore=Math.max(0,Math.min(5,Math.floor(random()*2.5+Math.max(0,-edge)+random()*.8)));
  let hg=homeScore,ag=awayScore,winnerId=null,penalties=null;
  if(['semifinal','third-place','final'].includes(fixture.stage)&&hg===ag){winnerId=random()<.5?fixture.homeTeamId:fixture.awayTeamId;penalties=`${Math.floor(random()*3)+3}-${Math.floor(random()*3)+2}`;}
  const pick=(team,count)=>{const roster=team?.roster||[],outfield=roster.filter(p=>!(/goal|keeper/i.test(p.position||'')));const pool=outfield.length?outfield:roster;return Array.from({length:count},()=>pool[Math.floor(random()*Math.max(1,pool.length))]||roster[0]).filter(Boolean).map(p=>p.id);};
  const scorers={home:pick(home,hg),away:pick(away,ag)},playerMetrics={};
  for(const [side,team,goals,opponentGoals] of [['home',home,hg,ag],['away',away,ag,hg]]){
    const roster=team?.roster||[],outfield=roster.filter(p=>!(/goal|keeper/i.test(p.position||''))),shooters=outfield.length?outfield:roster;
    const shots=goals+Math.floor(random()*4),onTarget=Math.min(shots,goals+Math.floor(random()*2)),keeper=roster.find(p=>/goal|keeper/i.test(p.position||''));
    for(let i=0;i<shots;i++){const player=shooters[Math.floor(random()*Math.max(1,shooters.length))];if(!player)continue;const key=player.id;playerMetrics[key]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0,shotsAgainst:0};playerMetrics[key].shots++;if(i<onTarget)playerMetrics[key].onTarget++;}
    for(const playerId of scorers[side]){playerMetrics[playerId]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0,shotsAgainst:0};playerMetrics[playerId].shots++;playerMetrics[playerId].onTarget++;}
    for(let i=0;i<goals;i++){const assist=shooters.find(player=>player.id!==scorers[side][i]);if(assist){playerMetrics[assist.id]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0,shotsAgainst:0};playerMetrics[assist.id].assists++;}}
    if(keeper){playerMetrics[keeper.id]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0,shotsAgainst:0};playerMetrics[keeper.id].saves=Math.max(0,Math.floor(random()*3)+Math.max(0,onTarget-goals));playerMetrics[keeper.id].goalsAgainst=opponentGoals;playerMetrics[keeper.id].shotsAgainst=onTarget;}
  }
  if(!winnerId&&hg!==ag)winnerId=hg>ag?fixture.homeTeamId:fixture.awayTeamId;
  return {homeScore:hg,awayScore:ag,winnerId,penalties,scorers,playerMetrics};
}
export function applyFixtureResult(state,fixture,result,teams){
  state.results[fixture.id]={...result,playedAt:Date.now()};
  const map=teamMap(teams);
  for(const side of ['home','away']){const teamId=fixture[side+'TeamId'],team=map.get(teamId);for(const player of team?.lineup||team?.roster||[]){const key=teamId+':'+player.id;const metric=result.playerMetrics?.[player.id]||{};state.playerStats[key]??={playerId:player.id,name:player.name,jersey:player.jersey,position:player.position||player.role||'',teamId,teamName:team.name,goals:0,assists:0,shots:0,onTarget:0,saves:0,goalsAgainst:0,shotsAgainst:0,appearances:0,overall:player.overall||0};const stat=state.playerStats[key];stat.appearances++;stat.goals+=result.scorers?.[side]?.filter(id=>id===player.id).length||0;stat.assists+=metric.assists||0;stat.shots+=metric.shots||0;stat.onTarget+=metric.onTarget||0;stat.saves+=metric.saves||0;stat.goalsAgainst+=metric.goalsAgainst||0;stat.shotsAgainst+=metric.shotsAgainst||0;}}
  ensureFinals(state);return state;
}
export function recordLiveMatch(state,fixture,match,teams){
  const scorers={home:[],away:[]};for(const goal of match.goalEvents||[]){const side=goal.team===0?'home':'away';if(goal.playerId)scorers[side].push(goal.playerId);}
  const playerMetrics={};for(const [side,teamIndex] of [['home',0],['away',1]]){const roster=teams.find(team=>team.id===fixture[side+'TeamId'])?.roster||[],outfield=roster.filter(p=>!(/goal|keeper/i.test(p.position||''))),shooters=outfield.length?outfield:roster,teamStats=match.stats[teamIndex];for(let i=0;i<teamStats.shots;i++){const player=shooters[i%Math.max(1,shooters.length)];if(!player)continue;playerMetrics[player.id]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0};playerMetrics[player.id].shots++;if(i<teamStats.onTarget)playerMetrics[player.id].onTarget++;}for(const playerId of scorers[side]){playerMetrics[playerId]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0,shotsAgainst:0};playerMetrics[playerId].shots++;playerMetrics[playerId].onTarget++;}const keeper=roster.find(p=>/goal|keeper/i.test(p.position||''));if(keeper){playerMetrics[keeper.id]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0,shotsAgainst:0};playerMetrics[keeper.id].saves=teamStats.saves;playerMetrics[keeper.id].goalsAgainst=match.stats[1-teamIndex].goals;playerMetrics[keeper.id].shotsAgainst=match.stats[1-teamIndex].onTarget;}for(const goal of match.goalEvents||[]){if(goal.team===teamIndex&&goal.assist){const assistPlayer=roster.find(player=>player.name===goal.assist);if(assistPlayer){playerMetrics[assistPlayer.id]??={shots:0,onTarget:0,assists:0,saves:0,goalsAgainst:0,shotsAgainst:0};playerMetrics[assistPlayer.id].assists++;}}}}
  const result={homeScore:match.stats[0].goals,awayScore:match.stats[1].goals,scorers,playerMetrics};if(['semifinal','third-place','final'].includes(fixture.stage)&&result.homeScore===result.awayScore){result.winnerId=Math.random()<.5?fixture.homeTeamId:fixture.awayTeamId;result.penalties='4-3';}else result.winnerId=result.homeScore===result.awayScore?null:(result.homeScore>result.awayScore?fixture.homeTeamId:fixture.awayTeamId);return applyFixtureResult(state,fixture,result,teams);
}
export function applyMinorIncident(state,team,round,seed,options={}){
  const random=rngFrom(seed),roster=(team?.roster||[]).filter(p=>!(/goal|keeper/i.test(p.position||''))),allowInjury=options.injuries!==false,allowSuspension=options.suspensions!==false;if(!roster.length||(!allowInjury&&!allowSuspension)||random()>.24)return null;
  const player=roster[Math.floor(random()*roster.length)],type=allowInjury&&allowSuspension?(random()<.62?'MINOR INJURY':'SUSPENSION'):allowInjury?'MINOR INJURY':'SUSPENSION',returnRound=round+1+(type==='SUSPENSION'&&random()<.35?1:0);state.availability[team.id]??={};state.availability[team.id][player.id]={type,returnRound,name:player.name,jersey:player.jersey};return state.availability[team.id][player.id];
}
export function clearAvailability(state,round){for(const team of Object.values(state.availability||{}))for(const [id,status] of Object.entries(team))if(status.returnRound<=round)delete team[id];}
export function seasonAwards(state,teams){
  const players=Object.values(state.playerStats||{}),sorted=[...players].sort((a,b)=>b.goals-a.goals||b.overall-a.overall),champion=state.playoffs?.final&&state.results?.[state.playoffs.final.id]?winner(state.playoffs.final,state.results[state.playoffs.final.id]):null;
  const keepers=players.filter(player=>/goal|keeper/i.test(player.position||''));
  return {championId:champion,championName:teams.find(t=>t.id===champion)?.name||'—',goldenBoot:sorted[0]||null,playerOfSeason:[...players].sort((a,b)=>(b.goals*6+b.assists*3+b.overall*.08)-(a.goals*6+a.assists*3+a.overall*.08))[0]||null,keeper:[...keepers].sort((a,b)=>b.saves-a.saves||b.overall-a.overall)[0]||null};
}

