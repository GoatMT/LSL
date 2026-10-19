import {weatherOption} from './engine/weather-options.js';
const allowed=['easy','normal','hard','insane'],formations=['2-2-2','2-3-1','3-2-1','3-1-2','1-3-2'];
function require(condition,message){if(!condition)throw Error(message);}
export function validateOptions(options={},catalog){require([1,2,3,4,5,6].includes(Number(options.duration)),'Choose a match length from 1 to 6 minutes.');require(allowed.includes(options.difficulty),'Choose a supported AI difficulty.');require(catalog[String(options.season)]?.length>=2,'This LSL season is unavailable.');return {duration:Number(options.duration),difficulty:options.difficulty,season:String(options.season),lighting:['day','evening','night'].includes(options.lighting)?options.lighting:'evening',venue:['stadium-one','grenoble-ps'].includes(options.venue)?options.venue:'stadium-one',weather:weatherOption(options.weather),minorInjuries:true};}
export function applyRoomAction(previous,uid,name,data,catalog,now){
 const r=structuredClone(previous),host=r.host===uid,member=r.members.includes(uid),lobby=['OPEN','LOCKED','FULL'].includes(r.status);
 require(r.expiresAt>now,'This room has expired. Create a new room.');
 switch(data.action){
 case 'request':require(r.status==='OPEN'&&!member,'This room is not accepting join requests.');require(Object.keys(r.requests).length<20||r.requests[uid],'The host has too many pending requests. Try later.');r.requests[uid]={uid,name,status:'pending',at:now};break;
 case 'accept':case 'deny':require(host&&r.status==='OPEN','Only the host of an open room can approve requests.');require(r.requests[data.uid]?.status==='pending','Join request no longer available.');require(now-r.requests[data.uid].at<300000,'Join request expired.');r.requests[data.uid].status=data.action==='accept'?'accepted':'declined';if(data.action==='accept'){r.guest=data.uid;r.members=[r.host,data.uid];r.names[data.uid]=r.requests[data.uid].name;r.status='FULL';r.ready={};}break;
 case 'lock':require(host&&r.status==='OPEN','Only an open room can be locked.');r.status='LOCKED';break;
 case 'unlock':require(host&&r.status==='LOCKED','Only the host can unlock this room.');r.status='OPEN';break;
 case 'choose':{
  require(member&&lobby,'Team selection is closed.');const team=catalog[r.options.season]?.find(t=>t.id===data.team);require(team,'Team unavailable for this season.');require(formations.includes(data.formation),'Choose a supported formation.');require(!Object.entries(r.choices).some(([id,s])=>id!==uid&&s.team===team.id),'Opponent already selected this team.');
  const lineup=data.lineup||team.lineup.map(p=>p.id);require(Array.isArray(lineup)&&lineup.length===7&&new Set(lineup).size===7&&lineup.every(id=>team.roster.some(p=>p.id===id)),'Choose seven players from this team.');
  const next={team:team.id,name:team.name,formation:data.formation,lineup};
  const previousChoice=r.choices[uid];
  const changed=!previousChoice||previousChoice.team!==next.team||previousChoice.formation!==next.formation||JSON.stringify(previousChoice.lineup)!==JSON.stringify(next.lineup);
  r.choices[uid]=next;
  if(changed){r.ready||={};r.ready[uid]=false;}
  break;
 }
 case 'ready':require(member&&r.status==='FULL'&&r.choices[uid],'Select your team first.');r.ready[uid]=data.ready===true;break;
 case 'start':require(host&&r.status==='FULL'&&r.members.every(id=>r.ready[id]&&r.choices[id]),'Both players must select teams and be ready.');r.status='STARTING';r.connected={};r.startedAt=now+3000;r.epoch=(r.epoch||0)+1;r.heartbeats=Object.fromEntries(r.members.map(id=>[id,now]));break;
 case 'heartbeat':require(member,'Room participant required.');r.heartbeats||={};r.heartbeats[uid]=now;break;
 case 'reconnect':require(host&&['STARTING','LIVE','CLOSE TO END'].includes(r.status),'Only the host can restart this match connection.');require(!r.lastRestart||now-r.lastRestart>4000,'Reconnection is already running.');r.epoch++;r.connected={};r.lastRestart=now;break;
 case 'disconnect':require(member&&['STARTING','LIVE','CLOSE TO END'].includes(r.status),'No active match to disconnect.');r.disconnectAt||=now;break;
 case 'connected':require(member&&['STARTING','LIVE','CLOSE TO END'].includes(r.status),'Active match participant required.');r.connected||={};r.connected[uid]=true;if(r.members.every(id=>r.connected[id]))r.disconnectAt=null;if(r.members.length===2&&r.members.every(id=>r.connected[id])&&!r.kickoffAt){r.kickoffAt=now+3000;r.startedAt=r.kickoffAt;}break;
 case 'timeout':require(member&&r.disconnectAt&&now-r.disconnectAt>=25000,'Reconnection window is still open.');r.status='FULL TIME';r.endedAt=now;r.expiresAt=now+300000;r.endReason='Connection lost — match abandoned';r.verified=false;break;
 case 'leave':require(member&&lobby,'Use End Match to leave an active match.');if(host){r.status='FULL TIME';r.endReason='Room closed';r.expiresAt=now+60000;}else{delete r.choices[uid];delete r.names[uid];r.members=[r.host];r.guest=null;r.status='OPEN';r.ready={};r.requests={};}break;
 case 'abandon':require(member&&['STARTING','LIVE','CLOSE TO END'].includes(r.status),'No active match.');r.status='FULL TIME';r.endReason=name+' left the match';r.verified=false;r.endedAt=now;r.expiresAt=now+300000;break;
 default:throw Error('Unsupported room operation.');
 }
 r.updatedAt=now;return r;
}
export function personalReport(report,room,side,date){
 const r=structuredClone(report),uid=room.members[side],opponent=room.members[1-side];
 r.id=`h2h-${room.code}-${room.startedAt}`;r.ownerId=uid;r.accountName=room.names[uid];r.date=date;r.mode='h2h';r.modeLabel='Live Head to Head';r.verified=true;r.roomId=room.code;r.opponent={type:'account',uid:opponent,accountName:room.names[opponent]};r.aiDifficulty=room.options.difficulty;r.competition={name:'Live Head to Head',stage:'Private room'};
 if(side===1){r.teams.reverse();r.teamIds.reverse();r.score.reverse();[r.stats.user,r.stats.cpu]=[r.stats.cpu,r.stats.user];for(const key of ['startingLineups','finalLineups','startingFormations','finalFormations'])r[key]={0:r[key][1],1:r[key][0]};for(const key of ['players','goals','substitutions','injuries'])for(const item of r[key]||[])item.team=1-item.team;if(r.playerOfMatch)r.playerOfMatch.team=1-r.playerOfMatch.team;for(const key of ['startingLineups','finalLineups'])for(const team of [0,1])for(const player of r[key][team])player.team=team;}
 r.won=r.score[0]>r.score[1];r.tie=r.score[0]===r.score[1];return r;
}
