import { FIELD,PLAY,clamp } from '../config.js';

// Exact rolling motion under drag and grass resistance, including the final stop.
export function rollingMotion(speed,seconds){
  if(speed<=PLAY.stopSpeed||seconds<=0)return {speed:seconds>0?0:speed,distance:0};
  const drag=PLAY.groundDrag,resistance=PLAY.rollingResistance,offset=resistance/drag;
  const stop=Math.log((speed+offset)/(PLAY.stopSpeed+offset))/drag,t=Math.min(seconds,stop);
  const decay=Math.exp(-drag*t);
  return {speed:seconds>=stop?0:(speed+offset)*decay-offset,
    distance:(speed+offset)*(1-decay)/drag-offset*t};
}

export function passSpeed(distance,arrivalSpeed=8){
  const drag=PLAY.groundDrag,resistance=PLAY.rollingResistance;
  const range=speed=>(speed-arrivalSpeed)/drag-resistance/(drag*drag)*Math.log((drag*speed+resistance)/(drag*arrivalSpeed+resistance));
  let low=Math.max(PLAY.passMin,arrivalSpeed),high=PLAY.passMax;
  if(range(low)>=distance)return low;
  for(let i=0;i<16;i++){const mid=(low+high)*.5;if(range(mid)<distance)low=mid;else high=mid;}
  return high;
}

// Split precisely at ground impact. The same motion is used by play and prediction.
export function advanceBallMotion(ball,seconds){
  let remaining=Math.max(0,seconds),rotation=0;
  while(remaining>1e-8){
    const height=Math.max(0,ball.y-FIELD.ballRadius),airborne=height>1e-7||ball.vy>0;
    if(!airborne){
      const speed=Math.hypot(ball.vx,ball.vz),motion=rollingMotion(speed,remaining);
      if(speed>0){ball.x+=ball.vx/speed*motion.distance;ball.z+=ball.vz/speed*motion.distance;ball.vx*=motion.speed/speed;ball.vz*=motion.speed/speed;}
      const decay=Math.exp(-1.7*remaining);rotation+=ball.spin*(1-decay)/1.7;ball.spin*=decay;
      ball.y=FIELD.ballRadius;ball.vy=0;if(!motion.speed)ball.spin=0;
      break;
    }
    const impact=(ball.vy+Math.sqrt(ball.vy*ball.vy+2*PLAY.gravity*height))/PLAY.gravity;
    const t=Math.min(remaining,Math.max(0,impact)),spinDecay=Math.exp(-.25*t);
    const angle=ball.spin*(1-spinDecay)/.25*.018,angular=t>1e-8?angle/t:0;
    const drag=PLAY.airDrag,decay=Math.exp(-drag*t),cos=Math.cos(angle),sin=Math.sin(angle);
    const denominator=drag*drag+angular*angular;
    let along=(drag*(1-decay*cos)+angular*decay*sin)/denominator;
    let across=(angular*(1-decay*cos)-drag*decay*sin)/denominator;
    if(t>.04&&Math.abs(ball.spin)>.001){
      // A long prediction must follow spin decaying along the arc, not its average heading.
      along=0;across=0;
      for(const [fraction,weight] of [[.1127016653792583,5/18],[.5,4/9],[.8872983346207417,5/18]]){
        const sample=t*fraction,turn=ball.spin*(1-Math.exp(-.25*sample))/.25*.018,magnitude=t*weight*Math.exp(-drag*sample);
        along+=magnitude*Math.cos(turn);across+=magnitude*Math.sin(turn);
      }
    }
    const vx=ball.vx,vz=ball.vz;
    ball.x+=vx*along-vz*across;ball.z+=vz*along+vx*across;
    ball.vx=(vx*cos-vz*sin)*decay;ball.vz=(vz*cos+vx*sin)*decay;
    ball.y+=ball.vy*t-PLAY.gravity*t*t*.5;ball.vy-=PLAY.gravity*t;
    rotation+=ball.spin*(1-spinDecay)/.25;ball.spin*=spinDecay;remaining-=t;
    if(impact<=t+1e-8){
      const downward=Math.max(0,-ball.vy),grip=1-clamp(downward*.007,.004,.16);
      ball.y=FIELD.ballRadius;ball.vy=downward>1.8?downward*PLAY.bounceDamping:0;
      ball.vx*=grip;ball.vz*=grip;ball.spin*=grip;
    }
  }
  return rotation;
}

export function predictBall(ball,seconds){
  const point={x:ball.x,y:ball.y,z:ball.z,vx:ball.vx,vy:ball.vy,vz:ball.vz,spin:ball.spin||0};
  advanceBallMotion(point,seconds);return point;
}

export function reflectVelocity(ball,normal,restitution=.7,tangent=.98){
  const dot=ball.vx*normal.x+ball.vy*normal.y+ball.vz*normal.z;
  if(dot>=0)return;
  ball.vx=(ball.vx-dot*normal.x)*tangent-dot*normal.x*restitution;
  ball.vy=(ball.vy-dot*normal.y)*tangent-dot*normal.y*restitution;
  ball.vz=(ball.vz-dot*normal.z)*tangent-dot*normal.z*restitution;
}
