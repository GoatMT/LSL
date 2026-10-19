import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Match } from '../src/match/match.js';
import { Settings } from '../src/settings.js';
import { keeperContact } from '../src/match/goalkeeper.js';
import { updateAI } from '../src/match/ai.js';
import { attackingDecision,defensivePair,chooseShotTarget } from '../src/match/tactics.js';
import { FIELD,DIFFICULTY,distance } from '../src/config.js';
import { createLineup } from '../src/data.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>({...t,lineup:createLineup(t.roster),bench:[]}));
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
function match(difficulty='normal',random=()=>.5){const m=new Match(teams,{difficulty,duration:3},{random});m.resetFormation();m.phase='playing';m.players.forEach(p=>p.cooldown=0);return m;}

test('all four difficulties persist without changing player speed or user teammate difficulty',()=>{
  for(const difficulty of ['easy','normal','hard','insane']){
    let value=null;const store={getItem:()=>value,setItem:(_,v)=>value=v},settings=new Settings(store);settings.set('difficulty',difficulty);
    assert.equal(new Settings(store).value.difficulty,difficulty);const m=match(difficulty),reference=match('normal');
    assert.equal(m.aiConfig(1),DIFFICULTY[difficulty]);assert.equal(m.aiConfig(0),DIFFICULTY.normal);
    assert.equal(m.players[8].attributes.speed,reference.players[8].attributes.speed);
  }
});

test('direct shots at the outer reach boundary almost always save, with easy shots caught',()=>{
  for(const difficulty of Object.keys(DIFFICULTY))for(const half of [1,2]){
    const m=match(difficulty),p=m.players[7];m.half=half;m.resetFormation();const d=m.direction(1);let saves=0;
    for(let i=0;i<100;i++){
      m.ball.reset();p.cooldown=0;p.keeperState.reaction=.1;m.random=()=> (i+.5)/100;
      Object.assign(m.ball,{x:p.x+d*1.24,z:p.z,y:1.6,vx:-d*45,lastTouch:m.players[5],shot:{team:0,player:m.players[5],counted:false}});
      if(keeperContact(m,p))saves++;
    }
    assert(saves>=98,JSON.stringify({difficulty,half,saves}));m.ball.reset();p.cooldown=0;m.random=()=>.99999;
    Object.assign(m.ball,{x:p.x+d*1.24,z:p.z,y:1.1,vx:-d*18,lastTouch:m.players[5]});
    assert(keeperContact(m,p));assert.equal(m.ball.owner,p);assert.equal(m.ball.controlMode,'hands');
  }
});

test('difficult reachable saves improve by difficulty and Insane stops almost all of them',()=>{
  const totals=[];
  for(const difficulty of Object.keys(DIFFICULTY)){
    const m=match(difficulty),p=m.players[7];let saves=0;
    for(let i=0;i<100;i++){
      m.ball.reset();p.cooldown=0;p.keeperState.reaction=0;m.random=()=> (i+.5)/100;
      Object.assign(m.ball,{x:p.x,z:p.z+2.2,y:2.7,vx:43,lastTouch:m.players[5],shot:{team:0,player:m.players[5],counted:false}});
      if(keeperContact(m,p))saves++;
    }
    totals.push(saves);
  }
  for(let i=1;i<totals.length;i++)assert(totals[i]>totals[i-1],String(totals));assert(totals[3]>=95,String(totals));
});

test('two defenders close an advancing attacker while retaining pressure and cover in both halves',()=>{
  for(const difficulty of Object.keys(DIFFICULTY))for(const half of [1,2]){
    const m=match(difficulty);m.half=half;m.resetFormation();const d=m.direction(0),attacker=m.players[5],a=m.players[8],b=m.players[9];
    m.players.forEach(p=>{p.sentOff=![attacker,a,b].includes(p);p.cooldown=100;});m.controlled=attacker;
    Object.assign(attacker,{x:d*32,z:0,faceX:d,faceZ:0});Object.assign(a,{x:d*38,z:2});Object.assign(b,{x:d*42,z:-3});
    m.ball.reset(attacker.x+d*.7,0);m.ball.take(attacker);const start=[{x:a.x,z:a.z},{x:b.x,z:b.z}];
    const move={...idle,movement:()=>({x:d,z:0,intensity:.8})};for(let i=0;i<120;i++)m.update(1/120,move);
    assert.equal(m.phase,'playing');assert(distance(a,start[0])>1);assert(distance(b,start[1])>1);
    const roles=m.defensiveRoles[1];assert(roles.press!==roles.cover);assert(distance(roles.press,m.ball)<4);
    assert((roles.cover.x-attacker.x)*d>1,'Cover stays between the attacker and goal');
  }
});

