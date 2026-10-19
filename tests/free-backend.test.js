import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {FirebaseRest,encodeFields,decodeFields} from '../free-backend/firebase-rest.js';
import worker,{LiveBackend,safeError} from '../free-backend/worker.js';
import {createApi} from '../free-backend/api.generated.js';
import {LiveSimulation,buildSquad,idlePacket} from '../src/h2h/simulation.js';
import catalog from '../functions/catalog.json' with {type:'json'};

const copy=structuredClone;
test('unexpected backend failures expose a reference without leaking exception contents',()=>{
 const logs=[],original=console.error;
 console.error=value=>logs.push(value);
 try{
  const result=safeError(new TypeError('PRIVATE_CREDENTIAL_VALUE'));
  assert.equal(result.code,'unavailable');
  assert.match(result.message,/reference [a-f0-9]{8}/);
  assert.equal(JSON.parse(logs[0]).type,'TypeError');
  assert.equal(JSON.stringify({result,logs}).includes('PRIVATE_CREDENTIAL_VALUE'),false);
  assert.deepEqual(safeError({code:'permission-denied',message:'Username or passcode is incorrect.'}),{code:'permission-denied',message:'Username or passcode is incorrect.'});
 }finally{console.error=original;}
});
function database(){
 const records=new Map([['runtime/live',{enabled:true}]]);
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>({exists:records.has(path),data:()=>copy(records.get(path))}),set:async d=>records.set(path,copy(d)),create:async d=>{if(records.has(path))throw Object.assign(Error('exists'),{code:6});records.set(path,copy(d));},update:async d=>{const old=records.get(path);for(const [key,v]of Object.entries(d)){const parts=key.split('.');let p=old;for(const part of parts.slice(0,-1))p=p[part]||={};p[parts.at(-1)]=copy(v);}},delete:async()=>records.delete(path),collection:name=>collection(path+'/'+name)});
 const collection=(path,filter=()=>true,limit=Infinity)=>({doc:id=>ref(path+'/'+id),where:(field,op,v)=>collection(path,d=>d[field]===v,limit),limit:n=>collection(path,filter,n),orderBy:()=>collection(path,filter,limit),get:async()=>({docs:[...records].filter(([key,data])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')&&filter(data)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([path,d])=>({id:path.split('/').at(-1),data:()=>copy(d)}))})});
 const db={doc:ref,collection,records};
 db.runTransaction=async fn=>{const writes=[],t={get:r=>r.get(),set:(r,v)=>writes.push(()=>r.set(v)),update:(r,v)=>writes.push(()=>r.update(v)),create:(r,v)=>writes.push(()=>r.create(v)),delete:r=>writes.push(()=>r.delete())};const result=await fn(t);for(const write of writes)await write();return result;};
 db.createCustomToken=async(uid,claims)=>JSON.stringify({uid,claims});db.revokeRefreshTokens=async()=>{};db.deleteUser=async()=>{};
 return db;
}
const session=(db,id,data={})=>({data,auth:{uid:id,token:{revision:db.records.get('gameLogins/'+id)?.revision}}});

test('free account API keeps username/PIN identity, rejects wrong PIN and revokes reset sessions',async()=>{
 const db=database(),api=createApi({db,auth:db});
 const created=await api.accountAuth({data:{action:'create',username:'Player',passcode:'123456'}});
 assert.equal(created.profile.passcode,undefined);assert.equal(JSON.parse(created.token).uid,created.profile.uid);
 assert.equal((await api.accountAuth({data:{action:'login',username:'PLAYER',passcode:'123456'}})).profile.uid,created.profile.uid);
 await assert.rejects(api.accountAuth({data:{action:'login',username:'Player',passcode:'000000'}}),/incorrect/);
 const old=session(db,created.profile.uid,{action:'avatar',value:'data:image/png;base64,AA=='});
 db.records.get('gameLogins/'+created.profile.uid).revision='reset';await assert.rejects(api.accountProfile(old),/expired/);
 await assert.rejects(api.accountAdmin({data:{action:'authorize',adminPassword:'wrong'}}),/Admin password is incorrect/);
 assert.deepEqual(await api.accountAdmin({data:{action:'authorize',adminPassword:'BlueM123'}}),{allowed:true});
 await api.accountAdmin({data:{action:'rename',adminPassword:'BlueM123',uid:created.profile.uid,username:'Renamed'}});
 assert.equal(db.records.get('gameProfiles/'+created.profile.uid).username,'Renamed');
});

test('free room API rejects unapproved players and only returns free STUN after both are ready',async()=>{
 const db=database(),api=createApi({db,auth:db});const ids=[];
 for(const username of ['Host','Guest','Stranger'])ids.push((await api.accountAuth({data:{action:'create',username,passcode:'123456'}})).profile.uid);
 const [host,guest,stranger]=ids,call=(id,data)=>api.h2hRoom(session(db,id,data));
 const {code}=await call(host,{action:'create',options:{duration:1,difficulty:'normal',season:'2026'}});
 await assert.rejects(api.h2hConnection(session(db,stranger,{code})),/accepted/);
 await call(guest,{action:'request',code});await assert.rejects(call(guest,{action:'accept',code,uid:guest}),/host/);
 await call(host,{action:'lock',code});await assert.rejects(call(stranger,{action:'request',code}),/not accepting/);await call(host,{action:'unlock',code});
 await call(host,{action:'accept',code,uid:guest});
 for(const [i,id]of [host,guest].entries())await call(id,{action:'choose',code,team:catalog['2026'][i].id,formation:'2-2-2'});
 await assert.rejects(call(host,{action:'start',code}),/Both/);
 for(const id of [host,guest])await call(id,{action:'ready',code,ready:true});await call(host,{action:'start',code});
 const connection=await api.h2hConnection(session(db,guest,{code}));assert.equal(connection.relay,false);assert.deepEqual(connection.iceServers,[{urls:'stun:stun.cloudflare.com:3478'}]);
 await assert.rejects(api.h2hProgress(session(db,guest,{code,elapsed:1,score:[0,0]})),/not your/);
 await assert.rejects(api.h2hTrace(session(db,stranger,{code,action:'confirm',digest:'a'.repeat(64),tick:500})),/participant/);
});

test('free finalize replays the actual timeline and saves both histories once',async()=>{
 const db=database(),api=createApi({db,auth:db}),members=['host','guest'];
 for(const id of members){db.records.set('gameLogins/'+id,{revision:id});db.records.set('gameProfiles/'+id,{uid:id,username:id});}
 const choices=Object.fromEntries(members.map((id,i)=>[id,{team:catalog['2026'][i].id,formation:'2-2-2',lineup:catalog['2026'][i].lineup.map(p=>p.id)}]));
 const room={code:'LR-123456',members,host:'host',guest:'guest',names:{host:'Host',guest:'Guest'},choices,options:{duration:1,season:'2026',difficulty:'normal'},seed:12,startedAt:Date.now()-900000,expiresAt:Date.now()+300000,status:'LIVE'};db.records.set('h2hRooms/'+room.code,room);
 const sim=new LiveSimulation(members.map((id,i)=>buildSquad(catalog['2026'][i],choices[id])),room.options,room.seed),trace=[];
 const command=(side,c)=>{sim.command(side,c);trace.push({t:sim.tick,side,command:c});};command(0,{type:'skipIntro'});
 for(let n=0;n<50000&&sim.match.phase!=='fulltime';n++){
  if(sim.match.phase==='halftime'){command(0,{type:'continue'});command(1,{type:'continue'});}
  if(sim.match.phase==='goal'&&sim.match.replayActive)command(0,{type:'skipReplay'});
  if(n%60===0)for(const side of [0,1]){const input={...idlePacket(),x:side?-1:1,pressed:['pass']};sim.input(side,input);trace.push({t:sim.tick,side,input});}sim.step();
 }
 assert.equal(sim.match.phase,'fulltime');
 for(let i=0;i<trace.length;i+=300)await api.h2hTrace(session(db,'host',{code:room.code,action:'chunk',index:i/300,events:trace.slice(i,i+300)}));
 const digest=createHash('sha256').update(JSON.stringify(trace)).digest('hex');
 await api.h2hTrace(session(db,'host',{code:room.code,action:'confirm',digest,tick:sim.tick}));
 await assert.rejects(api.h2hFinalize(session(db,'host',{code:room.code})),/both players/);
 await api.h2hTrace(session(db,'guest',{code:room.code,action:'confirm',digest,tick:sim.tick}));
 assert.equal((await api.h2hFinalize(session(db,'host',{code:room.code}))).saved,true);
 assert.equal((await api.h2hFinalize(session(db,'guest',{code:room.code}))).saved,true);
 const reports=[...db.records].filter(([key])=>key.includes('/matches/'));assert.equal(reports.length,2);assert.deepEqual(reports[0][1].score,[...reports[1][1].score].reverse());assert.equal(reports[0][1].verified,true);
});

test('REST encoding preserves match reports, confirmation field paths and atomic creates',async()=>{
 const data={name:'Test',a:[1,2.5,null,true],nested:{revision:'abc'},ignored:undefined};assert.deepEqual(decodeFields(encodeFields(data)),{name:'Test',a:[1,2.5,null,true],nested:{revision:'abc'}});
 const env={FIREBASE_PROJECT_ID:'test',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({project_id:'test',private_key:'unused',client_email:'test@example.com'})};
 const db=new FirebaseRest(env),calls=[];db.request=async(path,body)=>{calls.push({path,body});if(path.endsWith('beginTransaction'))return {transaction:'tx'};if(path.includes('?transaction='))return {fields:encodeFields({count:2})};return {};};
 await db.runTransaction(async t=>{const ref=db.doc('h2hRooms/LR-123456');assert.equal((await t.get(ref)).data().count,2);t.update(ref,{'confirmations.user-with-hyphens':{digest:'abc'}});t.create(db.doc('gameProfiles/new'),{uid:'new'});});
 const commit=calls.at(-1).body;assert.equal(commit.transaction,'tx');assert.equal(commit.writes[0].updateMask.fieldPaths[0],'`confirmations`.`user-with-hyphens`');assert.deepEqual(commit.writes[1].currentDocument,{exists:false});
});

test('custom tokens are genuinely RSA-signed and verified Firebase sessions reject cross-project claims',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={FIREBASE_PROJECT_ID:'test',FIREBASE_API_KEY:'test',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({project_id:'test',client_email:'test@example.com',private_key:privateKey.export({format:'pem',type:'pkcs8'})})};
 const db=new FirebaseRest(env,async()=>Response.json({users:[{localId:'player',validSince:'1'}]})),token=await db.createCustomToken('player',{revision:'v1'}),parts=token.split('.');
 const key=await crypto.subtle.importKey('spki',publicKey.export({type:'spki',format:'der'}),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,Buffer.from(parts[2],'base64url'),new TextEncoder().encode(parts.slice(0,2).join('.'))),true);
 const payload={sub:'player',aud:'test',iss:'https://securetoken.google.com/test',exp:Math.floor(Date.now()/1000)+60,auth_time:2};
 const idToken=p=>'header.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.signature';
 assert.equal((await db.verifyIdToken(idToken(payload))).uid,'player');await assert.rejects(db.verifyIdToken(idToken({...payload,aud:'other-project'})),/expired/);
});

test('worker rejects unknown origins/routes and stops at its free daily budget',async()=>{
 const env={ALLOWED_ORIGINS:'https://goatmt.github.io'};
 assert.equal((await worker.fetch(new Request('https://free.test/api/h2hRoom',{method:'POST',headers:{Origin:'https://evil.test'}}),env)).status,403);
 assert.equal((await worker.fetch(new Request('https://free.test/api/notReal',{method:'POST',headers:{Origin:'https://goatmt.github.io'}}),env)).status,404);
 const preflight=await worker.fetch(new Request('https://free.test/api/h2hRoom',{method:'OPTIONS',headers:{Origin:'https://goatmt.github.io'}}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://goatmt.github.io');
 let calls=0;const sql={exec:(query)=>{if(query.startsWith('SELECT'))return [{calls}];if(query.startsWith('INSERT'))calls++;return [];}};
 const backend=new LiveBackend({storage:{sql}},{MAX_DAILY_REQUESTS:'100'});for(let i=0;i<100;i++)backend.reserveBudget();assert.throws(()=>backend.reserveBudget(),/free daily/);assert.equal(calls,100);
});
