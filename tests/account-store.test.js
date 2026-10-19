import test from 'node:test';
import assert from 'node:assert/strict';
import {FirestoreAccountStore,ACCOUNT_SESSION_KEY,validateCredentials,mergeAccountProfiles,hashPasscode} from '../src/account-store.js';
import {CloudAccount,emptyStats,emptyModeStats} from '../src/cloud-account.js';

const copy=value=>structuredClone(value);
function fixture() {
  const docs=new Map(),saved=new Map();let queue=Promise.resolve(),failNext=false;
  const snap=ref=>({id:ref.split('/').at(-1),exists:()=>docs.has(ref),data:()=>copy(docs.get(ref))});
  const fs={doc:(_,collection,id)=>collection+'/'+id,collection:(_,name)=>name,
    where:(field,op,value)=>({field,value}),query:(collection,filter)=>({collection,filter}),
    getDoc:async ref=>snap(ref),getDocs:async query=>({docs:[...docs.keys()].filter(key=>key.startsWith(query.collection+'/')&&docs.get(key)[query.filter.field]===query.filter.value).map(snap)}),
    runTransaction:(_,fn)=>{
      const result=queue.then(async()=>{
        const writes=[];await fn({get:async ref=>snap(ref),set:(ref,data)=>writes.push(['set',ref,data]),update:(ref,data)=>writes.push(['set',ref,{...docs.get(ref),...data}]),delete:ref=>writes.push(['delete',ref])});
        if(failNext){failNext=false;throw new Error('offline');}
        for(const [op,ref,data]of writes)if(op==='delete')docs.delete(ref);else docs.set(ref,copy(data));
      });queue=result.catch(()=>{});return result;
    }};
  const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  const store=new FirestoreAccountStore(fs,{},storage);
  return {store,fs,docs,saved,storage,fail:()=>{failNext=true;}};
}
const profile=(username,uid)=>({uid,username,usernameKey:username.toLowerCase(),avatarDataUrl:'',createdAtMs:1,updatedAtMs:1,stats:emptyStats(),modes:emptyModeStats(),records:{},trophies:[],history:[],currentStreak:0});

