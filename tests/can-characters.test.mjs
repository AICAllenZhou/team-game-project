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
 for(let i=0;i<2520;i++)effects.update(1/120);
 assert.ok(Math.abs(can.rotation.x)>.5);assert.ok(can.userData.ragdoll.y>=.4);assert.ok(Math.abs(can.userData.ragdoll.vy)<.5);
 assert.ok(Number.isFinite(can.position.z));
 const debris=scene.getObjectByName('can-food-pieces');assert.equal(debris.count,0);
 resetCan(can);effects.update(1/60);assert.equal(can.userData.ragdoll,null);
});


test('death hides the held weapon and ejects an independent lid high above the can',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(1),effects=createCanEffects(scene);scene.add(can);
 const hand=new THREE.Group();hand.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));can.add(hand);can.userData.rightHand=hand;
 effects.kill(can);assert.equal(hand.visible,false);assert.equal(can.userData.lid.visible,false);
 const lid=scene.getObjectByName('ejected-can-lid');assert.ok(lid);assert.equal(lid.parent,scene);
 for(let i=0;i<120;i++)effects.update(1/120);
 assert.ok(lid.position.y>5);resetCan(can);assert.equal(hand.visible,true);assert.equal(can.userData.lid.visible,true);
 assert.equal(lid.parent,scene);for(let i=0;i<1900;i++)effects.update(1/120);assert.equal(lid.parent,null);
});

test('food lands in visible persistent floor splats that eventually expire',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(2),effects=createCanEffects(scene);scene.add(can);
 effects.hit(can,{point:{x:0,y:1,z:.42},direction:{x:0,y:0,z:-1},killed:false});
 for(let i=0;i<360;i++)effects.update(1/120);
 const splats=scene.getObjectByName('food-splats-2');assert.ok(splats.count>0);
 const matrix=new THREE.Matrix4();splats.getMatrixAt(0,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix);assert.ok(position.y>.01&&position.y<.02);
 for(let i=0;i<4200;i++)effects.update(1/120);assert.equal(splats.count,0);
});
