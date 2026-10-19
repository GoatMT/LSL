import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Match} from '../src/match/match.js';
import {createLineup} from '../src/data.js';
import {ScoreboardEvents,scoreboardNotice,eventDetails} from '../src/ui/scoreboard-events.js';
const teams=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url))).teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
function fixture(){const events=[];const m=new Match(teams,{duration:6,difficulty:'normal'},{random:()=>.99,event:(type,data)=>events.push({type,data})});m.resetFormation();m.phase='playing';return {m,events};}
test('injuries do not substitute human players, and queued substitutions cannot run during play',()=>{
 const {m,events}=fixture(),p=m.players[5],id=p.id;
 m.minorInjury(p);assert.equal(m.pending.length,0);assert.equal(m.phase,'playing');assert.equal(m.paused,false);
 const notice=events.find(e=>e.data?.title==='MINOR INJURY').data;assert.equal(notice.team,0);assert(notice.playerName.includes(p.name));
 m.queueSubstitution(p.id,m.benches[0][0].id);m.elapsed=250;m.applySubstitutions();m.autoSubstitute();
 assert.equal(p.id,id);assert.equal(m.subEvents.length,0);assert.equal(m.moment,undefined);
 m.beginRestart({type:'THROW-IN',team:0,x:0,z:20});assert.notEqual(p.id,id);assert.equal(m.stats[0].substitutions,1);assert.equal(m.phase,'restart');
 const swap=events.find(e=>e.type==='notice'&&e.data?.title==='SUBSTITUTION');assert(swap);assert(swap.data.playerName.includes(p.name));assert(swap.data.playerName.includes(m.players[5].name));
});
test('CPU injury replacements wait for a stoppage; H2H injuries never auto-select a human substitute',()=>{
 const {m}=fixture();const p=m.players[12],id=p.id;m.minorInjury(p);assert.equal(m.pending.length,1);m.applySubstitutions();assert.equal(p.id,id);
 m.beginRestart({type:'FREE KICK',team:0,x:0,z:0});assert.notEqual(p.id,id);
 const {m:live}=fixture();live.enableH2H();live.minorInjury(live.players[12]);assert.equal(live.pending.length,0);
});
test('routine notices stay in the scoreboard and identify the event team rather than ball possession',()=>{
 const {m}=fixture();m.ball.owner=m.players[5];
 for(const title of ['MINOR INJURY','SAVE','SUBSTITUTION QUEUED','SUBSTITUTION'])assert(scoreboardNotice({title},m));
 assert.equal(scoreboardNotice({title:'GOAL!'},m),false);
 const details=eventDetails({title:'SAVE',team:1,playerName:'Keeper #1'},m);assert.equal(details.team,teams[1].name);assert.equal(details.logo,teams[1].logo);assert.equal(details.player,'Keeper #1');
});
test('scoreboard restores normal content after 4.5 seconds without changing its layout nodes',()=>{
 class Node{constructor(){this.children=[];this.attrs={};this.classList={add:()=>{},remove:()=>{}};}append(...nodes){this.children.push(...nodes);}querySelector(){return null;}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}}
 const previous=globalThis.document;globalThis.document={createElement:()=>new Node()};
 try{const root=new Node(),normal=new Node();root.append(normal);const banner=new ScoreboardEvents(root);banner.show({title:'SAVE',team:1},fixture().m);banner.update(4.4);assert.equal(banner.current.title,'SAVE');assert.equal(normal.attrs['aria-hidden'],'true');banner.update(.11);assert.equal(banner.current,null);assert.equal(normal.attrs['aria-hidden'],undefined);assert.equal(root.children[0],normal);}finally{globalThis.document=previous;}
});
