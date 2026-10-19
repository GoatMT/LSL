import * as T from '../../vendor/three.module.js';

export const MATCH_LIGHTING=Object.freeze({
  day:{top:'#5b97c2',horizon:'#cddfe4',fog:'#b6cbd0',ground:'#43513b',sun:'#fff2d8',sunPower:3.2,ambient:1.5,fill:.42,exposure:1.03,position:[-65,110,-45],night:0},
  evening:{top:'#304d72',horizon:'#d9a58a',fog:'#8c929d',ground:'#343c37',sun:'#ffcf96',sunPower:3.1,ambient:1.18,fill:.72,exposure:1.12,position:[-80,64,-68],night:.2},
  night:{top:'#060f21',horizon:'#253f59',fog:'#13293c',ground:'#253830',sun:'#e4f0ff',sunPower:3.4,ambient:.98,fill:1.15,exposure:1.18,position:[-38,88,28],night:1}
});

export class MatchLighting{
  constructor(scene){
    this.scene=scene;
    this.hemisphere=new T.HemisphereLight('#dceafa','#3a4531',1.4);
    this.sun=new T.DirectionalLight('#fff2de',3);this.sun.castShadow=true;
    Object.assign(this.sun.shadow.camera,{left:-52,right:52,top:52,bottom:-52,near:1,far:245});
    this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.045;this.sun.shadow.radius=3;
    this.fill=new T.DirectionalLight('#b3d7f2',.5);this.fill.position.set(45,45,-20);
    scene.add(this.hemisphere,this.sun,this.sun.target,this.fill);
    const uniforms={top:{value:new T.Color()},horizon:{value:new T.Color()},sunColor:{value:new T.Color()},sunDirection:{value:new T.Vector3()},night:{value:0}};
    this.sky=new T.Mesh(new T.SphereGeometry(420,32,16),new T.ShaderMaterial({
      uniforms,side:T.BackSide,depthWrite:false,
      vertexShader:'varying vec3 skyDirection; void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform vec3 top;uniform vec3 horizon;uniform vec3 sunColor;uniform vec3 sunDirection;uniform float night;varying vec3 skyDirection;
      void main(){vec3 d=normalize(skyDirection);float h=clamp(d.y,0.0,1.0);vec3 color=mix(horizon,top,pow(h,.55));
        float sun=max(dot(d,sunDirection),0.0);color+=sunColor*(pow(sun,800.0)*1.4+pow(sun,14.0)*.13)*(1.0-night);
        float cloud=sin(d.x*18.0+d.z*7.0)*sin(d.z*25.0-d.y*15.0);color=mix(color,horizon,smoothstep(.38,.8,cloud)*.12*(1.0-night)*smoothstep(.0,.2,h));
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    }));
    this.sky.frustumCulled=false;scene.add(this.sky);scene.fog=new T.Fog('#8c929d',185,370);
    this.offset=new T.Vector3();this.focus=new T.Vector3();this.destination=new T.Vector3();this.set('evening');
  }
  set(name){
    this.name=Object.hasOwn(MATCH_LIGHTING,name)?name:'evening';const base=MATCH_LIGHTING[this.name],p={...base},u=this.sky.material.uniforms;
    const weather=this.weather||'clear';
    if(weather!=='clear'){
      const night=this.name==='night';
      p.top=night?'#101c2c':weather==='snow'?'#849ba8':'#586e7c';
      p.horizon=night?'#304351':weather==='snow'?'#d0dde0':'#a4b4bb';p.fog=p.horizon;
      p.sunPower*=weather==='rain'?.55:.66;p.ambient*=1.12;p.sun=night?'#e4f0ff':'#e4edf2';
    }
    this.scene.fog.near=weather==='snow'?135:weather==='rain'?155:185;this.scene.fog.far=weather==='clear'?370:320;
    u.top.value.set(p.top);u.horizon.value.set(p.horizon);u.sunColor.value.set(p.sun);u.sunDirection.value.set(...p.position).normalize();u.night.value=this.weather&&this.weather!=='clear'?1:p.night;
    this.scene.fog.color.set(p.fog);this.hemisphere.color.set(p.night===1?'#becfee':'#dceafa');this.hemisphere.groundColor.set(p.ground);this.hemisphere.intensity=p.ambient;
    this.sun.color.set(p.sun);this.sun.intensity=p.sunPower;this.offset.set(...p.position);this.fill.intensity=p.fill;
    this.sun.position.copy(this.offset);return p;
  }
  update(dt,ball){
    // One shadow map follows play; static architecture does not need four costly floodlight shadows.
    const x=Math.max(-36,Math.min(36,ball?.x||0)),z=Math.max(-15,Math.min(15,ball?.z||0));
    this.destination.set(x,0,z);this.focus.lerp(this.destination,1-Math.exp(-dt*2));this.sun.target.position.copy(this.focus);this.sun.position.copy(this.focus).add(this.offset);
  }
}
