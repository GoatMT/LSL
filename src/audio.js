export const AUDIO_BANK=Object.freeze({
  uiClick:['ui/click_001.ogg','ui/click_002.ogg','ui/click_003.ogg'],
  uiConfirm:['ui/confirmation_001.ogg','ui/confirmation_002.ogg','ui/confirmation_003.ogg'],
  uiError:['ui/error_001.ogg','ui/error_002.ogg'],
  uiDrop:['ui/drop_001.ogg'],
  footsteps:['foley/footstep_grass_000.ogg','foley/footstep_grass_001.ogg','foley/footstep_grass_002.ogg','foley/footstep_grass_003.ogg','foley/footstep_grass_004.ogg'],
  ballTouch:['foley/impactGeneric_light_000.ogg','foley/impactGeneric_light_001.ogg','foley/impactGeneric_light_002.ogg','foley/impactGeneric_light_003.ogg','foley/impactGeneric_light_004.ogg'],
  kick:['foley/impactSoft_medium_000.ogg','foley/impactSoft_medium_001.ogg','foley/impactSoft_medium_002.ogg','foley/impactSoft_medium_003.ogg','foley/impactSoft_medium_004.ogg'],
  header:['foley/impactSoft_heavy_000.ogg','foley/impactSoft_heavy_001.ogg','foley/impactSoft_heavy_002.ogg','foley/impactSoft_heavy_003.ogg','foley/impactSoft_heavy_004.ogg'],
  tackle:['foley/impactSoft_heavy_000.ogg','foley/impactSoft_heavy_001.ogg','foley/impactSoft_heavy_002.ogg','foley/impactSoft_heavy_003.ogg','foley/impactSoft_heavy_004.ogg'],
  goalkeeper:['foley/impactSoft_medium_000.ogg','foley/impactSoft_medium_001.ogg','foley/impactSoft_medium_002.ogg','foley/impactSoft_medium_003.ogg','foley/impactSoft_medium_004.ogg'],
  goalNet:['foley/impactSoft_heavy_000.ogg','foley/impactSoft_heavy_001.ogg','foley/impactSoft_heavy_002.ogg','foley/impactSoft_heavy_003.ogg','foley/impactSoft_heavy_004.ogg'],
  post:['foley/impactMetal_medium_000.ogg','foley/impactMetal_medium_001.ogg','foley/impactMetal_medium_002.ogg','foley/impactMetal_medium_003.ogg','foley/impactMetal_medium_004.ogg'],
  whistle:['whistle/referee-whistle-01.mp3','whistle/referee-whistle-02.mp3','whistle/referee-whistle-03.mp3'],
  crowdAmbience:['crowd/Gregor-Quendel---Crowd-Cheering-Sounds---10---Ambience.mp3'],
  crowdBuild:['crowd/Gregor-Quendel---Crowd-Cheering-Sounds---09---Ambience-and-cheering.mp3'],
  crowdCheer:['crowd/Gregor-Quendel---Crowd-Cheering-Sounds---04---Strong-cheering---II---Short.mp3','crowd/Gregor-Quendel---Crowd-Cheering-Sounds---05---Soft-cheering---I.mp3','crowd/crowd-cheers.ogg','crowd/well-done-applause.ogg'],
  crowdShout:['crowd/crowd-shouting.ogg']
});

const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const hasPosition=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.z);

export function audioCueForEvent(type,data){
  if(type==='phase')return ({intro:'intro',halftime:'halftime',fulltime:'fulltime'})[data]||null;
  if(type==='sound')return data?.name||null;
  if(type==='goal')return 'goal';
  if(type==='injury')return 'injury';
  if(type==='substitution')return 'substitution';
  if(type==='card')return 'card';
  if(type==='notice'){
    const title=String(data?.title||'').toUpperCase();
    if(title==='SAVE')return 'save';
    if(title==='FOUL')return 'foul';
    if(['KICK OFF','SECOND HALF','GOAL KICK','CORNER','FREE KICK','PENALTY'].includes(title))return 'restart';
    if(title==='MISS')return 'miss';
  }
  return null;
}

