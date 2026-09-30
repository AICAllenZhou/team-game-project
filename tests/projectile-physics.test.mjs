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
