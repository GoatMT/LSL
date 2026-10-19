import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Match} from '../src/match/match.js';
import {createLineup} from '../src/data.js';
import {CELEBRATIONS,chooseCelebration,preferredCelebration,updateCelebration} from '../src/match/celebrations.js';
import {animationPose} from '../src/engine/animations.js';
import {Settings} from '../src/settings.js';
import {WEATHER_OPTIONS} from '../src/weather-options.js';
import {validateOptions} from '../functions/policy.js';
import {MatchWeather} from '../src/engine/weather.js';
import {MatchLighting} from '../src/engine/lighting.js';
import * as T from '../vendor/three.module.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
const game=()=>new Match(teams,{duration:3,difficulty:'normal',minorInjuries:false},{random:()=>.5});
test('all 16 celebrations are reachable, finite, continuous and recover',()=>{
 const m=game(),p=m.players[5];p.data.leadershipRole='captain';m.stats[0].goals=1;
 const seen=new Set();for(let i=0;i<2000;i++){m.random=()=>i/2000;seen.add(chooseCelebration(m,p,0).name);}
 m.elapsed=179;m.random=()=>.9;seen.add(chooseCelebration(m,p,0).name);
 for(const name of CELEBRATIONS){assert(seen.has(name),name);p.vx=p.vz=0;p.animate(name,8.5);let previous;
   for(let i=0;i<=510;i++){p.action.time=i/60;const pose=animationPose(p,i/60);assert(Object.values(pose).every(Number.isFinite),name);assert(pose.y>-.8&&pose.y<1.1,name);
     if(previous)for(const key of Object.keys(pose)){const delta=key==='yaw'?Math.atan2(Math.sin(pose[key]-previous[key]),Math.cos(pose[key]-previous[key])):pose[key]-previous[key];assert(Math.abs(delta)<.5,name+' '+key);}
     previous=pose;
   }
 }
});
test('preferences are stable; captains, finals, equalizers and late goals get contextual choices',()=>{
 const m=game(),p=m.players[5];assert.equal(preferredCelebration(p),preferredCelebration({...p}));m.stats[0].goals=1;m.stats[1].goals=1;
 assert(chooseCelebration(m,p,0).equalizer);assert.equal(chooseCelebration(m,p,0).duration,10.5);
 m.stats[1].goals=0;m.tournament={round:'Final'};assert(chooseCelebration(m,p,0).final);
 m.tournament={round:'Semifinal'};assert(!chooseCelebration(m,p,0).final);
 m.elapsed=175;assert(chooseCelebration(m,p,0).lateWinner);
 m.previousCelebration=chooseCelebration(m,p,0).name;assert.notEqual(chooseCelebration(m,p,0).name,m.previousCelebration);
});
test('crossed arms have distinct shoulder rotation; double slides synchronize two actors',()=>{
 const m=game(),p=m.players[5];p.animate('celebrate-crossed',8.5);p.action.time=4;
 const crossed=animationPose(p,4);assert(crossed.laY>.5&&crossed.raY<-.5);
 m.ball.lastTouch=p;m.goal(0);m.celebration.name=m.goalCelebration='celebrate-double-slide';
 p.animate(m.goalCelebration,10.5);const mate=m.celebrationMates[0];mate.x=p.x+p.faceZ*2.1;mate.z=p.z-p.faceX*2.1;
 updateCelebration(m,1/60);assert(m.doubleSlideStarted);assert.equal(mate.action.name,'celebrate-double-slide');assert.equal(mate.action.time,p.action.time);
});
test('full celebration precedes replay; goals freeze match time and return cleanly to kickoff',()=>{
 const m=game();m.resetFormation();m.phase='playing';m.elapsed=55;m.ball.lastTouch=m.players[5];m.goal(0);
 const initial=m.players.map(p=>({x:p.x,z:p.z}));
 for(let i=0;i<300;i++)m.update(1/60,idle);
 assert.equal(m.replayStage,'celebrate');assert.equal(m.elapsed,55);
 assert(m.celebrationMates.some(p=>Math.hypot(p.x-initial[m.players.indexOf(p)].x,p.z-initial[m.players.indexOf(p)].z)>1));
 for(let i=0;i<1200&&m.phase==='goal';i++)m.update(1/60,idle);
 assert.equal(m.phase,'restart');assert.equal(m.restart.type,'KICK OFF');assert.equal(m.restart.team,1);assert.equal(m.elapsed,55);
 for(const p of m.players)assert.equal(p.action,null);
});
test('skip replay remains responsive and sent-off players never join celebrations',()=>{
 const m=game();m.players[4].sentOff=true;m.ball.lastTouch=m.players[5];m.goal(0);
 assert(!m.celebrationMates.includes(m.players[4]));m.skipReplay();assert(!m.replayActive);
 for(let i=0;i<90;i++)m.update(1/60,idle);assert.equal(m.phase,'restart');
});
test('four weather options persist and pass server room validation',()=>{
 for(const weather of WEATHER_OPTIONS){const saved=new Settings({getItem:()=>JSON.stringify({weather}),setItem:()=>{}});assert.equal(saved.value.weather,weather);
 assert.equal(validateOptions({duration:3,difficulty:'normal',season:'2026',weather},{2026:teams}).weather,weather);}
 assert.equal(new Settings({getItem:()=>JSON.stringify({weather:'storm'}),setItem:()=>{}}).value.weather,'clear');
});
test('weather renders bounded particles, scales detail and restores clear lighting',()=>{
 const scene=new T.Scene(),weather=new MatchWeather(scene),lighting=new MatchLighting(scene);
 for(const kind of WEATHER_OPTIONS)for(const quality of ['low','medium','high']){
   weather.set(kind,quality);weather.update(.016,{x:10,z:-20});lighting.weather=kind;lighting.set('day');
   assert(weather.positions.every(Number.isFinite));assert.equal(weather.particles.visible,['rain','snow'].includes(kind));
   assert(weather.count<=900);if(quality==='low')assert(weather.count<=160);
 }
 lighting.weather='clear';lighting.set('day');assert.equal(lighting.sun.intensity,3.2);assert.equal(scene.fog.near,185);
 weather.dispose();assert(!scene.children.includes(weather.particles));
});
