// Small Firestore/Auth adapter for Workers. Credentials never reach the browser.
const enc = new TextEncoder();
const b64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const json64 = value => b64(enc.encode(JSON.stringify(value)));
const fail = (code,message) => Object.assign(new Error(message),{code});

export function encodeValue(value) {
 if(value===null||value===undefined)return {nullValue:null};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='number'){if(!Number.isFinite(value))throw fail('invalid-argument','Non-finite database value.');return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};}
 if(Array.isArray(value))return {arrayValue:{values:value.map(encodeValue)}};
 return {mapValue:{fields:encodeFields(value)}};
}
export const encodeFields = value => Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encodeValue(v)]));
export function decodeValue(v) {
 if('nullValue' in v)return null;
 for(const key of ['stringValue','booleanValue','referenceValue','timestampValue'])if(key in v)return v[key];
 if('integerValue' in v)return Number(v.integerValue);
 if('doubleValue' in v)return Number(v.doubleValue);
 if(v.arrayValue)return (v.arrayValue.values||[]).map(decodeValue);
 if(v.mapValue)return decodeFields(v.mapValue.fields||{});
 return null;
}
export const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decodeValue(v)]));
const fieldPath = key => key==='__name__'?key:key.split('.').map(k=>'`'+k.replace(/\\/g,'\\\\').replace(/`/g,'\\`')+'`').join('.');
function expanded(data){const root={};for(const [path,value] of Object.entries(data)){const keys=path.split('.');let parent=root;for(const key of keys.slice(0,-1))parent=parent[key]||=(Object.create(null));parent[keys.at(-1)]=value;}return root;}

export class FirebaseRest {
 constructor(env,transport=fetch){
  this.env=env;this.fetch=transport.bind(globalThis);
  try{this.credentials=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT||'{}');}catch{throw fail('failed-precondition','The Firebase service-account secret is not valid JSON.');}
  if(!this.credentials.private_key||!this.credentials.client_email||this.credentials.project_id!==env.FIREBASE_PROJECT_ID)throw fail('failed-precondition','Configure the Firebase service-account secret for this project.');
  this.database=`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)`;this.documents=this.database+'/documents';
 }
 async signedJWT(payload){
  if(!this.key){const der=Uint8Array.from(atob(this.credentials.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));this.key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);}
  const head=json64({alg:'RS256',typ:'JWT'})+'.'+json64(payload);
  return head+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',this.key,enc.encode(head)));
 }
 async accessToken(){
  if(this.token&&Date.now()<this.token.until)return this.token.value;
  if(this.tokenPending)return this.tokenPending;
  this.tokenPending=(async()=>{const now=Math.floor(Date.now()/1000),assertion=await this.signedJWT({iss:this.credentials.client_email,scope:'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
   const response=await this.fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(12000)}),data=await response.json();
   if(!response.ok||!data.access_token)throw fail('unavailable','Firebase server credentials were rejected. Check the service account.');
   this.token={value:data.access_token,until:Date.now()+Math.max(60,(data.expires_in||3600)-120)*1000};return this.token.value;
  })();try{return await this.tokenPending;}finally{this.tokenPending=null;}
 }
 async request(path,body,method='POST'){
  const response=await this.fetch('https://firestore.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+await this.accessToken(),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok){const status=data.error?.status||'UNAVAILABLE',code=status==='ALREADY_EXISTS'?6:status.toLowerCase().replace(/_/g,'-');throw fail(code,status==='RESOURCE_EXHAUSTED'?'The free Firebase quota is reached. Try again after it resets.':status==='NOT_FOUND'?'Document not found.':'Firebase request failed ('+status+').');}
  return data;
 }
 doc(path){return new Document(this,path);}
 collection(path){return new Query(this,path);}
 batch(){return new WriteBatch(this);}
 async runTransaction(fn){
  for(let attempt=0;attempt<4;attempt++){
   const {transaction}=await this.request(this.documents+':beginTransaction',{}),batch=new WriteBatch(this,transaction);
   try{const result=await fn(batch);await batch.commit();return result;}catch(error){await this.request(this.documents+':rollback',{transaction}).catch(()=>{});if(error.code!=='aborted'||attempt===3)throw error;}
  }
 }
 async createCustomToken(uid,claims){const now=Math.floor(Date.now()/1000);return this.signedJWT({iss:this.credentials.client_email,sub:this.credentials.client_email,aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',iat:now,exp:now+3600,uid,claims});}
 async verifyIdToken(token){
  const url='https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(this.env.FIREBASE_API_KEY);
  const response=await this.fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(12000)}),data=await response.json();
  if(!response.ok||!data.users?.[0]||data.users[0].disabled)throw fail('unauthenticated','Please sign in again.');
  let claims;try{claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{throw fail('unauthenticated','Invalid session.');}
  const user=data.users[0];if(claims.sub!==user.localId||claims.aud!==this.env.FIREBASE_PROJECT_ID||claims.iss!==`https://securetoken.google.com/${this.env.FIREBASE_PROJECT_ID}`||claims.exp*1000<=Date.now()||Number(user.validSince||0)>claims.auth_time)throw fail('unauthenticated','Your session expired. Please sign in again.');
  return {uid:user.localId,token:claims};
 }
 async adminAuth(action,body){const response=await this.fetch(`https://identitytoolkit.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/accounts:${action}`,{method:'POST',headers:{Authorization:'Bearer '+await this.accessToken(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});if(!response.ok)throw fail('unavailable','Could not update Firebase Authentication.');}
 revokeRefreshTokens(uid){return this.adminAuth('update',{localId:uid,validSince:String(Math.floor(Date.now()/1000))});}
 deleteUser(uid){return this.adminAuth('delete',{localId:uid});}
}
class Document {
 constructor(db,path){if(!path||path.split('/').length%2!==0||path.split('/').some(s=>!s||s==='.'||s==='..'))throw fail('invalid-argument','Invalid document path.');this.db=db;this.path=path;this.id=path.split('/').at(-1);this.name=db.documents+'/'+path;}
 async get(transaction){try{const raw=await this.db.request(this.name+(transaction?'?transaction='+encodeURIComponent(transaction):''),undefined,'GET');return {id:this.id,exists:true,data:()=>decodeFields(raw.fields||{})};}catch(error){if(error.code==='not-found')return {id:this.id,exists:false,data:()=>undefined};throw error;}}
 set(data){return this.db.batch().set(this,data).commit();}
 create(data){return this.db.batch().create(this,data).commit();}
 update(data){return this.db.batch().update(this,data).commit();}
 delete(){return this.db.batch().delete(this).commit();}
 collection(name){return this.db.collection(this.path+'/'+name);}
}
class WriteBatch {
 constructor(db,transaction){this.db=db;this.transaction=transaction;this.writes=[];}
 get(ref){return ref.get(this.transaction);}
 set(ref,data){this.writes.push({update:{name:ref.name,fields:encodeFields(data)}});return this;}
 create(ref,data){this.set(ref,data);this.writes.at(-1).currentDocument={exists:false};return this;}
 update(ref,data){this.writes.push({update:{name:ref.name,fields:encodeFields(expanded(data))},updateMask:{fieldPaths:Object.keys(data).map(fieldPath)},currentDocument:{exists:true}});return this;}
 delete(ref){this.writes.push({delete:ref.name});return this;}
 commit(){return this.db.request(this.db.documents+':commit',{writes:this.writes,...(this.transaction?{transaction:this.transaction}:{})});}
}
class Query {
 constructor(db,path,query={}){this.db=db;this.path=path;this.query=query;}
 doc(id){return this.db.doc(this.path+'/'+id);}
 where(field,op,value){if(op!=='==')throw Error('Unsupported query operator');return new Query(this.db,this.path,{...this.query,where:{fieldFilter:{field:{fieldPath:fieldPath(field)},op:'EQUAL',value:encodeValue(value)}}});}
 limit(n){return new Query(this.db,this.path,{...this.query,limit:n});}
 orderBy(field){return new Query(this.db,this.path,{...this.query,orderBy:[{field:{fieldPath:fieldPath(field)},direction:'ASCENDING'}]});}
 async get(){const parts=this.path.split('/'),collectionId=parts.pop(),parent=this.db.documents+(parts.length?'/'+parts.join('/'):'');const data=await this.db.request(parent+':runQuery',{structuredQuery:{from:[{collectionId}],...this.query}});const docs=data.filter(d=>d.document).map(({document:d})=>({id:d.name.split('/').at(-1),exists:true,data:()=>decodeFields(d.fields||{})}));return {docs};}
}
