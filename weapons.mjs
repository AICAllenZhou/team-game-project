export const SHOTGUN_PICKUP={x:3.8,y:.8,z:3.2};
export function canPickUpShotgun(p){return p.hp>0&&!p.reloadUntil&&Math.hypot(p.x-SHOTGUN_PICKUP.x,p.z-SHOTGUN_PICKUP.z)<=1.5&&Math.abs(p.y)<1.5;}
export const WEAPONS={revolver:{capacity:6,cost:1,reload:1800,damage:34},shotgun:{capacity:2,cost:1,reload:2400,damage:9}};
export const SHOTGUN_SPREAD=7.5*Math.PI/180,SHOTGUN_MODEL_SCALE=1.25,SHOTGUN_SEPARATION=.044*SHOTGUN_MODEL_SCALE,SHOTGUN_INTERVAL=180;

// The seed keeps prediction and server traces identical. Each barrel emits
// twelve pellets over an evenly covered cone, not a screen-centered ray.
export function shotgunPellets(origin,direction,barrelRight,seed='',barrel=0){
 let hash=2166136261;for(const char of String(seed)){hash=Math.imul(hash^char.charCodeAt(0),16777619);}
 const random=()=>{hash^=hash<<13;hash^=hash>>>17;hash^=hash<<5;return (hash>>>0)/4294967296;};
 let right=barrelRight;
 if(!right||![right.x,right.y,right.z].every(Number.isFinite)||Math.hypot(right.x,right.y,right.z)<.9||Math.hypot(right.x,right.y,right.z)>1.1)right={x:-direction.z,y:0,z:direction.x};
 let dot=right.x*direction.x+right.y*direction.y+right.z*direction.z;
 let x=right.x-dot*direction.x,y=right.y-dot*direction.y,z=right.z-dot*direction.z,length=Math.hypot(x,y,z);
 if(length<1e-6){x=Math.abs(direction.x)<.9?1:0;y=x?0:1;z=0;dot=x*direction.x+y*direction.y;x-=dot*direction.x;y-=dot*direction.y;z-=dot*direction.z;length=Math.hypot(x,y,z);}
 right={x:x/length,y:y/length,z:z/length};
 const up={x:right.y*direction.z-right.z*direction.y,y:right.z*direction.x-right.x*direction.z,z:right.x*direction.y-right.y*direction.x};
 const pellets=[];
 for(const side of (barrel===2?[-1,1]:[barrel===1?1:-1])){
  const muzzle={x:origin.x+right.x*side*SHOTGUN_SEPARATION/2,y:origin.y+right.y*side*SHOTGUN_SEPARATION/2,z:origin.z+right.z*side*SHOTGUN_SEPARATION/2},rotation=random()*Math.PI*2;
  for(let i=0;i<12;i++){
   const radius=Math.sqrt((i+random())/12)*Math.tan(SHOTGUN_SPREAD),angle=rotation+i*2.3999632297;
   const a=Math.cos(angle)*radius,b=Math.sin(angle)*radius;
   const dx=direction.x+right.x*a+up.x*b,dy=direction.y+right.y*a+up.y*b,dz=direction.z+right.z*a+up.z*b,n=Math.hypot(dx,dy,dz);
   pellets.push({origin:{...muzzle},direction:{x:dx/n,y:dy/n,z:dz/n}});
  }
 }
 return pellets;
}

export function shotgunDischarge(ammo,both=false){return {barrel:both&&ammo>=2?2:ammo>=2?0:1,cost:Math.min(ammo,both?2:1)};}
