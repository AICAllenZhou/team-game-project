import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createBow,animateBow,releaseBow,ARROW_TIP_Z} from '../bow-view.js';
import {createBowString,stepBowString,releaseBowString} from '../bow-string.mjs';
import {chargedArrow,WEAPONS} from '../weapons.mjs';
import {launchProjectile,advanceProjectile} from '../projectile-physics.mjs';
import {captureBarrelRay,} from '../weapon-pose.js';
import {createRoomEngine} from '../room-engine.mjs';
import {move} from '../simulation.mjs';
import {createVoxelWalls} from '../voxel-walls.mjs';
import {duelSpawn} from '../arena.mjs';

test('held Space cannot fly or auto-jump after landing; release and press jumps again',()=>{
 for(const mapId of ['practice','duel'])for(const hz of [20,60,144]){
  const world=createVoxelWalls(mapId),p=mapId==='duel'?duelSpawn(0):{x:0,y:0,z:8,vy:0,yaw:0};
  const step=jump=>{const old={...p};move(p,{jump},1/hz,{mapId});world.collide(p,old);};step(false);const floor=p.y;let peak=floor;
  for(let i=0;i<hz*3;i++){step(true);peak=Math.max(peak,p.y);}
  assert.ok(peak>floor+.7&&peak<floor+.86);assert.ok(Math.abs(p.y-floor)<.001);assert.equal(p.grounded,true);
  step(false);step(true);assert.ok(p.y>floor);assert.equal(p.grounded,false);
  const before=p.vy;step(false);step(true);assert.ok(p.vy<before,'Mid-air presses add no lift');
 }
});
test('arrows have visible travel time and a tip-sized opening at every charge',()=>{
 for(const charge of [0,.5,1]){
  const profile=chargedArrow(charge),p=launchProjectile({origin:{x:10,y:1,z:8},direction:{x:0,y:0,z:-1}},profile,{weapon:'bow'});
  const targets=[{id:'target',x:10,y:0,z:0,hp:100}],hits=[];
  for(let t=0;t<.3&&p.alive;t+=.01)hits.push(...advanceProjectile(p,.01,targets,[],null));
  assert.equal(hits.length,1);assert.equal(hits[0].hit,'target');assert.equal(hits[0].holeRadius,.035);assert.ok(hits[0].damage<=100);assert.equal(hits[0].stuck,charge===0);
 }
 assert.equal(chargedArrow(0).headDamage,100);assert.equal(chargedArrow(1).headDamage,100);
});
test('bow starts loading the next arrow in the fire command without a second network round trip',()=>{
 let time=10000;const events=[],e=createRoomEngine({now:()=>time,random:()=>.8,emit:(type,data)=>events.push({type,data})});e.addPlayer({id:'p',name:'Bow'});e.setPlayerLoadout('p',{revision:'bow',hasBow:true,mods:{}});e.command('p','equip',{weapon:'bow'});
 const player=()=>e.snapshot().players[0];e.command('p','fire',{direction:{x:0,y:1,z:0}});
 assert.equal(events.filter(e=>e.type==='shot').length,1);assert.equal(player().ammo,0);assert.equal(player().reloadUntil,time+WEAPONS.bow.reload);
 e.command('p','charge',{active:true});assert.equal(player().chargeAt,null);e.command('p','fire',{});assert.equal(events.filter(e=>e.type==='shot').length,1);
 time+=WEAPONS.bow.reload;e.tick();assert.equal(player().ammo,1);assert.equal(player().reloadUntil,0);
});
test('bowstring endpoints stay pinned, release produces waves, and the rope settles',()=>{
 for(const hz of [20,60,144]){
  const s=createBowString();for(let i=0;i<hz;i++)stepBowString(s,1/hz,1,true);
  assert.ok(Math.abs(s.position[8*3+2]-.47)<.001);assert.ok(Math.abs(s.position[1]+.53)<.001);
  releaseBowString(s);stepBowString(s,1/hz,0,false);assert.notEqual(s.position[8*3+2],.12);
  for(let i=0;i<hz*4;i++)stepBowString(s,1/hz,0,false);
  assert.ok([...s.position].every(Number.isFinite));assert.ok(Math.abs(s.position[8*3+2]-.12)<.09);
  assert.ok(Math.abs(s.position[1]+.63)<.001);assert.ok(Math.abs(s.position[16*3+1]-.63)<.001);
 }
});
test('nocking moves an arrow from the hand into the string; muzzle is the visible arrow tip',()=>{
 const root=new THREE.Group(),bow=createBow(root);releaseBow(bow);
 animateBow(bow,0,false,{dt:.1,reload:.2});const start=bow.userData.arrow.position.clone();assert.equal(bow.userData.arrow.visible,true);
 animateBow(bow,0,false,{dt:.1,reload:.9});assert.ok(bow.userData.arrow.position.distanceTo(start)>.4);
 animateBow(bow,1,true,{dt:.1});const ray=captureBarrelRay(bow),tip=bow.userData.arrow.localToWorld(new THREE.Vector3(0,0,ARROW_TIP_Z));assert.ok(ray.origin.distanceTo(tip)<1e-9);
 assert.equal(bow.userData.string.geometry.attributes.position.count,17);assert.ok(bow.userData.drawHand.visible);
});
