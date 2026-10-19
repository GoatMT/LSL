import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {PLAYER_VISUAL_SCALE,FIELD} from '../src/config.js';
import {appearanceFor} from '../src/engine/appearance.js';
import {playerAttributes} from '../src/match/attributes.js';
import {playerShapes} from '../src/engine/player-mesh-parts.js';
import fs from 'node:fs';
const profiles=JSON.parse(fs.readFileSync(new URL('../data/player-gameplay-2026.json',import.meta.url)));
import {Settings} from '../src/settings.js';
import {MatchLighting,MATCH_LIGHTING} from '../src/engine/lighting.js';
import {BroadcastCamera} from '../src/engine/camera.js';
import {createMarkings} from '../src/engine/turf.js';
import {Stadium} from '../src/engine/stadium.js';

test('lighting persists independently of graphics and corrupt values fall back safely',()=>{
  let saved='{}';const storage={getItem:()=>saved,setItem:(_,v)=>saved=v},settings=new Settings(storage);
  assert.equal(settings.value.lighting,'evening');assert.equal(settings.value.camera,'broadcast');
  for(const mode of ['day','evening','night']){settings.set('lighting',mode);settings.set('graphics','low');assert.equal(new Settings(storage).value.lighting,mode);}
  saved='{"lighting":"invalid"}';assert.equal(new Settings(storage).value.lighting,'evening');
});

test('lighting transitions preserve a single bounded, moving shadow light',()=>{
  const scene=new T.Scene(),rig=new MatchLighting(scene);const powers=[];
  for(const mode of Object.keys(MATCH_LIGHTING)){
    const p=rig.set(mode);powers.push(p.exposure);rig.update(1/60,{x:FIELD.halfLength,z:FIELD.halfWidth});
    assert(rig.sun.position.toArray().every(Number.isFinite));assert(rig.sun.target.position.x<=36);assert(rig.sun.target.position.z<=15);assert.equal(scene.children.filter(x=>x.isLight&&x.castShadow).length,1);
  }
  assert.equal(new Set(powers).size,3);assert.deepEqual(rig.set('invalid'),MATCH_LIGHTING.evening);
});

test('phone framing enlarges player silhouettes while keeping all pitch corners playable',()=>{
  const pixelHeights=[];
  for(const compact of [false,true]){
    const camera=new T.PerspectiveCamera(49,844/390,.2,520),rig=new BroadcastCamera(camera);rig.compact=compact;
    const match={phase:'playing',settings:{camera:'broadcast'},ball:{x:0,z:0,y:.32,vx:0,vz:0},controlled:{x:0,z:0,team:0},active:()=>[]};
    for(let i=0;i<240;i++)rig.update(1/60,1,match);camera.updateMatrixWorld();
    const scale=compact?PLAYER_VISUAL_SCALE.compact:1.13;
    const feet=new T.Vector3(0,0,0).project(camera),head=new T.Vector3(0,2.3*scale,0).project(camera);pixelHeights.push(Math.abs(head.y-feet.y)*195);
    for(const x of [-FIELD.halfLength,FIELD.halfLength])for(const z of [-FIELD.halfWidth,FIELD.halfWidth]){
      Object.assign(match.ball,{x,z});Object.assign(match.controlled,{x,z});for(let i=0;i<240;i++)rig.update(1/60,1,match);camera.updateMatrixWorld();
      const point=new T.Vector3(x,.32,z).project(camera);assert(Math.abs(point.x)<.95&&Math.abs(point.y)<.95);
    }
  }
  assert(pixelHeights[1]>pixelHeights[0]*1.6,JSON.stringify(pixelHeights));assert(PLAYER_VISUAL_SCALE.desktop>1.13);
});

test('painted pitch geometry is finite, flat, and contains both penalty arcs',()=>{
  const mesh=createMarkings(),p=mesh.geometry.attributes.position;assert(p.count>2000);let leftArc=false,rightArc=false;
  for(let i=0;i<p.count;i++){assert(Number.isFinite(p.getX(i)));assert(Math.abs(p.getY(i)-.022)<.00001);assert(Math.abs(p.getX(i))<FIELD.halfLength+1);assert(Math.abs(p.getZ(i))<FIELD.halfWidth+5);if(Math.abs(p.getZ(i))<2){leftArc||=p.getX(i)>-40&&p.getX(i)<-37;rightArc||=p.getX(i)<40&&p.getX(i)>37;}}
  assert(leftArc&&rightArc);
});

test('net ripples affect only the struck goal, keep the posts pinned and settle',()=>{
  const stadium=Object.create(Stadium.prototype);Object.assign(stadium,{root:new T.Group(),fieldFeatures:new T.Group(),nets:[],flags:[],level:'low',previousPhase:'playing'});stadium.goal(-1);stadium.goal(1);
  const match={phase:'goal',ball:{x:FIELD.halfLength+2,z:2,y:2,vx:20,vz:0}};stadium.update(1,match);stadium.update(1.12,match);
  const hit=stadium.nets[1],other=stadium.nets[0],positions=hit.geometry.attributes.position.array,base=hit.userData.base;
  assert(positions.some((v,i)=>Math.abs(v-base[i])>.001));assert.deepEqual(other.geometry.attributes.position.array,other.userData.base);
  for(let i=0;i<base.length;i+=3)if(base[i]===FIELD.halfLength)assert.equal(positions[i],base[i]);
  match.ball.vx=0;stadium.update(4.2,match);assert.deepEqual(positions,base);assert.equal(hit.userData.impact,null);
});

test('2026 model appearance honors player hair, build, and shared pitch scale',()=>{
  const player=id=>({id,gameplayProfile:profiles.players[id]});
  assert.equal(appearanceFor(player('ajmal-shakkari')).hairstyle,5,'Ajmal has a close short haircut');
  assert.equal(appearanceFor(player('muhammad-teli')).hairstyle,5,'Teli has short hair');
  const abu=appearanceFor(player('abubakr-manjra')),stocky=appearanceFor(player('mosa-fazli'));
  assert(abu.bulk<.6&&abu.build<1.15,'Abu remains broad but no longer scales much larger than teammates');
  assert(stocky.bulk<.25,'stocky players get a subtle build difference');
  for(const id of ['haroon-ahmadi','mudassir'])assert(playerAttributes({id,name:id,overall:90,gameplayProfile:profiles.players[id]}).dribble>1.1,id+' gets elite close-control ability');
  assert(playerShapes.sphere.parameters.widthSegments>=32);assert(playerShapes.limb.parameters.radialSegments>=28);
  assert.equal(FIELD.halfLength,64);assert.equal(FIELD.halfWidth,42);
});
