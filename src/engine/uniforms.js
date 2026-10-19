import * as T from '../../vendor/three.module.js';

const shirts=new Map();
let fabricNormal;

// Original, woven kit artwork shared by every player wearing the same kit.
export function shirtTexture(kit){
  const key=JSON.stringify(kit),existing=shirts.get(key);
  if(existing){existing.references++;return existing.texture;}
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.fillStyle=kit.primary;c.fillRect(0,0,w,h);
  if(kit.pattern==='gradient'){
    const fade=c.createLinearGradient(0,0,0,h);fade.addColorStop(0,kit.primary);fade.addColorStop(.30,kit.primary);fade.addColorStop(.79,kit.secondary);
    c.fillStyle=fade;c.fillRect(0,0,w,h);
  }
  if(kit.pattern==='stripe'){
    c.fillStyle=kit.secondary;for(const x of [0,128,256])c.fillRect(x-23,0,46,h);
  }
  if(kit.pattern==='sash'){
    c.strokeStyle=kit.secondary;c.lineWidth=20;
    for(let i=-1;i<3;i++){c.beginPath();c.moveTo(i*128-36,450);c.bezierCurveTo(i*128+80,300,i*128-70,220,i*128+110,75);c.stroke();}
  }
  // Shaped side panels, seams and tonal folds read at broadcast distance.
  for(const x of [64,192]){
    const fold=c.createLinearGradient(x-22,0,x+22,0);fold.addColorStop(0,'#00000000');fold.addColorStop(.5,'#00000026');fold.addColorStop(1,'#00000000');
    c.fillStyle=fold;c.fillRect(x-22,0,44,h);c.fillStyle='#ffffff16';c.fillRect(x,25,1,h-45);
  }
  for(let y=2;y<h;y+=4){c.fillStyle=y%8?'#ffffff0a':'#00000008';c.fillRect(0,y,w,1);}
  for(let x=2;x<w;x+=4){c.fillStyle='#ffffff06';c.fillRect(x,0,1,h);}
  c.strokeStyle='#ffffff14';c.lineWidth=1;
  for(let i=0;i<9;i++){const x=i*31;c.beginPath();c.moveTo(x,h-20);c.bezierCurveTo(x-7,h*.72,x+9,h*.62,x+2,h*.4);c.stroke();}
  c.fillStyle=kit.trim||kit.secondary||kit.primary;c.globalAlpha=.75;c.fillRect(0,h-14,w,4);c.globalAlpha=1;
  c.fillStyle='#00000025';c.fillRect(0,h-5,w,3);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  texture.userData.kitKey=key;shirts.set(key,{texture,references:1});return texture;
}

export function releaseShirtTexture(texture){
  const key=texture?.userData.kitKey,item=shirts.get(key);if(!item)return;
  if(--item.references===0){item.texture.dispose();shirts.delete(key);}
}

// A tiny shared normal map adds a fabric highlight without external downloads.
export function fabricNormalTexture(){
  if(fabricNormal)return fabricNormal;
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4;data[i]=128+Math.round(Math.sin(x*Math.PI/2)*18);data[i+1]=128+Math.round(Math.sin(y*Math.PI/2)*18);data[i+2]=253;data[i+3]=255;
  }
  fabricNormal=new T.DataTexture(data,size,size);fabricNormal.wrapS=fabricNormal.wrapT=T.RepeatWrapping;fabricNormal.repeat.set(5,8);fabricNormal.needsUpdate=true;return fabricNormal;
}

export function goalkeeperKit(team=0){
  return team===1?{primary:'#57bbaa',secondary:'#367f81',shorts:'#224449',socks:'#4daea0',trim:'#d9e5dd',pattern:'gradient'}:
    {primary:'#e6c955',secondary:'#bb922e',shorts:'#26333b',socks:'#dbc45c',trim:'#25333c',pattern:'gradient'};
}
export function numberColor(kit){
  const rgb=[1,3,5].map(i=>parseInt(kit.primary.slice(i,i+2),16));
  return kit.pattern==='gradient'||rgb.reduce((a,b)=>a+b,0)<490?'#fff9e8':'#172b42';
}
