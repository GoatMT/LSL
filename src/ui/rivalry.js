import {escapeHTML as e} from '../config.js';
import {rivalryHistory} from '../rivalry-data.js';
export function rivalryIntro(match){
 const r=match.rivalry;
 return '<section class="rivalry-intro"><span class="eyebrow">RIVALRY MATCHES · '+e(r.season)+'</span><h1>'+e(r.title)+'</h1><div class="rivalry-crests">'+match.teams.map((t,i)=>'<article style="--rival-color:'+e(t.kit)+'"><img src="'+e(t.logo)+'" alt="'+e(t.logoFallback?'LSL':t.name)+'"><strong>'+e(t.name)+'</strong><small>'+(!i?'YOU':'CPU')+'</small></article>'+(i?'':'<b>VS</b>')).join('')+'</div><div class="rivalry-history"><span>PREVIOUS PLAYOFF MEETING · '+e(r.round)+'</span><p>'+e(rivalryHistory(r,match.teams))+'</p></div><p class="rivalry-tagline">Same teams. A new story.</p></section>';
}
