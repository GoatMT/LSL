import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {mobileLens} from '../src/engine/viewport.js';
import {GameRenderer} from '../src/engine/renderer.js';
import {BroadcastCamera} from '../src/engine/camera.js';

test('phone lens caps wide-angle distortion while preserving central field coverage',()=>{
  for(const aspect of [320/568,390/844,844/390,932/430,3.1])for(const base of [44,49,52,59]){
    const lens=mobileLens(base,aspect),rad=Math.PI/180;
    const horizontal=2*Math.atan(Math.tan(lens.fov*rad/2)*aspect)/rad;
    assert(horizontal<=76.001);assert(lens.fov<=52);
    const before=Math.tan(base*rad/2),after=Math.tan(lens.fov*rad/2)*lens.distanceScale;assert(Math.abs(before-after)<1e-10);
  }
});
test('canvas sizing keeps projection and drawing buffer synchronized through rotation and toolbar changes',()=>{
  const g=Object.create(GameRenderer.prototype),canvas={clientWidth:844,clientHeight:390},sizes=[];
  Object.assign(g,{canvas,camera:new T.PerspectiveCamera(49,1,.2,520),broadcast:{},quality:'low',adaptiveScale:1,models:[],renderer:{setPixelRatio(){},setSize(w,h){sizes.push([w,h]);}}});
  for(const [w,h]of [[844,390],[390,844],[390,760],[932,430],[852,393]]){
    canvas.clientWidth=w;canvas.clientHeight=h;assert(g.resize());assert.equal(g.camera.aspect,w/h);assert.deepEqual(sizes.at(-1),[w,h]);
    // A camera-facing square must remain square after projection into CSS pixels.
    g.camera.position.set(0,0,10);g.camera.lookAt(0,0,0);g.camera.updateMatrixWorld();
    const a=new T.Vector3(-1,1,0).project(g.camera),b=new T.Vector3(1,-1,0).project(g.camera);
    assert(Math.abs(Math.abs(b.x-a.x)*w-Math.abs(a.y-b.y)*h)<1e-8);
    const count=sizes.length;assert.equal(g.resize(),false);assert.equal(sizes.length,count,'Stable frames must not reallocate the buffer');
  }
});
test('render synchronizes resized canvas even when no window resize event is delivered',()=>{
  const g=Object.create(GameRenderer.prototype);let synced=false,rendered=false;
  Object.assign(g,{time:0,models:[],resize(){synced=true;},sidelineOverlay:{update(){}},broadcast:{update(){assert(synced);}},lighting:{update(){}},weather:{update(){}},sidelineCast:{update(){}},renderer:{render(){rendered=true;}}});
  g.render(1/60,null);assert(rendered);
});
test('phone quality adapts to sustained low frame rate without repeated buffer resizing',()=>{
  const g=Object.create(GameRenderer.prototype);let resizes=0;Object.assign(g,{compact:true,adaptiveScale:1,resize(){resizes++;}});
  for(let i=0;i<240;i++)g.adaptPerformance(35,1/60);assert(g.adaptiveScale<1);assert.equal(resizes,1);
  for(let i=0;i<300;i++)g.adaptPerformance(60,1/60);assert.equal(resizes,1);
});
test('Mobile Cam preserves a visible ball during fast moves on wide and portrait phones',()=>{
  for(const aspect of [844/390,3.1,390/844]){
    const camera=new T.PerspectiveCamera(49,aspect,.2,520),view=new BroadcastCamera(camera);view.compact=true;
    const m={phase:'playing',settings:{camera:'mobile'},ball:{x:0,z:0,y:.32,vx:0,vz:0},controlled:{x:0,z:0,team:0},active:()=>[]};
    for(let i=0;i<240;i++)view.update(1/60,i/60,m);
    for(let i=0;i<180;i++){m.ball.x=Math.sin(i/60)*26;m.ball.z=Math.cos(i/60)*20;Object.assign(m.controlled,{x:m.ball.x,z:m.ball.z});view.update(1/60,i/60,m);camera.updateMatrixWorld();const v=new T.Vector3(m.ball.x,.32,m.ball.z).project(camera);assert(Math.abs(v.x)<1&&Math.abs(v.y)<1);}
  }
});
