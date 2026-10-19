# LANTERN RUSH

An original 3D 7v7 arcade soccer game for desktop and mobile browsers. Built with Three.js and plain JavaScript modules. This folder is the complete standalone website; it does not depend on the adjacent LSL Website folder at runtime.

## Play locally

Install Node.js 20.11 or newer, then open a terminal in **LSL Game**:

    node scripts/serve.mjs

Open **http://localhost:4173/**. No package installation or build is required. For a phone on the same Wi-Fi, use the computer's LAN address and port 4173. Use landscape orientation for the largest play area.

Use a local HTTP server instead of double-clicking index.html: browsers restrict module and JSON loading from file:// URLs. The local server is only a development convenience. GitHub Pages serves the released game without a backend.

Each mode also has its own GitHub Pages-compatible HTML entry point:

- `quick-match.html` — Quick Match team selection.
- `rivalry-matches.html` — featured LSL Rivalry Matches.
- `tournament-mode.html` — Inter-Madrasah Tournament flow.
- `season-mode.html` — LSL season career with standings, trades and awards.
- `dream-fc.html` — LSL Dream F.C. single-player Ultimate Team hub.
- `charts.html` — public Firebase leaderboard and record holders.
- `account.html` — account profile, trophies and match-derived statistics.
- `history.html` — full match archive with filters, reports and scoring trends.
- `admin.html` — locked account administration console for profile maintenance.

The pages share the same Three.js engine, data, settings and match shell; opening a mode URL starts directly on that mode's selection screen. The Back and Home actions return to `index.html`.
Run `npm run sync-mode-pages` after changing the shared `index.html` shell to regenerate all five dedicated pages.

## Publish on GitHub Pages

