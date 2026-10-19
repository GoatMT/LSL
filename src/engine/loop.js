// Physics uses a fixed 120 Hz step. Rendering can run at any display refresh rate.
export class GameLoop{
  constructor(update,render){this.update=update;this.render=render;this.last=0;this.acc=0;this.fps=60;this.id=0;}
  start(){
    const tick=now=>{
      const raw=this.last?(now-this.last)/1000:1/60;this.last=now;
      const dt=Math.min(raw,.1);this.fps=this.fps*.96+(1/Math.max(raw,.001))*.04;this.acc+=dt;
      let steps=0;while(this.acc>=1/120&&steps<12){this.update(1/120,steps===0);this.acc-=1/120;steps++;}
      this.render(dt);this.id=requestAnimationFrame(tick);
    };this.id=requestAnimationFrame(tick);
  }
  stop(){cancelAnimationFrame(this.id);}
}

