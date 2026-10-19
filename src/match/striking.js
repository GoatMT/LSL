import { clamp } from '../config.js';
export function startStrike(match,p,kind,duration,context,contact,windup){
  if(p.striking)return false;
  const turn=context.aim?Math.acos(clamp(p.faceX*context.aim.x+p.faceZ*context.aim.z,-1,1)):0;
  const delay=(kind.includes('shot')||kind==='keeper-punt'?.18:.12)+turn*.045;
  p.animate(kind,duration,{...context,contactAt:delay/duration});
  if(windup&&match.ball.owner===p){
    p.striking=true;match.pendingStrike={p,kind,remaining:delay,contact};
  }else{p.action.time=delay;contact();}
  return true;
}
export function advanceStrike(match,dt){
  const strike=match.pendingStrike;if(!strike)return;
  if(match.ball.owner!==strike.p||strike.p.sentOff||!['playing','restart'].includes(match.phase)){
    strike.p.striking=false;match.pendingStrike=null;
    if(strike.p.action?.name===strike.kind)strike.p.action=null;
    return;
  }
  strike.remaining-=dt;
  if(strike.remaining<=0){match.pendingStrike=null;strike.p.striking=false;strike.contact();}
}
