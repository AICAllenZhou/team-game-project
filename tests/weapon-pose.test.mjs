import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from '../vendor/three.module.js';
import {placeWeapon,WEAPON_REACH,freeAimInput,stepRecoil} from '../weapon-pose.js';

test('weapon reach stays fixed through extreme turns, walking, recoil and reload',()=>{
 const camera=new Group(),rig=new Group(),left=new Group();camera.add(rig,left);left.position.set(-.4,-.42,-.58);
 camera.position.set(12,1.5,-8);camera.rotation.set(.7,2,.1);
 for(const yaw of [-Math.PI,-.3,0,.3,Math.PI])for(const pitch of [-2,0,2])for(const reload of [false,true]){
  placeWeapon(rig,{yaw,pitch,bob:.03,lean:1,recoil:.45,reload});camera.updateMatrixWorld(true);
  assert.ok(Math.abs(rig.getWorldPosition(new Vector3()).distanceTo(camera.position)-WEAPON_REACH)<1e-10);
  assert.deepEqual(left.position.toArray(),[-.4,-.42,-.58]);
  assert.ok(rig.position.z<-.4,'gun anchor stays in front of the player');
 }
});

test('wide aim leaves head stationary and RMB provides more travel',()=>{
 const hip={freeX:0,freeY:0,lookYaw:0,lookPitch:0},focus={...hip};
 freeAimInput(hip,140,90,0);assert.equal(hip.lookYaw,0);assert.equal(hip.lookPitch,0);
 freeAimInput(focus,280,180,1);assert.equal(focus.lookYaw,0);assert.equal(focus.lookPitch,0);
 freeAimInput(hip,140,0,0);assert.ok(hip.lookYaw<0);
});
test('releasing focus does not manufacture camera movement',()=>{
 const state={freeX:.5,freeY:.3,lookYaw:1,lookPitch:.2};freeAimInput(state,0,0,0);
 assert.equal(state.lookYaw,1);assert.equal(state.lookPitch,.2);
});
test('wrist recoil kicks upward and recovers at multiple frame rates',()=>{
 for(const hz of [30,60,144]){const s={angle:.065,velocity:9};let peak=0;
 for(let i=0;i<hz*2;i++){stepRecoil(s,1/hz);peak=Math.max(peak,s.angle);}
 assert.ok(peak>.25&&peak<.65);assert.ok(Math.abs(s.angle)<.001);
 }
});
