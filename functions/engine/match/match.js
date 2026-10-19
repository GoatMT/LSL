import {queueSideline,advanceSideline,skipSideline} from './sideline.js';
import {startCelebration,updateCelebration} from './celebrations.js';
import {matchDuration} from '../match-options.js';
import { FIELD,PLAY,FORMATION,fieldUnits as u,DIFFICULTY,clamp,distance,normalize } from '../config.js';
import { Player } from './player.js';
import { playerLabel } from '../player-label.js';
import { Ball } from './ball.js';
import { updateAI,bestPass,ballIntercept } from './ai.js';
import { boundaryEvent,goalFrameContact,resolveFrameContact,foulRestart } from './rules.js';
import { playerContact } from './contacts.js';
import { passSpeed,reflectVelocity } from './physics.js';
import {playerSnapshot} from '../match-history.js';
import { teamStats } from './stats.js';
import { keeperContact } from './goalkeeper.js';
import { chooseShotTarget } from './tactics.js';
import { performSkill } from './skills.js';
import { planShot,shotTechnique,contactFoot } from './shooting.js';
import { startStrike,advanceStrike } from './striking.js';
import { INTRO,PRESENTATION,restartPresentation } from '../presentation.js';

export class Match {
  constructor(teams,settings,{event=()=>{},random=Math.random}={}){
    this.teams=teams;this.settings={...settings,duration:matchDuration(settings.duration)};this.inputTeam=0;this.event=event;this.random=random;
    this.formations=teams.map(team=>team.formation?.length===7?team.formation:FORMATION);
    this.players=teams.flatMap((team,index)=>team.lineup.map((data,slot)=>new Player(data,index,slot,index===0?1:-1,this.formations[index])));
    this.startingLineups=[0,1].map(team=>this.players.filter(p=>p.team===team).map(playerSnapshot));this.startingFormations=JSON.parse(JSON.stringify(this.formations));
    this.benches=teams.map(t=>t.bench.map(p=>({...p})));this.used=[[],[]];this.archive=[];this.pending=[];
    this.stats=[teamStats(),teamStats()];this.goalEvents=[];this.subEvents=[];this.injuryEvents=[];this.lastReaction=null;
    this.ball=new Ball();this.controlled=this.players[5];this.phase='intro';this.phaseTime=0;this.elapsed=0;this.half=1;
    this.paused=false;this.charge=0;this.aimZ=0;this.switchCooldown=0;this.receiverAssist=false;this.restart=null;this.message='';this.timeouts=[false,false];this.replayBuffer=[];this.replayFrames=[];this.replayActive=false;this.replayClock=0;this.replayFocus=null;this.replayStage='celebrate';this.replayStageTime=0;this.replayPlayback=0;
    this.referee=new Player({id:'referee',name:'Referee',jersey:null},-1,3,1);this.referee.x=-u(8);this.referee.z=u(6);
    for(const team of [0,1]){const captain=this.players.filter(p=>p.team===team).find(p=>p.data.leadershipRole==='captain')||this.players.filter(p=>p.team===team&&p.role!=='GK').sort((a,b)=>(Number(b.data.overall)||0)-(Number(a.data.overall)||0))[0];if(captain)captain.data.leadershipRole='captain';}
    this.resetFormation();this.passHeldTime=0;this.holdSwitchTime=0;this.curveRequested=false;
    for(const p of this.players){p.x-=this.direction(p.team)*5;p.z+=2;}
  }
  enableH2H(){
    this.humanKeys=['controlled','charge','aimZ','switchCooldown','receiverAssist','manualKeeper','keeperReturn','passHeldTime','holdSwitchTime','curveRequested','cancelShotUntilRelease'];
    this.humanSeats=[0,1].map(team=>({...Object.fromEntries(this.humanKeys.map(key=>[key,this[key]])),controlled:this.players.find(p=>p.team===team&&p.slot===5)}));
    return this;
  }
  withHuman(team,fn){
    const saved=Object.fromEntries(this.humanKeys.map(key=>[key,this[key]])),previous=this.inputTeam;
    Object.assign(this,this.humanSeats[team]);this.inputTeam=team;
    try{return fn();}finally{for(const key of this.humanKeys)this.humanSeats[team][key]=this[key];Object.assign(this,saved);this.inputTeam=previous;}
  }
  isHumanControlled(p){return this.humanSeats?this.humanSeats.some(s=>s.controlled===p&&(p.role!=='GK'||this.ball.owner===p||s.manualKeeper)):p===this.controlled&&(p.role!=='GK'||this.ball.owner===p||this.manualKeeper);}
  direction(team){return (team===0?1:-1)*(this.half===1?1:-1);}
  aiConfig(team){return DIFFICULTY[this.humanSeats||team===1?this.settings.difficulty:'normal']||DIFFICULTY.normal;}
  active(team){return this.players.filter(p=>p.team===team&&!p.sentOff);}
  react(kind){if(kind)this.lastReaction={kind,time:this.elapsed};}
  notify(title,subtitle='',seconds=2.5,details={}){this.message=title;const reaction=/GOAL|SAVE|MISS|FOUL|CARD|CORNER|PENALTY/.test(title)?title:null;this.react(reaction);this.event('notice',{title,subtitle,seconds,...details});}
  setPhase(phase){
    if(this.pendingStrike&&phase!=='playing'){this.pendingStrike.p.striking=false;this.pendingStrike=null;}
    if(phase!=='playing'){this.manualKeeper=false;this.keeperReturn=false;this.defensiveRoles=null;this.kickoffAttack=null;}
    if(this.humanSeats&&phase!=='playing')for(const seat of this.humanSeats){seat.charge=0;seat.curveRequested=false;seat.manualKeeper=false;seat.keeperReturn=false;}
    this.phase=phase;this.phaseTime=0;this.charge=0;this.curveRequested=false;
    this.event('phase',phase);
  }
  resetFormation(){this.players.forEach(p=>p.reset(this.direction(p.team)));this.ball.reset();this.replayBuffer=[];this.replayFrames=[];this.replayActive=false;this.replayFocus=null;this.replayStage='celebrate';this.replayStageTime=0;this.replayPlayback=0;}
  captureReplayFrame(){return {time:this.elapsed,ball:{x:this.ball.x,y:this.ball.y,z:this.ball.z,vx:this.ball.vx,vy:this.ball.vy,vz:this.ball.vz,rotationY:this.ball.rotationY,rollX:this.ball.rollX,rollZ:this.ball.rollZ},players:this.players.map(p=>({x:p.x,z:p.z,vx:p.vx,vz:p.vz,faceX:p.faceX,faceZ:p.faceZ}))};}
  recordReplayFrame(){if(this.phase!=='playing')return;this.replayBuffer.push(this.captureReplayFrame());while(this.replayBuffer.length>2&&this.replayBuffer[0].time<this.elapsed-4.5)this.replayBuffer.shift();}
  startReplay(finalFrame){let frames=[...this.replayBuffer,finalFrame].filter((frame,index,array)=>index===0||frame.time>=array[index-1].time);if(frames.length<2){const rewind=.9;frames=[{time:finalFrame.time-rewind,ball:{...finalFrame.ball,x:finalFrame.ball.x-finalFrame.ball.vx*rewind,y:Math.max(0,finalFrame.ball.y-finalFrame.ball.vy*rewind),z:finalFrame.ball.z-finalFrame.ball.vz*rewind},players:finalFrame.players.map(p=>({...p,x:p.x-p.vx*rewind,z:p.z-p.vz*rewind}))},finalFrame];}const end=frames.at(-1).time,start=Math.max(frames[0].time,end-4.5);this.replayFrames=frames.filter(frame=>frame.time>=start);this.replayClock=0;this.replayStage='celebrate';this.replayStageTime=0;this.replayPlayback=Math.max(2.4,Math.min(PRESENTATION.replay,this.replayFrames.at(-1).time-this.replayFrames[0].time||2.4));this.replayActive=true;this.replayFocus={x:finalFrame.ball.x,z:finalFrame.ball.z};}
  applyReplayFrame(frame,next,blend){const b=frame.ball,n=next?.ball||b;this.ball.owner=null;this.ball.controlMode='feet';for(const p of this.players)p.hasBall=false;this.ball.x=b.x+(n.x-b.x)*blend;this.ball.y=b.y+(n.y-b.y)*blend;this.ball.z=b.z+(n.z-b.z)*blend;this.ball.vx=b.vx+(n.vx-b.vx)*blend;this.ball.vy=b.vy+(n.vy-b.vy)*blend;this.ball.vz=b.vz+(n.vz-b.vz)*blend;this.ball.rotationY=b.rotationY+(n.rotationY-b.rotationY)*blend;this.ball.rollX=b.rollX+(n.rollX-b.rollX)*blend;this.ball.rollZ=b.rollZ+(n.rollZ-b.rollZ)*blend;this.replayFocus={x:this.ball.x,z:this.ball.z};this.players.forEach((p,index)=>{const a=frame.players[index],q=next?.players[index]||a;p.x=a.x+(q.x-a.x)*blend;p.z=a.z+(q.z-a.z)*blend;p.vx=a.vx+(q.vx-a.vx)*blend;p.vz=a.vz+(q.vz-a.vz)*blend;p.faceX=a.faceX+(q.faceX-a.faceX)*blend;p.faceZ=a.faceZ+(q.faceZ-a.faceZ)*blend;p.action=null;p.animation=Math.hypot(p.vx,p.vz)>.2?'run':'idle';p.locomotion=Math.hypot(p.vx,p.vz)>.2?'run':'idle';});}
  updateReplay(dt){if(!this.replayFrames.length){this.finishReplay();return;}let remaining=Math.max(0,dt);while(remaining>0&&this.replayActive){if(this.replayStage==='celebrate'){const left=Math.max(0,(this.celebration?.duration||PRESENTATION.replayLead)-this.replayStageTime);if(remaining<left){this.replayStageTime+=remaining;return;}remaining-=left;this.celebrationEnd=this.captureReplayFrame();this.replayStage='transition';this.replayStageTime=0;continue;}if(this.replayStage==='transition'){const left=Math.max(0,PRESENTATION.replayTransition-this.replayStageTime);if(remaining<left){this.replayStageTime+=remaining;return;}remaining-=left;this.replayStage='playback';this.replayStageTime=0;continue;}const step=Math.min(remaining,Math.max(0,this.replayPlayback-this.replayClock));this.replayClock+=step;remaining-=step;const ratio=clamp(this.replayClock/this.replayPlayback,0,1),time=this.replayFrames[0].time+(this.replayFrames.at(-1).time-this.replayFrames[0].time)*ratio;let index=0;while(index<this.replayFrames.length-2&&this.replayFrames[index+1].time<time)index++;const frame=this.replayFrames[index],next=this.replayFrames[index+1]||frame,blend=clamp((time-frame.time)/Math.max(.001,next.time-frame.time),0,1);this.applyReplayFrame(frame,next,blend);if(this.replayClock>=this.replayPlayback)this.finishReplay();}}
  finishReplay(){
    if(!this.replayActive)return;
    if(this.celebrationEnd)this.applyReplayFrame(this.celebrationEnd,null,0);
    this.replayActive=false;this.replayStage='done';this.replayStageTime=0;this.replayFocus=null;this.goalReturnTime=1.4;
    this.ball.settleInNet(this.direction(this.scoringTeam));
    this.active(this.scoringTeam).forEach(p=>p.animate(p===this.celebratingPlayer?'celebrate-calm':'applaud',1.4));
    if(this.elapsed>=this.settings.duration*48)queueSideline(this,'late-goal',this.scoringTeam,{variant:this.celebration?.lateWinner?'celebrate':'urgent'});
  }
  skipSideline(){skipSideline(this);}
  finishMatch(){
    if(['outro','fulltime'].includes(this.phase))return;
    this.sideline=null;this.sidelineQueue=[];this.setPhase('outro');
    queueSideline(this,'fulltime',this.stats[1].goals>this.stats[0].goals?1:0);
  }
  skipReplay(){if(this.phase==='goal'&&this.replayActive)this.finishReplay();}
  skipIntro(){if(this.phase==='intro'){this.resetFormation();this.beginRestart({type:'KICK OFF',team:0,x:0,z:0});}}
  callTimeoutAtStoppage(data){
    if(!['THROW-IN','THROW IN','CORNER','GOAL KICK','FREE KICK','PENALTY'].includes(String(data.type).toUpperCase()))return false;
    const scores=this.stats.map(s=>s.goals);if(scores[0]===scores[1])return false;
    const trailing=scores[0]<scores[1]?0:1;if(this.timeouts[trailing])return false;
    this.timeouts[trailing]=true;
    return queueSideline(this,'timeout',trailing,{score:[...scores],restartType:data.type});
  }
  pause(value=true){if(['intro','playing','restart','goal'].includes(this.phase)){this.paused=value;this.charge=0;this.curveRequested=false;this.event('pause',value);}}
  continueHalf(){
    if(this.phase!=='halftime')return;
    this.applySubstitutions();queueSideline(this,'halftime',this.localTeam||0);this.half=2;
    this.resetFormation();this.beginRestart({type:'KICK OFF',team:1,x:0,z:0});this.notify('SECOND HALF','Ends changed · '+this.teams[1].name+' kickoff');
  }
  possessionTeam(){return this.ball.owner?.team??this.ball.pass?.team??this.ball.lastTouch?.team;}
  bestOutfield(){
    const point=ballIntercept(this.ball,.18),dir=this.direction(this.inputTeam);
    const score=p=>{const gap=distance(p,this.ball);return gap<3?gap:gap*.7+distance(p,point)*.3+(p.x*dir>this.ball.x*dir?.45:0)+(p.striking?3:0);};
    return this.active(this.inputTeam).filter(p=>p.role!=='GK').sort((a,b)=>score(a)-score(b))[0];
  }
  toggleGoalkeeper(){
    const penaltyKeeper=this.phase==='restart'&&this.restart?.type==='PENALTY'&&this.restart.team!==this.inputTeam;
    if(this.phase!=='playing'&&!penaltyKeeper)return;
    const keeper=this.active(this.inputTeam).find(p=>p.role==='GK');if(!keeper)return;
    this.receiverAssist=false;this.charge=0;this.curveRequested=false;
    if(penaltyKeeper){this.controlled=keeper;this.manualKeeper=true;this.keeperReturn=false;return;}
    if(this.controlled===keeper){this.controlled=this.bestOutfield()||keeper;this.manualKeeper=false;this.keeperReturn=true;this.switchCooldown=2.3;}
    else{this.controlled=keeper;this.manualKeeper=true;this.keeperReturn=false;}
  }
  selectPlayer(manual=false){
    if(manual){this.manualKeeper=false;this.keeperReturn=false;}
    if(!manual&&this.manualKeeper&&!this.controlled?.sentOff)return;
    if(!manual&&this.keeperReturn&&this.ball.owner?.team===this.inputTeam&&this.ball.owner.role==='GK')return;
    this.keeperReturn=false;
    if(manual)this.receiverAssist=false;
    if(this.restart&&this.phase==='restart'){if(this.restart.team===this.inputTeam)this.controlled=this.restart.taker;return;}
    if(this.ball.owner?.team===this.inputTeam&&!this.ball.owner.sentOff){this.controlled=this.ball.owner;return;}
    if(!manual&&this.receiverAssist&&this.ball.pass?.team===this.inputTeam&&!this.ball.pass.target?.sentOff&&this.ball.pass.target){this.controlled=this.ball.pass.target;return;}
    const candidates=this.active(this.inputTeam).filter(p=>p.role!=='GK').sort((a,b)=>distance(a,this.ball)-distance(b,this.ball));
    if(!candidates.length)return;
    if(manual){this.controlled=this.bestOutfield()||candidates[0];this.switchCooldown=2.3;}
    else if(this.controlled?.role==='GK'||this.switchCooldown<=0&&(!this.controlled||this.controlled.sentOff||distance(this.controlled,this.ball)>distance(candidates[0],this.ball)+5)){this.controlled=candidates[0];this.switchCooldown=.8;}
  }
  update(dt,input){
    if(this.paused)return;
    advanceSideline(this,dt);
    if(this.phase==='outro'){this.setPhase('fulltime');return;}
    this.phaseTime+=dt;this.switchCooldown=Math.max(0,this.switchCooldown-dt);
    this.players.forEach(p=>p.tick(dt));this.referee.tick(dt);
    advanceStrike(this,dt);
    if(this.moment){this.moment.time-=dt;if(this.moment.time<=0)this.moment=null;}
    if(['halftime','fulltime'].includes(this.phase)){this.players.forEach(p=>p.move(0,0,0,dt));return;}
    if(this.phase==='home'){
      for(const p of this.players){p.move(Math.cos(this.phaseTime*.4+p.slot)*.5,Math.sin(this.phaseTime*.4+p.slot)*.5,.25,dt);}
      return;
    }
    if(this.phase==='intro'){
      if(this.phaseTime>=INTRO.walk)for(const p of this.players){const h=this.formations[p.team]?.[p.slot]||FORMATION[p.slot],x=h.x*this.direction(p.team);p.move(x-p.x,h.z-p.z,Math.min(.42,Math.hypot(x-p.x,h.z-p.z)*.6),dt);p.watch({x:0,z:0});}
      if(this.phaseTime>=INTRO.duration)this.skipIntro();return;
    }
    if(this.phase==='goal'){
      if(this.replayActive){
        if(this.replayStage==='celebrate')updateCelebration(this,dt);
        this.updateReplay(dt);if(this.replayActive)return;
      }
      this.ball.integrate(dt);this.players.forEach(p=>p.move(0,0,0,dt));
      this.goalReturnTime=(this.goalReturnTime??1.4)-dt;
      if(this.goalReturnTime<=0){this.resetFormation();this.beginRestart({type:'KICK OFF',team:1-this.scoringTeam,x:0,z:0});}
      return;
    }
    if(this.phase==='restart'){
      const restart=this.restart;
      if(this.humanSeats){
        this.withHuman(restart.team,()=>this.updateRestart(dt,restart.team===0?input:this.remoteInput));
        if(this.phase==='restart'&&restart.type==='PENALTY'){
          const defender=1-restart.team;this.withHuman(defender,()=>this.updatePenaltyKeeper(dt,defender===0?input:this.remoteInput));
        }
      }else if(restart.type==='PENALTY'&&restart.team===1){
        const keeper=this.active(0).find(p=>p.role==='GK');this.controlled=keeper;this.manualKeeper=true;this.keeperReturn=false;
        this.updatePenaltyKeeper(dt,input);this.updateRestart(dt,null);
      }else this.updateRestart(dt,input);
      return;
    }
    if(this.phase!=='playing')return;
    this.elapsed+=dt;
    for(const p of this.players){p.previousX=p.x;p.previousZ=p.z;}
    if(this.ball.owner)this.stats[this.ball.owner.team].possession+=dt;
    if(this.humanSeats){for(let team=0;team<2;team++)this.withHuman(team,()=>this.updateHuman(dt,team===0?input:this.remoteInput));}
    else this.updateHuman(dt,input);
    updateAI(this,dt);if(this.phase!=='playing')return;
    if(this.humanSeats){for(const seat of this.humanSeats)this.autoSteal(seat.controlled);}else this.autoSteal(this.controlled);if(this.phase!=='playing')return;this.separatePlayers();
    const refX=clamp(this.ball.x-this.direction(this.ball.owner?.team??0)*u(5),-FIELD.halfLength+u(4),FIELD.halfLength-u(4));
    const refZ=clamp(this.ball.z+u(5),-FIELD.halfWidth+u(3),FIELD.halfWidth-u(3));
    this.referee.watch(this.ball);this.referee.move(refX-this.referee.x,refZ-this.referee.z,.9,dt,distance(this.referee,this.ball)>u(18));
    const previous={x:this.ball.x,y:this.ball.y,z:this.ball.z};this.ball.update(dt);this.recordReplayFrame();
    const frame=goalFrameContact(this.ball,previous),boundary=boundaryEvent(this.ball,previous,[this.direction(0),this.direction(1)]);
    const limit=Math.min(frame?.t??1,boundary?.time??1);
    const contact=(!this.ball.owner||!boundary)&&this.collisions(dt,previous,limit);
    if(!contact&&frame&&frame.t<=(boundary?.time??1)){this.event('sound',{name:'post',position:{x:frame.x,z:frame.z}});resolveFrameContact(this.ball,frame);}
    else if(!contact&&boundary){if(boundary.type==='GOAL')this.goal(boundary.team);else{if(this.ball.shot){this.ball.shot.player.animate('miss',1.6);this.moment={type:'miss',player:this.ball.shot.player,time:1.5};this.notify('MISS',playerLabel(this.ball.shot.player),1.6);}this.beginRestart(boundary);}return;}
    if(this.half===1&&this.elapsed>=this.settings.duration*30){
      this.elapsed=this.settings.duration*30;this.ball.release();this.setPieceContext=null;this.phase='halftime';this.applySubstitutions();this.autoSubstitute();this.setPhase('halftime');
    }else if(this.half===2&&this.elapsed>=this.settings.duration*60){
      this.elapsed=this.settings.duration*60;this.finishMatch();
      this.players.forEach(p=>p.animate(this.stats[p.team].goals>this.stats[1-p.team].goals?'celebrate-arms':this.stats[p.team].goals<this.stats[1-p.team].goals?'concede':'applaud',4));
    }
  }
  updateHuman(dt,input){
    const touchPass=input?.isTouchHeld?.('pass');
    this.passHeldTime=input?.held.has('pass')&&!touchPass?this.passHeldTime+dt:0;
    const owner=this.ball.owner;
    this.selectPlayer();const move=input?.movement()||{x:0,z:0,intensity:0};
    if(input?.pressed.has('switch'))this.selectPlayer(true);
    if(input?.pressed.has('goalie'))this.toggleGoalkeeper();
    if(input?.pressed.has('pass')){if(owner?.team===this.inputTeam){this.manualKeeper=false;this.keeperReturn=false;this.controlled=owner;}else this.selectPlayer(true);}
    if(touchPass&&!this.manualKeeper&&this.possessionTeam()!==this.inputTeam&&(this.humanSeats?input.holdAutoSwitch!==false:this.settings.holdAutoSwitch!==false)){
      this.holdSwitchTime+=dt;
      if(this.holdSwitchTime>=.22){this.selectPlayer(true);this.holdSwitchTime=0;}
    }else this.holdSwitchTime=0;
    if(this.controlled&&!this.controlled.sentOff){
      if(input?.held.has('pass')&&!touchPass&&owner&&owner.team!==this.inputTeam&&move.intensity<.1){
        const n=normalize(owner.x-this.controlled.x,owner.z-this.controlled.z);this.controlled.move(n.x,n.z,1,dt,input.held.has('sprint'));
      }else if(!owner&&this.ball.pass?.target===this.controlled&&move.intensity<.1){
        const point=(this.ball.y>2||distance(this.ball,this.controlled)>u(7))&&Math.hypot(this.ball.vx,this.ball.vz)>8?this.ball.pass:ballIntercept(this.ball,.35),gap=distance(point,this.controlled);
        this.controlled.move(point.x-this.controlled.x,point.z-this.controlled.z,Math.min(1,gap/2),dt,gap>u(5));
      }else this.controlled.move(move.x,move.z,move.intensity,dt,input?.held.has('sprint'),owner?.team===1-this.inputTeam&&move.intensity<.7&&distance(this.controlled,this.ball)<10?this.ball:null);
      if(owner===this.controlled&&this.ball.controlMode==='hands'){
        const keeper=this.controlled,dir=this.direction(keeper.team),depth=clamp(keeper.x*dir+FIELD.halfLength,.65,FIELD.boxDepth-.65);
        keeper.x=(depth-FIELD.halfLength)*dir;keeper.z=clamp(keeper.z,-FIELD.boxHalf+.65,FIELD.boxHalf-.65);
        if(!keeper.action)keeper.animate('keeper-hold',.7);
      }
      if(input?.pressed.has('pass')){
        if(owner===this.controlled)this.requestPass(this.controlled,move.intensity>.15?move:null);
      }
      if(input?.pressed.has('skill'))this.skill(this.controlled,move);
      this.chargeShot(dt,input,owner===this.controlled&&!this.cancelShotUntilRelease);
      if(this.charge>0)this.aimZ=clamp(move.z*FIELD.goalHalf*1.15+this.controlled.z*.1,-FIELD.goalHalf*1.08,FIELD.goalHalf*1.08);
      if(input?.pressed.has('shoot')&&owner!==this.controlled){
        if(!owner&&this.ball.y<3.1&&distance(this.ball,this.controlled)<2.2){
          const {y,vy}=this.ball,high=y>2;this.claim(this.controlled);this.ball.y=y;this.ball.vy=vy;this.shoot(this.controlled,.55,null,{firstTime:true,header:high});
        }
      }
      if(input?.released.has('shoot')){if(owner===this.controlled&&!this.cancelShotUntilRelease)this.requestShot(this.controlled,Math.max(.15,this.charge),move.intensity>.1?move:null,{curve:this.curveRequested});this.charge=0;this.curveRequested=false;this.cancelShotUntilRelease=false;}
      if(owner!==this.controlled){this.charge=0;this.curveRequested=false;}
    }
  }
  separatePlayers(){
    const active=this.players.filter(p=>!p.sentOff);
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
      const a=active[i],b=active[j],gap=distance(a,b);
      if(gap<.82){
        const n=gap>.001?normalize(b.x-a.x,b.z-a.z):{x:(i+j)%2?1:0,z:(i+j)%2?0:1},push=(.82-gap)*.5;
        a.x=clamp(a.x-n.x*push,-FIELD.halfLength-FIELD.playerMargin,FIELD.halfLength+FIELD.playerMargin);
        a.z=clamp(a.z-n.z*push,-FIELD.halfWidth-FIELD.playerMargin,FIELD.halfWidth+FIELD.playerMargin);
        b.x=clamp(b.x+n.x*push,-FIELD.halfLength-FIELD.playerMargin,FIELD.halfLength+FIELD.playerMargin);
        b.z=clamp(b.z+n.z*push,-FIELD.halfWidth-FIELD.playerMargin,FIELD.halfWidth+FIELD.playerMargin);
        const closing=(a.vx-b.vx)*n.x+(a.vz-b.vz)*n.z;
        if(closing>0){const impulse=closing*.5;a.vx-=n.x*impulse;a.vz-=n.z*impulse;b.vx+=n.x*impulse;b.vz+=n.z*impulse;}
      }
    }
  }
  claim(p,options={}){
    const newTouch=this.ball.owner!==p;
    if(this.setPieceContext&&this.setPieceContext.team!==p.team)this.setPieceContext=null;
    p.receivedFrom=this.ball.pass?.team===p.team?this.ball.pass.from:null;
    if(this.ball.pass?.team===p.team&&this.ball.pass.from!==p)this.stats[p.team].completed++;
    const pressure=this.active(1-p.team).filter(o=>distance(o,p)<4).length;
    this.ball.take(p,{pressure,random:this.random,...options});
    this.ball.lock=Math.max(this.ball.lock,.09);
    if(newTouch)this.event('sound',{name:'first-touch',player:p});
    if(this.humanSeats){const seat=this.humanSeats[p.team];if(!seat.manualKeeper)seat.controlled=p;}else if(p.team===0&&!this.manualKeeper)this.controlled=p;
  }
  onTarget(){if(this.ball.shot&&!this.ball.shot.counted){this.stats[this.ball.shot.team].onTarget++;this.ball.shot.player.onTarget=(this.ball.shot.player.onTarget||0)+1;this.ball.shot.counted=true;}}
  collisions(dt,previous=null,maxTime=1){
    const b=this.ball;if(b.lock>0)return false;
    if(b.owner){
      const p=b.owner;if(b.controlMode==='hands')return false;
      for(const o of this.active(1-p.team)){
        if(o.role==='GK'&&keeperContact(this,o))return true;
        if(distance(o,b)<(p.skill>0?.43:.7)&&o.cooldown<=0&&p.cooldown<=0){this.event('sound',{name:'tackle',player:o});this.claim(o);o.animate('intercept',.45);p.animate('stumble',.4);o.tackles++;o.cooldown=.5;return true;}
      }
      return false;
    }
    const end={x:b.x,y:b.y,z:b.z},start=previous||end,speed=Math.hypot(b.vx,b.vz),candidates=[];
    for(const p of this.players){
      if(p.sentOff||p.cooldown>0)continue;
      const keeper=p.role==='GK'&&p.team!==b.lastTouch?.team&&p.x*this.direction(p.team)<=-FIELD.halfLength+FIELD.boxDepth&&Math.abs(p.z)<=FIELD.boxHalf;
      const add=(kind,radius,height,min=0)=>{const hit=playerContact(p,start,end,radius,height,min,!!previous);if(hit&&hit.t<=maxTime+1e-8)candidates.push({p,kind,hit});};
      if(keeper)add('keeper',p.action?.name==='keeper-dive'?2.45:1.25,3.5);
      else{
        add('feet',1,1.12);
        if(p.role!=='GK'&&((p===this.controlled&&this.passHeldTime>.18)||(p.team===1&&p.x*this.direction(p.team)>FIELD.halfLength-FIELD.boxDepth*1.2)))add('header',1.2,2.85*(p.attributes.headerJump||1),1.15);
        if(b.lastTouch?.team!==p.team&&(b.shot||speed>26))add('block',.72,2.45,1.12);
      }
    }
    candidates.sort((a,b)=>a.hit.t-b.hit.t);
    for(const {p,kind,hit} of candidates){
      if(p.cooldown>0)continue;
      b.x=hit.x;b.y=hit.y;b.z=hit.z;
      if(kind==='keeper'){
        if(keeperContact(this,p))return true;
        Object.assign(b,end);continue;
      }
      if(kind==='block'||kind==='feet'&&speed>26&&b.lastTouch?.team!==p.team){
        this.event('sound',{name:'block',player:p});reflectVelocity(b,hit.normal,.33,.72);b.touch(p);b.spin*=.5;b.lock=.10;p.cooldown=.3;p.tackles++;p.animate('block',.5);return true;
      }
      if(kind==='header'){
        if(p===this.controlled)this.pass(p,null,{firstTime:true,header:true});else this.header(p);
        return true;
      }
      const firstTime=p===this.controlled&&this.passHeldTime>.18&&b.pass?.team===p.team;
      this.claim(p);if(firstTime)this.pass(p,null,{firstTime:true});return true;
    }
    Object.assign(b,end);return false;
  }
  requestPass(p,aim=null,options={}){if(!p.striking)this.pass(p,aim,{...options,windup:true});}
  requestShot(p,power=.5,aim=null,options={}){if(!p.striking)this.shoot(p,power,aim,{...options,windup:true});}
  pass(p,aim=null,{firstTime=false,header=false,windup=false}={}){
    let target=bestPass(this,p,aim);if(header)target=this.active(p.team).filter(o=>o!==p&&o.role!=='GK').sort((a,b)=>distance(p,a)-distance(p,b))[0];if(!target)return;
    const direction=this.direction(p.team),d=distance(p,target);
    const cross=(this.restart?.type==='CORNER'||Math.abs(p.z)>FIELD.halfWidth*.64)&&p.x*direction>u(10)&&Math.abs(target.z)<FIELD.boxHalf;
    const through=target.x*direction>p.x*direction+u(3),lead=through?u(3.2)*p.attributes.passLead:0;
    const anticipation=clamp(d/50,.35,.9);
    const tx=clamp(target.x+target.vx*anticipation+direction*lead,-FIELD.halfLength+1.5,FIELD.halfLength-1.5);
    const tz=clamp(target.z+target.vz*anticipation,-FIELD.halfWidth+1.5,FIELD.halfWidth-1.5);
    const travel=Math.hypot(tx-p.x,tz-p.z),flight=clamp(travel/30,1,2);
    // Compensate drag over the requested distance; crosses land near their receiver.
    const hands=this.ball.controlMode==='hands'&&this.ball.owner===p;
    const speed=cross?clamp(travel*PLAY.airDrag/(1-Math.exp(-PLAY.airDrag*flight)),PLAY.passMin,PLAY.passMax)
      :passSpeed(travel,clamp(5+travel*.07,5,10));
    const aimDirection=normalize(tx-p.x,tz-p.z),backheel=p.faceX*aimDirection.x+p.faceZ*aimDirection.z<-.65&&d<13;
    const distribution=hands?(d<24?'keeper-roll':d<45?'keeper-throw':'keeper-punt'):p.role==='GK'?'goal-kick':null;
    const kind=distribution|| (header?'header-pass':firstTime?'first-pass':backheel?'backheel':cross?'cross':through?'through-pass':d>35?'long-pass':d>18?'firm-pass':'short-pass');
    const leg=contactFoot(p,this.ball)==='right'?1:-1;
    startStrike(this,p,kind,distribution?.85:cross?.75:.64,{side:leg,aim:aimDirection},()=>{
    this.ball.kick(p,tx-p.x,tz-p.z,header?Math.min(speed,28):speed,
      header?1:cross?PLAY.gravity*flight*.5:distribution==='keeper-throw'?4:distribution==='keeper-punt'?7:.45,
      {height:header?1.9:distribution==='keeper-throw'?1.65:distribution==='keeper-punt'?1.1:FIELD.ballRadius+.04,spin:cross?Math.sign(p.z)*.7:0});
    this.event('sound',{name:header?'header':'pass',player:p});
    this.ball.pass={from:p,team:p.team,target,x:tx,z:tz};this.ball.shot=null;
    this.stats[p.team].passes++;p.involvement+=.4;
    if(this.humanSeats){Object.assign(this.humanSeats[p.team],{controlled:target,switchCooldown:1.4,receiverAssist:true});}else if(p.team===0&&!this.manualKeeper){this.controlled=target;this.switchCooldown=1.4;this.receiverAssist=true;}
    if(this.phase==='restart')this.finishRestart();
    },windup);
  }
  chargeShot(dt,input,allowed=true){
    if(!allowed||input?.cancelled?.has('shoot')||(!input?.held.has('shoot')&&!input?.released.has('shoot'))){this.charge=0;this.curveRequested=false;return;}
    if(input.held.has('shoot'))this.charge=clamp(this.charge+dt/1.2,0,1);
    if(input.held.has('curve')||input.pressed.has('curve')||input.released.has('curve'))this.curveRequested=true;
  }
  previewShot(){return shotTechnique(this.controlled,this.ball,{x:this.direction(this.controlled?.team||0)*FIELD.halfLength,z:this.aimZ},{power:this.charge,curve:this.curveRequested});}
  shoot(p,power=.5,aim=null,{firstTime=false,header=false,curve=false,windup=false}={}){
    if(p.role==='GK'&&this.ball.owner===p){this.distributeKeeper(p,power,aim,windup);return;}
    const direction=this.direction(p.team),goalX=direction*FIELD.halfLength,config=this.aiConfig(p.team);
    let targetZ=this.phase==='restart'?this.aimZ:clamp((aim?.z||0)*FIELD.goalHalf*1.15+p.z*.1,-FIELD.goalHalf*1.08,FIELD.goalHalf*1.08);
    if(!this.humanSeats&&p.team===1)targetZ=chooseShotTarget(this,p);
    const shot=planShot(p,this.ball,{x:goalX,z:targetZ},{power,curve,firstTime,header,random:this.random,accuracySpread:this.humanSeats||p.team===0?u(1.5):(1-config.accuracy)*u(12)});
    startStrike(this,p,shot.kind,power>.8?.85:.72,{side:shot.side,aim:shot.direction,power,skied:shot.skied},()=>{
    this.ball.kick(p,shot.direction.x,shot.direction.z,shot.speed,shot.lift,{height:shot.height,spin:shot.spin});
    this.event('sound',{name:'shot',player:p});
    this.ball.shot={player:p,team:p.team,counted:false,setPiece:this.restart?.type||((this.setPieceContext?.team===p.team&&this.elapsed-this.setPieceContext.time<=8)?this.setPieceContext.type:null),kind:shot.kind,foot:shot.foot,skied:shot.skied,power,assist:this.ball.previousTouch?.team===p.team?this.ball.previousTouch:null};this.ball.pass=null;this.stats[p.team].shots++;p.shots=(p.shots||0)+1;
    p.touchFoot=shot.foot;p.involvement++;if(this.phase==='restart')this.finishRestart();
    },windup);
  }
  distributeKeeper(p,power=.6,aim=null,windup=false){
    const dir=this.direction(p.team),target=bestPass(this,p,aim||{x:dir,z:0}),hands=this.ball.controlMode==='hands';
    const x=clamp(p.x+dir*(38+power*35),-FIELD.halfLength+3,FIELD.halfLength-3),z=clamp(aim?.intensity>.1?p.z+aim.z*24:target?.z||0,-FIELD.halfWidth+3,FIELD.halfWidth-3);
    const flight=1.5+power*.7,travel=Math.hypot(x-p.x,z-p.z),speed=clamp(travel*PLAY.airDrag/(1-Math.exp(-PLAY.airDrag*flight)),26,48);
    startStrike(this,p,hands?'keeper-punt':'goal-kick',.85,{side:p.touchFoot==='left'?-1:1,aim:normalize(x-p.x,z-p.z)},()=>{
    this.ball.kick(p,x-p.x,z-p.z,speed,PLAY.gravity*flight*.5,{height:hands?1.1:FIELD.ballRadius+.04});
    this.event('sound',{name:'keeper-kick',player:p});
    this.ball.pass={from:p,team:p.team,target,x,z};this.ball.shot=null;this.stats[p.team].passes++;
    if(this.humanSeats&&target)Object.assign(this.humanSeats[p.team],{controlled:target,manualKeeper:false,receiverAssist:true});
    if(p.team===0&&target&&(!this.manualKeeper||this.controlled===p)){this.manualKeeper=false;this.controlled=target;this.receiverAssist=true;this.switchCooldown=1;}
    if(this.phase==='restart')this.finishRestart();
    },windup);
  }
  header(p){this.shoot(p,.55,null,{firstTime:true,header:true});}
  skill(p,aim=null){if(!p.striking)performSkill(this,p,aim);}
  autoSteal(p){
    if(this.ball.lock>0)return false;
    const b=this.ball,victim=b.owner;
    if(!p||p.sentOff||p.role==='GK'||p.striking||p.cooldown>0||this.paused||this.phase!=='playing'||b.controlMode==='hands')return false;
    if(victim?.team===p.team||b.y>1.2||distance(p,b)>1.55)return false;
    if(p.action&&['fall','roll-fall','get-up','slide-tackle','stumble','recover'].includes(p.action.name))return false;
    if(victim){
      const approach=normalize(p.x-victim.x,p.z-victim.z);
      // Reach for an exposed ball; do not force a dangerous challenge from behind.
      if(distance(p,victim)>2.15||approach.x*victim.faceX+approach.z*victim.faceZ<-.35)return false;
    }else if(Math.hypot(b.vx,b.vz)>22)return false;
    this.tackle(p,{standing:true});p.cooldown=Math.max(p.cooldown,.85);return true;
  }
  tackle(p,{standing=false}={}){
    if(this.ball.lock>0)return;
    if(p.cooldown>0||p.sentOff)return;
    const sliding=!standing&&Math.hypot(p.vx,p.vz)>PLAY.runSpeed*.85;
    p.cooldown=sliding?1.1:.65;p.animate(sliding?'slide-tackle':'standing-tackle',sliding?.55:.45,{side:1});
    const victim=this.ball.owner;
    if(victim&&this.ball.controlMode==='hands')return;
    if(!victim){if(standing&&this.ball.y<1.3&&distance(p,this.ball)<1.65){this.claim(p);p.animate('standing-tackle',.45);p.tackles++;}return;}
    if(victim.team===p.team||distance(p,victim)>(sliding?3.2:2.25))return;
    const toward=normalize(p.x-victim.x,p.z-victim.z),behind=toward.x*victim.faceX+toward.z*victim.faceZ<-.45;
    const late=distance(p,this.ball)>1.95,protectedBall=victim.skill>0;
    const frustration=p.data?.gameplayProfile?.tendencies?.frustration||0,trailing=this.stats[p.team].goals<this.stats[1-p.team].goals;
    const foulChance=(behind?.55:late?.35:protectedBall?.28:.06/p.attributes.defending)*(p.attributes.foulRisk||1)*(trailing?1+frustration:1);
    if(this.random()<foulChance){
      const severity=behind&&Math.hypot(p.vx,p.vz)>PLAY.runSpeed*1.15?'red':behind||late?'yellow':'none';
      this.foul(p,victim,severity);return;
    }
    const strengthEdge=(p.attributes.strength||1)-(victim.attributes?.strength||1);
    if(protectedBall&&this.random()<clamp(.65-strengthEdge*.16,.42,.82))return;
    this.event('sound',{name:'tackle',player:p});
    if(sliding){this.ball.release(p.faceX*7,p.faceZ*7,.4);this.ball.touch(p);victim.animate('stumble',.55,{side:1});}
    else{this.claim(p);p.animate(distance(p,victim)<1.1?'shoulder':'standing-tackle',.5);victim.animate('stumble',.4,{side:-1});}
    p.tackles++;p.cooldown=.5;victim.cooldown=.7;if(this.settings.minorInjuries!==false&&this.random()<.045)this.minorInjury(victim,p);
  }
  minorInjury(player,opponent=null){
    if(!player||player.injured||player.sentOff||this.settings.minorInjuries===false)return;
    player.injured=true;player.injuryTime=3.5;this.stats[player.team].injuries=(this.stats[player.team].injuries||0)+1;
    const event={team:player.team,player:player.name,jersey:player.jersey??null,playerId:player.id,time:this.elapsed};this.injuryEvents.push(event);player.animate('stumble',.8);this.notify('MINOR INJURY',playerLabel(player)+' needs attention',PRESENTATION.injury,{team:player.team,playerName:playerLabel(player)});this.event('injury',{player,opponent,event});
    const bench=(this.benches[player.team]||[]).filter(p=>!this.pending.some(s=>s.incoming.id===p.id&&s.team===player.team));if(!this.humanSeats&&player.team===1&&bench.length&&!this.pending.some(s=>s.out===player)){const role=p=>p.gameplayProfile?.backupGoalkeeper||/goal|keeper/i.test(p.position)||/field\s*\/\s*goalie/i.test(p.position)?'GK':/def/i.test(p.position)?'DEF':/mid/i.test(p.position)?'MID':'FWD';const incoming=bench.find(p=>role(p)===player.role)||bench[0];if(incoming)this.pending.push({out:player,incoming,team:player.team});}
  }
  foul(offender,victim,severity='none'){
    const foulNames=playerLabel(offender)+' · Foul on '+playerLabel(victim);
    this.stats[offender.team].fouls++;
    let title='FOUL';
    if(severity==='yellow'){offender.yellow++;this.stats[offender.team].yellows++;title='YELLOW CARD';}
    if(severity==='red'||offender.yellow>=2){offender.sentOff=true;this.stats[offender.team].reds++;title='RED CARD';}
    if(this.ball.owner===offender)this.ball.release();
    const decisionTime=severity==='none'?PRESENTATION.foul:PRESENTATION.card;
    this.referee.animate('card',decisionTime);
    this.referee.cardColor=title==='RED CARD'?'#f43d38':title==='YELLOW CARD'?'#ffe24b':null;
    this.beginRestart(foulRestart(victim,this.direction(victim.team)));
    victim.animate(severity==='red'?'roll-fall':'fall',.8,{side:Math.sign(victim.z-offender.z)||1});
    this.restart.readyAt=Math.max(this.restart.readyAt,decisionTime);
    offender.animate('card-reaction',decisionTime);this.moment={type:'card',player:this.referee,time:decisionTime-.6};
    this.referee.watch(offender);
    this.notify(title,foulNames,decisionTime,{team:offender.team,playerName:foulNames});
    this.event('card',{player:offender,card:title});
    if(title==='RED CARD'||this.restart.type==='PENALTY'||severity==='yellow'&&this.elapsed>=this.settings.duration*42)queueSideline(this,'foul',offender.team,{after:decisionTime-.7});
    if(offender.sentOff&&this.active(offender.team).length<3){
      this.stats[1-offender.team].goals=Math.max(this.stats[1-offender.team].goals,this.stats[offender.team].goals+3);
      this.notify('MATCH AWARDED','Too few players to continue');this.finishMatch();
    }
  }
  goal(team){
    const last=this.ball.lastTouch,shot=this.ball.shot;
    const replayFrame=this.captureReplayFrame();
    const scorer=shot?.team===team?shot.player:last,assist=shot?.team===team?shot.assist:this.ball.previousTouch;
    this.stats[team].goals++;this.onTarget();
    const origin=shot?.team===team?shot.setPiece:null;if(origin==='PENALTY')this.stats[team].penaltiesScored++;if(origin==='FREE KICK')this.stats[team].freeKickGoals++;if(origin==='CORNER')this.stats[team].cornerGoals++;
    if(scorer?.team===team)scorer.goals++;
    const assistant=assist&&assist!==scorer&&assist.team===team&&scorer?.team===team?assist:null;
    if(assistant)assistant.assists++;
    this.goalEvents.push({team,name:scorer?.name||this.teams[team].name,jersey:scorer?.jersey??null,playerId:scorer?.id,assist:assistant?.name||null,assistJersey:assistant?.jersey??null,assistId:assistant?.id??null,setPiece:origin,ownGoal:scorer?.team!==team,time:this.elapsed});
    this.scoringTeam=team;this.ball.settleInNet(this.direction(team));
    this.celebratingPlayer=scorer?.team===team?scorer:this.active(team).find(p=>p.role==='FWD');
    this.celebrationEnd=null;startCelebration(this);
    this.setPhase('goal');this.startReplay(replayFrame);this.notify('GOAL!',playerLabel(scorer)+' · '+this.teams[team].name,4.5);this.event('goal',this.goalEvents.at(-1));
  }
  beginRestart(data){
    this.setPieceContext=null;this.restart=null;this.phase='restart';this.phaseTime=0;this.applySubstitutions();this.autoSubstitute();if(data.type==='PENALTY')this.stats[data.team].penalties++;
    if(data.type==='CORNER')this.stats[data.team].corners++;
    this.ball.reset(data.x,data.z);
    const direction=this.direction(data.team);
    let eligible=this.active(data.team);
    if(data.type==='GOAL KICK')eligible=eligible.filter(p=>p.role==='GK');
    else eligible=eligible.filter(p=>p.role!=='GK');
    const captain=this.active(data.team).find(p=>p.data.leadershipRole==='captain'&&eligible.includes(p));
    const taker=(['PENALTY','FREE KICK','CORNER'].includes(data.type)&&captain)||[...eligible].sort((a,b)=>distance(a,data)-distance(b,data))[0]||this.active(data.team)[0];
    if(!taker){this.finishMatch();return;}
    this.restart={...data,taker,readyAt:Math.max(restartPresentation(data.type),this.moment?.time||0)};this.aimZ=0;
    if(data.type==='KICK OFF')this.resetFormation();
    for(const p of this.players){
      if(p.sentOff||p===taker)continue;
      if(data.type==='PENALTY'){
        if(p.role==='GK'){p.x=-this.direction(p.team)*(FIELD.halfLength-.7);p.z=0;p.keeperState.penaltyDive=null;if(p.action?.name==='keeper-dive')p.action=null;}
        else{p.x=direction*(FIELD.halfLength-FIELD.boxDepth-u(2+p.slot%3*2));p.z=(p.slot%2?1:-1)*u(6+p.slot);}
      }else if(data.type==='CORNER'){
        if(p.role==='GK'){p.reset(this.direction(p.team));}
        else if(p.team===data.team&&p.role==='DEF'){p.x=direction*u(7);p.z=(p.slot%2?1:-1)*u(10);}
        else{p.x=direction*(FIELD.halfLength-u(5+(p.slot%3)*3+(p.team===data.team?0:1)));p.z=(p.slot%2?1:-1)*u(2+p.slot);}
      }else if(data.type==='KICK OFF'){
        if(p.team!==data.team&&distance(p,data)<FIELD.restartClearance)p.x=-this.direction(p.team)*FIELD.restartClearance;
      }else if(p.team!==data.team&&distance(p,data)<FIELD.restartClearance){
        let n=normalize(p.x-data.x||-direction,p.z-data.z||1);
        p.x=clamp(data.x+n.x*FIELD.restartClearance,-FIELD.halfLength+.8,FIELD.halfLength-.8);
        p.z=clamp(data.z+n.z*FIELD.restartClearance,-FIELD.halfWidth+.8,FIELD.halfWidth-.8);
        if(distance(p,data)<FIELD.restartClearance-.1){
          n=normalize(-data.x||-direction,-data.z||1);p.x=data.x+n.x*FIELD.restartClearance;p.z=data.z+n.z*FIELD.restartClearance;
        }
      }
      p.vx=p.vz=0;
    }
    taker.x=data.x-direction*.9;taker.z=data.z;taker.faceX=direction;taker.faceZ=0;taker.vx=taker.vz=0;
    this.ball.x=data.x;this.ball.z=data.z;this.ball.y=FIELD.ballRadius;
    this.ball.owner=taker;taker.hasBall=true;this.ball.lastTouch=taker;taker.holdTime=0;
    if(this.humanSeats){this.humanSeats[data.team].controlled=taker;this.humanSeats[data.team].aimZ=0;}else if(data.team===0)this.controlled=taker;
    this.setPhase('restart');this.notify(data.type,this.teams[data.team].name,this.restart.readyAt,{team:data.team});this.callTimeoutAtStoppage(data);
  }
  updateRestart(dt,input){
    const r=this.restart;if(!r)return;
    if(this.pendingStrike){r.taker.move(0,0,0,dt);return;}
    if(this.phaseTime<r.readyAt){this.charge=0;this.curveRequested=false;return;}
    const move=input?.movement()||{x:0,z:0,intensity:0};
    if(this.humanSeats||r.team===0){
      this.aimZ=clamp(this.aimZ+(move.z||move.x)*dt*FIELD.goalHalf*.9,-FIELD.goalHalf*1.08,FIELD.goalHalf*1.08);
      this.chargeShot(dt,input);
      if(this.phaseTime>.7){
        if(input?.pressed.has('pass')){this.requestPass(r.taker,move.intensity>.1?move:null);return;}
        if(input?.released.has('shoot')){this.requestShot(r.taker,Math.max(.15,this.charge),null,{curve:this.curveRequested});this.charge=0;this.curveRequested=false;return;}
      }
    }
    const automatic=r.readyAt+(!this.humanSeats&&r.team===1?2.4:({'KICK OFF':4,'THROW-IN':6,'GOAL KICK':8,'CORNER':12,'FREE KICK':14,'PENALTY':16}[r.type]||10));
    if(this.phaseTime>automatic){
      if(r.type==='PENALTY'||(r.type==='FREE KICK'&&FIELD.halfLength-r.x*this.direction(r.team)<PLAY.shootingRange))this.requestShot(r.taker,.65);
      else this.requestPass(r.taker);
    }
  }
  updatePenaltyKeeper(dt,input){
    if(this.phase!=='restart'||this.restart?.type!=='PENALTY')return;
    const team=this.inputTeam,keeper=this.active(team).find(p=>p.role==='GK');if(!keeper)return;
    this.controlled=keeper;this.manualKeeper=true;this.keeperReturn=false;keeper.watch(this.ball);
    const move=input?.movement?.()||{x:0,z:0,intensity:0},own=-this.direction(team)*FIELD.halfLength;
    keeper.move(move.x,move.z,move.intensity,dt,!!input?.held?.has('sprint'),{x:this.ball.x,z:this.ball.z});
    const depth=clamp((keeper.x-own)*this.direction(team),.1,1.7);keeper.x=own+this.direction(team)*depth;
    keeper.z=clamp(keeper.z,-FIELD.goalHalf*1.28,FIELD.goalHalf*1.28);
    if(input?.pressed?.has('shoot')){
      const side=Math.abs(move.z)>.18?Math.sign(move.z):0,height=clamp(move.x,-1,1);
      keeper.keeperState.penaltyDive={side,height,at:this.phaseTime};
      keeper.z=clamp(keeper.z+side*1.05,-FIELD.goalHalf*1.28,FIELD.goalHalf*1.28);
      keeper.animate('keeper-dive',.82,{penalty:true,side,high:height>.45,low:height<-.45,oneHand:side!==0});
    }
  }
  finishRestart(){
    const r=this.restart;
    this.setPieceContext=r?.type==='CORNER'?{type:r.type,team:r.team,time:this.elapsed}:null;
    if(r?.type==='THROW-IN'){this.ball.y=2;this.ball.vy=3;r.taker.animate('keeper-throw',.6);}
    this.restart=null;this.setPhase('playing');
    if(!this.humanSeats&&r?.type==='KICK OFF'&&r.team===1)this.kickoffAttack={armed:this.random()<this.aiConfig(1).kickoffShot,used:false,until:this.elapsed+12};
  }
  queueSubstitution(outId,inId,team=0){
    if(![0,1].includes(team)||!['playing','restart','halftime','goal'].includes(this.phase))throw Error('Substitutions are not available now.');
    const out=this.active(team).find(p=>p.id===outId),incoming=this.benches[team].find(p=>p.id===inId);
    if(!out||!incoming)throw Error('Select one active player and one available substitute.');
    if(this.pending.some(s=>s.out===out||s.team===team&&s.incoming.id===inId))throw Error('That player is already part of a pending substitution.');
    this.pending.push({out,incoming,team});
    if(this.phase==='halftime'||this.phase==='restart')this.applySubstitutions();
    else this.notify('SUBSTITUTION QUEUED','At the next stoppage',4.5,{team,playerName:playerLabel(out)+' → '+playerLabel(incoming)});
  }
  applySubstitutions(){
    if(!['halftime','restart'].includes(this.phase))return;
    for(const sub of this.pending){
      const {out,incoming,team}=sub;if(out.sentOff||out.team!==team||!this.active(team).includes(out)||!this.benches[team].some(p=>p.id===incoming.id))continue;
      if(this.pendingStrike?.p===out){out.striking=false;this.pendingStrike=null;this.charge=0;this.curveRequested=false;}
      this.archive.push({...out});this.used[team].push(out.data);
      const saved={x:out.x,z:out.z,slot:out.slot,team:out.team,role:out.role},incomingData={...incoming};if(out.data.leadershipRole==='captain')incomingData.leadershipRole='captain';
      const next=new Player(incomingData,team,out.slot,this.direction(team),this.formations[team]);Object.assign(out,next,saved);out.hasBall=this.ball.owner===out;
      this.benches[team]=this.benches[team].filter(p=>p.id!==incoming.id);
      this.stats[team].substitutions++;const event={team,out:this.archive.at(-1).name,outJersey:this.archive.at(-1).jersey??null,in:incoming.name,inJersey:incoming.jersey??null,time:this.elapsed};this.subEvents.push(event);
      const previous=this.archive.at(-1);
      queueSideline(this,'substitution',team,{
        outPlayer:{id:previous.id,name:previous.name,jersey:previous.jersey,role:previous.role},
        inPlayer:{id:incoming.id,name:incoming.name,jersey:incoming.jersey,role:out.role}
      });
      this.event('substitution',{player:out,...event});
      this.notify('SUBSTITUTION',playerLabel(out)+' OFF · '+playerLabel(incoming)+' ON',4.5,{team,playerName:playerLabel(out)+' → '+playerLabel(incoming),compact:true});
      out.animate('wave',3.5);this.moment={type:'substitution',player:out,time:PRESENTATION.substitution};
      if(this.phase==='restart'&&this.restart)this.restart.readyAt=Math.max(this.restart.readyAt,this.phaseTime+PRESENTATION.substitution);
    }this.pending=[];
  }
  autoSubstitute(){
    if(this.humanSeats||!['halftime','restart'].includes(this.phase))return;
    if(this.stats[1].substitutions>=3||!this.benches[1].length)return;
    // Rotate at spaced second-half stoppages, prioritizing cautioned players.
    const threshold=this.settings.duration*60*(.5+this.stats[1].substitutions*.16);
    if(this.elapsed<threshold)return;
    const out=this.active(1).filter(p=>p.role!=='GK'&&!this.used[1].some(q=>q.id===p.id))
      .sort((a,b)=>b.yellow-a.yellow||a.involvement-b.involvement)[0];
    if(!out)return;
    const options=this.benches[1].filter(p=>!/goal|keeper/i.test(p.position));
    const role=p=>/def/i.test(p.position)?'DEF':/mid/i.test(p.position)?'MID':'FWD';
    const incoming=options.find(p=>role(p)===out.role)||options[0];if(!incoming)return;
    this.pending.push({out,incoming,team:1});this.applySubstitutions();
  }
}
