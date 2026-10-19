import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import { FIELD,FORMATION,PLAY,fieldUnits as u,distance } from '../src/config.js';
import { Match } from '../src/match/match.js';
import { Player } from '../src/match/player.js';
import { Ball } from '../src/match/ball.js';
import { updateAI } from '../src/match/ai.js';
import { boundaryEvent,foulRestart } from '../src/match/rules.js';
import { createLineup } from '../src/data.js';
import { createBallMesh } from '../src/engine/models.js';
import { BroadcastCamera } from '../src/engine/camera.js';
const payload=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url)));
const teams=payload.teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
const match=()=>new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.51});
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
const inside=p=>Math.abs(p.x)<=FIELD.halfLength+FIELD.playerMargin+.01&&Math.abs(p.z)<=FIELD.halfWidth+FIELD.playerMargin+.01;

test('playable area is four times larger with 14 normal-sized actors and an unchanged ball',()=>{
  assert(Math.abs(FIELD.halfLength*FIELD.halfWidth/(32*21)-4)<1e-10);
  assert.equal(FIELD.ballRadius,.32);assert.equal(createBallMesh().children[0].geometry.parameters.radius,.32);
  const m=match();assert.equal(m.players.length,14);assert.equal(m.players.filter(p=>p.role==='GK').length,2);
  assert(m.players.every(inside));assert(Math.max(...m.players.map(p=>Math.abs(p.x)))>55);
  assert(distance(m.players[1],m.players[2])>=32);assert(distance(m.players[3],m.players[4])>=48);
  assert.equal(FIELD.goalHalf,u(4.5));assert.equal(FIELD.goalHeight,u(3.2));
});
test('players can traverse the former boundaries with unlimited sprint',()=>{
  const p=new Player({id:'runner',name:'Runner',overall:99},0,5,1);p.x=p.z=0;
  for(let i=0;i<1200;i++)p.move(1,.2,1,1/120,true);
  assert(p.x>32&&p.z>15);assert(p.boosting);assert(inside(p));
  for(let i=0;i<1200;i++)p.move(0,0,0,1/120,false);
  assert.equal(Math.hypot(p.vx,p.vz),0);
  for(let i=0;i<2400;i++)p.move(-1,1,1,1/120,true);
  assert(inside(p));assert(p.z>21);
});
test('sixty-unit passes reach their target quickly and through passes lead farther ahead',()=>{
  const m=match(),p=m.players[1],target=m.players[5];m.phase='playing';
  p.x=-35;p.z=0;target.x=25;target.z=0;target.vx=target.vz=0;
  m.players.forEach(o=>{if(o!==p&&o!==target)o.sentOff=true;});
  m.ball.take(p);m.pass(p,{x:1,z:0});
  assert.equal(m.ball.pass.target,target);assert(m.ball.pass.x-target.x>=u(3));
  let t=0;while(m.ball.x<25&&t<4){m.ball.update(1/120);t+=1/120;}
  assert(m.ball.x>=25);assert(t<3.8);assert(Math.hypot(m.ball.vx,m.ball.vz)>8);
});
test('crosses land near the advertised receiving point instead of falling short',()=>{
  const m=match(),p=m.players[3],target=m.players[5];m.phase='playing';
  p.x=u(24);p.z=FIELD.halfWidth-1;target.x=u(26);target.z=0;
  m.players.forEach(o=>{if(o!==p&&o!==target)o.sentOff=true;});m.ball.take(p);m.pass(p);
  const landing={x:m.ball.pass.x,z:m.ball.pass.z};assert(m.ball.vy>8);
  let airborne=false;for(let i=0;i<600;i++){const falling=m.ball.vy<0;m.ball.update(1/120);if(m.ball.y>2)airborne=true;if(airborne&&falling&&m.ball.vy>=0)break;}
  assert(airborne);assert(distance(m.ball,landing)<3);
});
test('a through-ball receiver makes a forward run and can collect a long pass without a manual switch',()=>{
  const m=match(),p=m.players[1],target=m.players[5];m.phase='playing';
  p.x=-35;p.z=0;target.x=25;target.z=0;m.players.forEach(o=>{if(o!==p&&o!==target)o.sentOff=true;});
  m.ball.take(p);m.pass(p,{x:1,z:0});
  for(let i=0;i<60;i++)m.update(1/120,idle);
  assert(target.x>25,'Receiver should run forward instead of chasing the pass back toward its origin');
  for(let i=0;i<720&&!m.ball.owner;i++)m.update(1/120,idle);
  assert.equal(m.ball.owner,target);assert.equal(m.stats[0].completed,1);
});
test('a strong submaximal long shot reaches the enlarged goal line at useful speed',()=>{
  const m=match(),p=m.players[5];p.x=10;p.z=0;m.phase='playing';m.ball.take(p);m.shoot(p,.90);
  assert(Math.hypot(m.ball.vx,m.ball.vz)>=44&&Math.hypot(m.ball.vx,m.ball.vz)<52);
  let event=null;for(let i=0;i<600&&!event;i++){const prev={...m.ball};m.ball.update(1/120);event=boundaryEvent(m.ball,prev,[1,-1]);}
  assert.equal(event?.type,'GOAL');assert(Math.hypot(m.ball.vx,m.ball.vz)>18);
});
test('all four corners, both touchlines and goal kicks restart at enlarged boundaries in either half',()=>{
  for(const half of [1,2])for(const side of [-1,1])for(const wing of [-1,1]){
    const m=match();m.half=half;const dirs=[m.direction(0),m.direction(1)],attacking=dirs.indexOf(side);
    const prev={x:side*FIELD.halfLength,z:wing*(FIELD.halfWidth-2),y:.32};
    const b={...prev,x:side*(FIELD.halfLength+.6),lastTouch:{team:1-attacking}};
    const corner=boundaryEvent(b,prev,dirs);assert.equal(corner.type,'CORNER');assert.equal(corner.team,attacking);
    assert(Math.abs(corner.x)>FIELD.halfLength-1&&Math.abs(corner.z)>FIELD.halfWidth-1);m.beginRestart(corner);assert(m.players.every(inside));
    m.phaseTime=30;m.update(.01,idle);for(let i=0;i<100&&m.phase==='restart';i++)m.update(1/120,idle);assert.equal(m.phase,'playing');assert(Math.hypot(m.ball.vx,m.ball.vz)>0);
    const gk=boundaryEvent({...b,lastTouch:{team:attacking}},prev,dirs);assert.equal(gk.type,'GOAL KICK');
    m.beginRestart(gk);assert.equal(m.restart.taker.role,'GK');assert(m.players.every(inside));
    const ti=boundaryEvent({x:side*u(25),z:wing*(FIELD.halfWidth+.6),y:.32,lastTouch:{team:attacking}},
      {x:side*u(25),z:wing*FIELD.halfWidth,y:.32},dirs);
    assert.equal(ti.type,'THROW-IN');assert(Math.abs(ti.x)>32);m.beginRestart(ti);assert(m.players.every(inside));
  }
});
test('penalties, free kicks and kickoff clearance follow the new boxes after changing ends',()=>{
  for(const half of [1,2])for(const team of [0,1]){
    const m=match();m.half=half;const dir=m.direction(team),victim=m.active(team)[5];
    victim.x=dir*(FIELD.halfLength-FIELD.boxDepth+.5);victim.z=FIELD.boxHalf-.5;
    const penalty=foulRestart(victim,dir);assert.equal(penalty.type,'PENALTY');assert.equal(penalty.x,dir*(FIELD.halfLength-FIELD.penaltyDistance));
    m.beginRestart(penalty);assert(m.players.every(inside));
    assert(m.active(1-team).filter(p=>p.role==='GK').every(p=>Math.abs(p.x)>FIELD.halfLength-1));
    assert(m.active(team).find(p=>p.role==='GK').x*dir<0);
    victim.x=dir*(FIELD.halfLength-FIELD.boxDepth-1);victim.z=FIELD.halfWidth-1;
    const fk=foulRestart(victim,dir);assert.equal(fk.type,'FREE KICK');assert(Math.abs(fk.x)>32);
    m.beginRestart(fk);assert(m.players.every(inside));
    assert(m.active(1-team).every(p=>distance(p,fk)>=FIELD.restartClearance-.1));
    m.beginRestart({type:'KICK OFF',team,x:0,z:0});
    assert(m.active(1-team).every(p=>p.x*dir>=0&&distance(p,m.ball)>=FIELD.centerRadius));
  }
});
test('support players keep wide passing lanes and a goalkeeper tracks a shot near each new goal',()=>{
  const m=match();m.resetFormation();m.phase='playing';const carrier=m.players[3];carrier.x=15;carrier.z=-25;m.ball.take(carrier);m.controlled=carrier;
  for(let i=0;i<480;i++){m.ball.update(1/120);updateAI(m,1/120);}
  assert(m.players[4].z>FIELD.halfWidth*.52);assert(m.players[5].x>carrier.x+15);assert(m.players[6].z>15);
  for(const half of [1,2])for(const team of [0,1]){
    const n=match();n.half=half;n.resetFormation();n.phase='playing';const gk=n.active(team)[0],dir=n.direction(team);
    Object.assign(n.ball,{x:-dir*(FIELD.halfLength-20),z:6,vx:-dir*30,vz:0,y:1,lastTouch:n.active(1-team)[5],shot:{team:1-team,player:n.active(1-team)[5],counted:false}});
    for(let i=0;i<60;i++)updateAI(n,1/120);
    assert(gk.z>1.4);assert(gk.x*dir<-FIELD.halfLength+FIELD.boxDepth);
    gk.cooldown=0;Object.assign(n.ball,{x:gk.x,z:gk.z,y:1,lock:0,vx:-dir*25});n.collisions(1/120);
    assert.equal(n.stats[team].saves,1);assert.equal(n.ball.owner,gk);
  }
});
test('substitutes keep their expanded formation slot and coordinates',()=>{
  const m=match(),p=m.players[3],incoming=m.benches[0][0];p.x=44;p.z=32;m.phase='halftime';m.queueSubstitution(p.id,incoming.id);
  assert.equal(p.x,44);assert.equal(p.z,32);assert.equal(p.slot,3);m.continueHalf();
  assert.equal(p.x,-FORMATION[3].x);assert.equal(p.z,FORMATION[3].z);assert.equal(m.players.length,14);
});
test('broadcast and set-piece cameras keep the ball visible across the larger map',()=>{
  for(const aspect of [844/390,1440/900])for(const side of [-1,1])for(const wing of [-1,1]){
    const m=match(),camera=new T.PerspectiveCamera(49,aspect,.2,u(260)),broadcast=new BroadcastCamera(camera);
    m.phase='playing';m.ball.x=side*(FIELD.halfLength-2);m.ball.z=wing*(FIELD.halfWidth-2);
    m.controlled.x=m.ball.x;m.controlled.z=m.ball.z;
    for(let i=0;i<240;i++)broadcast.update(1/60,4,m);
    camera.updateMatrixWorld();const screen=new T.Vector3(m.ball.x,.32,m.ball.z).project(camera);
    assert(Math.abs(screen.x)<.9&&Math.abs(screen.y)<.9&&screen.z<1,JSON.stringify({aspect,side,wing,screen}));
    assert(Math.abs(camera.position.x)>45);
    m.beginRestart({type:'CORNER',team:side===1?0:1,x:side*(FIELD.halfLength-.3),z:wing*(FIELD.halfWidth-.3)});
    for(let i=0;i<300;i++)broadcast.update(1/60,5,m);
    camera.updateMatrixWorld();const corner=new T.Vector3(m.ball.x,.32,m.ball.z).project(camera);
    assert(Math.abs(corner.x)<1&&Math.abs(corner.y)<1&&corner.z<1);
  }
});
test('goalkeepers and formation labels fit the intro at desktop and phone landscape ratios',()=>{
  for(const aspect of [844/390,1045/912,1440/900]){
    const m=match(),camera=new T.PerspectiveCamera(49,aspect,.2,u(260)),broadcast=new BroadcastCamera(camera);
    for(let i=0;i<300;i++)broadcast.update(1/60,5,m);camera.updateMatrixWorld();
    for(const p of m.players){const screen=new T.Vector3(p.x,3.4,p.z).project(camera);assert(Math.abs(screen.x)<.98&&Math.abs(screen.y)<.95,JSON.stringify({aspect,player:p.name,screen}));}
  }
});
test('both difficulty extremes finish on the enlarged pitch with finite, bounded players and referee',()=>{
  for(const difficulty of ['easy','hard']){
    let seed=43;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const m=new Match(teams,{duration:3,difficulty},{random});m.skipIntro();
    for(let i=0;i<90000&&m.phase!=='fulltime';i++){
      m.update(1/120,idle);if(m.phase==='halftime')m.continueHalf();
      if(i%120===0){assert(m.active(0).concat(m.active(1)).every(inside));assert(inside(m.referee));}
    }
    assert.equal(m.phase,'fulltime');assert.equal(m.elapsed,180);assert(m.stats[1].shots>0);
  }
});
