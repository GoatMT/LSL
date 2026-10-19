// Temporary Firestore-only accounts, matching the other LSL sites.
// PIN checks and the admin lock are client-side, not server authentication.
// Keep this adapter replaceable when verified accounts are introduced.
export const ACCOUNT_SESSION_KEY = 'lsl-rush-firestore-session-v2';
export const ADMIN_PASSWORD = 'BlueM123';
const ITERATIONS = 120000;

export function validateCredentials(username, pin) {
  const name = String(username ?? '').trim(), code = String(pin ?? '').trim();
  if (!/^[A-Za-z0-9_]{2,12}$/.test(name)) throw new Error('Username must be 2–12 letters, numbers or underscores.');
  if (!/^\d{6}$/.test(code)) throw new Error('Passcode must be exactly 6 digits.');
  return {username: name, usernameKey: name.toLowerCase(), pin: code};
}

export async function hashPasscode(pin, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Open the game over HTTPS or localhost to create an account.');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:ITERATIONS}, key, 256);
  return Array.from(new Uint8Array(bits), value=>value.toString(16).padStart(2,'0')).join('');
}

export function attributedHistory(profile){return (profile.history||[]).map(r=>({...r,ownerId:r.ownerId||profile.uid,accountName:r.accountName||profile.username,accountNameInferred:r.accountNameInferred||!r.accountName}));}

export function mergeAccountProfiles(source,target) {
  const merged=structuredClone(target),sum=(a={},b={})=>Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(key=>[key,(Number(a[key])||0)+(Number(b[key])||0)]));
  merged.stats=sum(target.stats,source.stats);
  merged.modes={...target.modes};
  for(const mode of Object.keys(source.modes||{}))merged.modes[mode]=sum(target.modes?.[mode],source.modes[mode]);
  merged.modes.all=merged.stats;
  merged.trophies=[...(target.trophies||[]),...(source.trophies||[])].filter((item,index,list)=>list.findIndex(other=>other.id===item.id)===index).slice(0,20);
  merged.history=[...attributedHistory(target),...attributedHistory(source)].sort((a,b)=>b.date-a.date).filter((item,index,list)=>!item.id||list.findIndex(other=>other.id===item.id)===index).slice(0,50);
  merged.records={...target.records};
  for(const [key,value]of Object.entries(source.records||{})) {
    if(value==null)continue;
    const current=merged.records[key];
    if(key==='longestWinningStreak'){merged.records[key]=Math.max(Number(current)||0,Number(value)||0);continue;}
    const metric=key.startsWith('fastest')?'seconds':key==='biggestWin'?'margin':'goals';
    if(current==null||(metric==='seconds'?value[metric]<current[metric]:value[metric]>current[metric]))merged.records[key]=value;
  }
  // Independent winning streaks cannot be joined into a new streak.
  merged.currentStreak=target.currentStreak||0;
  return merged;
}

