import {durationButtons} from './match-options.js';
import {Settings,DEFAULT_KEYS,CONTROL_NAMES,keyLabel} from './settings.js';
let dialog,settings,rebinding;
export async function openSettings(){
  settings=new Settings();
  if(!dialog){
    const response=await fetch(new URL('../index.html',import.meta.url));
    if(!response.ok)throw new Error('Settings template unavailable');
    dialog=new DOMParser().parseFromString(await response.text(),'text/html').getElementById('settings-dialog');
    if(!dialog)throw new Error('Settings template missing');
    dialog.querySelector('[data-match-durations]').innerHTML=durationButtons();
    dialog.classList.add('standalone-settings');document.body.append(dialog);
    dialog.querySelector('[data-settings-panel="account"]').innerHTML='<h3>Your account</h3><p>Manage your profile, photo and match history on the Account page.</p><a class="primary" href="./account.html">OPEN ACCOUNT ↗</a>';
    dialog.addEventListener('close',()=>{rebinding=null;});
    dialog.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b)return;
      if(b.dataset.close){dialog.close();return;}
      if(b.dataset.tab){dialog.querySelectorAll('[data-settings-panel]').forEach(p=>p.hidden=p.dataset.settingsPanel!==b.dataset.tab);dialog.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('active',t===b));}
      for(const kind of ['graphics','difficulty','duration','camera'])if(b.dataset[kind]){settings.set(kind,kind==='duration'?Number(b.dataset[kind]):b.dataset[kind]);render();}
      if(b.dataset.binding){rebinding=b.dataset.binding;b.textContent='PRESS KEY…';}
      if(b.id==='reset-bindings'){settings.set('keys',{...DEFAULT_KEYS});render();}
    });
    const fields={'setting-lighting':'lighting','setting-venue':'venue','setting-weather':'weather','setting-random-conditions':'randomConditions','setting-crowd-reactions':'crowdReactions','setting-minor-injuries':'minorInjuries','setting-audio-muted':'audioMuted','setting-mobile-layout':'mobileLayout','setting-mobile-control-edit':'mobileControlEdit','setting-hold-switch':'holdAutoSwitch'};
    dialog.addEventListener('change',e=>{if(e.target.id==='setting-mobile-control-scale'){settings.set('mobileControlScale',Number(e.target.value)/100);render();return;}const key=fields[e.target.id];if(key){settings.set(key,key==='mobileLayout'?(e.target.checked?'right':'left'):e.target.type==='checkbox'?e.target.checked:e.target.value);render();}});
    dialog.querySelector('#setting-mobile-control-scale').addEventListener('input',e=>{const value=Number(e.target.value)/100;settings.set('mobileControlScale',value);const output=dialog.querySelector('#setting-mobile-control-scale-value');output.value=e.target.value+'%';output.textContent=output.value;});
    dialog.querySelector('#reset-mobile-controls').addEventListener('click',()=>{settings.set('mobileControlPositions',{joystick:{x:4,y:4},actions:{x:4,y:4}});render();});
    for(const [id,key] of [['setting-audio-master','audioMaster'],['setting-audio-sfx','audioSfx'],['setting-audio-crowd','audioCrowd']])dialog.querySelector('#'+id).addEventListener('input',event=>{settings.value[key]=Number(event.target.value)/100;const output=dialog.querySelector('#'+id+'-value');output.value=event.target.value+'%';output.textContent=output.value;settings.save();});
    dialog.addEventListener('keydown',e=>{if(!rebinding)return;e.preventDefault();if(e.code==='Escape'){rebinding=null;render();return;}if(!/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight|Tab)$/.test(e.code))return;settings.bind(rebinding,e.code);rebinding=null;render();});
  }
  render();if(!dialog.open)dialog.showModal();
}
function render(){
  for(const kind of ['graphics','difficulty','duration','camera'])dialog.querySelectorAll(`[data-${kind}]`).forEach(b=>b.classList.toggle('active',String(settings.value[kind])===b.dataset[kind]));
  for(const [id,key]of Object.entries({'setting-lighting':'lighting','setting-venue':'venue','setting-weather':'weather','setting-random-conditions':'randomConditions','setting-crowd-reactions':'crowdReactions','setting-minor-injuries':'minorInjuries','setting-audio-muted':'audioMuted','setting-mobile-control-edit':'mobileControlEdit','setting-hold-switch':'holdAutoSwitch'})){const el=dialog.querySelector('#'+id);if(el.type==='checkbox')el.checked=settings.value[key];else el.value=settings.value[key];}
  for(const [id,key]of [['setting-audio-master','audioMaster'],['setting-audio-sfx','audioSfx'],['setting-audio-crowd','audioCrowd']]){const value=Math.round(settings.value[key]*100),el=dialog.querySelector('#'+id),output=dialog.querySelector('#'+id+'-value');el.value=value;output.value=value+'%';output.textContent=output.value;}
  dialog.querySelector('#setting-mobile-layout').checked=settings.value.mobileLayout==='right';
  const mobileScale=Math.round(settings.value.mobileControlScale*100),mobileScaleInput=dialog.querySelector('#setting-mobile-control-scale'),mobileScaleOutput=dialog.querySelector('#setting-mobile-control-scale-value');mobileScaleInput.value=mobileScale;mobileScaleOutput.value=mobileScale+'%';mobileScaleOutput.textContent=mobileScaleOutput.value;
  dialog.querySelector('#mobile-layout-description').textContent=settings.value.mobileLayout==='right'?'Joystick Right / Buttons Left':'Joystick Left / Buttons Right · Default';
  dialog.querySelector('#bindings').innerHTML=Object.entries(CONTROL_NAMES).map(([key,label])=>`<label class="binding-row"><span>${label}</span><button class="key-binding" type="button" data-binding="${key}" aria-label="Rebind ${label}">${keyLabel(settings.value.keys[key])}</button></label>`).join('');
}
