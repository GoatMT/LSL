import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Match} from '../src/match/match.js';
import {Ball} from '../src/match/ball.js';
import {createLineup} from '../src/data.js';
import {boundaryEvent,goalFrameCollision} from '../src/match/rules.js';
import {Settings} from '../src/settings.js';
import { FIELD,PLAY,fieldUnits as u,distance } from '../src/config.js';
const payload=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url)));
const teams=payload.teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
const match=()=>new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.51});
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
test('all published seasons preserve unique roster memberships and seven starters',()=>{
  let total=0;
  for(const year of [2024,2025,2026]){
    const data=JSON.parse(fs.readFileSync(new URL('../data/'+year+'.json',import.meta.url)));
    for(const team of data.teams){
      const lineup=createLineup(team.roster);assert.equal(lineup.length,7);assert.equal(new Set(lineup.map(p=>p.id)).size,7);
      assert.equal(lineup.filter(p=>p.role==='GK').length,1);assert(lineup.every(p=>team.roster.some(r=>r.id===p.id&&r.name===p.name&&r.jersey===p.jersey)));total++;
    }
  }assert.equal(total,24);
});
test('match begins with 14 active players and a sixty-second skippable presentation',()=>{
  const m=match();assert.equal(m.players.length,14);for(let i=0;i<59;i++)m.update(1,idle);
  assert.equal(m.phase,'intro');assert.equal(m.elapsed,0);m.update(1.01,idle);assert.equal(m.phase,'restart');assert.equal(m.restart.type,'KICK OFF');
});
test('goals use the whole ball and both attacking directions',()=>{
  const L=FIELD.halfLength,b={x:L+.5,z:0,y:.32,lastTouch:{team:0}};
  assert.equal(boundaryEvent(b,{x:L,z:0,y:.32},[1,-1]).team,0);
  assert.equal(boundaryEvent(b,{x:L,z:0,y:.32},[-1,1]).team,1);
  assert.equal(boundaryEvent({...b,x:L+.2},{x:L,z:0,y:.32},[1,-1]),null);
});
test('out-of-bounds awards corners, goal kicks and throw-ins to correct teams',()=>{
  const L=FIELD.halfLength,W=FIELD.halfWidth,prev={x:L,z:u(10),y:.32},b={x:L+.6,z:u(10),y:.32,lastTouch:{team:1}};
  assert.equal(boundaryEvent(b,prev,[1,-1]).type,'CORNER');
  assert.equal(boundaryEvent({...b,lastTouch:{team:0}},prev,[1,-1]).type,'GOAL KICK');
  assert.equal(boundaryEvent({x:3,z:W+.6,y:.32,lastTouch:{team:0}},{x:3,z:W,y:.32},[1,-1]).team,1);
});
test('posts and crossbar deflect even a fast ball crossing their plane',()=>{
  const L=FIELD.halfLength,b=new Ball();Object.assign(b,{x:L+.7,y:1,z:FIELD.goalHalf,vx:49});assert(goalFrameCollision(b,{x:L-.2,y:1,z:FIELD.goalHalf}));assert(b.vx<0);
  Object.assign(b,{x:L+.7,y:FIELD.goalHeight,z:0,vx:49});assert(goalFrameCollision(b,{x:L-.2,y:FIELD.goalHeight,z:0}));
});
test('rolling friction and gravity settle the ball without falling below grass',()=>{
  const b=new Ball();Object.assign(b,{y:3,vy:-2,vx:10});let bounced=false;
  for(let i=0;i<2400;i++){b.update(1/120);assert(b.y>=.32);if(b.vy>0)bounced=true;}
  assert(bounced);assert(b.vx<.1);assert.equal(b.y,.32);
});
test('charged shots gain speed and record the actual shooter',()=>{
  const m=match(),p=m.players[5];m.ball.take(p);m.phase='playing';m.shoot(p,.1);const weak=Math.hypot(m.ball.vx,m.ball.vz);
  m.shoot(p,1);assert(Math.hypot(m.ball.vx,m.ball.vz)>weak);assert.equal(m.stats[0].shots,2);assert.equal(m.ball.shot.player,p);
});
test('successful passes credit accuracy and transfer possession',()=>{
  const m=match(),p=m.players[5];m.phase='playing';m.ball.take(p);m.pass(p);
  const receiver=m.controlled;assert.notEqual(receiver,p);assert.equal(m.stats[0].passes,1);m.claim(receiver);
  assert.equal(m.stats[0].completed,1);assert.equal(p.passes,1);assert.equal(m.ball.owner,receiver);
});
test('pause and restarts stop the match clock',()=>{
  const m=match();m.skipIntro();m.update(1,idle);assert.equal(m.elapsed,0);m.phase='playing';m.pause();m.update(10,idle);assert.equal(m.elapsed,0);
});
test('halftime is an explicit pause, allows substitutions and reverses ends',()=>{
  const m=match();m.phase='playing';m.elapsed=89.999;m.update(1/120,idle);assert.equal(m.phase,'halftime');assert.equal(m.elapsed,90);
  const before=m.elapsed;m.update(30,idle);assert.equal(m.elapsed,before);
  const out=m.players[5],incoming=m.benches[0][0],oldId=out.id;m.queueSubstitution(oldId,incoming.id);
  assert.equal(m.stats[0].substitutions,1);assert.equal(out.id,incoming.id);assert(m.archive.some(p=>p.id===oldId));
  m.continueHalf();assert.equal(m.half,2);assert.equal(m.direction(0),-1);assert.equal(m.restart.team,1);assert.equal(m.restart.type,'KICK OFF');
  m.phase='playing';m.elapsed=179.999;m.update(1/120,idle);assert.equal(m.phase,'outro');m.update(6,idle);m.update(1/120,idle);assert.equal(m.phase,'fulltime');assert.equal(m.elapsed,180);
});
test('fouls create penalties in the box and two yellows remove a player',()=>{
  const m=match(),victim=m.players[5],offender=m.players[8];
  victim.x=u(26);victim.z=0;m.foul(offender,victim,'yellow');assert.equal(m.restart.type,'PENALTY');
  victim.x=8;m.foul(offender,victim,'yellow');assert.equal(m.restart.type,'FREE KICK');assert(offender.sentOff);assert.equal(m.active(1).length,6);assert.equal(m.stats[1].reds,1);
});
test('queued substitutions wait for a stoppage and prevent duplicated players',()=>{
  const m=match();m.phase='playing';const out=m.players[5],original=out.id,incoming=m.benches[0][0];
  m.queueSubstitution(out.id,incoming.id);assert.equal(out.id,original);
  assert.throws(()=>m.queueSubstitution(out.id,incoming.id));
  m.beginRestart({type:'THROW-IN',team:0,x:0,z:FIELD.halfWidth-.2});assert.equal(out.id,incoming.id);assert(!m.benches[0].some(p=>p.id===incoming.id));
});
test('goals count once, include assists and give the opponent kickoff',()=>{
  const m=match(),p=m.players[5],a=m.players[4];m.phase='playing';m.ball.previousTouch=a;m.ball.lastTouch=p;m.goal(0);
  assert.equal(m.stats[0].goals,1);assert.equal(p.goals,1);assert.equal(a.assists,1);assert.equal(m.goalEvents[0].assist,a.name);
  for(let i=0;i<1500&&m.phase==='goal';i++)m.update(1/60,idle);assert.equal(m.phase,'restart');assert.equal(m.restart.team,1);
});
test('settings persist and conflicting keys swap instead of breaking controls',()=>{
  let json='{"graphics":"low"}';const storage={getItem:()=>json,setItem:(k,v)=>json=v};const s=new Settings(storage);
  assert.equal(s.value.duration,6);s.set('duration',4);s.bind('shoot','KeyM');assert.equal(s.value.keys.pass,'KeyK');assert.equal(new Settings(storage).value.duration,4);
});
test('every match length has equal halves and keeps total elapsed time',()=>{
  for(const duration of [1,2,3,4,5,6]){
    const m=new Match(teams,{duration,difficulty:'normal'},{random:()=>.51});
    m.phase='playing';m.elapsed=duration*30-.001;m.update(1/120,idle);
    assert.equal(m.phase,'halftime');assert.equal(m.elapsed,duration*30);
    m.continueHalf();m.phase='playing';m.elapsed=duration*60-.001;m.update(1/120,idle);
    assert.equal(m.phase,'outro');m.update(6,idle);m.update(1/120,idle);assert.equal(m.phase,'fulltime');assert.equal(m.elapsed,duration*60);
  }
});
test('a deflected shot keeps its original goalscorer and assist',()=>{
  const m=match(),p=m.players[5],assist=m.players[4],keeper=m.players[7];
  m.phase='playing';m.ball.lastTouch=p;m.ball.previousTouch=assist;m.shoot(p,.5);m.ball.touch(keeper);m.goal(0);
  assert.equal(m.goalEvents[0].name,p.name);assert.equal(m.goalEvents[0].ownGoal,false);assert.equal(m.goalEvents[0].assist,assist.name);
});
test('a seeded CPU match progresses through both halves without invalid physics',()=>{
  let seed=19;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const m=new Match(teams,{duration:3,difficulty:'normal'},{random});m.skipIntro();let halfSeen=false;
  for(let i=0;i<90000&&m.phase!=='fulltime';i++){
    m.update(1/120,idle);
    if(m.phase==='halftime'){halfSeen=true;m.continueHalf();}
    assert(Number.isFinite(m.ball.x)&&Number.isFinite(m.ball.z));
  }
  assert(halfSeen);assert.equal(m.phase,'fulltime');assert.equal(m.elapsed,180);assert(m.stats[1].shots>0);
});
