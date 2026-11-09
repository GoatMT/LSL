# Redesign Roadmap

## Approval Gate

This roadmap follows the project owner's mandatory phase-by-phase authorization. Phase 1 and Phase 2 are complete. Work only on an explicitly approved phase. At the end of every phase, stop and ask for explicit approval before starting the next one. A bug fix request does not grant permission to begin another phase.

## Phase 1: Audit and Planning (Complete)

Inspect pages, modules, data, design, hosting, Firebase, PWA, and reported issues. Produce `AGENTS.md` plus project overview, design proposal, page inventory, migration plan, and roadmap. Do not redesign or migrate data. Report findings and ask: “Phase 1 is complete. Would you like me to proceed to Phase 2?”

## Phase 2: Design System and Core Architecture (Complete)

Consolidated logo-derived colors, typography tokens, interaction states, shared surfaces, responsive touch-target foundations, and reduced-motion-aware motion. Preserved Inter-Madrasah colors. Updated documentation and cache version. Remaining work: browser QA across representative pages and page-specific restyling in later phases.

## Phase 3: Data Architecture Migration (Complete)

Separated 2024-2026 into Seniors, Juniors, and IMST folders with ten standard JSON files each; moved global data and shared season metadata/media under `data/shared/`; preserved the IMST nested payload and 2027 layout/projections; updated active loaders and paths; archived original source JSON; and passed source/target parity plus runtime loader validation.

## Phase 4: Shared Components and Navigation (Complete)

Improved shared search to index pages, players, coaches, teams, matches, tournament information, and record topics; added keyboard navigation and accessible combobox/listbox state; strengthened mobile and More-menu state; added accessible roving keyboard behavior for tablists; gave the Hall of Fame photo viewer focus trapping and focus return; simplified the shared footer shoutout and labeled partner links; aligned shared PWA/browser theme colors; updated the 404 landmark labels; and bumped shared asset/service-worker versions for automatic update pickup. The offline experience remains the service worker's existing detailed, self-contained offline page. Automated checks passed; visual browser QA was not available in this phase environment.

## Phase 5: Homepage (Complete)

Reworked the homepage dashboard while preserving the 2026 EM Haulers championship banner, the verified 2027 expected dates, Lantern Rush feature, and league history. Added the actual current-year/last-completed-season score ticker, a default 2026 Seniors top-10 leaderboard with season/division/team/stage filters, a keyboard-operable Record Watch carousel from verified 2026 match highs, and a dedicated On This Day panel with an honest empty state. Reduced initial homepage data loading to 2024-2026 league records and only the data files used by these features; added a visible loading/error state, responsive homepage-only styling, reduced-motion-aware entrance, and the new home assets to the service-worker cache. Runtime data checks confirmed 82 Seniors players appeared in 2026, the leaders and five Record Watch slides derive from the normalized loader, and November 8 correctly has no On This Day match. Automated checks passed; visual browser QA was unavailable because this environment denied local HTTP server binding.

## Phase 6: Players, Profiles, and Statistics (Complete)

Audited the player leaderboard, individual profile, comparison, all-time, and advanced-statistics surfaces while preserving their existing career timeline, Player Style, top-10/show-more, filters, comparison verdict, and documented OVR formulas. Corrected the player leaderboard to show Rank, Name, Team, Position, Seasons, GP, Goals, and only the selected additional metric; fixed its descending leaderboard order and matching labels. Verified player pages continue to load through the normalized 2024-2027 data loader. Updated the shared standings renderer so 2025 bye rows (including the President Trophy row) receive the green row treatment and 2026 Leeward Lions receive the same highlight anywhere shared standings render, including standings, playoffs, and recaps. Kept the President Trophy badge gold and the Semifinal bye badge green. Automated checks passed: 81 JavaScript syntax checks, standings-render assertions, and the runtime competition-data validator. Visual browser QA remains unavailable because local HTTP server binding is denied in this environment.

## Phase 7: Teams, Matches, and Playoffs (Complete)

