import {ACCOUNT_SESSION_KEY} from './account-store.js';
import {FIREBASE_SDK_VERSION} from './firebase-config.js';
import {FREE_BACKEND_URL} from './live-config.js';
export class VerifiedAccountStore{
 constructor(fs,db,instance){this.fs=fs;this.db=db;this.instance=instance;this.ready=this.init();}
 async init(){const a=await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`);this.authModule=a;this.auth=a.getAuth(this.instance);await this.auth.authStateReady();}
 async call(name,data){
  await this.ready;
  let endpoint;try{endpoint=new URL(FREE_BACKEND_URL);}catch{throw new Error('The free online backend URL has not been configured. Follow LIVE-H2H-SETUP.md.');}
  if(endpoint.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(endpoint.hostname)&&endpoint.protocol==='http:'))throw Error('Use an HTTPS URL for the free online service.');
  const headers={'Content-Type':'application/json'};
  if(name!=='accountAuth'&&name!=='accountAdmin'){if(!this.auth.currentUser)throw Error('Please sign in again.');headers.Authorization='Bearer '+await this.auth.currentUser.getIdToken();}
  let response;
  try{response=await fetch(endpoint.href.replace(/\/$/,'')+'/api/'+encodeURIComponent(name),{method:'POST',headers,body:JSON.stringify(data||{}),signal:AbortSignal.timeout(name==='h2hFinalize'?90000:30000)});}catch{throw Object.assign(new Error('The free online service could not be reached. Check your connection and retry.'),{code:'functions/unavailable'});}
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.error)throw Object.assign(new Error(result?.error?.message||'The free service is unavailable or its quota has been reached. Try again later.'),{code:'functions/'+(result?.error?.code||'unavailable')});
  if(!result||!Object.hasOwn(result,'data'))throw Error('The free online service returned an invalid response.');
  return result.data;
 }
 profileRef(id){return this.fs.doc(this.db,'gameProfiles',id);}
 async profile(id){const snap=await this.fs.getDoc(this.profileRef(id));return snap.exists()?{...snap.data(),uid:snap.id}:null;}
 async restore(){await this.ready;return this.auth.currentUser?this.profile(this.auth.currentUser.uid):null;}
 async sign(action,username,passcode){const data=await this.call('accountAuth',{action,username,passcode});await this.authModule.signInWithCustomToken(this.auth,data.token);try{localStorage.setItem(ACCOUNT_SESSION_KEY,JSON.stringify({uid:data.profile.uid,verified:true}));}catch{}return data.profile;}
 create(username,pin){return this.sign('create',username,pin);}
 login(username,pin){return this.sign('login',username,pin);}
 async clearSession(){await this.ready;await this.authModule.signOut(this.auth);try{localStorage.removeItem(ACCOUNT_SESSION_KEY);}catch{}}
 async authorizeAdmin(adminPassword){return this.call('accountAdmin',{action:'authorize',adminPassword});}
 async rename(uid,username,adminPassword){return this.call('accountAdmin',{action:'rename',uid,username,adminPassword});}
 async resetPasscode(uid,passcode,adminPassword){return this.call('accountAdmin',{action:'reset',uid,passcode,adminPassword});}
 async remove(uid,adminPassword){return this.call('accountAdmin',{action:'remove',uid,adminPassword});}
 async merge(source,target,adminPassword){return this.call('accountAdmin',{action:'merge',source,target,adminPassword});}
}
