import {traceShot,PROJECTILE_SPEED} from './simulation.mjs';

// Laser ammo resolves its entire beam in the fire command, without waiting
// for a projectile tick. Batch each wall's changed cells into one event.
export function traceLaser(ray,profile,players=[],clays=[],walls=null,metadata={}){
 const direction={...ray.direction},origin={...ray.origin},position={...origin},impacts=[],pierced=new Set(),wallHits=new Map();
 let remaining=profile.range??180,end={...origin};
 for(let i=0;i<2048&&remaining>1e-6;i++){
  const hit=traceShot(position,direction,players.filter(p=>!pierced.has(p.id)),clays,walls,remaining);end={...hit.point};
  if(!hit.surface)break;
  const result={...hit,...metadata,origin,direction,laser:true,damage:hit.headshot?profile.headDamage:profile.damage,holeRadius:.18,wallChanges:[],stopped:false};
  if(hit.surface==='voxel'){
   const removed=walls.damage(hit,profile.chip??2,direction);
   if(!removed.length)break;
   if(wallHits.has(hit.wallId))wallHits.get(hit.wallId).wallChanges[0].removed.push(...removed);
   else{result.penetrated=true;result.wallChanges.push({wallId:hit.wallId,removed});wallHits.set(hit.wallId,result);impacts.push(result);}
  }else if(hit.hit){
   result.exitPoint=canExitPoint(hit.point,direction,players.find(p=>p.id===hit.hit));result.penetrated=!!result.exitPoint;pierced.add(hit.hit);impacts.push(result);
  }else{result.stopped=true;impacts.push(result);break;}
  const step=Math.min(remaining,hit.distance+.00001);remaining-=step;
  for(const axis of ['x','y','z'])position[axis]+=direction[axis]*step;
 }
 return {end,impacts};
}

export function launchProjectile(ray,profile,metadata={}){
 return {...metadata,position:{...ray.origin},origin:{...ray.origin},direction:{...ray.direction},profile:{...profile},speed:profile.speed??(metadata.weapon==='shotgun'?220:PROJECTILE_SPEED),remaining:profile.range??70,damageScale:1,penetration:profile.penetration,pierced:[],alive:true};
}

// Sweep only the distance traveled this step. Targets are tested at their
// current position, so a shot can miss a target that moves during its flight.
export function advanceProjectile(p,dt,players,clays,walls,{damageWalls=true}={}){
 const impacts=[];
 const velocity=ballisticSegment(p,dt);
 let travel=Math.min(p.remaining,p.speed*Math.max(0,dt));
 const shift=d=>{for(const a of ['x','y','z'])p.position[a]+=p.direction[a]*d;p.remaining-=d;travel-=d;};
 const slow=rate=>{p.speed*=rate;travel*=rate;if(velocity)for(const a of ['x','y','z'])velocity[a]*=rate;};
 for(let safety=0;p.alive&&travel>1e-7&&safety<32;safety++){
  const hit=traceShot(p.position,p.direction,players.filter(target=>!p.pierced.includes(target.id)),clays,walls);
  if(!hit.surface||hit.distance>travel){shift(travel);break;}
  shift(Math.max(0,hit.distance));
  const result={...hit,origin:{...p.origin},direction:{...p.direction},weapon:p.weapon,shotId:p.shotId,shooter:p.shooter,holeRadius:p.profile.canHoleRadius??(.012+.25*(p.profile.damage/100)**2),wallChanges:[],damage:hit.headshot&&p.profile.arrow?p.profile.headDamage:(hit.headshot?p.profile.headDamage:p.profile.damage)*p.damageScale,speed:p.speed,arrow:!!p.profile.arrow};
  if(p.profile.arrow){
   result.embedDepth=p.profile.embedDepth??.18;
   result.impactSound=hit.surface!=='voxel'||p.arrowWallId!==hit.wallId;
   if(hit.surface==='voxel')p.arrowWallId=hit.wallId;
   // The aiming cross marks the first contact without drilling the preview.
   // A real charged arrow spends one point per block, two per can.
   if(damageWalls&&hit.surface==='voxel'&&p.penetration>0){
    result.wallChanges.push({wallId:hit.wallId,removed:walls.damage(hit,0)});
    p.penetration--;p.damageScale*=.94;slow(.96);result.penetrated=true;
   }else if(damageWalls&&hit.hit&&p.penetration>=2){
    const target=players.find(target=>target.id===hit.hit);result.exitPoint=canExitPoint(hit.point,p.direction,target);result.penetrated=!!result.exitPoint;
    if(result.penetrated){p.penetration-=2;p.pierced.push(hit.hit);p.damageScale*=.9;slow(.9);}
   }
   result.stopped=!result.penetrated;result.stuck=result.stopped;result.speed=p.speed;impacts.push(result);
   if(result.stopped){p.alive=false;break;}
   shift(Math.min(.00001,travel));continue;
  }
  if(hit.surface==='voxel'&&damageWalls){
   const radius=p.penetration===p.profile.penetration?p.profile.chip:(p.profile.core??0);
   const removed=walls.damage(hit,radius,p.direction);result.wallChanges.push({wallId:hit.wallId,removed});
   p.penetration--;p.damageScale*=.87;p.speed*=.91;travel*=.91;result.speed=p.speed;impacts.push(result);
   if(p.penetration<=0){result.stopped=true;p.alive=false;break;}
   shift(Math.min(.00001,travel));
  }else if(hit.hit&&p.penetration>=2){
   const target=players.find(target=>target.id===hit.hit);result.exitPoint=canExitPoint(hit.point,p.direction,target);result.penetrated=!!result.exitPoint;
   impacts.push(result);p.penetration-=2;p.pierced.push(hit.hit);if(!result.penetrated||p.penetration<=0)p.alive=false;result.stopped=!p.alive;
   if(p.alive)shift(Math.min(.00001,travel));
  }else{result.stopped=true;impacts.push(result);p.alive=false;}
 }
 if(p.remaining<=1e-6)p.alive=false;
 if(velocity&&p.alive)finishBallistic(p,velocity);
 return impacts;
}

