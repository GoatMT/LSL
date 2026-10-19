import {playerLabel} from '../player-label.js';
const labels={substitution:'SUBSTITUTION',timeout:'COACH TIMEOUT · TACTICAL HUDDLE',foul:'TOUCHLINE REACTION','goal-reaction':'COACH REACTION · GOAL CONCEDED',halftime:'HALFTIME WATER BREAK',fulltime:'FULL-TIME REACTION'};
export class SidelineOverlay{
  constructor(skip){
    if(!document.getElementById('sideline-style')){const link=document.createElement('link');link.id='sideline-style';link.rel='stylesheet';link.href=new URL('./sideline.css',import.meta.url).href;document.head.append(link);}
    this.root=document.createElement('aside');this.root.className='sideline-overlay';this.root.hidden=true;
    const copy=document.createElement('div');copy.className='sideline-caption';this.kind=document.createElement('small');this.team=document.createElement('strong');this.detail=document.createElement('span');copy.append(this.kind,this.team,this.detail);
    this.button=document.createElement('button');this.button.className='sideline-skip';this.button.textContent='SKIP CUTSCENE ›';this.button.onclick=skip;
    this.root.append(copy,this.button);document.body.append(this.root);this.lastVisible=false;this.exitAt=0;
  }
  update(match){
    const cue=match?.sideline,visible=!!cue&&!match.paused&&!document.querySelector('dialog[open]')&&!['home','playing','halftime','fulltime'].includes(match.phase);
    document.body.classList.toggle('sideline-active',visible);
    if(!visible){if(this.lastVisible){this.lastVisible=false;this.exitAt=performance.now()+650;this.root.dataset.returning='true';}if(this.exitAt&&performance.now()>=this.exitAt){this.root.hidden=true;this.exitAt=0;}return;}
    this.lastVisible=true;this.exitAt=0;this.root.hidden=false;
    this.root.dataset.returning=String(cue.time>=cue.duration);
    this.button.disabled=cue.time>=cue.duration;
    if(this.id===cue.id&&this.match===match)return;this.id=cue.id;this.match=match;
    this.kind.textContent=labels[cue.kind];this.team.textContent=match.teams[cue.team].name;
    this.detail.textContent=cue.kind==='substitution'?`${playerLabel(cue.outPlayer)} OFF · ${playerLabel(cue.inPlayer)} ON${cue.changes.length>1?' · '+cue.changes.length+' changes':''}`:cue.kind==='goal-reaction'?`AFTER ${cue.scorerName||match.teams[cue.scoringTeam]?.name||'THE OPPOSITION'} SCORES`:cue.kind==='halftime'?'WATER, TEAM TALK & SECOND-HALF PLAN':cue.kind==='timeout'?'THE COACH HAS CALLED THE TEAM IN TO RESET THE PLAN':'COACH & ASSISTANT COACH';
  }
  dispose(){this.root.remove();document.body.classList.remove('sideline-active');}
}
