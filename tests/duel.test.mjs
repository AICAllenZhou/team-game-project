import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomEngine} from '../room-engine.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {AMMO_MODS,chargedArrow} from '../weapons.mjs';
import {resolveBarrelShot,move} from '../simulation.mjs';
import {launchProjectile,advanceProjectile} from '../projectile-physics.mjs';
function fixture(){let time=10000;const events=[],values=[10,5,10,-5].map(v=>v/36+.5),engine=createRoomEngine({now:()=>time,random:()=>values.shift()??.5,emit:(type,data)=>events.push({type,data})});engine.addPlayer({id:'a',name:'A'});engine.addPlayer({id:'b',name:'B'});return {engine,events,step(n=1){for(let i=0;i<n;i++){time+=50;engine.tick();}},get time(){return time;},player(id){return engine.snapshot().players.find(p=>p.id===id);}};}
test('muzzle offsets survive stale prediction while rejecting forged reach and invalid directions',()=>{
 const p={x:10,y:0,z:0,gunYaw:0,gunPitch:0};
 const ray=resolveBarrelShot(p,{muzzleOffset:{x:.2,y:-.3,z:-1.2},direction:{x:0,y:0,z:-1},muzzle:{x:90,y:1,z:90}});
 assert.deepEqual(ray.origin,{x:10.2,y:1.2,z:-1.2});
 assert.equal(resolveBarrelShot(p,{muzzleOffset:{x:50,y:0,z:0}}),null);
 assert.equal(resolveBarrelShot(p,{muzzleOffset:{x:NaN,y:0,z:0}}),null);
 assert.equal(resolveBarrelShot(p,{direction:{x:50,y:0,z:0}}),null);
});
test('duel scores once, shows death before a 3-second intermission, resets blocks and opposite spawns',()=>{
 const f=fixture(),e=f.engine;e.setMap({id:'duel',revision:'map-1'});
 assert.equal(e.snapshot().duel.phase,'intermission');assert.equal(e.snapshot().cans.length,0);
 assert.equal(f.player('a').x,-15.5);assert.equal(f.player('b').x,15.5);
 e.command('a','loadout',{secondary:'bow',revolver:'heavy',equip:'revolver'});
 assert.equal(f.player('a').hasShotgun,false);assert.equal(f.player('a').hasBow,true);assert.equal(f.player('a').ammo,3);
 e.command('a','equip',{weapon:'shotgun'});assert.equal(f.player('a').weapon,'revolver');
 e.command('a','fire',{direction:{x:1,y:0,z:0}});assert.equal(f.player('a').ammo,3);
 f.step(60);assert.equal(e.snapshot().duel.phase,'active');
 assert.throws(()=>e.command('a','loadout',{secondary:'shotgun',revolver:'standard'}),/between rounds/);
 const shoot=direction=>e.command('a','fire',{muzzleOffset:{x:1,y:-.5,z:0},direction});
 shoot({x:0,y:-1,z:0});f.step(6);assert.ok(e.wallSnapshot().some(w=>w.length));
 shoot({x:1,y:0,z:0});f.step(8);assert.equal(f.player('b').hp,25);
 shoot({x:1,y:0,z:0});f.step(8);assert.equal(f.player('b').hp,0);assert.equal(e.snapshot().duel.phase,'death');assert.equal(e.snapshot().duel.scores.a,1);
 f.step(36);assert.equal(e.snapshot().duel.phase,'intermission');assert.equal(f.player('b').hp,100);assert.equal(f.player('a').x,-15.5);assert.ok(e.wallSnapshot().every(w=>!w.length));
 assert.equal(e.snapshot().duel.scores.a,1);f.step(60);assert.equal(e.snapshot().duel.phase,'active');
 e.removePlayer('b');assert.equal(e.snapshot().duel.phase,'waiting');
});
test('floor and cover are destructible, solid boundaries stop shots and players stand on the end platforms',()=>{
 const walls=createVoxelWalls('duel'),p={x:-15.5,y:.7,z:0,vy:0,yaw:0,pitch:0};
 for(let i=0;i<20;i++){const old={...p};move(p,{x:0,z:0},.05,{mapId:'duel'});walls.collide(p,old);}
 assert.ok(Math.abs(p.y-.7)<.001);
 const floor=walls.trace({x:0,y:2,z:8.5},{x:0,y:-1,z:0});assert.ok(floor);walls.damage(floor,2);assert.ok(walls.snapshot().some(w=>w.length));
 const bullet=launchProjectile({origin:{x:17,y:2,z:0},direction:{x:1,y:0,z:0}},AMMO_MODS.revolver.heavy);
 const hits=advanceProjectile(bullet,.1,[],[],walls);assert.equal(hits.at(-1).surface,'world');assert.equal(bullet.alive,false);
});
test('heavy rounds hit for 75 and penetrate easily; small rounds fly faster; walls reduce speed and damage',()=>{
 assert.equal(AMMO_MODS.revolver.heavy.capacity,3);assert.equal(AMMO_MODS.revolver.heavy.damage,75);
 const ray={origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}},walls=createVoxelWalls();
 const p=launchProjectile(ray,AMMO_MODS.revolver.heavy);advanceProjectile(p,.04,[],[],walls);assert.ok(p.speed<105);assert.ok(p.damageScale<1);assert.ok(p.penetration>6);
 assert.ok(launchProjectile(ray,AMMO_MODS.revolver.small).speed>launchProjectile(ray,AMMO_MODS.revolver.standard).speed);
 const target={id:'target',x:17,y:0,z:-5,hp:100},hits=advanceProjectile(p,.1,[target],[],walls);const hit=hits.find(h=>h.hit);assert.ok(hit.damage<75);
});
test('arrows are ballistic, stick to walls and do not penetrate or destroy them',()=>{
 const walls=createVoxelWalls(),p=launchProjectile({origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}},chargedArrow(1),{weapon:'bow'});
 const hit=advanceProjectile(p,.1,[],[],walls)[0];assert.equal(hit.stuck,true);assert.equal(hit.penetrated,undefined);assert.equal(p.alive,false);assert.equal(walls.revision,0);assert.ok(hit.point.y<1);
 assert.equal(chargedArrow(1).damage,100);assert.equal(chargedArrow(0).headDamage,100);assert.ok(chargedArrow(1).speed>chargedArrow(0).speed);
});
test('server times bow charge, fully charged body shots kill, and low charge bleeds in three 5-damage bursts',()=>{
 for(const charged of [false,true]){
  const f=fixture(),e=f.engine;e.setPlayerLoadout('a',{revision:'bow',hasBow:true,mods:{}});e.command('a','equip',{weapon:'bow'});
  e.command('a','charge',{active:true});if(charged)f.step(22);
  e.command('a','fire',{muzzleOffset:{x:0,y:-.5,z:-1},direction:{x:0,y:0,z:-1},charge:1});
  f.step(7);assert.equal(f.player('b').hp,charged?0:15);
  if(!charged){f.step(24);assert.equal(f.player('b').hp,0);assert.deepEqual(f.events.filter(e=>e.type==='bleed').map(e=>e.data.damage),[5,5,5]);}
 }
});


