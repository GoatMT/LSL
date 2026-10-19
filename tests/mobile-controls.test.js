import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Controls } from '../src/input/controls.js';
import { MobileControls } from '../src/input/mobile.js';
import { Settings } from '../src/settings.js';
import { Match } from '../src/match/match.js';
import { keeperContact } from '../src/match/goalkeeper.js';
import { createLineup } from '../src/data.js';
import { FIELD } from '../src/config.js';
class Element extends EventTarget{
  constructor(action){super();this.dataset={touch:action};this.style={};this.captures=new Set();this.classes=new Set();this.classList={add:(...s)=>s.forEach(x=>this.classes.add(x)),remove:(...s)=>s.forEach(x=>this.classes.delete(x))};}
  setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
  getBoundingClientRect(){return {left:0,top:0,width:this.dataset.touch?56:112,height:this.dataset.touch?56:112};}
  pointer(type,id,x=28,y=28){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,clientX:x,clientY:y});this.dispatchEvent(e);}
}
function setup(){
  const doc=new EventTarget(),win=new EventTarget(),buttons=['shoot','pass','skill','sprint','goalie'].map(x=>new Element(x)),root=new Element(),pad=new Element(),thumb=new Element();
  root.querySelectorAll=()=>buttons;doc.querySelector=s=>({'#touch-controls':root,'#joystick':pad,'#joystick-thumb':thumb})[s];
  globalThis.document=doc;globalThis.addEventListener=win.addEventListener.bind(win);
  const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},settings=new Settings(storage),controls=new Controls(settings),mobile=new MobileControls(controls);controls.enabled=true;
  return {controls,mobile,settings,storage,root,pad,buttons:Object.fromEntries(buttons.map(b=>[b.dataset.touch,b]))};
}
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>({...t,lineup:createLineup(t.roster),bench:[]}));
test('left joystick is default; mirroring is immediate, saved and clears active fingers',()=>{
  const {controls,mobile,root,pad,settings,storage}=setup();assert.equal(root.dataset.layout,'left');assert.equal(settings.value.holdAutoSwitch,true);
  pad.pointer('pointerdown',8,90,40);settings.set('mobileLayout','right');mobile.applyLayout();assert.equal(root.dataset.layout,'right');assert.deepEqual(controls.joystick,{x:0,z:0});assert.equal(pad.captures.size,0);
  settings.set('holdAutoSwitch',false);const restored=new Settings(storage);assert.equal(restored.value.mobileLayout,'right');assert.equal(restored.value.holdAutoSwitch,false);
  assert.equal(new Settings({getItem:()=>'{"mobileLayout":"broken","holdAutoSwitch":"false"}',setItem:()=>{}}).value.mobileLayout,'left');
});
test('goalkeeper button can be hidden and restored with a persisted control preference',()=>{
  const {settings,mobile,buttons,storage}=setup();assert.equal(buttons.goalie.hidden,false);
  settings.set('mobileGoalieVisible',false);mobile.applyLayout();assert.equal(buttons.goalie.hidden,true);
  const restored=new Settings(storage);assert.equal(restored.value.mobileGoalieVisible,false);
  settings.set('mobileGoalieVisible',true);mobile.applyLayout();assert.equal(buttons.goalie.hidden,false);
});
test('joystick, sprint and charge work simultaneously with proportional 360 degree movement',()=>{
  const {controls,pad,buttons}=setup();pad.pointer('pointerdown',1,70,42);const partial=controls.movement();assert(partial.intensity>0&&partial.intensity<1&&partial.x>0&&partial.z<0);
  buttons.sprint.pointer('pointerdown',2);buttons.shoot.pointer('pointerdown',3);assert(controls.held.has('shoot')&&controls.held.has('sprint'));
  pad.pointer('pointermove',1,120,-10);assert(Math.abs(controls.movement().intensity-1)<1e-9);
  buttons.shoot.pointer('pointerup',3);assert(controls.released.has('shoot')&&controls.held.has('sprint'));assert(controls.movement().intensity>.99);
  pad.pointer('pointerup',1);assert.equal(controls.movement().intensity,0);
});
test('touch buttons and joystick still work when pointer capture is unavailable',()=>{
  const {controls,buttons,pad}=setup();
  for(const element of [...Object.values(buttons),pad]){element.setPointerCapture=undefined;element.hasPointerCapture=undefined;element.releasePointerCapture=undefined;}
  buttons.shoot.pointer('pointerdown',41);assert(controls.held.has('shoot'));
  const release=new Event('pointerup',{cancelable:true});Object.assign(release,{pointerId:41});document.dispatchEvent(release);
  assert(controls.released.has('shoot'));assert.equal(controls.held.has('shoot'),false);
  pad.pointer('pointerdown',42,56,56);
  const move=new Event('pointermove',{cancelable:true});Object.assign(move,{pointerId:42,clientX:90,clientY:56});document.dispatchEvent(move);
  assert(controls.movement().x>.7);
  const stop=new Event('pointerup',{cancelable:true});Object.assign(stop,{pointerId:42});document.dispatchEvent(stop);
  assert.equal(controls.movement().intensity,0);
});
test('two fingers and a keyboard can own the same action without early release',()=>{
  const {controls,buttons}=setup();controls.down('shoot','keyboard:KeyK');buttons.shoot.pointer('pointerdown',1);buttons.shoot.pointer('pointerdown',2);
  buttons.shoot.pointer('pointerup',1);assert(controls.held.has('shoot'));assert(!controls.released.has('shoot'));assert(buttons.shoot.classes.has('held'));
  buttons.shoot.pointer('pointerup',2);assert(controls.held.has('shoot'));controls.up('shoot','keyboard:KeyK');assert(controls.released.has('shoot'));
});
test('canceled charge and lost capture never fire; blur releases all captures',()=>{
  const {controls,buttons,pad}=setup();buttons.shoot.pointer('pointerdown',2);buttons.shoot.pointer('pointercancel',2);
  assert(controls.cancelled.has('shoot'));assert(!controls.released.has('shoot'));buttons.shoot.pointer('lostpointercapture',2);assert(!controls.released.has('shoot'));
  controls.frame();buttons.shoot.pointer('pointerdown',3);buttons.shoot.pointer('lostpointercapture',3);assert(controls.cancelled.has('shoot'));
  buttons.sprint.pointer('pointerdown',4);pad.pointer('pointerdown',5);controls.clear();assert.equal(controls.held.size,0);assert.equal(buttons.sprint.captures.size,0);assert.equal(pad.captures.size,0);
});
test('upward sprint gesture and upper-edge hold arm curves in either press order',()=>{
  for(const order of ['shoot-first','sprint-first']){
    const {controls,buttons}=setup();
    if(order==='shoot-first'){buttons.shoot.pointer('pointerdown',1);buttons.sprint.pointer('pointerdown',2);buttons.sprint.pointer('pointermove',2,28,5);}
    else{buttons.sprint.pointer('pointerdown',2,28,4);buttons.shoot.pointer('pointerdown',1);}
    assert(controls.held.has('curve'));assert(!controls.pressed.has('skill'));assert(buttons.sprint.classes.has('curve-armed'));
    buttons.sprint.pointer('pointerup',2);buttons.shoot.pointer('pointerup',1);assert(controls.released.has('curve')&&controls.released.has('shoot'));
  }
});
test('a single shooting thumb can swipe up; tiny drifts do not request a curve',()=>{
  const {controls,buttons}=setup();buttons.shoot.pointer('pointerdown',1);buttons.shoot.pointer('pointermove',1,28,15);assert(!controls.held.has('curve'));
  buttons.shoot.pointer('pointermove',1,28,-10);assert(controls.held.has('curve'));buttons.shoot.pointer('pointerup',1);assert(controls.released.has('shoot'));assert.equal(controls.held.size,0);
  controls.frame();buttons.sprint.pointer('pointerdown',2);buttons.sprint.pointer('pointermove',2,28,0);assert(controls.pressed.has('skill'));assert(!controls.held.has('curve'));
});
test('a SWITCH tap immediately picks the closest outfielder and holding never cycles',()=>{
  const {controls,buttons}=setup(),m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});
  m.phase='playing';m.restart=null;m.ball.reset(0,0);const [first,second]=m.active(0).filter(p=>p.role!=='GK');
  m.players.forEach((p,i)=>{p.x=35+i;p.z=28;});first.x=-5;first.z=0;second.x=10;second.z=0;m.controlled=second;
  buttons.pass.dataset.mode='switch';buttons.pass.pointer('pointerdown',1);m.update(1/120,controls);
  assert.equal(m.controlled,first,'the tap immediately selects the player closest to the ball');
  controls.frame();m.ball.reset(0,12);m.update(.5,controls);
  assert.equal(m.controlled,first,'holding SWITCH does not repeat or cycle to another player');
  buttons.pass.pointer('pointerup',1);controls.frame();m.ball.reset(10,0);buttons.pass.pointer('pointerdown',2);m.update(1/120,controls);
  assert.equal(m.controlled,second,'a second tap immediately selects the new closest player');
});
test('holding mobile Switch while receiving keeps possession instead of auto-passing',()=>{
  const {controls,buttons}=setup(),m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});m.phase='playing';m.restart=null;
  const p=m.players[5],from=m.players[3];m.controlled=p;m.players.forEach(o=>o.cooldown=5);p.cooldown=0;
  Object.assign(m.ball,{x:p.x,z:p.z,y:.32,vx:2,vz:0,lock:0,owner:null,pass:{team:0,from,target:p}});
  buttons.pass.pointer('pointerdown',1);m.passHeldTime=0;m.collisions(1/120);controls.frame();m.update(.25,controls);
  assert.equal(m.ball.owner,p);assert.equal(m.stats[0].passes,0);
});

