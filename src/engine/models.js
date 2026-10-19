import * as T from '../../vendor/three.module.js';
import { shirtTexture,releaseShirtTexture,fabricNormalTexture,numberColor,goalkeeperKit } from './uniforms.js';
import { appearanceFor } from './appearance.js';
import { animationPose } from './animations.js';
import { PLAYER_VISUAL_SCALE } from '../config.js';
import { playerShapes,jointMaterial,part,solid,tailoredTorso } from './player-mesh-parts.js';

function curvedFace(){
  const columns=24,rows=20,width=.27,height=.23,positions=[],uv=[],indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
    const u=x/columns,v=y/rows,px=(u-.5)*width,py=(.5-v)*height,inside=Math.max(.04,1-(px/.185)**2-(py/.221)**2);
    positions.push(px,py,.177*Math.sqrt(inside)+.002);uv.push(u,1-v);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+columns+1;indices.push(a,a+1,b+1,a,b+1,b);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
const shared={face:curvedFace(),back:new T.PlaneGeometry(.37,.48),front:new T.PlaneGeometry(.145,.18),shadow:new T.PlaneGeometry(1.65,1.65),indicator:new T.ConeGeometry(.17,.30,3),ring:new T.RingGeometry(.61,.665,28),bottle:new T.CylinderGeometry(.042,.056,.22,10),bottleCap:new T.CylinderGeometry(.027,.027,.035,10)};
const mat=(color,roughness=.75)=>new T.MeshStandardMaterial({color,roughness,metalness:0});
const waterMaterial=mat('#9bd7db',.3),waterCapMaterial=mat('#f0e7c9',.55);
function mesh(geometry,material,x=0,y=0,z=0,sx=1,sy=sx,sz=sx){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;return m;}
let contactTexture;
function softShadow(){
  if(contactTexture)return contactTexture;
  const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,3,32,32,32);
  g.addColorStop(0,'rgba(2,12,13,.50)');g.addColorStop(.45,'rgba(2,12,13,.24)');g.addColorStop(1,'rgba(2,12,13,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);contactTexture=new T.CanvasTexture(c);return contactTexture;
}
export function textTexture(text,{color='#fff',background='#0a302b',width=512,height=128,font=50}={}){
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
  if(background){ctx.fillStyle=background;ctx.fillRect(0,0,width,height);}ctx.fillStyle=color;ctx.font='900 '+font+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2,width-20);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}
