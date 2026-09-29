import test from 'node:test';
import assert from 'node:assert/strict';
import {shotDamage,applyDamage,setPowers} from '../combat.mjs';
import {traceShot} from '../simulation.mjs';

test('damage follows the requested body and headshot rules for every ammo type',()=>{
 for(const [weapon,mod,body,head,hits] of [['revolver','standard',50,100,2],['revolver','small',25,100,4],['shotgun','standard',12,100,9],['shotgun','birdshot',2,2,50],['shotgun','slug',100,100,1]]){
  assert.equal(shotDamage(weapon,{[weapon]:mod}),body);assert.equal(shotDamage(weapon,{[weapon]:mod},true),head);
  const victim={hp:100};for(let i=1;i<hits;i++){assert.equal(applyDamage(victim,body,1000),false);assert.ok(victim.hp>0);}
  assert.equal(applyDamage(victim,body,1000),true);assert.equal(victim.hp,0);assert.equal(victim.deaths,1);assert.equal(victim.deadUntil,4000);
  assert.equal(applyDamage(victim,body,1001),false);assert.equal(victim.deaths,1);
 }
});
test('headshots are classified at the actual capsule impact and respect blockers',()=>{
 const p={id:'p',x:10,y:0,z:-5,hp:100},direction={x:0,y:0,z:-1};
 for(const [height,head] of [[.8,false],[1.3,false],[1.6,true]]){const hit=traceShot({x:10,y:height,z:5},direction,[p]);assert.equal(hit.hit,p.id);assert.equal(hit.headshot,head);}
 const raised={...p,y:2},hit=traceShot({x:10,y:3.6,z:5},direction,[raised]);assert.equal(hit.headshot,true);
 const blocked=traceShot({x:0,y:1.6,z:5},direction,[{...p,x:0}]);assert.equal(blocked.hit,null);assert.equal(blocked.headshot,false);
});
test('infinite HP prevents death and disabling it restores normal damage',()=>{
 const p={hp:0,deadUntil:2000,weapon:'revolver',ammo:0,reloadUntil:3000,mods:{},ammoByWeapon:{}};
 setPowers(p,{infiniteHp:true,infiniteAmmo:true,noRecoil:true});assert.equal(p.hp,100);assert.equal(p.deadUntil,0);assert.equal(p.ammo,6);assert.equal(p.reloadUntil,0);assert.equal(p.ammoByWeapon.shotgun,2);
 assert.equal(applyDamage(p,10000,100),false);assert.equal(p.hp,100);
 setPowers(p,{});assert.equal(applyDamage(p,100,100),true);
});
