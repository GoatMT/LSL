import { clamp } from '../config.js';

function interval(ax,az,dx,dz,radius){
  const a=dx*dx+dz*dz,c=ax*ax+az*az-radius*radius;
  if(a<1e-12)return c<=0?[0,1]:null;
  const b=ax*dx+az*dz,disc=b*b-a*c;if(disc<0)return null;
  const root=Math.sqrt(disc),enter=Math.max(0,(-b-root)/a),leave=Math.min(1,(-b+root)/a);
  return enter<=leave?[enter,leave]:null;
}

// Moving ball against a moving player's reachable cylinder, in time order.
export function playerContact(player,start,end,radius,maxHeight,minHeight=0,moving=false){
  const px=moving?(player.previousX??player.x):player.x,pz=moving?(player.previousZ??player.z):player.z;
  const ax=start.x-px,az=start.z-pz,dx=end.x-player.x-ax,dz=end.z-player.z-az;
  const range=interval(ax,az,dx,dz,radius);if(!range)return null;
  const dy=end.y-start.y;
  if(Math.abs(dy)<1e-9){if(start.y<minHeight||start.y>maxHeight)return null;}
  else{const a=(minHeight-start.y)/dy,b=(maxHeight-start.y)/dy;range[0]=Math.max(range[0],Math.min(a,b));range[1]=Math.min(range[1],Math.max(a,b));}
  const t=range[0];if(t>range[1]||t<0||t>1)return null;
  const rx=ax+dx*t,rz=az+dz*t,length=Math.hypot(rx,rz),fallback=Math.hypot(dx,dz)||1;
  return {t,x:start.x+(end.x-start.x)*t,y:start.y+dy*t,z:start.z+(end.z-start.z)*t,
    normal:{x:length>1e-6?rx/length:-dx/fallback,y:0,z:length>1e-6?rz/length:-dz/fallback}};
}

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const subtract=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
// Swept sphere versus a rounded post/crossbar; no ball can tunnel through a frame.
export function capsuleContact(start,end,a,b,radius){
  const axis=subtract(b,a),length=Math.sqrt(dot(axis,axis));
  axis.x/=length;axis.y/=length;axis.z/=length;
  const offset=subtract(start,a),motion=subtract(end,start),along=dot(offset,axis),travel=dot(motion,axis);
  const radial={x:offset.x-axis.x*along,y:offset.y-axis.y*along,z:offset.z-axis.z*along};
  const velocity={x:motion.x-axis.x*travel,y:motion.y-axis.y*travel,z:motion.z-axis.z*travel};
  const times=[];
  const roots=(offset,velocity,accept)=>{
    const aa=dot(velocity,velocity),bb=dot(offset,velocity),cc=dot(offset,offset)-radius*radius;
    if(cc<=0){if(accept(0))times.push(0);return;}
    const disc=bb*bb-aa*cc;if(aa<1e-12||disc<0)return;
    const t=(-bb-Math.sqrt(disc))/aa;if(t>=0&&t<=1&&accept(t))times.push(t);
  };
  roots(radial,velocity,t=>along+travel*t>=0&&along+travel*t<=length);
  roots(offset,motion,()=>true);roots(subtract(start,b),motion,()=>true);
  times.sort((a,b)=>a-b);
  for(const t of times){
    const point={x:start.x+motion.x*t,y:start.y+motion.y*t,z:start.z+motion.z*t};
    const s=clamp(along+travel*t,0,length),center={x:a.x+axis.x*s,y:a.y+axis.y*s,z:a.z+axis.z*s};
    const n=subtract(point,center),gap=Math.sqrt(dot(n,n)),fallback=Math.sqrt(dot(motion,motion))||1;
    const normal=gap>1e-7?{x:n.x/gap,y:n.y/gap,z:n.z/gap}:{x:-motion.x/fallback,y:-motion.y/fallback,z:-motion.z/fallback};
    if(dot(normal,motion)>=-1e-9)continue;
    return {t,x:center.x+normal.x*(radius+.002),y:center.y+normal.y*(radius+.002),z:center.z+normal.z*(radius+.002),normal};
  }
  return null;
}
