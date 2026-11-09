# LSL Website Project Guide

## Project Scope

This repository is the static Lantern Soccer League website deployed through GitHub Pages. Keep the production website in this folder. Preserve the existing HTML, CSS, and JavaScript module architecture unless an approved phase explicitly changes it.

## Current Architecture

- Root HTML files are page entry points; most mount shared navigation and footer containers and load one page-specific ES module.
- `js/` contains page controllers, data loading, statistical calculations, and interaction logic.
- `components/` contains shared renderers such as cards, tables, navigation, footer, media, and playoff brackets.
- `css/main.css`, `css/components.css`, and `css/responsive.css` provide the established base; page-specific styles live beside them. `css/modern-system.css` currently layers shared interface polish across most pages.
- `data/2024/`, `data/2025/`, and `data/2026/` separate `seniors/`, `juniors/`, and `inter-madrasah-soccer-tournament/`, each with the same ten standard JSON files. Shared global data and season-level metadata/media live under `data/shared/`. The original flat source files are preserved in `.phase3-backup/20261108/`.
- `data/2027/` remains in its legacy season-level layout, including `projected.json`; projected/future data must not be mistaken for completed historical data.
- `media/` and `Logos/` hold local assets referenced by relative paths.
- `functions/`, `firebase.json`, `firestore.rules`, `js/firebaseConfig.js`, and the Pulse modules implement the current Firebase integrations.
- `service-worker.js` and `manifest.json` implement PWA caching and offline behavior.

## Data Integrity Rules

- Never invent or estimate player, team, coach, match, award, or goalkeeper statistics. Use `N/A`, `Not recorded`, or a suitable empty state when source data is absent.
- Distinguish directly recorded values from derived values and document every formula.
- Preserve stable player/team/match IDs, aliases, awards, playoff configurations, IMST history, and projected data.
- Before any data migration, capture source counts and relationships, validate references, retain a recoverable copy, then compare post-migration counts and references. Re-run `node scripts/validate-competition-data.mjs --runtime` after changing scoped data or the loader.
- Do not merge LSL Seniors/Juniors statistics with IMST statistics.

## Design Direction

Shared design tokens live in `css/modern-system.css`. The site-wide interface hierarchy is gray, gold, black/charcoal, with green used last as a restrained accent. Current surfaces are page `#242624`, panel `#303230`, card `#3A3C3A`, deep card `#252725`, muted text `#C0C3BF`, and border `#484B48`; emphasis gold is `#D1B166`. Preserve team/championship-specific colors and Inter-Madrasah's current colors. Global palette rules must be scoped to `body:not(.imt-blue-page)`.

Use the existing system font stack until a proposed font is approved and bundled or otherwise made reliably available. Use consistent, compact radii, clear typography, numerical alignment, keyboard focus, readable contrast, and responsive layouts. Respect reduced motion. Avoid unnecessary frameworks and animation workload.

## Runtime and Compatibility

- Keep paths relative for GitHub Pages project hosting under `/LSL/`.
- Keep Firebase user data out of static precache lists; preserve authentication, Firestore rules, push notifications, account features, and PWA behavior.
- Ensure normal navigation/reloads receive updated app assets without requiring a hard refresh.
- Use data-loader normalization rather than assuming every historical JSON collection is an array.

## Verification Standards

- Parse every edited JSON file and validate cross-file references.
- Run `node --check` on changed JavaScript modules.
- Test pages through local HTTP, not only `file://`, when browser behavior is relevant.
- Check key interactions, console errors, media loading, desktop/mobile layout, keyboard access, and reduced-motion behavior for affected surfaces.
- Do not claim full-site verification from a narrow test.

## Phase Gate

Follow `docs/REDESIGN-ROADMAP.md`. Complete only the currently authorized phase, report the evidence and remaining risks, and stop for explicit project-owner approval before the next phase. A request to fix an issue does not approve a future phase.