test('registration and returning login use only username/PIN, keep credentials out of profiles and PINs out of sessions',async()=>{
  const f=fixture(),created=await f.store.create('Player','123456',profile);
  assert.equal(created.pinHash,undefined);assert.equal(created.loginEmail,undefined);
  const login=f.docs.get('gameLogins/'+created.uid);assert.equal(login.passcode,'123456');assert.equal(login.pinHash,undefined);assert.equal(created.passcode,undefined);
  assert.equal(f.saved.get(ACCOUNT_SESSION_KEY).includes('123456'),false);
  f.store.clearSession();assert.equal(await f.store.restore(),null);
  assert.equal((await f.store.login('pLaYeR','123456')).uid,created.uid);
  assert.equal((await f.store.restore()).uid,created.uid);
  await assert.rejects(f.store.login('Player','000000'),/incorrect/);
});
test('invalid credentials and case-insensitive simultaneous duplicate registration are rejected',async()=>{
  for(const [name,pin]of [['a','123456'],['longerthan12chars','123456'],['Valid','12345'],['Valid','ABCDEF']])assert.throws(()=>validateCredentials(name,pin));
  const f=fixture(),results=await Promise.allSettled([f.store.create('SAME','123456',profile),f.store.create('same','654321',profile)]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  assert.equal([...f.docs.keys()].filter(key=>key.startsWith('gameProfiles/')).length,1);
});
test('rename preserves identity and passcode, updates sign-in name and rejects occupied names',async()=>{
  const f=fixture(),a=await f.store.create('Alpha','123456',profile);await f.store.create('Beta','654321',profile);
  const credential=copy(f.docs.get('gameLogins/'+a.uid));await f.store.rename(a.uid,'NewName');
  assert.deepEqual(f.docs.get('gameLogins/'+a.uid),credential);
  assert.equal((await f.store.login('newname','123456')).uid,a.uid);
  await assert.rejects(f.store.login('Alpha','123456'),/incorrect/);
  await assert.rejects(f.store.rename(a.uid,'beta'),/taken/);
});
test('reset revokes saved sessions and old PIN, while the new six-digit PIN works',async()=>{
  const f=fixture(),a=await f.store.create('Player','123456',profile);
  await f.store.resetPasscode(a.uid,' 654321 ');assert.equal(await f.store.restore(),null);
  await assert.rejects(f.store.login('Player','123456'),/incorrect/);
  assert.equal((await f.store.login('Player','654321')).uid,a.uid);
});
test('legacy profiles need explicit reset and keep their data through migration',async()=>{
  const f=fixture(),old=profile('Veteran','old-uid');old.stats.goals=12;f.docs.set('gameProfiles/old-uid',old);
  await assert.rejects(f.store.create('Veteran','123456',profile),/taken/);
  await assert.rejects(f.store.login('Veteran','123456'),/admin passcode reset/);
  await f.store.resetPasscode('old-uid','654321');const restored=await f.store.login('Veteran','654321');
  assert.equal(restored.uid,'old-uid');assert.equal(restored.stats.goals,12);
});
test('failed creation has no partial profile, reserved username or session',async()=>{
  const f=fixture();f.fail();await assert.rejects(f.store.create('Player','123456',profile),/offline/);
  assert.equal(f.docs.size,0);assert.equal(await f.store.restore(),null);
});
test('merges commit atomically and remove the source sign-in, deletion frees the destination username',async()=>{
  const f=fixture(),a=await f.store.create('Alpha','123456',profile),b=await f.store.create('Beta','654321',profile);
  f.fail();await assert.rejects(f.store.merge(a.uid,b.uid,(source,target)=>target),/offline/);
  assert.ok(await f.store.profile(a.uid));assert.ok(await f.store.profile(b.uid));
  await f.store.merge(a.uid,b.uid,(source,target)=>({...target,stats:{...target.stats,goals:7}}));
  await assert.rejects(f.store.login('Alpha','123456'),/incorrect/);
  assert.equal((await f.store.login('Beta','654321')).stats.goals,7);
  await f.store.remove(b.uid);assert.equal(await f.store.restore(),null);assert.equal(await f.store.lookup('beta'),null);
});
test('match uploads retry after failure and count the same result only once',async()=>{
  const f=fixture(),a=await f.store.create('Player','123456',profile);
  const service=Object.create(CloudAccount.prototype);
  Object.assign(service,{store:f.store,available:true,ready:Promise.resolve(),modules:{firestore:f.fs},db:{},onChange:()=>{}});service.adopt(a);
  const match={phase:'fulltime',stats:[{goals:2,shots:5},{goals:1}],teams:[{name:'Home'},{name:'CPU'}],settings:{season:2026},goalEvents:[]};
  f.fail();await assert.rejects(service.recordMatch(match),/offline/);assert.equal(match.cloudAccountRecorded,undefined);
  await service.recordMatch(match);await service.recordMatch(match);
  const saved=await f.store.profile(a.uid);assert.equal(saved.stats.matches,1);assert.equal(saved.stats.goals,2);assert.equal(saved.history.length,0);assert.ok(f.docs.has('gameProfiles/'+a.uid+'/matches/'+match.cloudAccountRecord.id));
});

test('merge keeps the better records, unique history and target identity without joining winning streaks',()=>{
  const a=profile('Source','a'),b=profile('Target','b');
  a.records={fastestOpeningGoal:{seconds:3},biggestWin:{margin:5},longestWinningStreak:4};
  b.records={fastestOpeningGoal:null,biggestWin:{margin:2},longestWinningStreak:2};
  a.currentStreak=4;b.currentStreak=2;a.stats.goals=5;b.stats.goals=3;
  a.history=[{id:'same',date:1}];b.history=[{id:'same',date:1}];
  const result=mergeAccountProfiles(a,b);
  assert.equal(result.uid,'b');assert.equal(result.stats.goals,8);assert.equal(result.history.length,1);
  assert.equal(result.records.fastestOpeningGoal.seconds,3);assert.equal(result.records.biggestWin.margin,5);
  assert.equal(result.records.longestWinningStreak,4);assert.equal(result.currentStreak,2);
});

test('admin locks are independent of the current player and reject the wrong password',async()=>{
  const f=fixture(),a=await f.store.create('Player','123456',profile);
  const service=Object.create(CloudAccount.prototype);
  Object.assign(service,{store:f.store,available:true,ready:Promise.resolve(),onChange:()=>{},adminUnlocked:false});service.adopt(a);
  await assert.rejects(service.adminLogin('incorrect'),/Incorrect admin password/);
  assert.equal(service.isAdmin(),false);
  // The existing operator password only unlocks this browser console.
  const {ADMIN_PASSWORD}=await import('../src/account-store.js');await service.adminLogin(ADMIN_PASSWORD);
  assert.equal(service.isAdmin(),true);service.adminLogout();assert.equal(service.isAdmin(),false);
  assert.equal(service.isSignedIn(),true);assert.equal((await f.store.restore()).uid,a.uid);
});

test('legacy hashed login migrates only after the correct passcode is entered',async()=>{
 const f=fixture(),p=await f.store.create('Legacy','123456',profile),revision=crypto.randomUUID(),salt=crypto.randomUUID();
 f.docs.set('gameLogins/'+p.uid,{pinHash:await hashPasscode('123456',salt),salt,revision,algorithm:'pbkdf2-sha256-v1'});
 await assert.rejects(f.store.login('Legacy','999999'),/incorrect/);
 assert.equal(f.docs.get('gameLogins/'+p.uid).algorithm,'pbkdf2-sha256-v1');
 await f.store.login('Legacy','123456');assert.deepEqual(f.docs.get('gameLogins/'+p.uid),{passcode:'123456',revision,algorithm:'plain-v1'});
});
test('merged history keeps original playing account names',()=>{
 const a=profile('Alpha','a'),b=profile('Beta','b');a.history=[{id:'a',date:1}];b.history=[{id:'b',date:2,accountName:'OlderName'}];
 const result=mergeAccountProfiles(a,b);assert.equal(result.history[0].accountName,'OlderName');assert.equal(result.history[1].accountName,'Alpha');
});

test('permission-denied legacy archive prevents account deletion and explains the rules repair',async()=>{
 const f=fixture(),a=await f.store.create('Alpha','123456',profile),b=await f.store.create('Beta','654321',profile);
 f.docs.get('gameProfiles/'+a.uid).history=[{id:'old',date:1,score:[1,0],teams:['A','B']}];
 const fs={...f.fs,runTransaction:async()=>{throw Object.assign(new Error('denied'),{code:'permission-denied'});}};
 const service=Object.create(CloudAccount.prototype);Object.assign(service,{store:f.store,available:true,ready:Promise.resolve(),modules:{firestore:fs},db:{},adminUnlocked:true});
 await assert.rejects(service.adminMergeProfiles(a.uid,b.uid,mergeAccountProfiles),/preserve match history.*Neither account was deleted.*firestore.rules/);
 assert.ok(await f.store.profile(a.uid));assert.ok(await f.store.profile(b.uid));
});