test('Switch drags select the keeper once and stop hold-switch repetition',()=>{
  for(const [x,y] of [[28,-2],[28,58],[-2,28]]){
    const {controls,buttons}=setup();buttons.pass.dataset.mode='switch';buttons.pass.pointer('pointerdown',1);controls.frame();
    buttons.pass.pointer('pointermove',1,x,y);assert(controls.pressed.has('goalie'));assert(!controls.held.has('pass'));
    controls.frame();buttons.pass.pointer('pointermove',1,x,y);assert(!controls.pressed.has('goalie'));buttons.pass.pointer('pointerup',1);
  }
});
test('manual goalkeeper selection persists, moves under user input, and toggles back',()=>{
  const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});m.resetFormation();m.phase='playing';m.restart=null;
  const keeper=m.active(0).find(p=>p.role==='GK');m.toggleGoalkeeper();assert.equal(m.controlled,keeper);
  const z=keeper.z;const input={pressed:new Set(),held:new Set(),released:new Set(),movement:()=>({x:0,z:1,intensity:1})};
  for(let i=0;i<12;i++)m.update(1/120,input);assert.equal(m.controlled,keeper);assert(keeper.z>z);
  m.toggleGoalkeeper();assert.notEqual(m.controlled.role,'GK');m.selectPlayer();assert.notEqual(m.controlled.role,'GK');
  m.ball.take(keeper,{hands:true});m.controlled=keeper;m.toggleGoalkeeper();m.selectPlayer();assert.notEqual(m.controlled.role,'GK');
});
test('opponent penalties give the user goalkeeper control, movement and a directional dive',()=>{
  const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});m.resetFormation();m.beginRestart({type:'PENALTY',team:1,x:-55,z:0});
  const keeper=m.active(0).find(p=>p.role==='GK'),input={pressed:new Set(['shoot']),held:new Set(),released:new Set(),movement:()=>({x:0,z:1,intensity:1})};
  m.update(1/120,input);assert.equal(m.controlled,keeper);assert(m.manualKeeper);assert.equal(keeper.keeperState.penaltyDive.side,1);assert(keeper.z>0);assert.equal(keeper.action.name,'keeper-dive');
});
test('penalty keeper saves depend on dive direction and allow a correct-side stop',()=>{
  const build=side=>{const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});m.resetFormation();m.phase='playing';m.inputTeam=1;m.controlled=m.active(1).find(p=>p.role==='GK');m.manualKeeper=true;const keeper=m.controlled,shooter=m.players[5];keeper.cooldown=0;keeper.x=FIELD.halfLength-.7;keeper.z=side===1?1.05:0;keeper.keeperState.penaltyDive={side,height:0,at:0};keeper.animate('keeper-dive',.8,{penalty:true,side});Object.assign(m.ball,{x:FIELD.halfLength-1.7,y:.32,z:1.5,vx:20,vy:0,vz:0,owner:null,lastTouch:shooter,shot:{team:0,player:shooter,setPiece:'PENALTY',counted:false}});return {m,keeper};};
  const wrong=build(-1);assert.equal(keeperContact(wrong.m,wrong.keeper),false);
  const right=build(1);assert.equal(keeperContact(right.m,right.keeper),true);assert.equal(right.m.stats[1].penaltiesSaved,1);
});
test('mobile size and drag-to-position preferences are bounded and restored locally',()=>{
  const {settings,storage}=setup();settings.set('mobileControlScale',1.2);settings.set('mobileControlEdit',true);settings.set('mobileControlPositions',{joystick:{x:42,y:38},actions:{x:12,y:14}});
  const restored=new Settings(storage);assert.equal(restored.value.mobileControlScale,1.2);assert.equal(restored.value.mobileControlEdit,true);assert.deepEqual(restored.value.mobileControlPositions,{joystick:{x:42,y:38},actions:{x:12,y:14}});
  const clamped=new Settings({getItem:()=>'{"mobileControlScale":4,"mobileControlPositions":{"joystick":{"x":900,"y":-4}}}',setItem:()=>{}});assert.equal(clamped.value.mobileControlScale,1.2);assert.deepEqual(clamped.value.mobileControlPositions.joystick,{x:42,y:0});
});
test('standing steal stays standing at sprint speed, wins on time, and can foul',()=>{
  for(const random of [.99,0]){
    const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>random});m.resetFormation();m.phase='playing';
    const p=m.players[5],victim=m.players[12];Object.assign(victim,{x:0,z:0,faceX:1,faceZ:0});Object.assign(p,{x:1,z:0,vx:12,vz:0,cooldown:0});m.ball.take(victim);
    m.tackle(p,{standing:true});assert.notEqual(p.action?.name,'slide-tackle');
    if(random)assert.equal(m.ball.owner,p);else assert.equal(m.stats[0].fouls,1);
  }
});
test('goalkeeper bind persists, retired steal bind is removed, and custom keys remain',()=>{
  const {settings,storage}=setup();assert.equal(settings.value.keys.steal,undefined);assert.equal(settings.value.keys.goalie,'KeyG');
  settings.bind('goalie','KeyB');const restored=new Settings(storage);assert.equal(restored.value.keys.steal,undefined);assert.equal(restored.value.keys.goalie,'KeyB');
  const old=new Settings({getItem:()=>JSON.stringify({controlsVersion:2,keys:{sprint:'KeyL',pass:'KeyG'}}),setItem:()=>{}});
  assert.equal(old.value.keys.sprint,'KeyL');assert.equal(old.value.keys.pass,'KeyG');assert.equal(new Set(Object.values(old.value.keys)).size,Object.keys(old.value.keys).length);
});

test('tiny joystick movements stay neutral, while deliberate motion remains proportional',()=>{
  const {controls,pad}=setup();pad.pointer('pointerdown',1,56,56);pad.pointer('pointermove',1,57,57);assert.equal(controls.movement().intensity,0);
  pad.pointer('pointermove',1,76,56);const small=controls.movement();assert(small.x>0&&small.intensity<1&&small.z===0);
  pad.pointer('pointermove',1,110,56);assert.equal(controls.movement().intensity,1);pad.pointer('pointerup',1);assert.equal(controls.movement().intensity,0);
});
test('rotating the viewport cancels every held finger without accidentally releasing a shot',()=>{
  const {controls,pad,buttons}=setup();pad.pointer('pointerdown',1,80,50);buttons.sprint.pointer('pointerdown',2);buttons.shoot.pointer('pointerdown',3);
  document.dispatchEvent(new Event('game-viewport-changed'));assert.equal(controls.held.size,0);assert.equal(controls.released.size,0);assert.equal(controls.movement().intensity,0);assert.equal(pad.captures.size,0);assert.equal(buttons.shoot.captures.size,0);
  buttons.shoot.pointer('pointerup',3);assert(!controls.released.has('shoot'));
});
