import { $ } from './menus.js';
import { FIELD,clockText,clamp } from '../config.js';
import { MatchIntro } from './intro.js';
import { teamOverall } from '../ratings.js';
import { playerLabel } from '../player-label.js';
import { SHOT_NAMES } from '../match/shooting.js';
import { INTRO,introPlayer } from '../presentation.js';
import {ScoreboardEvents} from './scoreboard-events.js';
export class HUD{
  constructor(app){this.app=app;this.labels=new Map();this.ctx=$('minimap').getContext('2d');this.acc=0;this.intro=new MatchIntro();this.events=new ScoreboardEvents(document.querySelector('.scoreboard'));}
  reset(){this.events.reset();this.labels.clear();$('player-labels').replaceChildren();}
  update(dt){
    const m=this.app.match;if(!m||this.app.menus.screen!=='match')return;const p=m.controlled;this.events.update(dt);
    $('match-hud').dataset.phase=m.phase;
    $('score-user').textContent=m.stats[0].goals;$('score-cpu').textContent=m.stats[1].goals;
    $('hud-user-ovr').textContent=(teamOverall(m.teams[0])??'—')+' OVR';$('hud-cpu-ovr').textContent=(teamOverall(m.teams[1])??'—')+' OVR';
    $('match-clock').textContent=clockText(m.elapsed);$('half-label').textContent=m.half===1?'FIRST HALF':'SECOND HALF';
    $('controlled-name').textContent=playerLabel(p);
    $('controlled-profile').textContent=p.role+' · '+(p.data.overall??'—')+' OVR · '+(p.data.playstyle?.label||'');
    $('power-meter').hidden=m.charge<=0;$('power-fill').style.width=Math.round(m.charge*100)+'%';
    const keeperKick=p.role==='GK'&&m.ball.owner===p;
    const level=keeperKick?'balanced':m.charge>=.985?'max':m.charge>.78?'high':m.charge<.4?'low':'balanced';
    $('power-meter').dataset.level=level;
    $('power-label').textContent=keeperKick?'LONG KICK POWER':level==='max'?'MAX · HIGH MISS RISK':level==='high'?'HIGH · LESS ACCURATE':'SHOT POWER';
    $('shot-type').textContent=m.charge>0?(keeperKick?'DOWNFIELD':SHOT_NAMES[m.previewShot().kind]||'SHOT'):'';
    const savingPenalty=m.phase==='restart'&&m.restart?.type==='PENALTY'&&m.restart.team!==0&&p.role==='GK';
    $('touch-shoot').textContent=savingPenalty?'DIVE':m.ball.owner===p&&p.role==='GK'?'LONG KICK':'SHOOT';
    const passLabel=m.possessionTeam()===0?'PASS':'SWITCH';$('touch-pass').textContent=passLabel;$('touch-pass').setAttribute('aria-label',passLabel);$('touch-pass').dataset.mode=passLabel.toLowerCase();
    const defending=m.possessionTeam()===1;
    const skillLabel=defending?'SLIDE TACKLE':'DRIBBLE';
    $('touch-dribble').textContent=skillLabel;$('touch-dribble').setAttribute('aria-label',skillLabel);$('touch-dribble').dataset.mode=defending?'slide-tackle':'dribble';
    $('touch-goalie').disabled=m.phase!=='playing'&&!savingPenalty;$('touch-goalie').setAttribute('aria-pressed',String(p.role==='GK'));
    $('touch-goalie').setAttribute('aria-label',p.role==='GK'?'Switch back to outfield player':'Switch to goalkeeper');
    $('set-piece-hint').hidden=m.phase!=='restart';
    if(m.phase==='restart'){const r=m.restart;$('set-piece-hint').innerHTML='<strong>'+r.type+' · '+(r.team===0?'YOU':'CPU')+'</strong>'+(m.phaseTime<r.readyAt?'Getting ready…':r.team===0?'Aim with movement · Hold Shoot or tap Pass':'Finding the restart…');}
    const intro=m.phase==='intro';this.intro.update(m);
    const controlledPos=this.app.renderer.project(p.x,this.app.renderer.playerLabelHeight(),p.z);
    $('touch-controls').hidden=intro||m.phase==='goal';
    for(const player of m.players){
      let label=this.labels.get(player);
      if(!label){label=document.createElement('div');label.className='pitch-label';$('player-labels').append(label);this.labels.set(player,label);}
      const show=!player.sentOff&&(intro?m.phaseTime>=INTRO.walk||player===introPlayer(m):m.phase==='goal'?player===m.celebratingPlayer:player===m.controlled||player===m.ball.owner);label.hidden=!show;if(!show)continue;
      label.classList.toggle('you',player.team===0);
      const labelText=(intro?player.role+' · ':m.phase==='goal'?'SCORER · ':player===m.controlled?'YOU · ':player===m.ball.owner?'BALL · ':'')+playerLabel(player);
      if(label.textContent!==labelText)label.textContent=labelText;
      const pos=this.app.renderer.project(player.x,this.app.renderer.playerLabelHeight(),player.z);
      if(!intro&&m.phase!=='goal'&&player!==p&&Math.abs(pos.x-controlledPos.x)<160&&Math.abs(pos.y-controlledPos.y)<26)pos.y=controlledPos.y-27;
      label.hidden=!pos.visible;label.style.left=pos.x+'px';label.style.top=pos.y+'px';
    }
    this.acc+=dt;if(this.acc>.1){this.acc=0;this.radar();}
  }
  radar(){
    const c=this.ctx,m=this.app.match;c.clearRect(0,0,240,156);c.strokeStyle='#d8e0be80';c.lineWidth=1;c.strokeRect(6,6,228,144);c.beginPath();c.moveTo(120,6);c.lineTo(120,150);c.stroke();c.beginPath();c.arc(120,78,17,0,Math.PI*2);c.stroke();
    const sx=114/FIELD.halfLength,sz=72/FIELD.halfWidth;
    for(const p of m.players){if(p.sentOff)continue;c.fillStyle=p===m.controlled?'#edff81':m.teams[p.team].kit;c.beginPath();c.arc(120+clamp(p.x,-FIELD.halfLength,FIELD.halfLength)*sx,78+clamp(p.z,-FIELD.halfWidth,FIELD.halfWidth)*sz,p===m.controlled?5:3,0,Math.PI*2);c.fill();}
    c.fillStyle='#fff';c.beginPath();c.arc(120+clamp(m.ball.x,-FIELD.halfLength,FIELD.halfLength)*sx,78+clamp(m.ball.z,-FIELD.halfWidth,FIELD.halfWidth)*sz,2.7,0,Math.PI*2);c.fill();
  }
}
