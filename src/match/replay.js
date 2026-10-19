import {clamp} from '../config.js';
import {PRESENTATION} from '../presentation.js';
import {updateCelebration} from './celebrations.js';
import {queueSideline} from './sideline.js';

export function resetReplay(match){
  match.replayBuffer=[];match.replayFrames=[];match.replayActive=false;match.replayFocus=null;
  match.replayStage='celebrate';match.replayStageTime=0;match.replayPlayback=0;
}

export function captureReplayFrame(match){
  return {time:match.elapsed,ball:{x:match.ball.x,y:match.ball.y,z:match.ball.z,vx:match.ball.vx,vy:match.ball.vy,vz:match.ball.vz,rotationY:match.ball.rotationY,rollX:match.ball.rollX,rollZ:match.ball.rollZ},players:match.players.map(p=>({x:p.x,z:p.z,vx:p.vx,vz:p.vz,faceX:p.faceX,faceZ:p.faceZ}))};
}

export function recordReplayFrame(match){
  if(match.phase!=='playing')return;
  match.replayBuffer.push(captureReplayFrame(match));
  while(match.replayBuffer.length>2&&match.replayBuffer[0].time<match.elapsed-4.5)match.replayBuffer.shift();
}

export function startReplay(match,finalFrame){
  let frames=[...match.replayBuffer,finalFrame].filter((frame,index,array)=>index===0||frame.time>=array[index-1].time);
  if(frames.length<2){
    const rewind=.9;
    frames=[{time:finalFrame.time-rewind,ball:{...finalFrame.ball,x:finalFrame.ball.x-finalFrame.ball.vx*rewind,y:Math.max(0,finalFrame.ball.y-finalFrame.ball.vy*rewind),z:finalFrame.ball.z-finalFrame.ball.vz*rewind},players:finalFrame.players.map(p=>({...p,x:p.x-p.vx*rewind,z:p.z-p.vz*rewind}))},finalFrame];
  }
  const end=frames.at(-1).time,start=Math.max(frames[0].time,end-4.5);
  match.replayFrames=frames.filter(frame=>frame.time>=start);match.replayClock=0;match.replayStage='celebrate';match.replayStageTime=0;
  match.replayPlayback=Math.max(2.4,Math.min(PRESENTATION.replay,match.replayFrames.at(-1).time-match.replayFrames[0].time||2.4));
  match.replayActive=true;match.replayFocus={x:finalFrame.ball.x,z:finalFrame.ball.z};
}

export function applyReplayFrame(match,frame,next,blend){
  const b=frame.ball,n=next?.ball||b;match.ball.owner=null;match.ball.controlMode='feet';
  for(const p of match.players)p.hasBall=false;
  match.ball.x=b.x+(n.x-b.x)*blend;match.ball.y=b.y+(n.y-b.y)*blend;match.ball.z=b.z+(n.z-b.z)*blend;
  match.ball.vx=b.vx+(n.vx-b.vx)*blend;match.ball.vy=b.vy+(n.vy-b.vy)*blend;match.ball.vz=b.vz+(n.vz-b.vz)*blend;
  match.ball.rotationY=b.rotationY+(n.rotationY-b.rotationY)*blend;match.ball.rollX=b.rollX+(n.rollX-b.rollX)*blend;match.ball.rollZ=b.rollZ+(n.rollZ-b.rollZ)*blend;
  match.replayFocus={x:match.ball.x,z:match.ball.z};
  match.players.forEach((p,index)=>{
    const a=frame.players[index],q=next?.players[index]||a;
    p.x=a.x+(q.x-a.x)*blend;p.z=a.z+(q.z-a.z)*blend;p.vx=a.vx+(q.vx-a.vx)*blend;p.vz=a.vz+(q.vz-a.vz)*blend;
    p.faceX=a.faceX+(q.faceX-a.faceX)*blend;p.faceZ=a.faceZ+(q.faceZ-a.faceZ)*blend;p.action=null;
    p.animation=Math.hypot(p.vx,p.vz)>.2?'run':'idle';p.locomotion=Math.hypot(p.vx,p.vz)>.2?'run':'idle';
  });
}

