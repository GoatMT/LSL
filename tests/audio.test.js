import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {AUDIO_BANK,audioCueForEvent} from '../src/audio.js';
import {Settings} from '../src/settings.js';

const root=resolve(import.meta.dirname,'..');

test('every bundled audio cue resolves to a non-empty local asset',()=>{
  const assets=Object.values(AUDIO_BANK).flat();
  assert.ok(assets.length>20);
  for(const asset of assets){
    const path=resolve(root,'assets/audio',asset);
    assert.ok(existsSync(path),`Missing audio asset: ${asset}`);
    assert.ok(statSync(path).size>128,`Empty or invalid audio asset: ${asset}`);
  }
});

test('match moments and interface actions map to audio cues',()=>{
  assert.equal(audioCueForEvent('phase','intro'),'intro');
  assert.equal(audioCueForEvent('phase','halftime'),'halftime');
  assert.equal(audioCueForEvent('phase','fulltime'),'fulltime');
  assert.equal(audioCueForEvent('goal',{}),'goal');
  assert.equal(audioCueForEvent('sound',{name:'post'}),'post');
  assert.equal(audioCueForEvent('notice',{title:'CORNER'}),'restart');
  assert.equal(audioCueForEvent('notice',{title:'SAVE'}),'save');
  assert.equal(audioCueForEvent('notice',{title:'FOUL'}),'foul');
  assert.equal(audioCueForEvent('injury',{}),'injury');
  assert.equal(audioCueForEvent('card',{}),'card');
  assert.equal(audioCueForEvent('substitution',{}),'substitution');
});

test('audio sliders clamp to usable range and persist locally',()=>{
  let stored=JSON.stringify({audioMaster:1.8,audioSfx:-1,audioCrowd:.32,audioMuted:true});
  const storage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;}};
  const settings=new Settings(storage);
  assert.deepEqual([settings.value.audioMaster,settings.value.audioSfx,settings.value.audioCrowd,settings.value.audioMuted],[1,0,.32,true]);
  settings.set('audioCrowd',.67);
  assert.equal(JSON.parse(stored).audioCrowd,.67);
});
