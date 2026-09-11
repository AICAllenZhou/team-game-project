import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from '../vendor/three.module.js';
import {placeWeapon,WEAPON_REACH,freeAimInput,followAim,stepRecoil,kickRecoil} from '../weapon-pose.js';

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

test('wide aim favors the hand while keeping a continuous head response',()=>{
 const hip={freeX:0,freeY:0,lookYaw:0,lookPitch:0},focus={...hip};
 freeAimInput(hip,140,90,0);assert.ok(hip.lookYaw<0&&Math.abs(hip.lookYaw)<hip.freeX);
 freeAimInput(focus,140,90,1);assert.ok(focus.lookYaw<0&&Math.abs(focus.lookYaw)<Math.abs(hip.lookYaw));assert.ok(focus.freeX>hip.freeX);
});

test('camera responds immediately when reversing at either aiming edge',()=>{
 for(const side of [-1,1])for(const focus of [0,1]){
 const s={freeX:side*(.28+.28*focus),freeY:0,lookYaw:0,lookPitch:0};
 freeAimInput(s,-side*5,0,focus);assert.ok(s.lookYaw*side>0);
 }
});
test('centered weapon has identical reach on both sides of the screen',()=>{
 const left=new Group(),right=new Group(),middle=new Group();
 placeWeapon(middle,{});assert.equal(Math.abs(middle.position.x),0);
 for(const angle of [.1,.28,.56,.85]){placeWeapon(left,{yaw:angle});placeWeapon(right,{yaw:-angle});
 assert.ok(Math.abs(left.position.x+right.position.x)<1e-10);assert.equal(left.position.z,right.position.z);
 }
});
test('mouse batching and left/right travel produce consistent angles',()=>{
 for(const focus of [0,1]){const one={freeX:0,freeY:0,lookYaw:0,lookPitch:0},many={...one},reverse={...one};
 freeAimInput(one,1200,0,focus);for(let i=0;i<120;i++)freeAimInput(many,10,0,focus);freeAimInput(reverse,-1200,0,focus);
 assert.ok(Math.abs(one.lookYaw-many.lookYaw)<1e-9);assert.ok(Math.abs(one.lookYaw+reverse.lookYaw)<1e-9);
 }
});
test('hand offsets remain bounded after multiple complete camera turns',()=>{
 for(const hz of [30,60,144]){const s={yaw:0,pitch:0,lookYaw:Math.PI*12,lookPitch:.5,freeX:.56,freeY:.38,handYaw:0,handPitch:0};
 for(let i=0;i<hz*2;i++){followAim(s,1/hz);assert.ok(s.handYaw>=-.56&&s.handYaw<=0);}
 assert.ok(Math.abs(s.yaw-s.lookYaw)<1e-8);assert.ok(Math.abs(s.handYaw+.56)<1e-8);
 }
});
test('releasing focus does not manufacture camera movement',()=>{
 const state={freeX:.5,freeY:.3,lookYaw:1,lookPitch:.2};freeAimInput(state,0,0,0);
 assert.equal(state.lookYaw,1);assert.equal(state.lookPitch,.2);
});
test('wrist recoil kicks upward and recovers at multiple frame rates',()=>{
 for(const hz of [30,60,144]){const s={angle:0,velocity:0};kickRecoil(s);let peak=0;
 for(let i=0;i<hz*2;i++){stepRecoil(s,1/hz);peak=Math.max(peak,s.angle);}
 assert.ok(peak>.45&&peak<.9);assert.ok(Math.abs(s.angle)<.001);
 }
});

test('camera sensitivity changes smoothly through the free-aim edge',()=>{
 let previousGain=null;
 for(let free=.15;free<.34;free+=.002){const s={freeX:Math.min(.279,free),freeY:0,lookYaw:0,lookPitch:0};freeAimInput(s,1,0,0);const gain=-s.lookYaw;
 if(previousGain!==null)assert.ok(Math.abs(gain-previousGain)<.0001);previousGain=gain;
 }
});
