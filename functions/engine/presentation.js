// All presentation timing uses real seconds and is excluded from active match time.
export const INTRO=Object.freeze({versus:3.5,user:7,cpu:28,watch:49,walk:54,duration:60,playerSeconds:3});
export const PRESENTATION=Object.freeze({goal:17.2,replay:4.5,replayLead:8.5,replayTransition:.8,foul:4,card:5.5,injury:4.5,substitution:5});
export const introStage=t=>t<INTRO.versus?'stadium':t<INTRO.user?'versus':t<INTRO.cpu?'user':t<INTRO.watch?'cpu':t<INTRO.walk?'watch':'walk';
export function introPlayer(match){
  const stage=introStage(match.phaseTime);if(stage!=='user'&&stage!=='cpu')return null;
  const team=stage==='user'?0:1,index=Math.min(6,Math.floor((match.phaseTime-INTRO[stage])/INTRO.playerSeconds));
  return match.active(team)[index]||null;
}
export const restartPresentation=type=>({'KICK OFF':1.2,'THROW-IN':1.6,'GOAL KICK':2,'CORNER':3,'FREE KICK':3.5,'PENALTY':4}[type]||2);
