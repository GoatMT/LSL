import {escapeHTML as e} from '../config.js';
import {DEFAULT_FORMATION_ID,FORMATION_ORDER,FORMATION_PRESETS,clampFormationPoint,formationKey,formationLabel,formationToWorld,presetSlots} from '../formation.js';

const $=id=>document.getElementById(id);
const roleLabel={GK:'GOALKEEPER',DEF:'DEFENDER',MID:'MIDFIELDER',FWD:'FORWARD'};

export class FormationBuilder{
  constructor(app){
    this.app=app;this.dialog=$('formation-dialog');this.drag=null;
    document.addEventListener('click',event=>{const button=event.target.closest?.('[data-open-formation]');if(!button)return;event.preventDefault();this.open(this.targetTeam());});
    this.dialog.querySelector('[data-formation-close]')?.addEventListener('click',()=>this.dialog.close());
    this.dialog.querySelector('#formation-preset')?.addEventListener('change',event=>{this.applyPreset(event.target.value);});
    this.dialog.querySelector('[data-formation-action="save"]')?.addEventListener('click',()=>this.save());
    this.dialog.querySelector('[data-formation-action="reset"]')?.addEventListener('click',()=>this.reset());
    this.dialog.querySelector('[data-formation-action="auto"]')?.addEventListener('click',()=>this.autoArrange());
    document.addEventListener('pointermove',event=>this.moveDrag(event),{passive:false});
    document.addEventListener('pointerup',event=>this.endDrag(event));
    document.addEventListener('pointercancel',event=>this.endDrag(event));
  }
  targetTeam(){
    if(this.app.mode==='dream'&&this.app.dream?.state){const dream=this.app.dream.read();return this.app.dream.teamFromCards(dream.customTeam.name,[...(dream.squad||[]),...(dream.subs||[])],dream.customTeam.homeKit,dream.customTeam.badge);}
    if(this.app.mode==='tournament'&&this.app.tournament?.teamId)return this.app.tournament.team(this.app.tournament.teamId)||this.app.selected.user;
    if(this.app.mode==='season'&&this.app.seasonMode?.teamId)return this.app.seasonMode.team(this.app.seasonMode.teamId)||this.app.selected.user;
    return this.app.selected?.user;
  }
  readSaved(team){
    const saved=this.app.settings.value.formations?.[formationKey(team,this.app.settings.value.season)];
    if(!saved||!Array.isArray(saved.slots)||saved.slots.length!==7)return null;
    return {formationId:saved.formationId==='custom'?'custom':FORMATION_PRESETS[saved.formationId]?saved.formationId:DEFAULT_FORMATION_ID,slots:saved.slots.map((slot,index)=>({...clampFormationPoint(slot),role:slot.role||presetSlots(DEFAULT_FORMATION_ID)[index].role,playerId:slot.playerId}))};
  }
  baseState(team,formationId=DEFAULT_FORMATION_ID){
    const slots=presetSlots(formationId);return {formationId,slots:slots.map((slot,index)=>({...slot,playerId:team.lineup?.[index]?.id||team.bench?.[index]?.id||''}))};
  }
  stateFor(team){return this.readSaved(team)||this.baseState(team);}
  roster(team){return [...(team?.lineup||[]),...(team?.bench||[])].filter((player,index,all)=>player?.id&&!all.slice(0,index).some(other=>other.id===player.id));}
  teamForMatch(team){
    const saved=this.readSaved(team);if(!saved)return {...team};
    const all=this.roster(team),used=new Set(),lineup=[];
    saved.slots.forEach((slot,index)=>{
      let player=all.find(candidate=>candidate.id===slot.playerId&&!used.has(candidate.id));
      if(!player)player=(team.lineup||[]).find(candidate=>!used.has(candidate.id));
      if(!player)player=all.find(candidate=>!used.has(candidate.id));
      if(player){used.add(player.id);lineup.push({...player,slot:index,role:slot.role});}
    });
    if(lineup.length!==7)return {...team};
    return {...team,lineup,bench:all.filter(player=>!used.has(player.id)),formation:formationToWorld(saved.slots),formationId:saved.formationId};
  }
  labelFor(team){return formationLabel(this.readSaved(team)?.formationId||DEFAULT_FORMATION_ID);}
  open(team=this.targetTeam()){
    if(!team||!this.dialog)return;
    this.team=team;this.state=this.stateFor(team);this.render();this.dialog.showModal();
  }
  applyPreset(id){
    const next=id==='custom'?'custom':FORMATION_PRESETS[id]?id:DEFAULT_FORMATION_ID;
    const points=next==='custom'?this.state.slots:presetSlots(next);
    this.state={formationId:next,slots:points.map((slot,index)=>({...slot,playerId:this.state.slots[index]?.playerId||this.team.lineup?.[index]?.id||'',role:slot.role||this.state.slots[index]?.role||'MID'}))};
    this.render();
  }
  reset(){this.state=this.baseState(this.team);this.render();}
  autoArrange(){
    const id=this.state.formationId==='custom'?DEFAULT_FORMATION_ID:this.state.formationId;
    const slots=presetSlots(id),players=this.roster(this.team),starters=this.team.lineup||[];
    const ordered=[...starters,...players.filter(player=>!starters.some(start=>start.id===player.id))];
    this.state={formationId:id,slots:slots.map((slot,index)=>({...slot,playerId:ordered[index]?.id||'',role:slot.role}))};this.render();
  }
  fieldPoint(event){
    const rect=this.field.getBoundingClientRect();return clampFormationPoint({x:(event.clientX-rect.left)/rect.width*2-1,z:(event.clientY-rect.top)/rect.height*2-1});
  }
  nearestSlot(point){return this.state.slots.reduce((best,slot,index)=>{const score=Math.hypot(slot.x-point.x,slot.z-point.z);return score<best.score?{index,score}:best;},{index:0,score:Infinity}).index;}
  startDrag(event,type,details){
    event.preventDefault();event.stopPropagation();this.drag={pointerId:event.pointerId,type,...details};event.currentTarget.setPointerCapture?.(event.pointerId);event.currentTarget.classList.add('dragging');
    if(type==='card'){const player=this.roster(this.team).find(candidate=>candidate.id===details.playerId);this.ghost=document.createElement('div');this.ghost.className='formation-drag-ghost';this.ghost.textContent=player?.name||'PLAYER';document.body.append(this.ghost);this.positionGhost(event);}
  }
  positionGhost(event){if(this.ghost){this.ghost.style.left=event.clientX+12+'px';this.ghost.style.top=event.clientY+12+'px';}}
  moveDrag(event){
    if(!this.drag||event.pointerId!==this.drag.pointerId)return;event.preventDefault();
    if(this.drag.type==='card'){this.positionGhost(event);return;}
    const point=this.fieldPoint(event),token=this.tokens?.querySelector('[data-slot="'+this.drag.slot+'"]');if(token){token.style.left=(point.x+1)*50+'%';token.style.top=(point.z+1)*50+'%';}
  }
  endDrag(event){
    if(!this.drag||event.pointerId!==this.drag.pointerId)return;const drag=this.drag;this.drag=null;this.ghost?.remove();this.ghost=null;
    const rect=this.field?.getBoundingClientRect(),inside=rect&&event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
    const point=inside?this.fieldPoint(event):null;
    if(drag.type==='token'&&point){this.state.slots[drag.slot].x=point.x;this.state.slots[drag.slot].z=point.z;this.state.formationId='custom';this.preset.value='custom';this.render();return;}
    if(drag.type==='card'&&point){const target=this.nearestSlot(point),source=this.state.slots.findIndex(slot=>slot.playerId===drag.playerId);if(source>=0&&source!==target){const playerId=this.state.slots[source].playerId;this.state.slots[source].playerId=this.state.slots[target].playerId;this.state.slots[target].playerId=playerId;}else if(source<0)this.state.slots[target].playerId=drag.playerId;this.state.formationId='custom';this.preset.value='custom';this.render();return;}
    this.render();
  }
  card(player,active){return '<button type="button" class="formation-player-card '+(active?'active':'')+'" data-player="'+e(player.id)+'"><span class="formation-card-number">'+e(player.jersey?'#'+player.jersey:'—')+'</span><span class="formation-card-copy"><strong>'+e(player.name)+'</strong><small>'+e(player.designation||player.role||player.position||'PLAYER')+'</small></span><em>'+(active?'STARTER':'BENCH')+'</em></button>';}
  render(){
    if(!this.dialog||!this.team)return;
    this.dialog.querySelector('#formation-team-name').textContent=this.team.name;
    this.dialog.querySelector('#formation-team-season').textContent=(this.team.season||this.app.settings.value.season)+' · '+this.labelForState();
    this.preset=this.dialog.querySelector('#formation-preset');this.preset.value=this.state.formationId;this.field=this.dialog.querySelector('#formation-pitch');this.tokens=this.dialog.querySelector('#formation-tokens');
    const all=this.roster(this.team),activeIds=new Set(this.state.slots.map(slot=>slot.playerId));
    this.dialog.querySelector('#formation-players').innerHTML=all.map(player=>this.card(player,activeIds.has(player.id))).join('');
    this.dialog.querySelector('#formation-slots').innerHTML=this.state.slots.map((slot,index)=>'<span class="formation-slot-marker" data-slot="'+index+'" style="left:'+(slot.x+1)*50+'%;top:'+(slot.z+1)*50+'%"><b>'+e(slot.role)+'</b></span>').join('');
    this.tokens.innerHTML=this.state.slots.map((slot,index)=>{const player=all.find(candidate=>candidate.id===slot.playerId);return '<button type="button" class="formation-player-token" data-slot="'+index+'" style="left:'+(slot.x+1)*50+'%;top:'+(slot.z+1)*50+'%" aria-label="Move '+e(player?.name||'Player')+'"><b>'+e(player?.jersey?'#'+player.jersey:'—')+'</b><span>'+e(player?.name||'Player'+(index+1))+'</span></button>';}).join('');
    this.dialog.querySelectorAll('.formation-player-card').forEach(card=>card.addEventListener('pointerdown',event=>this.startDrag(event,'card',{playerId:card.dataset.player})));
    this.tokens.querySelectorAll('.formation-player-token').forEach(token=>token.addEventListener('pointerdown',event=>this.startDrag(event,'token',{slot:Number(token.dataset.slot)})));
    this.dialog.querySelector('#formation-summary').textContent=this.state.formationId==='custom'?'Custom positions · drag every player to a new spot':'Preset '+formationLabel(this.state.formationId)+' · drag any player to fine-tune';
  }
  labelForState(){return formationLabel(this.state?.formationId||DEFAULT_FORMATION_ID);}
  save(){
    const key=formationKey(this.team,this.app.settings.value.season);this.app.settings.value.formations??={};this.app.settings.value.formations[key]={formationId:this.state.formationId,slots:this.state.slots.map(slot=>({...clampFormationPoint(slot),role:slot.role,playerId:slot.playerId}))};this.app.settings.save();this.dialog.close();this.app.menus.renderTeams();
  }
}
