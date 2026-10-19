import test from 'node:test';
import assert from 'node:assert/strict';
import {randomizeMatchConditions,MATCH_CONDITION_OPTIONS} from '../src/match/conditions.js';
import {Settings} from '../src/settings.js';

test('new matches randomize weather, stadium, and time without mutating preferences',()=>{
  const preferences={randomConditions:true,weather:'rain',venue:'grenoble-ps',lighting:'night',difficulty:'hard'};
  const match=randomizeMatchConditions(preferences,()=>0);
  assert.equal(match.weather,'clear');
  assert.equal(match.venue,'stadium-one');
  assert.equal(match.lighting,'day');
  assert.equal(match.difficulty,'hard');
  assert.equal(preferences.weather,'rain');
  assert.equal(preferences.venue,'grenoble-ps');
  assert.equal(preferences.lighting,'night');
});

test('manual match conditions stay fixed when random matchdays are disabled',()=>{
  const preferences={randomConditions:false,weather:'snow',venue:'grenoble-ps',lighting:'night'};
  assert.deepEqual(randomizeMatchConditions(preferences,()=>0),preferences);
});

test('random choices always use supported condition values',()=>{
  for(const value of [0,.24,.5,.76,.999,1]){
    const match=randomizeMatchConditions({randomConditions:true},()=>value);
    for(const [key,options] of Object.entries(MATCH_CONDITION_OPTIONS))assert.ok(options.includes(match[key]));
  }
});

test('random matchday preference defaults on and persists locally',()=>{
  const saved=new Map();
  const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const settings=new Settings(storage);
  assert.equal(settings.value.randomConditions,true);
  settings.set('randomConditions',false);
  assert.equal(new Settings(storage).value.randomConditions,false);
});
