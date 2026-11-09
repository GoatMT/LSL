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

## Phase 5: Homepage

Rebuild home while preserving the EM Haulers championship banner and verified date/history content. Add verified 2026 leaderboard, Record Watch slideshow, and On This Day. Every interaction must work and unsupported stats must remain absent.

## Phase 6: Players, Profiles, and Statistics

Redesign players, player profiles, comparison, leaderboards, and advanced statistics. Use verified data and documented derived formulas only.

## Phase 7: Teams, Matches, and Playoffs

Redesign teams/profiles, matches, Matchday, scoreboards, season-specific brackets, projected playoffs, and team comparisons. Preserve each season's actual format.

## Phase 8: IMST

Redesign all tournament pages and data presentations while keeping IMST statistics isolated from the ordinary league.

## Phase 9: 11v11 Team Builder

Build season-specific player selection, tactical formations, comparison, and account-based saving only after auditing existing Firebase auth and Firestore capabilities. Ask before changing auth/database architecture or security model.

## Phase 10: Remaining Pages and Features

Redesign remaining pages and approved supported features; remove inconsistent legacy presentation without deleting content.

## Phase 11: Full QA and Polish

Test all pages, controls, stats, profiles, brackets, season filters, account flows, mobile layouts, accessibility, PWA/offline, images/video, and console/network errors. Fix findings and provide a comprehensive evidence-based report.

## Phase 1 Risks and Open Items

- No Git worktree was detectable in the canonical folder during this audit, so change history and preexisting uncommitted work are unavailable here.
- Exact logo color sampling and complete data-reference validation remain for subsequent work; Phase 1 recorded a count baseline and did not modify JSON.
- The Hall of Fame two-scroll issue has not been reproduced in a live browser. Capture browser dimensions, document/body scroll metrics, and ancestor overflow before choosing a fix.
- Account-backed team-builder storage/security requirements need a focused Firebase audit before Phase 9.
