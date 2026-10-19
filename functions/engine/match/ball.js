import { FIELD,PLAY,normalize,clamp,distance } from '../config.js';
import { contactFoot } from './shooting.js';
import { advanceBallMotion } from './physics.js';
export class Ball {
  constructor(){this.flightId=0;this.reset();}
  reset(x=0,z=0){if(this.owner)this.owner.hasBall=false;Object.assign(this,{x,z,y:FIELD.ballRadius,vx:0,vz:0,vy:0,owner:null,lastTouch:null,previousTouch:null,lock:0,shot:null,pass:null,
    spin:0,rollX:0,rollZ:0,rotationY:0,touchClock:0,touchAge:0,touchCount:0,controlMode:'feet',flightTime:0,inNet:false,badTouch:false});}
  touch(player){
    if(this.pass&&player.team!==this.pass.team)this.pass=null;
    if(this.lastTouch!==player)this.previousTouch=this.lastTouch;
    this.lastTouch=player;player.involvement+=.08;
  }
  take(player,{hands=false,pressure=0,random=()=>.5}={}){
    const incomingSpeed=Math.hypot(this.vx,this.vz),moving=Math.hypot(player.vx,player.vz),quality=player.attributes?.dribble??.7;
    if(this.pass){if(this.pass.team===player.team&&this.pass.from!==player){this.pass.from.passes++;this.pass.completed=true;}this.pass=null;}
    if(this.owner)this.owner.hasBall=false;
    this.owner=player;player.hasBall=true;this.touch(player);this.shot=null;this.controlMode=hands?'hands':'feet';this.touchClock=.08;this.touchAge=0;player.holdTime=0;player.lastReceive=0;
    this.spin*=.15;
    if(hands){this.vx=this.vz=this.vy=0;this.holdInHands();return;}
    // Cushion a pass at the contact point; a moving receiver can take it into their stride.
    if(distance(this,player)>2.5){this.x=player.x+player.faceX*.85;this.z=player.z+player.faceZ*.85;}
    this.y=FIELD.ballRadius;this.vy=0;
    player.touchFoot=contactFoot(player,this);
    const heavy=clamp(incomingSpeed/50*(1-quality)*(.6+pressure*.1),0,.45);
    const carry=moving>.8?normalize(player.vx,player.vz):{x:player.faceX,z:player.faceZ};
    const touchSpeed=moving>.8?moving*.65:incomingSpeed<10?0:Math.min(2.1,incomingSpeed*.045);
    this.vx=carry.x*touchSpeed;this.vz=carry.z*touchSpeed;
    const across=(player.faceX*carry.z-player.faceZ*carry.x);
    player.animate(moving>.8?(Math.abs(across)>.4?'receive-turn':'receive-run'):incomingSpeed<13?'trap':'cushion',.45,{side:Math.sign(across)||1});
    this.badTouch=heavy>.3&&pressure>0&&random()<heavy*.25;
    if(this.badTouch){this.vx+=carry.x*2.5;this.vz+=carry.z*2.5;this.touchClock=.35;}
  }
  holdInHands(){
    const p=this.owner;if(!p)return;this.x=p.x+p.faceX*.55;this.z=p.z+p.faceZ*.55;this.y=1.64;
    if(p.striking&&['keeper-roll','keeper-punt'].includes(p.action?.name)){
      const phase=clamp(p.action.time/(p.action.duration*p.action.context.contactAt),0,1),height=p.action.name==='keeper-roll'?.50:1.1;
      this.y+=(height-this.y)*phase;this.x+=p.faceZ*.12*phase;this.z-=p.faceX*.12*phase;
    }
    this.vx=this.vz=this.vy=0;
  }
  kick(player,dx,dz,power,lift=0,{spin=0,height=null}={}){
    const n=normalize(dx,dz),previousHeight=this.y;if(this.owner)this.owner.hasBall=false;this.owner=null;this.controlMode='feet';this.touch(player);
    if(distance(this,player)>2.8||this.y>3.4){this.x=player.x+n.x*.9;this.z=player.z+n.z*.9;}
    else if(distance(this,player)<.65){this.x=player.x+n.x*.75;this.z=player.z+n.z*.75;}
    this.y=height??Math.max(FIELD.ballRadius+.04,Math.min(previousHeight,2.6));
    this.vx=n.x*power;this.vz=n.z*power;this.vy=lift;this.spin=spin;this.lock=Math.min(.10,1.5/Math.max(power,1));player.cooldown=.25;
    this.flightId++;this.flightTime=0;this.inNet=false;
  }
  release(vx=this.vx,vz=this.vz,vy=this.vy){if(this.owner)this.owner.hasBall=false;this.owner=null;this.controlMode='feet';this.vx=vx;this.vz=vz;this.vy=vy;this.touchClock=0;}
  integrate(dt){
    const x=this.x,z=this.z;
    this.rotationY+=advanceBallMotion(this,dt);
    this.rollX+=(this.z-z)/FIELD.ballRadius;this.rollZ-=(this.x-x)/FIELD.ballRadius;
  }
  update(dt){
    this.lock=Math.max(0,this.lock-dt);this.flightTime+=dt;
    if(this.owner&&this.controlMode==='hands'){this.owner.holdTime+=dt;this.holdInHands();return;}
    const p=this.owner;if(!p){this.integrate(dt);return;}p.holdTime+=dt;this.touchClock-=dt;this.touchAge+=dt;
    const speed=Math.hypot(p.vx,p.vz),quality=p.attributes?.dribble??.7,gap=distance(this,p);
    if(gap>2.65+(p.boosting?.45:0)||p.sentOff){this.release();this.integrate(dt);return;}
    const skill=p.skillPlan,closeControl=skill?.kind==='close-control'||p.skill>0;
    const reach=p.boosting?2.25:1.95;
    // A reachable braking/cutting touch cancels old momentum before it can escape.
    const speedMismatch=Math.hypot(this.vx-p.vx,this.vz-p.vz),behind=(this.x-p.x)*p.faceX+(this.z-p.z)*p.faceZ<-.15;
    const cut=this.touchAge>=.065&&!this.badTouch&&gap<reach&&(speedMismatch>2.8-quality||behind||(p.cutTime>0&&this.touchClock>.055)||(speed<.5&&Math.hypot(this.vx,this.vz)>1));
    if((this.touchClock<=0||cut)&&gap<reach){
      const forward=speed>.7?normalize(p.vx,p.vz):{x:p.faceX,z:p.faceZ},intent=normalize(p.dribbleX??forward.x,p.dribbleZ??forward.z),steer=normalize(forward.x*.58+intent.x*.42,forward.z*.58+intent.z*.42);
      const skillBlend=skill?Math.sin(Math.PI*clamp(skill.time/skill.duration,0,1))*.45:0;
      const n=skill?normalize(steer.x+skill.x*skillBlend,steer.z+skill.z*skillBlend):steer;
      const lead=closeControl?.36:p.boosting?.74+(1-quality)*.12:.43+(1-quality)*.11+speed*.006;
      p.touchFoot=contactFoot(p,this);const side=p.touchFoot==='right'?1:-1;
      const correctionX=p.x+n.x*lead+p.faceZ*side*.14-this.x,correctionZ=p.z+n.z*lead-p.faceX*side*.14-this.z;
      const interval=(p.boosting?.19:closeControl?.115:.145)+(1-quality)*.045;
      const compensation=(PLAY.groundDrag*speed+PLAY.rollingResistance)*interval*.45;
      const response=8+quality*3.5;
      this.vx=p.vx+correctionX*response+n.x*compensation;this.vz=p.vz+correctionZ*response+n.z*compensation;
      if(speed<.15&&gap<.95&&!skill){this.vx=this.vz=0;}
      this.vy=0;this.y=FIELD.ballRadius;this.touchClock=interval;this.touchAge=0;this.touchCount++;this.badTouch=false;
      p.footTouch=.16;
    }
    this.integrate(dt);
  }
  settleInNet(side){
    this.release(this.vx*.07,this.vz*.09,0);this.x=clamp(this.x,side>0?FIELD.halfLength: -FIELD.halfLength-FIELD.goalDepth,side>0?FIELD.halfLength+FIELD.goalDepth:-FIELD.halfLength);
    this.z=clamp(this.z,-FIELD.goalHalf+.35,FIELD.goalHalf-.35);this.y=FIELD.ballRadius;this.inNet=true;
  }
}
