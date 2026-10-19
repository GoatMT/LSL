import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

// Run the website's own loader and calculations at sync time. Runtime stays static.
export async function loadWebsiteProfiles(source){
  source=path.resolve(source);
  const loader=await import(pathToFileURL(path.join(source,'js/dataLoader.js')));
  const engine=await import(pathToFileURL(path.join(source,'js/leagueEngine.js')));
  const sourceCode=await fs.readFile(path.join(source,'js/playerProfile.js'),'utf8');
  const start=sourceCode.indexOf('function careerTotals('),end=sourceCode.indexOf('function isGoalkeeperProfile(',start);
  if(start<0||end<start)throw Error('Website player-style functions changed; update the profile adapter before syncing.');
  const style=vm.runInNewContext(sourceCode.slice(start,end)+'\ninferPlayerStyle;',Object.create(null),{timeout:1000});
  const originalFetch=globalThis.fetch;
  let seasons;
  try{
    globalThis.fetch=async request=>{
      const relative=String(request).replace(/^\.\//,''),file=path.resolve(source,relative);
      if(!file.startsWith(source+path.sep)||!relative.startsWith('data/')||!file.endsWith('.json'))throw Error('Only website JSON may be loaded by the profile adapter.');
      try{return new Response(await fs.readFile(file,'utf8'),{status:200,headers:{'content-type':'application/json'}});}
      catch(error){if(error.code==='ENOENT')return new Response(null,{status:404});throw error;}
    };
    seasons=await loader.loadAllSeasons();
  }finally{globalThis.fetch=originalFetch;}
  const pool=engine.computeCombinedPlayerStats(seasons,{stage:'all'});
  const seasonStats=seasons.map(s=>engine.computePlayerStats(s,{stage:'all'}));
  const profiles=new Map(pool.map(p=>{
    const career=seasonStats.flatMap(rows=>rows.filter(row=>row.id===p.id));
    return [p.id,{overall:engine.playerOVR(p,pool),playstyle:style(p,career)}];
  }));
  const ratings=new Map(engine.playersWithOVR(pool,pool).map(p=>[p.id,p.ovr]));
  const teamRatings=new Map(seasons.map(season=>[String(season.year),new Map(season.teams.map(team=>[team.id,engine.teamOVR(team,ratings)]))]));
  const aliases=JSON.parse(await fs.readFile(path.join(source,'data/player-aliases.json'),'utf8'));
  const files=['js/dataLoader.js','js/leagueEngine.js','js/playerProfile.js','js/config.js','data/player-aliases.json'];
  for(const season of seasons)for(const file of ['teams','players','matches','awards','playoffs'])files.push('data/'+season.year+'/'+file+'.json');
  const hashes={};for(const file of files){try{hashes[file]=createHash('sha256').update(await fs.readFile(path.join(source,file))).digest('hex');}catch(error){if(error.code!=='ENOENT')throw error;}}
  return {profiles,aliases,teamRatings,provenance:{teamBasis:'LSL Website teamOVR using the full published season roster and career player ratings',basis:'LSL Website career OVR and inferPlayerStyle, all games; not season-only ratings',seasons:seasons.map(s=>s.year),files:hashes}};
}
