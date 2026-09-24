import * as THREE from './vendor/three.module.js';

// A bounded pool keeps the most recent shells on the floor without adding
// draw calls or continuing to simulate shells that have come to rest.
export function createShellPhysics(scene,capacity=128){
 const bodyGeometry=new THREE.CylinderGeometry(.015,.015,.078,8);bodyGeometry.rotateX(Math.PI/2);
 const capGeometry=new THREE.CylinderGeometry(.017,.017,.016,8);capGeometry.rotateX(Math.PI/2);capGeometry.translate(0,0,.043);
 const body=new THREE.InstancedMesh(bodyGeometry,new THREE.MeshStandardMaterial({color:0x943a27,roughness:.8,flatShading:true}),capacity);
 const caps=new THREE.InstancedMesh(capGeometry,new THREE.MeshStandardMaterial({color:0xb69344,roughness:.45,metalness:.4,flatShading:true}),capacity);
 for(const mesh of [body,caps]){mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}
 const shells=Array.from({length:capacity},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),rotation:new THREE.Quaternion(),spin:new THREE.Vector3(),size:1,age:0,active:false,awake:false}));
 const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),worldRotation=new THREE.Quaternion(),axis=new THREE.Vector3(),delta=new THREE.Quaternion(),rest=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,1);
 let cursor=0,count=0,accumulator=0,dirty=false;
 function eject(frame,x,inheritedVelocity){
  const shell=shells[cursor];cursor=(cursor+1)%capacity;count=Math.min(capacity,count+1);
  frame.updateWorldMatrix(true,false);frame.getWorldQuaternion(worldRotation);frame.getWorldScale(scale);
  shell.position.set(x,.025,.025).applyMatrix4(frame.matrixWorld);shell.rotation.copy(worldRotation);shell.size=scale.x;
  shell.velocity.set(Math.sign(x)*(.3+Math.random()*.15),.15+Math.random()*.2,1.25+Math.random()*.25).applyQuaternion(worldRotation);
  if(inheritedVelocity)shell.velocity.add(inheritedVelocity);
  shell.spin.set(5+Math.random()*4,(Math.random()-.5)*8,Math.sign(x)*3);shell.age=0;shell.active=true;shell.awake=true;dirty=true;
 }
 function step(h){
  for(let i=0;i<count;i++){const s=shells[i];if(!s.active)continue;s.age+=h;if(s.age>=15){s.active=false;s.awake=false;dirty=true;continue;}if(!s.awake)continue;dirty=true;s.velocity.y-=9.81*h;s.position.addScaledVector(s.velocity,h);
   const speed=s.spin.length();if(speed>0){axis.copy(s.spin).divideScalar(speed);delta.setFromAxisAngle(axis,speed*h);s.rotation.premultiply(delta).normalize();}
   axis.copy(forward).applyQuaternion(s.rotation);const radius=.017*s.size,half=.052*s.size,support=radius+half*Math.abs(axis.y);
   if(s.position.y<=support){
    s.position.y=support;if(s.velocity.y<0)s.velocity.y=-s.velocity.y*.28;
    s.velocity.x*=Math.exp(-8*h);s.velocity.z*=Math.exp(-8*h);s.spin.multiplyScalar(Math.exp(-12*h));
    axis.y=0;if(axis.lengthSq()<.001)axis.set(1,0,0);axis.normalize();rest.setFromUnitVectors(forward,axis);s.rotation.slerp(rest,1-Math.exp(-18*h));
    if(s.age>.7&&s.velocity.length()<.09&&s.spin.length()<.15){s.rotation.copy(rest);s.position.y=radius;s.velocity.set(0,0,0);s.spin.set(0,0,0);s.awake=false;}
   }else s.spin.multiplyScalar(Math.exp(-.25*h));
   for(const key of ['x','z'])if(Math.abs(s.position[key])>27.95-radius){s.position[key]=Math.sign(s.position[key])*(27.95-radius);s.velocity[key]*=-.3;}
  }
 }
 function update(dt){
  accumulator+=Math.min(.1,Math.max(0,dt));while(accumulator>=1/120){step(1/120);accumulator-=1/120;}
  if(!dirty)return;
  let visible=0;
  for(let i=0;i<count;i++){const s=shells[i];if(!s.active)continue;matrix.compose(s.position,s.rotation,scale.setScalar(s.size));body.setMatrixAt(visible,matrix);caps.setMatrixAt(visible++,matrix);}
  body.count=caps.count=visible;body.instanceMatrix.needsUpdate=true;caps.instanceMatrix.needsUpdate=true;dirty=false;
 }
 return {eject,update,shells,body,caps};
}