export class GameAudio{
  constructor(settings){
    this.settings=settings;this.context=null;this.master=null;this.sfx=null;this.crowd=null;this.buffers=new Map();this.lastVariant=new Map();this.voices=new Set();this.footstepTimers=new WeakMap();this.dribbleTimer=0;this.lastTouchCount=null;this.ambient=null;this.wasMatchActive=false;this.lastUIAt=0;
    this.onPointerDown=()=>this.unlock();this.onClick=event=>this.uiClick(event);
    document.addEventListener('pointerdown',this.onPointerDown,{capture:true,passive:true});document.addEventListener('keydown',this.onPointerDown,{capture:true});document.addEventListener('click',this.onClick,{capture:true});
  }
  unlock(){
    try{
      if(!this.context){const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)return;this.context=new Context();this.master=this.context.createGain();this.sfx=this.context.createGain();this.crowd=this.context.createGain();this.sfx.connect(this.master);this.crowd.connect(this.master);this.master.connect(this.context.destination);this.setVolumes();}
      if(this.context.state==='suspended')this.context.resume().catch(()=>{});
    }catch{}
  }
  setVolumes(){
    if(!this.context)return;const values=this.settings.value;
    this.master.gain.setTargetAtTime(values.audioMuted?0:values.audioMaster,this.context.currentTime,.035);
    this.sfx.gain.setTargetAtTime(values.audioSfx,this.context.currentTime,.035);this.crowd.gain.setTargetAtTime(values.audioCrowd,this.context.currentTime,.09);
    if(this.wasMatchActive)this.setCrowdActive(true);
  }
  async buffer(path){
    if(!this.context)return null;if(this.buffers.has(path))return this.buffers.get(path);
    const task=fetch(new URL('../assets/audio/'+path,import.meta.url)).then(response=>{if(!response.ok)throw Error('Audio asset unavailable');return response.arrayBuffer();}).then(data=>this.context.decodeAudioData(data)).catch(()=>null);
    this.buffers.set(path,task);return task;
  }
  pick(name){
    const variants=AUDIO_BANK[name];if(!variants?.length)return null;
    let index=Math.floor(Math.random()*variants.length),previous=this.lastVariant.get(name);
    if(variants.length>1&&index===previous)index=(index+1+Math.floor(Math.random()*(variants.length-1)))%variants.length;
    this.lastVariant.set(name,index);return variants[index];
  }
  async play(name,{position=null,volume=1,rate=1,group='sfx',loop=false}={}){
    this.unlock();const ctx=this.context;if(!ctx||!AUDIO_BANK[name]||this.settings.value.audioMuted)return null;
    if((group==='crowd'?this.settings.value.audioCrowd:this.settings.value.audioSfx)<=0)return null;
    const path=this.pick(name);if(!path)return null;const audioBuffer=await this.buffer(path);if(!audioBuffer||ctx.state==='closed')return null;
    const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner?.();source.buffer=audioBuffer;source.loop=loop;
    source.playbackRate.value=rate*(.96+Math.random()*.08);let spatial=1;
    if(hasPosition(position)){
      const camera=this.cameraPosition||{x:0,z:0},dx=position.x-camera.x,dz=position.z-camera.z,dist=Math.hypot(dx,dz);
      spatial=1/(1+dist*.018);
    }
    gain.gain.value=clamp(volume,0,1.5)*spatial;source.connect(gain);if(panner){gain.connect(panner);let pan=0;if(hasPosition(position)){const right=this.cameraRight||{x:1,z:0},camera=this.cameraPosition||{x:0,z:0},lateral=(position.x-camera.x)*right.x+(position.z-camera.z)*right.z;pan=lateral/Math.max(12,Math.hypot(position.x-camera.x,position.z-camera.z));}panner.pan.value=clamp(pan,-.92,.92);panner.connect(group==='crowd'?this.crowd:this.sfx);}else gain.connect(group==='crowd'?this.crowd:this.sfx);
    if(this.voices.size>=28){const oldest=[...this.voices].find(voice=>!voice.source.loop)||this.voices.values().next().value;try{oldest.gain.gain.setTargetAtTime(0,ctx.currentTime,.012);oldest.source.stop(ctx.currentTime+.06);}catch{}this.voices.delete(oldest);}
    const voice={source,gain};this.voices.add(voice);source.onended=()=>this.voices.delete(voice);
    try{source.start();}catch{this.voices.delete(voice);return null;}return voice;
  }
  uiClick(event){
    const target=event.target?.closest?.('button,a,[role="button"]');if(!target||target.disabled||target.getAttribute('aria-disabled')==='true')return;
    const now=performance.now();if(now-this.lastUIAt<45)return;this.lastUIAt=now;
    const sound=target.classList.contains('primary')||target.matches('[data-result="continue"],[data-result="rematch"],#start-match,#play-now')?'uiConfirm':'uiClick';
    this.play(sound,{volume:sound==='uiConfirm' ? .42 : .25,rate:sound==='uiConfirm' ? 1 : .95});
  }
  matchEvent(type,data,match){
    const cue=audioCueForEvent(type,data);if(!cue)return;
    const actor=data?.player&&typeof data.player==='object'?data.player:data?.offender&&typeof data.offender==='object'?data.offender:null;
    const position=data?.position||actor||{x:match?.ball?.x||0,z:match?.ball?.z||0};
    if(cue==='intro'){this.play('uiConfirm',{volume:.45});return;}
    if(cue==='restart'){this.play('whistle',{position,volume:.48});return;}
    if(cue==='halftime'){this.play('whistle',{volume:.68});this.play('uiConfirm',{volume:.4,rate:.86});return;}
    if(cue==='fulltime'){this.play('whistle',{volume:.76});this.reaction('crowdCheer',null,.68);return;}
    if(cue==='goal'){
      this.play('goalNet',{position,volume:.84,rate:.93});this.reaction('crowdBuild',null,.46);this.reaction('crowdCheer',null,.95);return;
    }
    if(cue==='save'){this.play('goalkeeper',{position,volume:.72});this.reaction('crowdCheer',null,.33);return;}
    if(cue==='foul'){this.play('whistle',{position,volume:.54});this.reaction('crowdShout',position,.12);return;}
    if(cue==='pass'||cue==='header'||cue==='shot'||cue==='keeper-kick'||cue==='first-touch'||cue==='tackle'||cue==='post'||cue==='block'||cue==='injury'){
      const names={pass:'kick',shot:'kick','keeper-kick':'kick','first-touch':'ballTouch',tackle:'tackle',post:'post',block:'tackle',injury:'whistle',header:'header'};
      const force=clamp(Number(data?.speed)||0,0,50),power=clamp(Number(data?.power)||.5,0,1),volume=cue==='first-touch'?.3:cue==='pass'?clamp(.34+force/105,.38,.66):cue==='shot'?clamp(.52+power*.24,.52,.78):cue==='header'?.68:cue==='injury'?.42:.62;
      const rate=cue==='shot'?clamp(.9+force/90,.98,1.4):cue==='pass'?clamp(.92+force/120,.96,1.24):cue==='keeper-kick'?1.12:1;
      this.play(names[cue],{position,volume,rate});
      if(cue==='injury')this.reaction('crowdShout',position,.12);
      if(cue==='first-touch'&&match?.ball)this.lastTouchCount=match.ball.touchCount;
      return;
    }
    if(cue==='substitution'){this.play('uiConfirm',{volume:.34,rate:.92});return;}
    if(cue==='card'){this.play('uiError',{position,volume:.34,rate:.9});return;}
    if(cue==='miss'){this.reaction('crowdShout',null,.2);return;}
  }
  reaction(name,position,volume){if(this.settings.value.crowdReactions!==false)this.play(name,{position,volume,group:'crowd'});}
  setCrowdActive(active){
    if(active===this.wasMatchActive){if(active&&this.context&&!this.ambient&&!this.ambientLoading&&this.settings.value.audioCrowd>0&&!this.settings.value.audioMuted)this.startAmbient();return;}
    this.wasMatchActive=active;if(!this.context)return;
    if(active&&this.settings.value.audioCrowd>0&&!this.settings.value.audioMuted)this.startAmbient();
    else if(this.ambient){const voice=this.ambient;this.ambient=null;try{voice.gain.gain.setTargetAtTime(0,this.context.currentTime,.28);voice.source.stop(this.context.currentTime+1.2);}catch{}}
  }
  startAmbient(){this.ambientLoading=true;this.play('crowdAmbience',{group:'crowd',volume:.36,loop:true}).then(voice=>{this.ambientLoading=false;if(!voice)return;if(!this.wasMatchActive){try{voice.source.stop();}catch{}return;}this.ambient=voice;});}
  update(dt,match,inMatch,camera){
    if(camera?.position){this.cameraPosition={x:camera.position.x,z:camera.position.z};const e=camera.matrixWorld?.elements;if(e)this.cameraRight={x:e[0],z:e[2]};}
    const active=inMatch&&match&&!['home','fulltime'].includes(match.phase);this.setCrowdActive(active);
    if(!active||match.paused||match.phase!=='playing'){this.lastTouchCount=match?.ball?.touchCount??null;return;}
    const owner=match.ball.owner,choices=[match.controlled,owner].filter((player,index,array)=>player&&!player.sentOff&&array.indexOf(player)===index);
    for(const player of choices){
      const speed=Math.hypot(player.vx||0,player.vz||0);if(speed<2.5)continue;
      let until=this.footstepTimers.get(player)||0;until-=dt;if(until<=0){this.play('footsteps',{position:player,volume:player===owner ? .15:player===match.controlled ? .23 : .13,rate:clamp(speed/7,.78,1.12)});until=clamp(.54-speed*.018,.34,.49);}this.footstepTimers.set(player,until);
    }
    const touchCount=match.ball.touchCount;this.dribbleTimer-=dt;
    if(this.lastTouchCount!==touchCount){this.lastTouchCount=touchCount;if(owner&&Math.hypot(owner.vx||0,owner.vz||0)>1.6&&this.dribbleTimer<=0){this.play('ballTouch',{position:match.ball,volume:.2,rate:clamp(.9+Math.hypot(owner.vx||0,owner.vz||0)/45,.92,1.12)});this.dribbleTimer=.14;}}
  }
  dispose(){document.removeEventListener('pointerdown',this.onPointerDown,true);document.removeEventListener('keydown',this.onPointerDown,true);document.removeEventListener('click',this.onClick,true);for(const voice of this.voices){try{voice.source.stop();}catch{}}this.voices.clear();this.context?.close().catch(()=>{});this.context=null;}
}
