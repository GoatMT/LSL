import { escapeHTML as e } from '../config.js';
import {rivalryIntro} from './rivalry.js';
import { kitSwatch } from '../kits.js';
import { teamOverall } from '../ratings.js';
import { goalkeeperKit } from '../engine/uniforms.js';
import { playerLabel } from '../player-label.js';
import { INTRO,introStage,introPlayer } from '../presentation.js';
import { formationLabel } from '../formation-data.js';
export { introStage } from '../presentation.js';
const roles={GK:'GOALKEEPER',DEF:'DEFENDER',MID:'MIDFIELDER',FWD:'FORWARD'};
const formationName=team=>formationLabel(team?.formationId||'2-2-2');
function card(p,team,index,watch=false){
  const jersey=p.jersey!=null?String(p.jersey):'',goalkeeper=p.role==='GK';
  return '<article class="intro-card slot-'+p.slot+(watch?' watch-card':'')+'" data-order="'+index+'" style="--team-color:'+e(team.kit)+'"><div class="card-top"><b>'+e(p.data.overall??'—')+'<small>OVR</small></b><img src="'+e(team.logo)+'" alt=""></div><div class="intro-kit" style="--jersey:'+kitSwatch(goalkeeper?goalkeeperKit(p.team):team.uniform||{primary:team.kit})+'"><div class="intro-kit-shirt"><i></i><span>'+e(jersey)+'</span><small>LSL</small></div></div><div class="card-name"><strong>'+e(playerLabel(p))+'</strong><span>'+roles[p.role]+'</span><small>'+e(p.data.playstyle?.label||'')+'</small></div></article>';
}
export class MatchIntro{
  constructor(){this.root=document.getElementById('intro-content');this.match=null;this.stage='';}
  update(match){
    if(match.phase!=='intro')return;
    if(this.match!==match){this.match=match;this.stage='';}
    const stage=introStage(match.phaseTime),teams=match.teams;
    const venue=match.settings?.venue==='grenoble-ps'?'GRENOBLE PUBLIC SCHOOL':'STADIUM ONE';
    document.getElementById('intro-progress').style.width=(match.phaseTime/INTRO.duration*100)+'%';
    document.getElementById('intro-overlay').dataset.stage=stage;
    document.getElementById('intro-overlay').dataset.rivalry=String(!!match.rivalry);document.getElementById('intro-overlay').dataset.tournament=String(!!match.tournament);
    if(stage!==this.stage){
      this.stage=stage;
      if(stage==='stadium')this.root.innerHTML='<div class="intro-establish"><span class="eyebrow">'+(match.tournament?'INTER-MADRASAH TOURNAMENT · ':'LANTERN SOCCER LEAGUE · ')+e(teams[0].season)+'</span><h1>THIS IS<br>MATCHDAY.</h1><p>'+venue+' <i>•</i> LANTERN RUSH</p></div>';
      if(stage==='versus')this.root.innerHTML='<div class="intro-versus">'+teams.map((t,i)=>'<article><span class="tag">'+(i?'CPU':'YOU')+'</span><img src="'+e(t.logo)+'" alt="'+e(t.logoFallback?'Lantern Soccer League':t.name+' badge')+'"><h2>'+e(t.name)+'</h2><span>'+e(formationName(t))+' · '+(teamOverall(match.teams[i])??'—')+' TEAM OVR</span></article>'+(i?'':'<strong>VS</strong>')).join('')+'</div>';
      if(match.rivalry&&(stage==='stadium'||stage==='versus'))this.root.innerHTML=rivalryIntro(match);
      if(stage==='user'||stage==='cpu')this.playerId=null;
      if(stage==='watch')this.root.innerHTML='<div class="intro-watch"><header><span class="eyebrow">MAKE THE DIFFERENCE</span><h2>PLAYERS TO WATCH</h2></header><div>'+teams.map((team,i)=>{const p=match.active(i).filter(p=>p.role!=='GK').sort((a,b)=>(b.data.overall||0)-(a.data.overall||0))[0];return '<section><span class="tag">'+(i?'CPU':'YOU')+'</span>'+card(p,team,0,true)+'</section>';}).join('')+'</div></div>';
      if(stage==='walk')this.root.innerHTML='<div class="intro-walk"><span class="eyebrow">'+venue+' · 7v7</span><h2>READY FOR KICKOFF.</h2><p>'+e(teams[0].name)+' <b>VS</b> '+e(teams[1].name)+'</p></div>';
    }
    if(stage==='user'||stage==='cpu'){
      const p=introPlayer(match);if(p&&this.playerId!==p.id){
        this.playerId=p.id;const team=teams[p.team];
        this.root.innerHTML='<div class="intro-single"><header><span class="tag">'+(p.team?'CPU':'YOU')+'</span><h2>'+e(team.name)+'</h2><span>STARTING SEVEN · '+(p.slot+1)+' / 7</span></header>'+card(p,team,p.slot)+'<footer>'+e(formationName(team))+' · '+(teamOverall(match.teams[p.team])??'—')+' TEAM OVR</footer></div>';
        this.root.querySelector('.intro-card').classList.add('revealed');
      }
    }
  }
}
