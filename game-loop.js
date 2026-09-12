// Simulation time advances only while active. There is no idle RAF polling and
// resuming never feeds the paused wall time into movement or effect timers.
export function createGameLoop({onFrame,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,wallNow=()=>performance.now()}){
 let running=false,handle=null,elapsed=0,resumedAt=0;
 const now=()=>elapsed+(running?wallNow()-resumedAt:0);
 const tick=()=>{handle=null;if(!running)return;onFrame(now());if(running)handle=requestFrame(tick);};
 return {
  get running(){return running;},now,
  start(){if(running)return;resumedAt=wallNow();running=true;handle=requestFrame(tick);},
  stop(){if(!running)return;elapsed=now();running=false;if(handle!==null)cancelFrame(handle);handle=null;}
 };
}
