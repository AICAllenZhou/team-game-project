import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createCanCharacter,createCanEffects,resetCan} from '../can-characters.js';

function cast(can,x=0,y=1,z=2,direction=new THREE.Vector3(0,0,-1),meshes=[can.userData.shell,can.userData.interior,can.userData.sauce]){can.updateWorldMatrix(true,true);return new THREE.Raycaster(new THREE.Vector3(x,y,z),direction).intersectObjects(meshes,false);}

test('impact removes metal triangles at the contact point, reset repairs them',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(0),effects=createCanEffects(scene);scene.add(can);
 const original=can.userData.shell.geometry.attributes.position.count;
 effects.hit(can,{point:{x:0,y:1,z:.42},direction:{x:0,y:0,z:-1},killed:false});effects.update(0);
 assert.equal(cast(can)[0].object,can.userData.sauce);assert.equal(can.userData.holes.length,1);
 assert.equal(can.userData.tears.length,1);resetCan(can);assert.equal(can.userData.shell.geometry.attributes.position.count,original);assert.equal(cast(can)[0].object,can.userData.shell);assert.equal(can.userData.tears.length,0);
});
test('dead cans tumble and settle above the floor, food debris remains bounded',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(2),effects=createCanEffects(scene);scene.add(can);
 effects.hit(can,{point:{x:0,y:1,z:.42},direction:{x:0,y:0,z:-1},killed:true});
 for(let i=0;i<2520;i++)effects.update(1/120);
 assert.ok(Math.abs(can.rotation.x)>.5);assert.ok(can.userData.ragdoll.position.y>=.4);assert.ok(Math.abs(can.userData.ragdoll.velocity.y)<.5);
 assert.ok(Number.isFinite(can.position.z));
 const debris=scene.getObjectByName('can-food-pieces-2');assert.equal(debris.count,0);
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
 effects.hit(can,{point:{x:0,y:1,z:.42},direction:{x:0,y:0,z:-1},killed:false});effects.update(0);
 for(let i=0;i<360;i++)effects.update(1/120);
 const splats=scene.getObjectByName('food-splats-2');assert.ok(splats.count>0);
 const matrix=new THREE.Matrix4();splats.getMatrixAt(0,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix);assert.ok(position.y>.01&&position.y<.02);
 resetCan(can);for(let i=0;i<1800;i++)effects.update(1/120);assert.equal(splats.count,0);
});


test('ammo damage controls torn opening size and penetration cuts both sides',()=>{
 function hit(radius){const scene=new THREE.Scene(),can=createCanCharacter(0),effects=createCanEffects(scene);scene.add(can);effects.hit(can,{point:{x:0,y:1,z:.42},exitPoint:{x:0,y:1,z:-.42},direction:{x:0,y:0,z:-1},holeRadius:radius});effects.update(0);return can;}
 const bird=hit(.0121),revolver=hit(.0745),slug=hit(.262);
 assert.equal(revolver.userData.holes.length,2);assert.ok(revolver.userData.holes[0].point.z>0&&revolver.userData.holes[1].point.z<0);
 for(const can of [bird,revolver,slug])assert.equal(cast(can)[0].object,can.userData.sauce);
 assert.equal(cast(bird,.04)[0].object,bird.userData.shell);assert.equal(cast(revolver,.04)[0].object,revolver.userData.sauce);
 assert.equal(cast(revolver,.16)[0].object,revolver.userData.shell);assert.equal(cast(slug,.16)[0].object,slug.userData.sauce);
 for(const can of [bird,revolver,slug])assert.equal(cast(can,0,1,-2,new THREE.Vector3(0,0,1))[0].object,can.userData.sauce);
});

test('sauce drains gradually through submerged holes and respawn refills the can',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(0),effects=createCanEffects(scene);scene.add(can);
 effects.hit(can,{point:{x:0,y:.6,z:.42},direction:{x:0,y:0,z:-1},holeRadius:.075});assert.equal(can.userData.fill,1);
 for(let i=0;i<240;i++)effects.update(1/120);
 assert.ok(can.userData.fill<1&&can.userData.fill>.8);assert.ok(can.userData.sauce.scale.y<1);
 resetCan(can);assert.equal(can.userData.fill,1);assert.equal(can.userData.leaks.length,0);
});


test('vertical penetration cuts the lid and base rather than moving holes to the side',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(0),effects=createCanEffects(scene);scene.add(can);
 effects.hit(can,{point:{x:0,y:1.8,z:0},exitPoint:{x:0,y:0,z:0},direction:{x:0,y:-1,z:0},holeRadius:.075});effects.update(0);
 assert.equal(cast(can,0,3,0,new THREE.Vector3(0,-1,0),[can.userData.capTop,can.userData.sauce])[0].object,can.userData.sauce);
 assert.equal(cast(can,0,-1,0,new THREE.Vector3(0,1,0),[can.userData.capBottom,can.userData.sauce])[0].object,can.userData.sauce);
 resetCan(can);assert.equal(cast(can,0,3,0,new THREE.Vector3(0,-1,0),[can.userData.capTop,can.userData.sauce])[0].object,can.userData.capTop);
});


test('a blast batches surface cuts and a killing top hit stays open on the ejected lid',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(),effects=createCanEffects(scene);scene.add(can);
 const original=can.userData.shell.geometry;
 for(let i=0;i<12;i++)effects.hit(can,{point:{x:0,y:.6+i*.04,z:.42},direction:{x:0,y:0,z:-1},holeRadius:.0745});
 assert.equal(can.userData.shell.geometry,original);effects.update(0);assert.notEqual(can.userData.shell.geometry,original);assert.equal(can.userData.dirtySurfaces.size,0);
 effects.hit(can,{point:{x:0,y:1.8,z:0},direction:{x:0,y:-1,z:0},holeRadius:.075,killed:true});
 const lid=scene.getObjectByName('ejected-can-lid');scene.updateMatrixWorld(true);
 assert.equal(new THREE.Raycaster(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0)).intersectObject(lid.children[0]).length,0);
});


test('fresh entry and exit stay visible after the can reaches its wound limit',()=>{
 const scene=new THREE.Scene(),can=createCanCharacter(),effects=createCanEffects(scene);scene.add(can);
 for(let i=0;i<39;i++)effects.hit(can,{point:{x:.42,y:1,z:0},direction:{x:-1,y:0,z:0},holeRadius:.0121});
 effects.hit(can,{point:{x:0,y:1,z:.42},exitPoint:{x:0,y:1,z:-.42},direction:{x:0,y:0,z:-1},holeRadius:.0745});effects.update(0);
 assert.equal(can.userData.holes.length,40);assert.equal(can.userData.tears.length,40);
 const [entry,exit]=can.userData.holes.slice(-2);assert.equal(entry.exit,false);assert.equal(exit.exit,true);assert.equal(entry.impact,exit.impact);
 assert.ok(exit.radius>entry.radius);
 const meshes=[can.userData.shell,can.userData.interior,can.userData.sauce,...can.userData.tears.flatMap(t=>t.children)];
 assert.equal(cast(can,0,1,2,new THREE.Vector3(0,0,-1),meshes)[0].object,can.userData.sauce);
 assert.equal(cast(can,0,1,-2,new THREE.Vector3(0,0,1),meshes)[0].object,can.userData.sauce);
 resetCan(can);assert.equal(can.userData.tears.length,0);assert.equal(can.userData.holes.length,0);
});
