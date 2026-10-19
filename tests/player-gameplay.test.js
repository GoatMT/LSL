import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {playerAttributes,playerRatings} from '../src/match/attributes.js';
import {appearanceFor} from '../src/engine/appearance.js';
import {tailoredTorso} from '../src/engine/player-mesh-parts.js';
import {createLineup} from '../src/data.js';
const profiles=JSON.parse(await readFile(new URL('../data/player-gameplay-2026.json',import.meta.url),'utf8')).players;
const season=JSON.parse(await readFile(new URL('../data/2026.json',import.meta.url),'utf8'));
test('profile references exist in the real 2026 LSL rosters and leave OVR untouched',()=>{
 const ids=new Set(season.teams.flatMap(t=>t.roster.map(p=>p.id)));
 for(const id of Object.keys(profiles))assert(ids.has(id),'unknown roster id '+id);
 const player=season.teams.flatMap(t=>t.roster).find(p=>p.id==='mudassir');
 assert.equal(player.overall,98);assert.equal(playerRatings({...player,gameplayProfile:profiles.mudassir}).speed,100);
});
test('scouting adjusts dribbling, strength and goalkeeper attributes',()=>{
 assert(playerAttributes({overall:98,gameplayProfile:profiles.mudassir}).dribble>playerAttributes({overall:98}).dribble);
 assert(playerAttributes({overall:77,gameplayProfile:profiles['ishaaq-ali']}).strength>1.2);
 assert(playerAttributes({overall:99,position:'Goalie',gameplayProfile:profiles['saad-khan']}).keeper>1.2);
 assert(playerAttributes({overall:72,gameplayProfile:{status:'unknown'}}).speed===playerAttributes({overall:72}).speed);
});
test('physical notes affect model proportions and glasses',()=>{
 const mosa=appearanceFor({id:'mosa-fazli',gameplayProfile:profiles['mosa-fazli']}),tall=appearanceFor({id:'mohammed-ibrahim',gameplayProfile:profiles['mohammed-ibrahim']});
 assert(mosa.height<.96);assert(mosa.build>1&&mosa.build<1.1);assert(tall.height>1.04);
 assert.equal(appearanceFor({id:'tulha-ahmed',gameplayProfile:profiles['tulha-ahmed']}).glasses,true);
});
test('player meshes use smooth geometry and fuller profiles gain a rounded torso',()=>{
 const lean=tailoredTorso(0),full=tailoredTorso(1.6);lean.computeBoundingBox();full.computeBoundingBox();
 assert(full.boundingBox.max.x>lean.boundingBox.max.x*1.15);
 assert(full.attributes.normal.count>1000);assert([...full.attributes.normal.array].every(Number.isFinite));
 lean.dispose();full.dispose();
});
test('2026 lineup keeps designated Refuel rookie on the bench',()=>{
 const team=season.teams.find(t=>t.id==='refuel-rovers');
 const roster=team.roster.map(p=>({...p,gameplayProfile:profiles[p.id]||{status:'unknown'}}));
 const lineup=createLineup(roster);assert(!lineup.some(p=>p.id==='ibrahim-syed'));
});
test('backup keeper flags and momentum profile are available to match code',()=>{
 assert.equal(profiles['muhammad-salim'].backupGoalkeeper,true);
 assert.equal(profiles['muhammad-zaidan'].backupGoalkeeper,true);
 assert(playerAttributes({overall:75,gameplayProfile:profiles['yousaf-hosseinzada']}).momentum>1.1);
});
