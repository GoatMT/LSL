import {DEFAULT_LINEUPS} from './default-lineups.js';
import { FORMATION } from './config.js';
import { SEASON_KITS,teamKit } from './kits.js';
const PLAYER_POSITION_OVERRIDES=Object.freeze({
  'khalid bana':{position:'Goalkeeper',role:'Goalkeeper',designation:'Goalkeeper'},
  'abdul basit mesbah':{position:'Goalkeeper',role:'Backup Goalie',designation:'Backup Goalie'},
  'hafizullah':{position:'Forward',role:'Best Forward',designation:'Best Forward'}
});
function normalizePlayer(player){
  const normalized={...player};const override=PLAYER_POSITION_OVERRIDES[String(normalized.name||'').trim().toLowerCase()];
  if(override)Object.assign(normalized,override);
  return normalized;
}
export function createLineup(roster,preferredIds=[]){
  const remaining=roster.map(normalizePlayer);
  const findEligible=predicate=>remaining.findIndex(p=>p.gameplayProfile?.usage!=='bench'&&predicate(p));
  const preferred=FORMATION.map((slot,index)=>{const found=findEligible(p=>p.id===preferredIds[index]);return found>=0?remaining.splice(found,1)[0]:null;});
  const selectedSlots=FORMATION.map((slot,index)=>{
    if(preferred[index])return preferred[index];
    const pattern=index===0?/goal|keeper/i:index<3?/defend/i:index<5?/midfield/i:/strik|forward|wing/i;
    const selected=findEligible(p=>pattern.test(p.position));
    return selected>=0?remaining.splice(selected,1)[0]:null;
  });
  return FORMATION.map((slot,index)=>{
    let player=selectedSlots[index];
    if(!player){let selected=findEligible(p=>/field/i.test(p.position));if(selected<0)selected=findEligible(p=>!/goal|keeper/i.test(p.position));if(selected<0)selected=0;player=remaining.splice(selected,1)[0];}
    if(!player)throw Error('A team needs at least seven verified players.');
    return {...player,role:slot.role,slot:index};
  });
}
export class LeagueData{
  async load(progress=()=>{}){
    const response=await fetch(new URL('../data/seasons.json',import.meta.url),{cache:'no-cache'});
    if(!response.ok)throw Error('Season list could not be loaded.');
    this.seasons=await response.json();this.teams={};
    const rivalryResponse=await fetch(new URL('../data/rivalries.json',import.meta.url),{cache:'no-cache'});
    if(!rivalryResponse.ok)throw Error('Rivalry matchups could not be loaded.');
    this.rivalries=(await rivalryResponse.json()).rivalries;
    const tournamentResponse=await fetch(new URL('../data/tournaments.json',import.meta.url),{cache:'no-cache'});
    this.tournaments=tournamentResponse.ok?await tournamentResponse.json():{};
    for(let i=0;i<this.seasons.length;i++){
      const season=this.seasons[i];
      const res=await fetch(new URL('../'+season.file,import.meta.url),{cache:'no-cache'});
      if(!res.ok)throw Error('Roster unavailable: '+season.year);
      const payload=await res.json();
      let profileDb=null;
      if(String(season.year)==='2026'){try{const pr=await fetch(new URL('../data/player-gameplay-2026.json',import.meta.url),{cache:'no-cache'});if(pr.ok)profileDb=await pr.json();}catch{}}
      this.teams[season.year]=payload.teams.filter(t=>t.roster?.length>=7).map(t=>{
        const roster=t.roster.map(p=>({...p,gameplayProfile:String(season.year)==='2026'?(profileDb?.players?.[p.id]||{status:'unknown'}):(p.gameplayProfile||null)}));
        const lineup=createLineup(roster,DEFAULT_LINEUPS[String(season.year)]?.[t.id]);
        const official=SEASON_KITS[season.year]?.[t.id];
        return {...t,roster,logo:t.logo||'assets/lsl-logo.png',logoFallback:!t.logo,season:season.year,lineup,bench:roster.filter(p=>!lineup.some(s=>s.id===p.id)),kit:official?.primary||t.colors?.primary||null,uniform:official?teamKit(season.year,t.id):null};
      });
      progress((i+1)/this.seasons.length);
    }
  }
  get(year){return this.teams[year]||[];}
  tournament(year){return this.tournaments?.[year]||{season:String(year),event:{},divisions:[],matches:[],playoffs:{rounds:[]}};}
  tournamentTeams(year){
    const tournament=this.tournament(year), palette=['#2d78c8','#e0aa4a','#2c9a6a','#9954b8','#d75b4b'];
    return (tournament.divisions||[]).flatMap((division,di)=>(division.teams||[]).map((t,index)=>{
      const roster=(t.roster||[]).map((p,i)=>normalizePlayer(typeof p==='string'?{id:(t.id+'-'+i),name:p,position:'Player'}:{...p,id:p.id||t.id+'-'+i,name:p.name||'Player',position:p.position||p.role||'Player'}));
      while(roster.length<7)roster.push({id:t.id+'-placeholder-'+roster.length,name:'Player'+(roster.length+1),position:'Player'});
      const lineup=createLineup(roster);
      const kit=t.logoBg||palette[(di+index)%palette.length];
      return {...t,season:String(year),division:division.name,logo:t.logo||'assets/lsl-logo.png',logoFallback:!t.logo,roster,lineup,bench:roster.filter(p=>!lineup.some(s=>s.id===p.id)),kit,uniform:teamKit('',t.id,kit)};
    }));
  }
}