test('arrow flight follows the same gravity arc across frame rates',()=>{
 const run=dt=>{const p=launchProjectile({origin:{x:10,y:8,z:20},direction:{x:0,y:0,z:-1}},chargedArrow(.4),{weapon:'bow'});for(let t=0;t<.4-1e-6;t+=dt)advanceProjectile(p,dt,[],[],null);return p.position;};
 const a=run(.05),b=run(.01);assert.ok(Math.abs(a.y-b.y)<1e-8);assert.ok(Math.abs(a.z-b.z)<1e-8);
});


test('undrawn arrow headshots kill and arrows can lodge in the floor',()=>{
 const target={id:'can',x:10,y:0,z:3,hp:100};
 const head=launchProjectile({origin:{x:10,y:1.75,z:5},direction:{x:0,y:0,z:-1}},chargedArrow(0),{weapon:'bow'});
 const hit=advanceProjectile(head,.1,[target],[],null)[0];assert.equal(hit.headshot,true);assert.equal(hit.damage,100);assert.equal(hit.stuck,true);
 const floor=launchProjectile({origin:{x:10,y:2,z:10},direction:{x:0,y:-1,z:0}},chargedArrow(0),{weapon:'bow'});
 const ground=advanceProjectile(floor,.1,[],[],null)[0];assert.equal(ground.surface,'world');assert.equal(ground.stuck,true);
});

test('stale map updates do not roll back a newer map or reset its score',()=>{
 const f=fixture();f.engine.setMap({id:'duel',revision:'new',changedAt:200});const epoch=f.engine.snapshot().duel.epoch;
 f.engine.setMap({id:'practice',revision:'old',changedAt:100});assert.equal(f.engine.snapshot().mapId,'duel');assert.equal(f.engine.snapshot().duel.epoch,epoch);
});
