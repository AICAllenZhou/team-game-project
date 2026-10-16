import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,MeshStandardMaterial} from '../vendor/three.module.js';
import {captureBarrelRay,makeShotPayload,placeWeapon} from '../weapon-pose.js';
import {resolveBarrelShot} from '../simulation.mjs';
import {createShotgun} from '../shotgun-view.js';
import {createBow,animateBow} from '../bow-view.js';
import {AMMO_MODS,chargedArrow,shotgunPellets} from '../weapons.mjs';
import {launchProjectile,advanceProjectile,predictArrowImpact} from '../projectile-physics.mjs';

const vector=value=>new Vector3(value.x,value.y,value.z);
function sameVector(a,b,message){assert.ok(vector(a).distanceTo(vector(b))<1e-10,message);}
function pose(weapon,{yaw=.8,pitch=.15,freeYaw=-.35,freePitch=.12,charge=.65}={}){
 const camera=new Group(),rig=new Group(),wrist=new Group();camera.add(rig);rig.add(wrist);
 const player={x:10,y:0,z:9,gunYaw:-2,gunPitch:-.3,weapon};
 camera.position.set(player.x+.8,player.y+1.8,player.z-.4);camera.rotation.set(pitch,yaw,.03,'YXZ');
 placeWeapon(rig,{yaw:freeYaw,pitch:freePitch,shotgun:weapon==='shotgun'});
 wrist.position.set(0,-.13,.07);wrist.rotation.x=.18;
 let gun;
 if(weapon==='shotgun'){const material=new MeshStandardMaterial();gun=createShotgun(wrist,material,material,material,true);}
 else if(weapon==='bow'){gun=createBow(wrist,{firstPerson:true});animateBow(gun,charge,true);}
 else{gun=new Group();wrist.add(gun);gun.position.set(0,.13,-.07);}
 const ray=captureBarrelRay(gun),payload=makeShotPayload(ray,camera.position,{shotId:'displayed-ray',charge});
 return {camera,rig,wrist,gun,player,ray,payload};
}

test('all weapons preserve the rendered barrel ray while the authority position lags behind',()=>{
 for(const weapon of ['revolver','shotgun','bow'])for(const yaw of [-2.8,0,2.8])for(const side of [-1,1]){
  const f=pose(weapon,{yaw,freeYaw:side*.5}),resolved=resolveBarrelShot(f.player,f.payload);
  assert.ok(resolved,weapon);sameVector(resolved.origin,f.ray.origin,`${weapon} muzzle cannot shift with player prediction`);sameVector(resolved.direction,f.ray.direction,`${weapon} direction matches displayed barrel`);
  const shown=vector(f.ray.origin).addScaledVector(vector(f.ray.direction),40),actual=vector(resolved.origin).addScaledVector(vector(resolved.direction),40);sameVector(actual,shown,'Ray stays aligned at long distance');
  const legacy=resolveBarrelShot(f.player,{...f.payload,renderedEye:undefined});assert.ok(vector(legacy.origin).distanceTo(f.ray.origin)>.8,'Regression would catch reanchoring the old offset to stale position');
 }
});

test('the captured shot remains immutable after recoil, hand animation and camera movement',()=>{
 const f=pose('revolver'),saved=structuredClone(f.payload);
 f.camera.position.add(new Vector3(1,.1,.3));f.wrist.rotation.x+=1;f.ray.origin.set(999,999,999);f.ray.direction.set(1,0,0);
 captureBarrelRay(f.gun);
 assert.deepEqual(f.payload,saved);const resolved=resolveBarrelShot(f.player,f.payload);
 sameVector(resolved.origin,{x:saved.renderedEye.x+saved.muzzleOffset.x,y:saved.renderedEye.y+saved.muzzleOffset.y,z:saved.renderedEye.z+saved.muzzleOffset.z});
});

test('rendered-eye compensation rejects nonfinite or distant poses and cannot extend weapon reach',()=>{
 const f=pose('shotgun');
 for(const eye of [null,{x:NaN,y:1.5,z:9},{x:10,y:Infinity,z:9},{x:10,y:1.5,z:-Infinity},{x:12.001,y:1.5,z:9}])assert.equal(resolveBarrelShot(f.player,{...f.payload,renderedEye:eye}),null);
 assert.equal(resolveBarrelShot(f.player,{...f.payload,muzzleOffset:{x:2.301,y:0,z:0}}),null);
 assert.ok(resolveBarrelShot(f.player,{...f.payload,renderedEye:{x:12,y:1.5,z:9}}),'Boundary of permitted prediction compensation remains valid');
});

test('both shotgun barrels reconstruct identical pellet paths from the compensated aim ray',()=>{
 const f=pose('shotgun',{yaw:-.7}),server=resolveBarrelShot(f.player,f.payload),barrelRight=new Vector3(1,0,0).transformDirection(f.gun.userData.muzzleObject.matrixWorld);
 for(const profile of Object.values(AMMO_MODS.shotgun)){
  const shown=shotgunPellets(f.ray.origin,f.ray.direction,barrelRight,'same-seed',2,profile),actual=shotgunPellets(server.origin,server.direction,barrelRight,'same-seed',2,profile);
  assert.equal(actual.length,profile.pellets*2);
  actual.forEach((pellet,index)=>{sameVector(pellet.origin,shown[index].origin);sameVector(pellet.direction,shown[index].direction);});
 }
});

test('bow flight and predicted landing use the same compensated muzzle and displayed draw',()=>{
 const f=pose('bow',{yaw:.15,pitch:-.2,freePitch:-.1}),server=resolveBarrelShot(f.player,f.payload),profile=chargedArrow(f.payload.charge),path=[];
 const predicted=predictArrowImpact(f.ray,profile,[],[],null,path);assert.ok(predicted,'Preview reaches the floor');
 const arrow=launchProjectile(server,profile,{weapon:'bow'});let impact;
 for(let i=1;i<path.length;i++){
  const hits=advanceProjectile(arrow,.05,[],[],null);sameVector(arrow.position,path[i],'Actual arrow follows each preview segment');if(hits.length){impact=hits[0];break;}
 }
 assert.ok(impact);assert.equal(impact.surface,predicted.surface);sameVector(impact.point,predicted.point,'Impact is exactly on the visible trajectory');
});
