import * as THREE from './vendor/three.module.js';
const axis=new THREE.Vector3(),radial=new THREE.Vector3(),contact=new THREE.Vector3(),lever=new THREE.Vector3(),velocity=new THREE.Vector3(),cross=new THREE.Vector3(),torque=new THREE.Vector3(),inverse=new THREE.Quaternion(),rotation=new THREE.Quaternion();
const inertia=new THREE.Vector3(1/.285,1/.0882,1/.285),normal=new THREE.Vector3(0,1,0),radius=.42,halfHeight=.9;
function inverseInertia(v,q){inverse.copy(q).invert();return v.applyQuaternion(inverse).multiply(inertia).applyQuaternion(q);}
export function createCanBody(position,quaternion,direction,hitPoint,fill=1){
 const com=.9-.1*fill,center=new THREE.Vector3(0,com,0).applyQuaternion(quaternion).add(position),impulse=new THREE.Vector3(direction.x,direction.y,direction.z).multiplyScalar(2.3);
 const application=hitPoint?new THREE.Vector3(hitPoint.x,hitPoint.y,hitPoint.z):position.clone().add(new THREE.Vector3(0,1.1,0));
 const angular=inverseInertia(application.sub(center).cross(impulse),quaternion);angular.clampLength(0,8);
 return {position:center,velocity:impulse,angular,quaternion:quaternion.clone(),com,age:0};
}
export function stepCanBody(p,dt){
 const steps=Math.max(1,Math.ceil(dt*180)),h=dt/steps;
 for(let i=0;i<steps;i++){
  p.velocity.y-=9.81*h;p.position.addScaledVector(p.velocity,h);
  const spin=p.angular.length();if(spin>1e-7){rotation.setFromAxisAngle(axis.copy(p.angular).divideScalar(spin),spin*h);p.quaternion.premultiply(rotation).normalize();}
  axis.set(0,1,0).applyQuaternion(p.quaternion);
  // Lowest point of the actual oriented cylinder relative to its mass center.
  radial.copy(normal).addScaledVector(axis,-axis.y);const horizontal=radial.length();if(horizontal>1e-6)radial.multiplyScalar(-radius/horizontal);else radial.set(0,0,0);
  lever.copy(axis).multiplyScalar((axis.y>=0?-halfHeight:halfHeight)+.9-p.com).add(radial);
  contact.copy(p.position).add(lever);
  if(contact.y<0){
   p.position.y-=contact.y;
   velocity.copy(p.angular).cross(lever).add(p.velocity);
   if(velocity.y<0){
    cross.copy(lever).cross(normal);torque.copy(cross);inverseInertia(torque,p.quaternion);
    const impulse=-(1+(velocity.y<-1?.12:0))*velocity.y/(1+cross.dot(torque));
    p.velocity.addScaledVector(normal,impulse);p.angular.addScaledVector(torque,impulse);
    velocity.copy(p.angular).cross(lever).add(p.velocity);velocity.y=0;const speed=velocity.length();
    if(speed>1e-7){velocity.divideScalar(speed);cross.copy(lever).cross(velocity);torque.copy(cross);inverseInertia(torque,p.quaternion);const friction=Math.min(speed/(1+cross.dot(torque)),impulse*.65);p.velocity.addScaledVector(velocity,-friction);p.angular.addScaledVector(torque,-friction);}
   }
   p.angular.multiplyScalar(Math.exp(-1.6*h));p.velocity.x*=Math.exp(-.5*h);p.velocity.z*=Math.exp(-.5*h);
  }
  p.angular.multiplyScalar(Math.exp(-.12*h));
 }
 p.age+=dt;return p;
}
export function placeCanBody(root,p){root.quaternion.copy(p.quaternion);root.position.copy(p.position).sub(axis.set(0,p.com,0).applyQuaternion(p.quaternion));}

// A thin disc cannot rest on its edge: once the bounce ends, gravity tips it
// toward the closest face while floor friction damps the remaining spin.
const lidNormal=new THREE.Vector3();
export function stepCanLid(p,dt){
 const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
 const support=()=>{axis.set(0,1,0).applyQuaternion(p.mesh.quaternion);return (p.radius??.405)*Math.sqrt(Math.max(0,1-axis.y*axis.y))+.025*Math.abs(axis.y);};
 for(let i=0;i<steps;i++){
  p.vy-=9.81*h;p.mesh.position.x+=p.vx*h;p.mesh.position.y+=p.vy*h;p.mesh.position.z+=p.vz*h;
  if(!p.settling){p.mesh.rotation.x+=p.wx*h;p.mesh.rotation.z+=p.wz*h;}
  const height=support();
  if(p.mesh.position.y<=height){
   p.mesh.position.y=height;
   if(Math.abs(p.vy)<.65)p.settling=true;
   p.vy=p.settling?0:Math.abs(p.vy)*.3;
   const friction=Math.exp(-5*h);p.vx*=friction;p.vz*=friction;p.wx*=friction;p.wz*=friction;
  }
  if(p.settling){
   lidNormal.set(0,axis.y>=0?1:-1,0);rotation.setFromUnitVectors(axis,lidNormal);
   inverse.copy(rotation).multiply(p.mesh.quaternion);p.mesh.quaternion.slerp(inverse,1-Math.exp(-7*h));
   p.mesh.position.y=support();p.vy=0;
  }
 }
}
