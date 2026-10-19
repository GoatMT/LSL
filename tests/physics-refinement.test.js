import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Ball } from '../src/match/ball.js';
import { Match } from '../src/match/match.js';
import { ballIntercept } from '../src/match/ai.js';
import { passSpeed,predictBall } from '../src/match/physics.js';
import { goalFrameCollision,boundaryEvent } from '../src/match/rules.js';
import { playerContact } from '../src/match/contacts.js';
import { createLineup } from '../src/data.js';
import { FIELD,PLAY,distance } from '../src/config.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>({...t,lineup:createLineup(t.roster),bench:[]}));
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
function match(){const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});m.resetFormation();m.phase='playing';m.players.forEach(p=>{p.cooldown=0;p.sentOff=true;});return m;}
const energy=b=>(b.vx*b.vx+b.vz*b.vz+b.vy*b.vy)*.5+PLAY.gravity*(b.y-FIELD.ballRadius);

test('rolling distances agree at 30, 60 and 120 Hz and stop permanently',()=>{
  for(const speed of [1,5,20,40]){
    const distances=[];
    for(const hz of [30,60,120]){
      const b=new Ball();b.vx=speed;
      for(let i=0;i<hz*15;i++)b.integrate(1/hz);
      assert.equal(b.vx,0);distances.push(b.x);const stopped=b.x;b.integrate(30);assert.equal(b.x,stopped);
    }
    assert(Math.max(...distances)-Math.min(...distances)<1e-7,JSON.stringify({speed,distances}));
  }
});

test('bounces lose energy and prediction follows the actual curved flight and landing',()=>{
  const b=new Ball();Object.assign(b,{x:2,z:3,y:4,vx:27,vz:5,vy:6,spin:9});
  const predicted=predictBall(b,1.5);let previous=energy(b),bounced=false;
  for(let i=0;i<180;i++){const vy=b.vy;b.integrate(1/120);if(vy<0&&b.vy>=0)bounced=true;assert(energy(b)<=previous+1e-6);previous=energy(b);}
  assert(bounced);assert(distance(b,predicted)<.03);assert(Math.abs(b.y-predicted.y)<1e-5);
  const slow=new Ball();slow.vx=.7;const target=ballIntercept(slow,1);slow.integrate(1);assert(Math.abs(target.x-slow.x)<1e-8);assert(target.x<.1);
});

test('distance-matched ground passes arrive quickly but at a controllable speed',()=>{
  for(const length of [6,20,45,65]){
    const arrival=Math.min(10,5+length*.07),b=new Ball();b.vx=passSpeed(length,arrival);let time=0;
    while(b.x<length&&time<6){b.integrate(1/240);time+=1/240;}
    assert(b.x>=length);assert(time<4.4);assert(Math.abs(b.vx-arrival)<.15,JSON.stringify({length,time,speed:b.vx,arrival}));
  }
});

test('posts reflect by impact side and never add energy at either goal',()=>{
  for(const goal of [-1,1])for(const wing of [-1,1])for(const offset of [-.25,.25]){
    const b=new Ball(),x=goal*FIELD.halfLength,z=wing*FIELD.goalHalf+offset;
    Object.assign(b,{x:x+goal,y:1,z,vx:goal*45,vz:0});const before=energy(b);
    assert(goalFrameCollision(b,{x:x-goal,y:1,z}));assert(b.vx*goal<0);assert(b.vz*offset>0);assert(energy(b)<before);
    assert.equal(goalFrameCollision(b,{x:b.x,y:b.y,z:b.z}),false,'No repeated collision while leaving a post');
  }
});

test('underside and top of the crossbar rebound down and up; clear shots miss the frame',()=>{
  for(const side of [-1,1])for(const offset of [-.25,.25]){
    const b=new Ball(),x=side*FIELD.halfLength,y=FIELD.goalHeight+offset;
    Object.assign(b,{x:x+side,y,z:0,vx:side*45});assert(goalFrameCollision(b,{x:x-side,y,z:0}));assert(b.vy*offset>0);
  }
  const b=new Ball();Object.assign(b,{x:65,y:FIELD.goalHeight+.5,z:0,vx:45});assert.equal(goalFrameCollision(b,{x:63,y:b.y,z:0}),false);
});

