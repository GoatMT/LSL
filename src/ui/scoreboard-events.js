// Shared by CPU modes and Live H2H. Notifications never change match state.
export const EVENT_SECONDS=4.5;
export function scoreboardNotice(data,match){
 return data.compact===true||data.title!=='GOAL!'&&(['playing','restart'].includes(match?.phase)||/^(MINOR INJURY|SAVE|SUBSTITUTION)/.test(data.title||''));
}
export function eventDetails(data,match){
 const side=Number.isInteger(data.team)?data.team:match?.restart?.team??match?.ball?.owner?.team??match?.inputTeam??0;
 const team=match?.teams?.[side];
 return {title:data.title||'MATCH UPDATE',team:team?.name||'LANTERN RUSH',logo:team?.logo||'./assets/lsl-logo.png',player:data.playerName||data.subtitle||''};
}
export class ScoreboardEvents{
 constructor(root){
  this.root=root;this.time=0;this.queue=[];this.current=null;if(!root)return;
  root.querySelector('.scoreboard-event')?.remove();root.classList.add('event-scoreboard');this.normal=[...root.children];
  this.panel=document.createElement('div');this.panel.className='scoreboard-event';this.panel.setAttribute('role','status');this.panel.setAttribute('aria-live','polite');this.panel.setAttribute('aria-hidden','true');
  this.logo=document.createElement('img');this.logo.alt='';this.logo.onerror=()=>{this.logo.onerror=null;this.logo.src='./assets/lsl-logo.png';};
  const copy=document.createElement('div');copy.className='scoreboard-event-copy';
  this.title=document.createElement('b');this.team=document.createElement('strong');this.player=document.createElement('span');
  copy.append(this.title,this.team,this.player);this.panel.append(this.logo,copy);root.append(this.panel);
 }
 show(data,match){
  if(!this.root)return;const detail=eventDetails(data,match);
  if(this.current?.title===detail.title&&this.current?.player===detail.player&&this.current?.team===detail.team)return;
  // Keep genuine substitutions in order; ordinary events use the latest update.
  if(this.current&&(detail.title==='SUBSTITUTION'||this.current.title==='SUBSTITUTION')){if(this.queue.length<4)this.queue.push(detail);return;}
  this.present(detail);
 }
 present(detail){
  this.current=detail;this.time=EVENT_SECONDS;this.logo.src=detail.logo;this.title.textContent=detail.title;this.team.textContent=detail.team;this.player.textContent=detail.player;
  this.panel.setAttribute('aria-hidden','false');this.normal.forEach(el=>el.setAttribute('aria-hidden','true'));this.root.classList.add('show-scoreboard-event');
 }
 update(dt){if(!this.current)return;this.time-=Math.max(0,dt);if(this.time<=0){if(this.queue.length)this.present(this.queue.shift());else this.reset();}}
 reset(){this.time=0;this.current=null;this.queue=[];this.root?.classList.remove('show-scoreboard-event');this.panel?.setAttribute('aria-hidden','true');this.normal?.forEach(el=>el.removeAttribute('aria-hidden'));}
}
