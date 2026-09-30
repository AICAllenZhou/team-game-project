import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createCanCharacter,createCanEffects,resetCan} from '../can-characters.js';

test('impact removes metal triangles at the contact point, reset repairs them',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(0),effects=createCanEffects(scene);scene.add(can);
 const original=can.userData.shell.geometry.attributes.position.count;
 effects.hit(can,{point:{x:0,y:1,z:.42},direction:{x:0,y:0,z:-1},killed:false});
 assert.ok(can.userData.shell.geometry.index.count<original);assert.equal(can.userData.holes.length,1);
 assert.equal(can.userData.tears.length,1);resetCan(can);assert.equal(can.userData.shell.geometry.index,null);assert.equal(can.userData.tears.length,0);
});
test('dead cans tumble and settle above the floor, food debris remains bounded',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(2),effects=createCanEffects(scene);scene.add(can);
 effects.hit(can,{point:{x:0,y:1,z:.42},direction:{x:0,y:0,z:-1},killed:true});
 for(let i=0;i<1200;i++)effects.update(1/120);
 assert.ok(Math.abs(can.rotation.x)>.5);assert.ok(can.userData.ragdoll.y>=.4);assert.ok(Math.abs(can.userData.ragdoll.vy)<.5);
 assert.ok(Number.isFinite(can.position.z));
 const debris=scene.children.find(c=>c.isInstancedMesh);assert.equal(debris.count,0);
 resetCan(can);effects.update(1/60);assert.equal(can.userData.ragdoll,null);
});
