let started=false;
export async function startInviteNotifications(){
 if(started||location.pathname.endsWith('/live-h2h.html'))return;started=true;
 const {LiveService}=await import('./service.js'),service=new LiveService(()=>{});await service.init();
 let stopList,stopRoom,shown=new Set(),watchedUid=null;
 service.account.store.authModule.onAuthStateChanged(service.account.store.auth,user=>{
  if(user?.uid===watchedUid)return;stopList?.();stopRoom?.();document.querySelector('.live-invite-toast')?.remove();watchedUid=user?.uid;service.uid=watchedUid;shown=new Set();if(!watchedUid)return;
  stopList=service.watchList(`h2hInvites/${watchedUid}/items`,items=>{
   const invite=items.filter(i=>i.expiresAt>Date.now()&&!shown.has(i.id)).sort((a,b)=>b.createdAt-a.createdAt)[0];if(!invite)return;shown.add(invite.id);
   stopRoom?.();document.querySelector('.live-invite-toast')?.remove();const panel=document.createElement('aside');panel.className='live-invite-toast';panel.setAttribute('role','status');const name=document.createElement('strong');name.textContent=invite.fromName+' invited you to Live H2H';const status=document.createElement('p'),join=document.createElement('a'),decline=document.createElement('button');join.textContent='JOIN ROOM';join.href='./live-h2h.html?room='+encodeURIComponent(invite.code);decline.textContent='DECLINE';decline.className='site-nav-button';decline.onclick=async()=>{decline.disabled=true;try{await service.call('h2hInvite',{action:'decline',code:invite.code});panel.remove();stopRoom?.();}catch(error){status.textContent=error.message;decline.disabled=false;}};panel.append(name,status,join,decline);document.body.append(panel);
   stopRoom=service.watchRoom(invite.code,room=>{status.textContent=room?room.status+(room.guest?' · '+room.score.join(' – '):''):'Room closed';join.hidden=room?.status!=='OPEN';});
  });
 });
}
