import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Match } from '../src/match/match.js';
import { createLineup } from '../src/data.js';
import { playerLabel } from '../src/player-label.js';

const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'));
const current=read('../data/2026.json');
function fixture(){
  const teams=['leeward-lions','rawaha-royals'].map(id=>{
    const t=current.teams.find(t=>t.id===id),lineup=createLineup(t.roster);
    return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};
  });
  const notices=[],match=new Match(teams,{duration:3,difficulty:'normal'},{random:()=>.51,event:(type,data)=>{if(type==='notice')notices.push(data);}});
  return {match,notices};
}

test('all 34 user-confirmed jersey assignments remain tied to their exact season, team and ID',()=>{
  const expected=read('./fixtures/confirmed-jerseys.json');assert.equal(expected.length,34);
  for(const {year,teamId,playerId,jersey} of expected){
    const team=read('../data/'+year+'.json').teams.find(t=>t.id===teamId);
    assert(team,teamId);assert.equal(team.roster.find(p=>p.id===playerId)?.jersey,jersey,year+' '+teamId+' '+playerId);
  }
  const am=current.teams.find(t=>t.id==='amax-visionaries');
  assert.equal(am.roster.find(p=>p.id==='adil-mubashir').jersey,null,'Unspecified numbers must stay unavailable.');
  const refuel=current.teams.find(t=>t.id==='refuel-rovers');
  assert.equal(refuel.roster.find(p=>p.id==='mohammad-usman').jersey,7,'A duplicate must not silently renumber an unrequested player.');
});

test('player labels print source numbers and omit unavailable values without inventing a fallback',()=>{
  assert.equal(playerLabel({name:'Mudassir',jersey:2}),'Mudassir #2');
  assert.equal(playerLabel({name:'Player',jersey:0}),'Player #0');
  for(const jersey of [null,undefined,'',NaN,-1])assert.equal(playerLabel({name:'Player',jersey}),'Player');
});

test('goal, assist and substitution records retain original numbers after players are replaced',()=>{
  const {match:m,notices}=fixture(),scorer=m.players.find(p=>p.id==='mudassir'),assist=m.players.find(p=>p.id==='muhammad-teli');
  assert(scorer&&assist);m.phase='playing';m.ball.lastTouch=scorer;m.ball.previousTouch=assist;m.goal(0);
  assert.equal(notices.find(n=>n.title==='GOAL!').subtitle,'Mudassir #2 · Leeward Lions');
  const goal=structuredClone(m.goalEvents[0]);
  assert.equal(goal.jersey,2);assert.equal(goal.assistJersey,8);
  const incoming=m.benches[0][0],outName=scorer.name;
  m.phase='halftime';m.queueSubstitution(scorer.id,incoming.id);
  assert.equal(scorer.id,incoming.id);assert.equal(scorer.jersey,incoming.jersey);
  assert.deepEqual(m.goalEvents[0],goal,'Substitution must not rewrite the earlier goal.');
  assert.equal(m.subEvents[0].out,outName);assert.equal(m.subEvents[0].outJersey,2);assert.equal(m.subEvents[0].inJersey,incoming.jersey);
});

test('foul and card notices identify both players with their numbers, including a stoppage substitution',()=>{
  for(const severity of ['none','yellow','red']){
    const {match:m,notices}=fixture(),victim=m.players.find(p=>p.id==='mudassir'),offender=m.players.find(p=>p.id==='mubashir-kharooti');
    assert(victim&&offender);m.phase='playing';
    m.queueSubstitution(victim.id,m.benches[0][0].id);
    m.foul(offender,victim,severity);
    const title=severity==='none'?'FOUL':severity.toUpperCase()+' CARD';
    assert.equal(notices.findLast(n=>n.title===title).subtitle,'Mubashir Kharooti #3 · Foul on Mudassir #2');
  }
});
