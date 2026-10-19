import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Match } from '../src/match/match.js';
import { createLineup } from '../src/data.js';
import { playerAttributes } from '../src/match/attributes.js';
import { SEASON_KITS,teamKit } from '../src/kits.js';
const season=JSON.parse(fs.readFileSync(new URL('../data/2026.json',import.meta.url)));
const teams=season.teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster);return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id))};});
const input={held:new Set(),pressed:new Set(['pass']),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};
test('M passes in possession and switches to the closest active outfield player otherwise',()=>{
  for(const opponent of [false,true]){
    const m=new Match(teams,{duration:3,difficulty:'normal'});m.phase='playing';m.switchCooldown=10;m.controlled=m.players[4];
    m.players[2].x=2;m.players[2].z=0;m.players[0].x=.1;m.players[0].z=0;m.ball.reset();
    if(opponent){m.players[12].x=0;m.players[12].z=0;m.ball.take(m.players[12]);}
    m.update(1/120,input);assert.equal(m.controlled,m.players[2]);assert.equal(m.stats[0].passes,0);
  }
  const m=new Match(teams,{duration:3,difficulty:'normal'});m.phase='playing';m.ball.take(m.controlled);
  m.update(1/120,input);for(let i=0;i<70&&m.stats[0].passes===0;i++)m.update(1/120,{...input,pressed:new Set()});assert.equal(m.stats[0].passes,1);assert(m.ball.pass?.target);
});
test('manual nearest-player switching overrides the automatic pass receiver',()=>{
  const m=new Match(teams,{duration:3,difficulty:'normal'});m.phase='playing';m.ball.take(m.controlled);m.pass(m.controlled);
  const nearest=m.players[1];nearest.x=m.ball.x+.4;nearest.z=m.ball.z;nearest.cooldown=1;
  m.update(1/120,input);assert.equal(m.controlled,nearest);
  m.update(1/120,{...input,pressed:new Set()});assert.equal(m.controlled,nearest);
});
test('all seasons include career overalls and complete website playstyle profiles',()=>{
  let count=0;for(const year of ['2024','2025','2026']){
    const data=JSON.parse(fs.readFileSync(new URL('../data/'+year+'.json',import.meta.url)));
    for(const team of data.teams)for(const p of team.roster){
      assert(Number.isInteger(p.overall)&&p.overall>=45&&p.overall<=99,p.name);
      assert(p.profileId&&p.playstyle.label&&p.playstyle.description&&p.playstyle.traits.length===3);count++;
    }
  }assert.equal(count,278);
});
test('the seven supplied 2026 kits are season-specific with the requested patterns',()=>{
  assert.equal(Object.keys(SEASON_KITS['2026']).length,7);
  assert.equal(teamKit('2026','leeward-lions').pattern,'gradient');
  assert.equal(teamKit('2026','gangat-warriors').pattern,'stripe');
  assert.equal(teamKit('2026','refuel-rovers').pattern,'sleeves');
  assert.equal(teamKit('2026','rawaha-royals').pattern,'sash');
  assert.notDeepEqual(teamKit('2026','leeward-lions'),teamKit('2025','leeward-lions'));
  for(const kit of Object.values(SEASON_KITS['2026']))for(const key of ['primary','secondary','trim','shorts','socks'])assert(/^#[0-9a-f]{6}$/i.test(kit[key]));
});
test('published profiles have modest, distinct effects without difficulty speed boosts',()=>{
  const neutral=playerAttributes({overall:75}),creator=playerAttributes({overall:75,playstyle:{label:'Creator'}}),anchor=playerAttributes({overall:75,playstyle:{label:'Defensive Anchor'}});
  assert(creator.passLead>neutral.passLead);assert(anchor.defending>neutral.defending);
  assert(playerAttributes({overall:99}).speed/playerAttributes({overall:50}).speed<1.07);
  const easy=new Match(teams,{difficulty:'easy',duration:3}),hard=new Match(teams,{difficulty:'hard',duration:3});
  assert.deepEqual(easy.players.map(p=>p.attributes),hard.players.map(p=>p.attributes));
});
