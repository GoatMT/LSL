import {SidelineCast} from './sideline.js';
import {SidelineOverlay} from '../ui/sideline.js';
import {MatchWeather} from './weather.js';
import * as T from '../../vendor/three.module.js';
import { Stadium } from './stadium.js';
import { canvasSize } from './viewport.js';
import { PlayerModel,createBallMesh } from './models.js';
import { BroadcastCamera } from './camera.js';
import { MatchLighting } from './lighting.js';
import { FIELD,PLAYER_VISUAL_SCALE,fieldUnits as u } from '../config.js';
export class GameRenderer{
  constructor(canvas,settings){
    this.canvas=canvas;this.scene=new T.Scene();this.adaptiveScale=1;
    this.renderer=new T.WebGLRenderer({canvas,antialias:settings.graphics!=='low',alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.setClearColor(0x102f3a,1);this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.camera=new T.PerspectiveCamera(49,innerWidth/innerHeight,.2,u(260));this.broadcast=new BroadcastCamera(this.camera);
    this.weather=new MatchWeather(this.scene);this.lighting=new MatchLighting(this.scene);this.sun=this.lighting.sun;
    this.sidelineCast=new SidelineCast(this.scene);this.sidelineOverlay=new SidelineOverlay(()=>this.onSkipSideline?this.onSkipSideline():this.match?.skipSideline());this.stadium=new Stadium(this.scene,settings.venue);this.models=[];this.ballMesh=createBallMesh();this.scene.add(this.ballMesh);
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const shadowContext=shadowCanvas.getContext('2d'),gradient=shadowContext.createRadialGradient(32,32,3,32,32,32);gradient.addColorStop(0,'rgba(3,12,10,.7)');gradient.addColorStop(.35,'rgba(3,12,10,.35)');gradient.addColorStop(1,'rgba(3,12,10,0)');shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,64,64);
    this.ballShadow=new T.Mesh(new T.PlaneGeometry(1.35,1.35),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));this.ballShadow.rotation.x=-Math.PI/2;this.scene.add(this.ballShadow);
    this.time=0;this.quality=settings.graphics;this.applyGraphics(settings.graphics);this.setLighting(settings.lighting||'evening');this.setWeather(settings.weather);this.resize();
    this.onResize=()=>this.resize();addEventListener('resize',this.onResize);
    globalThis.visualViewport?.addEventListener('resize',this.onResize);
    if(typeof ResizeObserver!=='undefined'){this.resizeObserver=new ResizeObserver(this.onResize);this.resizeObserver.observe(canvas);}
    this.projectVector=new T.Vector3();
    const aimGeometry=new T.BufferGeometry();aimGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(6),3));
    this.aimLine=new T.Line(aimGeometry,new T.LineDashedMaterial({color:'#f2e7a6',dashSize:.6,gapSize:.35,transparent:true,opacity:.8}));
    this.scene.add(this.aimLine);this.aimLine.visible=false;
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();document.dispatchEvent(new CustomEvent('game-context-lost'));});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());
  }
  applyGraphics(level){this.quality=level;this.weather.set(this.weather.kind,level);this.adaptiveScale=1;this.renderer.shadowMap.enabled=level!=='low';this.sun.shadow.mapSize.set(level==='high'?2048:1024,level==='high'?2048:1024);if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}this.stadium.quality(level,this.renderer.capabilities.getMaxAnisotropy());this.resize();}
  setLighting(name){const preset=this.lighting.set(name);this.renderer.toneMappingExposure=preset.exposure;this.stadium.setLighting(this.lighting.name);}
  setVenue(name){this.stadium.setVenue(name);}
  setWeather(name){this.weather.set(name,this.quality);this.lighting.weather=this.weather.kind;this.setLighting(this.lighting.name);}
  resize(){
    const {width:w,height:h}=canvasSize(this.canvas,globalThis.innerWidth,globalThis.innerHeight);
    const ratio=Math.min(globalThis.devicePixelRatio||1,this.quality==='low'?1:this.quality==='medium'?1.35:1.75)*this.adaptiveScale;
    if(w===this.viewportWidth&&h===this.viewportHeight&&ratio===this.pixelRatio)return false;
    const rotated=this.viewportWidth&&((w>h)!==(this.viewportWidth>this.viewportHeight));
    this.viewportWidth=w;this.viewportHeight=h;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    this.compact=w<1050||h<550;this.actorScale=this.compact?PLAYER_VISUAL_SCALE.compact:PLAYER_VISUAL_SCALE.desktop;this.broadcast.compact=this.compact;this.sidelineCast?.setVisualScale(this.actorScale);
    for(const model of [...(this.models||[]),...(this.ref?[this.ref]:[])])model.setVisualScale(this.actorScale);
    if(ratio!==this.pixelRatio){this.renderer.setPixelRatio(ratio);this.pixelRatio=ratio;}
    this.renderer.setSize(w,h,false);
    if(rotated&&typeof document!=='undefined')document.dispatchEvent(new Event('game-viewport-changed'));
    return true;
  }
  adaptPerformance(fps,dt){
    if(!this.compact)return;
    this.slowFrames=fps<42?(this.slowFrames||0)+dt:Math.max(0,(this.slowFrames||0)-dt*.5);
    if(this.slowFrames>3&&this.adaptiveScale>.76){this.adaptiveScale=Math.max(.75,this.adaptiveScale-.1);this.slowFrames=0;this.resize();}
  }
  playerLabelHeight(){return 3.1*this.actorScale;}
  setMatch(match){
    this.match=match;this.sidelineCast.setMatch(match,this.actorScale);
    for(const model of this.models){this.scene.remove(model.root);model.dispose();}this.models=[];
    for(const p of match.players){const m=new PlayerModel(p,match.teams[p.team].uniform||match.teams[p.team].kit);m.setVisualScale(this.actorScale);this.models.push(m);this.scene.add(m.root);}
    if(this.ref){this.scene.remove(this.ref.root);this.ref.dispose();}
    this.ref=new PlayerModel(match.referee,'#ffe554',true);this.ref.setVisualScale(this.actorScale);this.scene.add(this.ref.root);
    this.setVenue(match.settings.venue);this.setLighting(match.settings.lighting);this.setWeather(match.settings.weather);this.stadium.score(0,0);
    this.stadium.setTeams(match.teams);
  }
  refreshPlayer(player,match){
    const index=this.models.findIndex(m=>m.player===player);if(index<0)return;
    const old=this.models[index];this.scene.remove(old.root);old.dispose();
    const model=new PlayerModel(player,match.teams[player.team].uniform||match.teams[player.team].kit);model.setVisualScale(this.actorScale);this.models[index]=model;this.scene.add(model.root);
  }
  render(dt,match){
    this.resize();this.sidelineOverlay.update(match);
    this.time+=dt;this.broadcast.update(dt,this.time,match);this.lighting.update(dt,match?.ball);this.weather.update(dt,this.broadcast.target);
    this.sidelineCast.update(dt,this.time,match,this.quality,this.camera);
    for(const model of this.models){
      model.update(this.time,match?.controlled===model.player&&!['home','intro','goal','outro'].includes(match?.phase),dt,this.quality,this.camera.position.distanceTo(model.root.position));
    }
    if(this.ref)this.ref.update(this.time,false,dt,this.quality,this.camera.position.distanceTo(this.ref.root.position));
    if(match){
      const b=match.ball,height=b.owner&&b.controlMode==='hands'?b.y*this.actorScale/1.13:b.y;this.ballMesh.position.set(b.x,height,b.z);this.ballMesh.rotation.set(b.rollX,b.rotationY,b.rollZ);
      this.ballShadow.position.set(b.x,.027,b.z);this.ballShadow.scale.setScalar(1+Math.min(height,6)*.1);this.ballShadow.material.opacity=Math.max(.2,1-height*.07);
      this.stadium.update(this.time,match);
      this.aimLine.visible=(match.phase==='restart'&&match.restart?.team===(match.localTeam||0))||match.charge>0;
      if(this.aimLine.visible){const a=this.aimLine.geometry.attributes.position;a.array.set([b.x,.18,b.z,match.direction(match.localTeam||0)*FIELD.halfLength,.18,match.aimZ]);a.needsUpdate=true;this.aimLine.computeLineDistances();this.aimLine.geometry.computeBoundingSphere();}
    }
    this.renderer.render(this.scene,this.camera);
  }
  project(x,y,z){this.projectVector.set(x,y,z).project(this.camera);return {x:(this.projectVector.x*.5+.5)*this.viewportWidth,y:(-.5*this.projectVector.y+.5)*this.viewportHeight,visible:this.projectVector.z>-1&&this.projectVector.z<1};}
}
