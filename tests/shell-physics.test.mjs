import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createShellPhysics} from '../shell-physics.js';
import {createShotgun,animateShotgun} from '../shotgun-view.js';

test('ejected shells leave the gun, bounce, settle and remain on the floor',()=>{
 const scene=new THREE.Scene(),physics=createShellPhysics(scene),frame=new THREE.Group();scene.add(frame);frame.position.set(0,1.5,0);frame.rotation.x=-.72;frame.scale.setScalar(1.25);
 physics.eject(frame,.022);const shell=physics.shells[0],start=shell.position.clone();
 frame.position.set(20,20,20);physics.update(0);assert.ok(shell.position.distanceTo(start)<1e-9);
 let bounced=false;
 for(let i=0;i<1200;i++){const vy=shell.velocity.y;physics.update(1/120);if(vy<0&&shell.velocity.y>0)bounced=true;assert.ok(shell.position.y>=0);}
 assert.equal(bounced,true);assert.equal(shell.awake,false);assert.equal(physics.body.count,1);assert.ok(Math.abs(shell.position.y-.017*1.25)<1e-9);
 const resting=shell.position.clone();physics.update(1);assert.deepEqual(shell.position,resting);
});
test('shell pool stays bounded and one reload ejects exactly once',()=>{
 const physics=createShellPhysics(new THREE.Scene(),4),m=new THREE.MeshStandardMaterial(),gun=createShotgun(new THREE.Group(),m,m,m);let count=0;
 const eject=frame=>{count++;physics.eject(frame,-.022);physics.eject(frame,.022);};
 for(const p of [.1,.2,.21,.3,.6,.9])animateShotgun(gun,0,.016,p,eject);
 assert.equal(count,1);physics.update(0);assert.equal(physics.body.count,2);
 animateShotgun(gun,2,.016,-1,eject);animateShotgun(gun,0,.016,.25,eject);assert.equal(count,2);
 animateShotgun(gun,2,.016,-1,eject);animateShotgun(gun,0,.016,.25,eject);physics.update(0);assert.equal(physics.body.count,4);assert.equal(physics.shells.length,4);
});

test('settled shells expire after fifteen active seconds and slots can be reused',()=>{
 const physics=createShellPhysics(new THREE.Scene(),2),frame=new THREE.Group();frame.position.y=1;
 physics.eject(frame,0);for(let i=0;i<14*120;i++)physics.update(1/120);
 assert.equal(physics.body.count,1);assert.equal(physics.shells[0].awake,false);
 physics.update(0);assert.equal(physics.body.count,1);
 for(let i=0;i<121;i++)physics.update(1/120);
 assert.equal(physics.body.count,0);assert.equal(physics.caps.count,0);
 physics.eject(frame,0);physics.update(0);assert.equal(physics.body.count,1);
});
