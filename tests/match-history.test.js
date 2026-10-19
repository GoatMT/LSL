import test from 'node:test';
import assert from 'node:assert/strict';
import {captureMatch,recordsFor,summarize,filterMatches,matchMetrics,uniqueMatches} from '../src/match-history.js';
import {matchReport,matchCard,recordGrid} from '../src/history-view.js';
import {fetchArchive} from '../src/history-store.js';
import {Match} from '../src/match/match.js';
const report=(id,score,extra={})=>({schemaVersion:2,id,date:Number(id)*1000,mode:'quick',season:'2026',teams:['Lions','Royals'],score,stats:{user:{goals:score[0],shots:7,onTarget:4,possession:70,passes:20,completed:18,saves:3},cpu:{goals:score[1],possession:30}},goals:[],...extra});
test('history totals keep more than 50 reports, deduplicate retries, and count scoreless clean sheets',()=>{
 const rows=Array.from({length:65},(_,i)=>report(String(i),[0,0]));const s=summarize([...rows,rows[0]]);assert.equal(s.matches,65);assert.equal(s.cleanSheets,65);assert.equal(s.ties,65);assert.equal(s.longestUnbeatenStreak,65);assert.equal(uniqueMatches(rows).length,65);
});
test('records include losses, meaningful accuracy, correct possession and multiple hat-trick windows',()=>{
 const goals=[0,40,41,42].map(time=>({team:0,name:'Forward',playerId:'p',time,assist:'Midfielder'}));
 const r=recordsFor([report('1',[4,5],{goals}),report('2',[1,0],{stats:{user:{passes:1,completed:1},cpu:{}}})]);assert.equal(r.goalsGame.value,4);assert.equal(r.pointsGame.value,8);assert.equal(r.fastestGoal.value,0);assert.equal(r.hatTrick.value,2);assert.equal(r.possession.value,70);assert.equal(r.accuracy.value,90);assert.equal(r.highestScore.value,9);
});
test('comeback requires a real deficit and win; wins, unbeaten and losing streaks remain distinct',()=>{
 const rows=[report('1',[1,0]),report('2',[0,0]),report('3',[0,1]),report('4',[1,2]),report('5',[3,2],{goals:[{team:1,time:1},{team:1,time:2},{team:0,time:3},{team:0,time:4},{team:0,time:5}]})];const r=recordsFor(rows);assert.equal(r.comeback.value,2);assert.equal(r.streakWins.value,1);assert.equal(r.streakUnbeaten.value,2);assert.equal(r.streakLosses.value,2);assert.equal(recordsFor([report('6',[8,0])]).comeback,undefined);
});
test('combined history filters and sorting work without mutating source',()=>{
 const rows=[report('1',[2,1],{mode:'season',opponent:{type:'cpu',difficulty:'hard'}}),report('2',[0,3]),report('3',[5,4],{mode:'season',opponent:{type:'cpu',difficulty:'hard'}})];assert.equal(filterMatches(rows,{mode:'season',result:'wins',difficulty:'hard',team:'Lions',opponent:'Royals',season:'2026',search:'royals',sort:'goals'})[0].id,'3');assert.equal(filterMatches(rows,{sort:'oldest'})[0].id,'1');assert.equal(filterMatches(rows,{result:'losses'}).length,1);assert.equal(filterMatches(rows,{from:'2026-01-01'}).length,0);assert.equal(rows[0].id,'1');
});
test('legacy special statistics remain unknown and unsafe player names are escaped in reports',()=>{
 const r=report('1',[1,0],{schemaVersion:1,goals:[{team:0,name:'<script>alert(1)</script>',time:2}]});assert.equal(matchMetrics(r).penaltiesScored,null);const html=matchCard(r);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('difficulty not recorded'));assert.ok(html.includes('Lineup not recorded'));assert.ok(!html.includes('<script>'));assert.ok(recordGrid({}).includes('No qualifying result'));
});
test('full-time snapshot freezes lineups and player stats, includes every mode and does not leak mutable player data',()=>{
 const m={players:[{id:'p',name:'Player',jersey:7,team:0,role:'FWD',goals:2,assists:0,saves:0,tackles:0,passes:0,involvement:0,yellow:0}],teams:[{name:'A'},{name:'B'}],stats:[{goals:2},{goals:0}],settings:{duration:6,season:2026,difficulty:'insane'},elapsed:360,startingLineups:[[{name:'Original'}],[]],formations:[],goalEvents:[],subEvents:[]};
 for(const [flag,mode]of [['rivalry','rivalry'],['tournament','tournament'],['seasonMatch','season'],['dream','dream']]){const r=captureMatch({...m,[flag]:{}},{uid:'owner',username:'Captain'});assert.equal(r.mode,mode);assert.equal(r.opponent.difficulty,'insane');assert.equal(r.duration,360);assert.equal(r.players[0].goals,2);assert.equal(r.accountName,'Captain');assert.equal(r.playerOfMatch.jersey,7);}
 const r=captureMatch(m);m.startingLineups[0][0].name='Changed';assert.equal(r.startingLineups[0][0].name,'Original');assert.ok(matchReport(r).includes('Individual match statistics'));
 const validate=value=>{if(Array.isArray(value))assert.ok(!value.some(Array.isArray),'Firestore cannot store directly nested arrays');if(value&&typeof value==='object')Object.values(value).forEach(validate);};validate(r);
});
test('archive reader loads beyond the first page with stable cursors',async()=>{
 const rows=Array.from({length:421},(_,i)=>({id:String(i),data:()=>report(String(i),[1,0])}));let calls=0;
 const fs={collection:(_,s)=>s,orderBy:()=>null,limit:n=>({n}),startAfter:cursor=>({start:Number(cursor.id)+1}),query:(ref,...c)=>({ref,c}),getDocs:async q=>{calls++;const start=q.c.find(x=>x?.start)?.start||0;return {docs:rows.slice(start,start+200)};}};const all=await fetchArchive(fs,{},'account');assert.equal(all.length,421);assert.equal(calls,3);
});
test('actual match engine captures starting formation before substitutions and tags penalty goals',()=>{
 const teams=[0,1].map(t=>({name:'Team '+t,lineup:Array.from({length:7},(_,i)=>({id:t+'-'+i,name:'Player '+i,jersey:i+1,overall:80})),bench:[]}));
 const m=new Match(teams,{duration:3,season:2026,difficulty:'normal'});assert.equal(m.startingLineups[0].length,7);const shooter=m.players[5];m.ball.lastTouch=shooter;m.ball.shot={team:0,player:shooter,counted:false,setPiece:'PENALTY'};m.goal(0);assert.equal(m.stats[0].penaltiesScored,1);assert.equal(shooter.onTarget,1);assert.equal(m.goalEvents[0].setPiece,'PENALTY');assert.equal(captureMatch(m).startingLineups[0][5].jersey,6);
});

