# Page and Feature Inventory

The active root pages below are current entry points. Pages are grouped by user-facing workflow; some are linked through the shared navigation or profile links rather than the primary nav.

## Core League

`index.html` home; `news.html` news; `lsl-pulse.html` community feed; `standings.html`; `matches.html`; `matchday.html`; `game.html` individual match; `playoffs.html`; `projected.html`; `season-recap.html`; `advanced-stats.html`; `records.html`; `record-watch.html`; `all-time.html`; `lsl-timeline.html`; `captaincy.html`.

## Players and Staff

`players.html`; `player.html` individual profile; `player-tiers.html`; `player-vs-player.html`; `free-agents.html`; `teams.html`; `team.html` individual team; `team-vs-team.html`; `team-builder.html` 11v11 Team Builder; `coaches.html`; `coach.html` individual coach; `awards.html`; `best-all-time-team.html`; `hall-of-fame.html`; `owners.html`.

## Tournament and Media

`tournament.html` IMST; `videos.html` media; tournament data and media are currently stored in year-level `tournament.json` plus shared media folders.

## Operations, Accounts, and Other

`forms.html`; `rules.html`; `transactions.html`; `trade.html`; `franchise.html`; `admin.html`; `pulse-user.html`; `voting.html`; `404.html`.

## Archived

`_archive/projected.html`, `_archive/voting.html`, and associated legacy modules are excluded from the active page inventory and should remain untouched unless a later approved task requires archive cleanup.

## Shared Implementation

- Components: `navbar.js`, `footer.js`, `playerCard.js`, `teamCard.js`, `coachCard.js`, `matchCard.js`, `playoffBracket.js`, `standingsTable.js`, `careerTable.js`, `photoCard.js`, `videoCard.js`, `formStrip.js`.
- Domain/core: `config.js`, `dataLoader.js`, `leagueEngine.js`, `utils.js`, `animations.js`, `main.js`.
- CSS: base, components, responsive rules, modernization overlay, and page-specific styles under `css/`.
- Firebase/Pulse: `firebaseConfig.js`, `pulseFirebase.js`, `pulseShared.js`, `pulseNotifications.js`, `pulseUser.js`, `lslPulse.js`, `functions/`, `firestore.rules`.
- PWA: `manifest.json`, `service-worker.js`, registration in `js/main.js`.

## Known UX Follow-Up

The Hall of Fame double-scroll report needs browser reproduction at desktop and mobile viewport sizes. Existing HOF layout does not intentionally define its own vertical scroll container; there are other intentionally scrollable tables, menus, and lists site-wide. Identify the actual scrollable ancestors and computed overflow before changing CSS.
