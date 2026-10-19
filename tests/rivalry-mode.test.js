import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {seasonRivalries,findRivalry,rivalryTeams,rivalryHistory} from '../src/rivalry-data.js';
const rivalries=JSON.parse(fs.readFileSync(new URL('../data/rivalries.json',import.meta.url))).rivalries;
const data=Object.fromEntries([2024,2025,2026].map(year=>[year,JSON.parse(fs.readFileSync(new URL('../data/'+year+'.json',import.meta.url)))]));
test('every season exposes featured playoff rematches with two distinct complete teams',()=>{
 for(const year of [2024,2025,2026]){
  const teams=data[year].teams.filter(t=>t.roster.length>=7),list=seasonRivalries(rivalries,String(year),teams);
  assert(list.length>=1);for(const r of list){assert.equal(r.teamIds.length,2);assert.notEqual(r.teamIds[0],r.teamIds[1]);assert(r.score.every(Number.isFinite));assert(rivalryTeams(r,teams).every(Boolean));}
 }
});
test('rivalry lookup is order independent and preserves the recorded result',()=>{
 const r=rivalries.find(x=>x.season==='2026'&&x.title==='Final rematch'),teams=data[2026].teams;
 assert.equal(findRivalry(rivalries,'2026',r.teamIds[0],r.teamIds[1]),r);assert.equal(findRivalry(rivalries,'2026',r.teamIds[1],r.teamIds[0]),r);
 assert.match(rivalryHistory(r,teams),/EM Haulers FC 2 – 1 Leeward Lions/);
});
test('rivalry records never prefill a live match score',()=>{
 for(const r of rivalries){assert.equal(r.score.length,2);assert(r.score.every(Number.isFinite));assert.notEqual(r.score[0]+r.score[1],undefined);}
});
