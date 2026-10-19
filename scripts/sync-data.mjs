import fs from 'node:fs/promises';
import path from 'node:path';
import { loadWebsiteProfiles } from './website-profiles.mjs';
import { resolveJersey, auditWebsiteJerseys, verifyJerseyAudit, jerseyAuditSummary } from './jersey-data.mjs';
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.argv[2] || '../LSL Website');
const years = (process.argv[3] || '2024,2025,2026').split(',');
const manifest = [];
const {profiles,aliases,teamRatings,provenance}=await loadWebsiteProfiles(source);
const jerseyAudit=await auditWebsiteJerseys(source,years);
await fs.mkdir(path.join(root, 'assets/logos'), { recursive: true });
for (const year of years) {
  const payload = JSON.parse(await fs.readFile(path.join(source, `data/${year}/teams.json`), 'utf8'));
  if(payload.teams.filter(t=>(t.roster||[]).length>=7).length<2)throw Error('Season '+year+' needs at least two complete real rosters before it can be published.');
  let extras = { players: [] };
  try { extras = JSON.parse(await fs.readFile(path.join(source, `data/${year}/players.json`), 'utf8')); } catch {}
  const teams = [];
  for (const team of payload.teams) {
    const roster = (team.roster || []).map(p => {
      const extra = extras.players?.find(x => x.id === p.id && x.teamId === team.id);
      const profileId=aliases[p.id]||p.id,profile=profiles.get(profileId);
      if(!profile)throw Error('No website career profile found for '+p.name+' ('+profileId+').');
      return { id: p.id, name: p.name, jersey: resolveJersey(p,team.id,extras.players||[],year).jersey,
        position: p.position === 'Field' && extra?.position ? extra.position : p.position || 'Field',
        leadershipRole: p.leadershipRole || null,profileId,...profile };
    });
    let logo = null;
    if (team.logo) {
      const sourceLogo = path.resolve(source, team.logo);
      const dest = `assets/logos/${year}-${team.id}${path.extname(sourceLogo).toLowerCase()}`;
      try { await fs.copyFile(sourceLogo, path.join(root, dest)); logo = dest; } catch { console.warn(`Missing badge: ${team.name}`); }
    }
    teams.push({ id: team.id, name: team.name, shortName: team.shortName, division: team.division,
      overall:teamRatings.get(String(year))?.get(team.id)??null, logo, logoBg: team.logoBg || '#ffffff', colors: team.colors || null, roster });
  }
  await fs.writeFile(path.join(root, `data/${year}.json`), JSON.stringify({ season: year, teams }, null, 2) + '\n');
  manifest.push({ year, file: `data/${year}.json` });
}
try { await fs.copyFile(path.join(source, 'Logos/lsl-logo.png'), path.join(root, 'assets/lsl-logo.png')); } catch {}
await fs.writeFile(path.join(root, 'data/seasons.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(root,'data/profile-source.json'),JSON.stringify(provenance,null,2)+'\n');
await verifyJerseyAudit(root,jerseyAudit);
await fs.writeFile(path.join(root,'data/jersey-audit.json'),JSON.stringify(jerseyAudit,null,2)+'\n');
console.log(`Synced ${manifest.length} seasons. Original IDs, memberships and known numbers preserved.`);
console.log(jerseyAuditSummary(jerseyAudit));
