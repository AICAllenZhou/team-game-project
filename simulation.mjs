export const LIMIT=27, SPEED=4.5;
export const TRAINING_TARGETS=[-4,0,4].map((x,i)=>({id:`target-${i}`,x,y:1.6,z:0,radius:.55}));
export function targetHit(origin,direction,target){
 const x=origin.x-target.x,y=origin.y-target.y,z=origin.z-target.z;
 const b=x*direction.x+y*direction.y+z*direction.z,c=x*x+y*y+z*z-target.radius**2,d=b*b-c;
 if(d<0)return Infinity;const t=-b-Math.sqrt(d);return t>0?t:Infinity;
}
export function move(p,input,dt){
 const x=Math.max(-1,Math.min(1,Number(input.x)||0)),z=Math.max(-1,Math.min(1,Number(input.z)||0));
 const len=Math.max(1,Math.hypot(x,z));
 p.yaw=Number.isFinite(input.yaw)?input.yaw:p.yaw;p.pitch=Math.max(-1.35,Math.min(1.35,Number(input.pitch)||0));
 p.x=Math.max(-LIMIT,Math.min(LIMIT,p.x+(x*Math.cos(p.yaw)+z*Math.sin(p.yaw))/len*SPEED*dt));
 p.z=Math.max(-LIMIT,Math.min(LIMIT,p.z+(-x*Math.sin(p.yaw)+z*Math.cos(p.yaw))/len*SPEED*dt));
 if(input.jump&&p.y===0)p.vy=5;
 p.vy-=15*dt;p.y=Math.max(0,p.y+p.vy*dt);if(p.y===0)p.vy=0;
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
