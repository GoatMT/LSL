import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Match} from '../src/match/match.js';
import {Settings,DEFAULT_KEYS} from '../src/settings.js';
import {Controls} from '../src/input/controls.js';
import {SKILLS,performSkill} from '../src/match/skills.js';
import {animationPose} from '../src/engine/animations.js';
import {createLineup} from '../src/data.js';
import {FIELD,distance} from '../src/config.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
function match(random=()=>.99){const m=new Match(teams,{duration:3,difficulty:'normal'},{random});m.resetFormation();m.phase='playing';return m;}
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
const cases=[['body-feint',1,0,0,2,0],['step-over',1,0,0,6,0],['double-step',1,0,0,2,.45],['ball-roll',1,0,0,6,.3],['fake-shot',1,0,0,6,0],['drag-back',-1,0,0,6,0],['roulette',-1,0,0,6,.8],['quick-cut',0,1,0,6,0],['directional-touch',0,1,0,6,.8],['stop-go',1,0,0,6,.8],['heel-to-heel',1,0,9,6,0],['close-control',1,0,0,6,.6]];
assert.deepEqual([...cases.map(c=>c[0])].sort(),[...SKILLS].sort());
for(const [name,x,z,speed,gap,roll]of cases)test('move audit: '+name+' executes, animates, retains finite control and respects cooldown',()=>{
  let calls=0;const m=match(()=>calls++===0?roll:.99),p=m.players[5];m.players.forEach(o=>{o.x=40;o.z=30;});
  Object.assign(p,{x:0,z:0,vx:speed,vz:0,faceX:1,faceZ:0,cooldown:0});Object.assign(m.players[12],{x:gap,z:0});m.ball.take(p);p.lastReceive=1;m.charge=name==='fake-shot'?.5:0;
  const pos={x:p.x,z:p.z},aim={x,z,intensity:1};performSkill(m,p,aim);assert.equal(p.action.name,name);assert.equal(distance(p,pos),0);assert.equal(m.ball.owner,p);
  const action=p.action;performSkill(m,p,aim);assert.equal(p.action,action);
  for(let i=0;i<120;i++){p.tick(1/120);p.move(x,z,.45,1/120);m.ball.update(1/120);assert(Object.values(animationPose(p,i/120)).every(Number.isFinite));assert([p.x,p.z,m.ball.x,m.ball.z,m.ball.y].every(Number.isFinite));}
  assert.equal(m.stats[0].shots,0);
});
test('consecutive fake shots both cancel the charged shot instead of changing to a feint',()=>{
  const m=match(),p=m.controlled;m.ball.take(p);
  for(let i=0;i<2;i++){p.cooldown=0;m.charge=.6;performSkill(m,p,{x:1,z:0,intensity:1});assert.equal(p.action.name,'fake-shot');assert(m.cancelShotUntilRelease);m.update(1/120,{...idle,released:new Set(['shoot'])});assert.equal(m.stats[0].shots,0);assert.equal(m.pendingStrike,undefined);}
});
test('keepers hold catches securely against opposing standing and sliding tackles',()=>{
  for(const standing of [true,false]){const m=match(),keeper=m.players[7],opponent=m.controlled;m.ball.take(keeper,{hands:true});Object.assign(opponent,{x:keeper.x-.5,z:keeper.z,vx:12,vz:0,cooldown:0});m.tackle(opponent,{standing});assert.equal(m.ball.owner,keeper);assert.equal(m.ball.controlMode,'hands');keeper.cooldown=0;performSkill(m,keeper);assert.equal(keeper.skillPlan,null);}
});
test('substituting a restart taker cancels their windup and honors presentation time',()=>{
  const m=match();m.beginRestart({type:'KICK OFF',team:0,x:0,z:0});const taker=m.restart.taker;m.phaseTime=m.restart.readyAt+1;m.requestPass(taker);assert(m.pendingStrike);
  m.queueSubstitution(taker.id,m.benches[0][0].id);assert.equal(m.pendingStrike,null);assert.equal(m.ball.owner,taker);assert(taker.hasBall);assert(m.restart.readyAt>m.phaseTime);
  for(let i=0;i<120;i++)m.update(1/120,idle);assert.equal(m.stats[0].passes,0);assert.equal(m.phase,'restart');
});
test('duplicate and partial saved key maps restore to unique, usable bindings',()=>{
  for(const keys of [{forward:'KeyA',left:'KeyA'},{steal:'KeyG',goalie:'KeyG'}, {sprint:'KeyL',pass:'KeyG'},Object.fromEntries(Object.keys(DEFAULT_KEYS).map(k=>[k,'KeyM']))]){
    const s=new Settings({getItem:()=>JSON.stringify({keys,controlsVersion:2}),setItem:()=>{}});assert.equal(new Set(Object.values(s.value.keys)).size,Object.keys(DEFAULT_KEYS).length);assert(Object.values(s.value.keys).every(Boolean));
  }
});
test('every keyboard action can be pressed, released, rebound and triggered by its new key',()=>{
  const doc=new EventTarget(),win=new EventTarget();globalThis.document=doc;globalThis.addEventListener=win.addEventListener.bind(win);
  const settings=new Settings({getItem:()=>null,setItem:()=>{}}),c=new Controls(settings);c.enabled=true;
  function key(type,code){const e=new Event(type,{cancelable:true});Object.assign(e,{code,repeat:false});win.dispatchEvent(e);}
  for(const action of Object.keys(DEFAULT_KEYS)){
    const code=settings.value.keys[action];key('keydown',code);assert(c.held.has(action));key('keyup',code);assert(c.released.has(action));c.clear();
    c.rebinding=action;key('keydown','KeyN');assert.equal(settings.value.keys[action],'KeyN');key('keyup','KeyN');c.clear();key('keydown','KeyN');assert(c.pressed.has(action));key('keyup','KeyN');c.clear();
  }
  c.down('shoot');win.dispatchEvent(new Event('blur'));assert.equal(c.held.size,0);assert.equal(c.released.size,0);
});
test('shooting, passing, skills, keeper actions and all presentations have finite full-cycle poses',()=>{
  const m=match(),p=m.controlled;
  const actions=['short-pass','firm-pass','long-pass','through-pass','cross','first-pass','backheel','goal-kick','keeper-punt','shot','power-shot','finesse-shot','trivela-shot','side-foot','first-shot','volley','half-volley','driven-shot','long-shot','penalty','free-kick','header','header-pass','trap','cushion','receive-run','receive-turn',...SKILLS,'jockey','block','intercept','shoulder','standing-tackle','slide-tackle','fall','roll-fall','get-up','stumble','recover','keeper-dive','keeper-get-up','keeper-catch','keeper-hold','keeper-cross-catch','keeper-smother','keeper-punch','keeper-block','keeper-roll','keeper-throw','sprint-start','miss','concede','card-reaction','card','applaud','celebrate-slide','celebrate-jump','celebrate-arms','celebrate-calm','celebrate-point','celebrate-fist','wave'];
  for(const role of ['GK','FWD'])for(const side of [-1,1])for(const name of actions){p.role=role;p.animate(name,.8,{side,high:true,contactAt:.25,aim:{x:1,z:0}});for(let i=0;i<=48;i++){p.action.time=i/60;assert(Object.values(animationPose(p,i/60)).every(Number.isFinite),name);}}
});
