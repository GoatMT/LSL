// Exercises the real workerd runtime against an isolated in-memory Google API fixture.
// No real Firebase accounts, credentials or network requests are used.
import assert from 'node:assert/strict';
import {generateKeyPairSync,pbkdf2Sync} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {encodeFields,decodeFields} from './firebase-rest.js';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const credentials={project_id:'local-test',client_email:'test@local-test.iam.gserviceaccount.com',private_key:privateKey.export({format:'pem',type:'pkcs8'})};
const docs=new Map([['runtime/live',{enabled:true}]]),prefix='projects/local-test/databases/(default)/documents/';
const apiError=(status,code)=>Response.json({error:{status}},{status:code});
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:readFileSync(new URL('.build/worker.js',import.meta.url),'utf8').replace('code === "unavailable" ? "The free online service could not complete this request. Check Firebase setup or try again later." : e.message','e.stack'),scriptPath:fileURLToPath(new URL('.build/worker.js',import.meta.url)),compatibilityDate:'2026-09-21',compatibilityFlags:['nodejs_compat'],durableObjects:{LIVE_BACKEND:{className:'LiveBackend',useSQLite:true}},bindings:{FIREBASE_PROJECT_ID:'local-test',FIREBASE_API_KEY:'fixture',FIREBASE_SERVICE_ACCOUNT:JSON.stringify(credentials),ALLOWED_ORIGINS:'https://goatmt.github.io',MAX_DAILY_REQUESTS:'100'},outboundService:async request=>{
 const url=new URL(request.url),body=request.method==='POST'?await request.json().catch(()=>null):null;
 if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'fixture-only',expires_in:3600});
 if(url.hostname==='identitytoolkit.googleapis.com'){
  const claims=JSON.parse(Buffer.from(body.idToken.split('.')[1],'base64url'));
  return Response.json({users:[{localId:claims.sub,validSince:'1'}]});
 }
 assert.equal(url.hostname,'firestore.googleapis.com');
 const path=decodeURIComponent(url.pathname).replace('/v1/',''),relative=path.startsWith(prefix)?path.slice(prefix.length):'';
 if(path.endsWith(':beginTransaction'))return Response.json({transaction:'fixture'});
 if(path.endsWith(':rollback'))return Response.json({});
 if(path.endsWith(':commit')){
  for(const write of body.writes){const key=(write.update?.name||write.delete).slice(prefix.length);if(write.currentDocument?.exists===false&&docs.has(key))return apiError('ALREADY_EXISTS',409);}
  for(const write of body.writes){const key=(write.update?.name||write.delete).slice(prefix.length);if(write.delete){docs.delete(key);continue;}const value=decodeFields(write.update.fields);docs.set(key,write.updateMask?{...docs.get(key),...value}:value);}
  return Response.json({writeResults:[]});
 }
 if(request.method==='GET')return docs.has(relative)?Response.json({name:path,fields:encodeFields(docs.get(relative))}):apiError('NOT_FOUND',404);
 throw Error('Unexpected fixture request '+request.method+' '+url.pathname);
}}));
async function call(name,data,token){const response=await mf.dispatchFetch('https://worker.test/api/'+name,{method:'POST',headers:{Origin:'https://goatmt.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:response.status,...await response.json()};}
try{
 const created=await call('accountAuth',{action:'create',username:'RuntimeUser',passcode:'123456'});assert.equal(created.status,200,JSON.stringify(created));assert.equal(created.data.profile.username,'RuntimeUser');
 const tokenClaims=JSON.parse(Buffer.from(created.data.token.split('.')[1],'base64url'));assert.equal(tokenClaims.uid,created.data.profile.uid);assert.equal(docs.get('gameLogins/'+tokenClaims.uid).passcode,'123456');
 const wrong=await call('accountAuth',{action:'login',username:'RuntimeUser',passcode:'000000'});assert.equal(wrong.status,403);
 const good=await call('accountAuth',{action:'login',username:'RuntimeUser',passcode:'123456'});assert.equal(good.status,200);
 const login=docs.get('gameLogins/'+tokenClaims.uid);login.algorithm='pbkdf2';login.salt='runtime-salt';login.pinHash=pbkdf2Sync('123456',login.salt,120000,32,'sha256').toString('hex');delete login.passcode;
 const migrated=await call('accountAuth',{action:'login',username:'RuntimeUser',passcode:'123456'});assert.equal(migrated.status,200,JSON.stringify(migrated));assert.equal(docs.get('gameLogins/'+tokenClaims.uid).algorithm,'plain-v1');
 const claims={sub:tokenClaims.uid,aud:'local-test',iss:'https://securetoken.google.com/local-test',exp:Math.floor(Date.now()/1000)+600,auth_time:2,revision:tokenClaims.claims.revision},idToken='header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fixture';
 const room=await call('h2hRoom',{action:'create',options:{duration:1,difficulty:'normal',season:'2026'}},idToken);assert.equal(room.status,200,JSON.stringify(room));assert.match(room.data.code,/^LR-\d{6}$/);
 const unauthenticated=await call('h2hRoom',{action:'create'});assert.equal(unauthenticated.status,401);
 console.log('PASS: workerd + SQLite Durable Object + REST adapter: registration, login, wrong PIN, legacy migration, signed room creation, signed-out rejection. All Google APIs were local fixtures.');
}finally{await mf.dispose();}
