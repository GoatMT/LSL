import test from 'node:test';
import assert from 'node:assert/strict';
import {busyAction} from '../src/h2h/ui.js';

const button=()=>({disabled:false,dataset:{},attributes:new Map(),setAttribute(k,v){this.attributes.set(k,v);},removeAttribute(k){this.attributes.delete(k);}});

test('pending room actions reject double taps and restore the control afterward',async()=>{
 const b=button();let finish,calls=0;
 const pending=busyAction(b,()=>{calls++;return new Promise(resolve=>finish=resolve);});
 assert.equal(b.disabled,true);assert.equal(b.attributes.get('aria-busy'),'true');
 assert.equal(await busyAction(b,()=>calls++),false);assert.equal(calls,1);
 finish();assert.equal(await pending,true);assert.equal(b.disabled,false);assert.equal(b.attributes.has('aria-busy'),false);
});

test('failed room actions report the error and allow a successful retry',async()=>{
 const b=button(),errors=[];
 assert.equal(await busyAction(b,async()=>{throw Error('Connection lost');},error=>errors.push(error.message)),false);
 assert.deepEqual(errors,['Connection lost']);assert.equal(b.disabled,false);assert.equal(b.dataset.busy,undefined);
 assert.equal(await busyAction(b,async()=>{}),true);
});
