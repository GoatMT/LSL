import * as T from '../../vendor/three.module.js';
import { FIELD } from '../config.js';
import { ADVERTISEMENTS } from '../advertisements.js';

export const AD_BOARD=Object.freeze({width:9.6,height:2.5,depth:.32,centerY:1.46,faceZ:.185,footDepth:1.1,footZ:-.18});

// Local +Z is the printed face. All faces point toward the pitch.
export function advertisingLayout(field=FIELD){
  const boards=[],{halfLength:L,halfWidth:W}=field;
  for(const side of [-1,1]){
    const positions=side<0?[-56,-44,-32,32,44,56]:[-56,-44,-32,-20,-8,8,20,32,44,56];
    positions.forEach((along,i)=>boards.push({x:along/64*L,z:side*(W+3),angle:side>0?Math.PI:0,ad:(i+(side>0?1:0))%3,edge:'sideline'}));
    [-31,-18,18,31].forEach((along,i)=>boards.push({x:side*(L+6.6),z:along/42*W,angle:-side*Math.PI/2,ad:i%3,edge:'goal-line'}));
  }
  return boards;
}

function artwork(ad,image){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const c=canvas.getContext('2d');
  c.fillStyle='#0b1c23';c.fillRect(0,0,1024,256);
  const gradient=c.createLinearGradient(0,0,1024,256);gradient.addColorStop(0,'#162933');gradient.addColorStop(1,'#080d13');c.fillStyle=gradient;c.fillRect(5,5,1014,246);
  c.fillStyle=ad.accent;c.fillRect(0,0,680,5);c.fillStyle=ad.secondary;c.fillRect(680,0,344,5);
  if(image){
    // Contain the original full artwork: never crop, stretch or extract its logo.
    const scale=Math.min(216/image.naturalWidth,216/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
    c.drawImage(image,20+(216-w)/2,20+(216-h)/2,w,h);
  }
  c.fillStyle='#ffffff20';c.fillRect(255,34,1,188);
  c.textBaseline='middle';c.textAlign='left';c.fillStyle=ad.accent;c.font='800 60px Arial';c.fillText(ad.headline,291,79,690);
  c.fillStyle='#f4f1e6';c.font='900 62px Arial';c.fillText(ad.subline,290,146,690);
  c.fillStyle='#b6c6cb';c.font='600 19px Arial';c.fillText(ad.footer,293,211,680);
  return canvas;
}

function loadImage(url){
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Could not load '+url));image.src=url;});
}

export class PitchAdvertising{
  constructor(parent){
    this.root=new T.Group();this.root.name='Grass-side advertising';parent.add(this.root);
    this.layout=advertisingLayout();this.textures=ADVERTISEMENTS.map(ad=>{
      const texture=new T.CanvasTexture(artwork(ad));texture.colorSpace=T.SRGBColorSpace;return texture;
    });
    const board=AD_BOARD,frameGeometry=new T.BoxGeometry(1,1,1),frameMaterial=new T.MeshStandardMaterial({color:'#182831',roughness:.79,metalness:.22});
    this.frames=new T.InstancedMesh(frameGeometry,frameMaterial,this.layout.length*3);this.frames.name='Advertising frames and feet';this.frames.receiveShadow=true;
    const parentTransform=new T.Object3D(),part=new T.Object3D(),matrix=new T.Matrix4();let frameIndex=0;
    const frame=(x,y,z,w,h,d)=>{part.position.set(x,y,z);part.scale.set(w,h,d);part.updateMatrix();matrix.multiplyMatrices(parentTransform.matrix,part.matrix);this.frames.setMatrixAt(frameIndex++,matrix);};
    for(const item of this.layout){
      parentTransform.position.set(item.x,0,item.z);parentTransform.rotation.set(0,item.angle,0);parentTransform.updateMatrix();
      frame(0,board.centerY,0,board.width,board.height,board.depth);
      for(const side of [-1,1])frame(side*board.width*.37,.12,board.footZ,.24,.24,board.footDepth);
    }
    this.frames.computeBoundingSphere();this.root.add(this.frames);
    this.faces=this.textures.map((texture,ad)=>{
      const placements=this.layout.filter(item=>item.ad===ad),mesh=new T.InstancedMesh(new T.PlaneGeometry(board.width-.16,board.height-.16),new T.MeshBasicMaterial({map:texture,toneMapped:false}),placements.length);
      mesh.name=ADVERTISEMENTS[ad].label;
      placements.forEach((item,i)=>{
        parentTransform.position.set(item.x,board.centerY,item.z);parentTransform.rotation.set(0,item.angle,0);parentTransform.updateMatrix();
        part.position.set(0,0,board.faceZ);part.scale.set(1,1,1);part.updateMatrix();matrix.multiplyMatrices(parentTransform.matrix,part.matrix);mesh.setMatrixAt(i,matrix);
      });
      mesh.computeBoundingSphere();this.root.add(mesh);return mesh;
    });
    this.ready=Promise.all(ADVERTISEMENTS.map(async(ad,index)=>{
      try{
        const image=await loadImage(new URL('../../'+ad.asset,import.meta.url).href);
        this.textures[index].image=artwork(ad,image);this.textures[index].needsUpdate=true;
      }catch(error){console.warn('Advertising artwork unavailable: '+ad.label,error);}
    }));
  }
  quality(level,maxAnisotropy){
    const anisotropy=Math.min(maxAnisotropy,level==='low'?2:level==='medium'?4:8);
    this.textures.forEach(texture=>{if(texture.anisotropy!==anisotropy){texture.anisotropy=anisotropy;texture.needsUpdate=true;}});
  }
}
