import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { verifyJerseyAudit, jerseyAuditSummary } from './jersey-data.mjs';
import { ADVERTISEMENTS } from '../src/advertisements.js';
const root=path.resolve(import.meta.dirname,'..');
let checks=0;
async function exists(file){await fs.access(file);checks++;}
async function walk(dir){const entries=await fs.readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(dir,e.name)):path.join(dir,e.name)))).flat();}
for(const file of await walk(path.join(root,'src'))){
  if(!file.endsWith('.js'))continue;
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);checks++;
  const content=await fs.readFile(file,'utf8');
  for(const match of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g))await exists(path.resolve(path.dirname(file),match[1]));
}
const html=await fs.readFile(path.join(root,'index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw Error('Duplicate HTML IDs');
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g))await exists(path.join(root,match[1].split(/[?#]/)[0]));
for(const [file,mode] of [['quick-match.html','quick'],['rivalry-matches.html','rivalry'],['tournament-mode.html','tournament'],['season-mode.html','season'],['dream-fc.html','dream']]){const page=await fs.readFile(path.join(root,file),'utf8');if(!page.includes('data-mode-page="'+mode+'"'))throw Error('Mode page missing route marker: '+file);for(const match of page.matchAll(/(?:src|href)="(\.\/[^"]+)"/g))await exists(path.join(root,match[1].split(/[?#]/)[0]));}
const requiredShellIds=new Set(ids);
for(const file of ['quick-match.html','rivalry-matches.html','tournament-mode.html','season-mode.html','dream-fc.html']){const page=await fs.readFile(path.join(root,file),'utf8'),pageIds=new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])),missing=[...requiredShellIds].filter(id=>!pageIds.has(id));if(missing.length)throw Error('Mode page missing shared game controls: '+file+' → '+missing.join(', '));}
await exists(path.join(root,'live-h2h.html'));await exists(path.join(root,'live-h2h.css'));await exists(path.join(root,'LIVE-H2H-SETUP.md'));
const liveHTML=await fs.readFile(path.join(root,'live-h2h.html'),'utf8');for(const link of liveHTML.matchAll(/(?:src|href)="(\.\/[^"]+)"/g))await exists(path.join(root,link[1].split(/[?#]/)[0]));
await exists(path.join(root,'account.html'));await exists(path.join(root,'account.css'));await exists(path.join(root,'src/account-page.js'));await exists(path.join(root,'charts.html'));await exists(path.join(root,'charts.css'));await exists(path.join(root,'src/charts-page.js'));await exists(path.join(root,'admin.html'));await exists(path.join(root,'admin.css'));await exists(path.join(root,'src/admin-page.js'));await exists(path.join(root,'design-tokens.css'));await exists(path.join(root,'shared-ui.css'));await exists(path.join(root,'game-presentation.css'));await exists(path.join(root,'game-modes.css'));await exists(path.join(root,'src/firebase-config.js'));await exists(path.join(root,'firestore.rules'));
const htmlPages=(await fs.readdir(root)).filter(file=>file.endsWith('.html'));
for(const file of htmlPages){const full=path.join(root,file),page=await fs.readFile(full,'utf8'),styles=[...page.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);if(styles.length&&!styles.includes('./design-tokens.css'))throw Error('Page missing shared design tokens: '+file);if(new Set(styles).size!==styles.length)throw Error('Duplicate stylesheet link: '+file);for(const match of page.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g))await exists(path.resolve(path.dirname(full),match[1].split(/[?#]/)[0]));}
const manifest=JSON.parse(await fs.readFile(path.join(root,'data/seasons.json'),'utf8'));
let teams=0,players=0;
for(const season of manifest){
  const data=JSON.parse(await fs.readFile(path.join(root,season.file),'utf8'));
  for(const team of data.teams){
    if(team.roster.length<7)throw Error('Insufficient roster: '+team.name);
    if(new Set(team.roster.map(p=>p.id)).size!==team.roster.length)throw Error('Duplicate roster IDs');
    if(team.logo)await exists(path.join(root,team.logo));teams++;players+=team.roster.length;
  }
}
await exists(path.join(root,'vendor/three.module.js'));await exists(path.join(root,'vendor/THREE-LICENSE.txt'));await exists(path.join(root,'data/ultimate-team.json'));
for(const ad of ADVERTISEMENTS){if(!ad.asset.startsWith('assets/')||ad.asset.includes('..'))throw Error('Ads must use bundled relative assets');await exists(path.join(root,ad.asset));}
const jerseyAudit=JSON.parse(await fs.readFile(path.join(root,'data/jersey-audit.json'),'utf8'));
await verifyJerseyAudit(root,jerseyAudit);
console.log(checks+' syntax and static asset checks passed. '+manifest.length+' seasons, '+teams+' teams, '+players+' season roster entries. CPU gameplay is static; Live H2H requires deployed Firebase services and WebRTC.');
console.log(jerseyAuditSummary(jerseyAudit));

