import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Match} from '../src/match/match.js';import {createLineup} from '../src/data.js';
import {queueSideline,SIDELINE_RETURN} from '../src/match/sideline.js';
import {animationPose} from '../src/engine/animations.js';
import {LiveSimulation,idlePacket} from '../src/h2h/simulation.js';
import {snapshot,SnapshotView} from '../src/h2h/snapshots.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
const fixture=()=>new Match(teams,{duration:3,difficulty:'normal',minorInjuries:false},{random:()=>.99});
test('substitution cutaway starts only after a confirmed change at a stoppage',()=>{
 const m=fixture();m.resetFormation();m.phase='playing';m.elapsed=20;const out=m.players[5],id=out.id,name=out.name,incoming=m.benches[0][0];
 m.queueSubstitution(id,incoming.id);assert(!m.sideline);assert.equal(m.sidelineQueue?.length||0,0);assert.equal(out.id,id);
 assert.equal(queueSideline(m,'substitution',0),false);
 m.beginRestart({type:'THROW-IN',team:0,x:10,z:41});m.update(1/60,idle);
 assert.equal(m.sideline.kind,'substitution');assert.equal(m.sideline.outPlayer.name,name);assert.equal(m.sideline.inPlayer.id,incoming.id);assert.equal(out.id,incoming.id);
 const ball={x:m.ball.x,z:m.ball.z},clock=m.elapsed;m.update(2,idle);assert.equal(m.elapsed,clock);assert.deepEqual({x:m.ball.x,z:m.ball.z},ball);assert.equal(m.stats[0].substitutions,1);
 m.skipSideline();assert(m.sideline);assert.equal(m.sideline.time,m.sideline.duration);m.update(SIDELINE_RETURN+.01,idle);assert.equal(m.sideline,null);assert.equal(m.phase,'restart');assert.equal(m.stats[0].substitutions,1);assert(m.restart.readyAt>m.phaseTime);
});
test('sideline presentation never freezes live match motion or its clock',()=>{
 const m=fixture();m.phase='playing';m.elapsed=20;m.sideline={id:91,kind:'substitution',team:0,duration:5.4,time:0,changes:[]};
 const start=m.elapsed;m.update(.2,idle);assert(m.elapsed>start);assert.equal(m.sideline,null);assert.equal(m.phase,'playing');
});
test('half-time changes wait for Continue and replace the extra half-time cutaway',()=>{
 const m=fixture();m.phase='halftime';m.elapsed=90;m.queueSubstitution(m.players[5].id,m.benches[0][0].id);m.update(20,idle);assert(!m.sideline);assert.equal(m.phase,'halftime');
 m.random=()=>0;m.continueHalf();m.update(1/60,idle);assert.equal(m.sideline.kind,'substitution');assert(m.sidelineQueue.some(c=>c.kind==='halftime'&&c.variant==='water'));assert(m.sidelineQueue.find(c=>c.kind==='halftime').after>=m.sideline.duration+SIDELINE_RETURN);assert.equal(m.direction(0),-1);assert.equal(m.elapsed,90);
 for(let guard=0;!['halftime'].includes(m.sideline?.kind)&&guard<8;guard++)m.update(m.sideline?m.sideline.duration+SIDELINE_RETURN+.02:.02,idle);assert.equal(m.sideline.kind,'halftime');assert.equal(m.sideline.variant,'water');
 const noSub=fixture();noSub.phase='halftime';noSub.continueHalf();noSub.update(1/60,idle);assert.equal(noSub.sideline.kind,'halftime');
});
test('a coach calls one tactical timeout for the trailing team at a restart',()=>{
 const m=fixture();m.random=()=>0;m.phase='playing';m.elapsed=70;m.stats[0].goals=0;m.stats[1].goals=1;
 m.beginRestart({type:'CORNER',team:0,x:20,z:40});assert.equal(m.timeouts[0],true);m.update(.02,idle);assert.equal(m.sideline.kind,'timeout');assert.equal(m.sideline.team,0);assert.equal(m.sideline.variant,'tactical');assert.equal(m.elapsed,70);
 m.skipSideline();m.update(m.sideline.duration+SIDELINE_RETURN+.02,idle);m.update(.02,idle);assert.equal(m.sideline,null);
});
test('major fouls show the referee first; ordinary fouls have no staff scene',()=>{
 const m=fixture();m.phase='playing';m.players[5].x=0;m.players[5].z=0;m.foul(m.players[9],m.players[5]);assert.equal(m.sidelineQueue?.length||0,0);
 m.foul(m.players[9],m.players[5],'red');m.update(.1,idle);assert(!m.sideline);m.phaseTime=6;m.update(.1,idle);assert.equal(m.sideline.kind,'foul');
});
test('opponent coach reacts after every goal replay, and full-time results wait for their own short scene',()=>{
 const m=fixture();m.phase='playing';m.elapsed=20;m.ball.lastTouch=m.players[5];m.goal(0);assert(!m.sideline);assert.equal(m.sidelineQueue?.length||0,0);
 m.skipReplay();m.update(.01,idle);assert.equal(m.sideline.kind,'goal-reaction');assert.equal(m.sideline.team,1);assert.equal(m.sideline.scoringTeam,0);assert.equal(m.elapsed,20);
 const end=fixture();end.phase='playing';end.half=2;end.elapsed=179.999;end.update(1/120,idle);assert.equal(end.phase,'outro');end.update(.01,idle);assert.equal(end.sideline.kind,'fulltime');assert.equal(end.elapsed,180);
 end.skipSideline();end.update(1,idle);end.update(.01,idle);assert.equal(end.phase,'fulltime');assert.equal(end.elapsed,180);
});
test('cutaways combine same-team substitutions and vary repeated reactions',()=>{
 const m=fixture();m.phase='restart';queueSideline(m,'substitution',0,{outPlayer:{name:'A'},inPlayer:{name:'B'}});queueSideline(m,'substitution',0,{outPlayer:{name:'C'},inPlayer:{name:'D'}});assert.equal(m.sidelineQueue.length,1);assert.equal(m.sidelineQueue[0].changes.length,2);
 m.sidelineQueue=[];queueSideline(m,'foul',0);const first=m.sidelineQueue.pop().variant;queueSideline(m,'foul',0);assert.notEqual(m.sidelineQueue[0].variant,first);
});
test('H2H synchronizes staff scenes, timeout use and both players can skip',()=>{
 const host=new LiveSimulation(teams,{duration:1,difficulty:'normal'},23),guest=new LiveSimulation(teams,{duration:1,difficulty:'normal'},23);
 host.command(0,{type:'skipIntro'});host.match.timeouts[0]=true;host.match.queueSubstitution(host.match.players[5].id,host.match.benches[0][0].id);host.input(0,idlePacket());host.step();
 const view=new SnapshotView(guest.match,1);view.push(JSON.parse(JSON.stringify(snapshot(host.match,host.tick))));view.update();assert.deepEqual(guest.match.sideline,host.match.sideline);assert.deepEqual(guest.match.timeouts,host.match.timeouts);
 host.command(1,{type:'skipSideline'});assert.equal(host.match.sideline.time,host.match.sideline.duration);
});
test('staff and seated bench gestures produce bounded, finite poses',()=>{
 const p=fixture().players[4];p.role='STAFF';p.vx=p.vz=0;
 for(const name of ['instructions','talk','listen','shout','argue','welcome','reflect','applaud','celebrate','timeout']){p.animate('staff-'+name,4.8);for(let i=0;i<=120;i++){p.action.time=i/25;const pose=animationPose(p,i/25);assert(Object.values(pose).every(Number.isFinite),name);assert(Math.abs(pose.y)<.2,name);}}
 p.role='SUB';for(const name of ['bench-sit','bench-talk','bench-drink','team-talk','team-drink']){p.animate(name,5.8);for(let i=0;i<=30;i++){p.action.time=i/6;const pose=animationPose(p,i/6);assert(Object.values(pose).every(Number.isFinite),name);}}
});
