import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Player } from '../src/match/player.js';
import { Ball } from '../src/match/ball.js';
import { Match } from '../src/match/match.js';
import { updateAI } from '../src/match/ai.js';
import { updateKeeper,keeperContact } from '../src/match/goalkeeper.js';
import { advanceStrike } from '../src/match/striking.js';
import { createLineup } from '../src/data.js';
import { FIELD,distance } from '../src/config.js';
import { INTRO,PRESENTATION,introPlayer } from '../src/presentation.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
const match=()=>{const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});m.resetFormation();m.phase='playing';return m;};
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
test('repeated sharp turns retain close control at jog and sprint speeds for both teams',()=>{
  for(const sprint of [false,true])for(const team of [0,1]){
    const p=new Player({id:'runner',name:'Runner',overall:80},team,5,team? -1:1);p.x=p.z=0;const b=new Ball();b.take(p);let max=0,min=10;
    for(let i=0;i<1440;i++){
      const angles=[0,Math.PI*.75,-Math.PI*.5,Math.PI,Math.PI*.25,-Math.PI*.75],angle=angles[Math.floor(i/72)%angles.length];
      p.tick(1/120);p.move(Math.cos(angle),Math.sin(angle),1,1/120,sprint);b.update(1/120);
      assert.equal(b.owner?.id,p.id,'Unopposed cuts should keep possession');max=Math.max(max,distance(p,b));min=Math.min(min,distance(p,b));
    }
    assert(max<(sprint?2.1:1.8),String(max));assert(max-min>.35,'The ball still moves between individual touches');
  }
});
test('reversals and stopping respond quickly without teleporting the player',()=>{
  const p=new Player({id:'runner',name:'Runner',overall:99},0,5,1);p.x=p.z=0;
  for(let i=0;i<120;i++)p.move(1,0,1,1/120,true);const start=p.x;
  for(let i=0;i<36;i++)p.move(-1,0,1,1/120,true);
  assert(p.vx<-9&&p.faceX<-.9);assert(p.x-start<1.2);
  for(let i=0;i<36;i++)p.move(0,0,0,1/120);assert(Math.hypot(p.vx,p.vz)<.01);
});
test('running into a stationary ball settles into dribbling without an initial launch',()=>{
  const p=new Player({id:'runner',name:'Runner'},0,5,1);p.x=p.z=0;p.vx=7;const b=new Ball();b.x=.7;b.z=.2;b.take(p);
  assert(Math.hypot(b.vx,b.vz)<5);const start=b.x;
  for(let i=0;i<18;i++){p.tick(1/120);p.move(1,0,1,1/120);b.update(1/120);}
  assert.equal(b.owner,p);assert(b.x-start<1);assert(distance(p,b)<1.3);
});
test('weak touches stop quickly; harder passes go farther; stopped balls never creep',()=>{
  const results=[];for(const speed of [1,5,20,40]){
    const b=new Ball();b.vx=speed;let t=0;while(b.vx!==0&&t<15){b.integrate(1/120);t+=1/120;}assert.equal(b.vx,0);const x=b.x;b.integrate(30);assert.equal(b.x,x);results.push({t,x});
  }
  assert(results[0].t<.5&&results[0].x<.25);assert(results[1].t<2);assert(results[2].t<5);assert(results[3].x>results[2].x*2);
});
test('AI keeps far-side players repositioning and preserves width in both possession states',()=>{
  for(const team of [0,1]){
    const m=match(),owner=m.active(team)[5];owner.x=-8;owner.z=-16;m.ball.take(owner);m.controlled=owner;
    const near=new Set([0,1].flatMap(side=>m.active(side).filter(p=>p.role!=='GK').sort((a,b)=>distance(a,m.ball)-distance(b,m.ball)).slice(0,2)));
    const watched=m.players.filter(p=>p!==owner&&p.role!=='GK'&&!near.has(p)),travel=new Map(watched.map(p=>[p,0]));
    m.players.forEach(p=>p.cooldown=1000);
    for(let i=0;i<1200;i++){
      const before=new Map(watched.map(p=>[p,{x:p.x,z:p.z}]));m.players.forEach(p=>p.tick(1/60));updateAI(m,1/60);
      if(i>600)for(const p of watched)travel.set(p,travel.get(p)+distance(p,before.get(p)));
    }
    for(const [p,moved] of travel)assert(moved>1,p.name+' stopped repositioning: '+moved);
    assert(m.active(team).some(p=>p.z>18));assert(m.active(team).filter(p=>distance(p,m.ball)<5).length<=2);
  }
});
test('keepers track and face an unshot ball, advance to attackers and retreat with play',()=>{
  for(const team of [0,1]){
    const m=match(),p=m.active(team)[0],d=m.direction(team),attacker=m.active(1-team)[5];
    Object.assign(m.ball,{x:0,z:30,owner:attacker});
    for(let i=0;i<240;i++){p.tick(1/120);updateKeeper(m,p,1/120);}assert(p.z>2);
    const faceDot=(p.faceX*(m.ball.x-p.x)+p.faceZ*(m.ball.z-p.z))/distance(p,m.ball);assert(faceDot>.97);
    m.active(team).filter(o=>o!==p).forEach(o=>{o.x=20*d;o.z=-30;});
    Object.assign(m.ball,{x:-d*(64-18),z:0,owner:attacker});for(let i=0;i<300;i++){p.tick(1/120);updateKeeper(m,p,1/120);}const forward=p.x*d+64;assert(forward>7);
    Object.assign(m.ball,{x:35*d,z:0,owner:attacker});for(let i=0;i<300;i++){p.tick(1/120);updateKeeper(m,p,1/120);}assert(p.x*d+64<forward-2);
  }
});
test('a user keeper catches securely, stays controlled and distributes on either action',()=>{
  for(const action of ['pass','shoot']){
    const m=match(),p=m.players[0];p.cooldown=0;Object.assign(m.ball,{x:p.x,z:p.z,y:1,vx:-12,lastTouch:m.players[12]});
    assert(keeperContact(m,p));assert.equal(m.controlled,p);assert.equal(m.ball.controlMode,'hands');
    for(let i=0;i<420;i++)m.update(1/120,idle);assert.equal(m.ball.owner,p,'No automatic distribution of the user keeper');assert.equal(m.controlled,p);
    if(action==='pass')m.update(.01,{...idle,pressed:new Set(['pass'])});
    else{m.update(.5,{...idle,held:new Set(['shoot'])});m.update(.01,{...idle,released:new Set(['shoot'])});}
    assert(p.striking);for(let i=0;i<60&&m.ball.owner;i++)m.update(1/120,idle);
    assert.equal(m.ball.owner,null);assert.equal(m.stats[0].passes,1);assert.equal(m.stats[0].shots,0);assert.notEqual(m.controlled,p);assert(m.ball.vx>0);
    if(action==='shoot'){assert(m.ball.vy>8);assert(Math.hypot(m.ball.vx,m.ball.vz)>25);}
  }
});
test('live passes and shots plant first, strike at contact, and can be interrupted',()=>{
  for(const action of ['pass','shoot'])for(const interrupted of [false,true]){
    const m=match(),p=m.players[5];m.ball.take(p);p.vx=p.vz=0;
    if(action==='pass')m.requestPass(p);else m.requestShot(p,.7);
    assert(p.striking);assert.equal(m.ball.owner,p);assert.equal(m.stats[0].shots+m.stats[0].passes,0);
    p.tick(.06);advanceStrike(m,.06);assert.equal(m.ball.owner,p);
    if(interrupted)m.ball.take(m.players[12]);
    p.tick(.4);advanceStrike(m,.4);assert(!p.striking);
    if(interrupted){assert.equal(m.stats[0].shots+m.stats[0].passes,0);assert.equal(m.ball.owner,m.players[12]);}
    else{assert.equal(m.ball.owner,null);assert.equal(m.stats[0].shots+m.stats[0].passes,1);assert(Math.hypot(m.ball.vx,m.ball.vz)>10);}
  }
});
test('the minute-long intro gives every starter three uninterrupted seconds alone',()=>{
  const m=match();m.phase='intro';const seen=[];
  for(const team of [0,1])for(let i=0;i<7;i++){
    const start=(team?INTRO.cpu:INTRO.user)+i*INTRO.playerSeconds;
    m.phaseTime=start+.01;const p=introPlayer(m);assert.equal(p,m.active(team)[i]);seen.push(p.id);
    m.phaseTime=start+2.99;assert.equal(introPlayer(m),p);
  }
  assert.equal(new Set(seen).size,14);assert.equal(INTRO.duration,60);m.skipIntro();assert.equal(m.phase,'restart');assert.equal(m.elapsed,0);
});
test('fouls, cards and goals keep the ball and clock stopped for their presentation',()=>{
  for(const card of ['none','yellow','red']){
    const m=match(),victim=m.players[5],offender=m.players[12];m.foul(offender,victim,card);const expected=card==='none'?PRESENTATION.foul:PRESENTATION.card;
    assert(m.restart.readyAt>=expected);const pos={x:m.ball.x,z:m.ball.z};for(let i=0;i<120;i++)m.update(1/60,{...idle,pressed:new Set(['pass'])});
    assert.equal(m.elapsed,0);assert.equal(distance(pos,m.ball),0);assert.equal(m.phase,'restart');
  }
  const m=match();m.ball.lastTouch=m.players[5];m.goal(0);m.update(7,idle);assert.equal(m.phase,'goal');assert.equal(m.elapsed,0);for(let i=0;i<600&&m.phase==='goal';i++)m.update(.1,idle);assert.equal(m.phase,'restart');assert.equal(m.elapsed,0);
});
