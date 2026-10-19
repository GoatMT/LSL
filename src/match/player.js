import { FORMATION,FIELD,PLAY,clamp,normalize } from '../config.js';
import { playerAttributes,playerRatings } from './attributes.js';
import { preferredFoot } from './shooting.js';
export const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export class Player {
  constructor(data,team,slot,direction,formation=FORMATION){
    this.formation=formation?.length===7?formation:FORMATION;
    Object.assign(this,{data:{...data},team,slot,role:this.formation[slot]?.role||FORMATION[slot].role,id:data.id,name:data.name,jersey:data.jersey,
      x:0,z:0,vx:0,vz:0,faceX:direction,faceZ:0,cooldown:0,skill:0,animation:'idle',animationTime:0,
      sentOff:false,yellow:0,decision:0,holdTime:0,goals:0,assists:0,shots:0,onTarget:0,passes:0,tackles:0,saves:0,involvement:0,
      gait:0,turn:0,acceleration:0,lookX:direction,lookZ:0,locomotion:'idle',boosting:false,action:null,skillPlan:null,lastSkill:null,keeperState:{},lastReceive:-10,dribbleX:direction,dribbleZ:0});
    const preference=preferredFoot(data);this.dominantFoot=preference.foot;this.footSource=preference.source;this.touchFoot=preference.foot==='left'?'left':'right';
    this.attributes=playerAttributes(data);this.ratings=playerRatings(data);this.reset(direction);
  }
  reset(direction){
    const h=this.formation[this.slot]||FORMATION[this.slot];this.x=h.x*direction;this.z=h.z;this.vx=this.vz=0;this.faceX=direction;this.faceZ=0;this.lookX=direction;this.lookZ=0;this.cooldown=.35;
    this.action=null;this.skillPlan=null;this.skill=0;this.animationTime=0;this.animation=this.role==='GK'?'ready':'idle';this.locomotion='idle';this.keeperState={};this.gait=0;this.hasBall=false;this.striking=false;this.aiTarget=null;this.cutTime=0;this.receivedFrom=null;
  }
  move(dx,dz,intensity,dt,sprint=false,facing=null){
    if(this.striking){dx=dz=intensity=0;sprint=false;}
    const n=normalize(dx,dz),moving=Math.hypot(dx,dz)>.03&&intensity>.01,previousSpeed=Math.hypot(this.vx,this.vz);
    if(moving){this.dribbleX=n.x;this.dribbleZ=n.z;}
    const recovering=this.action&&['fall','roll-fall','slide-tackle','get-up','keeper-get-up','keeper-dive'].includes(this.action.name);
    const boosting=sprint&&moving&&!recovering;
    const settling=this.hasBall&&this.lastReceive<.24?.74:1;
    const injuryPenalty=this.injured?.72:1;
    const momentumBoost=boosting&&previousSpeed>PLAY.runSpeed*.72?this.attributes.momentum:1;
    const speed=(boosting?PLAY.sprintSpeed:PLAY.runSpeed)*this.attributes.speed*momentumBoost*clamp(intensity,0,1)*settling*injuryPenalty;
    let tx=moving?n.x*speed:0,tz=moving?n.z*speed:0;
    if(this.skillPlan){
      const envelope=Math.sin(Math.PI*clamp(this.skillPlan.time/this.skillPlan.duration,0,1));
      tx+=this.skillPlan.x*this.skillPlan.burst*envelope;tz+=this.skillPlan.z*this.skillPlan.burst*envelope;
    }
    if(recovering){tx=this.vx*(this.action.name==='slide-tackle'?.92:.25);tz=this.vz*(this.action.name==='slide-tackle'?.92:.25);}
    const alignment=previousSpeed>.1?(this.vx*n.x+this.vz*n.z)/previousSpeed:1;
    this.cutTime=moving&&alignment<.65?.23:Math.max(0,(this.cutTime||0)-dt);
    const control=this.hasBall?.86+this.attributes.dribble*.82:1;
    const rate=(!moving?PLAY.braking:this.cutTime>0?PLAY.turnAcceleration:boosting?PLAY.sprintAcceleration:PLAY.acceleration)*control;
    const dv=Math.hypot(tx-this.vx,tz-this.vz),step=Math.min(1,rate*dt/(dv||1));
    this.vx+=(tx-this.vx)*step;this.vz+=(tz-this.vz)*step;
    this.x=clamp(this.x+this.vx*dt,-FIELD.halfLength-FIELD.playerMargin,FIELD.halfLength+FIELD.playerMargin);
    this.z=clamp(this.z+this.vz*dt,-FIELD.halfWidth-FIELD.playerMargin,FIELD.halfWidth+FIELD.playerMargin);
    const actualSpeed=Math.hypot(this.vx,this.vz),oldAngle=Math.atan2(this.faceX,this.faceZ);
    let desired=facing?normalize(facing.x-this.x,facing.z-this.z):moving?n:{x:this.faceX,z:this.faceZ};
    if(this.action?.context?.aim&&this.action.time<this.action.duration*.6)desired=this.action.context.aim;
    const delta=angleDelta(oldAngle,Math.atan2(desired.x,desired.z)),turnRate=(boosting?PLAY.sprintTurnRate:PLAY.turnRate)*control,angle=oldAngle+clamp(delta,-turnRate*dt,turnRate*dt);
    this.faceX=Math.sin(angle);this.faceZ=Math.cos(angle);this.turn+=(delta-this.turn)*(1-Math.exp(-9*dt));
    this.acceleration=(actualSpeed-previousSpeed)/Math.max(dt,.001);this.gait+=actualSpeed*dt*(boosting?1.9:2.4);
    const dot=(this.vx*this.faceX+this.vz*this.faceZ)/(actualSpeed||1);
    this.locomotion=actualSpeed<.15?'idle':facing&&dot<-.45?'backpedal':facing&&Math.abs(dot)<.55?'sidestep':boosting?'sprint':actualSpeed<2.4?'walk':actualSpeed<5?'jog':'run';
    if(boosting&&!this.boosting&&!this.action)this.animate('sprint-start',.32);
    this.boosting=boosting;
    if(!this.action)this.animation=this.role==='GK'&&actualSpeed<.2?'ready':this.locomotion;
  }
  watch(point){const d=normalize(point.x-this.x,point.z-this.z);this.lookX=d.x;this.lookZ=d.z;}
  tick(dt){
    this.cooldown=Math.max(0,this.cooldown-dt);this.skill=Math.max(0,this.skill-dt);this.decision-=dt;this.lastReceive+=dt;this.footTouch=Math.max(0,(this.footTouch||0)-dt);
    if(this.skillPlan){this.skillPlan.time-=dt;if(this.skillPlan.time<=0)this.skillPlan=null;}
    if(this.action){
      this.action.time+=dt;this.animationTime=Math.max(0,this.action.duration-this.action.time);
      if(this.animationTime<=0){
        const {name,context}=this.action;this.action=null;
        if(['fall','roll-fall','slide-tackle'].includes(name))this.animate('get-up',.65,context);
        else if(name==='keeper-dive')this.animate('keeper-get-up',.85,context);
        else if(name==='stumble')this.animate('recover',.35);
      }
    }
  }
  animate(name,time=.45,context={}){
    this.animation=name;this.animationTime=time;this.action={name,duration:time,time:0,context};
  }
}
