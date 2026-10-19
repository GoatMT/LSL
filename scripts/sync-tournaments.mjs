import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const gameRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const website = path.resolve(process.argv[2] || path.join(gameRoot, '..', 'LSL Website'));
const years = ['2024', '2025', '2026'];
const logoFiles = {
  '2025': {
    'al-khair-musalla': 'darul khair.png',
    'hifz-city': 'hifzcity.webp',
    'lantern-of-knowledge-academy': 'lanternofknowledgeacademy.png',
    'madinah-masjid': 'madinah-masjid-logo.png',
    'as-salaam-institute': 'ASSALAM INSTITUTE.webp',
    'darul-imaan': 'DARUL IMAN.png',
    'islamic-foundation': 'islamic foundation.png',
    'khairul-ummah': 'KhairulUmmah.png'
  },
  '2026': {
    'lantern-of-knowledge-academy': 'lanternofknowledgeacademy.png',
    'galt-islamic-centre': 'GALT ISLAMIC CENTRE.png',
    'madinah-masjid': 'madinah-masjid-logo.png',
    'islamic-society-of-toronto': 'islamic society of toronto.png',
    'assalam-institute-of-quran': 'ASSALAM INSTITUTE.webp',
    'islamic-foundation-of-toronto': 'islamic foundation.png',
    'khairul-ummah-academy': 'KhairulUmmah.png',
    'scarborough-muslim-association': 'scarborough muslim association.avif'
  }
};
const tournamentLogoBackgrounds = Object.freeze({
  '2025': {'lantern-of-knowledge-academy': '#0E4B25', 'islamic-foundation': '#745C3B'},
  '2026': {'lantern-of-knowledge-academy': '#0E4B25', 'islamic-foundation-of-toronto': '#745C3B'}
});
const rosterOverrides = Object.freeze({
  'khalid bana': {position: 'Goalkeeper', role: 'Goalkeeper', designation: 'Goalkeeper'},
  'abdul basit mesbah': {position: 'Goalkeeper', role: 'Backup Goalie', designation: 'Backup Goalie'},
  'hafizullah': {position: 'Forward', role: 'Best Forward', designation: 'Best Forward'}
});
const normalizedRoster = roster => (roster || []).map((player, index) => {
  const item = typeof player === 'string' ? {id: `player-${index}`, name: player} : {...player};
  const override = rosterOverrides[String(item.name || '').trim().toLowerCase()];
  return override ? {...item, ...override} : item;
});

const pick = match => {
  const keys = ['id', 'divisionId', 'round', 'label', 'time', 'homeTeamId', 'homeTeamName', 'awayTeamId', 'awayTeamName', 'homeScore', 'awayScore', 'penaltyScore', 'status'];
  return Object.fromEntries(keys.filter(key => match[key] !== undefined).map(key => [key, match[key]]));
};

const out = {};
for (const year of years) {
  const source = JSON.parse(await fs.readFile(path.join(website, 'data', year, 'tournament.json'), 'utf8'));
  const teams = (source.divisions || []).flatMap(division => division.teams || []);
  const sourceDir = path.join(website, 'IMT', 'Logos', year);
  let sourceFiles = [];
  try { sourceFiles = await fs.readdir(sourceDir); } catch { sourceFiles = []; }
  const byLower = new Map(sourceFiles.map(name => [name.toLowerCase(), name]));
  const copiedLogos = new Map();
  const destDir = path.join(gameRoot, 'assets', 'tournament', year);
  await fs.mkdir(destDir, {recursive: true});
  for (const team of teams) {
    const requested = logoFiles[year]?.[team.id];
    if (!requested) continue;
    const actual = byLower.get(requested.toLowerCase());
    if (!actual) continue;
    const ext = path.extname(actual).toLowerCase();
    const destName = `${team.id}${ext}`;
    await fs.copyFile(path.join(sourceDir, actual), path.join(destDir, destName));
    copiedLogos.set(team.id, `assets/tournament/${year}/${destName}`);
  }
  out[year] = {
    season: year,
    event: source.event || {},
    divisions: (source.divisions || []).map(division => ({
      id: division.id,
      name: division.name,
      theme: division.theme,
      teams: (division.teams || []).map(team => ({
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        logo: copiedLogos.get(team.id) || team.logo,
        logoText: team.logoText,
        logoBg: tournamentLogoBackgrounds[year]?.[team.id] || team.logoBg,
        roster: normalizedRoster(team.roster)
      }))
    })),
    matches: (source.matches || []).map(pick),
    playoffs: {
      champion: source.playoffs?.champion || '',
      runnerUp: source.playoffs?.runnerUp || '',
      rounds: (source.playoffs?.rounds || []).map(round => ({name: round.name, matches: (round.matches || []).map(pick)}))
    }
  };
}

await fs.writeFile(path.join(gameRoot, 'data', 'tournaments.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`Synced Inter-Madrasah tournament data for ${years.join(', ')} with official logos.`);
