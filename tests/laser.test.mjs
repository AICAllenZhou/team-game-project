import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {AMMO_MODS,canUseAmmo} from '../weapons.mjs';
import {traceLaser} from '../projectile-physics.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {createRoomEngine} from '../room-engine.mjs';
import {DUEL_BOUNDS} from '../arena.mjs';
import {createLaserEffects} from '../laser-view.js';
import {wallSurface} from '../voxel-wall-view.js';
const profile=AMMO_MODS.revolver.laser;
test('laser instantly drills a complete wall tunnel and strikes a can behind it',()=>{
 const world=createVoxelWalls(),other=createVoxelWalls(),target={id:'can',x:17,y:0,z:-5,hp:100},ray={origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}};
 const beam=traceLaser(ray,profile,[target],[],world,{shooter:'admin',shotId:'laser'}),wall=beam.impacts.find(h=>h.surface==='voxel'),hit=beam.impacts.find(h=>h.hit);
 assert.ok(wall.wallChanges[0].removed.length>4);assert.equal(beam.impacts.filter(h=>h.surface==='voxel').length,1,'One compact event per wall');
 assert.equal(world.trace(ray.origin,ray.direction),null);assert.equal(hit.damage,100);assert.ok(hit.exitPoint);assert.equal(hit.penetrated,true);assert.equal(profile.recoil,0);
 for(const h of beam.impacts)for(const change of h.wallChanges)other.apply(change.wallId,change.removed);
 assert.deepEqual(other.snapshot(),world.snapshot());assert.ok(world.trace({...ray.origin,z:-3},ray.direction),'Adjacent wall remains intact');
});
test('laser crosses the expanded arena and stops at its indestructible boundary',()=>{
 const world=createVoxelWalls('duel'),ray={origin:{x:-48,y:1.5,z:6},direction:{x:1,y:0,z:0}};
 const beam=traceLaser(ray,profile,[],[],world);assert.ok(beam.end.x-ray.origin.x>90);assert.ok(Math.abs(beam.end.x-DUEL_BOUNDS.x)<1e-7);
 assert.equal(beam.impacts.at(-1).surface,'world');assert.equal(beam.impacts.at(-1).stopped,true);
});
test('only a verified admin loadout grants laser; ordinary commands cannot forge it',()=>{
 let time=10000;const events=[],values=[14,-5,17,-5].map(v=>v/36+.5),engine=createRoomEngine({now:()=>time,random:()=>values.shift()??.5,emit:(type,data)=>events.push({type,data})});
 engine.addPlayer({id:'admin',name:'Admin'});engine.addPlayer({id:'guest',name:'Guest'});
 assert.equal(canUseAmmo({ownedAmmo:['revolver:laser']},'revolver','laser'),false);
 engine.command('admin','input',{active:false,mods:{revolver:'laser'},adminAmmo:['revolver:laser']});
 engine.command('admin','fire',{direction:{x:1,y:0,z:0},profile,mod:'laser'});
 assert.ok(!events.find(e=>e.type==='shot').data.profile.laser);assert.ok(engine.wallSnapshot().every(w=>w.length===0));
 engine.setPlayerLoadout('admin',{revision:'grant',mods:{revolver:'laser'}});time+=300;
 const before=events.length;engine.command('admin','fire',{direction:{x:1,y:0,z:0},muzzleOffset:{x:0,y:-.5,z:0},shotId:'laser'});
 assert.equal(engine.snapshot().players.find(p=>p.id==='guest').hp,0,'Damage happens during fire, before a tick');
 assert.ok(events.slice(before).some(e=>e.type==='shot'&&e.data.laserEnd));assert.ok(events.slice(before).some(e=>e.type==='wallDamage'));
 engine.setMap({id:'duel',revision:'arena'});
 assert.throws(()=>engine.command('guest','loadout',{secondary:'bow',revolver:'laser',adminAmmo:['revolver:laser']}),{status:403});
 assert.doesNotThrow(()=>engine.command('admin','loadout',{secondary:'bow',revolver:'laser'}));
});
test('red beam uses a fixed pool, ends at the authoritative hit and disappears',()=>{
 const scene=new THREE.Scene(),effects=createLaserEffects(scene);effects.fire({x:0,y:1,z:0},{x:20,y:1,z:0});const beam=scene.children.find(m=>m.visible);
 assert.equal(beam.position.x,10);assert.equal(beam.scale.y,20);assert.ok(beam.children[0].material.color.r>beam.children[0].material.color.g);
 for(let i=0;i<40;i++)effects.fire({x:0,y:1,z:0},{x:20,y:1,z:0});assert.equal(scene.children.length,12);
 effects.update(.2);assert.ok(scene.children.every(m=>!m.visible));effects.fire({x:0,y:1,z:0},{x:2,y:1,z:0});effects.clear();assert.ok(scene.children.every(m=>!m.visible));
});
test('merged voxel mesh preserves a cell-sized through hole and correct face directions',()=>{
 const world=createVoxelWalls(),w=world.walls[0],ray=new THREE.Raycaster(new THREE.Vector3(14,1.05,-4.95),new THREE.Vector3(1,0,0));
 const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(wallSurface(w),material);assert.ok(ray.intersectObject(mesh).length>0);mesh.geometry.dispose();
 let hit;while(hit=world.trace(ray.ray.origin,ray.ray.direction))world.damage(hit,0);
 mesh.geometry=wallSurface(w);assert.equal(ray.intersectObject(mesh).length,0);ray.ray.origin.z+=w.cell;assert.ok(ray.intersectObject(mesh).length>0);
 assert.ok(mesh.geometry.attributes.position.count<1000);mesh.geometry.dispose();material.dispose();
});
