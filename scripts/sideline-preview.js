import {Match} from '../src/match/match.js';import {createLineup} from '../src/data.js';import {teamKit} from '../src/kits.js';import {GameRenderer} from '../src/engine/renderer.js';
const data=await(await fetch('../data/2026.json')).json();document.head.insertAdjacentHTML('beforeend','<base href="../">');
const teams=data.teams.slice(2,4).map(t=>{const lineup=createLineup(t.roster),uniform=teamKit('2026',t.id,'#34657a');return {...t,lineup,bench:t.roster.filter(p=>!lineup.some(q=>q.id===p.id)),kit:uniform.primary,uniform};});
const settings={duration:3,difficulty:'normal',minorInjuries:false,lighting:'day',graphics:'medium',weather:'clear',camera:'mobile'};
const renderer=new GameRenderer(document.querySelector('canvas'),settings),idle={held:new Set(),pressed:new Set(),released:new Set(),movement:()=>({x:0,z:0,intensity:0})};let match;
function scene(kind){match=new Match(teams,settings);match.resetFormation();match.phase='playing';match.elapsed=150;match.half=2;
 if(kind==='sub'){match.queueSubstitution(match.players[5].id,match.benches[0][0].id);match.beginRestart({type:'THROW-IN',team:0,x:0,z:-41});}
 if(kind==='foul'){match.players[5].x=0;match.foul(match.players[9],match.players[5],'red');}
 if(kind==='goal'){match.ball.lastTouch=match.players[5];match.goal(0);match.skipReplay();}
 if(kind==='half'){match.phase='halftime';match.half=1;match.elapsed=90;match.continueHalf();}
 if(kind==='full'){match.elapsed=180;match.finishMatch();}
 renderer.setMatch(match);
}
document.querySelectorAll('[data-scene]').forEach(button=>button.onclick=()=>scene(button.dataset.scene));scene('sub');let before=performance.now();
function frame(now){const dt=Math.min(.04,(now-before)/1000);before=now;match.update(dt,idle);renderer.render(dt,match);document.querySelector('output').textContent=match.sideline?match.sideline.variant+' · '+match.sideline.time.toFixed(1)+'s':match.phase;requestAnimationFrame(frame);}requestAnimationFrame(frame);
