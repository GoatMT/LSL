// Four times the original playable AREA; actors and contact distances stay life-sized.
export const PITCH_SCALE = 2;
// Presentation scale is independent of pitch dimensions and collision/restart distances.
export const PLAYER_VISUAL_SCALE = Object.freeze({desktop:1.48,compact:1.72});
export const fieldUnits = value => value * PITCH_SCALE;
export const FIELD = Object.freeze({
  halfLength:fieldUnits(32), halfWidth:fieldUnits(21),
  goalHalf:fieldUnits(4.5), goalHeight:fieldUnits(3.2), goalDepth:fieldUnits(2),
  boxDepth:fieldUnits(10), boxHalf:fieldUnits(11),
  goalBoxDepth:fieldUnits(4), goalBoxHalf:fieldUnits(6), penaltyDistance:fieldUnits(8),
  centerRadius:fieldUnits(5), restartClearance:fieldUnits(6),
  ballRadius:.32, postRadius:.1, playerMargin:1
});
export const PLAY = Object.freeze({
  runSpeed:7.3, sprintSpeed:11.8,
  acceleration:32, sprintAcceleration:28, braking:48, turnAcceleration:78, turnRate:14, sprintTurnRate:11,
  groundDrag:.38, rollingResistance:3.0, airDrag:.095, gravity:16, bounceDamping:.22, stopSpeed:.24,
  passMin:8, passMax:46, shotBase:30, shotPower:19,
  supportGap:fieldUnits(3), pressureCover:fieldUnits(4), shootingRange:fieldUnits(17)
});
export const DIFFICULTY = {
  easy:{ reaction:.9, pressure:.58, accuracy:.60, keeper:.70, awareness:.45, shotRange:25, coverGap:6.5, diveLead:.42, kickoffShot:.025 },
  normal:{ reaction:.46, pressure:.80, accuracy:.82, keeper:.86, awareness:.72, shotRange:29, coverGap:5.2, diveLead:.52, kickoffShot:.04 },
  hard:{ reaction:.23, pressure:.96, accuracy:.95, keeper:.96, awareness:.91, shotRange:34, coverGap:4.3, diveLead:.62, kickoffShot:.055 },
  insane:{ reaction:.10, pressure:1, accuracy:.992, keeper:1.03, awareness:1, shotRange:38, coverGap:3.6, diveLead:.72, kickoffShot:.07 }
};
export const FORMATION = Object.freeze([
  {role:'GK',x:-29,z:0}, {role:'DEF',x:-19,z:-8}, {role:'DEF',x:-19,z:8},
  {role:'MID',x:-10,z:-12}, {role:'MID',x:-10,z:12}, {role:'FWD',x:-3,z:-5}, {role:'FWD',x:-3,z:5}
].map(position=>Object.freeze({...position,x:fieldUnits(position.x),z:fieldUnits(position.z)})));
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const length=(x,z)=>Math.hypot(x,z);
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const normalize=(x,z)=>{const n=Math.hypot(x,z)||1;return {x:x/n,z:z/n};};
export const lerp=(a,b,t)=>a+(b-a)*t;
export const clockText=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
