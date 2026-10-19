import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIELD,PLAY } from '../src/config.js';
import { planShot,shotTechnique,preferredFoot } from '../src/match/shooting.js';
import { advanceStrike } from '../src/match/striking.js';
import { Ball } from '../src/match/ball.js';
import { Player } from '../src/match/player.js';
import { Match } from '../src/match/match.js';
import { createLineup } from '../src/data.js';
import { animationPose } from '../src/engine/animations.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>({...t,lineup:createLineup(t.roster),bench:[]}));
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const setup=()=>{const p=new Player({id:'test',name:'Test',overall:85},0,5,1);p.x=32;p.z=0;p.action=null;const b=new Ball();b.take(p);return {p,b};};
const launch=(p,b,shot)=>{b.kick(p,shot.direction.x,shot.direction.z,shot.speed,shot.lift,{height:shot.height,spin:shot.spin});};
function goalPlane(b,dir=1){let highest=0;for(let i=0;i<1200;i++){const prev={x:b.x,y:b.y,z:b.z};b.integrate(1/120);highest=Math.max(highest,b.y);if(b.x*dir>=FIELD.halfLength){const t=(dir*FIELD.halfLength-prev.x)/(b.x-prev.x);return {y:prev.y+(b.y-prev.y)*t,z:prev.z+(b.z-prev.z)*t,highest};}}return null;}
test('foot preferences preserve supplied data and flag the explicit gameplay fallback',()=>{
  assert.deepEqual(preferredFoot({dominantFoot:'L'}),{foot:'left',source:'roster'});
  assert.equal(preferredFoot({foot:'both'}).foot,'both');assert.equal(preferredFoot({}).source,'game-default');
});
test('curved technique depends on contact foot, dominant foot, body and target; never random',()=>{
  const {p,b}=setup();const target={x:64,z:0};
  assert.equal(shotTechnique(p,b,target,{curve:true}).kind,'finesse-shot');
  p.faceX=Math.cos(.22);p.faceZ=Math.sin(.22);
  assert.equal(shotTechnique(p,b,target,{curve:true}).kind,'trivela-shot');
  p.dominantFoot='left';assert.equal(shotTechnique(p,b,target,{curve:true}).kind,'finesse-shot');
  p.dominantFoot='right';b.z=p.z+.5;b.x=p.x;
  const left=shotTechnique(p,b,target,{curve:true});assert.equal(left.foot,'left');assert.equal(left.kind,'finesse-shot');
  b.z=p.z-.5;assert.equal(shotTechnique(p,b,target,{curve:true}).foot,'right');
  const a=planShot(p,b,target,{curve:true,random:rng(4)}),c=planShot(p,b,target,{curve:true,random:rng(9)});assert.equal(a.kind,c.kind);assert.equal(a.foot,c.foot);
});
test('finesse and trivela curve in opposite directions and arrive near the aimed goal',()=>{
  const paths=[];
  for(const angle of [0,.3]){
    const {p,b}=setup();p.faceX=Math.cos(angle);p.faceZ=Math.sin(angle);
    const shot=planShot(p,b,{x:64,z:0},{curve:true,power:.65,random:()=>.5});launch(p,b,shot);
    const initial=b.vz;for(let i=0;i<60;i++)b.integrate(1/120);
    const mid=b.z,finish=goalPlane(b);assert(finish);assert(Math.abs(finish.z)<2);assert(finish.y<FIELD.goalHeight);assert(finish.highest>1);
    paths.push({kind:shot.kind,spin:shot.spin,initial,mid});
  }
  assert.equal(paths[0].kind,'finesse-shot');assert.equal(paths[1].kind,'trivela-shot');
  assert(paths[0].spin*paths[1].spin<0);assert(paths[0].mid*paths[1].mid<0);assert(Math.abs(paths[0].mid)>.6&&Math.abs(paths[1].mid)>.6);
});
test('spin rotates airborne velocity without adding energy',()=>{
  const b=new Ball();Object.assign(b,{y:10,vx:30,vz:4,spin:18});const speed=Math.hypot(b.vx,b.vz);b.integrate(1/60);
  assert(Math.abs(Math.hypot(b.vx,b.vz)-speed*Math.exp(-PLAY.airDrag/60))<1e-10);
});
test('maximum charge skies most rushed tight-angle shots; balanced shots remain viable',()=>{
  const counts=[];
  for(const power of [.6,.9,1]){
    const random=rng(123);let over=0,wide=0;
    for(let i=0;i<200;i++){
      const {p,b}=setup();p.x=44;p.z=22;p.boosting=true;p.faceX=.5;p.faceZ=Math.sqrt(.75);b.take(p);
      const shot=planShot(p,b,{x:64,z:0},{power,random});launch(p,b,shot);const crossing=goalPlane(b);
      assert(crossing);if(crossing.y>FIELD.goalHeight+FIELD.ballRadius)over++;wide+=Math.abs(crossing.z);
    }
    counts.push({power,over,wide});
  }
  assert(counts[0].over<10,JSON.stringify(counts));assert(counts[1].over<65,JSON.stringify(counts));assert(counts[2].over>170,JSON.stringify(counts));assert(counts[2].wide>counts[0].wide*2);
});
test('max power is risky even for curved shots but never guarantees a miss',()=>{
  for(const curve of [false,true])for(const dir of [-1,1]){
    const {p,b}=setup();p.x=dir*35;p.z=0;p.faceX=dir;p.faceZ=0;b.take(p);
    let sample=0;const random=()=>sample++===0?.1:.5;
    const shot=planShot(p,b,{x:dir*64,z:0},{power:1,curve,random});assert(shot.skied);launch(p,b,shot);assert(goalPlane(b,dir).y>FIELD.goalHeight);
    const good=planShot(p,b,{x:dir*64,z:0},{power:1,curve,random:()=>.99});assert(!good.skied);
  }
});
test('normal, power, finesse and trivela animate distinct finite striking poses',()=>{
  const {p}=setup();const poses=[];
  for(const kind of ['shot','power-shot','finesse-shot','trivela-shot']){
    p.animate(kind,.8,{side:1,power:.7});p.action.time=.4;const pose=animationPose(p,1);
    assert(Object.values(pose).every(Number.isFinite));poses.push(JSON.stringify(pose));
  }
  assert.equal(new Set(poses).size,4);
  p.animate('trivela-shot',.8,{side:-1});p.action.time=.4;assert(animationPose(p,1).llZ<0);
});
test('curved charge survives same-frame releases and cancellation cannot shoot later',()=>{
  const m=new Match(teams,{duration:3,difficulty:'normal'}),input={held:new Set(['shoot','curve']),pressed:new Set(),released:new Set(),cancelled:new Set()};
  m.chargeShot(.5,input);assert(m.curveRequested&&m.charge>.4);
  input.held.clear();input.released.add('shoot');input.released.add('curve');m.chargeShot(.01,input);assert(m.curveRequested);
  input.released.clear();input.cancelled.add('shoot');m.chargeShot(.01,input);assert.equal(m.charge,0);assert(!m.curveRequested);
});
test('curved shots work on free kicks and penalties in both attacking directions',()=>{
  for(const half of [1,2])for(const type of ['FREE KICK','PENALTY']){
    const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.5});m.half=half;const dir=m.direction(0);
    m.beginRestart({type,team:0,x:dir*(64-25),z:0});m.phaseTime=5;
    m.updateRestart(.6,{held:new Set(['shoot','curve']),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})});
    m.updateRestart(.01,{held:new Set(),pressed:new Set(),released:new Set(['shoot','curve']),movement:()=>({x:0,z:0,intensity:0})});
    advanceStrike(m,.5);assert.equal(m.phase,'playing');assert.equal(m.ball.shot.kind,'finesse-shot');assert.equal(m.stats[0].shots,1);assert(m.ball.vx*dir>0);
  }
});
