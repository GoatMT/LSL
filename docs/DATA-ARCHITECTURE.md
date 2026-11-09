# Data Architecture and Migration Plan

## Current Shape

The 2024-2026 seasons use competition-scoped data. Each year has `seniors/`, `juniors/`, and `inter-madrasah-soccer-tournament/`; every competition folder contains the same ten lowercase files declared in `js/config.js`. LSL records are separated by explicit division. IMST's nested source structure remains intact in its `tournament.json` rather than being flattened into an assumed schema.

Shared global JSON files live in `data/shared/`. Shared season event/standings metadata and media marked `division: "All"` live in `data/shared/seasons/<year>/`. The loader recombines Seniors and Juniors for existing league pages and exposes IMST through `seasonData.tournament` only.

2027 intentionally retains its season-level layout, including `projected.json`. Original flat 2024-2026 data and shared global files are preserved byte-for-byte in `.phase3-backup/20261108/` for rollback/reference.

`js/dataLoader.js` reads scoped files for 2024-2026 and legacy files for 2027, normalizes object-or-array variants, canonicalizes player aliases, reads rosters from team data, merges `players.json`, and normalizes playoff rounds.

## Audited Record Counts

Counts below reflect loaded payloads at the time of Phase 1 audit. Team-roster entries and standalone player payloads overlap and must not be summed as unique people without ID reconciliation.

| Season | Teams | Roster entries | Player payload entries | League matches | League scorer events | League assist events | IMST divisions / teams / matches | IMST media items |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 2024 | 6 | 81 | 5 | 21 | 23 | 2 | 1 / 1 / 1 | 1 |
| 2025 | 10 | 115 | 13 | 37 | 75 | 0 | 2 / 8 / 12 | 41 |
| 2026 | 8 | 82 | 0 | 46 | 82 | 2 | 2 / 8 / 18 | 3 |
| 2027 | 0 | 0 | 0 | 0 | 0 | 0 | 1 / 1 / 1 | 1 |

Observed differences: 2024 and 2026 have missing or differently shaped coach/standings arrays; 2026 player records are roster-derived; 2026 and 2027 include special projected files. The loader currently handles some shape variance.

## Migrated Structure

For 2024-2026, the competition-scoped directories are:

`data/<year>/seniors/`, `data/<year>/juniors/`, and `data/<year>/inter-madrasah-soccer-tournament/`.

Each competition directory contains the ten approved lowercase JSON filenames. Division-wide `All` photos/videos and event/standings metadata are stored once under `data/shared/seasons/<year>/`, avoiding duplication across both league divisions. 2026 and 2027 projection files remain at their original season-level paths.

## Migration Safety and Validation

1. The migration script saved the original season and shared JSON under `.phase3-backup/20261108/` before moving source paths.
2. Records are separated only by explicit division, established team division, or the `All` shared-media marker.
3. IMST's original nested payload is preserved exactly; no assumed IMST player/team schema is introduced.
4. The loader combines scoped Seniors/Juniors data to maintain the current page API and reads 2027 from its unchanged legacy paths.
5. Run `node scripts/validate-competition-data.mjs --runtime` to verify ten-file folders, JSON parsing, source/target row equality, standings/playoffs, match/team relationship counts, projected-file presence, shared-data equality, and loader compatibility for 2024-2027.
6. Keep static relative-path hosting and do not move Firebase/user-specific data into JSON or precache.

## Validation Script

The validator parses JSON, enforces the ten-file schema, compares migrated records with the preserved source snapshot, checks match/team relationship counts, confirms projected files, and smoke-tests the runtime loader. Missing scorer details are data gaps, not permission to infer goalscorers.
