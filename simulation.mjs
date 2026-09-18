import {LAUNCHER,clayHit} from './skeet.mjs';
export const LIMIT=27, SPEED=4.5;
export const TRAINING_TARGETS=[-4,0,4].map((x,i)=>({id:`target-${i}`,x,y:1.6,z:0,radius:.55}));
export function targetHit(origin,direction,target){
 const x=origin.x-target.x,y=origin.y-target.y,z=origin.z-target.z;
 const b=x*direction.x+y*direction.y+z*direction.z,c=x*x+y*y+z*z-target.radius**2,d=b*b-c;
 if(d<0)return Infinity;const t=-b-Math.sqrt(d);return t>0?t:Infinity;
}

export const PROJECTILE_SPEED=160;
export const FAN_INTERVAL=110,FAN_CLICK_WINDOW=300;
export function firingMode(now,lastShot,requestedFan){const fan=!!requestedFan&&lastShot>0&&now-lastShot<=650;return {fan,ready:now-lastShot>=(fan?FAN_INTERVAL:240)};}
export function resolveBarrelShot(player,data){
 const yaw=Number.isFinite(data.gunYaw)?data.gunYaw:player.gunYaw,pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,Number.isFinite(data.gunPitch)?data.gunPitch:player.gunPitch));
 let direction={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
 if(data.direction&&[data.direction.x,data.direction.y,data.direction.z].every(Number.isFinite)){
 const length=Math.hypot(data.direction.x,data.direction.y,data.direction.z);if(length<.9||length>1.1)return null;
 direction={x:data.direction.x/length,y:data.direction.y/length,z:data.direction.z/length};
 }
 let origin={x:player.x+direction.x*.76+Math.cos(yaw)*.19,y:player.y+1.27+direction.y*.76,z:player.z+direction.z*.76-Math.sin(yaw)*.19};
 if(data.muzzle){
 if(![data.muzzle.x,data.muzzle.y,data.muzzle.z].every(Number.isFinite)||Math.hypot(data.muzzle.x-player.x,data.muzzle.y-player.y-1.5,data.muzzle.z-player.z)>(player.weapon==='shotgun'?2.3:2))return null;
 origin={x:data.muzzle.x,y:data.muzzle.y,z:data.muzzle.z};
 }else if(data.muzzleOffset&&[data.muzzleOffset.x,data.muzzleOffset.y,data.muzzleOffset.z].every(Number.isFinite)&&Math.hypot(data.muzzleOffset.x,data.muzzleOffset.y,data.muzzleOffset.z)<=1.4){origin={x:player.x+data.muzzleOffset.x,y:player.y+1.5+data.muzzleOffset.y,z:player.z+data.muzzleOffset.z};}
 return {origin,direction};
}
export function projectileProgress(distance,seconds){return Math.min(1,Math.max(0,seconds)/Math.max(.05,distance/PROJECTILE_SPEED));}

export function predictionCorrection(predicted,authoritative){
 const x=authoritative.x-predicted.x,z=authoritative.z-predicted.z;
 // Normal 20 Hz packet timing must not tug the local player backward.
 const length=Math.hypot(x,z),excess=Math.max(0,length-.3);
 // Fade the correction in with a zero slope at the tolerance boundary rather
 // than switching a full correction on and off as packets fluctuate around it.
 const scale=length>0?excess*excess/(excess+.2)/length:0;
 return {x:x*scale,z:z*scale};
}
export function settlePrediction(position,error,dt){
 const length=Math.hypot(error.x,error.z),gain=length>0?Math.min(4,.75/length):0,blend=1-Math.exp(-10*dt);
 position.correctionVX=((position.correctionVX||0)+(error.x*gain-(position.correctionVX||0))*blend);
 position.correctionVZ=((position.correctionVZ||0)+(error.z*gain-(position.correctionVZ||0))*blend);
 const dx=position.correctionVX*dt,dz=position.correctionVZ*dt;
 position.x+=dx;position.z+=dz;error.x-=dx;error.z-=dz;
}
const arenaBoxes=[{x:0,y:-.26,z:0,w:56,h:.5,d:56}];
arenaBoxes.push({x:LAUNCHER.x,y:.3,z:LAUNCHER.z,w:1,h:.6,d:1.1});
for(const side of [-1,1]){
 arenaBoxes.push({x:0,y:.08,z:side*27.8,w:56,h:.16,d:.18},{x:side*27.8,y:.08,z:0,w:.18,h:.16,d:56});
 for(let i=-24;i<=24;i+=8)arenaBoxes.push({x:i,y:.6,z:side*28,w:.22,h:1.2,d:.22},{x:side*28,y:.6,z:i,w:.22,h:1.2,d:.22});
}
for(const t of TRAINING_TARGETS)arenaBoxes.push({x:t.x,y:.525,z:t.z,w:.1,h:1.05,d:.1},{x:t.x,y:.04,z:t.z,w:.8,h:.08,d:.6});