export function canExitPoint(point,d,target){
 const x=point.x-target.x,y=point.y-target.y,z=point.z-target.z,a=d.x*d.x+d.z*d.z,b=2*(x*d.x+z*d.z),c=x*x+z*z-.42**2,disc=b*b-4*a*c,distances=[];
 if(a>1e-8&&disc>=0)for(const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)])if(t>.0001&&y+d.y*t>=0&&y+d.y*t<=1.8)distances.push(t);
 if(Math.abs(d.y)>1e-8)for(const cap of [0,1.8]){const t=(cap-y)/d.y;if(t>.0001&&(x+d.x*t)**2+(z+d.z*t)**2<=.42**2+1e-8)distances.push(t);}
 if(!distances.length)return null;const t=Math.min(...distances);return {x:point.x+d.x*t,y:point.y+d.y*t,z:point.z+d.z*t};
}

function ballisticSegment(p,dt){
 if(!p.profile.arrow)return null;
 const vx=p.direction.x*p.speed,vy=p.direction.y*p.speed,vz=p.direction.z*p.speed,g=p.profile.gravity||0;
 const midY=vy-g*dt*.5;p.speed=Math.hypot(vx,midY,vz);p.direction={x:vx/p.speed,y:midY/p.speed,z:vz/p.speed};return {x:vx,y:vy-g*dt,z:vz};
}
function finishBallistic(p,v){p.speed=Math.hypot(v.x,v.y,v.z);p.direction={x:v.x/p.speed,y:v.y/p.speed,z:v.z/p.speed};}
export function advanceVisualProjectile(p,dt){
 if(!p.alive)return;
 const velocity=ballisticSegment(p,dt),travel=Math.min(p.remaining,p.speed*dt);
 for(const a of ['x','y','z'])p.position[a]+=p.direction[a]*travel;p.remaining-=travel;
 if(velocity)finishBallistic(p,velocity);if(p.remaining<=0)p.alive=false;
}

// Read-only ballistic aiming preview. This uses the same swept segments and
// collision queries as a live arrow, without modifying targets or voxels.
export function predictArrowImpact(ray,profile,players=[],clays=[],walls=null,path=null){
 const p=launchProjectile(ray,profile,{weapon:'bow'});
 if(path){path.length=0;path.push({...p.position});}
 for(let i=0;i<180&&p.alive;i++){
  const hits=advanceProjectile(p,.05,players,clays,walls,{damageWalls:false});
  if(path)path.push({...p.position});
  if(hits.length)return hits[0];
 }
 return null;
}
