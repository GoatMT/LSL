import {FIELD,clamp,distance} from '../config.js';

// Cosmetic preferences are stable per player, independent of official LSL ratings.
export const CELEBRATIONS=Object.freeze([
  'slide','double-slide','arms','jump','point','hug','calm','badge','spin',
  'backward-slide','crossed','high-jump','pile','captain','late-winner','fist'
].map(name=>'celebrate-'+name));
const dramatic=['celebrate-double-slide','celebrate-high-jump','celebrate-pile','celebrate-hug','celebrate-late-winner'];
export function preferredCelebration(player){
  if(CELEBRATIONS.includes(player?.data?.celebration))return player.data.celebration;
  let hash=0;for(const letter of String(player?.id||player?.name||'player'))hash=(hash*31+letter.charCodeAt(0))>>>0;
  const personal=CELEBRATIONS.filter(n=>!['celebrate-late-winner','celebrate-captain'].includes(n));
  return personal[hash%personal.length];
}
export function chooseCelebration(match,player,team){
  const own=match.stats[team].goals,other=match.stats[1-team].goals;
  const late=match.elapsed>=match.settings.duration*60*.8;
  const final=[match.tournament,match.seasonMatch,match.rivalry].some(f=>f&&[f.stage,f.round,f.label].some(s=>/^(grand |championship )?final$/i.test(String(s))));
  const equalizer=own===other,lateWinner=late&&own===other+1;
  const big=lateWinner||equalizer||final;
  const captain=player?.data?.leadershipRole==='captain';
  const pool=big?[...dramatic,...(lateWinner?['celebrate-late-winner','celebrate-late-winner']:[])]:CELEBRATIONS.filter(n=>n!=='celebrate-late-winner'&&(captain||n!=='celebrate-captain'));
  const weights=pool.map(name=>({name,weight:1+(name===preferredCelebration(player)?3:0)+(name==='celebrate-captain'&&captain?3:0)})).filter(x=>x.name!==match.previousCelebration);
  let draw=match.random()*weights.reduce((sum,x)=>sum+x.weight,0);
  const name=weights.find(x=>(draw-=x.weight)<0)?.name||weights.at(-1).name;
  return {name,duration:big||name==='celebrate-double-slide'?10.5:8.5,big,equalizer,lateWinner,final};
}
export function startCelebration(match){
  const lead=match.celebratingPlayer;if(!lead)return;
  match.celebration=chooseCelebration(match,lead,match.scoringTeam);
  match.goalCelebration=match.previousCelebration=match.celebration.name;
  match.celebrationTime=0;match.doubleSlideStarted=false;
  for(const p of match.players){p.skillPlan=null;p.skill=0;p.striking=false;p.action=null;}
  lead.animate(match.goalCelebration,match.celebration.duration);
  match.celebrationMates=match.active(match.scoringTeam).filter(p=>p!==lead&&p.role!=='GK').sort((a,b)=>distance(a,lead)-distance(b,lead));
  match.players.filter(p=>p.team!==match.scoringTeam).forEach(p=>p.animate(p.role==='GK'?'concede':'miss',3));
}
export function updateCelebration(match,dt){
  const lead=match.celebratingPlayer;if(!lead)return;
  const c=match.celebration,t=match.celebrationTime+=dt,name=c.name;
  const paired=name==='celebrate-double-slide',slide=name.includes('slide'),running=['celebrate-arms','celebrate-late-winner'].includes(name);
  const sign=lead.z<0?-1:1,dx=-match.direction(lead.team)*.3,dz=sign;
  // Approach, decelerate, then hold the pose. Slides retain a little momentum.
  let pace=running?Math.max(0,1-t/3)*.48:name==='celebrate-calm'?.12:0;
  const slideTime=paired?(match.doubleSlideStarted?lead.action?.time||0:0):t;
  if(slide)pace=paired&&!match.doubleSlideStarted?0:slideTime<.85?.34:slideTime<3.2?.3*Math.exp(-(slideTime-.85)*1.5):0;
  if(paired&&!match.doubleSlideStarted&&lead.action)lead.action.time=0;
  const backward=name==='celebrate-backward-slide';
  lead.move(dx*(backward?-1:1),dz*(backward?-1:1),pace,dt,false,backward?{x:lead.x+dx,z:lead.z+dz}:null);
  lead.x=clamp(lead.x,-FIELD.halfLength+3,FIELD.halfLength-3);lead.z=clamp(lead.z,-FIELD.halfWidth+3,FIELD.halfWidth-3);
  lead.watch({x:lead.x+lead.faceX*8,z:lead.z+lead.faceZ*8});
  const mates=match.celebrationMates||[],group=['celebrate-hug','celebrate-pile','celebrate-late-winner'].includes(name)||c.big;
  for(const p of match.players){
    if(p===lead)continue;
    const index=mates.indexOf(p);
    if(index<0){const clear=!p.sentOff&&p.team!==match.scoringTeam&&distance(p,lead)<7;p.move(clear?p.x-lead.x:0,clear?p.z-lead.z:0,clear?.22:0,dt);continue;}
    const angle=index/Math.max(1,mates.length)*Math.PI*2;
    const radius=name==='celebrate-pile'?1.35:group?1.75:3.1;
    const target={x:clamp(lead.x+Math.cos(angle)*radius,-FIELD.halfLength+1,FIELD.halfLength-1),z:clamp(lead.z+Math.sin(angle)*radius,-FIELD.halfWidth+1,FIELD.halfWidth-1)};
    if(paired&&index===0){target.x=lead.x+lead.faceZ*2.1;target.z=lead.z-lead.faceX*2.1;}
    const gap=distance(p,target),delay=.35+index*.22;
    if(paired&&index===0&&gap<.65&&!match.doubleSlideStarted){
      match.doubleSlideStarted=true;
      const duration=Math.max(2,c.duration-t);lead.animate(name,duration);p.animate(name,duration);
    }
    if(paired&&index===0&&match.doubleSlideStarted){p.move(dx,dz,pace,dt,false,{x:p.x+lead.faceX,z:p.z+lead.faceZ});p.watch(lead);continue;}
    p.move(target.x-p.x,target.z-p.z,t<delay?0:Math.min(c.lateWinner?.88:.7,gap*.6),dt,false,gap<3?lead:null);p.watch(lead);
    if(gap<.6&&!p.action){
      let action=group?(name==='celebrate-pile'?'celebrate-pile-mate':'celebrate-hug-mate'):'applaud';
      p.animate(action,Math.max(.5,c.duration-t),{index});
    }
  }
}
