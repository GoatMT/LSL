import {durationButtons} from '../src/match-options.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=(await fs.readFile(path.join(root,'index.html'),'utf8')).replace(/(<div[^>]*data-match-durations[^>]*>)[\s\S]*?<\/div>/,'$1'+durationButtons()+'</div>');
const pages=[['quick-match.html','quick','LANTERN RUSH · QUICK MATCH'],['rivalry-matches.html','rivalry','LANTERN RUSH · RIVALRY MATCHES'],['tournament-mode.html','tournament','LANTERN RUSH · TOURNAMENT MODE'],['season-mode.html','season','LANTERN RUSH · SEASON MODE'],['dream-fc.html','dream','LSL DREAM F.C. · LANTERN RUSH']];
for(const [file,mode,title] of pages){const html=source.replace('<title>LANTERN RUSH</title>',`<title>${title}</title>`).replace('<body data-game-shell>','<body data-game-shell data-mode-page="'+mode+'">');await fs.writeFile(path.join(root,file),html);}
console.log('Synchronized dedicated LANTERN RUSH mode pages.');
