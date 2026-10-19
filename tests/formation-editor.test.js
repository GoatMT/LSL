import test from 'node:test';
import assert from 'node:assert/strict';
import {FormationBuilder} from '../src/ui/formation-editor.js';
import {presetSlots} from '../src/formation-data.js';

const lineup=[
  {id:'gk',name:'Keeper',position:'Goalkeeper',role:'GK'},
  {id:'lb',name:'Left Back',position:'Defender',role:'DEF'},
  {id:'cb',name:'Centre Back',position:'Defender',role:'DEF'},
  {id:'rb',name:'Right Back',position:'Defender',role:'DEF'},
  {id:'lm',name:'Left Mid',position:'Midfielder',role:'MID'},
  {id:'rm',name:'Right Mid',position:'Midfielder',role:'MID'},
  {id:'st',name:'Striker',position:'Forward',role:'FWD'}
];
const builder=()=>{const editor=Object.create(FormationBuilder.prototype);editor.team={lineup,bench:[]};return editor;};

test('formation presets keep real player roles in matching field positions',()=>{
  const editor=builder(),slots=presetSlots('3-2-1'),placed=editor.arrangeSlots(slots,lineup.map(player=>player.id));
  assert.deepEqual(placed.map(slot=>editor.team.lineup.find(player=>player.id===slot.playerId).role),slots.map(slot=>slot.role));
  assert.equal(placed[0].playerId,'gk');
  assert.deepEqual(slots.map((slot,index)=>editor.positionLabel(slot,index,slots)),['GK','LB','CB','RB','LM','RM','ST']);
});

test('formation auto-arrange can promote a real backup goalkeeper without placing the starter outfield',()=>{
  const editor=builder(),backup={id:'backup',name:'Backup',position:'Defender',backupGoalkeeper:true};
  editor.team={lineup:lineup.slice(1),bench:[backup]};
  const slots=presetSlots('2-2-2'),placed=editor.arrangeSlots(slots,[...editor.team.lineup.map(player=>player.id),backup.id]);
  assert.equal(placed[0].playerId,'backup');
  assert.equal(editor.playerRole(backup),'GK');
  assert(!placed.slice(1).some(slot=>slot.playerId==='backup'));
});