test('a fast teammate pass cannot tunnel through its receiver between updates',()=>{
  const m=match(),p=m.players[5],from=m.players[4];p.sentOff=false;p.x=p.z=0;m.controlled=p;
  Object.assign(m.ball,{x:4,z:0,y:.32,vx:42,lock:0,lastTouch:from,pass:{team:0,from,target:p}});
  assert(m.collisions(.2,{x:-4,y:.32,z:0}));assert.equal(m.ball.owner,p);assert(distance(p,m.ball)<1.1);
  assert(Math.hypot(m.ball.vx,m.ball.vz)<2.2);assert.equal(m.stats[0].completed,1);
});

test('moving player interception follows both paths without catching overhead balls',()=>{
  const p={x:0,z:2,previousX:0,previousZ:-2};
  assert(playerContact(p,{x:-2,y:.32,z:0},{x:2,y:.32,z:0},1,1.12,0,true));
  assert.equal(playerContact(p,{x:-2,y:4,z:0},{x:2,y:4,z:0},1,1.12,0,true),null);
});

test('blocks absorb speed and follow the contact normal on either attacking side',()=>{
  for(const direction of [-1,1]){
    const m=match(),p=m.players[12],from=m.players[5];p.sentOff=false;p.x=p.z=0;
    Object.assign(m.ball,{x:direction*4,z:.3,y:.32,vx:direction*50,lock:0,lastTouch:from});const before=energy(m.ball);
    assert(m.collisions(.16,{x:-direction*4,z:.3,y:.32}));assert.equal(m.ball.owner,null);assert.equal(m.ball.lastTouch,p);
    assert(m.ball.vx*direction<0);assert(m.ball.vz>0);assert(energy(m.ball)<before*.6);assert.equal(p.tackles,1);
  }
});

test('a reachable save happens before a goal crossing later in the same update',()=>{
  const m=match(),keeper=m.players[0],shooter=m.players[12];keeper.sentOff=false;m.controlled=keeper;m.manualKeeper=true;
  Object.assign(keeper,{x:-62.8,z:0,faceX:1,faceZ:0});
  Object.assign(m.ball,{x:-60,y:1,z:0,vx:-48,vy:0,lock:0,lastTouch:shooter,shot:{player:shooter,team:1,counted:false}});
  m.update(.12,idle);assert.equal(m.stats[1].goals,0);assert.equal(m.stats[0].saves,1);assert.equal(m.phase,'playing');assert(m.ball.vx>0||m.ball.owner===keeper);
});

test('a touch after the whole ball leaves play cannot cancel the awarded restart',()=>{
  const m=match(),p=m.players[12];p.sentOff=false;p.x=67;p.z=20;
  Object.assign(m.ball,{x:68,y:.32,z:20,vx:40,lock:0,lastTouch:m.players[5]});const previous={x:63,y:.32,z:20};
  const boundary=boundaryEvent(m.ball,previous,[1,-1]);assert.equal(boundary.type,'GOAL KICK');
  assert.equal(m.collisions(.125,previous,boundary.time),false);assert.equal(m.ball.lastTouch.team,0);
});

test('body contact resolves exact overlap and removes opposing inward momentum',()=>{
  const m=match(),a=m.players[5],b=m.players[12];a.sentOff=b.sentOff=false;
  Object.assign(a,{x:0,z:0,vx:7,vz:0});Object.assign(b,{x:0,z:0,vx:-7,vz:0});
  m.separatePlayers();assert(distance(a,b)>=.819);assert(Number.isFinite(a.vx+b.vx));
  const dx=b.x-a.x,dz=b.z-a.z;assert((a.vx-b.vx)*dx+(a.vz-b.vz)*dz<=0);
});

test('a new first touch is protected from automatic and AI tackles briefly',()=>{
  const m=match(),receiver=m.players[12],defender=m.players[5];receiver.sentOff=defender.sentOff=false;
  Object.assign(receiver,{x:0,z:0,faceX:1,faceZ:0});Object.assign(defender,{x:1.2,z:0,cooldown:0});m.controlled=defender;m.ball.reset(.3,0);m.claim(receiver);
  assert.equal(m.autoSteal(defender),false);m.tackle(defender,{standing:true});assert.equal(m.ball.owner,receiver);
  m.ball.lock=0;assert.equal(m.autoSteal(defender),true);assert.equal(m.ball.owner,defender);
});
