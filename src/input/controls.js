import { clamp } from '../config.js';
export class Controls {
  constructor(settings){
    this.settings=settings;this.held=new Set();this.pressed=new Set();this.released=new Set();this.joystick={x:0,z:0};this.enabled=false;
    this.rebinding=null;this.sources=new Map();this.cancelled=new Set();
    addEventListener('keydown',e=>{
      if(this.rebinding){
        if(/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight|Escape|Tab)$/.test(e.code)){
          e.preventDefault();this.settings.bind(this.rebinding,e.code);this.rebinding=null;document.dispatchEvent(new Event('bindings-changed'));
        }return;
      }
      if(!this.enabled||/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName))return;
      const action=Object.keys(this.settings.value.keys).find(k=>this.settings.value.keys[k]===e.code);
      if(action){e.preventDefault();if(!e.repeat)this.down(action,'keyboard:'+e.code);}
    });
    addEventListener('keyup',e=>{const action=Object.keys(this.settings.value.keys).find(k=>this.settings.value.keys[k]===e.code);if(action){if(this.enabled)e.preventDefault();this.up(action,'keyboard:'+e.code);}});
    document.addEventListener('game-viewport-changed',()=>this.clear());
    addEventListener('blur',()=>{this.clear();document.dispatchEvent(new Event('game-blur'));});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();document.dispatchEvent(new Event('game-blur'));}});
  }
  down(action,source='default'){
    if(!this.sources.has(action))this.sources.set(action,new Set());
    this.sources.get(action).add(source);
    if(!this.held.has(action))this.pressed.add(action);this.held.add(action);this.cancelled.delete(action);
  }
  up(action,source='default',cancel=false){
    const sources=this.sources.get(action);if(!sources?.delete(source))return;
    if(sources.size)return;
    this.sources.delete(action);this.held.delete(action);
    if(cancel){this.cancelled.add(action);this.pressed.delete(action);this.released.delete(action);}
    else this.released.add(action);
  }
  isTouchHeld(action){return [...(this.sources.get(action)||[])].some(s=>s.startsWith('touch:'));}
  movement(){let x=(this.held.has('right')?1:0)-(this.held.has('left')?1:0)+this.joystick.x;
    let z=(this.held.has('back')?1:0)-(this.held.has('forward')?1:0)+this.joystick.z;
    const n=Math.hypot(x,z);if(n>1){x/=n;z/=n;}return {x,z,intensity:clamp(n,0,1)};}
  frame(){this.pressed.clear();this.released.clear();this.cancelled.clear();}
  clear(){this.sources.clear();this.held.clear();this.pressed.clear();this.released.clear();this.cancelled.clear();this.joystick={x:0,z:0};document.dispatchEvent(new Event('controls-clear'));}
}
