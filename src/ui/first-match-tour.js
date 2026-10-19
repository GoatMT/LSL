const TOUR_KEY='lantern-rush-first-match-tour-v1';
const MODES={quick:'QUICK MATCH',rivalry:'RIVALRY MATCHES',season:'SEASON MODE',tournament:'TOURNAMENT MODE',dream:'LSL DREAM F.C.'};
const SLIDES=[
 {icon:'✦',kicker:'MOVEMENT',title:'FIND YOUR FEET',copy:'Use WASD to move on keyboard, or drag the 360° joystick on mobile. Hold P or SPRINT when you need a burst of speed.'},
 {icon:'↗',kicker:'ATTACK',title:'CREATE YOUR CHANCE',copy:'M passes, K shoots, and O performs a skill on keyboard. On mobile, use PASS, SHOOT and DRIBBLE. Hold SHOOT to charge power.'},
 {icon:'◎',kicker:'DEFEND',title:'READ THE PLAY',copy:'When defending, M switches to a useful teammate. Press G or GOALIE to control your keeper. Get close to challenge for the ball and watch the player marker.'}
];
export class FirstMatchTour{
 constructor(app){this.app=app;this.dialog=null;this.index=0;this.finished=false;}
 seen(){try{return this.finished||globalThis.localStorage?.getItem(TOUR_KEY)==='1';}catch{return this.finished;}}
 show(){if(this.seen())return false;this.mount();if(this.dialog.open)return true;this.index=0;this.render();this.dialog.showModal();return true;}
 mount(){
  if(this.dialog)return;
  const dialog=document.createElement('dialog');dialog.id='first-match-tour';dialog.className='first-match-tour';
  dialog.innerHTML='<header class="first-tour-head"><div><span class="eyebrow">LANTERN RUSH · FIRST MATCH</span><p id="first-tour-mode"></p></div><button type="button" class="first-tour-skip" data-tour-skip>SKIP</button></header><div class="first-tour-progress" id="first-tour-progress" aria-label="Tour progress"></div><section class="first-tour-slide" aria-live="polite"><span class="first-tour-icon" id="first-tour-icon" aria-hidden="true"></span><span class="eyebrow" id="first-tour-kicker"></span><h2 id="first-tour-title"></h2><p id="first-tour-copy"></p></section><footer class="first-tour-actions"><button type="button" class="primary" data-tour-next>NEXT →</button></footer>';
  document.body.append(dialog);this.dialog=dialog;
  dialog.querySelectorAll('[data-tour-skip]').forEach(button=>button.addEventListener('click',()=>this.finish()));
  dialog.querySelector('[data-tour-next]').addEventListener('click',()=>{if(this.index<SLIDES.length-1){this.index++;this.render();}else this.finish();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.finish();});
 }
 render(){
  const slide=SLIDES[this.index],mode=MODES[this.app.mode]||'MATCHDAY';
  this.dialog.querySelector('#first-tour-mode').textContent=mode+' · 7V7';
  this.dialog.querySelector('#first-tour-icon').textContent=slide.icon;
  this.dialog.querySelector('#first-tour-kicker').textContent=slide.kicker;
  this.dialog.querySelector('#first-tour-title').textContent=slide.title;
  this.dialog.querySelector('#first-tour-copy').textContent=slide.copy;
  this.dialog.querySelector('#first-tour-progress').innerHTML=SLIDES.map((_,i)=>'<span class="'+(i===this.index?'active':'')+'" aria-hidden="true"></span>').join('');
  const button=this.dialog.querySelector('[data-tour-next]');
  button.textContent=this.index===SLIDES.length-1?'LET’S PLAY ↗':'NEXT →';
  this.dialog.querySelector('#first-tour-title').setAttribute('aria-label','Step '+(this.index+1)+' of '+SLIDES.length+': '+slide.title);
 }
 finish(){
  this.finished=true;try{globalThis.localStorage?.setItem(TOUR_KEY,'1');}catch{}
  if(this.dialog?.open)this.dialog.close();
  this.app.start({fromFirstMatchTour:true});
 }
}
