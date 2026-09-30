import {traceShot,PROJECTILE_SPEED} from './simulation.mjs';

export function launchProjectile(ray,profile,metadata={}){
 return {...metadata,position:{...ray.origin},origin:{...ray.origin},direction:{...ray.direction},profile:{...profile},speed:metadata.weapon==='shotgun'?220:PROJECTILE_SPEED,remaining:70,penetration:profile.penetration,alive:true};
}

// Sweep only the distance traveled this step. Targets are tested at their
// current position, so a shot can miss a target that moves during its flight.
export function advanceProjectile(p,dt,players,clays,walls,{damageWalls=true}={}){
 const impacts=[];let travel=Math.min(p.remaining,p.speed*Math.max(0,dt));
 const shift=d=>{for(const a of ['x','y','z'])p.position[a]+=p.direction[a]*d;p.remaining-=d;travel-=d;};
 for(let safety=0;p.alive&&travel>1e-7&&safety<32;safety++){
  const hit=traceShot(p.position,p.direction,players,clays,walls);
  if(!hit.surface||hit.distance>travel){shift(travel);break;}
  shift(Math.max(0,hit.distance));
  const result={...hit,origin:{...p.origin},direction:{...p.direction},weapon:p.weapon,shotId:p.shotId,shooter:p.shooter,wallChanges:[]};
  if(hit.surface==='voxel'&&damageWalls){
   const radius=p.penetration===p.profile.penetration?p.profile.chip:(p.profile.core??0);
   const removed=walls.damage(hit,radius,p.direction);result.wallChanges.push({wallId:hit.wallId,removed});
   p.penetration--;impacts.push(result);
   if(p.penetration<=0){result.stopped=true;p.alive=false;break;}
   shift(Math.min(.00001,travel));
  }else{impacts.push(result);p.alive=false;}
 }
 if(p.remaining<=1e-6)p.alive=false;
 return impacts;
}