Audited the team directory and profiles, match schedule and individual game page, Matchday status/schedule/results, team-vs-team view, season recap, official brackets, and projected playoff renderer while preserving existing page workflows and season-specific format rules. Added one schedule-derived regular-season label (`Week N - Game N`) across match cards, individual games, Matchday, team schedules, and global search. Numbering follows kickoff order within each division/week and no longer relies on a fixed four-game ID rollover; match media text references normalize punctuation so labels still link to the correct game. Hardened bracket rendering for both array and single-object round `matches` payloads found in 2025 Juniors and 2026 Seniors, made projected brackets accept either shape, and display `N/R` with an accessible score-not-recorded label where only a winner is known. Improved the official-bracket fallback to recognize generic/numbered quarterfinals, semifinals, Grand Finals, and third-place matches. Matchday schedule-change detection now reads string or array notes and surfaces the specific note. Bumped the service-worker cache for automatic asset pickup. Checks passed: 73 module syntax checks plus service worker, all 6 historical division brackets rendered with 11 total rounds, game numbering validated across 22 division-weeks, and the 2024-2027 runtime competition-data validator. Visual browser QA remains unavailable because local HTTP server binding is denied in this environment.

## Phase 8: IMST (Complete)

Hardened tournament pages for object- or array-shaped playoff rounds, included playoff results in the tournament schedule, derived match winners from recorded results, and displayed an accessible `N/R` score where scores are absent. Kept IMST data separate from LSL statistics, preserved its blue/red presentation, corrected media MIME types and load-failure messaging, and made the year selector recover cleanly from a failed load. Corrected the 2024 archive so it reports that the tournament had not started rather than inheriting the 2025 champion. Updated the homepage to put 2027 Expected Dates first, show Goals/Goalies/Rookies (without Assists), and remove the score ticker, Extremely Important News, and Crazy Stats & Records; the removed news feed is no longer fetched by the homepage. Bumped shared CSS and service-worker versions for normal update pickup. Checks passed: homepage leader/render assertions, actual 2024-2026 IMST page-render harness, IMST payload-shape checks, JavaScript syntax checks, and the 2024-2027 runtime competition-data validator. Visual browser QA remains unavailable because this environment denies local HTTP server binding.

## Phase 9: 11v11 Team Builder (Core Complete; Account Sync Approval Needed)

Added the season-specific 11v11 Team Builder to shared navigation, using real 2024-2026 roster/player stats and the current LSL OVR engine. It supports Seniors/Juniors/all divisions, five tactical formations, player search/position/sort filters, lineup assignment/removal, local saved builds, load/delete, and side-by-side lineup comparisons. Saves are local to the browser/device. The Firebase audit found no real Firebase Authentication for personal saves; Pulse PIN records are client-side and Firestore rules are permissive. No auth, database, or security changes were made. Secure cross-device account saves need separate approval before implementation.

Applied the requested gray-first, gold-emphasis, black/charcoal-depth, green-last visual hierarchy through shared tokens and non-IMST component states. IMST retains its existing blue/red palette, and explicit team/championship colors remain intact. Updated the PWA theme, service-worker cache, and page stylesheet/script query versions so pages pick up the shared theme and navigation without a hard refresh.

Checks: real 2024-2026 player-pool/formation validation, JS syntax, service-worker shell, existing homepage/IMST/competition checks, shared CSS scoping, and stale asset-version scan. Visual browser QA remains limited in this environment.

## Phase 10: Remaining Pages and Features

Redesign remaining pages and approved supported features; remove inconsistent legacy presentation without deleting content.

## Phase 11: Full QA and Polish

Test all pages, controls, stats, profiles, brackets, season filters, account flows, mobile layouts, accessibility, PWA/offline, images/video, and console/network errors. Fix findings and provide a comprehensive evidence-based report.

## Phase 1 Risks and Open Items

- No Git worktree was detectable in the canonical folder during this audit, so change history and preexisting uncommitted work are unavailable here.
- Exact logo color sampling and complete data-reference validation remain for subsequent work; Phase 1 recorded a count baseline and did not modify JSON.
- The Hall of Fame two-scroll issue has not been reproduced in a live browser. Capture browser dimensions, document/body scroll metrics, and ancestor overflow before choosing a fix.
- Account-backed team-builder storage/security requirements need a focused Firebase audit before Phase 9.
