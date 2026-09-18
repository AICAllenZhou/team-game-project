import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {shotgunPellets,SHOTGUN_SPREAD,SHOTGUN_SEPARATION} from '../weapons.mjs';
import {createShotgun} from '../shotgun-view.js';
import {captureBarrelRay,placeWeapon,WEAPON_REACH} from '../weapon-pose.js';

test('double barrel emits exactly 12 pellets per muzzle with normalized bounded spread',()=>{
 const pellets=shotgunPellets({x:0,y:1,z:0},{x:0,y:0,z:-1},{x:1,y:0,z:0},'shot1');
 assert.equal(pellets.length,24);
 for(let i=0;i<24;i++){const p=pellets[i];assert.equal(p.origin.x,(i<12?-1:1)*SHOTGUN_SEPARATION/2);assert.ok(Math.abs(Math.hypot(p.direction.x,p.direction.y,p.direction.z)-1)<1e-12);assert.ok(Math.acos(-p.direction.z)<=SHOTGUN_SPREAD);}
 assert.ok(pellets.some(p=>p.direction.x<0)&&pellets.some(p=>p.direction.x>0));
 assert.deepEqual(pellets,shotgunPellets({x:0,y:1,z:0},{x:0,y:0,z:-1},{x:1,y:0,z:0},'shot1'));
 assert.notDeepEqual(pellets,shotgunPellets({x:0,y:1,z:0},{x:0,y:0,z:-1},{x:1,y:0,z:0},'shot2'));
});
test('spread follows barrel direction and roll even vertically, with safe fallback axes',()=>{
 for(const direction of [{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:-1}])for(const right of [direction,{x:0,y:0,z:0},{x:1e308,y:1e308,z:1e308},undefined]){
  for(const p of shotgunPellets({x:0,y:0,z:0},direction,right,'axis')){assert.ok(Object.values(p.direction).every(Number.isFinite));assert.ok(Math.acos(Math.min(1,p.direction.x*direction.x+p.direction.y*direction.y+p.direction.z*direction.z))<=SHOTGUN_SPREAD+1e-10);}
 }
 const rolled=shotgunPellets({x:0,y:0,z:0},{x:0,y:0,z:-1},{x:0,y:1,z:0},'roll');assert.equal(rolled[0].origin.y,-SHOTGUN_SEPARATION/2);assert.equal(rolled[12].origin.y,SHOTGUN_SEPARATION/2);
});
test('shotgun ray uses the longer physical barrels and RMB retains the revolver free-aim pose',()=>{
 const rig=new THREE.Group(),material=new THREE.MeshStandardMaterial(),gun=createShotgun(rig,material,material,material);
 const hip={};placeWeapon(rig,hip);const hipY=rig.position.y;
 for(const focus of [0,.5,1]){placeWeapon(rig,{shotgun:true,focus,yaw:.3,pitch:.1});assert.ok(Math.abs(rig.position.length()-WEAPON_REACH)<1e-9);}
 placeWeapon(rig,{shotgun:true,focus:1});assert.equal(rig.position.y,hipY);
 const ray=captureBarrelRay(gun),expected=gun.localToWorld(new THREE.Vector3(0,.025,-1.082));assert.ok(ray.origin.distanceTo(expected)<1e-9);
});
