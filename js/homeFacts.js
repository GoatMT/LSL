import { escapeHTML } from "./utils.js";

export function buildHomeFacts(allData = []) {
  const facts = [];
  for (const season of allData) {
    const teams = new Map((season.teams || []).map(team => [team.id, team]));
    const players = new Map((season.players || []).map(player => [player.id, player]));
    const groups = new Map();
    for (const match of season.matches || []) {
      if (!['regular', 'playoffs'].includes(match.stage) || match.activityTitle) continue;
      if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) continue;
      if (match.homeScore < 0 || match.awayScore < 0) continue;
      if (/default|forfeit|shootout|penalties/i.test(`${match.status || ''} ${match.label || ''}`)) continue;
      const home = teams.get(match.homeTeamId);
      const away = teams.get(match.awayTeamId);
      const division = match.division || home?.division;
      if (!match.id || !home || !away || division !== 'Seniors') continue;
      const scope = `${season.year} | ${division} | ${match.stage === 'regular' ? 'Regular Season' : 'Playoffs'}`;
      const href = `./game.html?season=${encodeURIComponent(season.year)}&id=${encodeURIComponent(match.id)}`;
      const detail = `${home.name} ${match.homeScore}-${match.awayScore} ${away.name}`;
      const entry = { match, scope, href, detail, home, away };
      const key = `${division}:${match.stage}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    for (const matches of groups.values()) {
      const mostGoals = Math.max(...matches.map(({match}) => match.homeScore + match.awayScore));
      const biggestMargin = Math.max(...matches.map(({match}) => Math.abs(match.homeScore - match.awayScore)));
      const tiedGoals = matches.filter(({match}) => match.homeScore + match.awayScore === mostGoals).length > 1;
      const tiedMargin = matches.filter(({match}) => Math.abs(match.homeScore - match.awayScore) === biggestMargin).length > 1;
      for (const entry of matches) {
        const { match, home, away } = entry;
        const base = { scope: entry.scope, href: entry.href, detail: entry.detail, matchKey: `${season.year}:${match.id}` };
        const total = match.homeScore + match.awayScore;
        if (total === mostGoals && total >= 5) {
          facts.push({ ...base, id: `${base.matchKey}:total`, value: total, unit: 'combined goals', title: `${tiedGoals ? 'Joint h' : 'H'}ighest-scoring game of the season`, note: 'Both teams combined for this goal total.' });
        }
        const margin = Math.abs(match.homeScore - match.awayScore);
        if (margin === biggestMargin && margin >= 3) {
          const winner = match.homeScore > match.awayScore ? home : away;
          facts.push({ ...base, id: `${base.matchKey}:margin`, value: `+${margin}`, unit: 'goal margin', title: `${tiedMargin ? 'Joint b' : 'B'}iggest win of the season`, note: `${winner.name} won by ${margin} goals.` });
        }
        // Merge repeated scorer entries before checking individual match feats.
        const scorers = new Map();
        for (const scorer of match.scorers || []) {
          if (!scorer.playerId || scorer.ownGoal || /own goal/i.test(scorer.name || '')) continue;
          const goals = Number(scorer.goals);
          if (!Number.isInteger(goals) || goals < 1) continue;
          const previous = scorers.get(scorer.playerId);
          scorers.set(scorer.playerId, { name: players.get(scorer.playerId)?.name || scorer.name, goals: goals + (previous?.goals || 0) });
        }
        if ([...scorers.values()].reduce((sum, scorer) => sum + scorer.goals, 0) > total) continue;
        for (const [id, scorer] of scorers) {
          if (!scorer.name || scorer.goals < 4 || scorer.goals > Math.max(match.homeScore, match.awayScore)) continue;
          facts.push({ ...base, id: `${base.matchKey}:${id}`, value: scorer.goals, unit: 'goals in one game', title: scorer.name, note: `A ${scorer.goals}-goal performance in a single match.` });
        }
      }
    }
  }
  return facts;
}

export function renderHomeFacts() {
  return `<section class="section-panel home-facts" aria-labelledby="home-facts-title">
    <div class="section-head">
      <div><span class="eyebrow">Did You Know?</span><h2 id="home-facts-title">Crazy Stats &amp; Records</h2>
        <p>Big performances and unforgettable results from LSL Seniors history.</p></div>
      <button class="button" type="button" data-next-facts>Show More</button>
    </div>
    <div class="home-facts-grid" data-home-facts-grid aria-live="polite" aria-atomic="true"></div>
    <a class="text-link" href="./records.html">Explore all records</a>
  </section>`;
}

export function hydrateHomeFacts(allData, root = document) {
  const grid = root.querySelector('[data-home-facts-grid]');
  const button = root.querySelector('[data-next-facts]');
  if (!grid || !button) return;
  const facts = buildHomeFacts(allData);
  let remaining = [];
  let current = [];
  const shuffle = list => {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const show = () => {
    const count = Math.min(6, facts.length);
    if (remaining.length < count) {
      const fresh = shuffle(facts.filter(fact => !current.includes(fact.id)));
      remaining = [...remaining, ...fresh.filter(fact => !remaining.some(item => item.id === fact.id))];
      if (remaining.length < count) remaining.push(...shuffle(facts.filter(fact => current.includes(fact.id))));
    }
    const selected = [];
    while (selected.length < count && remaining.length) {
      const distinct = remaining.findIndex(fact => !selected.some(item => item.matchKey === fact.matchKey));
      selected.push(...remaining.splice(distinct < 0 ? 0 : distinct, 1));
    }
    current = selected.map(fact => fact.id);
    grid.innerHTML = selected.length ? selected.map(fact => `<article class="home-fact">
      <p class="home-fact-scope">${escapeHTML(fact.scope)}</p>
      <div class="home-fact-number"><strong>${escapeHTML(fact.value)}</strong><span>${escapeHTML(fact.unit)}</span></div>
      <h3>${escapeHTML(fact.title)}</h3><p>${escapeHTML(fact.note)}</p>
      <a href="${escapeHTML(fact.href)}">${escapeHTML(fact.detail)}</a>
    </article>`).join('') : '<p>More league highlights coming soon.</p>';
    button.hidden = facts.length <= 6;
  };
  button.addEventListener('click', show);
  show();
}
