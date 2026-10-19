import {ScoreboardEvents,scoreboardNotice} from '../ui/scoreboard-events.js';
import {busyAction,confirmAction} from './ui.js';
import {Settings} from '../settings.js';
import {GameRenderer} from '../engine/renderer.js';
import {GameLoop} from '../engine/loop.js';
import {Controls} from '../input/controls.js';
import {MobileControls} from '../input/mobile.js';
import {LiveSimulation,captureInput,idlePacket,cleanInput} from './simulation.js';
import {snapshot,SnapshotView} from './snapshots.js';
import {playerLabel} from '../player-label.js';
import {clockText,escapeHTML as e} from '../config.js';
import {INTRO,introPlayer} from '../presentation.js';
import {captureMatch} from '../match-history.js';
import {GameAudio} from '../audio.js';
const $=id=>document.getElementById(id);
export async function traceDigest(trace){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(trace)));return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export class LiveArena{
 constructor({room,teams,side,send,onFinish,onCommand,onError}){Object.assign(this,{room,teams,side,send,onFinish,onCommand,onError});this.host=side===0;this.trace=[];this.outgoing=[];this.ready=false;this.done=false;this.settings=new Settings();this.audio=new GameAudio(this.settings);this.pendingCommands=[];this.inputAge=0;this.sentInput=0;this.sequence=0;this.lastRemoteSequence=-1;this.remoteAt=performance.now();this.status='Connecting both players…';}
 async start(){
  this.scoreboardEvents=new ScoreboardEvents(document.querySelector('.live-score'));
  this.controls=new Controls(this.settings);this.mobile=new MobileControls(this.controls);
  const options={...this.settings.value,...this.room.options};this.sim=new LiveSimulation(this.teams,options,this.room.seed,(type,data)=>this.event(type,data));this.match=this.sim.match;this.match.localTeam=this.side;this.audio.matchEvent('phase',this.match.phase,this.match);
  this.renderer=new GameRenderer($('live-canvas'),options);this.renderer.setMatch(this.match);this.renderer.onSkipSideline=()=>this.command({type:'skipSideline'});this.renderer.stadium.setCrowdReactions(options.crowdReactions);
  this.view=new SnapshotView(this.match,this.side,()=>{},p=>this.renderer.refreshPlayer(p,this.match));
  $('live-arena').hidden=false;document.body.dataset.screen='match';document.body.style.overflow='hidden';$('live-home-name').textContent=this.room.names[this.room.host]+' · '+this.teams[0].name;$('live-away-name').textContent=this.room.names[this.room.guest]+' · '+this.teams[1].name;
  this.loop=new GameLoop((dt)=>this.update(dt),dt=>this.render(dt));this.loop.start();
  $('live-menu-button').onclick=()=>this.menu();
  $('live-menu').onclick=ev=>{const b=ev.target.closest('[data-live-action]');if(!b)return;const a=b.dataset.liveAction;
   if(a==='resume')$('live-menu').close();
   if(a==='leave')busyAction(b,()=>this.leave(),this.onError);
   if(a==='subs')this.substitutions();
   if(a==='settings')busyAction(b,()=>this.openSettings(),this.onError);
  };
  $('live-overlay').onclick=ev=>{const b=ev.target.closest('[data-command]');if(!b)return;const command=b.dataset.command;
   if(command==='retryConnection'){busyAction(b,()=>this.onCommand('retry'),this.onError);return;}
   if(command==='retrySave'){this.retrySave?.();return;}
   if(command==='leave'){busyAction(b,()=>this.leave(),this.onError);return;}
   if(command==='subs'){this.menu();this.substitutions();return;}
   if(this.command({type:command})&&command==='continue'){b.disabled=true;b.textContent='WAITING FOR OPPONENT';}
  };
 }
 async leave(){if(await confirmAction('Leave this match?','The match will end for both players. An abandoned match does not count as a completed result.'))await this.onCommand('abandon');}
 async openSettings(){
  $('live-menu').close();const {openSettings}=await import('../page-settings.js');await openSettings();const dialog=$('settings-dialog');
  let note=dialog.querySelector('.live-settings-note');if(!note){note=document.createElement('p');note.className='live-settings-note';dialog.querySelector('.settings-tabs').after(note);}note.textContent=`Host rules: ${this.room.options.duration} min, ${this.room.options.difficulty} AI. Graphics, camera and controls apply to your device. Match rules stay fixed until full time.`;
  const locked=dialog.querySelectorAll('[data-difficulty],[data-duration],#setting-minor-injuries,#setting-lighting,#setting-weather,#setting-venue');locked.forEach(el=>el.disabled=true);
  const showRules=()=>{for(const kind of ['difficulty','duration'])dialog.querySelectorAll(`[data-${kind}]`).forEach(b=>b.classList.toggle('active',b.dataset[kind]===String(this.room.options[kind])));dialog.querySelector('#setting-lighting').value=this.room.options.lighting||'evening';dialog.querySelector('#setting-weather').value=this.match.settings.weather||'clear';dialog.querySelector('#setting-minor-injuries').checked=!!this.match.settings.minorInjuries;};showRules();dialog.addEventListener('click',showRules);dialog.addEventListener('change',showRules);
  dialog.addEventListener('close',()=>{dialog.removeEventListener('click',showRules);dialog.removeEventListener('change',showRules);},{once:true});
  dialog.addEventListener('close',()=>{locked.forEach(el=>el.disabled=false);note.remove();this.settings=new Settings();this.audio.settings=this.settings;this.audio.setVolumes();this.controls.settings=this.settings;this.mobile.applyLayout();this.renderer.applyGraphics(this.settings.value.graphics);this.renderer.stadium.setCrowdReactions(this.settings.value.crowdReactions);this.match.settings.camera=this.settings.value.camera;},{once:true});
 }
 showNotice(data){if(scoreboardNotice(data,this.match)){this.scoreboardEvents?.show(data,this.match);this.notice=null;}else{this.scoreboardEvents?.reset();this.notice=data;this.noticeUntil=performance.now()+Math.min(6,data.seconds||3)*1000;}}
 event(type,data){this.audio?.matchEvent(type,data,this.match);if(this.host&&this.ready&&['phase','goal','injury','card','substitution','sound'].includes(type)&&!(type==='phase'&&data==='intro'))this.send({type:'audio-event',eventType:type,data:this.audioPayload(type,data)});if(type==='notice'){const title=String(data?.title||'').toUpperCase();if(this.host&&this.ready&&['SAVE','FOUL','MISS','GOAL KICK','CORNER','FREE KICK','PENALTY'].includes(title))this.send({type:'audio-event',eventType:'notice',data});}if(type==='substitution')this.renderer?.refreshPlayer(data.player,this.match);if(type==='notice'){data={...data,compact:scoreboardNotice(data,this.match)};this.showNotice(data);this.send({type:'notice',data});}}
 audioPayload(type,data){if(type==='phase')return data;if(type==='sound'){const actor=data?.player&&typeof data.player==='object'?data.player:null;return{name:data?.name,position:actor?{x:actor.x,z:actor.z}:data?.position,speed:data?.speed,power:data?.power,kind:data?.kind};}const actor=data?.player&&typeof data.player==='object'?data.player:data?.offender&&typeof data.offender==='object'?data.offender:null;return actor?{position:{x:actor.x,z:actor.z}}:{position:{x:this.match?.ball?.x||0,z:this.match?.ball?.z||0}};}
 connection(ready,text){this.ready=ready;if(ready)this.wasConnected=true;this.status=text||'';this.controls?.clear();if(ready&&this.host){this.lastRemoteSequence=-1;this.remotePacket=idlePacket();this.remoteAt=performance.now();this.outgoing=[];this.send({type:'trace-reset'});for(let i=0;i<this.trace.length;i+=150)this.send({type:'trace',events:this.trace.slice(i,i+150)});this.send({type:'snapshot',value:snapshot(this.match,this.sim.tick)},true);if(this.done){this.send({type:'final-snapshot',value:snapshot(this.match,this.sim.tick)});this.send({type:'finish',tick:this.sim.tick,report:this.finalReport});}}}
 receive(message){
  if(this.host){if(message.type==='input'&&Number.isInteger(message.sequence)&&message.sequence>this.lastRemoteSequence){this.lastRemoteSequence=message.sequence;this.remoteAt=performance.now();this.remotePacket=cleanInput(message.input);}if(message.type==='command'&&['skipIntro','skipReplay','skipSideline','continue','sub'].includes(message.command?.type))this.pendingCommands.push({side:1,command:message.command});return;}
  if(message.type==='snapshot')this.view.push(message.value);if(message.type==='final-snapshot'){this.view.queue=[];this.view.latestTick=-1;this.view.push(message.value);this.view.update();}
  if(message.type==='trace-reset')this.trace=[];
  if(message.type==='trace'&&Array.isArray(message.events)&&message.events.length<=150&&this.trace.length+message.events.length<=100000)this.trace.push(...message.events);
  if(message.type==='notice')this.showNotice(message.data);
  if(message.type==='audio-event')this.audio?.matchEvent(message.eventType,message.data,this.match);
  if(message.type==='command-error')this.onError(Error(String(message.message||'The action could not be completed.')));
  if(message.type==='finish'&&!this.done){this.done=true;this.finalReport=message.report;this.onFinish(this.trace,message.tick);}
 }
 command(command){if(!this.ready){this.onError(Error('Wait for the match connection before trying again.'));return false;}if(this.host){this.pendingCommands.push({side:0,command});return true;}const sent=this.send({type:'command',command});if(!sent)this.onError(Error('Command could not be sent. Please reconnect and retry.'));return !!sent;}
 log(side,input,command){const record={t:this.sim.tick,side,...(input?{input}:{command})};if(input)this.sim.input(side,input);else this.sim.command(side,command);this.trace.push(record);this.outgoing.push(record);}
 update(dt){
  if(!this.controls)return;
  if(this.controls.pressed.has('pause')){this.menu();this.controls.pressed.delete('pause');}
  if(!this.ready||!this.room.kickoffAt||Date.now()<this.room.startedAt||this.done){this.controls.enabled=false;return;}
  const blocked=!!document.querySelector('dialog[open]');this.controls.enabled=!blocked&&['playing','restart'].includes(this.match.phase);
  if(blocked)this.controls.clear();
  this.inputAge+=dt;
  if(this.inputAge>=1/30){this.inputAge=0;const packet=captureInput(this.controls);this.controls.frame();if(this.host)this.log(0,packet);else this.send({type:'input',sequence:++this.sequence,input:packet});}
  if(!this.host)return;
  if(this.remotePacket){this.log(1,this.remotePacket);this.remotePacket=null;}
  if(performance.now()-this.remoteAt>700&&(this.sim.inputs[1].held.size||this.sim.inputs[1].x||this.sim.inputs[1].z)){this.log(1,idlePacket());}
  for(const event of this.pendingCommands.splice(0))try{this.log(event.side,null,event.command);}catch(error){if(event.side===1)this.send({type:'command-error',message:error.message});else this.onError(error);}
  this.sim.step();
  if(this.sim.tick%6===0)this.send({type:'snapshot',value:snapshot(this.match,this.sim.tick)},true);
  if(this.outgoing.length&&this.sim.tick%6===0)this.flushTrace();
  if(this.match.phase==='fulltime'){this.done=true;this.controls.enabled=false;this.flushTrace();this.finalReport=captureMatch(this.match);this.send({type:'final-snapshot',value:snapshot(this.match,this.sim.tick)});this.send({type:'finish',tick:this.sim.tick,report:this.finalReport});this.onFinish(this.trace,this.sim.tick);}
 }
 flushTrace(){while(this.outgoing.length){const events=this.outgoing.slice(0,150);if(!this.send({type:'trace',events}))break;this.outgoing.splice(0,events.length);}}
 render(dt){
  this.scoreboardEvents?.update(dt);
  if(!this.host)this.view.update(this.controls?.movement());else Object.assign(this.match,this.match.humanSeats[0]);
  const m=this.match,p=m.controlled;this.renderer.render(dt,m);this.renderer.adaptPerformance(this.loop.fps,dt);this.renderer.stadium.score(m.stats[0].goals,m.stats[1].goals);
  this.audio.update(dt,m,true,this.renderer.camera);
  $('live-score').textContent=m.stats[0].goals+' – '+m.stats[1].goals;$('live-clock').textContent=(m.half===1?'FIRST HALF':'SECOND HALF')+' · '+clockText(m.elapsed);
  $('live-nameplate').textContent=playerLabel(p)+' · '+p.role;$('touch-pass').textContent=m.ball.owner?.team===this.side?'PASS':'SWITCH';$('touch-pass').dataset.mode=m.ball.owner?.team===this.side?'pass':'switch';const defending=m.possessionTeam()!==null&&m.possessionTeam()!==this.side;$('touch-dribble').textContent=defending?'SLIDE TACKLE':'DRIBBLE';$('touch-dribble').setAttribute('aria-label',defending?'SLIDE TACKLE':'DRIBBLE');$('touch-dribble').dataset.mode=defending?'slide-tackle':'dribble';const savingPenalty=m.phase==='restart'&&m.restart?.type==='PENALTY'&&m.restart.team!==this.side&&p.role==='GK';$('touch-shoot').textContent=savingPenalty?'DIVE':m.ball.owner===p&&p.role==='GK'?'LONG KICK':'SHOOT';$('touch-goalie').disabled=m.phase!=='playing'&&!savingPenalty;$('touch-goalie').setAttribute('aria-pressed',String(p.role==='GK'));
  $('live-power').hidden=m.charge<=0;$('live-power').firstElementChild.style.width=Math.round(m.charge*100)+'%';
  $('touch-controls').hidden=!['playing','restart'].includes(m.phase)||!this.ready;
  const notice=$('live-notice');notice.hidden=!this.notice||performance.now()>this.noticeUntil;if(!notice.hidden)notice.textContent=this.notice.title+' · '+this.notice.subtitle;
  let key='',markup='';const button=(command,label)=>`<button class="hub-button ${command==='leave'?'danger':command==='subs'||command==='skipIntro'||command==='skipReplay'?'':'primary'}" data-command="${command}">${label}</button>`;
  if(!this.ready){key='connect:'+this.status;markup=`<h2>${this.wasConnected?'RECONNECTING':'CONNECTING'}</h2><p>${e(this.status||'Connecting both players…')}</p><div class="live-actions">${button('retryConnection','RETRY CONNECTION')}${button('leave','LEAVE MATCH')}</div>`;}
  else if(!this.room.kickoffAt){key='connected';markup='<h2>CONNECTED</h2><p>Both players are joining the pitch…</p>';}
  else if(Date.now()<this.room.startedAt){const count=Math.ceil((this.room.startedAt-Date.now())/1000);key='count'+count;markup=`<span class="eyebrow">BOTH PLAYERS READY</span><h2>${count}</h2><p>Welcome to ${this.room.options.venue==='grenoble-ps'?'Grenoble Public School':'Stadium One'}</p>`;}
  else if(m.phase==='intro'){const player=introPlayer(m)||m.players[0];key='intro'+player.team+player.id;markup=`<span class="eyebrow">${e(this.teams[player.team].name)} · ${e(this.room.names[this.room.members[player.team]])}</span><h2>MATCHDAY</h2><div class="live-player-intro"><small>${e(player.role)}</small><strong>${e(playerLabel(player))}</strong><small>${e(this.room.choices[this.room.members[player.team]].formation)}</small></div>${button('skipIntro','SKIP INTRO')}`;}
  else if(m.phase==='halftime'){key='half';markup=`<span class="eyebrow">TAKE A BREATH</span><h2>HALFTIME</h2><h3>${m.stats[0].goals} – ${m.stats[1].goals}</h3>${this.statsMarkup()}<p>Both players press Continue for the second half. Make substitutions in the match menu.</p>${button('continue','CONTINUE')} ${button('subs','SUBSTITUTIONS')}`;}
  else if(m.phase==='fulltime'||this.done){key='full'+(this.resultStatus||'');markup=`<span class="eyebrow">LIVE HEAD TO HEAD</span><h2>FULL TIME</h2><h3>${e(this.room.names[this.room.host])} ${m.stats[0].goals} – ${m.stats[1].goals} ${e(this.room.names[this.room.guest])}</h3>${this.statsMarkup()}<p>${e(this.resultStatus||'Verifying the match for both players’ History…')}</p><div class="live-actions">${this.retrySave?button('retrySave','RETRY SAVE'):''}<a class="hub-button" href="./history.html">HISTORY</a><a class="hub-button primary" href="./live-h2h.html">H2H HOME</a></div>`;}
  else if(m.phase==='goal'&&m.replayActive){key='replay'+m.replayStage;markup=`<h2>${m.replayStage==='celebrate'?'GOAL!':'GOAL REPLAY'}</h2>${button('skipReplay','SKIP REPLAY')}`;}
  const overlay=$('live-overlay');overlay.hidden=!markup;overlay.style.background=key.startsWith('replay')?'transparent':'';overlay.style.backdropFilter=key.startsWith('replay')?'none':'';if(key!==this.overlayKey){this.overlayKey=key;overlay.innerHTML=markup?`<section class="live-panel">${markup}</section>`:'';}
 }
 statsMarkup(){return '<div class="live-stats">'+[['Shots','shots'],['On target','onTarget'],['Passes','passes'],['Saves','saves'],['Fouls','fouls'],['Corners','corners']].map(([label,k])=>`<div>${label}<strong> · ${this.match.stats[0][k]||0} — ${this.match.stats[1][k]||0}</strong></div>`).join('')+'</div>';}
 menu(){this.controls.clear();$('live-menu').querySelector('[data-live-action=leave]').hidden=this.done;$('live-menu').querySelector('[data-live-action=subs]').disabled=this.done;if(!$('live-menu').open)$('live-menu').showModal();}
 substitutions(){const m=this.match,side=this.side,active=m.active(side),bench=m.benches[side];$('live-subs').innerHTML=`<h3>Substitutions</h3><label>PLAYER OUT<select id="live-sub-out">${active.map(p=>`<option value="${e(p.id)}">${e(playerLabel(p))} · ${p.role}</option>`).join('')}</select></label><label>PLAYER IN<select id="live-sub-in">${bench.map(p=>`<option value="${e(p.id)}">${e(playerLabel(p))}</option>`).join('')}</select></label><button id="live-sub-confirm" class="hub-button" ${bench.length?'':'disabled'}>QUEUE SUBSTITUTION</button>`;$('live-sub-confirm').onclick=()=>{const out=$('live-sub-out').value;if(this.command({type:'sub',out,in:$('live-sub-in').value})){$('live-sub-confirm').disabled=true;$('live-menu').close();}};}
 stop(){this.scoreboardEvents?.reset();this.loop?.stop();this.controls?.clear();this.mobile?.releaseAll?.();if(this.controls)this.controls.enabled=false;this.audio?.dispose();this.renderer?.sidelineCast.dispose();this.renderer?.sidelineOverlay.dispose();this.renderer?.weather.dispose();this.renderer?.renderer.dispose();this.renderer?.resizeObserver?.disconnect();if(this.renderer)removeEventListener('resize',this.renderer.onResize);$('live-arena').hidden=true;$('live-menu').close();document.body.dataset.screen='lobby';document.body.style.overflow='';}
}
