import {ammoProfile} from './weapons.mjs';
export const SHOP={x:-13,z:3.5,keeperZ:1.9};
export const AMMO_STOCK=[
 {weapon:'revolver',mod:'standard',name:'Revolver rounds',detail:'Six heavy rounds',price:400},
 {weapon:'revolver',mod:'small',name:'Small rounds',detail:'Eight rounds · softer recoil',price:400},
 {weapon:'revolver',mod:'heavy',name:'Tri-shot rounds',detail:'Three slow, heavy rounds',price:500},
 {weapon:'shotgun',mod:'standard',name:'Buckshot',detail:'Twelve pellets per barrel',price:450},
 {weapon:'shotgun',mod:'birdshot',name:'Birdshot',detail:'Eighty little pellets',price:450},
 {weapon:'shotgun',mod:'slug',name:'Slugs',detail:'One big punch',price:500}
];
export const CAN_REWARD=125;
export const SHOP_SOLIDS=[
 {x:SHOP.x-3,y:1.6,z:SHOP.z,w:.18,h:3.2,d:6},
 {x:SHOP.x+3,y:1.6,z:SHOP.z,w:.18,h:3.2,d:6},
 {x:SHOP.x,y:1.6,z:SHOP.z-3,w:6,h:3.2,d:.18},
 {x:SHOP.x-2.3,y:1.6,z:SHOP.z+3,w:1.4,h:3.2,d:.18},
 {x:SHOP.x+2.3,y:1.6,z:SHOP.z+3,w:1.4,h:3.2,d:.18},
 {x:SHOP.x,y:.58,z:SHOP.z-.5,w:5.6,h:1.16,d:.8},
 {x:SHOP.x,y:1.05,z:SHOP.keeperZ,w:1.35,h:1.9,d:1.1},
 {x:SHOP.x,y:3.35,z:SHOP.z,w:6.6,h:.2,d:6.7}
];
export function createWallet(){return {beans:0,ownedAmmo:['revolver:standard','shotgun:standard']};}
export function ownsAmmo(p,weapon,mod){return (p.ownedAmmo||createWallet().ownedAmmo).includes(weapon+':'+mod);}
export function canShop(p,yaw=p.yaw,pitch=p.pitch){
 if(p.hp<=0||p.reloadUntil||!Number.isFinite(yaw)||!Number.isFinite(pitch)||p.y>.5||p.y<0||Math.abs(p.x-SHOP.x)>1.65||p.z<SHOP.z+.15||p.z>SHOP.z+2.8)return false;
 const dx=SHOP.x-p.x,dy=1.35-(p.y+1.5),dz=SHOP.keeperZ-p.z,n=Math.hypot(dx,dy,dz);
 return (-Math.sin(yaw)*Math.cos(pitch)*dx+Math.sin(pitch)*dy-Math.cos(yaw)*Math.cos(pitch)*dz)/n>.72;
}
export function awardBeans(p,result){
 const amount=(result.killed?CAN_REWARD:0)+(result.wallChanges||[]).reduce((sum,change)=>sum+new Set(change.removed).size,0);
 p.beans=(p.beans||0)+amount;return amount;
}
export function purchaseAmmo(p,weapon,mod,yaw=p.yaw,pitch=p.pitch){
 const item=AMMO_STOCK.find(s=>s.weapon===weapon&&s.mod===mod);
 if(!item)return {ok:false,message:'That ammo is not for sale.'};
 if(!canShop(p,yaw,pitch))return {ok:false,message:'Come up to the counter.'};
 if(weapon==='shotgun'&&!p.hasShotgun)return {ok:false,message:'Pick up the shotgun first.'};
 const owned=ownsAmmo(p,weapon,mod);
 if(!owned&&(p.beans||0)<item.price)return {ok:false,message:'Not enough beans.'};
 if(!owned){p.beans-=item.price;p.ownedAmmo=[...(p.ownedAmmo||createWallet().ownedAmmo),weapon+':'+mod];}
 p.mods={...p.mods,[weapon]:mod};p.ammoByWeapon={...p.ammoByWeapon,[weapon]:ammoProfile(weapon,p.mods).capacity};
 if(p.weapon===weapon)p.ammo=p.ammoByWeapon[weapon];
 return {ok:true,message:owned?'Loaded.':'Bought and loaded.'};
}
export function collideShop(p,old){
 for(const b of SHOP_SOLIDS){if(p.y>=b.y+b.h/2||p.y+1.65<=b.y-b.h/2)continue;
  const overlaps=(x,z)=>Math.abs(x-b.x)<b.w/2+.28&&Math.abs(z-b.z)<b.d/2+.28;
  if(overlaps(p.x,p.z)){
   if(!overlaps(old.x,p.z)){p.x=old.x;p.vx=0;}
   else if(!overlaps(p.x,old.z)){p.z=old.z;p.vz=0;}
   else{p.x=old.x;p.z=old.z;p.vx=p.vz=0;}
  }
 }
}
export function restoreWallet(raw){
 const wallet=createWallet();if(!raw||typeof raw!=='object')return wallet;
 wallet.beans=Number.isSafeInteger(raw.beans)?Math.max(0,Math.min(10000000,raw.beans)):0;
 wallet.ownedAmmo=[...new Set([...wallet.ownedAmmo,...(Array.isArray(raw.ownedAmmo)?raw.ownedAmmo:[]).filter(key=>AMMO_STOCK.some(s=>s.weapon+':'+s.mod===key))])];return wallet;
}
