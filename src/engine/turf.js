import * as T from '../../vendor/three.module.js';
import {FIELD} from '../config.js';

function randomSource(seed=2046){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

// Original canvas textures: no downloads, image decoding or runtime network dependency.
export function createTurf(){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1344;
  const c=canvas.getContext('2d'),random=randomSource();
  c.fillStyle='#447b35';c.fillRect(0,0,canvas.width,canvas.height);
  for(let strip=0;strip<16;strip++){
    const g=c.createLinearGradient(strip*128,0,(strip+1)*128,0);
    g.addColorStop(0,strip%2?'#4d813c':'#3f7134');g.addColorStop(1,strip%2?'#507f3b':'#427538');
    c.fillStyle=g;c.fillRect(strip*128,0,128,canvas.height);
  }
  // Uneven turf tone, short individual blades, and faint wear in the busiest areas.
  for(let i=0;i<360;i++){
    const x=random()*2048,y=random()*1344,r=20+random()*105,g=c.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,i%2?'#c8bf5110':'#152e1512');g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<160000;i++){
    const x=random()*2048,y=random()*1344;c.fillStyle=i%3?'#b9c88216':'#15291926';
    c.fillRect(x,y,.7+random(),1+random()*3);
  }
  for(const x of [70,1978]){
    const g=c.createRadialGradient(x,672,0,x,672,95);g.addColorStop(0,'#91805028');g.addColorStop(1,'#91805000');
    c.fillStyle=g;c.fillRect(x-95,577,190,190);
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const micro=document.createElement('canvas');micro.width=micro.height=128;
  const mc=micro.getContext('2d'),pixels=mc.createImageData(128,128);
  for(let i=0;i<pixels.data.length;i+=4){const v=75+Math.floor(random()*130);pixels.data.set([v,v,v,255],i);}mc.putImageData(pixels,0,0);
  const bump=new T.CanvasTexture(micro);bump.wrapS=bump.wrapT=T.RepeatWrapping;bump.repeat.set(100,66);
  const material=new T.MeshStandardMaterial({map,bumpMap:bump,bumpScale:.055,roughness:.94,metalness:0});
  const pitch=new T.Mesh(new T.PlaneGeometry(FIELD.halfLength*2,FIELD.halfWidth*2),material);
  pitch.rotation.x=-Math.PI/2;pitch.receiveShadow=true;
  return {pitch,map,bump,quality(level,anisotropy){map.anisotropy=Math.min(anisotropy,level==='high'?8:level==='medium'?4:2);material.bumpMap=level==='low'?null:bump;material.needsUpdate=true;}};
}

// Painted ribbons retain a physical width on desktop and high-density phones.
export function createMarkings(){
  const positions=[],width=.15,L=FIELD.halfLength,W=FIELD.halfWidth;
  const segment=(a,b)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)return;
    const ox=-dz/length*width/2,oz=dx/length*width/2;
    const v=[[a[0]+ox,a[1]+oz],[a[0]-ox,a[1]-oz],[b[0]+ox,b[1]+oz],[b[0]-ox,b[1]-oz]];
    for(const i of [0,1,2,2,1,3])positions.push(v[i][0],.022,v[i][1]);
  };
  const path=pts=>pts.slice(1).forEach((p,i)=>segment(pts[i],p));
  const arc=(x,z,r,start=0,end=Math.PI*2,filter=()=>true)=>{
    let previous=null;for(let i=0;i<=96;i++){const a=start+(end-start)*i/96,p=[x+Math.cos(a)*r,z+Math.sin(a)*r];if(previous&&filter(p)&&filter(previous))segment(previous,p);previous=p;}
  };
  path([[-L,-W],[L,-W],[L,W],[-L,W],[-L,-W]]);path([[0,-W],[0,W]]);
  arc(0,0,FIELD.centerRadius);arc(0,0,.17);
  for(const side of [-1,1]){
    for(const [depth,half] of [[FIELD.boxDepth,FIELD.boxHalf],[FIELD.goalBoxDepth,FIELD.goalBoxHalf]])path([[side*L,-half],[side*(L-depth),-half],[side*(L-depth),half],[side*L,half]]);
    const spot=side*(L-FIELD.penaltyDistance);arc(spot,0,.17);
    arc(spot,0,FIELD.centerRadius,0,Math.PI*2,p=>p[0]*side<L-FIELD.boxDepth-.04);
    for(const zSide of [-1,1])arc(side*L,zSide*W,1.1,0,Math.PI*2,p=>Math.abs(p[0])<=L&&Math.abs(p[1])<=W);
    // Technical areas and the halfway touchline ticks are outside the playing surface.
    for(const x of [-17,17])path([[x-6,side*(W+1.4)],[x-6,side*(W+4.7)],[x+6,side*(W+4.7)],[x+6,side*(W+1.4)]]);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  return new T.Mesh(geometry,new T.MeshBasicMaterial({color:'#e4e8da',side:T.DoubleSide,transparent:true,opacity:.88,depthWrite:false}));
}