test('difficulty filters combine with mode, alias Medium to Normal, and exclude unknown/local difficulty',()=>{
 const rows=[report('1',[2,0],{mode:'season',opponent:{type:'cpu',difficulty:'easy'}}),report('2',[1,0],{mode:'season',opponent:{type:'cpu',difficulty:'normal'}}),report('3',[3,0],{mode:'season',opponent:{type:'cpu',difficulty:'medium'}}),report('4',[4,0],{mode:'quick',opponent:{type:'cpu',difficulty:'hard'}}),report('5',[0,1],{mode:'season',opponent:{type:'cpu',difficulty:'insane'}}),report('6',[9,0],{schemaVersion:1}),report('7',[8,0],{opponent:{type:'local',difficulty:'hard'}})];
 assert.equal(filterMatches(rows,{difficulty:'all'}).length,7);
 const medium=filterMatches(rows,{mode:'season',difficulty:'normal'});assert.deepEqual(medium.map(r=>r.id),['3','2']);assert.equal(summarize(medium).wins,2);assert.equal(recordsFor(medium).goalsGame.value,3);
 assert.deepEqual(filterMatches(rows,{difficulty:'medium'}).map(r=>r.id),['3','2']);assert.deepEqual(filterMatches(rows,{difficulty:'hard'}).map(r=>r.id),['4']);assert.equal(filterMatches(rows,{mode:'season',difficulty:'hard'}).length,0);assert.equal(filterMatches(rows,{difficulty:'insane'}).length,1);
});

test('reports keep the playing account captured at kickoff after the current account changes',()=>{
 const r=captureMatch({playingAccount:{uid:'original',username:'Original'},stats:[{goals:1},{goals:0}],teams:[{name:'A'},{name:'B'}],settings:{}},{uid:'different',username:'Different'});
 assert.equal(r.ownerId,'original');assert.equal(r.accountName,'Original');assert.match(matchReport(r),/Played by <strong>Original/);assert.match(matchCard(r),/Played by Original/);
});
