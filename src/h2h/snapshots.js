import {PLAY} from '../config.js';
const poseKeys=['x','z','vx','vz','faceX','faceZ','lookX','lookZ','gait','turn','acceleration','animationTime'];
const ballKeys=['x','y','z','vx','vy','vz','rollX','rollZ','rotationY'];
const scalarKeys=['sideline','phase','phaseTime','elapsed','half','scoringTeam','goalCelebration','celebration','replayActive','replayStage','replayClock','replayStageTime','replayPlayback','replayFocus','message','lastReaction','timeouts'];
export function snapshot(match,tick){
 const index=p=>p?match.players.indexOf(p):-1;
 return {v:1,tick,state:Object.fromEntries(scalarKeys.map(k=>[k,match[k]??null])),ball:ballKeys.map(k=>match.ball[k]||0),owner:index(match.ball.owner),mode:match.ball.controlMode,
  players:match.players.map(p=>({id:p.id,pose:poseKeys.map(k=>Math.round((p[k]||0)*1000)/1000),animation:p.animation,locomotion:p.locomotion,action:p.action,sentOff:p.sentOff,yellow:p.yellow,injured:!!p.injured,boosting:p.boosting})),
  ref:poseKeys.map(k=>match.referee[k]||0),refAction:match.referee.action,refAnimation:match.referee.animation,seats:match.humanSeats.map(s=>({controlled:index(s.controlled),charge:s.charge,aimZ:s.aimZ,manualKeeper:s.manualKeeper===true})),stats:match.stats,benches:match.benches.map(list=>list.map(p=>p.id)),
  restart:match.restart?{...match.restart,taker:index(match.restart.taker)}:null,celebrating:index(match.celebratingPlayer),moment:match.moment?{...match.moment,player:match.moment.player===match.referee?-2:index(match.moment.player)}:null};
}
export class SnapshotView{
 constructor(match,side,onPhase=()=>{},onPlayer=()=>{}){this.match=match;this.side=side;this.onPhase=onPhase;this.onPlayer=onPlayer;this.queue=[];this.latestTick=-1;}
 push(value){if(value?.v!==1||!Number.isInteger(value.tick)||value.tick<=this.latestTick||value.players?.length!==14||value.ball?.length!==ballKeys.length)return;this.latestTick=value.tick;this.queue.push({at:performance.now(),value});if(this.queue.length>12)this.queue.shift();}
 update(input){
  if(!this.queue.length)return;const target=performance.now()-85;while(this.queue.length>2&&this.queue[1].at<=target)this.queue.shift();
  const a=this.queue[0],b=this.queue[1]||a,s=a.value,n=b.value,blend=Math.max(0,Math.min(1,(target-a.at)/Math.max(1,b.at-a.at))),m=this.match,phase=m.phase;
  const interpolate=s.state.phase===n.state.phase?blend:0;Object.assign(m,s.state);
  const player=i=>i===-2?m.referee:i>=0?m.players[i]:null;
  s.players.forEach((p,i)=>{const actor=m.players[i];if(actor.id!==p.id){const data=m.teams[actor.team].roster.find(item=>item.id===p.id);if(data){actor.id=data.id;actor.name=data.name;actor.jersey=data.jersey;actor.data={...data};this.onPlayer(actor);}}
   poseKeys.forEach((k,j)=>actor[k]=p.pose[j]+(n.players[i].pose[j]-p.pose[j])*interpolate);Object.assign(actor,{animation:p.animation,locomotion:p.locomotion,action:p.action,sentOff:p.sentOff,yellow:p.yellow,injured:p.injured,boosting:p.boosting,hasBall:s.owner===i});});
  ballKeys.forEach((k,j)=>m.ball[k]=s.ball[j]+(n.ball[j]-s.ball[j])*interpolate);poseKeys.forEach((k,j)=>m.referee[k]=s.ref[j]);m.referee.action=s.refAction;m.referee.animation=s.refAnimation;m.ball.owner=player(s.owner);m.ball.controlMode=s.mode;m.stats=s.stats;if(s.benches)m.benches=s.benches.map((ids,side)=>m.teams[side].roster.filter(p=>ids.includes(p.id)));
  m.controlled=player(s.seats[this.side].controlled)||m.players[this.side*7+5];m.manualKeeper=s.seats[this.side].manualKeeper;m.charge=s.seats[this.side].charge;m.aimZ=s.seats[this.side].aimZ;
  m.restart=s.restart?{...s.restart,taker:player(s.restart.taker)}:null;m.celebratingPlayer=player(s.celebrating);m.moment=s.moment?{...s.moment,player:player(s.moment.player)}:null;
  if(m.phase==='playing'&&input&&m.controlled){const p=m.controlled,lead=.035,tx=p.x+input.x*PLAY.runSpeed*p.attributes.speed*lead,tz=p.z+input.z*PLAY.runSpeed*p.attributes.speed*lead;if(!this.visual||this.visual.id!==p.id)this.visual={id:p.id,x:p.x,z:p.z};const gap=Math.hypot(tx-this.visual.x,tz-this.visual.z),ease=gap>3?1:.4;this.visual.x+=(tx-this.visual.x)*ease;this.visual.z+=(tz-this.visual.z)*ease;p.x=this.visual.x;p.z=this.visual.z;}else this.visual=null;
  if(phase!==m.phase)this.onPhase(m.phase);
 }
}
