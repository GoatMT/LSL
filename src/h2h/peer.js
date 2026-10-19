export class LivePeer{
 constructor(service,room,{onMessage=()=>{},onState=()=>{}}={}){this.service=service;this.room=room;this.host=room.host===service.uid;this.onMessage=onMessage;this.onState=onState;this.channels={};this.outbox=[];this.pending=[];this.chain=Promise.resolve();this.closed=false;this.lastSeen=performance.now();}
 async connect(){
  const {iceServers,relay}=await this.service.call('h2hConnection',{code:this.room.code});this.directOnly=relay===false;if(this.closed)return;
  this.pc=new RTCPeerConnection({iceServers});
  this.pc.onicecandidate=e=>{if(e.candidate)this.service.signal(this.room.code,this.room.epoch,'candidate',e.candidate.toJSON()).catch(e=>this.onState('error',e.message));};
  this.pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(this.pc.connectionState)&&!this.closed)this.onState('disconnected');};
  this.pc.ondatachannel=e=>this.attach(e.channel);
  this.stop=this.service.signals(this.room.code,this.room.epoch,data=>{this.chain=this.chain.then(()=>this.signal(data)).catch(e=>this.onState('error',e.message));});
  if(this.host){this.attach(this.pc.createDataChannel('reliable'));this.attach(this.pc.createDataChannel('snapshots',{ordered:false,maxRetransmits:0}));const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);await this.service.signal(this.room.code,this.room.epoch,'offer',offer);}
  this.connectDeadline=setTimeout(()=>{if(!this.ready&&!this.closed)this.onState('error',this.directOnly?'A direct connection could not be made. Try another Wi-Fi network or the same Wi-Fi. This free mode has no paid relay.':'The connection timed out. Try reconnecting.');},15000);
  this.health=setInterval(()=>{this.send({type:'ping',at:performance.now()});if(this.ready&&performance.now()-this.lastSeen>6500)this.onState('disconnected');},2000);
 }
 async signal(data){if(this.closed)return;const p=JSON.parse(data.payload);
  if(data.kind==='candidate'){if(this.pc.remoteDescription)await this.pc.addIceCandidate(p);else this.pending.push(p);return;}
  if(data.kind==='offer'&&!this.host){await this.pc.setRemoteDescription(p);const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);await this.service.signal(this.room.code,this.room.epoch,'answer',answer);}
  if(data.kind==='answer'&&this.host)await this.pc.setRemoteDescription(p);
  if(this.pc.remoteDescription)for(const candidate of this.pending.splice(0))await this.pc.addIceCandidate(candidate);
 }
 attach(channel){if(!['reliable','snapshots'].includes(channel.label)){channel.close();return;}this.channels[channel.label]=channel;
  if(channel.label==='reliable'){channel.bufferedAmountLowThreshold=64000;channel.onbufferedamountlow=()=>this.flush();}
  channel.onopen=()=>{if(Object.values(this.channels).length===2&&Object.values(this.channels).every(c=>c.readyState==='open')){this.ready=true;clearTimeout(this.connectDeadline);this.flush();this.lastSeen=performance.now();this.onState('connected');}};
  channel.onclose=()=>{this.ready=false;if(!this.closed)this.onState('disconnected');};
  channel.onmessage=e=>{if(typeof e.data!=='string'||e.data.length>200000)return;this.lastSeen=performance.now();let data;try{data=JSON.parse(e.data);}catch{return;}
   if(data.type==='ping'){this.send({type:'pong',at:data.at});return;}if(data.type==='pong'){this.latency=Math.round(performance.now()-data.at);return;}this.onMessage(data);
  };
 }
 send(message,fast=false){const c=this.channels[fast?'snapshots':'reliable'];if(c?.readyState!=='open')return false;const text=JSON.stringify(message);if(fast){if(c.bufferedAmount>64000)return false;c.send(text);return true;}if(this.outbox.length>2000){this.onState('error','Connection is too slow. Reconnecting…');return false;}this.outbox.push(text);this.flush();return true;}
 flush(){const c=this.channels.reliable;while(c?.readyState==='open'&&c.bufferedAmount<128000&&this.outbox.length)c.send(this.outbox.shift());}

 close(){this.closed=true;this.ready=false;clearInterval(this.health);clearTimeout(this.connectDeadline);this.stop?.();this.pc?.close();}
}
