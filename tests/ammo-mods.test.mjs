import test from 'node:test';
import assert from 'node:assert/strict';
import {AMMO_MODS,ammoProfile,shotgunPellets} from '../weapons.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {destructiveShot} from '../simulation.mjs';
const o={x:12,y:1.47,z:-4.53},d={x:1,y:0,z:0};
test('standard revolver penetrates exactly three blocks and reset restores them',()=>{
 const w=createVoxelWalls();const hit=destructiveShot(o,d,[],[],w,AMMO_MODS.revolver.standard);
 assert.equal(hit.wallChanges.length,3);assert.equal(hit.wallChanges.flatMap(c=>c.removed).length,3);
 assert.ok(w.trace(o,d).distance>3.4);w.reset();assert.equal(w.trace(o,d).distance,3);assert.ok(w.snapshot().every(a=>a.length===0));
});
test('small rounds have eight shots, smaller projectiles and less recoil',()=>{
 const p=ammoProfile('revolver',{revolver:'small'});assert.equal(p.capacity,8);assert.ok(p.recoil<1&&p.size<1);assert.equal(ammoProfile('revolver',{revolver:'invalid'}).capacity,6);
});
test('birdshot density and slug accuracy preserve each physical muzzle',()=>{
 for(const [type,count] of [['birdshot',160],['slug',2]]){const profile=AMMO_MODS.shotgun[type],rays=shotgunPellets(o,d,{x:0,y:0,z:1},'mods',2,profile);assert.equal(rays.length,count);assert.notEqual(rays[0].origin.z,rays.at(-1).origin.z);for(const r of rays)assert.ok(Math.acos(Math.min(1,r.direction.x))<=profile.spread*Math.PI/180+1e-9);}
 const w=createVoxelWalls(),hit=destructiveShot(o,d,[],[],w,AMMO_MODS.shotgun.slug);assert.ok(hit.wallChanges.flatMap(c=>c.removed).length>50);assert.equal(w.trace(o,d),null);
});
