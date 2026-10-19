import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {teamOverall} from '../src/ratings.js';
import {Player} from '../src/match/player.js';
import {Match} from '../src/match/match.js';
import {Settings,DEFAULT_KEYS,CONTROL_NAMES} from '../src/settings.js';
import {createLineup} from '../src/data.js';
const player=(overall=75,team=0,slot=5)=>new Player({id:'p-'+overall,name:'Player',overall},team,slot,team===0?1:-1);
const data=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url)));
const teams=data.teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(l=>l.id===p.id))};});
const idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
const match=()=>{const m=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.51});m.resetFormation();m.phase='playing';return m;};
test('published team OVR survives substitutions and red cards',()=>{
 const m=match(),expected=teamOverall(m.teams[0]),p=m.players[5];assert(Number.isFinite(expected));
 const incoming={...m.benches[0][0],overall:61};m.benches[0][0]=incoming;m.phase='halftime';
 m.queueSubstitution(p.id,incoming.id);assert.equal(p.data.overall,61);assert.equal(teamOverall(m.teams[0]),expected);
 p.sentOff=true;assert.equal(teamOverall(m.teams[0]),expected);
});
test('Team OVR displays the website value without lineup recalculation or a 60-point floor',()=>{
 assert.equal(teamOverall({overall:54}),54);assert.equal(teamOverall({overall:91,roster:[{overall:50}]}),91);
 assert.equal(teamOverall({roster:[]}),null);assert.equal(teamOverall(null),null);
 for(const year of [2024,2025,2026])for(const team of JSON.parse(fs.readFileSync(new URL('../data/'+year+'.json',import.meta.url))).teams){
  assert.equal(teamOverall(team),team.overall);assert(team.overall>=45&&team.overall<=99);
 }
});
test('legacy Q switching is removed and M is the sole pass/switch binding',()=>{
 let json=JSON.stringify({keys:{...DEFAULT_KEYS,pass:'KeyL',switch:'KeyQ'},difficulty:'hard',camera:'low',duration:4});
 const storage={getItem:()=>json,setItem:(_,v)=>json=v},s=new Settings(storage);
 assert.equal(s.value.keys.pass,'KeyM');assert(!Object.hasOwn(s.value.keys,'switch'));assert(!Object.values(s.value.keys).includes('KeyQ'));
 assert(!Object.hasOwn(CONTROL_NAMES,'switch'));assert.equal(s.value.difficulty,'hard');assert.equal(s.value.camera,'low');assert.equal(s.value.duration,4);
 s.bind('pass','KeyB');assert.equal(new Settings(storage).value.keys.pass,'KeyB');
});
test('touch switch and M choose the closest eligible outfield player',()=>{
 const m=match();m.ball.x=5;m.ball.z=2;m.controlled=m.players[4];const near=m.players[1];near.x=5.5;near.z=2;
 m.selectPlayer(true);assert.equal(m.controlled,near);
 m.controlled=m.players[4];m.update(1/120,{...idle,pressed:new Set(['pass'])});assert.equal(m.controlled,near);
});
