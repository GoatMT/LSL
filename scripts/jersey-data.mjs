import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

function validateNumber(value, context) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid jersey number at ${context}: ${JSON.stringify(value)}`);
  return value;
}

// A number belongs to a team in a season, not to a career profile or roster slot.
export function resolveJersey(player, teamId, extras, year) {
  const matches = extras.filter(p => p.id === player.id && p.teamId === teamId);
  if (matches.length > 1) throw Error(`Ambiguous jersey source: ${year}/${teamId}/${player.id}`);
  const roster = validateNumber(player.jersey, `${year}/${teamId}/${player.id}/teams.json`);
  const profile = validateNumber(matches[0]?.jersey, `${year}/${teamId}/${player.id}/players.json`);
  const jersey = roster ?? profile;
  return {
    jersey,
    source: roster !== null ? `data/${year}/teams.json` : profile !== null ? `data/${year}/players.json` : null,
    conflict: roster !== null && profile !== null && roster !== profile ? { roster, profile, selected: roster } : null,
  };
}

export function auditSeasonJerseys(year, teams, extras = []) {
  const entries = [], conflicts = [], duplicates = [];
  for (const team of teams) {
    const numbers = new Map();
    for (const player of team.roster || []) {
      const resolved = resolveJersey(player, team.id, extras, year);
      entries.push({ teamId: team.id, playerId: player.id, name: player.name, jersey: resolved.jersey, source: resolved.source });
      if (resolved.conflict) conflicts.push({ teamId: team.id, playerId: player.id, ...resolved.conflict });
      if (resolved.jersey !== null) {
        if (!numbers.has(resolved.jersey)) numbers.set(resolved.jersey, []);
        numbers.get(resolved.jersey).push(player.id);
      }
    }
    for (const [jersey, playerIds] of numbers) if (playerIds.length > 1) duplicates.push({ teamId: team.id, jersey, playerIds });
  }
  return { year: String(year), total: entries.length, known: entries.filter(p => p.jersey !== null).length,
    missing: entries.filter(p => p.jersey === null).length, conflicts, duplicates, entries };
}

export async function auditWebsiteJerseys(source, years) {
  const files = [], seasons = [];
  for (const year of years) {
    const read = async (name, optional = false) => {
      const relative = `data/${year}/${name}.json`;
      let raw;
      try { raw = await fs.readFile(path.join(source, relative), 'utf8'); }
      catch (error) { if (optional && error.code === 'ENOENT') return { players: [] }; throw error; }
      files.push({ file: relative, sha256: createHash('sha256').update(raw).digest('hex') });
      const payload = JSON.parse(raw);
      if (payload.season != null && String(payload.season) !== String(year)) throw Error(`Wrong season in ${relative}`);
      return payload;
    };
    const teams = await read('teams'), extras = await read('players', true);
    seasons.push(auditSeasonJerseys(year, teams.teams, extras.players || []));
  }
  return {
    schemaVersion: 1,
    source: 'LSL Website local season data',
    policy: 'Use the exact season, team ID and player ID. teams.json roster wins a disagreement with players.json. Missing numbers remain null. Preserve and flag source conflicts and duplicate numbers; never fill with a roster index, previous-season number or another squad number.',
    excludedSources: ['Career profiles and other seasons', 'Representative tournament squads, including data/2026/tournament.json'],
    files,
    summary: { total: seasons.reduce((n, s) => n + s.total, 0), known: seasons.reduce((n, s) => n + s.known, 0),
      missing: seasons.reduce((n, s) => n + s.missing, 0), conflicts: seasons.reduce((n, s) => n + s.conflicts.length, 0),
      duplicateGroups: seasons.reduce((n, s) => n + s.duplicates.length, 0) },
    seasons,
  };
}

export async function verifyJerseyAudit(root, report) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/seasons.json'), 'utf8'));
  if (manifest.length !== report.seasons.length) throw Error('Jersey audit season coverage is out of date. Run sync-data.');
  let checked = 0;
  for (const season of manifest) {
    const audit = report.seasons.find(s => s.year === String(season.year));
    if (!audit) throw Error('Jersey audit missing season ' + season.year);
    const payload = JSON.parse(await fs.readFile(path.join(root, season.file), 'utf8'));
    const actual = payload.teams.flatMap(team => team.roster.map(player => ({ teamId: team.id, ...player })));
    if (actual.length !== audit.entries.length) throw Error('Jersey audit roster coverage differs in ' + season.year);
    for (const player of actual) {
      validateNumber(player.jersey, `${season.year}/${player.teamId}/${player.id}`);
      const matches = audit.entries.filter(p => p.teamId === player.teamId && p.playerId === player.id);
      const expected = matches[0];
      if (matches.length !== 1 || expected.jersey !== player.jersey || expected.name !== player.name)
        throw Error(`Jersey audit mismatch: ${season.year}/${player.teamId}/${player.id}. Re-sync from the LSL Website.`);
      checked++;
    }
  }
  return checked;
}

export function jerseyAuditSummary(report) {
  const s = report.summary;
  return `Jersey audit: ${s.known}/${s.total} verified numbers; ${s.missing} unavailable; ${s.conflicts} source conflict; ${s.duplicateGroups} duplicate-number groups. Details: data/jersey-audit.json. Missing numbers remain unprinted.`;
}
