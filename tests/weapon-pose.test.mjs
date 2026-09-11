import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from '../vendor/three.module.js';
import {placeWeapon,WEAPON_REACH} from '../weapon-pose.js';

test('weapon reach stays fixed through extreme turns, walking, recoil and reload',()=>{
 const camera=new Group(),rig=new Group(),left=new Group();camera.add(rig,left);left.position.set(-.4,-.42,-.58);
 camera.position.set(12,1.5,-8);camera.rotation.set(.7,2,.1);
 for(const yaw of [-Math.PI,-.3,0,.3,Math.PI])for(const pitch of [-2,0,2])for(const reload of [false,true]){
  placeWeapon(rig,{yaw,pitch,bob:.03,lean:1,recoil:.45,reload});camera.updateMatrixWorld(true);
  assert.ok(Math.abs(rig.getWorldPosition(new Vector3()).distanceTo(camera.position)-WEAPON_REACH)<1e-10);
  assert.deepEqual(left.position.toArray(),[-.4,-.42,-.58]);
  assert.ok(rig.position.z<-.5,'gun anchor stays in front of the player');
 }
});
