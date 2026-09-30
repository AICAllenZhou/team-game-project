import test from 'node:test';
import assert from 'node:assert/strict';
import {launchProjectile,advanceProjectile} from '../projectile-physics.mjs';
import {AMMO_MODS} from '../weapons.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';

const round=(profile=AMMO_MODS.revolver.standard)=>launchProjectile({origin:{x:10,y:1,z:10},direction:{x:0,y:0,z:-1}},profile,{weapon:'revolver'});
test('projectiles cannot damage before arrival and can miss a moving can',()=>{
 const bullet=round(),can={id:'can',x:10,y:0,z:3,hp:100};
 assert.deepEqual(advanceProjectile(bullet,.01,[can],[],null),[]);assert.equal(bullet.position.z,8.4);
 can.x=12;assert.deepEqual(advanceProjectile(bullet,.06,[can],[],null),[]);assert.equal(can.hp,100);
});
test('sweeps prevent tunneling, and stationary hits agree across frame rates',()=>{
 const target={id:'can',x:10,y:0,z:3,hp:100};
 function run(dt){const bullet=round();for(let i=0;i<100;i++){const hits=advanceProjectile(bullet,dt,[target],[],null);if(hits.length)return hits[0];}}
 const fast=run(1/144),slow=run(.1);assert.equal(fast.hit,'can');assert.equal(slow.hit,'can');assert.ok(Math.abs(fast.point.z-slow.point.z)<1e-8);
});
test('wall damage starts on arrival; buckshot penetrates as far with smaller holes',()=>{
 const run=profile=>{const walls=createVoxelWalls(),bullet=launchProjectile({origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}},profile);
  assert.deepEqual(advanceProjectile(bullet,.001,[],[],walls),[]);assert.equal(walls.revision,0);
  const hits=advanceProjectile(bullet,.02,[],[],walls);return {walls,hits,bullet};};
 const revolver=run(AMMO_MODS.revolver.standard),shotgun=run(AMMO_MODS.shotgun.standard);
 assert.equal(AMMO_MODS.shotgun.standard.penetration,AMMO_MODS.revolver.standard.penetration);
 assert.equal(revolver.bullet.penetration,shotgun.bullet.penetration);
 assert.ok(revolver.walls.snapshot()[0].length>shotgun.walls.snapshot()[0].length);
 assert.equal(shotgun.walls.trace({x:14,y:1,z:-5},{x:1,y:0,z:0},3),null);
});
test('launch copies the ammo profile so switching weapons cannot change an airborne round',()=>{
 const profile={...AMMO_MODS.revolver.standard},bullet=round(profile);profile.damage=0;
 assert.equal(bullet.profile.damage,50);
});


test('penetrating rounds leave aligned exit points and can hit a second can',()=>{
 const bullet=round(),targets=[{id:'front',x:10,y:0,z:5,hp:100},{id:'back',x:10,y:0,z:3,hp:100}];
 const hits=advanceProjectile(bullet,.06,targets,[],null).filter(h=>h.hit);
 assert.deepEqual(hits.map(h=>h.hit),['front','back']);assert.ok(hits[0].penetrated);assert.ok(Math.abs(hits[0].exitPoint.z-4.58)<1e-8);
 const bird=round(AMMO_MODS.shotgun.birdshot),birdHits=advanceProjectile(bird,.06,targets,[],null);assert.equal(birdHits.length,1);assert.equal(birdHits[0].exitPoint,undefined);assert.equal(bird.alive,false);
 assert.ok(hits[0].holeRadius>birdHits[0].holeRadius);
});


test('buckshot opens revolver-sized can holes without increasing its damage',()=>{
 const target={id:'can',x:10,y:0,z:3,hp:100};
 const hit=profile=>advanceProjectile(round(profile),.06,[target],[],null)[0];
 assert.equal(hit(AMMO_MODS.shotgun.standard).holeRadius,hit(AMMO_MODS.revolver.standard).holeRadius);
 assert.equal(AMMO_MODS.shotgun.standard.damage,12);
 assert.ok(hit(AMMO_MODS.shotgun.birdshot).holeRadius<hit(AMMO_MODS.shotgun.standard).holeRadius);
});

test('penetrating ammo keeps backside exits for low, high and angled can impacts',()=>{
 const target={id:'can',x:10,y:0,z:3,hp:100};
 const shots=[
  {origin:{x:10,y:.06,z:5},direction:{x:0,y:0,z:-1}},
  {origin:{x:10,y:1.74,z:5},direction:{x:0,y:0,z:-1}},
  {origin:{x:10.32,y:.9,z:5},direction:{x:0,y:0,z:-1}},
  {origin:{x:10,y:1.3,z:5},direction:{x:0,y:.3/Math.hypot(1,.3),z:-1/Math.hypot(1,.3)}},
  {origin:{x:10,y:3,z:3},direction:{x:0,y:-1,z:0}},
 ];
 for(const profile of [AMMO_MODS.revolver.standard,AMMO_MODS.revolver.small,AMMO_MODS.shotgun.standard,AMMO_MODS.shotgun.slug])for(const ray of shots){
  const bullet=launchProjectile(ray,profile),hit=advanceProjectile(bullet,.1,[target],[],null).find(hit=>hit.hit===target.id);
  assert.ok(hit?.penetrated,'penetrating ammo must include an exit');
  const exit=hit.exitPoint,delta={x:exit.x-hit.point.x,y:exit.y-hit.point.y,z:exit.z-hit.point.z};
  const forward=delta.x*ray.direction.x+delta.y*ray.direction.y+delta.z*ray.direction.z;
  assert.ok(forward>0,'exit is past the entry');
  for(const axis of ['x','y','z'])assert.ok(Math.abs(delta[axis]-ray.direction[axis]*forward)<1e-7,'entry and exit follow the same bullet path');
  const sideDistance=Math.abs(Math.hypot(exit.x-target.x,exit.z-target.z)-.42);
  const capDistance=Math.min(Math.abs(exit.y-target.y),Math.abs(exit.y-target.y-1.8));
  assert.ok(Math.min(sideDistance,capDistance)<1e-7,'exit remains on the metal surface');
 }
});

test('the final can penetration still emits its exit even when the bullet stops afterward',()=>{
 const bullet=round({...AMMO_MODS.revolver.standard,penetration:2});
 const hit=advanceProjectile(bullet,.06,[{id:'can',x:10,y:0,z:3,hp:100}],[],null)[0];
 assert.equal(hit.penetrated,true);assert.equal(hit.stopped,true);assert.equal(bullet.alive,false);
 assert.ok(Math.abs(hit.exitPoint.z-2.58)<1e-7);
});
