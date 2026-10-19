import * as T from '../../vendor/three.module.js';
import {FIELD} from '../config.js';
import {textTexture} from './models.js';
import {createTurf,createMarkings} from './turf.js';
import {PitchAdvertising} from './advertising.js';

const PALETTE=['#20343f','#345267','#9caaa7','#c49d71','#d9d3bd','#795045','#4b6859','#bec8c5'];
const physical=color=>new T.MeshStandardMaterial({color,roughness:.83,metalness:.06});
const unitBox=new T.BoxGeometry(1,1,1);

// Thousands of seats and repeated architectural pieces share instanced draws.
class VenueBatch{
  constructor(parent){this.parent=parent;this.parts=new Map();}
  box(w,h,d,x,y,z,color,angle=0){if(!this.parts.has(color))this.parts.set(color,[]);this.parts.get(color).push({w,h,d,x,y,z,angle});}
  build(){
    const dummy=new T.Object3D();
    for(const [color,parts] of this.parts){
      const mesh=new T.InstancedMesh(unitBox,physical(color),parts.length);mesh.receiveShadow=true;
      parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.computeBoundingSphere();this.parent.add(mesh);
    }
  }
}

export class Stadium{
  constructor(scene,venue='stadium-one'){
    this.root=new T.Group();this.root.name='Lantern Rush venue';scene.add(this.root);
    this.professional=new T.Group();this.professional.name='Stadium One';this.root.add(this.professional);
    this.detail=new T.Group();this.crowdGroup=new T.Group();this.professional.add(this.detail,this.crowdGroup);
    this.fieldFeatures=new T.Group();this.fieldFeatures.name='White goals and corner flags';this.root.add(this.fieldFeatures);
    this.school=new T.Group();this.school.name='Grenoble Public School';this.root.add(this.school);
    this.nets=[];this.flags=[];this.banners=[];this.lamps=[];this.previousPhase='home';this.crowdReactions=true;this.reactionUntil=0;this.reactionKind='';this.lastReaction=null;
    const L=FIELD.halfLength,W=FIELD.halfWidth;
    this.turf=createTurf();this.pitch=this.turf.pitch;this.markings=createMarkings('#ffffff');this.root.add(this.pitch,this.markings);
    this.buildStadiumOne();this.buildGoalsAndFlags();this.buildSchoolMap();this.setVenue(venue);
  }
  buildStadiumOne(){
    const L=FIELD.halfLength,W=FIELD.halfWidth;
    this.structure=new VenueBatch(this.professional);this.extras=new VenueBatch(this.detail);this.seatBatch=new VenueBatch(this.professional);
    this.structure.box(235,.8,180,0,-.7,0,'#263332');this.structure.box(L*2+18,.10,W*2+16,0,-.07,0,'#345b34');
    this.boardTextures=[textTexture('LSL   /   LANTERN RUSH',{background:'#102a32',color:'#ede1aa',font:38}),textTexture('YOUR LEAGUE. YOUR GAME.',{background:'#d9d5bd',color:'#143638',font:28})];
    for(const side of [-1,1]){this.structure.box(L*2+17,.035,.22,0,.004,side*(W+3.6),'#69716b');this.structure.box(.22,.035,W*2+7.2,side*(L+8.4),.004,0,'#69716b');this.structure.box(L*2+24,.06,5.5,0,-.015,side*(W+8),'#48524f');this.structure.box(5.5,.06,W*2+25,side*(L+13),-.015,0,'#48524f');this.buildStand(side,false);this.buildStand(side,true);this.buildBoards(side);this.screen(side);}
    this.advertising=new PitchAdvertising(this.professional);this.buildTunnel();this.buildBenches();this.buildLights();this.buildCrowd();this.buildSurroundings();
    this.structure.build();this.extras.build();this.seatBatch.build();this.quality('medium');this.score(0,0);
  }
  buildGoalsAndFlags(){const L=FIELD.halfLength,W=FIELD.halfWidth;for(const side of [-1,1]){this.goal(side);for(const zSide of [-1,1])this.cornerFlag(side*L,zSide*W);}}
  buildSchoolMap(){
    const L=FIELD.halfLength,W=FIELD.halfWidth,batch=new VenueBatch(this.school),courtZ=-(W+20);
    const ground=new T.Mesh(new T.PlaneGeometry(300,230),new T.MeshStandardMaterial({color:'#69745e',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(0,-.16,0);ground.receiveShadow=true;this.school.add(ground);
    const asphalt=new T.Mesh(new T.PlaneGeometry(L*2+18,25),new T.MeshStandardMaterial({color:'#858984',roughness:.96}));asphalt.rotation.x=-Math.PI/2;asphalt.position.set(0,-.07,courtZ);asphalt.receiveShadow=true;this.school.add(asphalt);
    const courtLines=[];const seg=(x1,z1,x2,z2)=>courtLines.push(x1,.012,z1,x2,.012,z2);const cx=L+7,cz=courtZ;
    seg(-cx,cz-11,cx,cz-11);seg(cx,cz-11,cx,cz+11);seg(cx,cz+11,-cx,cz+11);seg(-cx,cz+11,-cx,cz-11);seg(0,cz-11,0,cz+11);
    for(const x of [-cx*.72,-cx*.36,0,cx*.36,cx*.72]){for(let i=0;i<40;i++){const a=i*Math.PI/20,b=(i+1)*Math.PI/20;seg(x+4*Math.cos(a),cz+4*Math.sin(a),x+4*Math.cos(b),cz+4*Math.sin(b));}}
    const courtGeometry=new T.BufferGeometry();courtGeometry.setAttribute('position',new T.Float32BufferAttribute(courtLines,3));this.school.add(new T.LineSegments(courtGeometry,new T.LineBasicMaterial({color:'#f8f8f1',transparent:true,opacity:.85})));
    const top=-(W+6),bottom=W+6,left=-(L+6),right=L+6,fenceHeight=3.7;
    const wire=[];const horizontalFence=(a,b,fixed,isZ)=>{for(let y=.35;y<=fenceHeight;y+=.55){if(isZ)wire.push(a,y,fixed,b,y,fixed);else wire.push(fixed,y,a,fixed,y,b);}for(let q=a;q<=b;q+=1.2){if(isZ)wire.push(q,.25,fixed,q,fenceHeight,fixed);else wire.push(fixed,.25,q,fixed,fenceHeight,q);}};
    horizontalFence(left,right,top,true);horizontalFence(left,right,bottom,true);horizontalFence(top,bottom,left,false);horizontalFence(top,bottom,right,false);
    const fenceGeometry=new T.BufferGeometry();fenceGeometry.setAttribute('position',new T.Float32BufferAttribute(wire,3));const fence=new T.LineSegments(fenceGeometry,new T.LineBasicMaterial({color:'#bdc6c0',transparent:true,opacity:.62}));fence.name='School field chain-link fence';this.school.add(fence);
    for(const z of [top,bottom]){for(let x=left;x<=right;x+=8)batch.box(.12,fenceHeight,.12,x,fenceHeight/2,z,'#75827d');batch.box(right-left,.12,.12,0,fenceHeight-.15,z,'#87938d');batch.box(right-left,.08,.08,0,1.2,z,'#75827d');}
    for(const x of [left,right]){for(let z=top;z<=bottom;z+=8)batch.box(.12,fenceHeight,.12,x,fenceHeight/2,z,'#75827d');batch.box(.08,.12,bottom-top,x,fenceHeight-.15,0,'#87938d');}
    batch.box(148,14,18,0,7,-(W+69),'#80644f');batch.box(94,11,15,-68,5.5,-(W+55),'#88705b');batch.box(66,10,14,82,5,-(W+54),'#786b5c');
    for(const x of [-66,-50,-34,-18,-2,14,30,46,62]){batch.box(8,4,.18,x,8.1,-(W+59),'#26383d');batch.box(7.4,3.45,.12,x,8.15,-(W+59.12),'#849a9a');}
    for(const x of [-111,-82,82,111]){batch.box(20,27,20,x,13.5,-(W+103+(Math.abs(x)%3)*4),'#8a8d88');for(let y=5;y<24;y+=4)for(const dx of [-6,0,6])batch.box(2.2,2.6,.16,x+dx,y,-(W+113+(Math.abs(x)%3)*4),'#42525a');}
    const schoolSign=new T.Mesh(new T.PlaneGeometry(25,2.4),new T.MeshBasicMaterial({map:textTexture('GRENOBLE PUBLIC SCHOOL',{background:'#263a32',color:'#ffffff',font:43}),toneMapped:false}));schoolSign.position.set(0,3.1,top-.08);this.school.add(schoolSign);
    batch.build();
    const treePositions=[];for(let x=-L-28;x<=L+28;x+=18){treePositions.push({x,z:-(W+24)});treePositions.push({x,z:W+24});}for(let z=-W-12;z<=W+12;z+=18){treePositions.push({x:-(L+24),z});treePositions.push({x:L+24,z});}
    const trunk=new T.InstancedMesh(new T.CylinderGeometry(.32,.48,3.6,6),physical('#55483b'),treePositions.length),canopy=new T.InstancedMesh(new T.IcosahedronGeometry(2.8,0),physical('#31553a'),treePositions.length),dummy=new T.Object3D();
    treePositions.forEach((item,i)=>{dummy.position.set(item.x,1.8,item.z);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);dummy.position.set(item.x,5,item.z);dummy.scale.set(1,1.05+(i%3)*.13,1);dummy.updateMatrix();canopy.setMatrixAt(i,dummy.matrix);});trunk.computeBoundingSphere();canopy.computeBoundingSphere();trunk.castShadow=true;canopy.castShadow=true;this.school.add(trunk,canopy);
  }
  setVenue(venue){this.venue=venue==='grenoble-ps'?'grenoble-ps':'stadium-one';this.professional.visible=this.venue==='stadium-one';this.school.visible=this.venue==='grenoble-ps';this.markings.material.color.set('#ffffff');}
  buildStand(side,end){
    const L=FIELD.halfLength,W=FIELD.halfWidth,span=end?W*2+10:L*2+22,edge=end?L+14:W+12;
    const place=(along,out,height,w,h,d,color,batch=this.structure)=>end?batch.box(d,h,w,side*out,height,along,color):batch.box(w,h,d,along,height,side*out,color);
    for(let row=0;row<9;row++){
      const out=edge+row*1.4,height=.55+row*.72+(row>4?.65:0);
      if(!end){for(const sign of [-1,1])place(sign*(span/4+3.8),out,height/2,span/2-7.6,height,1.5,'#64706d');}
      else place(0,out,height/2,span,height,1.5,'#64706d');
      const count=Math.floor(span/1.18);
      for(let j=0;j<count;j++){
        const along=(j-(count-1)/2)*1.18;if((!end&&Math.abs(along)<7.8)||j%20<2)continue;
        const color=(j%20===2||j%20===19)?'#a5b7b3':(Math.floor(j/20)+row)%4===0?'#b8c5bf':'#234b55';
        place(along,out,height+.13,.77,.16,.74,color,this.seatBatch);place(along,out+.35,height+.51,.77,.59,.12,color,this.seatBatch);
      }
      if(row===4)place(0,out+1,height+.24,span,.05,.1,'#d6dcd6',this.extras);
    }
    place(0,edge+13.3,4.8,span+1,9.6,.7,'#24363d');place(0,edge-1.8,1.25,span+1,2.5,.55,'#21373d');place(0,edge-1.8,2.52,span+1,.10,.68,'#a0b4b4');
  }
  buildBoards(side){
    const L=FIELD.halfLength,W=FIELD.halfWidth,[dark,light]=this.boardTextures;
    for(let i=0;i<10;i++){
      const x=(i-4.5)*12.7,panel=new T.Mesh(new T.PlaneGeometry(12.3,1.05),new T.MeshBasicMaterial({map:i%3?dark:light}));
      panel.position.set(x,.76,side*(W+6.4));if(side>0)panel.rotation.y=Math.PI;this.professional.add(panel);this.banners.push(panel);
      this.structure.box(12.4,1.35,.25,x,.68,side*(W+6.6),'#101b22');
    }
    for(let i=-3;i<=3;i++){
      const panel=new T.Mesh(new T.PlaneGeometry(10.5,1.05),new T.MeshBasicMaterial({map:i%2?dark:light}));
      panel.position.set(side*(L+9.9),.76,i*11.2);panel.rotation.y=-side*Math.PI/2;this.professional.add(panel);this.banners.push(panel);this.structure.box(.25,1.35,10.6,side*(L+10.1),.68,i*11.2,'#101b22');
    }
  }
  buildTunnel(){
    const z=-FIELD.halfWidth-14;
    for(const side of [-1,1])this.structure.box(.7,5,7,side*5.5,2.5,z,'#1d3038');
    this.structure.box(12,.55,8,0,5.2,z,'#344955');this.structure.box(10.5,5,.2,0,2.5,z-3.8,'#07151c');this.structure.box(10,.06,14,0,.04,z+2,'#405654');
    for(const x of [-4.6,4.6])this.extras.box(.08,3.8,6.5,x,2.3,z,'#cee4e0');
    const sign=new T.Mesh(new T.PlaneGeometry(10.6,1.1),new T.MeshBasicMaterial({map:textTexture('THIS IS YOUR LEAGUE',{background:'#1b333a',color:'#ebe1b8',font:38})}));sign.position.set(0,5.2,z+4.1);this.professional.add(sign);
  }
  buildBenches(){
    const z=-FIELD.halfWidth-4.2;
    for(const x of [-18,18]){
      this.structure.box(11,.2,2.4,x,.10,z,'#444f4c');this.structure.box(11,.12,2.5,x,2.8,z-.25,'#6c939a');
      for(const side of [-1,1])this.extras.box(.09,2.8,.09,x+side*5.4,1.4,z+.8,'#c6d4d2');
      const glass=new T.Mesh(new T.BoxGeometry(11,2.3,.05),new T.MeshStandardMaterial({color:'#8eaaad',transparent:true,opacity:.30,roughness:.26,metalness:.25,depthWrite:false}));glass.position.set(x,1.6,z-1.2);this.detail.add(glass);
      for(let i=0;i<8;i++){this.extras.box(.8,.18,.75,x+(i-3.5)*1.1,.6,z,'#172e3f');this.extras.box(.8,.8,.15,x+(i-3.5)*1.1,1.1,z-.3,'#214858');this.extras.box(.12,.6,.12,x+(i-3.5)*1.1,.3,z,'#bbc6c2');}
      this.extras.box(.7,.8,.7,x+6,.4,z,'#bcd6d0');this.extras.box(.74,.1,.74,x+6,.83,z,'#284f61');
    }
  }
  buildLights(){
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=sx*(FIELD.halfLength+9),z=sz*(FIELD.halfWidth+10);
      this.structure.box(.6,26,.6,x,13,z,'#718790');this.structure.box(7.8,2.4,.45,x,26,z,'#273b48');
      const lamp=new T.Mesh(new T.PlaneGeometry(7.2,1.9),new T.MeshBasicMaterial({color:'#dbe8ef',side:T.DoubleSide}));lamp.position.set(x,26,z-sz*.26);lamp.rotation.y=sz<0?0:Math.PI;lamp.rotation.x=.25;this.professional.add(lamp);this.lamps.push(lamp);
      for(let i=-3;i<=3;i++)this.extras.box(.075,2.1,.08,x+i,26,z-sz*.34,'#84949b');
    }
  }
  screen(side){
    this.scoreTexture||=textTexture('LANTERN RUSH',{width:1024,height:320,font:90});
    const z=side*(FIELD.halfWidth+26),screen=new T.Mesh(new T.PlaneGeometry(18,5.625),new T.MeshBasicMaterial({map:this.scoreTexture}));screen.position.set(0,17,z);if(side>0)screen.rotation.y=Math.PI;this.professional.add(screen);
    this.structure.box(18.5,6,.4,0,17,z+side*.22,'#142a36');for(const x of [-7.5,7.5])this.structure.box(.4,16,.4,x,8,z,'#6f828a');
  }
  buildCrowd(){
    const positions=[],L=FIELD.halfLength,W=FIELD.halfWidth;
    for(let row=0;row<9;row++)for(let j=0;j<128;j++)for(const side of [-1,1])for(const end of [false,true]){
      const span=end?W*2+10:L*2+22,count=Math.floor(span/1.18);if(j>=count||j%20<2)continue;
      const a=(j-(count-1)/2)*1.18;if(!end&&Math.abs(a)<7.8)continue;
      const out=(end?L+14:W+12)+row*1.4,y=.55+row*.72+(row>4?.65:0)+.8;
      positions.push({x:end?side*out:a,y,z:end?a:side*out,color:PALETTE[(j*13+row*7+(end?2:0))%PALETTE.length],skin:['#c39a78','#8d634d','#ad7f5d','#634737'][(j+row)%4]});
    }
    const shuffled=positions.map((p,i)=>({p,key:(i*7919)%104729})).sort((a,b)=>a.key-b.key).map(o=>o.p);this.crowdCount=shuffled.length;
    this.crowd=new T.InstancedMesh(new T.CylinderGeometry(.22,.26,.58,5),physical('#ffffff'),shuffled.length);this.heads=new T.InstancedMesh(new T.SphereGeometry(.145,5,4),physical('#ffffff'),shuffled.length);
    const dummy=new T.Object3D(),color=new T.Color();
    shuffled.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(1,1,1);dummy.updateMatrix();this.crowd.setMatrixAt(i,dummy.matrix);this.crowd.setColorAt(i,color.set(p.color));dummy.position.y+=.43;dummy.updateMatrix();this.heads.setMatrixAt(i,dummy.matrix);this.heads.setColorAt(i,color.set(p.skin));});
    this.crowdGroup.add(this.crowd,this.heads);
  }
  buildSurroundings(){for(let i=0;i<26;i++){const x=(i-13)*13,h=7+(i*7%18);this.extras.box(8+(i%3)*2,h,9,x,h/2,-102-(i%3)*9,'#30454c');}}
  cornerFlag(x,z){
    const pole=new T.Mesh(new T.CylinderGeometry(.035,.035,1.75,6),physical('#ffffff'));pole.position.set(x,.875,z);pole.castShadow=true;this.fieldFeatures.add(pole);
    const flag=new T.Mesh(new T.PlaneGeometry(.72,.45,5,2),new T.MeshStandardMaterial({color:'#ffffff',roughness:.85,side:T.DoubleSide}));flag.position.set(x+.36,1.57,z);flag.userData.original=new Float32Array(flag.geometry.attributes.position.array);this.fieldFeatures.add(flag);this.flags.push(flag);
  }
  goal(side){
    const x=side*FIELD.halfLength,G=FIELD.goalHalf,H=FIELD.goalHeight,D=FIELD.goalDepth,post=FIELD.postRadius,steel=new T.MeshStandardMaterial({color:'#ffffff',metalness:.38,roughness:.28});
    const cylinder=(a,b,radius)=>{const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av),m=new T.Mesh(new T.CylinderGeometry(radius,radius,delta.length(),10),steel);m.position.copy(av.add(bv).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());m.castShadow=true;this.fieldFeatures.add(m);};
    for(const z of [-G,G]){cylinder([x,0,z],[x,H,z],post);cylinder([x,0,z],[x+side*D,0,z],.055);cylinder([x,H,z],[x+side*D,H*.91,z],.05);cylinder([x+side*D,0,z],[x+side*D,H*.91,z],.05);}cylinder([x,H,-G],[x,H,G],post);
    const positions=[],spacing=.38,rows=Math.ceil(H/spacing),columns=Math.ceil(G*2/spacing),depthRows=Math.ceil(D/spacing);
    for(let i=0;i<=columns;i++){const z=-G+i*G*2/columns;positions.push(x,H,z,x+side*D,H*.91,z,x+side*D,H*.91,z,x+side*D,0,z);}
    for(let i=0;i<=rows;i++){const y=i*H/rows;positions.push(x+side*D,y*.91,-G,x+side*D,y*.91,G);for(const z of [-G,G])positions.push(x,y,z,x+side*D,y*.91,z);}
    for(let i=0;i<=depthRows;i++){const a=D*i/depthRows;positions.push(x+side*a,H*(1-.09*i/depthRows),-G,x+side*a,H*(1-.09*i/depthRows),G);for(const z of [-G,G])positions.push(x+side*a,0,z,x+side*a,H*(1-.09*i/depthRows),z);}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));const net=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.55}));net.userData={base:new Float32Array(positions),side,impact:null};this.fieldFeatures.add(net);this.nets.push(net);
  }
  quality(level,anisotropy=8){
    this.level=level;this.detail.visible=level!=='low';this.crowd.count=Math.round(this.crowdCount*(level==='low'?.28:level==='medium'?.63:1));this.heads.count=this.crowd.count;this.heads.visible=level!=='low';
    this.turf.quality(level,anisotropy);this.advertising.quality(level,anisotropy);this.nets.forEach(net=>net.material.opacity=level==='low'?.38:.55);
  }
  setCrowdReactions(value){this.crowdReactions=value!==false;if(!this.crowdReactions){this.crowdGroup.position.y=0;this.crowdGroup.rotation.z=0;}}
  setLighting(name){this.lamps.forEach(l=>l.material.color.set(name==='day'?'#a4b7bd':name==='evening'?'#e5e6d0':'#f1f7ff'));}
  setTeams(teams){
    const old=this.teamTextures||[];this.teamNames=teams.map(t=>t.name.toUpperCase());this.teamTextures=teams.map(t=>textTexture(t.name.toUpperCase(),{background:t.kit,color:'#ffffff',font:33}));
    this.banners.forEach((b,i)=>{b.material.map=i%3===0?this.boardTextures[i%2]:this.teamTextures[i%2];b.material.needsUpdate=true;});old.forEach(t=>t.dispose());this.score(0,0);
  }
  score(a,b){
    const c=this.scoreTexture.image.getContext('2d');c.fillStyle='#0b1e2b';c.fillRect(0,0,1024,320);c.fillStyle='#d8c78e';c.fillRect(32,31,960,4);
    c.textAlign='center';c.textBaseline='middle';c.font='700 30px Arial';c.fillText('LANTERN RUSH  /  STADIUM ONE',512,65);c.fillStyle='#f0f1e8';c.font='800 110px Arial';c.fillText(a+'  :  '+b,512,173);
    c.font='700 22px Arial';c.fillStyle='#aebfc0';c.fillText((this.teamNames||['LANTERN SOCCER LEAGUE']).join('   /   '),512,268,940);this.scoreTexture.needsUpdate=true;
  }
  update(t,match){
    const ball=match?.ball,phase=match?.phase;
    if(this.crowdGroup&&this.crowdReactions&&match?.lastReaction&&match.lastReaction!==this.lastReaction){this.lastReaction=match.lastReaction;this.reactionKind=match.lastReaction.kind;this.reactionUntil=t+1.8;}
    if(this.crowdGroup&&this.crowdReactions&&t<this.reactionUntil){const age=1.8-(this.reactionUntil-t),pulse=Math.sin(age*15)*Math.exp(-age*2.2);this.crowdGroup.position.y=pulse*(this.reactionKind==='GOAL'?.22:.1);this.crowdGroup.rotation.z=pulse*.006;}else if(this.crowdGroup&&(this.crowdGroup.position.y||this.crowdGroup.rotation.z)){this.crowdGroup.position.y=0;this.crowdGroup.rotation.z=0;}
    if(phase==='goal'&&this.previousPhase!=='goal'&&ball){const net=this.nets.find(n=>n.userData.side===Math.sign(ball.x));if(net)net.userData.impact={time:t,z:ball.z,y:Math.min(FIELD.goalHeight,Math.max(.6,ball.y))};}
    if(ball&&Math.abs(ball.x)>FIELD.halfLength+.08&&Math.abs(ball.z)<FIELD.goalHalf+.3&&ball.y<FIELD.goalHeight){const net=this.nets.find(n=>n.userData.side===Math.sign(ball.x));if(net&&(!net.userData.impact||t-net.userData.impact.time>2)&&Math.hypot(ball.vx,ball.vz)>4)net.userData.impact={time:t,z:ball.z,y:ball.y};}
    this.previousPhase=phase;
    for(const net of this.nets){
      const {base,side,impact}=net.userData;if(!impact)continue;const age=t-impact.time,positions=net.geometry.attributes.position;
      for(let i=0;i<base.length;i+=3){const pin=Math.min(1,Math.abs(base[i]-side*FIELD.halfLength)/FIELD.goalDepth),range=Math.hypot((base[i+2]-impact.z)*.5,(base[i+1]-impact.y)*.9);positions.array[i]=base[i]+side*Math.sin(age*19-range*1.7)*Math.exp(-age*2.6)*Math.exp(-range*.27)*.42*pin;}
      positions.needsUpdate=true;if(age>3){positions.array.set(base);net.userData.impact=null;}
    }
    if(this.level!=='low')for(let i=0;i<this.flags.length;i++){const flag=this.flags[i],p=flag.geometry.attributes.position,base=flag.userData.original;for(let j=0;j<base.length;j+=3)p.array[j+2]=Math.sin(t*3.2+base[j]*7+i)*.09*(base[j]+.36)/.72;p.needsUpdate=true;}
  }
}
