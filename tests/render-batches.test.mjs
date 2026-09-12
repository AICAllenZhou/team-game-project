import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {batchMeshes,createParticles} from '../render-batches.js';

test('batching preserves transformed surfaces and bounds while reducing fixed meshes',()=>{
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial();
 const a=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material),b=new THREE.Mesh(new THREE.BoxGeometry(2,1,1),material);
 a.position.set(2,1,-3);b.position.set(-2,0,1);b.rotation.y=.4;group.add(a,b);
 group.updateMatrixWorld(true);const before=new THREE.Box3().setFromObject(group);const count=a.geometry.index.count+b.geometry.index.count;
 batchMeshes(group);assert.equal(group.children.length,1);assert.equal(group.children[0].geometry.attributes.position.count,count);
 group.updateMatrixWorld(true);const after=new THREE.Box3().setFromObject(group);
 assert.ok(before.min.distanceTo(after.min)<1e-6);assert.ok(before.max.distanceTo(after.max)<1e-6);
 const normal=group.children[0].geometry.attributes.normal;
 for(let i=0;i<normal.count;i++)assert.ok(Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)<1e-6);
});
test('animated child pivots and differing shadow flags stay independent',()=>{
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial(),pivot=new THREE.Group();
 for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(),material);m.castShadow=i<2;group.add(m);}
 const moving=new THREE.Mesh(new THREE.BoxGeometry(),material);pivot.add(moving);group.add(pivot);batchMeshes(group);
 assert.equal(group.children.length,3);assert.equal(moving.parent,pivot);assert.equal(pivot.parent,group);
 pivot.rotation.x=.5;assert.equal(pivot.rotation.x,.5);
});
test('particle draws are bounded, fade independently, expire and reuse their buffers',()=>{
 const scene=new THREE.Scene(),particles=createParticles(scene),origin=new THREE.Vector3(1,2,3),direction=new THREE.Vector3(0,0,-1);
 particles.emit(origin,direction,0xff0000,100,false);particles.emit(origin,direction,0xaaaaaa,100,true);particles.update(0);
 assert.equal(scene.children.length,2);assert.deepEqual(particles.groups.map(g=>g.mesh.count),[32,48]);
 const [smoke,sparks]=particles.groups;const buffer=sparks.mesh.instanceMatrix.array;
 assert.ok(smoke.opacity.getX(0)<.05);assert.equal(sparks.opacity.getX(0),1);
 particles.update(.1);assert.ok(sparks.opacity.getX(0)>0&&sparks.opacity.getX(0)<1);
 particles.update(2);assert.deepEqual(particles.groups.map(g=>g.mesh.count),[0,0]);
 particles.emit(origin,direction,0x00ff00,3,false);particles.update(0);assert.equal(sparks.mesh.count,3);assert.equal(sparks.mesh.instanceMatrix.array,buffer);
 const color=new THREE.Color();sparks.mesh.getColorAt(0,color);assert.equal(color.getHex(),0x00ff00);
});
