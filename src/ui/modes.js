import {escapeHTML as e} from '../config.js';
import {seasonRivalries,findRivalry,rivalryTeams,rivalryHistory} from '../modes.js';
const $=id=>document.getElementById(id);
export class ModeMenu{
 constructor(app){
  this.app=app;
  document.querySelectorAll('[data-home-mode]').forEach(b=>b.addEventListener('click',()=>app.selectTeams(b.dataset.homeMode)));
  $('rivalry-picker').addEventListener('change',ev=>this.choose(ev.target.value));
  $('rivalry-swap').addEventListener('click',()=>{[app.selected.user,app.selected.cpu]=[app.selected.cpu,app.selected.user];app.saveSelection();app.menus.renderTeams();});
 }
 options(){const a=this.app;return seasonRivalries(a.data.rivalries,a.settings.value.season,a.data.get(a.settings.value.season));}
 selected(){const a=this.app;return findRivalry(a.data.rivalries,a.settings.value.season,a.selected.user.id,a.selected.cpu.id);}
 prepare(){
  const a=this.app;if(a.mode!=='rivalry')return;
  const option=this.selected()||this.options()[0];if(option)this.choose(option.id,false);
 }
 choose(id,render=true){
  const a=this.app,r=this.options().find(r=>r.id===id);if(!r)return;
  const pair=rivalryTeams(r,a.data.get(a.settings.value.season));if(!pair)return;
  a.selected={user:pair[0],cpu:pair[1]};a.saveSelection();if(render)a.menus.renderTeams();
 }
 render(){
  const a=this.app,mode=a.mode==='rivalry',r=this.selected(),list=this.options();
  $('selection').dataset.mode=mode?'rivalry':'quick';$('selection-mode').textContent=mode?'RIVALRY MATCHES':'QUICK MATCH';
  $('selection-title').textContent=mode?'PICK YOUR RIVALRY.':'CHOOSE YOUR SIDE.';
  $('selection-description').textContent=mode?'Playoff history. A new result to write.':'Real LSL squads. One pitch. Make it count.';
  $('rivalry-controls').hidden=!mode;$('rivalry-banner').hidden=!mode||!r;
  $('rivalry-picker').innerHTML=list.map(x=>'<option value="'+e(x.id)+'">'+e(x.title+' · '+rivalryTeams(x,a.data.get(a.settings.value.season)).map(t=>t.shortName||t.name).join(' vs '))+'</option>').join('');
  if(r)$('rivalry-picker').value=r.id;
  $('rivalry-swap').disabled=!r;$('start-match').disabled=mode&&!r;
  $('rivalry-empty').hidden=!mode||list.length>0;
  for(const side of ['user','cpu'])for(const step of ['prev','next'])$(side+'-'+step).hidden=mode;
  if(r){$('rivalry-title').textContent=r.title;$('rivalry-history').textContent=r.season+' '+r.round+' · '+rivalryHistory(r,a.data.get(r.season));}
 }
}
