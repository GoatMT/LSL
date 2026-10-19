const KEY='lsl-account-v1';
const empty=()=>({matches:0,wins:0,draws:0,losses:0,trophies:[],records:{fastestGoal:null,mostGoalsGame:null,biggestWin:null,longestWinningStreak:0},currentStreak:0,history:[]});
export function readAccount(storage=globalThis.localStorage){let value;try{value=JSON.parse(storage?.getItem(KEY)||'null');}catch{}return {...empty(),...(value||{}),records:{...empty().records,...(value?.records||{})},trophies:[...(value?.trophies||[])],history:[...(value?.history||[])]};}
export function saveAccount(account,storage=globalThis.localStorage){try{storage?.setItem(KEY,JSON.stringify(account));}catch{}return account;}
const addTrophy=(a,id,title,description)=>{if(!a.trophies.some(t=>t.id===id))a.trophies.push({id,title,description,earnedAt:Date.now()});};
export class Account{
  constructor(storage){this.storage=storage;this.state=readAccount(storage);}
  refresh(){this.state=readAccount(this.storage);return this.state;}
  recordMatch(match){
    if(!match||match.phase!=='fulltime'||match.accountRecorded)return this.state;
    match.accountRecorded=true;const a=this.state,user=match.stats[0],cpu=match.stats[1],diff=user.goals-cpu.goals,won=diff>0,draw=diff===0;
    a.matches++;won?a.wins++:draw?a.draws++:a.losses++;a.currentStreak=won?a.currentStreak+1:0;a.records.longestWinningStreak=Math.max(a.records.longestWinningStreak,a.currentStreak);
    const goals=match.goalEvents||[],userGoals=goals.filter(g=>g.team===0),fastest=userGoals.sort((x,y)=>x.time-y.time)[0];if(fastest&&(!a.records.fastestGoal||fastest.time<a.records.fastestGoal.seconds))a.records.fastestGoal={seconds:fastest.time,name:fastest.name,jersey:fastest.jersey,season:match.settings.season};
    const counts=new Map();for(const g of goals)counts.set(g.name,(counts.get(g.name)||0)+1);const top=[...counts].sort((x,y)=>y[1]-x[1])[0];if(top&&(!a.records.mostGoalsGame||top[1]>a.records.mostGoalsGame.goals))a.records.mostGoalsGame={goals:top[1],name:top[0],season:match.settings.season};
    if(won&&(!a.records.biggestWin||diff>a.records.biggestWin.margin))a.records.biggestWin={margin:diff,score:`${user.goals}–${cpu.goals}`,team:match.teams[0].name,season:match.settings.season};
    if(a.matches===1)addTrophy(a,'first-match','FIRST MATCH','Completed your first LSL match.');
    if(won){addTrophy(a,'first-win','FIRST WIN','Won your first LSL match.');if(a.currentStreak>=3)addTrophy(a,'hot-streak','HOT STREAK','Won three matches in a row.');if(match.rivalry)addTrophy(a,'rivalry-win','RIVALRY NIGHT','Won a featured rivalry match.');if(match.tournament)addTrophy(a,'tournament-win','TOURNAMENT RUN','Won an Inter-Madrasah fixture.');if(match.seasonMatch)addTrophy(a,'season-win','SEASON CAMPAIGN','Won a season fixture.');if(match.dream)addTrophy(a,'dream-win','DREAM BUILDER','Won a Dream F.C. CPU match.');}
    if(cpu.goals===0&&won)addTrophy(a,'clean-sheet','SHUTOUT','Won without conceding.');
    a.history.unshift({date:Date.now(),season:match.settings.season,mode:match.dream?'Dream F.C.':match.rivalry?'Rivalry':match.tournament?'Tournament':match.seasonMatch?'Season':'Quick Match',teams:match.teams.map(t=>t.name),score:[user.goals,cpu.goals]});a.history=a.history.slice(0,40);saveAccount(a,this.storage);return a;
  }
}
