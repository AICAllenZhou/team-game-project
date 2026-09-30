import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createCanBody,stepCanBody,placeCanBody} from '../can-physics.js';
import {createFoodGeometry} from '../food-geometry.js';

test('an undisturbed can rests on its base without invented tipping or hovering',()=>{
 const body=createCanBody(new THREE.Vector3(),new THREE.Quaternion(),{x:0,y:0,z:0},null),root=new THREE.Group();
 for(let i=0;i<600;i++)stepCanBody(body,1/120);placeCanBody(root,body);
 assert.ok(Math.abs(root.position.y)<1e-7);assert.ok(body.angular.length()<1e-7);assert.ok(body.quaternion.angleTo(new THREE.Quaternion())<1e-7);
});
test('impact offset determines spin and the cylinder rests at its actual contact surface',()=>{
 const direction={x:0,y:0,z:-1},position=new THREE.Vector3(),q=new THREE.Quaternion();
 const center=createCanBody(position,q,direction,{x:0,y:.8,z:.42}),edge=createCanBody(position,q,direction,{x:.3,y:1.3,z:.42});
 assert.ok(edge.angular.length()>center.angular.length());
 for(let i=0;i<1200;i++)stepCanBody(edge,1/120);
 const up=new THREE.Vector3(0,1,0).applyQuaternion(edge.quaternion),lowest=edge.position.y+(.9-edge.com)*up.y-.9*Math.abs(up.y)-.42*Math.sqrt(1-up.y*up.y);
 assert.ok(Math.abs(lowest)<.01);assert.ok(edge.velocity.length()<.15);
});
test('food geometry has distinct bean curves and tapered corn rather than shared lumps',()=>{
 const bean=createFoodGeometry(0),corn=createFoodGeometry(2);bean.computeBoundingBox();corn.computeBoundingBox();
 assert.ok(bean.boundingBox.max.x>corn.boundingBox.max.x*1.5);
 assert.ok(bean.boundingBox.max.y+bean.boundingBox.min.y>.15);
 assert.ok(corn.boundingBox.min.y>=-.751);
});


test('loose lids settle flat from edge-on and tilted landings at different frame rates',async()=>{
 const {stepCanLid}=await import('../can-physics.js');
 for(const dt of [1/30,1/144])for(const tilt of [Math.PI/2,.5,2.4]){
  const mesh=new THREE.Group();mesh.position.y=1;mesh.rotation.set(tilt,.7,.2);
  const lid={mesh,vx:1,vy:-2,vz:.4,wx:5,wz:3};
  for(let time=0;time<8;time+=dt)stepCanLid(lid,dt);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion);
  assert.ok(Math.abs(up.y)>.999);assert.ok(mesh.position.y<.03);assert.ok(Math.hypot(lid.vx,lid.vz)<.01);
 }
});
