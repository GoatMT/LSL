import * as T from '../../vendor/three.module.js';
import {weatherOption} from '../weather-options.js';

// One draw call, bounded particles, no textures or postprocessing on mobile.
export class MatchWeather{
  constructor(scene){
    this.scene=scene;this.kind='clear';this.count=0;this.time=0;
    this.positions=new Float32Array(900*3);this.seeds=new Float32Array(900*3);
    let seed=21917;for(let i=0;i<this.seeds.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;this.seeds[i]=(seed>>>0)/4294967296;}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{snow:{value:0},alpha:{value:.5}},
      vertexShader:'uniform float snow; void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=mix(5.,4.,snow)*clamp(30./max(5.,-p.z),.65,2.);}',
      fragmentShader:'uniform float snow; uniform float alpha; void main(){vec2 p=gl_PointCoord-.5;float flake=1.-smoothstep(.22,.5,length(p));float rain=(1.-smoothstep(.03,.15,abs(p.x+p.y*.18)))*(1.-smoothstep(.3,.5,abs(p.y)));gl_FragColor=vec4(mix(vec3(.68,.83,.9),vec3(.96,.98,1.),snow),mix(rain,flake,snow)*alpha);}'
    });
    this.particles=new T.Points(geometry,this.material);this.particles.frustumCulled=false;this.particles.visible=false;scene.add(this.particles);
  }
  set(kind,quality='medium'){
    this.kind=weatherOption(kind);this.quality=quality;this.count=quality==='low'?160:quality==='high'?900:420;
    this.particles.geometry.setDrawRange(0,this.count);this.particles.visible=['rain','snow'].includes(this.kind);
    this.material.uniforms.snow.value=this.kind==='snow'?1:0;this.material.uniforms.alpha.value=quality==='low'?.35:.48;
  }
  update(dt,focus){
    if(!this.particles.visible)return;this.time+=dt;
    const snow=this.kind==='snow',speed=snow?2.2:22;
    // World-stable wrapping avoids precipitation snapping when the broadcast pans.
    const x=focus?.x||0,z=focus?.z||0,wrap=(n,w)=>((n%w)+w)%w;
    for(let i=0;i<this.count;i++){
      const k=i*3,s=this.seeds;
      this.positions[k]=x+wrap(s[k]*80+this.time*(snow?.5:2)-x+40,80)-40+(snow?Math.sin(this.time+i)*.3:0);
      this.positions[k+1]=wrap(s[k+1]*26-this.time*speed,26)+.2;
      this.positions[k+2]=z+wrap(s[k+2]*64-z+32,64)-32;
    }
    this.particles.geometry.attributes.position.needsUpdate=true;
  }
  dispose(){this.scene.remove(this.particles);this.particles.geometry.dispose();this.material.dispose();}
}
