import { FIELD,PLAY,clamp,normalize } from '../config.js';

export const SHOT_NAMES={'finesse-shot':'FINESSE','trivela-shot':'TRIVELA','power-shot':'POWER SHOT','driven-shot':'CONTROLLED','shot':'BALANCED','header':'HEADER','volley':'VOLLEY','half-volley':'HALF VOLLEY','first-shot':'FIRST TIME'};
export function preferredFoot(data){
  const value=String(data.dominantFoot||data.preferredFoot||data.foot||'').toLowerCase();
  if(['left','l','right','r','both'].includes(value))return {foot:value==='l'?'left':value==='r'?'right':value,source:'roster'};
  // LSL currently supplies no foot preference. This is an explicit gameplay default, not a player fact.
  return {foot:'right',source:'game-default'};
}
export function contactFoot(p,ball){
  const lateral=(ball.x-p.x)*p.faceZ-(ball.z-p.z)*p.faceX;
  return Math.abs(lateral)>.12?(lateral>0?'right':'left'):p.touchFoot||(p.dominantFoot==='left'?'left':'right');
}
export function shotTechnique(p,ball,target,{power=.5,curve=false,header=false,firstTime=false}={}){
  const foot=contactFoot(p,ball),side=foot==='right'?1:-1,goal=normalize(target.x-p.x,target.z-p.z);
  const alignment=p.faceX*goal.x+p.faceZ*goal.z,turn=p.faceX*goal.z-p.faceZ*goal.x;
  const weak=p.dominantFoot!=='both'&&foot!==p.dominantFoot;
  const lateral=(ball.x-p.x)*p.faceZ-(ball.z-p.z)*p.faceX;
  // A closed body and ball outside the striking foot favor an outside-foot strike.
  const outside=alignment>-.35&&(turn*side<(weak?-.30:-.10)||(alignment<.6&&turn*side<0)||(Math.abs(lateral)>.45&&turn*side<-.03));
  const kind=header?'header':firstTime&&ball.y>1.1?'volley':firstTime&&ball.y>.5&&ball.vy>0?'half-volley':
    curve?(outside?'trivela-shot':'finesse-shot'):firstTime?'first-shot':power>.78?'power-shot':power<.4?'driven-shot':'shot';
  return {kind,foot,side,weak,alignment,spin:kind==='finesse-shot'?side*12:kind==='trivela-shot'?-side*16:0};
}
export function flightDuration(distance,speed){
  return -Math.log(Math.max(.08,1-PLAY.airDrag*distance/speed))/PLAY.airDrag;
}
export function planShot(p,ball,target,{power=.5,curve=false,header=false,firstTime=false,accuracySpread=3,random=Math.random}={}){
  power=clamp(power,0,1);
  const technique=shotTechnique(p,ball,target,{power,curve,header,firstTime});
  const dx=target.x-p.x,dz=target.z-p.z,close=Math.abs(dx)<16;
  const poorAngle=clamp(Math.abs(dz)/Math.max(4,Math.abs(dx)),0,1),closed=clamp(1-technique.alignment,0,1);
  const sprint=p.boosting||Math.hypot(p.vx,p.vz)>PLAY.runSpeed*1.12?1:0,overcharge=clamp((power-.78)/.205,0,1),max=power>=.985;
  const skyRisk=header?0:max?clamp(.60+.20*sprint+.18*poorAngle+.10*closed+(technique.weak?.06:0),0,.98):
    overcharge*(.025+.075*sprint+.06*poorAngle+.04*closed);
  const skied=random()<skyRisk;
  const placement=technique.spin?.55:1;
  const error=(random()-.5)*accuracySpread*(p.attributes?.shotError??1)*placement*(.45+power*.65+overcharge*(2+sprint+poorAngle));
  const aimed={x:target.x,z:target.z+error},n=normalize(aimed.x-p.x,aimed.z-p.z);
  const speed=(header?25+power*8:((close?PLAY.shotBase-5:PLAY.shotBase)+power*PLAY.shotPower)*(p.attributes?.shotPower??1))*(technique.kind==='finesse-shot'?.84:technique.kind==='trivela-shot'?.90:1);
  const height=header?1.95:firstTime?Math.min(ball.y,2.2):FIELD.ballRadius+.04;
  const travel=Math.max(.7,Math.hypot(dx,aimed.z-p.z)-.8),duration=flightDuration(travel,speed);
  let lift=header?1:technique.kind==='driven-shot'?.7:(close?1.7:2.5)+power*2;
  if(technique.spin)lift=clamp((1.2+power*.9-height+.5*PLAY.gravity*duration*duration)/duration,2,20);
  if(skied)lift=(FIELD.goalHeight+2+random()*3-height+.5*PLAY.gravity*duration*duration)/duration;
  // Launch away from the destination; accumulated lateral spin brings the arc back toward it.
  const launchAngle=-technique.spin*.018*duration*.46,cos=Math.cos(launchAngle),sin=Math.sin(launchAngle);
  return {...technique,power,max,skyRisk,skied,speed,lift,height,target:aimed,
    direction:{x:n.x*cos-n.z*sin,z:n.x*sin+n.z*cos}};
}
