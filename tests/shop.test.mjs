import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOP,AMMO_STOCK,createWallet,canShop,purchaseAmmo,awardBeans,restoreWallet} from '../shop.mjs';
import {move,traceShot} from '../simulation.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {launchProjectile,advanceProjectile} from '../projectile-physics.mjs';
import {AMMO_MODS} from '../weapons.mjs';
import {applyDamage} from '../combat.mjs';
const customer=()=>({...createWallet(),x:SHOP.x,y:0,z:SHOP.z+1,yaw:0,pitch:0,hp:100,weapon:'revolver',ammo:6,hasShotgun:true});
test('only a living customer in front of the counter and facing the shopkeeper can shop',()=>{
 const p=customer();assert.equal(canShop(p),true);
 for(const change of [{x:0},{z:SHOP.z-3},{x:SHOP.x+2},{yaw:Math.PI},{hp:0},{reloadUntil:1000},{y:1},{pitch:1.35}])assert.equal(canShop({...p,...change}),false);
});
test('prices are 400 to 500 beans, purchases are atomic permanent unlocks',()=>{
 assert.ok(AMMO_STOCK.every(item=>item.price>=400&&item.price<=500));
 const p=customer();p.beans=399;const before=structuredClone(p);assert.equal(purchaseAmmo(p,'revolver','small').ok,false);assert.deepEqual(p,before);
 p.beans=500;assert.equal(purchaseAmmo(p,'revolver','small').ok,true);assert.equal(p.beans,100);assert.equal(p.ammo,8);assert.equal(p.mods.revolver,'small');
 assert.equal(purchaseAmmo(p,'revolver','small').ok,true);assert.equal(p.beans,100);
 assert.equal(purchaseAmmo(p,'revolver','standard').ok,true);assert.equal(p.ammo,6);assert.equal(purchaseAmmo(p,'revolver','small').ok,true);assert.equal(p.beans,100);
 p.beans=500;p.hasShotgun=false;assert.equal(purchaseAmmo(p,'shotgun','slug').ok,false);assert.equal(p.beans,500);
 p.hasShotgun=true;assert.equal(purchaseAmmo(p,'shotgun','slug').ok,true);assert.equal(p.beans,0);assert.equal(p.mods.shotgun,'slug');assert.equal(p.ammo,8);assert.equal(p.ammoByWeapon.shotgun,2);
 assert.equal(purchaseAmmo(p,'__proto__','slug').ok,false);
});
test('real wall damage and a can kill pay beans once, misses and dead cans do not',()=>{
 const p=customer(),walls=createVoxelWalls(),ray={origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}};
 const shoot=()=>{const bullet=launchProjectile(ray,AMMO_MODS.revolver.standard);return advanceProjectile(bullet,.05,[],[],walls);};
 const hits=shoot();for(const hit of hits)awardBeans(p,hit);const paid=p.beans;assert.ok(paid>0);
 for(const hit of shoot())awardBeans(p,hit);assert.equal(p.beans,paid);
 const victim={hp:100};awardBeans(p,{killed:applyDamage(victim,100,0)});assert.equal(p.beans,paid+125);
 awardBeans(p,{killed:applyDamage(victim,100,0)});awardBeans(p,{surface:null});assert.equal(p.beans,paid+125);
 walls.reset();for(const hit of shoot())awardBeans(p,hit);assert.ok(p.beans>paid+125);
});
test('shack walls stop walking and bullets while the open doorway admits the player',()=>{
 const p=customer();p.z=SHOP.z+4;
 for(let i=0;i<120;i++)move(p,{z:-1,yaw:0},1/60);assert.ok(p.z<SHOP.z+2.8&&p.z>=SHOP.z+.15);
 const outside={...customer(),x:SHOP.x+4,z:SHOP.z+1};for(let i=0;i<120;i++)move(outside,{x:-1,yaw:0},1/60);assert.ok(outside.x>SHOP.x+3);
 const hit=traceShot({x:SHOP.x+5,y:1.5,z:SHOP.z},{x:-1,y:0,z:0});assert.equal(hit.surface,'world');assert.ok(Math.abs(hit.point.x-(SHOP.x+3.09))<1e-6);
});
test('saved practice wallet restores known unlocks and rejects malformed balances',()=>{
 assert.deepEqual(restoreWallet(null),createWallet());assert.equal(restoreWallet({beans:-500}).beans,0);
 const p=restoreWallet({beans:490,ownedAmmo:['shotgun:slug','madeup','shotgun:slug']});assert.equal(p.beans,490);assert.deepEqual(p.ownedAmmo,['revolver:standard','shotgun:standard','shotgun:slug']);
});
