import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {shotgunPellets,SHOTGUN_SPREAD,SHOTGUN_SEPARATION,shotgunDischarge} from '../weapons.mjs';
import {createShotgun,animateShotgun} from '../shotgun-view.js';
import {resolveBarrelShot} from '../simulation.mjs';
import {captureBarrelRay,placeWeapon,WEAPON_REACH,SHOTGUN_REACH} from '../weapon-pose.js';

test('double barrel emits exactly 12 pellets per muzzle with normalized bounded spread',()=>{
 const pellets=shotgunPellets({x:0,y:1,z:0},{x:0,y:0,z:-1},{x:1,y:0,z:0},'shot1',2);
 assert.equal(pellets.length,24);
 for(let i=0;i<24;i++){const p=pellets[i];assert.equal(p.origin.x,(i<12?-1:1)*SHOTGUN_SEPARATION/2);assert.ok(Math.abs(Math.hypot(p.direction.x,p.direction.y,p.direction.z)-1)<1e-12);assert.ok(Math.acos(-p.direction.z)<=SHOTGUN_SPREAD);}
 assert.ok(pellets.some(p=>p.direction.x<0)&&pellets.some(p=>p.direction.x>0));
 assert.deepEqual(pellets,shotgunPellets({x:0,y:1,z:0},{x:0,y:0,z:-1},{x:1,y:0,z:0},'shot1',2));
 assert.notDeepEqual(pellets,shotgunPellets({x:0,y:1,z:0},{x:0,y:0,z:-1},{x:1,y:0,z:0},'shot2',2));
});
test('spread follows barrel direction and roll even vertically, with safe fallback axes',()=>{
 for(const direction of [{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:-1}])for(const right of [direction,{x:0,y:0,z:0},{x:1e308,y:1e308,z:1e308},undefined]){
  for(const p of shotgunPellets({x:0,y:0,z:0},direction,right,'axis')){assert.ok(Object.values(p.direction).every(Number.isFinite));assert.ok(Math.acos(Math.min(1,p.direction.x*direction.x+p.direction.y*direction.y+p.direction.z*direction.z))<=SHOTGUN_SPREAD+1e-10);}
 }
 const rolled=shotgunPellets({x:0,y:0,z:0},{x:0,y:0,z:-1},{x:0,y:1,z:0},'roll',2);assert.equal(rolled[0].origin.y,-SHOTGUN_SEPARATION/2);assert.equal(rolled[12].origin.y,SHOTGUN_SEPARATION/2);
});
test('shotgun ray uses the shortened physical barrels and RMB retains the revolver free-aim pose',()=>{
 const rig=new THREE.Group(),material=new THREE.MeshStandardMaterial(),gun=createShotgun(rig,material,material,material);
 const hip={};placeWeapon(rig,hip);const hipY=rig.position.y;
 for(const focus of [0,.5,1]){placeWeapon(rig,{shotgun:true,focus,yaw:.3,pitch:.1});assert.ok(Math.abs(rig.position.length()-SHOTGUN_REACH)<1e-9);}
 placeWeapon(rig,{shotgun:true,focus:1});assert.ok(Math.abs(rig.position.y)<Math.abs(hipY));
 const ray=captureBarrelRay(gun),expected=gun.localToWorld(new THREE.Vector3(0,.025,-.64));assert.ok(ray.origin.distanceTo(expected)<1e-9);
});

test('single clicks alternate loaded barrels and right click spends only loaded shells',()=>{
 for(const [ammo,both,barrel,cost] of [[2,false,0,1],[1,false,1,1],[2,true,2,2],[1,true,1,1],[0,true,1,0]]){
  const discharge=shotgunDischarge(ammo,both);assert.deepEqual(discharge,{barrel,cost});
  if(!cost)continue;
  const rays=shotgunPellets({x:0,y:0,z:0},{x:0,y:0,z:-1},{x:1,y:0,z:0},'trigger',barrel);
  assert.equal(rays.length,12*cost);
  assert.equal(new Set(rays.map(r=>r.origin.x)).size,cost);
 }
});

test('each hammer drops independently and the enlarged muzzle stays valid',()=>{
 const rig=new THREE.Group(),m=new THREE.MeshStandardMaterial(),gun=createShotgun(rig,m,m,m);
 const [left,right]=gun.userData.hammers;
 animateShotgun(gun,1,1);assert.ok(left.rotation.x<-.7);assert.ok(right.rotation.x>.3);
 animateShotgun(gun,0,1);assert.ok(right.rotation.x<-.7);
 animateShotgun(gun,2,1);assert.ok(left.rotation.x>.3&&right.rotation.x>.3);
 placeWeapon(rig,{});rig.position.y+=1.5;
 const ray=captureBarrelRay(gun);
 assert.ok(resolveBarrelShot({x:0,y:0,z:0,weapon:'shotgun'}, {muzzle:ray.origin,direction:ray.direction}));
});

test('reload opens, ejects, inserts each shell and closes without stranded parts',()=>{
 const m=new THREE.MeshStandardMaterial(),gun=createShotgun(new THREE.Group(),m,m,m),d=gun.userData;
 animateShotgun(gun,0,1,.12);assert.ok(d.barrels.rotation.x<0);assert.ok(d.shells.every(s=>!s.visible));
 animateShotgun(gun,0,1,.3);assert.ok(d.ejected.every(s=>!s.visible));
 animateShotgun(gun,0,1,.5);assert.equal(d.shells[0].visible,true);assert.equal(d.shells[1].visible,false);assert.ok(d.ejected.every(s=>!s.visible));
 animateShotgun(gun,0,1,.8);assert.ok(d.shells.every(s=>s.visible&&Math.abs(s.position.z+.035)<1e-9));
 animateShotgun(gun,2,1,-1);assert.equal(Math.abs(d.barrels.rotation.x),0);assert.ok([...d.shells,...d.ejected].every(s=>!s.visible));assert.ok(d.supportHand.position.distanceTo(new THREE.Vector3(-.025,-.117,-.32))<1e-6);
});

test('hammer striking tips meet the rear breech behind the barrel axes',()=>{
 const m=new THREE.MeshStandardMaterial(),gun=createShotgun(new THREE.Group(),m,m,m);animateShotgun(gun,0,1);gun.updateMatrixWorld(true);
 for(const hammer of gun.userData.hammers){const tip=hammer.localToWorld(new THREE.Vector3(0,.063,.007)),breech=gun.localToWorld(new THREE.Vector3(hammer.position.x,.025,-.015));assert.ok(tip.distanceTo(breech)<.01);}
});
