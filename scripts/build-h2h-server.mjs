import fs from 'node:fs/promises';
import path from 'node:path';
import {createLineup} from '../src/data.js';
import {DEFAULT_LINEUPS} from '../src/default-lineups.js';
import {SEASON_KITS,teamKit} from '../src/kits.js';
const root=path.resolve(import.meta.dirname,'..'),target=path.join(root,'functions','engine');const seen=new Set();
async function copy(relative){if(seen.has(relative))return;seen.add(relative);const source=await fs.readFile(path.join(root,'src',relative),'utf8');const to=path.join(target,relative);await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,source);for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const next=path.normalize(path.join(path.dirname(relative),match[1]));await copy(next);}}
await copy('h2h/simulation.js');await copy('match-history.js');await copy('account-store.js');
const catalog={};for(const season of JSON.parse(await fs.readFile(path.join(root,'data/seasons.json'),'utf8'))){const data=JSON.parse(await fs.readFile(path.join(root,season.file),'utf8'));catalog[season.year]=data.teams.filter(t=>t.roster?.length>=7).map(t=>{const lineup=createLineup(t.roster,DEFAULT_LINEUPS[season.year]?.[t.id]),kit=SEASON_KITS[season.year]?.[t.id]?.primary||t.colors?.primary||'#34657a';return {...t,season:season.year,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id)),kit,uniform:teamKit(season.year,t.id,kit)};});}
await fs.writeFile(path.join(root,'functions/catalog.json'),JSON.stringify(catalog));
console.log(`Prepared authoritative verification engine (${seen.size} modules) and ${Object.keys(catalog).length} season catalogs.`);