1. Create a GitHub repository for the game.
2. Upload the **contents of LSL Game**, including index.html, all CSS files, src, data, assets, vendor and the hidden .nojekyll file. Put index.html at the repository root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, then **main** and **/(root)**. Save.
5. When deployment finishes, use the URL GitHub displays, usually **https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/**.

The gameplay engine uses relative asset paths and includes its pinned Three.js dependency locally. Account, charts, profile-picture sync and the locked admin console use the supplied Firebase project from `src/firebase-config.js`; Only Firebase App and Firestore load for accounts; no email or Firebase Authentication provider is required. A project Pages URL with a repository-name prefix works without changing asset paths. Audio is bundled locally and works without a backend; settings provide separate Master, SFX and Crowd volumes plus mute. Sound starts after the first user interaction to meet browser autoplay rules. Audio credits and license details are in `assets/audio/ATTRIBUTION.md`. The temporary username/passcode system and browser admin lock match the other LSL sites. Deploy the narrowly scoped Firestore rules in `ACCOUNT-RULES.md`. This client-side model is intended to be replaced with verified authentication later.

To update: replace the changed files, commit/push to the selected branch, and let Pages redeploy. Reload an already-open game to receive the update.

If adding the game to an existing website repository instead, keep all game files together in a subfolder, such as game/, and link to game/index.html. Do not overwrite the league website's own index.html.

Official publishing reference: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move / aim | W A S D | Left joystick (mirror in Settings) |
| Sprint | Hold P | Hold SPRINT & SKILL |
| Pass / closest player | M | PASS / SWITCH (hold to follow closest) |
| Shoot | Hold and release K | Hold and release SHOOT |
| Dribble skill | O | DRIBBLE |
| Standing steal | Automatic when close to an exposed ball | Automatic; no button needed |
| Goalkeeper / outfield | G | GOALIE, or hold SWITCH and drag up/down/left |

| Pause | Escape | Top-right pause button |

Hold Shoot to charge power. Low charge favors control, medium is balanced, and high charge trades accuracy for speed. **Maximum charge is very risky**: sprinting, a tight angle and a closed body greatly increase overbar misses.

While charging, swipe **Sprint & Skill upward** or hold its upper edge for a curved shot. Sliding the shooting thumb upward is a one-thumb alternative. On PC hold Shift with Shoot (rebindable). Ball position, current contact foot, preferred foot and body/goal angles choose Finesse or Trivela deterministically. They have opposite spin, distinct strike poses and a compensated aiming arc. Without a shot charging, an upward Sprint & Skill swipe performs a skill. Canceling a touch cancels the shot. Multiple fingers and keyboard inputs retain independent ownership.

 Moving the joystick farther increases running speed. Passes choose a teammate in the aimed direction, lead forward runs, and become crosses near the attacking wings. **M passes when your team has the ball and selects a useful nearby active outfield player when defending.** Q no longer has a switching action. Touch uses four compact outlined circular action buttons and one smaller GOALIE button. Shoot sits top-right, Dribble upper-left, Pass lower-left, and the larger Sprint & Skill lower-right. Move into range of an exposed ball to attempt an automatic standing steal. Reach, cooldown and ball protection still matter; misses and occasional fouls remain possible. The assist avoids dangerous challenges from behind and never steals a held goalkeeper catch. There is no separate Steal button or key. GOALIE toggles manual goalkeeper control until you switch back; keepers can move, pass and shoot. Settings → Controls uses a toggle to mirror the entire layout immediately and saves it. Holding Switch repeatedly selects the nearest eligible player; disable Hold Switch in the same panel to keep tap-only switching. Hold keyboard Pass before receiving a teammate's pass for a first-time return; high balls can become header passes. While defending, steals are automatic and holding keyboard Pass presses the ball carrier. Tapping Shoot beside a loose ball attempts a first-time shot, volley or header depending on its height.

Move and tap Skill for a contextual feint, step-over, ball roll, quick cut, drag-back or other skill. Direction, speed and nearby defenders affect the choice. Skill while charging a shot performs a fake shot. Difficult skills can lose the ball, especially with lower control ratings. Skills have a cooldown.

For penalties and free kicks, movement changes the gold aiming guide. Shoot or Pass takes the restart. Throw-ins and goal kicks use the same buttons. Restarts are taken automatically after a short timeout if there is no input.

Settings supports rebindable keys, Easy/Normal/Hard/Insane difficulty, 1/2/3/4/5/6-minute games and Low/Medium/High graphics. The Camera section has Low (closer), Medium (balanced), High (tactical), Broadcast (desktop default) and **Mobile Cam** (the starting view on touch devices when no camera preference is saved). Mobile Cam has closer, higher-angle framing, space above the touch controls, responsive tracking and controlled zoom for passes and airborne balls. Portrait mode adjusts the field of view while keeping movement axes consistent. Phone cameras cap the lens angle and compensate with distance to reduce stretched-looking players at the screen edges. Canvas proportions update on element/visual-viewport changes and before rendering, including after rotation or browser toolbar changes. Rotation cancels active touches without releasing a shot; the joystick has a small center dead zone. Performance scaling reacts sooner when phone frame rate drops. Existing saved camera choices are preserved. Camera changes apply immediately. Preferences and the last selected season/teams are saved locally when storage is available.

## Match rules and flow

The expanded pitch is **128 × 84 world units**, compared with the original 64 × 42: **four times the playable area** (each side is doubled). Players and the referee now have larger visual silhouettes for readability: about 31% larger on desktop and 52% larger on compact/mobile layouts than the former 1.13 model scale. The closer compact broadcast camera further increases their on-screen size. The ball, field dimensions, collision distances and match rules remain consistent. Goals, boxes, formation spacing and the surrounding stadium follow the enlarged field.

Base running speed is 7.3 units/second (about 16% faster) and sprint speed is 11.8 (about 34% faster). Sprinting is unlimited for every player, with no energy meter, drain or fatigue slowdown. CPU players jog and jockey by default, sprinting to recover, intercept or track fast runs. Substitutions are tactical rotations at stoppages. Passes account for distance and friction, lead longer runs and reach up to 46 units/second; charged shots reach approximately 49. Teammates keep wider lanes; one defender pressures the carrier while the others retain man-to-man assignments and cover passing lanes. Double teams are reserved for traps or emergency cover without leaving a nearby outlet open. Discrete close-control touches keep jogging dribbles tight, sprint touches slightly longer, and highly rated dribblers more responsive through cuts and skill exits. Goalkeepers anticipate incoming shots across the wider goal. The broadcast camera follows the expanded boundaries and pulls back for passing options and fast balls.

Field dimensions and gameplay tuning are centralized in **src/config.js**. Player-sized collision, tackle and dribble distances remain separate from pitch dimensions.

- Seven starters per team: one goalkeeper and a 2–2–2 outfield formation.
- A 60-second skippable intro: stadium opening, team badges, every starter shown individually for three seconds on both teams, players to watch, and a six-second walk into formation. Each card shows the source name, number, position and OVR. The camera follows the featured player.
- First half → halftime → second half → full time.
- The selected duration is active real-time play split equally between halves. Restarts, goal celebrations, pauses and the halftime screen stop the clock. Goals last 8.5 seconds; foul/card decisions last 4–5.5 seconds, substitutions receive five seconds, and corners/free kicks/penalties have longer setup and aiming windows. The shared presentation timing lives in src/presentation.js.
- At halftime, make substitutions and choose Continue. Teams change ends and the CPU receives the second-half kickoff.
- Corners, throw-ins, goal kicks, free kicks, penalties, yellow cards and red cards.
- A second yellow dismisses the player. Red-carded players stay off the pitch. Fewer than three remaining players forfeits the game.
- **No offside rule.**
- Substitutions wait for a stoppage, or apply immediately at halftime. Players who leave cannot re-enter; all available bench players may be used. The CPU uses up to three changes when players tire.
- Full-time statistics include goals, shots, shots on target, possession, passing, fouls, cards, corners, saves, scorers, assists and substitutions.
- Player of the Match considers goals, assists, completed passes, tackles, saves, involvement and discipline.

The game uses simplified arcade rules and physics, with contextual actions, assisted aiming, procedural animations and a short live celebration camera. Goals also use an in-memory state replay that replays the captured player and ball movement without creating a video file. Player models are stylized game characters, not likenesses.

## Player and gameplay detail

Characters have jointed knees and elbows, visible faces, deterministic generic hair/skin/build variations, kit textures, cleats, goalkeeper gloves and captain armbands where the source lists a captain. Their identity remains stable across matches and seasons. No generic appearance is presented as a real player's likeness. The current source does not publish preferred feet: players use an explicitly marked right-foot gameplay default. Future dominantFoot/preferredFoot/foot data supports left, right or both without changing shooting code; current contact foot follows the ball.

Locomotion uses actual velocity and distance traveled, with acceleration, stronger braking, responsive sharp turns, lean and pose blending. Live passes and shots have a brief planted-foot windup; the ball is released at the contact phase, and a tackle or stoppage can cancel the strike. Separate contextual poses cover receiving, passing, shooting, skill moves, tackles, falls/recovery and celebrations. Goalkeepers use a ready stance, shuffles, dives toward the ball, catches, parries, punches, recovery and distribution. Fine facial geometry, hair detail, collars and boot studs appear at closer camera distances on Medium/High. Low keeps the animated silhouette, source numbers and original kit pattern. Static parts are merged per animated joint to reduce drawing work.

Possession uses small intermittent touches; the ball is free to move between them. Reachable cutting and braking touches redirect old momentum, so unopposed 90–180 degree turns retain the ball. Sprint touches are slightly longer. Receiving a loose ball cushions it without a forward kick, and difficult pressured receptions can still produce a bad touch. Grass drag and rolling resistance bring loose balls to a complete stop with consistent travel across simulation rates. Ground passes use the same resistance model to arrive at a controllable speed. Flight is split at ground impact, with damped vertical and horizontal bounce energy. Player, post and crossbar contacts are swept along the ball's path and resolved before a later goal-line crossing. Rebounds follow the surface normal, and body blocks slow the ball instead of applying a fixed sideways kick. First touches cushion incoming passes according to speed, movement, rating and pressure. Keepers continuously face the ball, shift across their goal, narrow the angle, retreat and collect reachable loose balls. A successful goalkeeper catch holds the ball in the hands before a roll, throw or punt. The user gains control when their goalkeeper has possession: Pass distributes to a teammate and Shoot charges a long downfield kick. The user keeper waits for input and stays inside the box while holding the ball. CPU keepers distribute after a short hold. Hard saves allow rebounds, and the net absorbs most goal momentum.

Both teams continuously update preferred zones, support lanes, pressing/cover roles, marking, overlaps, near/far-post runs and loose-ball targets. Interception targets predict friction, curved flight and bounces using the live ball-motion model. Only the nearest appropriate players pursue the ball; others retain useful spacing. Close body contact separates overlapping players and removes their inward momentum; a brief first-touch protection window also applies to automatic steals. A defender commits to pressure while a second stays goal-side to cover and block the shooting lane; nearby runs are tracked with anticipation. CPU attackers carry the ball into open space and pass to relieve pressure or improve the attack, rather than on a repeating timer. Goalkeepers position for the shooting angle and judge when to leave their line. Direct body shots usually produce a catch or reflex block; difficult saves remain fallible. Camera overrides cover kickoffs, set pieces, cards, substitutions, goals and half/full time before returning to the saved view.

### CPU difficulty

- **Easy:** slower decisions, looser pressure and less accurate finishing.
- **Normal:** balanced decisions, defensive cover and goalkeeping.
- **Hard:** better passing choices, tighter run tracking, earlier saves and clinical finishing.
- **Insane:** elite reactions, aggressive coordinated pressure, accurate finishing and saves on almost all reachable shots. It remains beatable; players do not gain an impossible speed boost.

On a CPU kickoff, there is a single 2.5–7% chance (depending on difficulty) to plan a surprise midfield shot. It requires open space in the next 12 seconds, can happen only once per kickoff, and is canceled by a stoppage or lost possession. Difficulty is saved locally and applies to the next match; user teammates and their goalkeeper retain Normal AI.

## Real LSL data

Bundled seasons: **2024, 2025 and 2026**, containing **24 teams** and their original season-specific roster memberships.

Source: the existing LSL Website data/{season}/teams.json files and matching player metadata. Team and player IDs, roster names and known jersey numbers are preserved. Numbers absent from the source remain absent; the name is printed on the back without a made-up number. Known numbers are printed on both the front and back. Player personal/contact details and photos are not needed by the game and are omitted.

Published positions are used when choosing the lineup. Where records only say Field, or a team lacks enough specialists, a game formation role is assigned to an existing roster member. No extra players or teams are fabricated. Available team badges are copied from the supplied Logos folder. Teams with no supplied badge display the LSL crest as a labeled league fallback; no replacement team badge is invented.

Every starter and substitute has the **career overall and player style displayed by the LSL Website**. The sync script runs the website's actual data loader, alias mapping, playerOVR and inferPlayerStyle calculations. These are current career profiles across the website's configured seasons, including its 2027 dataset, not invented season-specific ratings. The playable seasons remain 2024–2026. Source-file hashes are recorded in data/profile-source.json. After website rating or results changes, run `npm run sync-ratings -- "../LSL Website"` and publish the updated game data. Use `npm run check-ratings -- "../LSL Website"` to compare every bundled player, goalkeeper and team with fresh calculations from the website. This ratings-only update preserves roster membership, jersey numbers, kits and logos. The game bundles a static snapshot; it does not need a live website connection or backend. Website default labels such as Developing Profile are preserved.

Ratings and styles appear in lineups, clickable squad profiles, the controlled-player HUD and substitutions. **Team OVR** is imported directly from the website’s `teamOVR` calculation using its full published roster for that season and the same career ratings used on the Players page. It appears consistently in team selection, squad details, intros, the score HUD, substitutions and results. Match substitutions and red cards do not change the website’s published rating. No game-specific minimum or maximum is applied to player, goalkeeper or team ratings. Small gameplay modifiers affect running, close control, shooting, forward runs, passing leads, defending and goalkeeping. Those modifiers are arcade balancing, not additional claimed real-life statistics; difficulty never changes player speed.

Seven 2026 senior uniforms use the user's supplied jersey references: EM blue, Leeward orange fading into navy, Refuel white with blue sleeves, Sharp gold, Rawaha purple, Gangat white with a red center stripe, and Memon green. Patterns, shorts and socks are defined in src/kits.js and rendered with small procedural textures. Supplied photo crops are not published as game assets. These reference kits are preserved when playing against each other. Other season/team colors use supplied colors or a badge-derived palette, with a contrasting CPU kit where needed.

With the requested two-folder layout:

    Lantern Soccer Leauge/
      LSL Website/
        data/
        Logos/
        index.html
        ...
      LSL Game/
        index.html
        src/
        data/
        ...

Refresh the game roster snapshot from its sibling website:

    node scripts/sync-data.mjs "../LSL Website"

Or use any complete LSL website checkout:

    node scripts/sync-data.mjs "C:/path/to/LSL Website"

Future seasons use the same adapter. Once real 2027 rosters exist:

    node scripts/sync-data.mjs "../LSL Website" "2024,2025,2026,2027"

This copies the selected data and available badges and regenerates data/seasons.json. Run the checks before publishing.

## Project structure

- src/engine/ — Three.js renderer, stadium, camera, player models, procedural animations and fixed-step loop.
- src/match/ — players, ball physics, tactical AI, rules, statistics and match state.
- src/input/ — keyboard, rebinding and multitouch joystick/actions.
- src/ui/ — menus, substitutions, result screens, player labels and HUD.
- src/data.js — season loading and lineup selection.
- src/settings.js — validated local preferences and keyboard bindings.
- data/ — portable season snapshots and season manifest.
- assets/ — supplied LSL logo and real team badges.
- vendor/ — Three.js 0.170.0 and its MIT license.
- tests/ — deterministic rules, physics, roster and lifecycle tests.
- scripts/ — local serving, data synchronization and release checks.

## Verification

    node scripts/check.mjs
    node --test tests/*.test.js

Verify the exported ratings and styles against a complete website checkout:

    node scripts/check-profiles.mjs "../LSL Website"

Automated checks cover all season rosters, 14 starters, the intro, acceleration and braking, intermittent dribble touches, exact ball stopping, first touches, first-time passes/volleys, goalkeeper catches/distribution and direction-matched parries, camera persistence/framing, animation poses, charging shots, goals, restarts, posts/crossbar, fouls/cards, substitutions, halftime, changing ends and complete seeded CPU matches across difficulties.

Responsive browser QA includes the main menu, all three seasons, Season Mode's picker/dashboard flow, settings, live 3D rendering, keyboard actions, substitution menus and phone-size layouts. Physical iOS/Android hardware should still be checked before a broad public release; desktop emulation does not measure phone GPU performance.

## Performance

Low disables dynamic shadows, grass bump and fabric normal maps, limits pixel ratio to 1, and reduces crowd/scenery detail. Medium uses up to 1.35 pixel ratio and a 1024 shadow map; High uses up to 1.75 and a 2048 shadow map. Only one light casts dynamic shadows. Seats, stands and spectators use instancing; static body pieces merge by joint; kit textures are shared and released after use. Compact layouts can reduce render scale in steps down to 75% after three seconds below 42 FPS. Touch devices can also switch to Low after five seconds below 32 FPS. Physics keeps its fixed timestep and inactive tabs pause.

Requires WebGL 2 in a current browser. Network is needed to initially load the static game files; there is no offline caching layer. No audio is created or loaded.


## Matchday visuals

The rebuilt stadium includes open-air seating on four sides, stair aisles and concourses, instanced spectators, team LED boards, a tunnel, dugouts with glass backs, floodlight towers, two live score screens, round metal goal frames and fine net meshes. Corners have animated flags. Goal nets deform near the ball impact and settle with damping; their goalpost attachments remain pinned.

The turf uses original generated textures: 16 mowing bands, grain and blade variation, lightly worn goalmouths and a tiled bump layer. Painted line ribbons retain a physical width and include penalty arcs, corner arcs and technical areas. All artwork is generated locally; there are no copied FC Mobile assets or external texture/model requests.

**Graphics → Match lighting** selects Day, Evening or Night and saves locally. Each mode changes the procedural sky, exposure, light direction, warmth, fill and stadium lamps. ACES tone mapping and physical materials give fabric, skin, grass and metal a consistent response. Low preserves the lighting palette with inexpensive contact shadows.

The original LANTERN RUSH interface adds kit lineup cards, team badge score overlays, matching goalkeeper colors, goal panels and comparison bars at halftime/full time. Broadcast cameras anticipate ball motion, use compact framing on phones, and blend into close celebration/set-piece views. Goal replays use the same lightweight in-memory snapshots, so they remain optimized browser playback rather than recorded video. This remains an optimized browser game with generic character appearances, not real-player face scans.

### Pitch-side advertising

The grass apron has 24 freestanding boards featuring the supplied Raz.aep poster, white Lantern logo and LSL crest. Full images retain their proportions, with large lettering beside them for broadcast readability. Boards leave the playing area, goals, corner approaches, benches and tunnel clear. They stay visible at every graphics setting and use three shared artwork textures and four instanced draws. They are decorative stadium artwork, with no ad network or tracking.

Update artwork entries in `src/advertisements.js`; placement and rendering are in `src/engine/advertising.js`. Images are bundled under `assets/ads/` and the existing `assets/lsl-logo.png`, so they also load on GitHub Pages. The original supplied images are preserved.

### Jersey-number provenance

`data/jersey-audit.json` lists every assignment and records source hashes, unavailable values and source conflicts. Current source coverage: 2024 **81/81**, 2025 **115/115**, and 2026 **39/82** known numbers. The 43 unlisted 2026 values stay blank. One conflicting profile and seven duplicate-number groups are flagged; the published team roster has precedence. Numbers from other seasons or representative tournament squads are never silently substituted.

To verify against a fresh website checkout:

    node scripts/check-jerseys.mjs "../LSL Website"

The supplied 2026 number list is recorded in the website rosters and covered by `tests/fixtures/confirmed-jerseys.json`. Abdul Ghiyas Solyman uses #8 in 2024, #1 in 2025, and #7 in 2026. Other players and seasons keep their source numbers, including source duplicates. Player labels, lineup/profile/intro cards, goal and foul notices, assists, substitutions and results use the same name-and-number format. Match events retain the number at the time of the event, even after a substitution.

The regular release check also validates the bundled audit. Update the website's correct season/team roster first, run the sync command, then rerun the checks to publish new numbers.

## Credits

Game identity, code, stadium and character models: original LANTERN RUSH implementation.
League names, badges and rosters: supplied Lantern Soccer League project.
Three.js: the Three.js authors, MIT license in vendor/THREE-LICENSE.txt.

## Rivalry Matches

The home screen's right-side Game Modes panel opens Quick Match or Rivalry Matches. Choose a season and a featured playoff rematch, then use Swap Sides to choose your team. These game features are based on completed LSL playoff results, not an official rivalry designation. Each featured pairing gets a skippable special introduction, historic scorecard, rivalry broadcast branding and result presentation, including when selected through Quick Match. Standard 7v7 rules, difficulty, OVR, controls and halftime still apply; historic results never prefill the live score.

Update featured pairings with `npm run sync-rivalries -- "../LSL Website"` after importing new seasons. Bundled history uses relative local JSON and requires no live website connection.


## Tournament Mode

Tournament Mode uses the Inter-Madrasah Soccer Tournament records from the LSL Website. Choose a season from the team-selection screen to view its group standings and playoff road through the semi-finals and final. Completed 2025 and 2026 fixtures are bundled in `data/tournaments.json`; official 2025/2026 institution marks are bundled under `assets/tournament/<year>/`; 2024 is shown as the pre-tournament season. Tournament play is staged: choose a year and institution, review the starting formation, continue to the full schedule, simulate other fixtures, then play the next fixture involving your team. After full time, return to the tournament schedule to continue. Teams with incomplete website rosters receive clearly labelled Player1, Player2 placeholders so every listed 2026 institution remains playable.

## Season Mode

Season Mode is available at `season-mode.html` and from the home screen. Select 2024, 2025 or 2026 and an LSL club, review its real season roster and OVR, then play the club's complete single round-robin schedule. Before the lineup screen, choose whether Trades, Minor Injuries, Suspensions and Fantasy Draft are enabled; these rules are saved with the career. Fantasy Draft uses a snake order with CPU picks between user turns and requires one goalkeeper plus six outfield players. Other fixtures can be simulated while your next match remains playable in the 3D match engine. Standings update with wins, draws, losses, goal difference and points; the top four advance to semi-finals, a third-place match and a final. The dashboard includes ranked goals, assists and shots charts with player position and club labels, plus goalkeeper games played, saves, save percentage and goals-against average. The Trade Centre opens as a multi-select dialog: one or more players can be exchanged for one or more players from a single opposing club when total published OVR is equal, while preserving a minimum seven-player roster. Minor injuries and suspensions temporarily remove players from selection and clear automatically when their return matchday arrives. Progress is saved locally, and the completed season presents the champion, Golden Boot, Player of the Season and goalkeeper award data.

## Formation / Lineup Builder

Before any Quick Match, Rivalry Match or Tournament fixture, open `FORMATION / LINEUP` to set the user's starting seven. Presets include 2-2-2, 3-2-1, 2-3-1, 3-1-2 and 1-3-2, with a Custom Formation option. Player cards can be dragged onto the pitch on desktop or touch devices, field players can be repositioned at any time, and Save Formation stores the selected players and positions in browser local storage. Reset Formation and Auto Arrange are available from the same tactical board.

## LSL Dream F.C.

dream-fc.html is the single-player Ultimate Team mode. It builds cards from the real 2024, 2025 and 2026 LSL season rosters and published OVR values, then stores the custom club, squad, packs, objectives and Ranked CPU progress in local browser storage. Dream F.C. matches remain single-player. Live H2H is a separate mode with its own backend deployment. Open the page through the same static server/GitHub Pages deployment as the other modes.

## Match presentation and account records

All modes share the same player profile presentation: published LSL OVR, derived game ratings (SPD, SHO, PAS, DRI, DEF, STA and GK), season jersey numbers, captain armbands and captain-first set-piece defaults. Low-frequency minor injuries can queue a stoppage substitution. Goals use a random celebration and a short skippable replay overlay; nameplates show the player number when a player receives the ball. Conditions are clear, the rules intentionally have no advantage call and no added time, and Crowd reactions can be disabled in Graphics settings for lower-end devices.

`account.html` stores trophies, fastest goal, most goals in a match, biggest win and longest winning streak in `lsl-account-v1` local storage. The storage shape is deliberately isolated so a future Firebase account service can replace persistence without changing match pages.


## Live Head to Head - free hosting

`live-h2h.html` provides private, host-approved two-player rooms, invitations, independent teams and formations, readiness, live room status, WebRTC matches and a 25-second reconnection window. A Cloudflare Workers Free backend with a SQLite Durable Object replaces Firebase Functions. Firebase stays on Spark. Players still use their existing username and six-digit passcode; no email form is added.

The backend replays the agreed input timeline against the official engine before saving both match reports. The frontend uses direct WebRTC with free STUN and no paid TURN relay. Some networks cannot connect directly; players see a clear explanation and can try another network.

**Setup is required before online play works.** Follow [LIVE-H2H-SETUP.md](./LIVE-H2H-SETUP.md). Create a Cloudflare Free account, deploy the backend, store the Firebase service-account secret privately, set `src/live-config.js`, publish the matching rules/site and activate the runtime document. Until then, H2H remains unavailable. No paid services have been provisioned. The previous Firebase Functions deployment stays blocked.

Keep Cloudflare on Workers Free and Firebase on Spark. Requests stop when free quotas are exhausted; there is no automatic paid fallback. A configurable 6,000-request daily backend cap further limits usage. This cap does not replace provider quotas or limit public Firestore reads.

All modes share 1-6 minute matches with equal halves. Checks: `node --test tests/free-backend.test.js tests/live-h2h.test.js tests/account-store.test.js` and `node scripts/check.mjs`. Backend build: `npm --prefix free-backend ci` then `npm --prefix free-backend run build`. Rebuild/redeploy the matching backend when the engine or rosters change.
