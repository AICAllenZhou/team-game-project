export const LAUNCHER={x:2.4,y:.92,z:3.2};
export const CLAY_RADIUS=.44,CLAY_HALF_HEIGHT=.065,CLAY_TILT=.58;
export const LAUNCH_COOLDOWN=650,MAX_CLAYS=3;
const GRAVITY=9.81,DRAG=.14;

export function clayPose(flight,now,out={}){
 const t=Math.max(0,(now-flight.born)/1000),decay=Math.exp(-DRAG*t),travel=(1-decay)/DRAG;
 out.id=flight.id;out.x=flight.x+flight.vx*travel;out.y=flight.y+flight.vy*t-.5*GRAVITY*t*t;out.z=flight.z+flight.vz*travel;
 out.vx=flight.vx*decay;out.vy=flight.vy-GRAVITY*t;out.vz=flight.vz*decay;out.spin=flight.spin*t;out.radius=CLAY_RADIUS;
 return out;
}

// Thin tilted ellipsoid, rather than a large invisible spherical hitbox.
export function clayHit(origin,direction,clay){
 const c=Math.cos(CLAY_TILT),s=Math.sin(CLAY_TILT),x=origin.x-clay.x,y=origin.y-clay.y,z=origin.z-clay.z;
 const ox=x/CLAY_RADIUS,oy=(y*c+z*s)/CLAY_HALF_HEIGHT,oz=(-y*s+z*c)/CLAY_RADIUS;
 const dx=direction.x/CLAY_RADIUS,dy=(direction.y*c+direction.z*s)/CLAY_HALF_HEIGHT,dz=(-direction.y*s+direction.z*c)/CLAY_RADIUS;
 const a=dx*dx+dy*dy+dz*dz,b=ox*dx+oy*dy+oz*dz,c0=ox*ox+oy*oy+oz*oz-1,disc=b*b-a*c0;
 if(disc<0||a<1e-12)return Infinity;
 const near=(-b-Math.sqrt(disc))/a,far=(-b+Math.sqrt(disc))/a;
 return near>0?near:far>0?far:Infinity;
}

export function createSkeetRange(){
 const flights=[];let sequence=0,lastLaunch=-Infinity;
 function launch(now,random=Math.random){
  if(now-lastLaunch<LAUNCH_COOLDOWN||flights.length>=MAX_CLAYS)return null;
  lastLaunch=now;
  const angle=(random()-.5)*.62,elevation=.55+random()*.28,speed=14+(random()-.5)*1.2,horizontal=Math.cos(elevation)*speed;
  const flight={id:`clay-${++sequence}`,born:now,x:LAUNCHER.x,y:LAUNCHER.y,z:LAUNCHER.z-.46,vx:Math.sin(angle)*horizontal,vy:Math.sin(elevation)*speed,vz:-Math.cos(angle)*horizontal,spin:11+(random()-.5)*2};
  flights.push(flight);return flight;
 }
 function breakClay(id,now,direction={x:0,y:0,z:0},ground=false){
  const index=flights.findIndex(f=>f.id===id);if(index<0)return null;
  const pose=clayPose(flights[index],now);flights.splice(index,1);
  pose.y=Math.max(CLAY_HALF_HEIGHT,pose.y);
  return {...pose,direction:{...direction},ground};
 }
 function update(now){
  const broken=[];
  for(let i=flights.length-1;i>=0;i--){const flight=flights[i],impact=flight.born+1000*(flight.vy+Math.sqrt(flight.vy**2+2*GRAVITY*(flight.y-CLAY_HALF_HEIGHT)))/GRAVITY;if(now>=impact)broken.push(breakClay(flight.id,impact,undefined,true));}
  return broken;
 }
 return {flights,launch,breakClay,update};
}

// Small fixed steps make tumbling debris behave consistently through slow
// frames. A low restitution and floor friction make clay settle, not bounce.
export function stepClayShard(p,dt){
 const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
 for(let i=0;i<steps;i++){
  p.x+=p.vx*h;p.y+=p.vy*h-.5*GRAVITY*h*h;p.z+=p.vz*h;p.vy-=GRAVITY*h;
  p.rx+=p.wx*h;p.ry+=p.wy*h;p.rz+=p.wz*h;
  if(p.y<.025){p.y=.025;p.vy=Math.abs(p.vy)>.5?-p.vy*.2:0;const friction=Math.exp(-9*h);p.vx*=friction;p.vz*=friction;p.wx*=friction;p.wy*=friction;p.wz*=friction;}
 }
}