export class FirestoreAccountStore {
  constructor(firestore, db, storage = globalThis.localStorage) {
    this.fs=firestore; this.db=db; this.storage=storage;
  }
  ref(collection, id) { return this.fs.doc(this.db, collection, id); }
  profileRef(id) { return this.ref('gameProfiles', id); }
  loginRef(id) { return this.ref('gameLogins', id); }
  nameRef(key) { return this.ref('gameUsernames', key); }
  async profile(id) {
    const snap=await this.fs.getDoc(this.profileRef(id));
    return snap.exists()?{...snap.data(), uid:snap.id}:null;
  }
  async lookup(key) {
    const name=await this.fs.getDoc(this.nameRef(key));
    if (name.exists()) return name.data().uid;
    // Preserve profiles created by the previous Auth implementation.
    const result=await this.fs.getDocs(this.fs.query(this.fs.collection(this.db,'gameProfiles'),this.fs.where('usernameKey','==',key)));
    return result.docs[0]?.id || null;
  }
  saveSession(id, revision) {
    try { this.storage?.setItem(ACCOUNT_SESSION_KEY, JSON.stringify({uid:id,revision})); } catch { /* Sign-in still works when storage is unavailable. */ }
  }
  clearSession() { try { this.storage?.removeItem(ACCOUNT_SESSION_KEY); } catch {} }
  async restore() {
    let session; try { session=JSON.parse(this.storage?.getItem(ACCOUNT_SESSION_KEY)||'null'); } catch { this.clearSession(); return null; }
    if (!session?.uid || !session.revision) return null;
    const [profile,login]=await Promise.all([this.profile(session.uid),this.fs.getDoc(this.loginRef(session.uid))]);
    if (!profile || !login.exists() || login.data().revision!==session.revision) { this.clearSession(); return null; }
    return profile;
  }
  async create(username, pin, makeProfile) {
    const c=validateCredentials(username,pin);
    if (await this.lookup(c.usernameKey)) throw new Error('That username is already taken. Choose SIGN IN instead.');
    const id=crypto.randomUUID(), revision=crypto.randomUUID();
    const profile=makeProfile(c.username,id);
    await this.fs.runTransaction(this.db,async tx=>{
      if ((await tx.get(this.nameRef(c.usernameKey))).exists()) throw new Error('That username is already taken.');
      tx.set(this.profileRef(id),profile);
      tx.set(this.nameRef(c.usernameKey),{uid:id});
      tx.set(this.loginRef(id),{passcode:c.pin,revision,algorithm:'plain-v1'});
    });
    this.saveSession(id,revision); return profile;
  }
  async login(username,pin) {
    const c=validateCredentials(username,pin), id=await this.lookup(c.usernameKey);
    if (!id) throw new Error('Username or passcode is incorrect.');
    const snapshot=await this.fs.getDoc(this.loginRef(id));
    if (!snapshot.exists()) throw new Error('This older account needs an admin passcode reset. Its stats are still saved.');
    const login=snapshot.data();
    const valid=login.algorithm==='plain-v1'?login.passcode===c.pin:login.pinHash===await hashPasscode(c.pin,login.salt);
    if (!valid) throw new Error('Username or passcode is incorrect.');
    const profile=await this.profile(id);
    if (!profile || profile.usernameKey!==c.usernameKey) throw new Error('This account has changed. Sign in using its current username.');
    if(login.algorithm!=='plain-v1')await this.fs.runTransaction(this.db,async tx=>{
      const current=await tx.get(this.loginRef(id));
      if(!current.exists()||current.data().revision!==login.revision)throw new Error('Passcode changed. Sign in again.');
      tx.set(this.loginRef(id),{passcode:c.pin,revision:login.revision,algorithm:'plain-v1'});
    });
    this.saveSession(id,login.revision); return profile;
  }
  async rename(id,username) {
    const c=validateCredentials(username,'000000'), existing=await this.lookup(c.usernameKey);
    if (existing && existing!==id) throw new Error('That username is already taken.');
    await this.fs.runTransaction(this.db,async tx=>{
      const snap=await tx.get(this.profileRef(id)), name=await tx.get(this.nameRef(c.usernameKey));
      if (!snap.exists()) throw new Error('Account not found.');
      if (name.exists() && name.data().uid!==id) throw new Error('That username is already taken.');
      const old=snap.data();
      tx.update(this.profileRef(id),{username:c.username,usernameKey:c.usernameKey,updatedAtMs:Date.now()});
      tx.set(this.nameRef(c.usernameKey),{uid:id});
      if (old.usernameKey!==c.usernameKey) tx.delete(this.nameRef(old.usernameKey));
    });
  }
  async resetPasscode(id,pin) {
    pin=validateCredentials('Valid',pin).pin;
    const revision=crypto.randomUUID();
    await this.fs.runTransaction(this.db,async tx=>{
      const snap=await tx.get(this.profileRef(id));
      if (!snap.exists()) throw new Error('Account not found.');
      const name=await tx.get(this.nameRef(snap.data().usernameKey));
      if (name.exists() && name.data().uid!==id) throw new Error('Resolve the duplicate username before resetting this account.');
      tx.set(this.loginRef(id),{passcode:pin,revision,algorithm:'plain-v1'});
      tx.set(this.nameRef(snap.data().usernameKey),{uid:id});
    });
  }
  async remove(id) {
    await this.fs.runTransaction(this.db,async tx=>{
      const snap=await tx.get(this.profileRef(id));
      if (!snap.exists()) throw new Error('Account not found.');
      tx.delete(this.nameRef(snap.data().usernameKey)); tx.delete(this.loginRef(id)); tx.delete(this.profileRef(id));
    });
  }
  async merge(sourceId,targetId,combine) {
    if (sourceId===targetId) throw new Error('Choose two different accounts.');
    await this.fs.runTransaction(this.db,async tx=>{
      const source=await tx.get(this.profileRef(sourceId)), target=await tx.get(this.profileRef(targetId));
      if (!source.exists() || !target.exists()) throw new Error('One of the accounts no longer exists.');
      const merged=combine(source.data(),target.data());
      tx.set(this.profileRef(targetId),{...merged,historySources:[...new Set([...(target.data().historySources||[]),...(source.data().historySources||[]),sourceId])],uid:targetId,username:target.data().username,usernameKey:target.data().usernameKey,updatedAtMs:Date.now()});
      tx.delete(this.nameRef(source.data().usernameKey)); tx.delete(this.loginRef(sourceId)); tx.delete(this.profileRef(sourceId));
    });
  }
}
