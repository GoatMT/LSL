import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {Player,angleDelta} from '../src/match/player.js';
import {Ball} from '../src/match/ball.js';
import {Match} from '../src/match/match.js';
import {createLineup} from '../src/data.js';
import {FIELD,PLAY,distance} from '../src/config.js';
import {keeperContact,updateKeeper,saveContext} from '../src/match/goalkeeper.js';
import {performSkill} from '../src/match/skills.js';
import {animationPose} from '../src/engine/animations.js';
import {appearanceFor} from '../src/engine/appearance.js';
import {BroadcastCamera} from '../src/engine/camera.js';
import {Settings} from '../src/settings.js';
import { advanceStrike } from '../src/match/striking.js';
import {introStage} from '../src/ui/intro.js';
const data=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url)));
const teams=data.teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(l=>l.id===p.id))};});
const match=()=>{const m=new Match(teams,{duration:3,difficulty:'normal',camera:'medium'},{random:()=>.1});m.resetFormation();m.phase='playing';return m;};
const runner=()=>{const p=new Player({id:'runner',name:'Runner',overall:80},0,5,1);p.x=p.z=0;return p;};
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
test('movement accelerates, retains momentum through reversal, brakes and turns finitely',()=>{
 const p=runner();p.move(1,0,1,1/120,true);assert(p.vx>0&&p.vx<.3);
 for(let i=0;i<120;i++){p.tick(1/120);p.move(1,0,1,1/120,true);}
 assert(p.vx>10);const x=p.x,angle=Math.atan2(p.faceX,p.faceZ);
 p.move(-1,0,1,1/120,true);assert(p.x>x&&p.vx>9);assert(Math.abs(angleDelta(angle,Math.atan2(p.faceX,p.faceZ)))<.10);
 for(let i=0;i<90;i++)p.move(0,0,0,1/120);
 assert(Math.hypot(p.vx,p.vz)<.01);
});
test('jog and sprint dribbles use intermittent touches with a varying ball gap',()=>{
 for(const sprint of [false,true]){
  const p=runner(),b=new Ball();b.take(p);let min=10,max=0;
  for(let i=0;i<480;i++){p.tick(1/120);p.move(1,0,1,1/120,sprint);b.update(1/120);min=Math.min(min,distance(p,b));max=Math.max(max,distance(p,b));}
  assert.equal(b.owner,p);assert(b.touchCount>=6&&b.touchCount<40);assert(max-min>.4);assert(p.x>20);
 }
});
test('a loose ball comes to an exact stop; hard ground bounces lose vertical energy',()=>{
 const b=new Ball();Object.assign(b,{vx:22,vy:-8,y:2,spin:2});let peak=0,stoppedAt=0;
 for(let i=0;i<2400;i++){b.update(1/120);if(b.vy>0)peak=Math.max(peak,b.vy);if(b.vx===0&&b.vz===0&&b.vy===0&&!stoppedAt)stoppedAt=i/120;}
 assert(peak<4);assert(stoppedAt>0&&stoppedAt<15);assert.equal(b.y,FIELD.ballRadius);const x=b.x;b.update(1);assert.equal(b.x,x);
});
test('first touches cushion at the actual contact point instead of attaching to a foot',()=>{
 const p=runner(),b=new Ball();Object.assign(b,{x:.4,z:.45,vx:-24,y:.4});b.take(p);
 assert.equal(b.x,.4);assert.equal(b.z,.45);assert(Math.hypot(b.vx,b.vz)<8);assert.equal(p.action.name,'cushion');
 p.vx=7;p.faceX=0;p.faceZ=1;Object.assign(b,{x:p.x+.4,z:p.z,vx:20});b.take(p);assert.equal(p.action.name,'receive-turn');
});
test('goalkeepers catch in their hands, hold securely and distribute',()=>{
 const m=match(),p=m.players[7];p.cooldown=0;Object.assign(m.ball,{x:p.x,z:p.z,y:1.5,vx:20,lastTouch:m.players[5],shot:{player:m.players[5],team:0}});
 assert(keeperContact(m,p));assert.equal(m.ball.owner,p);assert.equal(m.ball.controlMode,'hands');assert.equal(m.stats[1].saves,1);
 for(let i=0;i<360&&m.ball.owner;i++){p.tick(1/120);advanceStrike(m,1/120);updateKeeper(m,p,1/120);m.ball.update(1/120);if(m.ball.owner)assert.equal(m.ball.y,1.64);}
 assert.equal(m.ball.owner,null);assert.equal(m.stats[1].passes,1);assert(['keeper-roll','keeper-throw','keeper-punt'].includes(p.action.name));
});
test('a hard save parries into play; dive direction follows the actual side of the ball',()=>{
 for(const team of [0,1])for(const side of [-1,1]){
  const m=match(),p=m.active(team)[0],d=m.direction(team);p.cooldown=0;
  Object.assign(m.ball,{x:p.x,z:p.z+side*1.8,y:2,vx:-d*40,lastTouch:m.active(1-team)[5],shot:{team:1-team,player:m.active(1-team)[5]}});
  const ctx=saveContext(p,m.ball);assert.equal(ctx.side,-side*d);keeperContact(m,p);
  assert.equal(m.ball.owner,null);assert(m.ball.vx*d>0);assert.equal(p.action.context.side,ctx.side);assert.equal(p.action.name,'keeper-dive');
  p.tick(.7);assert.equal(p.action.name,'keeper-get-up');assert.equal(p.action.context.side,ctx.side);
 }
});
test('goalkeepers react late to unexpected shots and can be beaten',()=>{
 const m=match(),p=m.players[7];m.random=()=>.99;p.cooldown=0;p.keeperState.reaction=.3;
 Object.assign(m.ball,{x:p.x,z:p.z+2.3,y:2.5,vx:47,lastTouch:m.players[5],shot:{player:m.players[5],team:0}});
 keeperContact(m,p);assert.equal(m.stats[1].saves,0);assert.equal(m.ball.owner,null);assert(m.ball.vx>0);
});
test('contextual skills have cooldowns and do not teleport players',()=>{
 const m=match(),p=m.players[5];m.ball.take(p);p.cooldown=0;
 const pos={x:p.x,z:p.z};performSkill(m,p,{x:-1,z:0,intensity:1});
 assert.equal(distance(p,pos),0);assert(p.action);assert(p.cooldown>0);const a=p.action;performSkill(m,p,{x:0,z:1,intensity:1});assert.equal(p.action,a);
});
test('held pass produces a first-time return but tapping M still selects closest',()=>{
 const m=match(),from=m.players[4],p=m.players[5];m.controlled=p;m.passHeldTime=.3;p.cooldown=0;
 Object.assign(m.ball,{x:p.x+.3,z:p.z,y:.32,vx:12,lock:0,pass:{team:0,from,target:p},lastTouch:from});
 m.collisions(1/120);assert.equal(p.action.name,'first-pass');assert.equal(m.stats[0].completed,1);assert.equal(m.stats[0].passes,1);
});
test('a first-time airborne shot preserves height and selects a volley',()=>{
 const m=match(),p=m.players[5];m.controlled=p;p.cooldown=0;
 Object.assign(m.ball,{x:p.x+.2,z:p.z,y:1.4,vy:-2,vx:10,lock:0});
 m.update(1/120,{...idle,pressed:new Set(['shoot'])});assert.equal(p.action.name,'volley');assert(m.ball.y>1);
});
test('all camera modes keep both corners in view and remain distinct',()=>{
 const heights=[];
 for(const mode of ['low','medium','high','broadcast']){
  for(const aspect of [844/390,1440/900,.8])for(const sign of [-1,1]){
   const m=match();m.settings.camera=mode;m.ball.x=60;m.ball.z=sign*40;m.controlled.x=60;m.controlled.z=sign*40;
   const c=new T.PerspectiveCamera(49,aspect,.2,520),cam=new BroadcastCamera(c);
   for(let i=0;i<300;i++)cam.update(1/60,5,m);c.updateMatrixWorld();
   const point=new T.Vector3(m.ball.x,.32,m.ball.z).project(c);assert(Math.abs(point.x)<.95&&Math.abs(point.y)<.95,JSON.stringify({mode,aspect,point}));
   if(aspect===1440/900&&sign===1)heights.push(c.position.y);
  }
 }
 assert(heights[0]<heights[1]&&heights[1]<heights[2]);assert.notEqual(heights[1],heights[3]);
});
test('camera selection survives refresh and invalid saved values use Medium',()=>{
 let json='{"camera":"wrong"}';const storage={getItem:()=>json,setItem:(_,v)=>json=v},s=new Settings(storage);assert.equal(s.value.camera,'medium');
 for(const mode of ['low','medium','high','broadcast']){s.set('camera',mode);assert.equal(new Settings(storage).value.camera,mode);}
});
test('intro reveals stages, walks to formations and can be skipped without using match time',()=>{
 assert.deepEqual([0,4,8,29,50,55].map(introStage),['stadium','versus','user','cpu','watch','walk']);
 for(const skip of [true,false]){
  const m=new Match(teams,{duration:3,difficulty:'normal'});for(let i=0;i<6480;i++)m.update(1/120,idle);
  const before={x:m.players[1].x,z:m.players[1].z};for(let i=0;i<240;i++)m.update(1/120,idle);assert(distance(before,m.players[1])>1);
  if(skip)m.skipIntro();else for(let i=0;i<481;i++)m.update(1/120,idle);
  assert.equal(m.phase,'restart');assert.equal(m.elapsed,0);assert.equal(m.restart.team,0);
 }
});
test('joint animations are finite, varied, and stable generic appearances use player IDs',()=>{
 const p=runner();const poses=[];
 for(const name of ['short-pass','power-shot','body-feint','step-over','roulette','keeper-dive','keeper-catch','slide-tackle','celebrate-jump','card']){
  p.animate(name,1,{side:-1,high:true});p.tick(.4);const pose=animationPose(p,1);assert(Object.values(pose).every(Number.isFinite));poses.push(JSON.stringify(pose));
 }
 assert.equal(new Set(poses).size,poses.length);assert.deepEqual(appearanceFor('mt'),appearanceFor('mt'));assert.notDeepEqual(appearanceFor('mt'),appearanceFor('another'));
});
