import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveJersey, auditSeasonJerseys, verifyJerseyAudit } from '../scripts/jersey-data.mjs';

test('jersey fallback stays in the exact season team and player identity', () => {
  const p = { id: 'player-a', name: 'Player A' };
  const extras = [{ id: p.id, teamId: 'old-team', jersey: 34 }, { id: 'different-player', teamId: 'new-team', jersey: 7 }];
  assert.deepEqual(resolveJersey(p, 'new-team', extras, '2026'), { jersey: null, source: null, conflict: null });
  const match = { id: p.id, teamId: 'new-team', jersey: 12 };
  assert.equal(resolveJersey(p, 'new-team', [...extras, match], '2026').jersey, 12);
  assert.equal(resolveJersey(p, 'new-team', [...extras, match], '2026').source, 'data/2026/players.json');
  assert.equal(resolveJersey({ ...p, jersey: 0 }, 'new-team', [], '2026').jersey, 0);
});

test('season roster takes precedence and source disagreement is explicitly flagged', () => {
  const result = resolveJersey({ id: 'ajmal-shakkari', jersey: 11 }, 'dhahabiya-strikers',
    [{ id: 'ajmal-shakkari', teamId: 'dhahabiya-strikers', jersey: 10 }], '2025');
  assert.equal(result.jersey, 11);
  assert.equal(result.source, 'data/2025/teams.json');
  assert.deepEqual(result.conflict, { roster: 11, profile: 10, selected: 11 });
});

test('invalid values and ambiguous matches fail development checks instead of inventing numbers', () => {
  for (const jersey of ['34', '', -1, 7.5, NaN]) assert.throws(() => resolveJersey({ id: 'p', jersey }, 't', [], '2026'), /Invalid jersey/);
  assert.throws(() => resolveJersey({ id: 'p' }, 't', [{ id: 'p', teamId: 't', jersey: 1 }, { id: 'p', teamId: 't', jersey: 2 }], '2026'), /Ambiguous/);
});

test('audit preserves published duplicates and lists each unavailable number', () => {
  const season = auditSeasonJerseys('2026', [{ id: 'team', roster: [
    { id: 'a', name: 'A', jersey: 9 }, { id: 'b', name: 'B', jersey: 9 }, { id: 'c', name: 'C' },
  ] }]);
  assert.equal(season.known, 2);
  assert.equal(season.missing, 1);
  assert.deepEqual(season.duplicates, [{ teamId: 'team', jersey: 9, playerIds: ['a', 'b'] }]);
  assert.deepEqual(season.entries[2], { teamId: 'team', playerId: 'c', name: 'C', jersey: null, source: null });
  const past = auditSeasonJerseys('2025', [{ id: 'team', roster: [{ id: 'c', name: 'C', jersey: 34 }] }]);
  assert.equal(past.entries[0].jersey, 34);
  assert.equal(season.entries[2].jersey, null, 'A previous-season number cannot fill a current-season gap.');
});

test('all shipped seasons preserve audited team-specific jersey numbers and unavailable states', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const report = JSON.parse(await fs.readFile(path.join(root, 'data/jersey-audit.json'), 'utf8'));
  assert.equal(await verifyJerseyAudit(root, report), report.summary.total);
  assert(report.files.every(f => /^data\/[0-9]{4}\/(teams|players)\.json$/.test(f.file) && /^[a-f0-9]{64}$/.test(f.sha256)));
  for (const season of report.seasons) {
    assert.equal(season.total, season.entries.length);
    assert.equal(season.missing, season.entries.filter(p => p.jersey === null).length);
    assert.equal(season.known + season.missing, season.total);
    assert(season.entries.every(p => p.jersey === null ? p.source === null : p.source.startsWith(`data/${season.year}/`)));
  }
});
