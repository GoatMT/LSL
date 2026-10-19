import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Player} from '../src/match/player.js';
import {Ball} from '../src/match/ball.js';
import {Match} from '../src/match/match.js';
import {createLineup} from '../src/data.js';
import {PLAY,FIELD,distance} from '../src/config.js';
import {defensiveShape} from '../src/match/tactics.js';
import {updateAI} from '../src/match/ai.js';
import {performSkill} from '../src/match/skills.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>({...t,lineup:createLineup(t.roster),bench:[]}));
const match=()=>{const m=new Match(teams,{duration:3,difficulty:'hard'},{random:()=>.99});m.resetFormation();m.phase='playing';return m;};

test('every rating, side and position retains full sprint speed after a whole match',()=>{
 for(const team of [0,1])for(const slot of [0,3,5])for(const overall of [60,75,99]){
  const p=new Player({id:'runner',name:'Runner',overall},team,slot,1);
  for(let i=0;i<360*30;i++){p.tick(1/30);p.move(1,0,1,1/30,true);if(p.x>50)p.x=-50;}
  assert(p.boosting);assert(Math.abs(p.vx-PLAY.sprintSpeed*p.attributes.speed)<.001);
  assert(!('stamina' in p));assert(!('exhausted' in p));
 }
});

test('sharp cuts retain tight touches on low and high ratings at phone frame rates',()=>{
 for(const hz of [30,60,120])for(const overall of [60,99])for(const sprint of [false,true]){
  const p=new Player({id:'runner',name:'Runner',overall},0,5,1);p.x=p.z=0;
  const b=new Ball();b.take(p);let max=0;const gaps=[];
  for(let i=0;i<hz*9;i++){
   const angle=[0,2.8,-1.8,.6][Math.floor(i/(hz*.6))%4];
   p.tick(1/hz);p.move(Math.cos(angle),Math.sin(angle),1,1/hz,sprint);b.update(1/hz);
   assert.equal(b.owner,p);max=Math.max(max,distance(p,b));gaps.push(distance(p,b));
  }
  assert(max<(sprint?1.85:1.45),JSON.stringify({hz,overall,sprint,max}));
  assert(Math.max(...gaps)-Math.min(...gaps)>.2,'Touches must remain physical, not fixed attachments');
 }
});

test('high dribbling quality turns faster and keeps a shorter steady ball lead',()=>{
 const results=[];
 for(const overall of [60,99]){
  const p=new Player({id:'runner',name:'Runner',overall},0,5,1);p.x=p.z=0;const b=new Ball();b.take(p);let lead=0;
  for(let i=0;i<240;i++){p.tick(1/120);p.move(1,0,1,1/120);b.update(1/120);if(i>=120)lead+=distance(p,b)/120;}
  for(let i=0;i<8;i++){p.tick(1/120);p.move(-1,0,1,1/120);b.update(1/120);}
  results.push({lead,vx:p.vx,face:p.faceX});
 }
 assert(results[1].lead<results[0].lead);assert(results[1].vx<results[0].vx);assert(results[1].face<results[0].face);
});

test('successful skills blend back into close control without launch or speed discontinuity',()=>{
 const m=match(),p=m.players[5];p.x=p.z=0;m.players.forEach(o=>{if(o!==p){o.x=40;o.z=35;}});
 m.ball.reset(.65,0);m.ball.take(p);p.cooldown=0;p.vx=7;
 performSkill(m,p,{x:1,z:.8,intensity:1});assert(p.skillPlan);
 let previous={vx:p.vx,vz:p.vz};
 for(let i=0;i<180;i++){
  p.tick(1/120);p.move(1,.3,1,1/120);m.ball.update(1/120);
  assert.equal(m.ball.owner,p);assert(distance(p,m.ball)<1.5);
  assert(Math.hypot(p.vx-previous.vx,p.vz-previous.vz)<1);previous={vx:p.vx,vz:p.vz};
 }
 assert.equal(p.skillPlan,null);
});

test('one presser leaves five unique markers, and small ball changes retain their assignments',()=>{
 for(const half of [1,2]){
  const m=match();m.half=half;m.resetFormation();const owner=m.players[5];m.ball.take(owner);
  const field=m.active(1).filter(p=>p.role!=='GK'),shape=defensiveShape(m,1,field,m.ball);
  assert.equal(shape.chasers.length,1);assert.equal(shape.marks.size,5);assert.equal(new Set(shape.marks.values()).size,5);assert(!shape.doubleTeam);
  const first=new Map(shape.marks);
  for(const z of [.2,-.2,.1]){m.ball.z+=z;const next=defensiveShape(m,1,field,m.ball);for(const [p,t] of first)assert.equal(next.marks.get(p),t);}
  const [marker,threat]=[...first][0];threat.z+=8;
  assert.equal(defensiveShape(m,1,field,m.ball).marks.get(marker),threat,'Follow a run instead of immediately changing marks');
  threat.sentOff=true;assert(![...defensiveShape(m,1,field,m.ball).marks.values()].includes(threat));
 }
});

test('nearby pressure jockeys, emergency recovery sprints, and a second defender guards the outlet',()=>{
 const m=match(),owner=m.players[5],outlet=m.players[4],press=m.players[8],marker=m.players[9];
 m.players.forEach(p=>{p.sentOff=![owner,outlet,press,marker].includes(p);p.cooldown=100;});m.controlled=owner;
 Object.assign(owner,{x:0,z:0,faceX:1,faceZ:0});Object.assign(outlet,{x:3,z:13});
 Object.assign(press,{x:3,z:0});Object.assign(marker,{x:5,z:13});m.ball.reset(.6,0);m.ball.take(owner);
 updateAI(m,1/60);assert(!press.boosting);assert(!marker.boosting);assert.equal(m.defensiveRoles[1].assignments.get(marker.id),outlet.id);
 assert(Math.abs(marker.aiTarget.z-outlet.z)<3);assert(Math.abs(marker.aiTarget.z-owner.z)>8);
 press.x=25;marker.sentOff=true;m.defensiveRoles=null;updateAI(m,1/60);assert(press.boosting);
});

test('a sideline trap allows help but an open outlet cancels the double team',()=>{
 const m=match(),owner=m.players[5],a=m.players[8],b=m.players[9];m.controlled=owner;
 m.players.forEach(p=>p.sentOff=![owner,a,b].includes(p));
 Object.assign(owner,{x:0,z:FIELD.halfWidth-1,faceX:1,faceZ:0});
 Object.assign(a,{x:2,z:owner.z});Object.assign(b,{x:5,z:owner.z-2});m.ball.reset(.6,owner.z);m.ball.take(owner);
 let plan=defensiveShape(m,1,[a,b],m.ball);assert(plan.doubleTeam);
 const outlet=m.players[4];outlet.sentOff=false;Object.assign(outlet,{x:2,z:owner.z-9});
 plan=defensiveShape(m,1,[a,b],m.ball);assert(!plan.doubleTeam);assert([...plan.marks.values()].includes(outlet));
});
