const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function staffPose(a,name,t,seconds){
  const weight=smooth(t/.14)*(1-smooth((t-.82)/.18)),beat=Math.sin(seconds*4.3),listenBeat=Math.max(0,Math.sin(seconds*2.8));
  a.pitch=.03;a.laZ=-.10;a.raZ=.10;a.le=.35;a.re=.35;
  if(name==='staff-instructions'){const point=Math.sin(seconds*1.7)>-.15;a.raX=(point?-1.42:-.62)*weight;a.raZ=(point?.3:.7)*weight;a.re=point?.12:.62;a.laX=-.2*weight;a.le=.85;a.headYaw=Math.sin(seconds*1.3)*.16;}
  if(name==='staff-talk'){a.laX=(-.62+beat*.12)*weight;a.le=(.78+listenBeat*.15)*weight;a.raX=(-.9+Math.sin(seconds*3.2)*.24)*weight;a.re=(.75+beat*.2)*weight;a.raZ=(.2+beat*.1)*weight;a.headPitch=beat*.045;a.headYaw=Math.sin(seconds*1.1)*.14;}
  if(name==='staff-listen'){a.laX=-.62*weight;a.le=1.18*weight;a.raX=-.25*weight;a.re=.45*weight;a.headPitch=(.08+listenBeat*.075)*weight;a.headYaw=Math.sin(seconds*1.2)*.09;}
  if(name==='staff-shout'){a.laX=(-1.5+beat*.09)*weight;a.raX=(-1.45-beat*.09)*weight;a.le=a.re=1.65*weight;a.laZ=-.32*weight;a.raZ=.32*weight;a.pitch=.16*weight;a.headPitch=-.13*weight;a.headYaw=Math.sin(seconds*1.8)*.07;}
  if(name==='staff-argue'){a.laX=(-.72+beat*.18)*weight;a.raX=(-.9-beat*.18)*weight;a.laZ=(-.48+beat*.1)*weight;a.raZ=(.48-beat*.1)*weight;a.le=(.85+listenBeat*.22)*weight;a.re=(.9+listenBeat*.2)*weight;a.headYaw=beat*.11;a.pitch=.055*weight;}
  if(name==='staff-welcome'){a.raX=-1.0*weight;a.raZ=.65*weight;a.re=.2;a.laX=-.15;}
  if(name==='staff-reflect'){a.raX=-.95*weight;a.re=1.7*weight;a.headPitch=.17*weight;a.laX=-.25;}
  if(name==='staff-applaud'){a.laX=a.raX=-1.1*weight;a.laY=.3*weight;a.raY=-.3*weight;a.laZ=(.17+beat*.08)*weight;a.raZ=(-.17-beat*.08)*weight;a.le=a.re=1.0*weight;}
  if(name==='staff-celebrate'){a.laX=-1.8*weight;a.raX=-2.1*weight;a.le=a.re=.6;a.y=Math.max(0,Math.sin(seconds*3))*.045*weight;}
}