function faceTexture(a){
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
  // Small, almond-shaped features and restrained facial shading, not painted cartoon eyes.
  for(const x of [37,91]){
    ctx.fillStyle='#e5d7c8';ctx.beginPath();ctx.ellipse(x,43,7,3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2c2522';ctx.beginPath();ctx.ellipse(x,43,2.8,3.2,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=a.hair;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-9,33);ctx.quadraticCurveTo(x,29,x+8,32);ctx.stroke();
  }
  ctx.strokeStyle='#633c3088';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(58,50);ctx.lineTo(55,66);ctx.quadraticCurveTo(64,70,69,66);ctx.stroke();
  ctx.strokeStyle='#6d423baa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(53,86);ctx.quadraticCurveTo(64,90,77,85);ctx.stroke();
  if(a.beard){ctx.fillStyle=a.hair;ctx.globalAlpha=.30;ctx.beginPath();ctx.moveTo(20,70);ctx.quadraticCurveTo(28,119,64,121);ctx.quadraticCurveTo(104,119,110,70);ctx.lineTo(92,95);ctx.quadraticCurveTo(65,118,34,95);ctx.fill();ctx.globalAlpha=1;}
  if(a.glasses){ctx.strokeStyle='#242424';ctx.lineWidth=3.5;ctx.strokeRect(22,32,30,22);ctx.strokeRect(76,32,30,22);ctx.beginPath();ctx.moveTo(52,40);ctx.lineTo(76,40);ctx.moveTo(20,37);ctx.lineTo(13,33);ctx.moveTo(106,37);ctx.lineTo(114,33);ctx.stroke();}
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}
function identityTexture(player,color,back){
  const c=document.createElement('canvas');c.width=256;c.height=back?320:256;const ctx=c.getContext('2d');
  const number=player.jersey;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.fillStyle=color;ctx.strokeStyle=color==='#172b42'?'#ffffffaa':'#17232caa';
  if(back){ctx.font='700 27px Arial';ctx.lineWidth=1.3;const name=String(player.name||'').toUpperCase();ctx.strokeText(name,128,35,242);ctx.fillText(name,128,35,242);}
  if(number!==null&&number!==undefined&&number!==''){
    ctx.font='900 '+(back?213:210)+'px Arial';ctx.lineWidth=4;const y=back?187:133;ctx.strokeText(String(number),128,y,245);ctx.fillText(String(number),128,y,245);
  }
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}

export class PlayerModel{
  constructor(player,color,referee=false){
    this.player=player;this.appearance=appearanceFor(player.data);const a=this.appearance;
    this.root=new T.Group();this.orientation=new T.Group();this.body=new T.Group();this.root.add(this.orientation);this.orientation.add(this.body);
    this.details=[];this.fineDetails=[];this.keeper=player.role==='GK'&&!referee;
    const fallback={primary:player.team===1?'#428b7c':'#557b72',secondary:player.team===1?'#36796e':'#45695f',shorts:'#162a31',socks:player.team===1?'#428b7c':'#557b72',trim:'#eee7d2',pattern:'solid'};
    const source=referee?{primary:'#e9d546',secondary:'#dfc831',shorts:'#18272c',socks:'#18272c',trim:'#243438',pattern:'solid'}:
      this.keeper?goalkeeperKit(player.team):typeof color==='string'?{primary:color,secondary:color,shorts:'#162a31',socks:color,trim:'#e7e8d6',pattern:'solid'}:color;
    const kit={...fallback,...(source&&typeof source==='object'?source:{})};
    kit.primary||=fallback.primary;kit.secondary||=kit.primary;kit.shorts||=fallback.shorts;kit.socks||=kit.primary;kit.trim||=fallback.trim;kit.pattern||='solid';
    const sleeve=kit.pattern==='sleeves'?kit.secondary:kit.primary,skin=a.skin,trim=kit.trim||'#e7e5dc';
    this.uniformTexture=shirtTexture(kit);
    this.shirtMaterial=new T.MeshStandardMaterial({map:this.uniformTexture,normalMap:fabricNormalTexture(),normalScale:new T.Vector2(.20,.20),roughness:.89});
    this.torsoGeometry=tailoredTorso(a.bulk);this.body.add(mesh(this.torsoGeometry,this.shirtMaterial,0,1.06,0));
    this.waterBottle=new T.Group();this.waterBottle.visible=false;const bottle=new T.Mesh(shared.bottle,waterMaterial),cap=new T.Mesh(shared.bottleCap,waterCapMaterial);bottle.position.y=.11;cap.position.y=.235;this.waterBottle.add(bottle,cap);this.waterBottle.position.set(.31,1.36,.205);this.body.add(this.waterBottle);
    const waist=[part('limb',kit.shorts,0,.985,0,.25*(1+a.bulk*.28),.23,.14*(1+a.bulk*.25)),part('limb',skin,0,1.85,0,.084,.19,.078)];
    this.body.add(solid(waist));
    const collar=solid([part('collar',trim,0,1.822,0,.12,.11,.105,Math.PI/2),part('box',trim,0,1.73,.157,.012,.115,.006)]);this.body.add(collar);this.details.push(collar);
    // Original league crest and a small kit seam. No copied real-world sponsor marks.
    const crest=solid([part('box',trim,.15,1.61,.181,.065,.088,.008),part('box',kit.primary,.15,1.615,.187,.040,.056,.006)]);this.body.add(crest);this.fineDetails.push(crest);
    this.head=new T.Group();this.head.position.y=1.88;this.body.add(this.head);
    const skull=[part('sphere',skin,0,.176,0,.185,.221,.177)];
    if(a.hairstyle!==4)skull.push(part('cap',a.hair,0,.294,-.006,.189,.122,.18));
    this.head.add(solid(skull));
    const features=[part('sphere',skin,0,.145,.165,.026,.043,.041),part('sphere',skin,-.183,.15,-.005,.033,.055,.03),part('sphere',skin,.183,.15,-.005,.033,.055,.03)];
    const faceForm=solid(features);this.head.add(faceForm);this.details.push(faceForm);
    this.faceTexture=faceTexture(a);this.face=mesh(shared.face,new T.MeshBasicMaterial({map:this.faceTexture,transparent:true,depthWrite:false}),0,.172,.179);this.face.castShadow=false;this.head.add(this.face);this.details.push(this.face);
    const hair=[];
    if(a.hairstyle===0)hair.push(part('sphere',a.hair,.02,.402,.071,.157,.05,.102,0,0,-.12));
    if(a.hairstyle===1)for(let i=0;i<4;i++)hair.push(part('sphere',a.hair,(i-1.5)*.074,.385,.06-i*.014,.068,.053,.093));
    if(a.hairstyle===2)for(let i=0;i<12;i++)hair.push(part('sphere',a.hair,Math.sin(i*2.4)*.142,.37+(i%3)*.016,Math.cos(i*2.4)*.124,.060,.06,.060));
    if(a.hairstyle===3)hair.push(part('sphere',a.hair,0,.39,-.025,.165,.04,.137));
    if(a.hairstyle===5){for(const sign of [-1,1])hair.push(part('sphere',a.hair,sign*.164,.22,.012,.031,.075,.052));}
    if(a.hairstyle==='long'){for(const sign of [-1,1]){hair.push(part('sphere',a.hair,sign*.125,.16,-.105,.065,.19,.082,0,0,sign*-.08));hair.push(part('sphere',a.hair,sign*.157,.105,-.055,.047,.14,.062,0,0,sign*-.1));}} 
    if(hair.length){const detail=solid(hair);this.head.add(detail);this.details.push(detail);}
    this.arms=[];this.elbows=[];this.legs=[];this.knees=[];
    for(const sign of [-1,1]){
      const arm=new T.Group();arm.position.set(sign*(.345+a.bulk*.045),1.68,0);
      const armWidth=1+a.bulk*.34,upper=[part('taper',sleeve,0,-.113,0,.125*armWidth,.254,.126*armWidth),part('limb',skin,0,-.287,0,.083*armWidth,.15,.08*armWidth),part('limb',trim,0,-.231,0,.113*armWidth,.020,.115*armWidth)];
      if(this.keeper)upper.push(part('limb',sleeve,0,-.286,0,.092,.17,.09));
      if(player.data?.leadershipRole==='captain'&&sign<0)upper.push(part('limb','#e7ca54',0,-.177,0,.131,.078,.131));
      arm.add(solid(upper));
      const elbow=new T.Group();elbow.position.y=-.36;
      const forearm=[part('taper',this.keeper?sleeve:skin,0,-.136,0,.072*armWidth,.274,.075*armWidth)];
      if(this.keeper){
        forearm.push(part('sphere','#e5e4d9',0,-.322,.006,.099,.103,.061),part('box','#283c44',0,-.27,.013,.185,.051,.12),part('box','#83b8b0',0,-.322,-.049,.122,.097,.017),part('sphere','#e5e4d9',sign*.091,-.305,.006,.038,.063,.044));
        for(let finger=0;finger<4;finger++)forearm.push(part('sphere','#e5e4d9',(finger-1.5)*.040,-.409,.010,.022,.045,.030));
      }else forearm.push(part('sphere',skin,0,-.312,0,.074*armWidth,.095*armWidth,.048*armWidth));
      elbow.add(solid(forearm));arm.add(elbow);this.body.add(arm);this.arms.push(arm);this.elbows.push(elbow);
      const leg=new T.Group();leg.position.set(sign*(.147+a.bulk*.018),1.00,0);
      leg.add(solid([part('taper',kit.shorts,0,-.12,0,.151*(1+a.bulk*.38),.29,.154*(1+a.bulk*.34)),part('taper',player.data.staff?kit.shorts:skin,0,-.331,0,.104*(1+a.bulk*.24),.18,.104*(1+a.bulk*.24))]));
      const knee=new T.Group();knee.position.y=-.437;
      const boot=player.data.staff?'#25333a':a.boots||'#25333a';
      knee.add(solid([part('sphere',player.data.staff?kit.shorts:skin,0,-.004,0,.098,.108,.099),part('taper',kit.socks,0,-.213,0,.094*(1+a.bulk*.20),.389,.095*(1+a.bulk*.18)),part('limb',player.data.staff?kit.shorts:trim,0,-.06,0,.097,.019,.099),part('sphere',boot,0,-.415,.078,.119,.087,.221),part('sphere','#30373a',0,-.468,.083,.12,.024,.218)]));
      const details=[];
      for(let i=0;i<3;i++)details.push(part('box','#d4d7d1',0,-.356,.06+i*.028,.074,.006,.009));
      for(let i=0;i<6;i++)details.push(part('limb',trim,i%2?.07:-.07,-.495,-.04+Math.floor(i/2)*.12,.015,.027,.015));
      details.push(part('box',trim,sign*.108,-.402,.105,.01,.024,.16,0,sign*.06,-sign*.15));
      const bootDetails=solid(details);knee.add(bootDetails);this.fineDetails.push(bootDetails);
      leg.add(knee);this.body.add(leg);this.legs.push(leg);this.knees.push(knee);
    }
    this.identityTextures=[];
    if(!referee&&!player.data.staff){
      const color=numberColor(kit),back=identityTexture(player,color,true);this.identityTextures.push(back);
      const backNumber=mesh(shared.back,new T.MeshBasicMaterial({map:back,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),0,1.45,-.184);backNumber.rotation.y=Math.PI;backNumber.castShadow=false;this.body.add(backNumber);
      // Missing source numbers remain blank. The data audit records them for development.
      if(player.jersey!==null&&player.jersey!==undefined&&player.jersey!==''){
        const front=identityTexture(player,color,false);this.identityTextures.push(front);
        const frontNumber=mesh(shared.front,new T.MeshBasicMaterial({map:front,transparent:true,depthWrite:false}),-.116,1.49,.188);frontNumber.castShadow=false;this.body.add(frontNumber);
      }
    }
    this.shadow=new T.Mesh(shared.shadow,new T.MeshBasicMaterial({map:softShadow(),transparent:true,depthWrite:false}));this.shadow.rotation.x=-Math.PI/2;this.shadow.position.y=.028;this.root.add(this.shadow);
    this.indicator=mesh(shared.indicator,new T.MeshBasicMaterial({color:'#e8f499'}),0,2.81,0);this.indicator.rotation.z=Math.PI;this.indicator.castShadow=false;this.root.add(this.indicator);
    this.ring=new T.Mesh(shared.ring,new T.MeshBasicMaterial({color:'#e8f499',side:T.DoubleSide,transparent:true,opacity:.84}));this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.04;this.root.add(this.ring);
    this.setVisualScale(PLAYER_VISUAL_SCALE.desktop);
    if(referee){this.card=mesh(playerShapes.box,new T.MeshBasicMaterial({color:'#ffe24b'}),0,-.34,.015,.18,.27,.025);this.card.visible=false;this.elbows[0].add(this.card);}
    this.pose=null;this.lastQuality=null;
  }
  setVisualScale(scale){const a=this.appearance;this.root.scale.set(scale*a.build,scale*a.height,scale*a.build);}
  update(time,controlled=false,dt=1/60,quality='medium',cameraDistance=0){
    const p=this.player;this.root.visible=!p.sentOff;if(p.sentOff)return;
    this.root.position.set(p.x,0,p.z);this.orientation.rotation.y=Math.atan2(p.faceX,p.faceZ);
    this.indicator.visible=this.ring.visible=controlled;
    const near=quality!=='low'&&cameraDistance<(quality==='high'?44:28),close=quality==='high'&&cameraDistance<32;
    this.details.forEach(detail=>detail.visible=near);this.fineDetails.forEach(detail=>detail.visible=close);
    if(this.lastQuality!==quality){this.shirtMaterial.normalMap=quality==='low'?null:fabricNormalTexture();this.shirtMaterial.needsUpdate=true;this.lastQuality=quality;}
    const target=animationPose(p,time),blend=1-Math.exp(-Math.min(dt,.1)*(p.striking?38:23));
    if(!this.pose)this.pose={...target};else for(const key of Object.keys(target))this.pose[key]+=(key==='yaw'?Math.atan2(Math.sin(target[key]-this.pose[key]),Math.cos(target[key]-this.pose[key])):target[key]-this.pose[key])*blend;
    const q=this.pose;this.body.position.set(q.x,q.y,0);this.body.rotation.set(q.pitch,q.yaw,q.roll);this.head.rotation.set(q.headPitch,q.headYaw,0);
    this.waterBottle.visible=['bench-drink','team-drink'].includes(p.action?.name);this.waterBottle.position.y=1.36+(this.waterBottle.visible?Math.sin(time*4+p.slot)*.012:0);this.waterBottle.rotation.z=this.waterBottle.visible?-.24:0;
    this.arms[0].rotation.set(q.laX,q.laY,q.laZ);this.arms[1].rotation.set(q.raX,q.raY,q.raZ);this.elbows[0].rotation.x=-q.le;this.elbows[1].rotation.x=-q.re;
    this.legs[0].rotation.set(q.llX,0,q.llZ);this.legs[1].rotation.set(q.rlX,0,q.rlZ);this.knees[0].rotation.x=q.lk;this.knees[1].rotation.x=q.rk;
    this.shadow.scale.setScalar(1+Math.max(0,q.y)*.24);this.shadow.material.opacity=Math.max(.2,1-Math.max(0,q.y)*.35);
    if(this.card){this.card.visible=p.action?.name==='card'&&!!p.cardColor;if(p.cardColor)this.card.material.color.set(p.cardColor);}
  }
  dispose(){
    const materials=new Set(),geometries=new Set(),sharedGeometry=new Set([...Object.values(shared),...Object.values(playerShapes)]);
    this.root.traverse(o=>{if(o.isMesh){if(!sharedGeometry.has(o.geometry))geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m!==jointMaterial&&m!==waterMaterial&&m!==waterCapMaterial)materials.add(m);});}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.identityTextures.forEach(t=>t.dispose());releaseShirtTexture(this.uniformTexture);this.faceTexture.dispose();
  }
}
export function createBallMesh(){
  const ball=new T.Group();ball.add(mesh(new T.SphereGeometry(.32,20,16),mat('#f0efe5',.56)));
  const phi=(1+Math.sqrt(5))/2,directions=[];
  for(const a of [-1,1])for(const b of [-1,1])directions.push([0,a,b*phi],[a,b*phi,0],[b*phi,0,a]);
  const vertices=[],normals=[],axis=new T.Vector3(0,0,1),q=new T.Quaternion();
  for(const d of directions){
    const center=new T.Vector3(...d).normalize();q.setFromUnitVectors(axis,center);
    for(let i=0;i<5;i++)for(const k of [-1,i+1,i]){
      const v=k<0?center.clone():new T.Vector3(Math.sin(k/5*Math.PI*2)*.096,Math.cos(k/5*Math.PI*2)*.096,.32).applyQuaternion(q).normalize();
      normals.push(v.x,v.y,v.z);v.multiplyScalar(.322);vertices.push(v.x,v.y,v.z);
    }
  }
  const panels=new T.BufferGeometry();panels.setAttribute('position',new T.Float32BufferAttribute(vertices,3));panels.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  ball.add(mesh(panels,mat('#162530',.60)));
  return ball;
}
