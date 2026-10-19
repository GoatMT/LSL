import {Settings} from './settings.js';
import {ModeMenu} from './ui/mode-menu.js';
import {findRivalry} from './rivalry-data.js';
import {TournamentMenu} from './ui/tournament-mode.js';
import {LeagueData} from './data.js';
import {GameRenderer} from './engine/renderer.js';
import {GameLoop} from './engine/loop.js';
import {Match} from './match/match.js';
import {randomizeMatchConditions} from './match/conditions.js';
import {GameAudio} from './audio.js';
import {Controls} from './input/controls.js';
import {MobileControls} from './input/mobile.js';
import {Menus,$} from './ui/menus.js';
import {HUD} from './ui/hud.js';
import { playerLabel } from './player-label.js';
import { PRESENTATION } from './presentation.js';
import { SEASON_KITS,teamKit } from './kits.js';
import { FormationBuilder } from './ui/formation-editor.js';
import { SeasonMenu } from './ui/season-mode.js';
import { DreamMenu } from './dream.js';
import { CloudAccount } from './cloud-account.js';

async function badgeColor(team){
  if(team.kit)return;
  try{
    const image=new Image();image.src=team.logo;await image.decode();
    const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,32,32);
    const pixels=ctx.getImageData(0,0,32,32).data,bins=new Map();
    for(let i=0;i<pixels.length;i+=4){
      const [r,g,b]=pixels.slice(i,i+3),max=Math.max(r,g,b),min=Math.min(r,g,b);
      if(pixels[i+3]<128||max<55||min>190||max-min<35)continue;
      const key=[r,g,b].map(x=>Math.round(x/40)*40).join(',');bins.set(key,(bins.get(key)||0)+1);
    }
    const best=[...bins].sort((a,b)=>b[1]-a[1])[0];
    team.kit=best?'#'+best[0].split(',').map(v=>Math.min(255,Number(v)).toString(16).padStart(2,'0')).join(''):'#90a6af';
  }catch{team.kit='#90a6af';team.logo='assets/lsl-logo.png';team.logoFallback=true;}
}
class App {
  async init(){
    document.addEventListener('error',event=>{
      const image=event.target;
      if(!(image instanceof HTMLImageElement)||image.dataset.logoFallback==='1')return;
      if(!image.closest('.badge-wrap,.team-choice-mark,.tournament-inline-logo,.intro-card,.intro-versus,.rivalry-crests,.hud-team,.notice-score,.result-score,.potm'))return;
      image.dataset.logoFallback='1';image.src='assets/lsl-logo.png';
    },true);
    this.settings=new Settings();this.audio=new GameAudio(this.settings);this.cloudAccount=new CloudAccount({onChange:()=>this.menus?.renderAccount?.()});this.controls=new Controls(this.settings);this.data=new LeagueData();
    $('load-progress').value=12;this.renderer=new GameRenderer($('game-canvas'),this.settings.value);this.renderer.stadium.setCrowdReactions(this.settings.value.crowdReactions);
    await Promise.all([this.data.load(progress=>{$('load-progress').value=15+progress*45;}),this.renderer.stadium.advertising.ready]);
    await Promise.all(Object.values(this.data.teams).flat().map(badgeColor));
    Object.values(this.data.teams).flat().forEach(t=>t.uniform||=teamKit(t.season,t.id,t.kit));$('load-progress').value=80;
    this.menus=new Menus(this);this.hud=new HUD(this);this.mobile=new MobileControls(this.controls);
    this.mode='quick';this.modes=new ModeMenu(this);this.tournament=new TournamentMenu(this);this.seasonMode=new SeasonMenu(this);this.dream=new DreamMenu(this);await this.dream.load();this.formation=new FormationBuilder(this);this.chooseDefaults();this.match=this.makeMatch();this.match.phase='home';this.renderer.setMatch(this.match);this.menus.renderSettings();$('load-progress').value=100;
    this.menus.show('home');$('loading').hidden=true;
    this.bindHomeModePanel();
    const pageMode=document.body.dataset.modePage;
    if(pageMode)this.selectTeams(pageMode);
    if(location.hash==='#account')this.menus.account();
    this.loop=new GameLoop((dt,first)=>this.update(dt,first),dt=>this.render(dt));this.loop.start();
    document.addEventListener('game-blur',()=>{if(this.menus.screen==='match'&&!this.match.paused&&['playing','intro','restart','goal'].includes(this.match.phase))this.pause();});
    document.addEventListener('game-context-lost',()=>{this.pause();this.menus.notice({title:'GRAPHICS PAUSED',subtitle:'Restoring the 3D view. Reload if it does not recover.',seconds:50});});
    this.registerTools();
  }
  chooseDefaults(){
    const s=this.settings.value;if(!this.data.get(s.season).length)s.season=this.data.seasons.at(-1).year;
    const teams=this.data.get(s.season);
    this.selected={user:teams.find(t=>t.id===s.userTeam)||teams[0],cpu:teams.find(t=>t.id===s.cpuTeam)||teams[1]};
    if(this.selected.user.id===this.selected.cpu.id)this.selected.cpu=teams.find(t=>t.id!==this.selected.user.id);
  }
  bindHomeModePanel(){
    const toggle=$('home-modes-toggle'),panel=$('home-modes');
    if(!toggle||!panel||toggle.dataset.bound==='1')return;
    const setOpen=open=>{panel.classList.toggle('is-open',open);panel.setAttribute('aria-hidden',String(!open));toggle.setAttribute('aria-expanded',String(open));};
    toggle.dataset.bound='1';toggle.addEventListener('click',()=>setOpen(!panel.classList.contains('is-open')));
    panel.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});
    document.addEventListener('pointerdown',event=>{if(panel.classList.contains('is-open')&&!panel.contains(event.target)&&event.target!==toggle)setOpen(false);});
  }
  cpuKit(){
    if(SEASON_KITS[this.selected.user.season]?.[this.selected.user.id]&&SEASON_KITS[this.selected.cpu.season]?.[this.selected.cpu.id])return this.selected.cpu.kit;
    const a=this.selected.user.kit,b=this.selected.cpu.kit,parse=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16));
    const x=parse(a),y=parse(b),gap=Math.hypot(...x.map((n,i)=>n-y[i]));
    return gap<140?(x.reduce((sum,v)=>sum+v,0)>460?'#243c67':'#f3ecd2'):b;
  }
  makeMatch(){
    const color=this.cpuKit(),cpu={...this.selected.cpu,kit:color};
    if(color!==this.selected.cpu.kit)cpu.uniform=teamKit('',cpu.id,color);
    const user=this.formation?.teamForMatch(this.selected.user)||{...this.selected.user};
    const matchSettings=randomizeMatchConditions(this.settings.value);
    const match=new Match([user,cpu],matchSettings,{event:(type,data)=>this.handleEvent(type,data)});
    match.rivalry=this.mode==='rivalry'?findRivalry(this.data.rivalries,this.settings.value.season,this.selected.user.id,cpu.id):null;
    match.tournament=this.mode==='tournament'?this.tournament.selectedMatch():null;
    match.seasonMatch=this.mode==='season'?this.seasonMode.selectedMatch():null;
    match.dream=this.mode==='dream'?{event:this.dream?.currentEvent||null}:null;
    match.playingAccount=this.cloudAccount?.profile?{uid:this.cloudAccount.profile.uid,username:this.cloudAccount.profile.username}:null;
    return match;
  }
  handleEvent(type,data){
    if(!this.menus||!this.match)return;
    this.audio?.matchEvent(type,data,this.match);
    if(type==='phase'){if(data==='fulltime'){this.cloudAccount?.recordMatch(this.match).catch(()=>{this.menus.notice({title:'HISTORY SYNC PENDING',subtitle:this.match.historySavedLocally?'Saved on this device. Open History to retry cloud sync.':'Could not save the report. Keep this page open and check device storage.',seconds:6});});}this.menus.phase(data);}
    if(type==='notice')this.menus.notice(data);
    if(type==='goal')this.renderer.stadium.score(...this.match.stats.map(s=>s.goals));
    if(type==='substitution'){this.renderer.refreshPlayer(data.player,this.match);this.menus.notice({title:'SUBSTITUTION',team:data.team,subtitle:playerLabel({name:data.out,jersey:data.outJersey})+' → '+playerLabel({name:data.in,jersey:data.inJersey}),seconds:PRESENTATION.substitution});}
  }
  returnToTournament(){this.menus.closeAll();this.mode='tournament';this.tournament.afterGame(this.match);this.menus.selection();}
  returnToSeason(){this.menus.closeAll();this.mode='season';this.seasonMode.afterGame(this.match);this.menus.selection();}
  returnToDream(){this.menus.closeAll();this.mode='dream';this.dream.afterGame(this.match);this.menus.selection();}
  home(){if(document.body.dataset.modePage){location.assign('./index.html');return;}this.menus.closeAll();this.controls.clear();this.match=this.makeMatch();this.match.phase='home';this.renderer.setMatch(this.match);this.hud.reset();this.menus.show('home');$('home-modes')?.classList.remove('is-open');$('home-modes-toggle')?.setAttribute('aria-expanded','false');}
  selectTeams(mode=this.mode){this.mode=['rivalry','tournament','season','dream'].includes(mode)?mode:'quick';this.menus.closeAll();if(this.match)this.match.phase='home';this.modes.prepare();this.tournament.prepare();this.seasonMode.prepare();this.dream.prepare();this.menus.selection();}
  changeSeason(year){this.settings.set('season',year);this.chooseDefaults();this.modes.prepare();this.tournament.prepare();this.seasonMode.prepare();this.dream.prepare();this.saveSelection();this.menus.renderTeams();}
  cycle(side,step){
    const teams=this.data.get(this.settings.value.season),other=side==='user'?'cpu':'user';let i=teams.indexOf(this.selected[side]);
    do{i=(i+step+teams.length)%teams.length;}while(teams[i].id===this.selected[other].id);
    this.selected[side]=teams[i];this.saveSelection();this.menus.renderTeams();
  }
  saveSelection(){this.settings.value.userTeam=this.selected.user.id;this.settings.value.cpuTeam=this.selected.cpu.id;this.settings.save();}
  async start({fromFirstMatchTour=false}={}){
    if(this.loadingMatch)return;
    if(!fromFirstMatchTour&&this.menus?.firstMatchTour?.show())return;
    this.loadingMatch=true;this.menus.closeAll();this.controls.clear();this.saveSelection();
    if(this.match)this.match.paused=true;$('loading').hidden=false;$('load-progress').hidden=false;$('load-progress').value=30;$('load-message').textContent='Preparing the starting seven…';
    await new Promise(requestAnimationFrame);
    this.match=this.makeMatch();$('load-progress').value=70;$('load-message').textContent='Preparing '+(this.match.settings.venue==='grenoble-ps'?'Grenoble Public School':'Stadium One')+'…';
    this.renderer.setMatch(this.match);this.hud.reset();this.renderer.render(0,this.match);await new Promise(requestAnimationFrame);
    this.menus.enterMatch();$('loading').hidden=true;this.loadingMatch=false;
  }
  pause(){
    if(this.menus.screen!=='match'||this.match.paused||!['playing','intro','restart','goal'].includes(this.match.phase))return;
    this.match.pause();this.menus.pause();
  }
  update(dt,first){
    if(document.querySelector('dialog[open]')){this.controls.frame();return;}
    if(this.controls.pressed.has('pause')){this.pause();this.controls.frame();return;}
    if(['match','home','stats-screen'].includes(this.menus.screen))this.match.update(dt,this.controls);
    if(first)this.controls.frame();
  }
  render(dt){
    this.renderer.render(dt,this.match);this.hud.update(dt);this.menus.updateNotice(dt);
    this.audio.update(dt,this.match,this.menus.screen==='match',this.renderer.camera);
    if(this.menus.screen==='match'&&!this.match.paused&&this.match.phase==='playing')this.renderer.adaptPerformance(this.loop.fps,dt);
    if(this.menus.screen==='match'&&this.match.phase==='playing'&&matchMedia('(pointer:coarse)').matches){
      this.slowTime=this.loop.fps<32?(this.slowTime||0)+dt:Math.max(0,(this.slowTime||0)-dt);
      if(this.slowTime>5&&this.renderer.quality!=='low'){
        this.renderer.applyGraphics('low');this.slowTime=0;this.menus.notice({title:'PERFORMANCE MODE',subtitle:'Graphics reduced for smoother play',seconds:2});
      }
    }
  }
  registerTools(){
    if(!document.modelContext?.registerTool)return;
    try{Promise.resolve(document.modelContext.registerTool({
      name:'read_lantern_rush_match',title:'Read LANTERN RUSH match',description:'Read the current match phase, selected teams, score, clock and rendering performance.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},
      execute:()=>({phase:this.match.phase,teams:this.match.teams.map(t=>t.name),score:this.match.stats.map(s=>s.goals),elapsed:this.match.elapsed,half:this.match.half,framesPerSecond:Math.round(this.loop.fps),graphics:this.renderer.quality,lighting:this.renderer.lighting.name,drawCalls:this.renderer.renderer.info.render.calls,triangles:this.renderer.renderer.info.render.triangles,renderScale:this.renderer.adaptiveScale,playerScale:this.renderer.actorScale})
    })).catch(()=>{});}catch{}
  }
}
const app=new App();
app.init().catch(error=>{
  console.error('LANTERN RUSH startup failed:',error);$('loading').hidden=false;const detail=error?.message||'Unknown startup error';const graphicsHint=/WebGL|context/i.test(detail)?' · Check WebGL 2 support, then reload.':'';$('load-message').textContent='Unable to start: '+detail+graphicsHint;
  $('load-progress').hidden=true;
});

