import { updateKeeper } from './goalkeeper.js';
import { predictBall } from './physics.js';
import { defensiveShape,pressurePoint,coverPoint,attackingDecision } from './tactics.js';
import { FORMATION,FIELD,PLAY,fieldUnits as u,clamp,distance,normalize } from '../config.js';

export function bestPass(match,player,aim=null){
  const direction=match.direction(player.team),opponents=match.active(1-player.team);
  let best=null,bestScore=-Infinity,fallback=null;
  for(const mate of match.active(player.team)){
    if(mate===player||(mate.role==='GK'&&(player.role==='GK'||player.x*direction>0)))continue;
    const dist=distance(player,mate);
    if(!fallback||dist<distance(player,fallback))fallback=mate;
    if(dist<3||dist>u(49))continue;
    const dx=mate.x-player.x,dz=mate.z-player.z,n=normalize(dx,dz);
    let openness=u(8);
    for(const opp of opponents){
      const t=clamp(((opp.x-player.x)*dx+(opp.z-player.z)*dz)/(dist*dist),0,1);
      const gap=Math.hypot(opp.x-player.x-dx*t,opp.z-player.z-dz*t);
      if(t>.06&&t<.97)openness=Math.min(openness,gap);
    }
    const alignment=aim?(n.x*aim.x+n.z*aim.z)*18:dx*direction/u(1)*.2;
    const nextLine=(player.role==='GK'&&mate.role==='DEF')||(player.role==='DEF'&&mate.role==='MID')||(player.role==='MID'&&mate.role==='FWD');
    const switchWing=Math.abs(player.z)>u(9)&&mate.z*player.z<0&&openness>u(4);
    const score=alignment+Math.min(openness,u(6))/u(1)*2.8-dist*.12+(dx*direction>0?2:0)+(nextLine?4:0)+(switchWing?5:0)-(!aim&&mate===player.receivedFrom&&player.holdTime<3?6:0);
    if(score>bestScore){bestScore=score;best=mate;}
  }
  return best||fallback;
}

export function ballIntercept(ball,seconds=.24){
  const point=predictBall(ball,seconds);
  return {x:clamp(point.x,-FIELD.halfLength+.8,FIELD.halfLength-.8),
    z:clamp(point.z,-FIELD.halfWidth+.8,FIELD.halfWidth-.8)};
}

