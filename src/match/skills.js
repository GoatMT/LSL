import { FIELD,clamp,distance,normalize } from '../config.js';
export const SKILLS=['body-feint','step-over','double-step','ball-roll','fake-shot','drag-back','roulette','quick-cut','directional-touch','stop-go','heel-to-heel','close-control'];
export function performSkill(match,p,aim=null){
  if(p.cooldown>0||p.sentOff||match.ball.controlMode==='hands')return;
  if(match.ball.owner!==p){p.animate('jockey',.4);return;}
  const defenders=match.active(1-p.team).sort((a,b)=>distance(a,p)-distance(b,p)),nearest=defenders[0];
  const gap=nearest?distance(nearest,p):99,speed=Math.hypot(p.vx,p.vz),rating=p.attributes.dribble;
  const desired=aim&&aim.intensity>.1?normalize(aim.x,aim.z):{x:p.faceX,z:p.faceZ};
  const dot=desired.x*p.faceX+desired.z*p.faceZ,cross=desired.x*p.faceZ-desired.z*p.faceX;
  let options=match.charge>.1?['fake-shot']:dot<-.35?['drag-back','roulette']:Math.abs(cross)>.55?['quick-cut','ball-roll','directional-touch']:
    speed>7?['heel-to-heel','stop-go','directional-touch']:gap<3?['body-feint','step-over','double-step','roulette','close-control']:['step-over','ball-roll','close-control','stop-go'];
  options=options.filter(k=>k==='fake-shot'||k!==p.lastSkill);if(!options.length)options=['body-feint'];
  const kind=options[Math.floor(match.random()*options.length)],complex=['roulette','double-step','heel-to-heel'].includes(kind);
  const side=Math.sign(cross)|| (nearest?Math.sign((p.x-nearest.x)*p.faceZ-(p.z-nearest.z)*p.faceX):1)||1;
  let n=desired;
  if(['ball-roll','step-over','double-step','body-feint'].includes(kind))n=normalize(p.faceX*.4+p.faceZ*side,p.faceZ*.4-p.faceX*side);
  if(kind==='drag-back')n={x:-p.faceX,z:-p.faceZ};
  const burst=['heel-to-heel','directional-touch','quick-cut'].includes(kind)?2.6:kind==='stop-go'?-1.2:.65;
  const duration=kind==='roulette'?.7:.55;
  p.skillPlan={kind,x:n.x,z:n.z,burst,time:duration,duration};p.lastSkill=kind;p.skill=.55;p.cooldown=1.15;
  p.animate(kind,duration,{side,aim:desired});match.charge=0;match.cancelShotUntilRelease=kind==='fake-shot';
  const failure=(complex?.09:.02)+(1-rating)*(complex?.4:.13)+(gap<2?.06:0);
  if(match.random()<failure){
    match.ball.release(p.vx+n.x*(4+(1-rating)*5),p.vz+n.z*(4+(1-rating)*5),.25);p.skill=.05;p.animate('stumble',.4,{side});
  }else{
    match.ball.touchClock=0;
    match.ball.vx=p.vx+n.x*.6;match.ball.vz=p.vz+n.z*.6;
  }
  p.x=clamp(p.x,-FIELD.halfLength+.4,FIELD.halfLength-.4);p.z=clamp(p.z,-FIELD.halfWidth+.4,FIELD.halfWidth-.4);
}
