export function teamStats(){return {goals:0,shots:0,onTarget:0,possession:0,passes:0,completed:0,fouls:0,yellows:0,reds:0,corners:0,saves:0,substitutions:0,injuries:0,penalties:0,penaltiesScored:0,penaltiesSaved:0,freeKickGoals:0,cornerGoals:0};}
export function performance(p){return p.goals*5+p.assists*3+p.saves*1.4+p.tackles*.6+p.passes*.15+p.involvement*.1-p.yellow*.7-(p.sentOff?3:0);}
export function playerOfMatch(players){return [...players].sort((a,b)=>performance(b)-performance(a))[0];}
export function statRows(match){
  const [a,b]=match.stats,total=a.possession+b.possession||1;
  return [
    ['Shots',a.shots,b.shots],['On target',a.onTarget,b.onTarget],
    ['Possession',Math.round(a.possession/total*100)+'%',Math.round(b.possession/total*100)+'%'],
    ['Passes',a.passes,b.passes],['Pass accuracy',a.passes?Math.round(a.completed/a.passes*100)+'%':'—',b.passes?Math.round(b.completed/b.passes*100)+'%':'—'],
    ['Fouls',a.fouls,b.fouls],['Yellow cards',a.yellows,b.yellows],['Red cards',a.reds,b.reds],
    ['Corners',a.corners,b.corners],['Saves',a.saves,b.saves],['Injuries',a.injuries,b.injuries],['Substitutions',a.substitutions,b.substitutions]
  ];
}
