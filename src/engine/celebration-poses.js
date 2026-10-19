const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const pulse=(t,start,length)=>Math.sin(clamp((t-start)/length)*Math.PI);

// Original joint choreography: settle, gesture, hold, recover. No sampled motion assets.
export function celebrationPose(a,name,t,seconds,context={}){
  const stand=ease((t-.10)/.1),recover=1-ease((t-.8)/.2);
  a.pitch=0;a.roll=0;
  if(name.includes('slide')){
    const down=ease((t-.10)/.13)*recover;
    a.y=-.59*down;a.lk=a.rk=1.8*down;a.llX=a.rlX=-.25*down;
    a.pitch=(name==='celebrate-backward-slide'?-.24:-.12)*down;
    a.laZ=-1.2*down;a.raZ=1.2*down;a.le=a.re=.16;
    if(name==='celebrate-double-slide'){a.raX=-.65*down;a.re=.75*down;}
  }else if(name==='celebrate-jump'||name==='celebrate-high-jump'){
    const high=name==='celebrate-high-jump',crouch=pulse(t,.10,.12),air=pulse(t,.22,high?.19:.15),land=pulse(t,high?.41:.37,.12);
    a.y=(high?.87:.50)*air-.14*(crouch+land);a.lk=a.rk=.6*crouch+.4*air+.7*land;
    a.llX=a.rlX=-.22*(crouch+land);a.laX=-1.7*air;a.raX=-2.4*air;a.re=.65;
    const finish=ease((t-.46)/.12)*recover;
    if(high){a.laZ=-.85*finish;a.raZ=.85*finish;a.llZ=-.15*finish;a.rlZ=.15*finish;a.yaw=t>=.41?0:Math.PI*2*ease((t-.23)/.18);a.headPitch=-.08*finish;}
    else{a.raX-=2*finish;a.re=1.15*finish;a.laZ=-.25*finish;}
  }else if(name==='celebrate-arms'||name==='celebrate-late-winner'){
    a.laZ=-1.5*stand*recover;a.raZ=1.5*stand*recover;a.le=a.re=.1;
    if(name==='celebrate-late-winner'){a.raX=-.45*stand;a.headPitch=-.15;}
  }else if(name==='celebrate-point'||name==='wave'){
    a.raX=-1.8*stand*recover;a.raZ=.2;a.re=.08;a.headYaw=.18;
  }else if(name==='celebrate-badge'||name==='celebrate-captain'){
    a.raX=-.9*stand*recover;a.raZ=-.35*stand;a.re=1.5*stand;a.headPitch=.15*stand;
    if(name==='celebrate-captain'){a.laZ=-.7*stand;a.le=1.1*stand;a.raX=-1.15*stand;a.headPitch=-.08;}
  }else if(name==='celebrate-crossed'){
    a.laX=-1.5*stand;a.raX=-1.4*stand;a.laZ=.9*stand;a.raZ=-.9*stand;
    a.laY=stand;a.raY=-stand;a.le=a.re=.9*stand;a.headPitch=-.1;
  }else if(name==='celebrate-spin'){
    a.yaw=t>=.54?0:Math.PI*2*ease((t-.16)/.38);a.laZ=-1.2*stand*recover;a.raZ=1.2*stand*recover;
    a.llX=Math.sin(t*26)*.16*recover;a.rlX=-a.llX;a.lk=a.rk=.14;
  }else if(name==='celebrate-hug'||name==='celebrate-hug-mate'||name==='celebrate-late-winner-mate'){
    a.laX=a.raX=-.95*stand;a.laZ=-.48*stand;a.raZ=.48*stand;a.le=a.re=.6;a.pitch=.06;
  }else if(name==='celebrate-pile'||name==='celebrate-pile-mate'){
    const down=stand*recover;a.y=-.36*down;a.lk=a.rk=.9*down;a.llX=a.rlX=-.4*down;a.pitch=.18*down;
    a.laX=a.raX=-1.1*down;a.laZ=-.6*down;a.raZ=.6*down;a.le=a.re=.6;
    if(name==='celebrate-pile-mate'){a.y+=pulse(t,.13+(context.index||0)*.025,.2)*.18;a.pitch=.35*down;}
  }else if(name==='celebrate-calm'){
    a.laZ=-.18;a.raZ=.18;a.le=a.re=.15;a.headPitch=-.07;
  }else{
    const pump=pulse(t,.2,.2)+pulse(t,.49,.2);a.raX=-1.8*stand*recover-.5*pump;a.re=.8+.5*pump;a.laZ=-.3;
  }
  return a;
}