function boxHit(origin,direction,box){
 let near=-Infinity,far=Infinity,normal=null;
 for(const [axis,size] of [['x','w'],['y','h'],['z','d']]){
  const low=box[axis]-box[size]/2,high=box[axis]+box[size]/2,d=direction[axis];
  if(Math.abs(d)<1e-9){if(origin[axis]<low||origin[axis]>high)return null;continue;}
  const a=(low-origin[axis])/d,b=(high-origin[axis])/d,entry=Math.min(a,b);
  if(entry>near){near=entry;normal={x:0,y:0,z:0};normal[axis]=d>0?-1:1;}
  far=Math.min(far,Math.max(a,b));if(near>far)return null;
 }
 return near>0&&near<=70?{distance:near,normal}:null;
}

// Shared by multiplayer and practice so bullets and markers stop at the same
// actual surface, including the base plate, fences and target stands.
export function traceShot(origin,direction,players=[],clays=[]){
 let distance=70,hit=null,targetId=null,clayId=null,surface=null,normal=null;
 for(const box of arenaBoxes){const result=boxHit(origin,direction,box);if(result&&result.distance<distance){distance=result.distance;normal=result.normal;surface='world';}}
 for(const target of TRAINING_TARGETS){const d=targetHit(origin,direction,target);if(d<distance){distance=d;targetId=target.id;surface='target';normal={x:(origin.x+direction.x*d-target.x)/target.radius,y:(origin.y+direction.y*d-target.y)/target.radius,z:(origin.z+direction.z*d-target.z)/target.radius};}}
 for(const player of players){if(player.hp<=0)continue;const d=rayHit(origin,direction,player);if(d<distance){distance=d;hit=player.id;targetId=null;surface='player';normal={x:-direction.x,y:-direction.y,z:-direction.z};}}
 for(const clay of clays){const d=clayHit(origin,direction,clay);if(d<distance){distance=d;hit=targetId=null;clayId=clay.id;surface='clay';normal={x:-direction.x,y:-direction.y,z:-direction.z};}}
 return {distance,hit,targetId,clayId,surface,normal,point:{x:origin.x+direction.x*distance,y:origin.y+direction.y*distance,z:origin.z+direction.z*distance}};
}
export function move(p,input,dt){
 const x=Math.max(-1,Math.min(1,Number(input.x)||0)),z=Math.max(-1,Math.min(1,Number(input.z)||0));
 const len=Math.max(1,Math.hypot(x,z));
 p.yaw=Number.isFinite(input.yaw)?input.yaw:p.yaw;p.pitch=Math.max(-1.35,Math.min(1.35,Number(input.pitch)||0));
 // Exact exponential velocity integration gives the same acceleration at the
 // server's 20 Hz and at the browser's render rate, including stops/reversals.
 const targetX=(x*Math.cos(p.yaw)+z*Math.sin(p.yaw))/len*SPEED,targetZ=(-x*Math.sin(p.yaw)+z*Math.cos(p.yaw))/len*SPEED;
 const decay=Math.exp(-12*dt),travel=(1-decay)/12,vx=p.vx||0,vz=p.vz||0;
 const nextX=p.x+targetX*dt+(vx-targetX)*travel,nextZ=p.z+targetZ*dt+(vz-targetZ)*travel;
 p.vx=targetX+(vx-targetX)*decay;p.vz=targetZ+(vz-targetZ)*decay;
 p.x=Math.max(-LIMIT,Math.min(LIMIT,nextX));p.z=Math.max(-LIMIT,Math.min(LIMIT,nextZ));
 if(p.x!==nextX)p.vx=0;if(p.z!==nextZ)p.vz=0;
 if(input.jump&&p.y===0)p.vy=5;
 p.vy=Number.isFinite(p.vy)?p.vy:0;p.y=Math.max(0,p.y+p.vy*dt-7.5*dt*dt);p.vy-=15*dt;if(p.y===0)p.vy=0;
}
export function rayHit(origin,direction,target){
 // Vertical capsule: two spherical caps plus cylindrical middle.
 const ox=origin.x-target.x,oz=origin.z-target.z,oy=origin.y-target.y;
 const a=direction.x**2+direction.z**2,b=2*(ox*direction.x+oz*direction.z),c=ox**2+oz**2-.42**2;
 let best=Infinity,disc=b*b-4*a*c;
 if(a>1e-8&&disc>=0){for(const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)]){const y=oy+t*direction.y;if(t>0&&y>=.42&&y<=1.38)best=Math.min(best,t);}}
 for(const cy of [.42,1.38]){const dy=oy-cy,b=ox*direction.x+dy*direction.y+oz*direction.z,c=ox*ox+dy*dy+oz*oz-.42**2,d=b*b-c;if(d>=0){const t=-b-Math.sqrt(d);if(t>0)best=Math.min(best,t);}}
 return best;
}
