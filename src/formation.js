import {FIELD,FORMATION,clamp} from './config.js';

export const FORMATION_PRESETS=Object.freeze({
  '2-2-2':[
    {role:'GK',x:-.9,z:0},{role:'DEF',x:-.56,z:-.42},{role:'DEF',x:-.56,z:.42},
    {role:'MID',x:-.16,z:-.42},{role:'MID',x:-.16,z:.42},{role:'FWD',x:.4,z:-.28},{role:'FWD',x:.4,z:.28}
  ],
  '3-2-1':[
    {role:'GK',x:-.9,z:0},{role:'DEF',x:-.56,z:-.56},{role:'DEF',x:-.56,z:0},{role:'DEF',x:-.56,z:.56},
    {role:'MID',x:-.12,z:-.38},{role:'MID',x:-.12,z:.38},{role:'FWD',x:.4,z:0}
  ],
  '2-3-1':[
    {role:'GK',x:-.9,z:0},{role:'DEF',x:-.56,z:-.4},{role:'DEF',x:-.56,z:.4},
    {role:'MID',x:-.1,z:-.58},{role:'MID',x:-.1,z:0},{role:'MID',x:-.1,z:.58},{role:'FWD',x:.42,z:0}
  ],
  '3-1-2':[
    {role:'GK',x:-.9,z:0},{role:'DEF',x:-.56,z:-.55},{role:'DEF',x:-.56,z:0},{role:'DEF',x:-.56,z:.55},
    {role:'MID',x:-.08,z:0},{role:'FWD',x:.4,z:-.35},{role:'FWD',x:.4,z:.35}
  ],
  '1-3-2':[
    {role:'GK',x:-.9,z:0},{role:'DEF',x:-.48,z:0},{role:'MID',x:-.1,z:-.56},{role:'MID',x:-.1,z:0},{role:'MID',x:-.1,z:.56},
    {role:'FWD',x:.42,z:-.35},{role:'FWD',x:.42,z:.35}
  ]
});
export const FORMATION_ORDER=Object.freeze(Object.keys(FORMATION_PRESETS));
export const DEFAULT_FORMATION_ID='2-2-2';
export const FORMATION_LIMITS=Object.freeze({xMin:-.93,xMax:.92,zMin:-.88,zMax:.88});
export function clampFormationPoint(point){return {x:clamp(Number(point?.x)||0,FORMATION_LIMITS.xMin,FORMATION_LIMITS.xMax),z:clamp(Number(point?.z)||0,FORMATION_LIMITS.zMin,FORMATION_LIMITS.zMax)};}
export function presetSlots(id=DEFAULT_FORMATION_ID){const preset=FORMATION_PRESETS[id]||FORMATION_PRESETS[DEFAULT_FORMATION_ID];return preset.map(slot=>({...slot}));}
export function formationKey(team,season){return String(season||team?.season||'2026')+':'+String(team?.id||'team');}
export function formationToWorld(slots){return slots.map((slot,index)=>{const point=clampFormationPoint(slot);return {role:slot.role||FORMATION[index]?.role||'MID',x:point.x*FIELD.halfLength,z:point.z*FIELD.halfWidth};});}
export function formationLabel(id){return id==='custom'?'CUSTOM':String(id||DEFAULT_FORMATION_ID).replaceAll('-', ' — ');}