export function updateAI(match,dt){
  const b=match.ball,owner=b.owner,possession=owner?.team??b.pass?.team;
  match.tacticalTime=(match.tacticalTime||0)+dt;
  if(match.kickoffAttack&&(match.elapsed>match.kickoffAttack.until||possession===0))match.kickoffAttack=null;
  for(const p of match.players)p.watch(b);
  for(let team=0;team<2;team++){
    const direction=match.direction(team),squad=match.active(team),field=squad.filter(p=>p.role!=='GK');
    const config=match.aiConfig(team);
    const defense=possession===team?{chasers:[],marks:new Map(),doubleTeam:false}:defensiveShape(match,team,field,b);
    const {chasers,marks}=defense;
    for(const p of squad){
      if(match.phase!=='playing')return;
      if(match.isHumanControlled(p))continue;
      if(p.striking){p.move(0,0,0,dt);continue;}
      const home=match.formations?.[p.team]?.[p.slot]||FORMATION[p.slot];let tx=home.x*direction,tz=home.z,sprint=false,pace=1;
      if(p.role==='GK'){updateKeeper(match,p,dt);continue;
      }else if(owner===p){
        const goalDistance=FIELD.halfLength-p.x*direction;
        const defenders=match.active(1-team).filter(o=>distance(p,o)<5);
        tx=direction*FIELD.halfLength;tz=clamp(p.z*(goalDistance<28?.62:.9),-FIELD.halfWidth*.8,FIELD.halfWidth*.8);
        const forward=normalize(tx-p.x,tz-p.z);let avoidX=0,avoidZ=0;
        for(const defender of defenders){
          const dx=defender.x-p.x,dz=defender.z-p.z,dist=Math.hypot(dx,dz);
          if(dx*forward.x+dz*forward.z>-.4){const side=forward.x*dz-forward.z*dx>=0?-1:1,weight=clamp((5-dist)/5,0,1)*1.2;avoidX+=-forward.z*side*weight;avoidZ+=forward.x*side*weight;}
        }
        p.move(forward.x+avoidX,forward.z+avoidZ,defenders.length?.82:1,dt,defenders.length===0&&goalDistance>u(8)&&p.holdTime>.5);
        if(p.decision<=0){
          p.decision=config.reaction*(.9+match.random()*.2)/(p.attributes.iq||1);
          const decision=attackingDecision(match,p,bestPass(match,p));
          if(decision==='shoot'||decision==='surprise-shot'){
            const power=decision==='surprise-shot'?.92:clamp(.36+goalDistance/65,.4,.92);
            match.requestShot(p,power,null,{curve:decision!=='surprise-shot'&&goalDistance>16&&Math.abs(p.z)>6&&Math.abs(p.z)<FIELD.boxHalf});
          }else if(decision==='pass')match.requestPass(p);
          else if(decision==='clear')match.requestPass(p,{x:direction,z:0},{firstTime:true});
          else if(decision==='skill')match.skill(p,{...normalize(direction,-Math.sign(p.z)*.7),intensity:1});
        }
        continue;
      }else if(b.pass?.target===p){
        const point=ballIntercept(b,clamp(distance(p,b)/PLAY.runSpeed*.25,.15,.65));
        const meetAtTarget=(b.y>2||distance(p,b)>u(7))&&Math.hypot(b.vx,b.vz)>8;
        tx=meetAtTarget?b.pass.x:point.x;tz=meetAtTarget?b.pass.z:point.z;sprint=distance(p,b)>u(5);
      }else if(chasers.includes(p)){
        const first=chasers[0]===p,point=ballIntercept(b);
        if(first){
          const target=owner?pressurePoint(match,team,p):point;tx=target.x;tz=target.z;
          const gap=distance(p,b),closingSpeed=owner?Math.hypot(owner.vx,owner.vz):0;
          sprint=gap>10||(gap>3.2&&closingSpeed>PLAY.runSpeed*.9)||(gap>4&&!owner);
          pace=sprint?1:gap<3.2?.60:Math.max(.76,Math.min(1,closingSpeed/PLAY.runSpeed+.08));
        }else{
          const cover=defense.doubleTeam?point:coverPoint(match,team,chasers[0]);tx=cover.x;tz=cover.z;
          const displaced=Math.hypot(tx-p.x,tz-p.z);
          sprint=displaced>10&&((p.x-b.x)*direction>0||!!owner?.boosting);pace=sprint?1:.70;
        }
        if((first||defense.doubleTeam)&&owner&&owner.team!==team&&distance(p,owner)<2.05&&distance(p,b)<1.8&&p.cooldown<=0&&p.decision<=0){
          p.decision=config.reaction;
          const approach=normalize(p.x-owner.x,p.z-owner.z);
          if(approach.x*owner.faceX+approach.z*owner.faceZ>-.3&&match.random()<config.pressure*(.55+config.awareness*.4))match.tackle(p,{standing:true});
        }
      }else if(possession===team){
        const progress=clamp(b.x*direction+u(14),-u(4),u(29));
        tx=clamp(home.x+progress*.7,-u(25),FIELD.halfLength-u(3))*direction;
        tz=clamp(home.z+(b.z-home.z)*.12,-FIELD.halfWidth+u(2),FIELD.halfWidth-u(2));
        if(p.role==='FWD'){
          tx=clamp(b.x*direction+u(11)*p.attributes.forwardRun,-u(4),FIELD.halfLength-u(2.5))*direction;
          const nearWing=Math.sign(home.z)===Math.sign(b.z),boxAttack=b.x*direction>FIELD.halfLength-FIELD.boxDepth*1.6;
          const lane=p.data.gameplayProfile?.preferredLane,preferredSide=lane==='left'?-direction:lane==='right'?direction:Math.sign(home.z)||1;
          tz=lane?preferredSide*(boxAttack?FIELD.goalHalf*.62:FIELD.halfWidth*.68):boxAttack?(nearWing?Math.sign(b.z)*FIELD.goalHalf*.6:-Math.sign(b.z||1)*FIELD.goalHalf*.8):home.z*1.85;
          tx-=u(1.5)*(1+Math.sin(match.tacticalTime*.6+p.slot));sprint=tx*direction-p.x*direction>u(6);
        }
        if(p.role==='MID'){
          const onBallSide=home.z*b.z>0,overlap=onBallSide&&owner?.role==='FWD'&&b.x*direction>0;
          tz=Math.sign(home.z)*FIELD.halfWidth*(overlap?.82:.67)+Math.sin(match.tacticalTime*.45+p.slot)*u(1.5);
          if(overlap)tx=clamp(b.x*direction+u(6),-u(20),FIELD.halfLength-u(4))*direction;
          else if(Math.abs(p.x-b.x)<u(5))tx=b.x-direction*u(6);
          sprint=overlap&&distance(p,b)>u(8);
        }
      }else{
        tx=clamp(home.x+b.x*direction*.32,-FIELD.halfLength+u(3),u(24))*direction;
        tz=clamp(home.z+b.z*.2,-FIELD.halfWidth+u(3),FIELD.halfWidth-u(3));
        const threat=marks.get(p);
        if(threat){
          const lead=.20+config.awareness*.20;
          const goalSide=normalize(-direction*FIELD.halfLength-threat.x,-threat.z);
          const markingGap=2.3+(1-config.awareness)*1.3;
          tx=threat.x+threat.vx*lead+goalSide.x*markingGap;
          tz=threat.z+threat.vz*lead+goalSide.z*markingGap;
        }
        const recovery=Math.hypot(tx-p.x,tz-p.z),runnerSpeed=threat?Math.hypot(threat.vx,threat.vz):0;
        sprint=recovery>10&&((p.x-b.x)*direction>3||runnerSpeed>6)||!!threat&&recovery>3&&runnerSpeed>PLAY.runSpeed*.95;
        pace=sprint?1:threat?clamp(runnerSpeed/PLAY.runSpeed+.14,.60,1):.68;
      }
      if(!chasers.includes(p)&&!marks.has(p)&&b.pass?.target!==p){
        // Far-side players keep adjusting their lane and depth throughout the match.
        tz+=Math.sin(match.tacticalTime*.4+p.slot+team)*u(p.role==='DEF'?1.2:.75);
        tx+=Math.sin(match.tacticalTime*.28+p.slot+team)*u(p.role==='DEF'?1.4:.9)*direction;
      }
      tx=clamp(tx,-FIELD.halfLength+.7,FIELD.halfLength-.7);tz=clamp(tz,-FIELD.halfWidth+.7,FIELD.halfWidth-.7);
      const direct=chasers.includes(p)||b.pass?.target===p;
      if(!p.aiTarget)p.aiTarget={x:tx,z:tz};
      const organizer=squad.find(m=>m!==p&&m.data.gameplayProfile?.tendencies?.organizer);
      if(organizer&&!direct){tx+=(home.x*direction-tx)*.08;tz+=(home.z-tz)*.08;}
      const blend=1-Math.exp(-(direct?18:organizer?5.8:5)*dt);p.aiTarget.x+=(tx-p.aiTarget.x)*blend;p.aiTarget.z+=(tz-p.aiTarget.z)*blend;
      tx=p.aiTarget.x;tz=p.aiTarget.z;const gap=Math.hypot(tx-p.x,tz-p.z);
      let sx=0,sz=0;
      for(const mate of squad){
        if(mate===p)continue;const dist=distance(p,mate),space=possession!==team?2.1:PLAY.supportGap;
        if(dist<space&&dist>.01){sx+=(p.x-mate.x)/dist*(space-dist);sz+=(p.z-mate.z)/dist*(space-dist);}
      }
      p.move(tx-p.x+sx,tz-p.z+sz,Math.min(pace,Math.hypot(tx-p.x+sx,tz-p.z+sz)/(direct?2:3)),dt,sprint,((possession!==team&&!sprint)||(b.pass?.target===p&&distance(p,b)<12))?b:null);
    }
  }
}
