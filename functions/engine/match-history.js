import {playerOfMatch} from './match/stats.js';

export const MODE_LABELS={all:'All modes',quick:'Play Now',rivalry:'Rivalry Matches',tournament:'Tournament Mode',season:'Season Mode',dream:'LSL Dream F.C.',h2h:'Live Head to Head'};
export const DIFFICULTY_LABELS=Object.freeze({all:'All difficulties',easy:'Easy',normal:'Medium (Normal)',hard:'Hard',insane:'Insane'});
export const normalizeDifficulty=value=>String(value||'').trim().toLowerCase()==='medium'?'normal':String(value||'').trim().toLowerCase();
export const matchesDifficulty=(record,difficulty)=>!difficulty||difficulty==='all'||(!['local','account'].includes(record.opponent?.type)&&normalizeDifficulty(record.opponent?.difficulty)===normalizeDifficulty(difficulty));
export const modeFor=m=>m.dream?'dream':m.rivalry?'rivalry':m.tournament?'tournament':m.seasonMatch?'season':'quick';
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const copy=v=>JSON.parse(JSON.stringify(v));
// Firestore does not accept arrays directly nested inside arrays. Numeric team keys
// preserve the two-sided report API while storing each lineup as a map value.
const sides=values=>Object.fromEntries([0,1].map(team=>[team,copy(values?.[team]||[])]));
export const playerSnapshot=p=>({id:p.id??p.data?.id??'',name:p.name??p.data?.name??'',jersey:p.jersey??p.data?.jersey??null,position:p.role??p.position??'',team:p.team??0,slot:p.slot??null});
export function captureMatch(match,account={}){
  account=match.playingAccount||account;
  const players=[...(match.archive||[]),...(match.players||[])],goals=copy(match.goalEvents||[]),mode=modeFor(match);
  const score=(match.stats||[{},{}]).map(s=>n(s.goals)),potm=players.length?playerOfMatch(players):null;
  return copy({schemaVersion:2,id:crypto.randomUUID(),ownerId:account.uid||'',accountName:account.username||'',date:Date.now(),
    mode,modeLabel:MODE_LABELS[mode],season:String(match.tournament?.season||match.teams?.[0]?.season||match.settings?.season||''),
    competition:match.tournament?{name:'Inter-Madrasah',stage:match.tournament.stage||'',fixtureId:match.tournament.id||''}:match.seasonMatch?{name:'LSL Season',stage:match.seasonMatch.stage||'',fixtureId:match.seasonMatch.id||''}:match.dream?{name:'Dream F.C.',stage:match.dream.event?'Event':'CPU match'}:null,
    teams:(match.teams||[]).map(t=>t.name),teamIds:(match.teams||[]).map(t=>t.id||''),score,won:score[0]>score[1],tie:score[0]===score[1],
    duration:n(match.elapsed),scheduledDuration:n(match.settings?.duration)*60,opponent:{type:'cpu',difficulty:match.settings?.difficulty||'normal'},
    stats:{user:copy(match.stats?.[0]||{}),cpu:copy(match.stats?.[1]||{})},goals,substitutions:copy(match.subEvents||[]),injuries:copy(match.injuryEvents||[]),
    startingLineups:sides(match.startingLineups),finalLineups:sides([0,1].map(team=>(match.players||[]).filter(p=>p.team===team&&!p.sentOff).map(playerSnapshot))),
    startingFormations:sides(match.startingFormations),finalFormations:sides(match.formations),playerOfMatch:potm?playerSnapshot(potm):null,
    players:players.map(p=>({...playerSnapshot(p),goals:n(p.goals),assists:n(p.assists),shots:n(p.shots),onTarget:n(p.onTarget),passes:n(p.passes),tackles:n(p.tackles),saves:n(p.saves),yellows:n(p.yellow),reds:p.sentOff?1:0,involvement:n(p.involvement)}))});
}
export function uniqueMatches(records){return [...new Map(records.filter(r=>r?.id).map(r=>[r.id,r])).values()].sort((a,b)=>n(a.date)-n(b.date)||a.id.localeCompare(b.id));}
export function matchMetrics(r){
  const s=r.stats?.user||{},c=r.stats?.cpu||{},gf=n(r.score?.[0]),ga=n(r.score?.[1]),pos=n(s.possession)+n(c.possession);
  return {matches:1,wins:gf>ga?1:0,ties:gf===ga?1:0,losses:gf<ga?1:0,goals:gf,goalsAgainst:ga,
    assists:(r.goals||[]).filter(g=>g.team===0&&g.assist&&!g.ownGoal).length,shots:n(s.shots),shotsOnTarget:n(s.onTarget),passes:n(s.passes),completedPasses:n(s.completed),saves:n(s.saves),
    cleanSheets:ga===0?1:0,fouls:n(s.fouls),cards:n(s.yellows)+n(s.reds),yellows:n(s.yellows),reds:n(s.reds),corners:n(s.corners),
    penaltiesScored:r.schemaVersion>=2?n(s.penaltiesScored):null,penaltiesSaved:r.schemaVersion>=2?n(s.penaltiesSaved):null,
    freeKickGoals:r.schemaVersion>=2?n(s.freeKickGoals):null,cornerGoals:r.schemaVersion>=2?n(s.cornerGoals):null,
    possession:pos?n(s.possession)/pos*100:null,passAccuracy:n(s.passes)?n(s.completed)/n(s.passes)*100:null};
}
// Every account, chart and history view uses this reducer. Profile counters are a legacy cache only.
export function summarize(records){
  const totals={},streaks={wins:0,unbeaten:0,losses:0},best={wins:0,unbeaten:0,losses:0};
  for(const r of uniqueMatches(records)){const m=matchMetrics(r);for(const [key,value]of Object.entries(m))if(!['possession','passAccuracy'].includes(key)&&value!=null)totals[key]=(totals[key]||0)+value;
    streaks.wins=m.wins?streaks.wins+1:0;streaks.unbeaten=m.losses?0:streaks.unbeaten+1;streaks.losses=m.losses?streaks.losses+1:0;
    for(const key of Object.keys(best))best[key]=Math.max(best[key],streaks[key]);}
  return {...totals,longestWinningStreak:best.wins,longestUnbeatenStreak:best.unbeaten,longestLosingStreak:best.losses,winPercent:totals.matches?(totals.wins||0)/totals.matches*100:0};
}
export const RECORDS=[
  ['goalsGame','Most goals in one match','goals'],['assistsGame','Most assists in one match','assists'],['pointsGame','Most points in one match','points'],
  ['fastestGoal','Fastest goal','seconds',true],['hatTrick','Fastest hat trick','seconds',true],['biggestWin','Biggest win','margin'],['comeback','Biggest comeback','deficit'],
  ['shotsGame','Most shots in one match','shots'],['targetGame','Most shots on target in one match','shotsOnTarget'],['possession','Highest possession','possession'],
  ['passesGame','Most passes in one match','passes'],['accuracy','Best pass accuracy (10+ passes)','passAccuracy'],['savesGame','Most saves in one match','saves'],['highestScore','Highest scoring match','combined'],
  ['streakWins','Longest win streak','longestWinningStreak'],['streakUnbeaten','Longest unbeaten streak','longestUnbeatenStreak'],['streakLosses','Longest losing streak','longestLosingStreak'],
  ['totalGames','Most games played','matches'],['totalWins','Most total wins','wins'],['totalGoals','Most total goals','goals'],['totalAssists','Most total assists','assists'],
  ['totalShots','Most shots','shots'],['totalTarget','Most shots on target','shotsOnTarget'],['totalPasses','Most passes','passes'],['totalSaves','Most saves','saves'],['totalClean','Most clean sheets','cleanSheets'],
  ['totalFouls','Most fouls','fouls'],['totalCards','Most cards','cards'],['totalPenalties','Most penalties scored','penaltiesScored'],['totalPenaltySaves','Most penalties saved','penaltiesSaved'],
  ['totalFreeKicks','Most free-kick goals','freeKickGoals'],['totalCorners','Most corner goals','cornerGoals']
];
export function recordsFor(matches){
  const records={},ordered=uniqueMatches(matches),streaks={wins:0,unbeaten:0,losses:0};
  const offer=(key,value,r,player='')=>{if(value==null||!Number.isFinite(value)||value<0)return;const lower=RECORDS.find(d=>d[0]===key)?.[3];if(!records[key]||(lower?value<records[key].value:value>records[key].value))records[key]={value,match:r,player};};
  for(const r of ordered){const m=matchMetrics(r);
    for(const [key,,metric]of RECORDS.filter(d=>!d[0].startsWith('total')&&!d[0].startsWith('streak'))){let value=m[metric];if(key==='accuracy'&&m.passes<10)continue;if(key==='pointsGame')value=m.goals+m.assists;if(key==='biggestWin')value=m.wins?m.goals-m.goalsAgainst:null;if(key==='highestScore')value=m.goals+m.goalsAgainst;offer(key,value,r);}
    const goals=[...(r.goals||[])].sort((a,b)=>a.time-b.time),scorers=new Map();let a=0,b=0,deficit=0;
    for(const g of goals){if(g.team===0){a++;offer('fastestGoal',n(g.time),r,g.name);if(!g.ownGoal){const key=g.playerId||g.name,times=scorers.get(key)||[];times.push(n(g.time));scorers.set(key,times);if(times.length>=3)offer('hatTrick',times.at(-1)-times.at(-3),r,g.name);}}else b++;deficit=Math.max(deficit,b-a);}
    if(m.wins&&deficit>0)offer('comeback',deficit,r);
    // Streak provenance is the match at which the record was achieved.
    streaks.wins=m.wins?streaks.wins+1:0;streaks.unbeaten=m.losses?0:streaks.unbeaten+1;streaks.losses=m.losses?streaks.losses+1:0;
    for(const [key,metric]of [['streakWins','wins'],['streakUnbeaten','unbeaten'],['streakLosses','losses']])if(streaks[metric]>0)offer(key,streaks[metric],r);
  }
  const totals=summarize(ordered);for(const [key,,metric]of RECORDS.filter(d=>d[0].startsWith('total')))if(totals[metric]>0)records[key]={value:totals[metric],match:null};
  return records;
}
export function filterMatches(records,f={}){
  const q=String(f.search||'').toLowerCase();const result=records.filter(r=>{
    const m=matchMetrics(r),outcome=m.wins?'wins':m.ties?'draws':'losses';
    return (!q||[...r.teams||[],r.accountName,r.modeLabel,r.competition?.name,...(r.goals||[]).map(g=>g.name)].join(' ').toLowerCase().includes(q))&&(!f.mode||f.mode==='all'||r.mode===f.mode)&&(!f.result||f.result==='all'||outcome===f.result)&&(!f.team||r.teams?.[0]===f.team)&&(!f.opponent||r.teams?.[1]===f.opponent)&&(!f.season||r.season===f.season)&&matchesDifficulty(r,f.difficulty)&&(!f.from||r.date>=new Date(f.from+'T00:00:00').getTime())&&(!f.to||r.date<=new Date(f.to+'T23:59:59.999').getTime());});
  return result.sort((a,b)=>f.sort==='oldest'?a.date-b.date:f.sort==='goals'?(b.score[0]+b.score[1])-(a.score[0]+a.score[1])||b.date-a.date:f.sort==='margin'?(b.score[0]-b.score[1])-(a.score[0]-a.score[1])||b.date-a.date:b.date-a.date);
}
