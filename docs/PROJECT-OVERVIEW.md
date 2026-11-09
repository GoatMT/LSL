# Project Overview

## Purpose

Lantern Soccer League (LSL) is a static multi-page league platform for seasons, standings, matches, player/team/coach records, awards, media, playoff brackets, the Hall of Fame, and the separate Inter-Madrasah Soccer Tournament (IMST). The site also includes account-backed community features and Franchise Mode.

## Runtime

- Static HTML/CSS/ES modules, with no frontend framework or build step detected in the site root.
- GitHub Pages-compatible relative URLs are a core deployment requirement.
- Firebase is used for selected dynamic/account features; `functions/` contains Cloud Functions.
- A service worker implements network/cache behavior and offline diagnostics.

## Repository Inventory (Phase 1)

- 41 active root HTML entry pages (including `404.html`); 2 archived HTML files under `_archive/`.
- 58 JavaScript modules in `js/`, plus 11 shared component modules.
- 14 CSS files under `css/`.
- 42 season JSON files across 2024-2027, plus 15 shared/franchise JSON files (57 JSON files total under `data/`).
- Approximately 50 logo assets and 180 media assets (119 MP4 files).
- No root package manifest or checked-in test runner was found. `functions/package.json` is scoped to backend functions.
- The LSL Website folder did not expose a Git worktree during this audit; repository history/status could not be verified here.

## Main Entry Points

Page entry HTML files mount `#site-navbar`, `#page-root`, and `#site-footer`. Each page usually loads a dedicated module that imports shared layout, data, and domain helpers. The home page controller is `js/main.js`; it also registers the PWA and media recovery. `js/config.js` centralizes site navigation, season lists, data file names, and playoff rules.

## Current Data Architecture

- 2024-2026 are split into Seniors, Juniors, and IMST folders with ten standard JSON files per folder. Shared global data and season metadata/media are under `data/shared/`.
- IMST's original nested source model is preserved inside its competition folder's `tournament.json`; the shared loader keeps it isolated from LSL league statistics.
- 2027 remains in the legacy season-level layout, including its projected data.
- Original 2024-2026 flat data and shared global files are recoverable from `.phase3-backup/20261108/`.

## Current Known Constraints

- Player data is partly duplicated in team rosters and `players.json`; `js/dataLoader.js` merges them and canonicalizes aliases.
- 2027 files are largely projected or placeholder-season records and must remain distinct from verified completed results.
- The current system has a shared base and modernization layer, but many page-specific styles remain, so whole-site consistency still requires a staged audit.
- The requested Hall of Fame double-scroll issue has not yet been reproduced in a browser. The document and body both declare visible vertical overflow; HOF-specific CSS does not show an obvious nested vertical scroller. Investigate actual viewport/browser behavior during the relevant implementation/QA phase.

## Source of Truth

Use this folder as the canonical website source. Treat the GitHub Pages URL and public repository as deployment/reference targets, not alternate local edit locations.
