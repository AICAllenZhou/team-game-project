export const SHOTGUN_PICKUP={x:3.8,y:.8,z:3.2};
export function canPickUpShotgun(p,yaw=p.yaw,pitch=p.pitch){
 if(p.hp<=0||p.reloadUntil||Math.hypot(p.x-SHOTGUN_PICKUP.x,p.z-SHOTGUN_PICKUP.z)>1.5||Math.abs(p.y)>=1.5||!Number.isFinite(yaw)||!Number.isFinite(pitch))return false;
 const dx=SHOTGUN_PICKUP.x-.35-p.x,dy=SHOTGUN_PICKUP.y-(p.y+1.5),dz=SHOTGUN_PICKUP.z-p.z;
 const forward=-dx*Math.sin(yaw)*Math.cos(pitch)+dy*Math.sin(pitch)-dz*Math.cos(yaw)*Math.cos(pitch);
 return forward>0&&dx*dx+dy*dy+dz*dz-forward*forward<.42*.42;
}
export const WEAPONS={revolver:{capacity:6,cost:1,reload:1800,damage:34},shotgun:{capacity:2,cost:1,reload:2400,damage:9}};
export const AMMO_MODS={revolver:{standard:{label:'Standard',capacity:6,pellets:1,spread:0,damage:34,recoil:1,size:1,penetration:3,chip:0},small:{label:'Small bullets · 8 rounds',capacity:8,pellets:1,spread:0,damage:23,recoil:.55,size:.65,penetration:1,chip:0}},shotgun:{standard:{label:'Buckshot',capacity:2,pellets:12,spread:7.5,damage:9,recoil:1,size:1,penetration:1,chip:1},birdshot:{label:'Birdshot · 80 pellets per barrel',capacity:2,pellets:80,spread:10,damage:2,recoil:.85,size:.65,penetration:1,chip:1},slug:{label:'Slug · accurate, heavy impact',capacity:2,pellets:1,spread:.6,damage:85,recoil:1.35,size:1.6,penetration:3,chip:3}}};
export function ammoProfile(weapon,mods={}){return AMMO_MODS[weapon][mods?.[weapon]]||AMMO_MODS[weapon].standard;}
export const SHOTGUN_SPREAD=7.5*Math.PI/180,SHOTGUN_MODEL_SCALE=1.25,SHOTGUN_SEPARATION=.044*SHOTGUN_MODEL_SCALE,SHOTGUN_INTERVAL=180;

// The seed keeps prediction and server traces identical. Each barrel emits
// twelve pellets over an evenly covered cone, not a screen-centered ray.
export function shotgunPellets(origin,direction,barrelRight,seed='',barrel=0,profile=AMMO_MODS.shotgun.standard){
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
  for(let i=0;i<profile.pellets;i++){
   const radius=Math.sqrt((i+random())/profile.pellets)*Math.tan(profile.spread*Math.PI/180),angle=rotation+i*2.3999632297;
   const a=Math.cos(angle)*radius,b=Math.sin(angle)*radius;
   const dx=direction.x+right.x*a+up.x*b,dy=direction.y+right.y*a+up.y*b,dz=direction.z+right.z*a+up.z*b,n=Math.hypot(dx,dy,dz);
   pellets.push({origin:{...muzzle},direction:{x:dx/n,y:dy/n,z:dz/n}});
  }
 }
 return pellets;
}

export function shotgunDischarge(ammo,both=false){return {barrel:both&&ammo>=2?2:ammo>=2?0:1,cost:Math.min(ammo,both?2:1)};}
