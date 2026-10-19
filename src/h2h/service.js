import {CloudAccount} from '../cloud-account.js';
export class LiveService{
 constructor(onError=()=>{}){this.account=new CloudAccount();this.onError=onError;this.stops=[];}
 async init(){await this.account.ready;if(!this.account.available)throw this.account.error||Error('Firebase unavailable.');this.fs=this.account.modules.firestore;this.db=this.account.db;this.uid=this.account.user?.uid;if(!this.account.store.call)throw Error('Free Live H2H has not been activated yet. Existing single-player accounts still work. See LIVE-H2H-SETUP.md for the free backend setup.');return this;}
 async signIn(username,passcode,create=false){await this.account[create?'create':'login'](username,passcode);this.uid=this.account.user.uid;return this.account.profile;}
 call(name,data){return this.account.store.call(name,data);}
 room(action,code,extra={}){return this.call('h2hRoom',{action,code,...extra});}
 listen(ref,callback){const stop=this.fs.onSnapshot(ref,callback,this.onError);this.stops.push(stop);return stop;}
 watchRoom(code,callback){return this.listen(this.fs.doc(this.db,'h2hRooms',code),snap=>callback(snap.exists()?snap.data():null));}
 watchList(path,callback){return this.listen(this.fs.collection(this.db,path),snap=>callback(snap.docs.map(d=>({id:d.id,...d.data()}))));}
 watchRooms(callback){return this.listen(this.fs.query(this.fs.collection(this.db,'h2hRooms'),this.fs.where('members','array-contains',this.uid)),snap=>callback(snap.docs.map(d=>d.data()).filter(r=>r.expiresAt>Date.now())));}
 async people(){const p=await this.account.getProfiles();return p.filter(p=>p.uid!==this.uid).map(p=>({uid:p.uid,username:p.username}));}
 async signal(code,epoch,kind,payload){await this.fs.addDoc(this.fs.collection(this.db,`h2hRooms/${code}/signals`),{from:this.uid,epoch,kind,payload:JSON.stringify(payload),createdAt:this.fs.serverTimestamp()});}
 signals(code,epoch,callback){return this.listen(this.fs.query(this.fs.collection(this.db,`h2hRooms/${code}/signals`),this.fs.where('epoch','==',epoch)),snapshot=>{for(const change of snapshot.docChanges())if(change.type==='added'&&change.doc.data().from!==this.uid)callback(change.doc.data());});}
 close(){this.stops.splice(0).forEach(stop=>stop());}
}
