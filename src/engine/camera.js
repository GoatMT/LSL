import {sidelineCamera} from './sideline.js';
import * as T from '../../vendor/three.module.js';
import {FIELD,clamp,distance} from '../config.js';
import { INTRO,introPlayer } from '../presentation.js';
import {applyReplayCamera} from '../match/replay.js';
import { mobileLens } from './viewport.js';
export const CAMERA_MODES=Object.freeze({
  low:{height:31,back:29},medium:{height:49,back:44},high:{height:73,back:58},broadcast:{height:44,back:54},mobile:{height:32,back:30}
});
export class BroadcastCamera{
  constructor(camera){this.camera=camera;this.look=new T.Vector3();this.target=new T.Vector3();this.position=new T.Vector3(64,43,91);this.compact=false;this.introDestination=new T.Vector3();this.replayCelebrationPosition=new T.Vector3();this.replayCelebrationTarget=new T.Vector3();this.replayPosition=new T.Vector3();this.replayTarget=new T.Vector3();camera.position.copy(this.position);}
  update(dt,time,match){
    const aspect=this.camera.aspect;let fov=49;
    if(!match||match.phase==='home'){
      this.position.set(58+Math.sin(time*.045)*13,39+Math.sin(time*.04)*3,85+Math.cos(time*.045)*10);this.target.set(-4,2,-8);fov=53;
    }else{
      const b=match.ball,p=match.controlled,mode=CAMERA_MODES[match.settings.camera]||CAMERA_MODES.medium;
      const x=clamp(b.x*.84+(p?.x||0)*.13+clamp(b.vx*.11,-3.5,3.5),-FIELD.halfLength+5,FIELD.halfLength-5);
      const z=clamp(b.z*.83,-FIELD.halfWidth*.9,FIELD.halfWidth*.9);
      const mates=match.active(p?.team??0).filter(m=>m!==p&&m.role!=='GK').sort((a,c)=>distance(a,b)-distance(c,b));
      const spread=mates[2]?distance(mates[2],b):24;
      const zoom=clamp((spread-20)*.17,0,10)+clamp(Math.hypot(b.vx,b.vz)*.13,0,6)+Math.min(b.y,8)*.3;
      const portrait=aspect<1.3?1.45:1,wide=this.compact&&aspect>1.3?.88:aspect>1.9?.95:1;
      this.position.set(x,(mode.height+zoom)*portrait*wide,z+(mode.back+zoom*.7)*portrait*wide);this.target.set(x,0,z);
      if(match.settings.camera==='broadcast'){
        const midfield=1-Math.abs(x)/FIELD.halfLength;
        this.position.set(x,(mode.height+midfield*5+zoom*.45)*portrait*wide,z+(mode.back+zoom*.45)*portrait*wide);
        this.target.set(x,.4,b.z*.91);
      }
      if(match.settings.camera==='mobile'){
        const vertical=aspect<1.3,scale=vertical?1.24:1,edge=vertical?8:16;
        const focus=match.manualKeeper&&p?p:b;
        const mx=clamp(focus.x+clamp(((p?.x??b.x)-focus.x)*.18,-5,5)+clamp(b.vx*.12,-3,3),-FIELD.halfLength+edge,FIELD.halfLength-edge);
        const mz=clamp(focus.z+clamp(((p?.z??b.z)-focus.z)*.15,-3,3),-FIELD.halfWidth+2,FIELD.halfWidth-2);
        const pullback=clamp((spread-18)*.13,0,8)+clamp(Math.hypot(b.vx,b.vz)*.07,0,3)+Math.min(b.y,6)*.25;
        this.position.set(mx,(mode.height+pullback)*scale,mz+(mode.back+pullback*.6)*scale);
        // Keep play above the bottom thumb controls without rotating movement axes.
        this.target.set(mx,.35,mz+(vertical?4:3));fov=vertical?59:52;
      }
      if(match.phase==='intro'){
        const t=match.phaseTime;
        this.position.set(48-Math.min(t,14)*2.5,aspect<1.4?92:47,aspect<1.4?99:83);this.target.set(0,1,-3);fov=53;
        const featured=introPlayer(match);
        if(featured){this.position.set(featured.x-6,5.3,featured.z+11);this.target.set(featured.x-(aspect>1.3?2.1:0),1.6,featured.z);fov=44;}
        // The broadcast reveals both formations, then blends into the saved view.
        if(t>INTRO.duration-2.5){const f=clamp((t-(INTRO.duration-2.5))/2.5,0,1);this.introDestination.set(0,mode.height*portrait*wide,mode.back*portrait*wide);this.position.lerp(this.introDestination,f);}
      }
      if(match.phase==='goal')fov=applyReplayCamera(match,this);
      if(['halftime','fulltime'].includes(match.phase)){
        this.position.set(Math.sin(time*.035)*12,43,77);this.target.set(0,0,-3);fov=53;
      }
      if(match.phase==='restart'&&match.restart){
        const r=match.restart,d=match.direction(r.team);
        if(r.type==='PENALTY'){
          if(r.team!==(match.localTeam??0)){const goalX=d*FIELD.halfLength;this.position.set(goalX+d*8,7.2,0);this.target.set(r.x,1.5,0);fov=43;}
          else{this.position.set(r.x-d*19,10,r.z+13);this.target.set(r.x+d*10,1.5,0);fov=48;}
        }
        else if(r.type==='CORNER'){const cx=r.x-d*12;this.position.set(cx,49,r.z+(r.z>0?26:50));this.target.set(cx,0,r.z*.52);}
        else if(r.type==='FREE KICK'&&FIELD.halfLength-r.x*d<42){this.position.set(r.x-d*19,25,r.z+27);this.target.set(r.x+d*12,0,r.z*.6);}
        else if(r.type==='KICK OFF'){this.position.set(0,mode.height*portrait*wide,mode.back*portrait*wide);this.target.set(0,.4,0);}
        if(match.settings.camera==='mobile'&&r.type==='CORNER'){
          const scale=aspect<1.3?1.3:1;
          this.position.set(r.x,39*scale,r.z+36*scale);this.target.set(r.x-d*3,.35,r.z+2);fov=aspect<1.3?59:52;
        }
        if(match.phase!=='playing'&&match.moment?.player&&match.moment.type!=='miss'){
          const focus=match.moment.player;this.position.set(focus.x-7,5,focus.z+10);this.target.set(focus.x,2,focus.z);fov=45;
        }
      }
    }
    if(match?.sideline){const blend=sidelineCamera(this,match.sideline);fov+=(43-fov)*blend;}
    if(this.compact||match?.settings.camera==='mobile'){
      const lens=mobileLens(fov,aspect);
      // Pull back by the matching amount so teammates stay in view without a wide-angle lens.
      this.position.sub(this.target).multiplyScalar(lens.distanceScale).add(this.target);fov=lens.fov;
    }
    const blend=1-Math.exp(-Math.min(dt,.1)*(match?.sideline&&match.sideline.time>=match.sideline.duration?6:match?.phase==='playing'?(match.settings.camera==='mobile'?4.4:3.6):2.1));
    this.camera.position.lerp(this.position,blend);this.look.lerp(this.target,blend);this.camera.lookAt(this.look);
    if(Math.abs(this.camera.fov-fov)>.015){this.camera.fov+=(fov-this.camera.fov)*blend;this.camera.updateProjectionMatrix();}
  }
}
