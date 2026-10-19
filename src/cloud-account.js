import {VerifiedAccountStore} from './verified-account-store.js';
import {attributedHistory} from './account-store.js';
import {FirestoreAccountStore,ACCOUNT_SESSION_KEY,ADMIN_PASSWORD,validateCredentials} from './account-store.js';
export {ADMIN_PASSWORD,validateCredentials} from './account-store.js';
import {captureMatch,uniqueMatches,summarize,recordsFor} from './match-history.js';
import {enqueueReport,removePending,pendingReports,fetchArchive} from './history-store.js';
import {FIREBASE_CONFIG,FIREBASE_SDK_VERSION} from './firebase-config.js';

const PROFILE_COLLECTION='gameProfiles';

const MODE_KEYS=Object.freeze(['all','quick','rivalry','tournament','season','dream','h2h']);
export const MODE_LABELS=Object.freeze({all:'All modes',quick:'Play Now',rivalry:'Rivalry Matches',tournament:'Tournament Mode',season:'Season Mode',dream:'LSL Dream F.C.',h2h:'Live Head to Head'});
const STAT_KEYS=Object.freeze(['matches','goals','shots','saves','wins','losses','ties','shotsOnTarget','passes','completedPasses','fouls','corners','cleanSheets']);

export const emptyStats=()=>Object.fromEntries(STAT_KEYS.map(key=>[key,0]));
export const emptyModeStats=()=>Object.fromEntries(MODE_KEYS.map(key=>[key,emptyStats()]));
export const normalizeUsername=value=>String(value??'').trim().toLowerCase();
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const uid=()=>globalThis.crypto?.randomUUID?.()||`match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const modeFor=match=>match?.dream?'dream':match?.rivalry?'rivalry':match?.tournament?'tournament':match?.seasonMatch?'season':'quick';
const modeName=mode=>MODE_LABELS[mode]||MODE_LABELS.quick;
function profileTemplate(username,authUid){
  const usernameKey=normalizeUsername(username);
  return {uid:authUid,username,usernameKey,avatarDataUrl:'',createdAtMs:Date.now(),updatedAtMs:Date.now(),stats:emptyStats(),modes:emptyModeStats(),records:{fastestOpeningGoal:null,fastestHattrick:null,fastestFiveGoalComeback:null,mostGoalsGame:null,biggestWin:null,longestWinningStreak:0},trophies:[],currentStreak:0,history:[]};
}
function sanitizeProfile(value,docId=''){
  const raw=value||{},modes=emptyModeStats();
  for(const mode of MODE_KEYS)Object.assign(modes[mode],raw.modes?.[mode]||{});
  const stats={...emptyStats(),...(raw.stats||{})};
  const username=raw.username||'LSL Player',usernameKey=raw.usernameKey||normalizeUsername(username);
  return {historySources:raw.historySources||[],uid:raw.uid||docId,username,usernameKey,avatarDataUrl:raw.avatarDataUrl||'',createdAtMs:finite(raw.createdAtMs),updatedAtMs:finite(raw.updatedAtMs),stats,modes,records:{fastestOpeningGoal:null,fastestHattrick:null,fastestFiveGoalComeback:null,mostGoalsGame:null,biggestWin:null,longestWinningStreak:0,...(raw.records||{})},trophies:Array.isArray(raw.trophies)?raw.trophies.slice(0,20):[],currentStreak:finite(raw.currentStreak),history:Array.isArray(raw.history)?raw.history.slice(0,50):[]};
}
function addStats(target,source){for(const key of STAT_KEYS)target[key]=(target[key]||0)+(finite(source?.[key]));}
function updateRecords(profile,record){
  const records=profile.records,goals=record.goals.filter(goal=>goal.team===0).sort((a,b)=>a.time-b.time);
  const opening=goals[0];if(opening&&(!records.fastestOpeningGoal||opening.time<finite(records.fastestOpeningGoal.seconds)))records.fastestOpeningGoal={seconds:opening.time,name:opening.name,jersey:opening.jersey,mode:record.modeLabel,season:record.season};
  const byPlayer=new Map();for(const goal of goals){const list=byPlayer.get(goal.name)||[];list.push(goal.time);byPlayer.set(goal.name,list);}
  for(const [name,times] of byPlayer){if(times.length<3)continue;const span=times[2]-times[0];if(!records.fastestHattrick||span<finite(records.fastestHattrick.seconds))records.fastestHattrick={seconds:span,name,mode:record.modeLabel,season:record.season};}
  if(record.won&&record.score[0]>=5){const seconds=goals.at(-1)?.time??Infinity;if(!records.fastestFiveGoalComeback||seconds<finite(records.fastestFiveGoalComeback.seconds))records.fastestFiveGoalComeback={seconds,score:record.score.join('Ã¢â‚¬â€œ'),teams:record.teams,mode:record.modeLabel,season:record.season};}
  if(record.won&&(!records.mostGoalsGame||record.score[0]>finite(records.mostGoalsGame.goals)))records.mostGoalsGame={goals:record.score[0],name:record.teams[0],score:record.score.join('Ã¢â‚¬â€œ'),mode:record.modeLabel,season:record.season};
  if(record.won&&(!records.biggestWin||record.score[0]-record.score[1]>finite(records.biggestWin.margin)))records.biggestWin={margin:record.score[0]-record.score[1],score:record.score.join('Ã¢â‚¬â€œ'),team:record.teams[0],mode:record.modeLabel,season:record.season};
}
function applyRecord(profile,record){
  const user=record.stats.user,all=profile.stats,mode=profile.modes[record.mode]||emptyStats(),beforeMatches=all.matches;
  const common={matches:1,goals:user.goals,shots:user.shots,saves:user.saves,wins:record.won?1:0,losses:record.won||record.tie?0:1,ties:record.tie?1:0,shotsOnTarget:user.onTarget,passes:user.passes,completedPasses:user.completed,fouls:user.fouls,corners:user.corners,cleanSheets:record.score[1]===0?1:0};
  addStats(all,common);addStats(mode,common);profile.modes.all=all;
  profile.currentStreak=record.won?finite(profile.currentStreak)+1:0;profile.records.longestWinningStreak=Math.max(finite(profile.records.longestWinningStreak),profile.currentStreak);const trophy=(id,title,description)=>{profile.trophies??=[];if(!profile.trophies.some(item=>item.id===id))profile.trophies.push({id,title,description,earnedAt:Date.now()});};if(beforeMatches===0)trophy('first-match','FIRST MATCH','Complete your first match.');if(record.won){trophy('first-win','FIRST WIN','Win a match.');if(profile.currentStreak>=3)trophy('hot-streak','HOT STREAK','Win three matches in a row.');if(record.mode==='rivalry')trophy('rivalry-win','RIVALRY NIGHT','Win a featured rivalry match.');if(record.mode==='tournament')trophy('tournament-win','TOURNAMENT RUN','Win an Inter-Madrasah fixture.');if(record.mode==='season')trophy('season-win','SEASON CAMPAIGN','Win a season fixture.');if(record.mode==='dream')trophy('dream-win','DREAM BUILDER','Win a Dream F.C. CPU match.');if(record.score[1]===0)trophy('clean-sheet','SHUTOUT','Win without conceding.');}updateRecords(profile,record);
  profile.history=[record,...(profile.history||[])].slice(0,50);profile.updatedAtMs=Date.now();return profile;
}
async function avatarDataUrl(file){
  if(!file)return '';
  const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=reader.result;};reader.onerror=reject;reader.readAsDataURL(file);});
  const size=512,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');
  const ratio=Math.max(size/image.width,size/image.height),width=image.width*ratio,height=image.height*ratio;ctx.drawImage(image,(size-width)/2,(size-height)/2,width,height);
  return canvas.toDataURL('image/webp',.84);
}

export class CloudAccount {
  constructor({onChange=()=>{}}={}) {
    this.onChange=onChange;this.user=null;this.profile=null;this.adminUnlocked=false;this.adminPassword='';this.available=false;this.error=null;
    this.ready=this.init();
  }
  async init() {
    try {
      const [app,firestore]=await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`)
      ]);
      const instance=app.getApps().find(item=>item.name==='lantern-rush')||app.initializeApp(FIREBASE_CONFIG,'lantern-rush');
      this.modules={app,firestore};this.db=firestore.getFirestore(instance);
      let online=false;try{online=(await firestore.getDoc(firestore.doc(this.db,'runtime','live'))).data()?.enabled===true;}catch{}
      this.store=online?new VerifiedAccountStore(firestore,this.db,instance):new FirestoreAccountStore(firestore,this.db);this.available=true;
      try { const restored=await this.store.restore(); if(restored)this.adopt(restored); }
      catch(error){this.error=error;}
      globalThis.addEventListener?.('storage',event=>{
        if(event.key!==ACCOUNT_SESSION_KEY)return;
        this.store.restore().then(profile=>{if(profile)this.adopt(profile);else{this.user=null;this.profile=null;this.onChange(this);}}).catch(error=>{this.error=error;});
      });
    } catch(error){this.error=error;this.available=false;}
    this.onChange(this);if(this.isSignedIn())this.flushHistory().catch(error=>{this.historyError=error;});globalThis.addEventListener?.('online',()=>this.flushHistory().catch(error=>{this.historyError=error;}));return this;
  }
  async requireStore(){await this.ready;if(!this.available)throw new Error('Cannot connect to Firebase. Check your connection and try again.');return this.store;}
  adopt(raw){this.profile=sanitizeProfile(raw,raw.uid);this.user={uid:this.profile.uid,username:this.profile.username};this.onChange(this);return this.profile;}
  isSignedIn(){return Boolean(this.user&&this.profile);}
  async loadProfile(id){const raw=await this.store.profile(id);return raw?sanitizeProfile(raw,id):null;}
  async create(username,pin){const store=await this.requireStore();return this.adopt(await store.create(username,pin,profileTemplate));}
  async login(username,pin){const store=await this.requireStore();const profile=this.adopt(await store.login(username,pin));this.flushHistory().catch(error=>{this.historyError=error;});return profile;}
  async logout(){await this.store?.clearSession();this.user=null;this.profile=null;this.adminUnlocked=false;this.adminPassword='';this.onChange(this);}
  async requireSession(){const store=await this.requireStore(),raw=await store.restore();if(!raw){await this.logout();throw new Error('Please sign in again. Your account may have been reset or removed.');}return this.adopt(raw);}
  async updateAvatar(file){const profile=await this.requireSession(),data=typeof file==='string'?file:await avatarDataUrl(file);if(!data)throw new Error('Choose an image first.');if(data.length>400000)throw new Error('That image is too detailed. Please choose a simpler image.');if(this.store.call)await this.store.call('accountProfile',{action:'avatar',value:data});else await this.modules.firestore.updateDoc(this.store.profileRef(profile.uid),{avatarDataUrl:data,updatedAtMs:Date.now()});return this.adopt(await this.store.profile(profile.uid)).avatarDataUrl;}
  async recordMatch(match){
    await this.ready;if(!this.isSignedIn()||!match||match.phase!=='fulltime'||match.cloudAccountRecorded||match.cloudAccountRecording)return null;
    match.cloudAccountRecording=true;
    try{
      const record=match.cloudAccountRecord||=captureMatch(match,this.profile);
      await enqueueReport(record);match.historySavedLocally=true;
      await this.uploadReport(record);
      match.cloudAccountRecorded=true;return record;
    }finally{match.cloudAccountRecording=false;}
  }
  async uploadReport(record){
    const account=await this.requireSession();if(record.ownerId!==account.uid)throw new Error('Sign in to the account that played this match to sync it.');
    const fs=this.modules.firestore;
    await fs.runTransaction(this.db,async tx=>{
      const ref=this.store.profileRef(account.uid),archive=fs.doc(this.db,`gameProfiles/${account.uid}/matches`,record.id);
      const snapshot=await tx.get(ref),saved=await tx.get(archive);
      if(!snapshot.exists())throw new Error('Account not found.');if(saved.exists())return;
      const profile=sanitizeProfile(snapshot.data(),account.uid),legacy=profile.history;
      applyRecord(profile,record);profile.history=legacy; // Keep the original legacy entries; new reports live in the unbounded archive.
      tx.set(archive,record);tx.update(ref,profile);
    });
    await removePending(record.id);this.historyError=null;this.adopt(await this.store.profile(account.uid));
  }
  async flushHistory(){
    if(!this.isSignedIn())return;for(const record of await pendingReports())if(record.ownerId===this.user.uid)await this.uploadReport(record);
  }
  async getHistory(profile=this.profile,{includePending=true}={}){
    await this.requireStore();if(!profile)return [];
    const sources=[...new Set([profile.uid,...profile.historySources||[]])],records=attributedHistory(profile);
    let archiveError=null;
    for(const id of sources){try{records.push(...await fetchArchive(this.modules.firestore,this.db,id));}catch(error){archiveError=error;}}
    const pending=includePending&&this.user?.uid===profile.uid?(await pendingReports()).filter(r=>sources.includes(r.ownerId)):[];
    // Cloud copies win over pending copies with the same ID.
    const history=uniqueMatches([...pending.map(r=>({...r,pending:true})),...records]);history.archiveIncomplete=Boolean(archiveError);return history;
  }
  async withHistory(profile){
    if(!profile)return null;const history=await this.getHistory(profile,{includePending:false}),archiveIncomplete=Boolean(history.archiveIncomplete),stats=summarize(history),modes={all:stats};
    for(const key of MODE_KEYS.filter(k=>k!=='all'))modes[key]=summarize(history.filter(r=>r.mode===key));
    return {...profile,history,stats,modes,archiveRecords:recordsFor(history),archiveIncomplete,legacyMissing:Math.max(0,(profile.stats?.matches||0)-history.length)};
  }
  async getProfiles(){await this.requireStore();const snapshot=await this.modules.firestore.getDocs(this.modules.firestore.collection(this.db,PROFILE_COLLECTION));return snapshot.docs.map(item=>sanitizeProfile(item.data(),item.id));}
  async getProfile(id){await this.requireStore();if(!id)return null;return this.loadProfile(id);}
  async adminLogin(password){if(password!==ADMIN_PASSWORD)throw new Error('Incorrect admin password.');await this.requireStore();await this.store.authorizeAdmin?.(password);this.adminPassword=password;this.adminUnlocked=true;return true;}
  isAdmin(){return this.adminUnlocked;}
  adminLogout(){this.adminUnlocked=false;this.adminPassword='';}
  async requireAdmin(){await this.requireStore();if(!this.isAdmin())throw new Error('Unlock the admin page first.');}
  async adminUpdateProfile(id,patch){await this.requireAdmin();if(patch.username)await this.store.rename(id,patch.username,this.adminPassword);else await this.modules.firestore.updateDoc(this.store.profileRef(id),{...patch,updatedAtMs:Date.now()});return this.getProfile(id);}
  async adminResetPasscode(id,pin){await this.requireAdmin();return this.store.resetPasscode(id,pin,this.adminPassword);}
  async adminDeleteProfile(id){await this.requireAdmin();return this.store.remove(id,this.adminPassword);}
  async adminMergeProfiles(source,target,combine){
    await this.requireAdmin();if(this.store.call)return this.store.merge(source,target,this.adminPassword);if(source===target)throw new Error('Choose two different accounts.');
    const fs=this.modules.firestore;
    let stage='preserve match history';
    try{
      for(const id of [source,target]){const profile=await this.store.profile(id);if(!profile)throw new Error('Account not found.');
        for(const record of attributedHistory(profile)){if(!record.id)continue;
          const ref=fs.doc(this.db,`gameProfiles/${id}/matches`,record.id);
          await fs.runTransaction(this.db,async tx=>{if(!(await tx.get(ref)).exists())tx.set(ref,{...record,ownerId:id,schemaVersion:record.schemaVersion||1,stats:record.stats||{},players:record.players||[],goals:record.goals||[]});});
        }
      }
      stage='merge the account profiles';
      return await this.store.merge(source,target,combine);
    }catch(error){
      if(error.code==='permission-denied')throw new Error(`Firebase blocked permission to ${stage}. Neither account was deleted. Publish the current firestore.rules in Firebase Console → lsl-rivals → Firestore Database → Rules, then retry. See ACCOUNT-RULES.md.`);
      throw error;
    }
  }
}

export {MODE_KEYS,modeFor};
