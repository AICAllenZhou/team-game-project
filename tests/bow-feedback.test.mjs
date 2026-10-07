import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createBow,createArrow,animateBow,updateBowVisibility,ARROW_TIP_Z} from '../bow-view.js';
import {createBowMarker,placeBowMarker,createBowGuide,placeBowGuide,seatArrow,wobbleStuckArrow} from '../bow-feedback.js';
import {chargedArrow} from '../weapons.mjs';
import {launchProjectile,advanceProjectile,advanceVisualProjectile,predictArrowImpact} from '../projectile-physics.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {bowSoundSamples} from '../weapon-audio.js';

test('ballistic preview matches actual impacts without changing walls or targets',()=>{
 const targets=[{id:'can',x:10,y:0,z:0,hp:100}];
 for(const charge of [0,.5,1])for(const ray of [
  {origin:{x:10,y:1.2,z:8},direction:{x:0,y:0,z:-1}},
  {origin:{x:14,y:1,z:-5},direction:{x:1,y:0,z:0}},
  {origin:{x:10,y:3,z:12},direction:{x:0,y:-.6,z:-.8}}
 ]){
  const walls=createVoxelWalls(),before=JSON.stringify(walls.snapshot()),profile=chargedArrow(charge),expected=predictArrowImpact(ray,profile,targets,[],walls);
  assert.ok(expected?.surface);assert.equal(JSON.stringify(walls.snapshot()),before);assert.equal(targets[0].hp,100);
  const arrow=launchProjectile(ray,profile,{weapon:'bow'});let actual;
  for(let i=0;i<180&&arrow.alive&&!actual;i++)actual=advanceProjectile(arrow,.05,targets,[],walls)[0]||actual;
  assert.deepEqual(actual.point,expected.point);assert.equal(actual.surface,expected.surface);
 }
});
test('quick shots fly slower and drop farther; stopped visuals never advance again',()=>{
 const ray={origin:{x:10,y:8,z:20},direction:{x:0,y:0,z:-1}},quick=launchProjectile(ray,chargedArrow(0),{weapon:'bow'}),full=launchProjectile(ray,chargedArrow(1),{weapon:'bow'});
 advanceVisualProjectile(quick,.2);advanceVisualProjectile(full,.2);
 assert.ok(quick.position.z-full.position.z>10);assert.ok(quick.position.y<full.position.y);
 quick.alive=false;const before=structuredClone(quick);advanceVisualProjectile(quick,.1);assert.deepEqual(quick,before);
});
test('first-person draw fades near the eye without fading remote bows or flying arrows',()=>{
 const scene=new THREE.Group(),bow=createBow(scene,{firstPerson:true}),remote=createBow(scene),arrow=createArrow(),eye=new THREE.Vector3();
 bow.position.z=-.7;animateBow(bow,0,true);assert.equal(updateBowVisibility(bow,eye,0),.55);
 const hand=bow.userData.drawHand;hand.getWorldPosition(eye);updateBowVisibility(bow,eye,0);assert.equal(hand.material.opacity,0);
 updateBowVisibility(bow,eye,.82);assert.ok(bow.userData.limbs.material.opacity>0&&bow.userData.limbs.material.opacity<1);
 updateBowVisibility(bow,eye,1);assert.equal(bow.userData.limbs.material.opacity,0);
 updateBowVisibility(remote,eye,1);assert.equal(remote.userData.limbs.material.opacity,1);assert.equal(arrow.children[0].material.opacity,1);
});
test('arrows embed deeper while keeping the shaft visible; moving and rotating a can carries the exposed shaft',()=>{
 const scene=new THREE.Scene(),wallArrow=createArrow();scene.add(wallArrow);
 const result={point:{x:0,y:1,z:0},direction:{x:0,y:0,z:-1}};
 const rest=seatArrow(wallArrow,result);const tip=wallArrow.localToWorld(new THREE.Vector3(0,0,ARROW_TIP_Z)),tail=wallArrow.localToWorld(new THREE.Vector3(0,0,.4));
 assert.ok(Math.abs(tip.z+.18)<1e-9);assert.ok(tail.z>.7);wobbleStuckArrow(wallArrow,rest,2);assert.ok(wallArrow.quaternion.angleTo(rest)<1e-7);
 const can=new THREE.Group(),body=new THREE.Group();body.position.y=.9;can.add(body);can.userData.body=body;scene.add(can);can.position.z=.2;
 const arrow=createArrow();scene.add(arrow);seatArrow(arrow,{...result,point:{x:0,y:1,z:.42}},can);
 const local=arrow.position.clone(),before=arrow.getWorldPosition(new THREE.Vector3());can.position.x+=3;can.rotation.z=.4;
 assert.deepEqual(arrow.position,local);assert.ok(arrow.getWorldPosition(new THREE.Vector3()).distanceTo(before)>2.5);
 const seatedTip=body.worldToLocal(arrow.localToWorld(new THREE.Vector3(0,0,ARROW_TIP_Z)));assert.ok(Math.abs(Math.hypot(seatedTip.x,seatedTip.z)-(.422-.18))<1e-8);
});
test('surface marker keeps a fixed world size, shrinks on screen with distance and hides on misses',()=>{
 const scene=new THREE.Scene(),marker=createBowMarker(scene),camera=new THREE.PerspectiveCamera(90,1,.05,100);
 const width=z=>{placeBowMarker(marker,{surface:'world',point:{x:0,y:0,z},normal:{x:0,y:0,z:1}});const a=marker.localToWorld(new THREE.Vector3(-.095,0,0)).project(camera),b=marker.localToWorld(new THREE.Vector3(.095,0,0)).project(camera);return b.x-a.x;};
 assert.ok(width(-3)>width(-15)*4.9);assert.equal(marker.scale.x,1);placeBowMarker(marker,null);assert.equal(marker.visible,false);
});
test('bow sounds have soft endpoints, audible attacks and no clipping',()=>{
 for(const kind of ['release','wood','metal']){
  const data=bowSoundSamples(48000,kind);let peak=0,energy=0;
  for(const sample of data){assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
  assert.ok(data[0]===0);assert.ok(Math.abs(data.at(-1))<1e-5);assert.ok(peak>.15&&peak<1);assert.ok(energy/data.length>.0001);
 }
});

test('aiming line appears only above 10% and terminates exactly at the impact cross',()=>{
 const scene=new THREE.Scene(),guide=createBowGuide(scene),path=[],ray={origin:{x:10,y:2,z:10},direction:{x:0,y:-.6,z:-.8}};
 const hit=predictArrowImpact(ray,chargedArrow(.5),[],[],null,path);
 assert.ok(path.length>1);assert.deepEqual(path[0],ray.origin);
 for(const axis of ['x','y','z'])assert.ok(Math.abs(path.at(-1)[axis]-hit.point[axis])<1e-8);
 for(const charge of [0,.099,.1]){placeBowGuide(guide,path,charge);assert.equal(guide.visible,false);}
 placeBowGuide(guide,path,.101);assert.equal(guide.visible,true);assert.equal(guide.geometry.drawRange.count,path.length);
 const endpoint=new THREE.Vector3().fromBufferAttribute(guide.geometry.attributes.position,path.length-1);
 assert.ok(endpoint.distanceTo(new THREE.Vector3(hit.point.x,hit.point.y,hit.point.z))<1e-5);
});
