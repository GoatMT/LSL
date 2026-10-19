import {FirebaseRest} from './firebase-rest.js';
import {createApi} from './api.generated.js';

const apiNames=new Set(['accountAuth','accountProfile','accountAdmin','h2hRoom','h2hInvite','h2hPresence','h2hConnection','h2hProgress','h2hTrace','h2hFinalize']);
const statusCode={ 'invalid-argument':400,unauthenticated:401,'permission-denied':403,'not-found':404,'already-exists':409,'failed-precondition':409,'resource-exhausted':429,unavailable:503 };
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
const error=(code,message)=>Object.assign(new Error(message),{code});
export function safeError(e){
 const code=Object.hasOwn(statusCode,e?.code)?e.code:'unavailable';
 if(code!=='unavailable')return {code,message:e.message};
 const reference=crypto.randomUUID().slice(0,8);
 // Never log messages, requests, account data, tokens or credentials. Stack locations
 // identify the failing code while excluding the potentially sensitive first line.
 const frames=String(e?.stack||'').split('\n').slice(1,5).map(line=>line.trim().match(/^at [a-zA-Z0-9_.$<> ]+ \([^()]+:\d+:\d+\)$/)?.[0]).filter(Boolean);
 console.error(JSON.stringify({event:'live-service-error',reference,type:['TypeError','ReferenceError','RangeError','SyntaxError','Error','NotSupportedError'].includes(e?.name)?e.name:'Error',frames}));
 return {code,message:`Online sign-in or play failed. Please retry; if it continues, share error reference ${reference}.`};
}
export function allowedOrigin(request,env){const origin=request.headers.get('Origin');return !!origin&&String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin);}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return json({service:'Lantern Rush Free H2H',version:1,backend:'workers-free',relay:false});
  if(!allowedOrigin(request,env))return json({error:{code:'permission-denied',message:'This website is not allowed to use the match service.'}},403);
  const headers={'Access-Control-Allow-Origin':request.headers.get('Origin'),'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const name=url.pathname.match(/^\/api\/(\w+)$/)?.[1];
  if(request.method!=='POST'||!apiNames.has(name))return json({error:{code:'not-found',message:'Unknown online operation.'}},404,headers);
  if(Number(request.headers.get('Content-Length')||0)>600000)return json({error:{code:'invalid-argument',message:'Request is too large.'}},413,headers);
  try{
   const response=await env.LIVE_BACKEND.get(env.LIVE_BACKEND.idFromName('lantern-rush-v1')).fetch(request);
   const result=new Response(response.body,response);for(const [k,v] of Object.entries(headers))result.headers.set(k,v);return result;
  }catch{return json({error:{code:'resource-exhausted',message:'The free match service is unavailable or its quota has been reached. Please try again later; no paid fallback is used.'}},503,headers);}
 }
};

// SQLite-backed Durable Objects run the full match replay within their CPU budget.
// No subscription, external relay token, scheduled task, or Cloud Function is used.
export class LiveBackend {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.clients=new Map();
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS daily_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL)');
 }
 reserveBudget(){
  const day=new Date().toISOString().slice(0,10),sql=this.ctx.storage.sql;
  const row=[...sql.exec('SELECT calls FROM daily_budget WHERE day = ?',day)][0];
  const configured=Number(this.env.MAX_DAILY_REQUESTS)||6000,limit=Math.max(100,Math.min(10000,configured));
  if((row?.calls||0)>=limit)throw error('resource-exhausted','The free daily online limit has been reached. It resets at midnight UTC. Offline modes are still available.');
  sql.exec('INSERT INTO daily_budget (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1',day);
  if(!row)sql.exec('DELETE FROM daily_budget WHERE day < ?',day);
 }
 limitClient(ip){
  const now=Date.now();for(const [key,value]of this.clients)if(value.until<=now)this.clients.delete(key);
  if(this.clients.size>5000)throw error('resource-exhausted','The free service is busy. Try again shortly.');
  const entry=this.clients.get(ip)||{count:0,until:now+60000};
  if(++entry.count>180)throw error('resource-exhausted','Too many requests. Please wait a minute.');
  this.clients.set(ip,entry);
 }
 async fetch(request){
  try{
   this.reserveBudget();this.limitClient(request.headers.get('CF-Connecting-IP')||'local');
   const reader=request.body?.getReader();let size=0;const chunks=[];
   if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>600000){await reader.cancel();throw error('invalid-argument','Request is too large.');}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
   let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw error('invalid-argument','Invalid request JSON.');}
   if(!data||typeof data!=='object'||Array.isArray(data))throw error('invalid-argument','Invalid request.');
   if(!this.db){this.db=new FirebaseRest(this.env);this.api=createApi({db:this.db,auth:this.db});}
   const name=new URL(request.url).pathname.split('/').at(-1);
   if(!Object.hasOwn(this.api,name))throw error('not-found','Unknown online operation.');
   let auth=null;
   if(name!=='accountAuth'){const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)throw error('unauthenticated','Sign in before using online play.');auth=await this.db.verifyIdToken(token);}
   const result=await this.api[name]({data,auth});return json({data:result});
  }catch(e){const failure=safeError(e);return json({error:failure},statusCode[failure.code]);}
 }
}
