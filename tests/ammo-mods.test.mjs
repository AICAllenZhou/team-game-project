import test from 'node:test';
import assert from 'node:assert/strict';
import {AMMO_MODS,ammoProfile,shotgunPellets} from '../weapons.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {destructiveShot} from '../simulation.mjs';
const o={x:12,y:1.47,z:-4.53},d={x:1,y:0,z:0};
test('revolver cuts a wider through-hole than small ammo, with surrounding edge damage',()=>{
 const standard=createVoxelWalls(),small=createVoxelWalls();
 const largeHit=destructiveShot(o,d,[],[],standard,AMMO_MODS.revolver.standard),smallHit=destructiveShot(o,d,[],[],small,AMMO_MODS.revolver.small);
 assert.equal(standard.trace(o,d),null);assert.equal(small.trace(o,d),null);
 assert.ok(largeHit.wallChanges.flatMap(c=>c.removed).length>smallHit.wallChanges.flatMap(c=>c.removed).length);
 assert.equal(small.trace({...o,y:o.y+.14},d).wallId,0);
 standard.reset();assert.equal(standard.trace(o,d).distance,3);
});
test('side damage cannot bypass the central penetration budget',()=>{
 const w=createVoxelWalls(),hit=destructiveShot(o,d,[],[],w,{penetration:2,core:1,chip:3});
 assert.ok(w.trace(o,d));assert.ok(Math.abs(w.trace(o,d).distance-3.28)<1e-8);assert.equal(hit.surface,'voxel');
});
test('spread is 10 degrees buckshot, 15 birdshot and 4 slug in total',()=>{
 assert.equal(AMMO_MODS.shotgun.standard.spread*2,10);assert.equal(AMMO_MODS.shotgun.birdshot.spread*2,15);assert.equal(AMMO_MODS.shotgun.slug.spread*2,4);
});
test('small rounds have eight shots, smaller projectiles and less recoil',()=>{
 const p=ammoProfile('revolver',{revolver:'small'});assert.equal(p.capacity,8);assert.ok(p.recoil<1&&p.size<1);assert.equal(ammoProfile('revolver',{revolver:'invalid'}).capacity,6);
});
test('birdshot density and slug accuracy preserve each physical muzzle',()=>{
 for(const [type,count] of [['birdshot',160],['slug',2]]){const profile=AMMO_MODS.shotgun[type],rays=shotgunPellets(o,d,{x:0,y:0,z:1},'mods',2,profile);assert.equal(rays.length,count);assert.notEqual(rays[0].origin.z,rays.at(-1).origin.z);for(const r of rays)assert.ok(Math.acos(Math.min(1,r.direction.x))<=profile.spread*Math.PI/180+1e-9);}
 const w=createVoxelWalls(),hit=destructiveShot(o,d,[],[],w,AMMO_MODS.shotgun.slug);assert.ok(hit.wallChanges.flatMap(c=>c.removed).length>50);assert.equal(w.trace(o,d),null);
});
