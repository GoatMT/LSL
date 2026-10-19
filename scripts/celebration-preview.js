import {Match} from '../src/match/match.js';
import {createLineup} from '../src/data.js';
import {GameRenderer} from '../src/engine/renderer.js';
import {teamKit} from '../src/kits.js';
import {CELEBRATIONS,startCelebration,updateCelebration} from '../src/match/celebrations.js';
import {weatherOptionsHTML} from '../src/weather-options.js';
const $=id=>document.getElementById(id),data=await(await fetch('../data/2026.json')).json();
// Asset URLs in roster data are relative to the game root.
document.head.insertAdjacentHTML('beforeend','<base href="../">');
const teams=data.teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster),uniform=teamKit('2026',t.id,t.colors?.primary||'#34657a');return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(s=>s.id===p.id)),kit:uniform.primary,uniform};});
const m=new Match(teams,{duration:3,difficulty:'normal',graphics:'medium',weather:'clear',lighting:'day',camera:'broadcast'});
const r=new GameRenderer($('scene'),m.settings);r.setMatch(m);m.phase='goal';m.scoringTeam=0;m.celebratingPlayer=m.players[5];
$('animation').innerHTML='<option value="auto">AUTO · RANDOM CELEBRATION</option>'+CELEBRATIONS.map(n=>`<option value="${n}">${n.replace('celebrate-','').toUpperCase()}</option>`).join('');$('weather').innerHTML=weatherOptionsHTML();
let paused=false;
function reset(){m.resetFormation();m.celebratingPlayer.x=40;m.celebratingPlayer.z=10;m.celebratingPlayer.faceX=0;m.celebratingPlayer.faceZ=1;delete m.celebratingPlayer.data.celebration;m.stats[0].goals=1;startCelebration(m);if($('animation').value!=='auto'){m.celebration.name=m.goalCelebration=$('animation').value;m.celebration.big=['celebrate-pile','celebrate-hug','celebrate-late-winner'].includes(m.goalCelebration);m.celebration.duration=m.goalCelebration==='celebrate-double-slide'?10.5:8.5;m.celebratingPlayer.animate(m.goalCelebration,m.celebration.duration);}m.phaseTime=0;}
$('animation').onchange=$('restart').onclick=reset;$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};
$('weather').onchange=()=>r.setWeather($('weather').value);$('quality').onchange=()=>r.applyGraphics($('quality').value);
$('progress').oninput=()=>{paused=true;$('pause').textContent='Resume';m.celebratingPlayer.action.time=Number($('progress').value)*m.celebration.duration;};
reset();let previous=performance.now();function frame(now){const dt=Math.min(.04,(now-previous)/1000);previous=now;if(!paused){m.players.forEach(p=>p.tick(dt));m.phaseTime+=dt;updateCelebration(m,dt);if(m.celebrationTime>=m.celebration.duration)reset();$('progress').value=m.celebrationTime/m.celebration.duration;}r.render(dt,m);$('status').textContent=m.goalCelebration.replace('celebrate-','').toUpperCase()+' · '+(m.celebratingPlayer.action?.time||0).toFixed(1)+'s';requestAnimationFrame(frame);}requestAnimationFrame(frame);
