import {staffPose} from './staff-poses.js';
import {celebrationPose} from './celebration-poses.js';
import { clamp } from '../config.js';
import { angleDelta } from '../match/player.js';
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function animationPose(p,time){
  const speed=Math.hypot(p.vx,p.vz),phase=p.gait,run=clamp(speed/9,0,1),swing=Math.sin(phase)*(.18+run*.64);
  const face=Math.atan2(p.faceX,p.faceZ),look=Math.atan2(p.lookX,p.lookZ);
  const pose={y:0,x:0,pitch:clamp(speed*.018+p.acceleration*.003,-.10,.24),roll:clamp(-p.turn*speed*.018,-.22,.22),yaw:Math.sin(phase)*run*.045,
    headYaw:clamp(angleDelta(face,look),-.6,.6)+Math.sin(time*.65+p.slot)*.035,headPitch:-run*.035,
    laY:0,raY:0,laX:-swing*.67,raX:swing*.67,laZ:-.08-run*.06,raZ:.08+run*.06,le:.20+run*.90,re:.20+run*.90,
    llX:swing,rlX:-swing,llZ:-.015,rlZ:.015,lk:.06+Math.max(0,-Math.sin(phase))*(.39+run*.90),rk:.06+Math.max(0,Math.sin(phase))*(.39+run*.90)};
  if(speed<.15){pose.pitch=.018;pose.y=Math.sin(time*1.8+p.slot)*.008;pose.roll=Math.sin(time*.5+p.slot)*.012;pose.llX=pose.rlX=0;pose.lk=pose.rk=.025;}
  else pose.y=Math.abs(Math.sin(phase))*(.013+run*.035);
  if(p.locomotion==='sidestep'){pose.llZ=swing*.35;pose.rlZ=-swing*.35;pose.llX*=.35;pose.rlX*=.35;}
  if(p.locomotion==='backpedal'){pose.pitch=-.12;pose.llX*=-.65;pose.rlX*=-.65;}
  if(p.role==='GK'){
    const set=1-clamp(speed/4,0,1);
    pose.y-=.09*set;pose.lk+=.22*set;pose.rk+=.22*set;pose.pitch=.07+set*.03;pose.laZ=-.21;pose.raZ=.21;pose.laX-=.38*set;pose.raX-=.38*set;pose.le=.65;pose.re=.65;
    pose.llZ-=.055*set;pose.rlZ+=.055*set;
  }
  if(p.footTouch>0&&!p.action){pose[p.touchFoot==='left'?'llX':'rlX']-=.3;pose[p.touchFoot==='left'?'lk':'rk']+=.15;}
  const a=p.action;if(!a)return pose;
  const t=clamp(a.time/a.duration,0,1),c=a.context||{},side=c.side||1,f=Math.sin(t*Math.PI),action={...pose};
  const names=a.name,kickRight=side>0,leg=kickRight?'rlX':'llX',knee=kickRight?'rk':'lk',plant=kickRight?'llX':'rlX';
  const shots=['shot','power-shot','finesse-shot','trivela-shot','side-foot','first-shot','volley','half-volley','driven-shot','long-shot','penalty','free-kick'];
  const passes=['short-pass','firm-pass','long-pass','through-pass','cross','first-pass','backheel','goal-kick','keeper-punt'];
  if(shots.includes(names)||passes.includes(names)){
    const power=names==='power-shot'||names==='long-shot'||names==='cross';
    const impact=c.contactAt??.25,backswing=impact*.52,follow=clamp((t-impact)/(1-impact),0,1);
    const strike=t<backswing?Math.sin(t/backswing*Math.PI/2)*.65:t<impact?.65-1.27*smooth((t-backswing)/(impact-backswing)):
      -.62*(1-smooth(follow))-(power?1.05:.72)*Math.sin(follow*Math.PI);
    action[leg]=names==='backheel'?Math.sin(t*Math.PI)*1.5:strike;
    action[knee]=t<backswing?.45:.16;action[plant]=.08;action[kickRight?'lk':'rk']=.18;action.y=-.035*f;action.pitch=.05+f*.14;
    action.yaw=-side*f*(names==='cross'?.45:.22);action.laZ=-.55*f;action.raZ=.55*f;action.le=action.re=.35;
    if(names==='side-foot'){action.roll=-side*f*.08;action[leg]*=.6;}
    if(names==='finesse-shot'){
      action[leg]*=.72;action[kickRight?'rlZ':'llZ']=-side*f*.48;action.yaw=-side*f*.60;
      action.roll=-side*f*.13;action.pitch=.08;action[knee]=.22;action.laZ=-.72*f;action.raZ=.72*f;
    }
    if(names==='trivela-shot'){
      action[leg]*=.90;action[kickRight?'rlZ':'llZ']=side*f*.44;action.yaw=side*f*.42;
      action.roll=side*f*.20;action.pitch=.18*f;action[knee]=.32;action[plant]=.24;
    }
    if(names==='power-shot'){action.pitch=c.skied?-.32*f:.22*f;action[leg]*=1.15;action.yaw=-side*f*.4;}
    if(names==='volley'||names==='half-volley'){action[leg]=-f*1.65;action[knee]=.2;action.y=.16*f;action.pitch=-.15*f;}
  }else if(names==='header'||names==='header-pass'){
    action.y=.48*f*(p.attributes?.headerJump||1);action.pitch=Math.sin(t*Math.PI*2)*-.35;action.laZ=-.55;action.raZ=.55;action.lk=action.rk=.4*f;
  }else if(['trap','cushion','receive-run','receive-turn'].includes(names)){
    action[leg]=-.35*f;action[knee]=.55*f;action.pitch=.13*f;action.laZ=-.25;action.raZ=.25;action.yaw=names==='receive-turn'?side*f*.4:0;
  }else if(['body-feint','step-over','double-step','ball-roll','fake-shot','drag-back','roulette','quick-cut','directional-touch','stop-go','heel-to-heel','close-control'].includes(names)){
    action.laZ=-.5;action.raZ=.5;action.pitch=.15;action.roll=-side*f*.25;
    if(names==='roulette'){action.yaw=side*Math.PI*2*smooth(t);action.lk=.4;action.rk=.4;}
    else if(names.includes('step')){const cycle=names==='double-step'?Math.PI*4:Math.PI*2;action.llX=-Math.sin(t*cycle)*.45;action.rlX=Math.sin(t*cycle)*.45;action.llZ=-f*.3;action.rlZ=f*.3;}
    else if(names==='drag-back'){action[leg]=-.5*f;action[knee]=.8*f;}
    else if(names==='heel-to-heel'){action.llX=f*.65;action.rlX=-f*.7;action.pitch=.3*f;}
    else if(names==='fake-shot'){action[leg]=f*.65;action[knee]=f*.7;action.yaw=side*f*.25;}
    else if(names==='ball-roll'){action[leg]=-.3;action[knee]=.35;action[kickRight?'rlZ':'llZ']=side*Math.sin(t*Math.PI*2)*.4;}
    else{action[leg]=-.5*f;action.yaw=side*f*.25;}
  }else if(['jockey','block','intercept','shoulder','standing-tackle'].includes(names)){
    action.y=-.13*f;action.lk=action.rk=.35;action.llZ=-.13;action.rlZ=.13;action.laZ=-.35;action.raZ=.35;
    if(names==='standing-tackle'||names==='intercept'){action[leg]=-1.05*f;action[knee]=.1;action.pitch=-.15*f;}
    if(names==='shoulder'){action.roll=-side*f*.45;action.laZ=action.raZ=0;}
    if(names==='block'){action.laX=.25;action.raX=.25;action.llZ=-.35*f;action.rlZ=.35*f;}
  }else if(['slide-tackle','fall','roll-fall','get-up','stumble','recover'].includes(names)){
    const down=names==='get-up'?1-smooth(t):names==='recover'?(1-t)*.3:Math.min(1,t*4);
    action.y=-.72*down;action.pitch=(names==='slide-tackle'?-.65:1.15)*down;action.lk=.7*down;action.rk=1.3*down;action.llX=-.7*down;action.rlX=-.2*down;
    action.laZ=-.85*down;action.raZ=.85*down;
    if(names==='roll-fall')action.roll=side*Math.PI*1.6*smooth(t);
    if(names==='stumble'){action.y=-.12*f;action.pitch=.5*f;action.roll=side*.18*f;}
  }else if(names.startsWith('keeper-')){
    if(names==='keeper-dive'){
      const extension=smooth(t/.23),landing=smooth((t-.52)/.48);action.roll=-side*(1.13+landing*.08)*extension;action.x=side*.45*extension;
      action.y=(c.high?.32:-.30)*extension-Math.sin(landing*Math.PI/2)*.12;action.pitch=-.04;action.lk=.18+landing*.35;action.rk=.38+landing*.35;
      action.laZ=side*1.15;action.raZ=side*1.15;action.laX=c.high?-1.9:-.7;action.raX=action.laX;
      action.le=c.oneHand?.5:.08;action.re=.08;action.headPitch=-.1;
    }else if(names==='keeper-get-up'){
      const down=1-smooth(t);action.y=-.55*down;action.roll=-side*1.15*down;action.lk=action.rk=.7*down;action.laZ=-.45;action.raZ=.45;
    }else if(['keeper-catch','keeper-hold','keeper-cross-catch','keeper-smother'].includes(names)){
      action.laX=action.raX=names==='keeper-cross-catch'?-2.3:-1.05;action.laZ=-.13;action.raZ=.13;action.le=action.re=.55;action.pitch=.1;
      if(names==='keeper-smother'){action.y=-.5*(1-t);action.pitch=.65*(1-t);action.lk=action.rk=1.1*(1-t);}
    }else if(names==='keeper-punch'){action.laX=-2.5*f;action.raX=-2.5*f;action.le=action.re=.05;action.y=.35*f;}
    else if(names==='keeper-block'){action.laZ=-1.2;action.raZ=1.2;action.llZ=-.45;action.rlZ=.45;action.y=-.25*f;action.lk=action.rk=.45;}
    else if(names==='keeper-roll'){action.raX=Math.sin(t*Math.PI*2)*.9;action.re=.15;action.pitch=.6*f;action.y=-.15*f;}
    else if(names==='keeper-throw'){action.raX=t<.4?2.6*t:-2.6*f;action.re=.3;action.yaw=-f*.3;action.laX=-.4;}
  }else if(names==='sprint-start'){action.pitch=.35*f;action.le=action.re=1;}
  else if(names==='bench-sit'){
    action.y=-.42;action.pitch=.08;action.llX=-.72;action.rlX=-.72;action.lk=action.rk=1.16;
    action.laX=-.48;action.raX=-.48;action.le=action.re=.88;action.laZ=-.12;action.raZ=.12;action.headPitch=.025*Math.sin(time*1.4+p.slot);
  }else if(names==='bench-talk'){
    action.y=-.42;action.pitch=.08;action.llX=-.72;action.rlX=-.72;action.lk=action.rk=1.16;
    action.laX=-.22;action.raX=-.54-Math.sin(time*5+p.slot)*.12;action.le=.75;action.re=1.04;action.raZ=.28;action.headYaw=Math.sin(time*2+p.slot)*.23;
  }else if(names==='bench-drink'){
    action.y=-.42;action.pitch=.08+Math.sin(time*2.2)*.015;action.llX=-.72;action.rlX=-.72;action.lk=action.rk=1.16;
    action.raX=-1.9;action.re=.42;action.raZ=-.14;action.laX=-.5;action.le=.9;action.headPitch=-.23+Math.sin(time*2.2)*.025;
  }else if(names==='team-talk'){
    action.raX=-.5-Math.sin(time*4+p.slot)*.10;action.re=.85;action.raZ=.20;action.laX=-.28;action.le=.85;action.headYaw=Math.sin(time*1.8+p.slot)*.18;action.pitch=.035;
  }else if(names==='team-drink'){
    action.raX=-1.72;action.re=.46;action.raZ=-.12;action.laX=-.28;action.le=.85;action.headPitch=-.19;action.pitch=.035;
  }else if(names==='staff-timeout'){
    const beat=Math.sin(time*4.2);action.pitch=.05+Math.max(0,beat)*.03;action.raX=-1.15+beat*.28;action.raZ=.55;action.re=.34;
    action.laX=-.55;action.le=.85;action.headYaw=Math.sin(time*1.5)*.08;
  }else if(names==='miss'){action.laX=.12;action.le=.15;action.raX=-.95;action.raZ=.18;action.re=1.65;action.headPitch=.40;action.pitch=.09;}
  else if(names==='concede'){action.laX=action.raX=.05;action.le=action.re=.2;action.headPitch=.45;action.pitch=.13;action.laZ=-.08;action.raZ=.08;}
  else if(names==='card-reaction'){action.laZ=-.8;action.raZ=.8;action.le=action.re=.7;action.headPitch=-.12;}
  else if(names==='card'){action.laX=-2.8;action.le=.05;}
  else if(names==='applaud'){action.laX=action.raX=-1.1;action.le=action.re=1;action.laZ=-.2+Math.sin(time*16)*.1;action.raZ=.2-Math.sin(time*16)*.1;}
  else if(names.startsWith('staff-')){staffPose(action,names,t,a.time);}
  else if(names.startsWith('celebrate')||names==='wave'){
    celebrationPose(action,names,t,a.time,c);
  }
  const keepDown=['fall','roll-fall','slide-tackle','keeper-dive','get-up','keeper-get-up'].includes(names);
  const weight=keepDown?(names.includes('get-up')?1:smooth(a.time/.10)):smooth(a.time/(names.startsWith('celebrate')?.4:.09))*smooth((a.duration-a.time)/(names.startsWith('celebrate')?.6:.16));
  for(const key of Object.keys(pose))pose[key]+=(action[key]-pose[key])*weight;
  return pose;
}
