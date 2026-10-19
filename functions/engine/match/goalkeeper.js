import { FIELD,clamp,distance } from '../config.js';
import { predictBall } from './physics.js';
import { playerLabel } from '../player-label.js';

export function saveContext(keeper,ball){
  const lateral=(ball.x-keeper.x)*keeper.faceZ-(ball.z-keeper.z)*keeper.faceX;
  return {side:Math.sign(lateral)||1,height:ball.y,reach:Math.min(2.3,Math.abs(lateral)),ball:{x:ball.x,y:ball.y,z:ball.z}};
}
export function updateKeeper(match,p,dt){
  const b=match.ball,d=match.direction(p.team),own=-d*FIELD.halfLength,state=p.keeperState,config=match.aiConfig(p.team);
  p.watch(b);
  if(b.owner===p&&p===match.controlled)return;
  if(b.owner===p&&b.controlMode==='hands'){
    const goalDepth=(p.x-own)*d,targetX=own+d*clamp(goalDepth,2,FIELD.boxDepth*.55);
    p.move(targetX-p.x,-p.z*.2,.35,dt,false,{x:p.x+d*20,z:0});
    if(!p.action||p.action.name==='keeper-get-up')p.animate('keeper-hold',.6);
    if(p.holdTime>2.1&&p.action?.name!=='keeper-dive')match.requestPass(p);
    return;
  }
  if(b.owner===p){p.move(0,0,0,dt,false,{x:p.x+d*20,z:0});if(p.holdTime>.9)match.requestPass(p);return;}
  const depth=(b.x-own)*d,attacker=b.owner&&b.owner.team!==p.team?b.owner:null;
  const cover=match.active(p.team).filter(o=>o!==p).some(o=>distance(o,b)<distance(p,b)-2);
  const rush=attacker&&depth<FIELD.boxDepth*1.1&&Math.abs(b.z)<FIELD.boxHalf*.8&&!cover;
  const forward=rush?clamp(depth*.5,3.2,11):attacker?clamp(8-depth*.07,3.0,7):clamp(2.3+(45-depth)*.06,2.3,5.4);
  let tx=own+d*forward,tz=clamp(b.z*(forward/Math.max(depth,forward+1)+.10),-FIELD.goalHalf+.65,FIELD.goalHalf-.65),sprint=!!rush;
  const incoming=!b.owner&&b.vx*d<-.5&&b.lastTouch?.team!==p.team;
  if(incoming){
    if(state.flight!==b.flightId){state.flight=b.flightId;state.reaction=config.reaction*(.18+(1-p.attributes.dribble)*.05);state.dived=false;}
    state.reaction=Math.max(0,(state.reaction||0)-dt);
    let time=(tx-b.x)/b.vx,point;
    if(time>0&&time<2){
      for(let i=0;i<2;i++){point=predictBall(b,time);if(Math.abs(point.vx)<.5)break;time=clamp(time+(tx-point.x)/point.vx,.001,3);}
    }
    if(time>0&&time<2&&state.reaction<=0){
      const {z,y}=predictBall(b,time);
      tz=clamp(z,-FIELD.goalHalf+.3,FIELD.goalHalf-.3);sprint=time<1;
      if(!state.dived&&time<config.diveLead&&Math.abs(z-p.z)>1&&Math.abs(z)<FIELD.goalHalf+1&&y<3.6&&p.cooldown<=0){
        const context=saveContext(p,{x:tx,z,y});state.dived=true;
        p.animate('keeper-dive',.6,{...context,high:y>1.7,oneHand:Math.abs(z-p.z)>2});
        // The dive moves the goalkeeper toward the predicted ball, with a finite reach.
        p.vz=clamp((z-p.z)/Math.max(time,.22),-10.5,10.5);p.vx=d*.8;
      }
    }
  }
  if(!b.owner&&depth>0&&depth<FIELD.boxDepth*.95&&Math.abs(b.z)<FIELD.boxHalf*.9&&Math.hypot(b.vx,b.vz)<16&&!cover){
    const rival=match.active(1-p.team).some(o=>distance(o,b)+2<distance(p,b));
    if(!rival){tx=b.x;tz=b.z;sprint=distance(p,b)>4;}
  }
  if(p.action?.name==='keeper-dive'){
    p.x=clamp(p.x+p.vx*dt,own<0?own+.3:own-FIELD.boxDepth,own<0?own+FIELD.boxDepth:own-.3);
    p.z=clamp(p.z+p.vz*dt,-FIELD.boxHalf+.4,FIELD.boxHalf-.4);p.vz*=Math.exp(-3*dt);
  }else p.move(tx-p.x,tz-p.z,Math.min(1,Math.hypot(tx-p.x,tz-p.z)/1.4),dt,sprint,b);
  if(!p.action&&rush)p.animation='keeper-rush';
}
export function keeperContact(match,p){
  const b=match.ball,d=match.direction(p.team),gap=distance(p,b),speed=Math.hypot(b.vx,b.vz);
  if(p.cooldown>0||p.x*d>-FIELD.halfLength+FIELD.boxDepth||Math.abs(p.z)>FIELD.boxHalf||gap>2.5||b.y>3.5)return false;
  const context=saveContext(p,b),cross=!!b.pass&&b.y>1.4,close=!!b.owner;
  const config=match.aiConfig(p.team),ability=clamp(config.keeper*(.65+p.attributes.keeper*.35),.4,1);
  const reaction=(p.keeperState.reaction||0)>0?config.reaction*.1:0;
  // Judge a straight shot by its path through the keeper, not the outer reach boundary.
  const toward=speed>.1?((p.x-b.x)*b.vx+(p.z-b.z)*b.vz)/(speed*speed):0;
  const miss=speed>.1?Math.abs((b.x-p.x)*b.vz-(b.z-p.z)*b.vx)/speed:gap;
  const atBody=predictBall(b,clamp(toward,0,.15));
  const direct=!close&&toward>=-.015&&toward<.16&&miss<.82&&atBody.y<2.65;
  const easy=gap<1.45&&speed<24&&b.y<2.4;
  const probability=direct?clamp(.955+config.keeper*.043,.97,.9995)
    :clamp(ability-speed*.0015*(1.2-config.keeper)-reaction-(gap>1.8?.1*(1.2-config.keeper):0),.18,.995);
  let success=gap<.75||easy||match.random()<probability;
  if(b.shot?.setPiece==='PENALTY'&&match.isHumanControlled(p)){
    const goalX=-match.direction(p.team)*FIELD.halfLength,time=b.vx?clamp((goalX-b.x)/b.vx,0,.8):0,target=predictBall(b,time),lateral=target.z-p.z,dive=p.keeperState.penaltyDive;
    const centered=Math.abs(lateral)<.72,correctDive=!!dive&&Math.abs(lateral)<2.55&&(Math.abs(lateral)<.45||Math.sign(lateral)===dive.side);
    const heightReach=dive?.height>.45?target.y<2.8:dive?.height<-.45?target.y<1.15:target.y<2.35;
    const ability=clamp(config.keeper*(.55+p.attributes.keeper*.45),.2,1),chance=clamp(.52+ability*.36-(speed>32?.13:0),.48,.91);
    success=(centered||correctDive)&&heightReach&&match.random()<chance;
  }
  if(!success){p.cooldown=.16;if(!p.action)p.animate('keeper-dive',.65,{...context,high:b.y>1.7});return false;}
  if(b.shot){match.onTarget();match.stats[p.team].saves++;p.saves++;if(b.shot.setPiece==='PENALTY'&&!b.shot.penaltySaved){match.stats[p.team].penaltiesSaved++;b.shot.penaltySaved=true;}match.notify('SAVE',playerLabel(p),4.5,{team:p.team,playerName:playerLabel(p)});}
  const pressure=match.active(1-p.team).some(o=>distance(o,b)<3);
  const catchable=(close||speed<29||(direct&&speed<32+config.keeper*6))&&b.y<2.8&&(!cross||!pressure)&&gap<1.9;
  if(catchable){
    match.claim(p,{hands:true});p.animate(close?'keeper-smother':cross?'keeper-cross-catch':'keeper-catch',.65,context);
  }else{
    const punch=cross&&(pressure||b.y>2.6);
    b.release(d*(punch?18:8+speed*.22),Math.sign(b.z-p.z||context.side)*(punch?8:10+speed*.1),punch?6:2.4);
    b.touch(p);b.spin*=.3;b.lock=.14;p.cooldown=.55;
    p.animate(punch?'keeper-punch':gap<1?'keeper-block':'keeper-dive',.65,{...context,high:b.y>1.7,oneHand:gap>1.6,parry:true});
  }
  for(const mate of match.active(p.team)){if(mate!==p&&distance(mate,p)<10&&!mate.action)mate.animate('applaud',.65);}
  return true;
}
