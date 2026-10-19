import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import { Match } from '../src/match/match.js';
import { createLineup } from '../src/data.js';
import { Settings } from '../src/settings.js';
import { BroadcastCamera } from '../src/engine/camera.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>({...t,lineup:createLineup(t.roster),bench:[]}));
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
function match(){const m=new Match(teams,{duration:3,difficulty:'normal',camera:'mobile'},{random:()=>.99});m.resetFormation();m.phase='playing';return m;}
test('a controlled defender steals an exposed ball without any button input',()=>{
  const m=match(),p=m.controlled,opponent=m.players[12];m.players.forEach((o,i)=>{o.x=40+i;o.z=30;});
  Object.assign(p,{x:1.2,z:0,faceX:-1,faceZ:0,cooldown:0});Object.assign(opponent,{x:0,z:0,faceX:1,faceZ:0});m.ball.reset(.3,0);m.ball.take(opponent);m.switchCooldown=5;
  m.update(1/120,idle);assert.equal(m.ball.owner,p);assert.equal(p.tackles,1);assert(p.cooldown>0);assert.notEqual(p.action?.name,'slide-tackle');
});
test('automatic steals respect reach, protection, cooldown, restarts and keeper catches',()=>{
  for(const condition of ['far','behind','cooldown','high','hands','own','restart','paused']){
    const m=match(),p=m.controlled,other=m.players[12];Object.assign(p,{x:1.2,z:0,cooldown:0});Object.assign(other,{x:0,z:0,faceX:1,faceZ:0});m.ball.reset(.3,0);m.ball.take(other);
    if(condition==='far')p.x=5;if(condition==='behind')p.x=-.3;if(condition==='cooldown')p.cooldown=.4;if(condition==='high')m.ball.y=2;
    if(condition==='hands')m.ball.controlMode='hands';if(condition==='own')m.ball.take(p);if(condition==='restart')m.phase='restart';if(condition==='paused')m.paused=true;
    assert.equal(m.autoSteal(p),false,condition);assert.equal(p.tackles,0,condition);
  }
});
test('Mobile Cam is the new touch default, persists and preserves saved camera choices',()=>{
  const previous=globalThis.matchMedia;try{
    globalThis.matchMedia=()=>({matches:true});let json=null;const storage={getItem:()=>json,setItem:(_,v)=>json=v};let s=new Settings(storage);assert.equal(s.value.camera,'mobile');
    s.set('camera','broadcast');assert.equal(new Settings(storage).value.camera,'broadcast');s.set('camera','mobile');assert.equal(new Settings(storage).value.camera,'mobile');
    globalThis.matchMedia=()=>({matches:false});assert.equal(new Settings({getItem:()=>null,setItem:()=>{}}).value.camera,'broadcast');
    json=JSON.stringify({camera:'mobile',keys:{steal:'KeyL',pass:'KeyM',goalie:'KeyG'},controlsVersion:2});s=new Settings(storage);assert(!('steal' in s.value.keys));assert.equal(s.value.keys.pass,'KeyM');
  }finally{if(previous===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previous;}
});
function camera(m,aspect){const c=new T.PerspectiveCamera(49,aspect,.2,520),view=new BroadcastCamera(c);view.compact=true;for(let i=0;i<300;i++)view.update(1/60,i/60,m);c.updateMatrixWorld();return c;}
test('Mobile Cam keeps all pitch corners and both penalty ends in frame on phones',()=>{
  for(const aspect of [844/390,390/844,320/568])for(const half of [1,2])for(const x of [-62,62])for(const z of [-40,40]){
    const m=match();m.half=half;m.ball.x=m.controlled.x=x;m.ball.z=m.controlled.z=z;let c=camera(m,aspect),v=new T.Vector3(x,.32,z).project(c);assert(Math.abs(v.x)<.90&&Math.abs(v.y)<.85,JSON.stringify({aspect,x,z,v}));
    m.beginRestart({type:'CORNER',team:0,x,z});c=camera(m,aspect);v=new T.Vector3(x,.32,z).project(c);assert(Math.abs(v.x)<.92&&Math.abs(v.y)<.88);
  }
  for(const aspect of [844/390,390/844])for(const half of [1,2]){const m=match();m.half=half;m.beginRestart({type:'PENALTY',team:0,x:m.direction(0)*48,z:0});const c=camera(m,aspect),v=new T.Vector3(m.ball.x,.32,m.ball.z).project(c);assert(Math.abs(v.x)<.95&&Math.abs(v.y)<.95);}
});
test('Mobile Cam makes players larger while retaining nearby passing options',()=>{
  const m=match(),c=camera(m,844/390),p=m.controlled;const size=cam=>Math.abs(new T.Vector3(p.x,4,p.z).project(cam).y-new T.Vector3(p.x,0,p.z).project(cam).y);
  const mobileSize=size(c);m.settings.camera='broadcast';const broadcast=camera(m,844/390);assert(mobileSize>size(broadcast)*1.1);
  const visible=m.active(0).filter(o=>o!==p&&o.role!=='GK').filter(o=>{const v=new T.Vector3(o.x,1,o.z).project(c);return Math.abs(v.x)<.95&&Math.abs(v.y)<.95;});assert(visible.length>=2,String(visible.length));
});
