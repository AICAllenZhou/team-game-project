import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from '../vendor/three.module.js';
import {placeWeapon,WEAPON_REACH,freeAimInput,followAim,stepRecoil,kickRecoil,captureBarrelRay} from '../weapon-pose.js';
import {resolveBarrelShot} from '../simulation.mjs';

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
 for(let i=0;i<hz*10;i++){followAim(s,1/hz);assert.ok(s.handYaw>=-.56&&s.handYaw<=0);}
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
 assert.ok(peak>.6&&peak<1.1);assert.ok(Math.abs(s.angle)<.001);
 }
});

test('camera sensitivity changes smoothly through the free-aim edge',()=>{
 let previousGain=null;
 for(let free=.15;free<.34;free+=.002){const s={freeX:Math.min(.279,free),freeY:0,lookYaw:0,lookPitch:0};freeAimInput(s,1,0,0);const gain=-s.lookYaw;
 if(previousGain!==null)assert.ok(Math.abs(gain-previousGain)<.0001);previousGain=gain;
 }
});

test('same mouse travel gives identical camera rotation throughout the hand range',()=>{
 for(const focus of [0,1]){let expected;
 for(const free of [-.56,-.28,0,.28,.56]){const s={freeX:free,freeY:0,lookYaw:0,lookPitch:0};freeAimInput(s,12,0,focus);
 if(expected===undefined)expected=s.lookYaw;else assert.ok(Math.abs(expected-s.lookYaw)<1e-12);
 }}
});
test('camera recoil starts with velocity, not an instantaneous angle jump',()=>{
 const head={angle:0,velocity:1.1};assert.equal(head.angle,0);stepRecoil(head,1/144);assert.ok(head.angle>0&&head.angle<.01);
});
test('delayed mouse input cannot cause an instantaneous camera velocity jump',()=>{
 for(const hz of [30,60,144]){const s={yaw:0,pitch:0,lookYaw:12,lookPitch:.7,freeX:0,freeY:0,handYaw:0,handPitch:0,yawVelocity:0,pitchVelocity:0};
 for(let i=0;i<hz*2;i++){const before=s.yaw,velocity=s.yawVelocity;followAim(s,1/hz);assert.ok(Math.abs(s.yaw-before)<=8/hz+1e-9);assert.ok(Math.abs(s.yawVelocity-velocity)<=80/hz+1e-9);}
 }
});

test('beam and bullet share an immutable muzzle ray through aim and recoil',()=>{
 const camera=new Group(),rig=new Group(),wrist=new Group(),gun=new Group();camera.add(rig);rig.add(wrist);wrist.add(gun);
 camera.position.set(10,1.5,3);camera.rotation.set(.2,.8,.05,'YXZ');wrist.position.set(0,-.13,.07);gun.position.set(0,.13,-.07);
 placeWeapon(rig,{yaw:-.4,pitch:.1});wrist.rotation.x=.3;
 const ray=captureBarrelRay(gun),savedOrigin=ray.origin.clone(),savedDirection=ray.direction.clone();
 const authoritative=resolveBarrelShot({x:10,y:0,z:3,gunYaw:0,gunPitch:0},{muzzle:ray.origin,direction:ray.direction});
 assert.ok(new Vector3(authoritative.origin.x,authoritative.origin.y,authoritative.origin.z).distanceTo(ray.origin)<1e-10);
 assert.ok(new Vector3(authoritative.direction.x,authoritative.direction.y,authoritative.direction.z).distanceTo(ray.direction)<1e-10);
 wrist.rotation.x+=.6;captureBarrelRay(gun);assert.deepEqual(ray.origin,savedOrigin);assert.deepEqual(ray.direction,savedDirection);
 const bullet=ray.origin.clone().addScaledVector(ray.direction,20);assert.ok(bullet.sub(ray.origin).cross(ray.direction).length()<1e-10);
});
test('fan fire adds twelve percent more recoil impulse',()=>{
 const normal={angle:0,velocity:0},fan={angle:0,velocity:0};kickRecoil(normal);kickRecoil(fan,true);
 assert.ok(Math.abs(fan.velocity/normal.velocity-1.12)<1e-10);assert.ok(Math.abs(fan.angle/normal.angle-1.12)<1e-10);
});
