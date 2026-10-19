// A durable local outbox protects completed reports through reloads and network failures.
async function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('lantern-rush-match-history',1);request.onupgradeneeded=()=>request.result.createObjectStore('pending',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function local(action,value){
  if(!globalThis.indexedDB){
    if(!globalThis.localStorage)return action==='getAll'?[]:undefined;
    const key='lsl-match-outbox',entries=JSON.parse(localStorage.getItem(key)||'{}');
    if(action==='getAll')return Object.values(entries);if(action==='put')entries[value.id]=value;else delete entries[value];localStorage.setItem(key,JSON.stringify(entries));return;
  }
  const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('pending',action==='getAll'?'readonly':'readwrite'),request=tx.objectStore('pending')[action](value);tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export const enqueueReport=record=>local('put',record);
export const removePending=id=>local('delete',id);
export const pendingReports=()=>local('getAll');
export async function fetchArchive(fs,db,owner){
  const records=[];let cursor=null;
  do{const ref=fs.collection(db,`gameProfiles/${owner}/matches`),constraints=[fs.orderBy('date','desc'),fs.limit(200)];if(cursor)constraints.push(fs.startAfter(cursor));const page=await fs.getDocs(fs.query(ref,...constraints));records.push(...page.docs.map(d=>d.data()));cursor=page.docs.length===200?page.docs.at(-1):null;}while(cursor);
  return records;
}
