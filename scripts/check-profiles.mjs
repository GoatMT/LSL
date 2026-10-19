import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadWebsiteProfiles } from './website-profiles.mjs';
const root=path.resolve(import.meta.dirname,'..'),source=path.resolve(process.argv[2]||'../LSL Website');
const {profiles,aliases}=await loadWebsiteProfiles(source);
const seasons=JSON.parse(await fs.readFile(path.join(root,'data/seasons.json'),'utf8'));
let checked=0;
for(const season of seasons){
  const data=JSON.parse(await fs.readFile(path.join(root,season.file),'utf8'));
  const original=JSON.parse(await fs.readFile(path.join(source,'data',season.year,'teams.json'),'utf8'));
  for(const team of data.teams)for(const player of team.roster){
    const member=original.teams.find(t=>t.id===team.id)?.roster.find(p=>p.id===player.id);
    assert(member,'Roster membership missing: '+player.id);assert.equal(player.name,member.name);
    const id=aliases[player.id]||player.id,expected=profiles.get(id);
    assert.equal(player.profileId,id);assert.equal(player.overall,expected.overall,player.name);
    assert.deepEqual(player.playstyle,JSON.parse(JSON.stringify(expected.playstyle)),player.name);checked++;
  }
}
console.log(checked+' roster entries match the actual LSL Website career ratings, styles, traits, names and memberships.');
