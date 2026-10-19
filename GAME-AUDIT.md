# LANTERN RUSH — gameplay and feature audit

Checked September 15, 2026 in the standalone **LSL Game** project.

Historical audit: on September 13, the separate Steal control was replaced by automatic standing steals, and Mobile Cam was added. Goal replays now use a bounded in-memory player/ball state buffer with a dedicated camera and skippable playback. Current controls are documented in README.md; focused regression checks are in tests/mobile-camera.test.js.

The September 15 consistency pass also verified every dedicated mode page (home, Quick Match, Rivalry Matches, Tournament Mode, Season Mode, LSL Dream F.C., and Account) through the shared shell. Replay playback now hands control back to the goal presentation in the same update step, so a finished replay cannot delay the opponent kickoff.

The latest polish pass adds a short celebration hold and eased replay-camera blend, removes intrusive save notices while keeping save reactions for the crowd, normalizes button/card spacing across shared menus and Dream F.C. surfaces, keeps Quick Match from inheriting Rivalry presentation when the selected teams happen to be rivals, and adds Firebase account gating, profile pictures, per-mode player charts, records and expandable match history.

**Result:** 161 automated tests passed with no failures; 389 JavaScript/import/static-asset checks passed. The full automated gameplay run completed in approximately 2.0 seconds. Browser smoke checks covered the home, account, charts and locked admin entry points with no page-load console errors.

## Fixes made in this audit

- Restored manual switching while a pass is travelling. Immediate ball recovery now takes priority over predicted defensive positioning when a player is already close to the ball.
- Made duplicate or partially saved keyboard bindings recover to unique usable keys, preserving accepted custom bindings.
- Kept consecutive charged fake shots as fake shots, so releasing Shoot does not accidentally fire.
- Protected a goalkeeper's held catch from standing/sliding steals and inappropriate dribble skills.
- Canceled an outgoing restart taker's pending kick when substituted, preserved the incoming player's possession flag, and honored the stoppage presentation delay.
- Kept substitution notifications visible for the full five-second presentation.
- Removed joystick/STEAL overlap in the mirrored layout on narrow portrait phones. Verified separate, visible targets at 320 × 568.
- Added the Account shortcut beside Settings on the home shell and regenerated every dedicated mode page.
- Added the locked `admin.html` console for profile listing, name repair, merge/delete operations and password-reset requests. Firestore mutations require a server-issued `admin` custom claim; the public password is never trusted by security rules.

## Coverage

| Area | Checks performed | Result |
| --- | --- | --- |
| Movement and possession | Acceleration, sprinting, braking, sharp/repeated turns, first touch, intermittent dribbling, loose-ball collection | Passed |
| All 12 dribble moves | Body feint, step-over, double step, ball roll, fake shot, drag-back, roulette, quick cut, directional touch, stop-go, heel-to-heel, close control; execution, cooldowns and finite motion | Passed |
| Passing and shooting | Short/long/through passes, crosses, first-time returns, volleys, headers, shot charging, normal/power/finesse/trivela, curved set pieces, overcharge risk, contact timing and interruption | Passed |
| Ball physics | Grass resistance, full stopping, bounce damping, spin without added energy, posts/crossbar, complete-ball goal detection | Passed |
| AI and goalkeepers | Formation width, off-ball repositioning, both teams, difficulty extremes, tracking/facing, catches, parries, rebounds, manual keeper movement, passing and long kicks | Passed |
| Defense and discipline | Standing/slide tackles, missed/protected challenges, fouls, penalties, yellow/red cards, removal of sent-off players | Passed |
| Match rules | Corners, throw-ins, goal kicks, free kicks, penalties, kickoffs, direction changes and restart spacing on the larger pitch | Passed |
| Match flow and stats | Skippable staged intro, goal/assist records, clock pauses, all match lengths, halftime and substitutions, second-half kickoff, full-time progression, finite complete simulated matches | Passed |
| Keyboard | Every bound action: press/release/rebind, M switching, L steal, G keeper, conflicting bindings and blur cancellation | Passed |
| Touch | Proportional 360° joystick, simultaneous inputs, independent pointers, held switching on/off, curved-shot gesture, keeper-switch gesture, canceled touches and layout mirroring | Passed |
| Animations | Full-cycle finite poses for passing, shooting, skills, defensive/keeper actions, recovery, referee signals and celebrations, both leg sides | Passed |
| Menus in browser | Settings sections, all graphics/lighting/camera options, difficulties and durations, season changes, team cycling, substitution confirmation, pause/resume, restart/cancel, quit/home, intro skip | Passed |
| Responsive presentation | Landscape action bounds at 844 × 390; portrait adaptation/rotation prompt at 390 × 844; mirrored controls at 320 × 568; persistent toggle and hold-switch preference after reload | Passed |
| Stadium and presentation | Geometry/camera bounds, nets settling after impact, ads outside playing space, lighting/shadow configuration, player labels, correct jersey propagation and goal replay playback | Passed |
| Data and static deployment | All 3 seasons, 24 teams and 278 roster entries; lineup sizes, IDs, kit profiles, jersey audit, bundled imports/assets and relative paths | Passed with source-data gaps below |

## Performance and limits

The live match reported **60 FPS** at an **844 × 390 viewport**, High graphics, on this PC's in-app browser. This is a short desktop rendering sample with a phone-sized viewport, not a physical-phone benchmark. Lower-end phones, iOS Safari and a published GitHub Pages URL were not directly tested in this audit. Low graphics and adaptive rendering remain available.

The jersey audit verifies **235 of 278** entries. **43 numbers are unavailable**, with **1 source conflict** and **7 duplicate-number groups** recorded in `data/jersey-audit.json`. Missing numbers remain unprinted; published duplicates and documented overrides are preserved rather than invented.

These checks cover the implemented systems and exercised scenarios. They do not guarantee every possible input combination or device will be error-free.

## Re-run locally

```sh
npm test
npm run check
npm start
```

`tests/feature-audit.test.js` contains the move-by-move and interaction regressions added during this audit. Other feature tests remain in `tests/`.
