import {weatherOption} from '../weather-options.js';
import {Match} from '../match/match.js';
import {FORMATION_PRESETS,presetSlots,formationToWorld} from '../formation-data.js';
import {matchDuration} from '../match-options.js';
import {teamKit} from '../kits.js';
export const PROTOCOL=1, STEP=1/120, INPUT_HZ=30, SNAPSHOT_HZ=20, RECONNECT_SECONDS=25;
export const ACTIONS=['sprint','pass','shoot','skill','curve','goalie'];
export function seedRandom(seed){let state=seed>>>0;return ()=>{state+=0x6D2B79F5;let t=Math.imul(state^state>>>15,1|state);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export const idlePacket=()=>({x:0,z:0,held:[],pressed:[],released:[],cancelled:[],touch:false});
export function cleanInput(value={}){
 const x=Math.max(-1,Math.min(1,Number(value.x)||0)),z=Math.max(-1,Math.min(1,Number(value.z)||0)),n=Math.max(1,Math.hypot(x,z));
 const list=key=>[...new Set(Array.isArray(value[key])?value[key].filter(a=>ACTIONS.includes(a)):[])];
 return {x:Math.round(x/n*1000)/1000,z:Math.round(z/n*1000)/1000,held:list('held'),pressed:list('pressed'),released:list('released'),cancelled:list('cancelled'),touch:value.touch===true,holdAutoSwitch:value.holdAutoSwitch!==false};
}
export function captureInput(c){const m=c.movement();return cleanInput({...m,held:[...c.held],pressed:[...c.pressed],released:[...c.released],cancelled:[...c.cancelled],touch:c.isTouchHeld('pass'),holdAutoSwitch:c.settings?.value.holdAutoSwitch!==false});}
export function decodeInput(packet){const p=cleanInput(packet);return {...p,held:new Set(p.held),pressed:new Set(p.pressed),released:new Set(p.released),cancelled:new Set(p.cancelled),movement:()=>({x:p.x,z:p.z,intensity:Math.hypot(p.x,p.z)}),isTouchHeld:a=>a==='pass'&&p.touch};}
export function buildSquad(team,selection){
 if(!team||!FORMATION_PRESETS[selection.formation])throw Error('Team or formation unavailable.');
 const ids=selection.lineup||team.lineup.map(p=>p.id);
 if(ids.length!==7||new Set(ids).size!==7)throw Error('Choose seven different players.');
 const lineup=ids.map(id=>team.roster.find(p=>p.id===id));if(lineup.some(p=>!p))throw Error('A selected player is not on this season’s roster.');
 const copy=structuredClone(team),primary=typeof team.kit==='string'&&team.kit?team.kit:team.colors?.primary||team.logoBg||'#557b72',fallback=teamKit(team.season,team.id,primary),uniform={...fallback,...(team.uniform&&typeof team.uniform==='object'?team.uniform:{})};
 return {...copy,kit:primary,uniform,lineup:structuredClone(lineup),bench:structuredClone(team.roster.filter(p=>!ids.includes(p.id))),formation:formationToWorld(presetSlots(selection.formation))};
}
export class LiveSimulation{
 constructor(teams,settings,seed,event=()=>{}){
  this.match=new Match(teams,{...settings,weather:weatherOption(settings.weather),duration:matchDuration(settings.duration)},{random:seedRandom(seed),event}).enableH2H();
  this.tick=0;this.inputs=[decodeInput(idlePacket()),decodeInput(idlePacket())];this.halfReady=[false,false];
 }
 input(team,packet){this.inputs[team]=decodeInput(packet);}
 command(team,command){
  const m=this.match;
  if(command.type==='skipIntro')m.skipIntro();
  if(command.type==='skipReplay')m.skipReplay();
  if(command.type==='skipSideline')m.skipSideline();
  if(command.type==='continue'&&m.phase==='halftime'){this.halfReady[team]=true;if(this.halfReady.every(Boolean))m.continueHalf();}
  if(command.type==='sub'&&['playing','halftime','restart'].includes(m.phase))m.queueSubstitution(command.out,command.in,team);
 }
 step(){Object.assign(this.match,this.match.humanSeats[0]);this.match.remoteInput=this.inputs[1];this.match.update(STEP,this.inputs[0]);for(const p of this.inputs){p.pressed.clear();p.released.clear();p.cancelled.clear();}this.tick++;}
}
export function replayTrace(teams,settings,seed,events,endTick){
 if(!Number.isInteger(endTick)||endTick<1||endTick>240000||!Array.isArray(events)||events.length>100000)throw Error('Invalid match timeline.');
 const sim=new LiveSimulation(teams,settings,seed);let index=0,previous=-1;
 for(const e of events){if(!Number.isInteger(e.t)||e.t<previous||e.t>=endTick||![0,1].includes(e.side))throw Error('Invalid input ordering.');previous=e.t;}
 while(sim.tick<endTick){while(events[index]?.t===sim.tick){const e=events[index++];if(e.input)sim.input(e.side,e.input);else if(e.command)sim.command(e.side,e.command);else throw Error('Empty input event.');}sim.step();if(sim.match.phase==='fulltime'&&sim.tick!==endTick)throw Error('Inputs continued after full time.');}
 if(sim.match.phase!=='fulltime')throw Error('Match did not reach full time.');return sim.match;
}