export function updateReplay(match,dt){
  if(match.replayStage==='celebrate')updateCelebration(match,dt);
  if(!match.replayFrames.length){finishReplay(match);return;}
  let remaining=Math.max(0,dt);
  while(remaining>0&&match.replayActive){
    if(match.replayStage==='celebrate'){
      const left=Math.max(0,(match.celebration?.duration||PRESENTATION.replayLead)-match.replayStageTime);
      if(remaining<left){match.replayStageTime+=remaining;return;}
      remaining-=left;match.celebrationEnd=captureReplayFrame(match);match.replayStage='transition';match.replayStageTime=0;continue;
    }
    if(match.replayStage==='transition'){
      const left=Math.max(0,PRESENTATION.replayTransition-match.replayStageTime);
      if(remaining<left){match.replayStageTime+=remaining;return;}
      remaining-=left;match.replayStage='playback';match.replayStageTime=0;continue;
    }
    const step=Math.min(remaining,Math.max(0,match.replayPlayback-match.replayClock));match.replayClock+=step;remaining-=step;
    const ratio=clamp(match.replayClock/match.replayPlayback,0,1),time=match.replayFrames[0].time+(match.replayFrames.at(-1).time-match.replayFrames[0].time)*ratio;
    let index=0;while(index<match.replayFrames.length-2&&match.replayFrames[index+1].time<time)index++;
    const frame=match.replayFrames[index],next=match.replayFrames[index+1]||frame,blend=clamp((time-frame.time)/Math.max(.001,next.time-frame.time),0,1);
    applyReplayFrame(match,frame,next,blend);if(match.replayClock>=match.replayPlayback)finishReplay(match);
  }
}

export function finishReplay(match){
  if(!match.replayActive)return;
  if(match.celebrationEnd)applyReplayFrame(match,match.celebrationEnd,null,0);
  match.replayActive=false;match.replayStage='done';match.replayStageTime=0;match.replayFocus=null;match.goalReturnTime=1.4;
  match.ball.settleInNet(match.direction(match.scoringTeam));
  match.active(match.scoringTeam).forEach(p=>p.animate(p===match.celebratingPlayer?'celebrate-calm':'applaud',1.4));
  const event=match.goalEvents.at(-1);
  queueSideline(match,'goal-reaction',1-match.scoringTeam,{scoringTeam:match.scoringTeam,scorerName:event?.name,scorerJersey:event?.jersey});
}

export function applyReplayCamera(match,camera){
  const b=match.ball,lead=match.celebratingPlayer||b,orbit=Math.sin(match.phaseTime*.32)*2;
  camera.replayCelebrationPosition.set(lead.x-Math.sign(b.x)*(match.celebration?.big?13:10)+orbit,match.celebration?.big?6.7:5.4,lead.z+(match.celebration?.big?16:13));
  camera.replayCelebrationTarget.set(lead.x,2.0,lead.z);
  if(match.replayActive&&match.replayFocus&&match.replayStage!=='celebrate'){
    const focus=match.replayFocus,side=Math.sign(match.direction(match.scoringTeam)||1),progress=match.replayStage==='transition'?clamp(match.replayStageTime/Math.max(.001,PRESENTATION.replayTransition),0,1):1,ease=progress*progress*(3-2*progress);
    camera.replayPosition.set(focus.x-side*12,7.2,focus.z+10);camera.replayTarget.set(focus.x,1.1,focus.z);
    camera.position.copy(camera.replayCelebrationPosition).lerp(camera.replayPosition,ease);camera.target.copy(camera.replayCelebrationTarget).lerp(camera.replayTarget,ease);
    return 43+(48-43)*ease;
  }
  camera.position.copy(camera.replayCelebrationPosition);camera.target.copy(camera.replayCelebrationTarget);return 43;
}
