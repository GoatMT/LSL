import { FIELD,clamp } from '../config.js';
import { capsuleContact } from './contacts.js';
import { reflectVelocity } from './physics.js';
// Small-sided arcade rules deliberately have no offside state or offside checks.
export function boundaryEvent(ball,previous,teamsDirection){
  const L=FIELD.halfLength,W=FIELD.halfWidth,R=FIELD.ballRadius;
  const crossings=[];
  if(Math.abs(ball.x)>L+R&&Math.abs(previous.x)<=L+R){
    const side=Math.sign(ball.x),t=(side*(L+R)-previous.x)/(ball.x-previous.x);
    crossings.push({axis:'x',side,t,z:previous.z+(ball.z-previous.z)*t,y:previous.y+(ball.y-previous.y)*t});
  }
  if(Math.abs(ball.z)>W+R&&Math.abs(previous.z)<=W+R){
    const side=Math.sign(ball.z),t=(side*(W+R)-previous.z)/(ball.z-previous.z);
    crossings.push({axis:'z',side,t,x:previous.x+(ball.x-previous.x)*t});
  }
  crossings.sort((a,b)=>a.t-b.t);const crossing=crossings[0];if(!crossing)return null;
  const last=ball.lastTouch?.team??0;
  if(crossing.axis==='z')return {type:'THROW-IN',time:crossing.t,team:1-last,x:clamp(crossing.x,-L+.6,L-.6),z:crossing.side*(W-.2)};
  const attacking=teamsDirection.findIndex(d=>d===crossing.side),defending=1-attacking;
  if(Math.abs(crossing.z)<FIELD.goalHalf-R&&crossing.y<FIELD.goalHeight-R)
    return {type:'GOAL',time:crossing.t,team:attacking,side:crossing.side};
  return last===defending
    ?{type:'CORNER',time:crossing.t,team:attacking,x:crossing.side*(L-.3),z:Math.sign(crossing.z||1)*(W-.3)}
    :{type:'GOAL KICK',time:crossing.t,team:defending,x:crossing.side*(L-FIELD.goalBoxDepth),z:0};
}
export function goalFrameContact(ball,previous){
  if(ball.owner)return null;
  const reach=FIELD.ballRadius+FIELD.postRadius;let first=null;
  for(const side of [-1,1]){
    const x=side*FIELD.halfLength;
    if(Math.min(previous.x,ball.x)>x+reach||Math.max(previous.x,ball.x)<x-reach)continue;
    const left={x,y:FIELD.goalHeight,z:-FIELD.goalHalf},right={x,y:FIELD.goalHeight,z:FIELD.goalHalf};
    const segments=[[{x,y:0,z:-FIELD.goalHalf},left],[{x,y:0,z:FIELD.goalHalf},right],[left,right]];
    for(const [a,b] of segments){const hit=capsuleContact(previous,ball,a,b,reach);if(hit&&(!first||hit.t<first.t))first=hit;}
  }
  return first;
}
export function resolveFrameContact(ball,hit){
  ball.x=hit.x;ball.y=Math.max(FIELD.ballRadius,hit.y);ball.z=hit.z;
  reflectVelocity(ball,hit.normal,.72,.97);ball.spin*=.65;
}
export function goalFrameCollision(ball,previous){
  const hit=goalFrameContact(ball,previous);if(!hit)return false;
  resolveFrameContact(ball,hit);return true;
}
export function foulRestart(victim,direction){
  const inBox=victim.x*direction>FIELD.halfLength-FIELD.boxDepth&&Math.abs(victim.z)<FIELD.boxHalf;
  return {type:inBox?'PENALTY':'FREE KICK',team:victim.team,
    x:inBox?direction*(FIELD.halfLength-FIELD.penaltyDistance):clamp(victim.x,-FIELD.halfLength+.5,FIELD.halfLength-.5),
    z:inBox?0:clamp(victim.z,-FIELD.halfWidth+.5,FIELD.halfWidth-.5)};
}