test('small distance changes do not keep exchanging the pressure and cover roles',()=>{
  const m=match(),a=m.players[8],b=m.players[9];Object.assign(a,{x:5,z:-2});Object.assign(b,{x:5.1,z:2});m.ball.reset(0,0);
  const first=defensivePair(m,1,[a,b],m.ball)[0];
  for(const z of [.2,-.2,.1,-.1]){m.ball.z=z;assert.equal(defensivePair(m,1,[a,b],m.ball)[0],first);}
  first.sentOff=true;assert.notEqual(defensivePair(m,1,[a,b].filter(p=>!p.sentOff),m.ball)[0],first);
});

test('CPU dribbles in space, shoots a clear chance, and passes to escape pressure',()=>{
  const m=match('insane'),p=m.players[12],mate=m.players[11],defender=m.players[5];m.players.forEach(o=>o.sentOff=![p,mate,defender].includes(o));
  Object.assign(p,{x:0,z:0,faceX:-1,faceZ:0});Object.assign(mate,{x:8,z:12});Object.assign(defender,{x:30,z:30});m.ball.reset(-.7,0);m.ball.take(p);p.holdTime=8;
  assert.equal(attackingDecision(m,p,mate),'dribble','A possession timer alone must not force a pass');
  p.x=-52;m.ball.x=-52.7;assert.equal(attackingDecision(m,p,mate),'shoot');
  p.x=0;m.ball.x=-.7;Object.assign(mate,{x:0,z:12});Object.assign(defender,{x:-1.6,z:.8});assert.equal(attackingDecision(m,p,mate),'pass');
  Object.assign(defender,{x:0,z:6});Object.assign(mate,{x:-12,z:0});defender.x=-6;defender.z=0;
  assert.notEqual(attackingDecision(m,p,mate),'pass','Do not force a progressive pass through a blocked lane');
});

test('elite finishing favors the open side of the goalkeeper',()=>{
  const m=match('insane'),p=m.players[12],keeper=m.players[0];m.players.forEach(o=>o.sentOff=![p,keeper].includes(o));
  p.x=-45;p.z=0;keeper.z=5;assert(chooseShotTarget(m,p)<0);keeper.z=-5;assert(chooseShotTarget(m,p)>0);
});

test('midfield surprises are rare once-per-kickoff choices, canceled by lost possession',()=>{
  for(const difficulty of Object.keys(DIFFICULTY)){
    const m=match(difficulty);let armed=0;
    for(let i=0;i<1000;i++){m.random=()=> (i+.5)/1000;m.restart={type:'KICK OFF',team:1};m.finishRestart();if(m.kickoffAttack.armed)armed++;}
    assert(armed>=20&&armed<=75,JSON.stringify({difficulty,armed}));
  }
  const m=match('insane'),p=m.players[12];m.players.forEach(o=>{if(o!==p){o.x=35;o.z=35;}});p.x=p.z=0;m.ball.reset(-.7,0);m.ball.take(p);p.holdTime=1;
  m.kickoffAttack={armed:true,used:false,until:12};assert.equal(attackingDecision(m,p,null),'surprise-shot');assert.notEqual(attackingDecision(m,p,null),'surprise-shot');
  m.kickoffAttack={armed:true,used:false,until:12};m.ball.take(m.players[5]);updateAI(m,1/120);assert.equal(m.kickoffAttack,null);
});

test('Insane completes a full match with finite physics and meaningful attacking attempts',()=>{
  let seed=77;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const m=match('insane',random);m.skipIntro();m.beginRestart({type:'KICK OFF',team:0,x:0,z:0});
  for(let i=0;i<90000&&m.phase!=='fulltime';i++){m.update(1/120,idle);if(m.phase==='halftime')m.continueHalf();}
  assert.equal(m.phase,'fulltime');assert.equal(m.elapsed,180);assert(m.stats[1].shots>0);assert(Number.isFinite(m.ball.x+m.ball.z));
});
