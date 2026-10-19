import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import { FIELD } from '../src/config.js';
import { ADVERTISEMENTS } from '../src/advertisements.js';
import { AD_BOARD,advertisingLayout } from '../src/engine/advertising.js';
import { Stadium } from '../src/engine/stadium.js';

test('grass advertising leaves the pitch, corner approaches, goal nets, benches and tunnel clear',()=>{
  const boards=advertisingLayout();assert.equal(boards.length,24);
  assert.equal(new Set(boards.map(b=>b.ad)).size,ADVERTISEMENTS.length);
  for(const b of boards){
    const normal={x:Math.sin(b.angle),z:Math.cos(b.angle)};
    assert(normal.x*-b.x+normal.z*-b.z>0,'Print must face into the stadium');
    const corners=[];
    for(const x of [-AD_BOARD.width/2,AD_BOARD.width/2])for(const z of [AD_BOARD.footZ-AD_BOARD.footDepth/2,AD_BOARD.depth/2]){
      corners.push({x:b.x+x*Math.cos(b.angle)+z*Math.sin(b.angle),z:b.z-x*Math.sin(b.angle)+z*Math.cos(b.angle)});
    }
    for(const p of corners){
      assert(Math.abs(p.x)<FIELD.halfLength+9&&Math.abs(p.z)<FIELD.halfWidth+8,'Board is within the grass apron');
      if(b.edge==='sideline'){
        assert(Math.abs(p.z)>FIELD.halfWidth+2.5&&Math.abs(p.z)<FIELD.halfWidth+5.25,'Clear runoff, before the paved walkway');
        assert(Math.abs(p.x)<FIELD.halfLength-3,'Keep corner approaches clear');
        if(b.z<0)assert(Math.abs(p.x)>25,'Keep benches and central tunnel clear');
      }else{
        assert(Math.abs(p.x)>FIELD.halfLength+FIELD.goalDepth+2,'Behind net depth');
        assert(Math.abs(p.z)>FIELD.goalHalf+3&&Math.abs(p.z)<FIELD.halfWidth-5,'Do not obstruct goal or corner areas');
      }
    }
  }
});

test('printed board faces sit in front of their backing instead of rendering black',()=>{
  assert(AD_BOARD.faceZ>AD_BOARD.depth/2+.02);
  for(const side of [-1,1]){
    const stadium=Object.create(Stadium.prototype),frames=[];
    Object.assign(stadium,{root:new T.Group(),professional:new T.Group(),boardTextures:[new T.Texture(),new T.Texture()],banners:[],structure:{box:(w,h,d,x,y,z)=>frames.push({w,h,d,x,y,z})}});
    stadium.buildBoards(side);assert.equal(stadium.banners.length,17);
    stadium.banners.forEach((face,i)=>{
      const frame=frames[i],normal=new T.Vector3(0,0,1).applyEuler(face.rotation),offset=face.position.clone().sub(new T.Vector3(frame.x,frame.y,frame.z));
      const thickness=Math.abs(normal.x)>.5?frame.w:frame.d;
      assert(offset.dot(normal)>thickness/2+.025,'Printed face must clear the backing');
    });
  }
});
