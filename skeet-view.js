import * as THREE from './vendor/three.module.js';
import {LAUNCHER,CLAY_RADIUS,CLAY_HALF_HEIGHT,CLAY_TILT,MAX_CLAYS,clayPose,stepClayShard} from './skeet.mjs';

export function createSkeetView(scene){
 const orange=new THREE.MeshStandardMaterial({color:0xf07832,roughness:.92,flatShading:true});
 const machine=new THREE.Group();machine.position.set(LAUNCHER.x,0,LAUNCHER.z);scene.add(machine);
 function box(w,h,d,color,x,y,z){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true}));mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;machine.add(mesh);return mesh;}
 box(1,.6,1.1,0x58635a,0,.3,0);
 const shooter=box(.58,.18,1,0x454e49,0,.76,-.12);shooter.rotation.x=.25;
 const button=box(.18,.07,.18,0xc95135,.33,.64,.31);
 const geometry=new THREE.CylinderGeometry(CLAY_RADIUS,CLAY_RADIUS,CLAY_HALF_HEIGHT*2,12);
 const clays=Array.from({length:MAX_CLAYS},()=>{const mesh=new THREE.Mesh(geometry,orange);mesh.visible=false;scene.add(mesh);return mesh;});
 // Shared triangular prism: real flat fragments, rendered in a single draw.
 const shardGeometry=new THREE.BufferGeometry();
 const points=[[-.5,-.12,-.3],[.5,-.12,-.3],[0,-.12,.55],[-.5,.12,-.3],[.5,.12,-.3],[0,.12,.55]];
 const faces=[0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5];
 shardGeometry.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(i=>points[i]),3));shardGeometry.computeVertexNormals();
 const shards=new THREE.InstancedMesh(shardGeometry,orange,96);shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);shards.frustumCulled=false;shards.count=0;scene.add(shards);
 const pool=Array.from({length:96},()=>({life:0})),dummy=new THREE.Object3D(),pose={},offset=new THREE.Vector3(),velocity=new THREE.Vector3();
 let pressedUntil=0,lastBorn=-Infinity;
 function shatter(event,now){
  let count=12;
  for(const p of pool){if(!count)break;if(p.life>0)continue;
   const angle=(12-count)*Math.PI*2/12,radius=.12+Math.random()*.16;count--;
   offset.set(Math.cos(angle)*radius,0,Math.sin(angle)*radius).applyAxisAngle(new THREE.Vector3(1,0,0),CLAY_TILT);
   const outward=1.4+Math.random()*2.1;
   velocity.copy(offset).normalize().multiplyScalar(outward);
   Object.assign(p,{life:2.8,x:event.x+offset.x,y:Math.max(.04,event.y+offset.y),z:event.z+offset.z,
    vx:event.vx+velocity.x+event.direction.x*2,vy:(event.ground?Math.abs(event.vy)*.16:event.vy)+velocity.y+Math.random()*1.6,vz:event.vz+velocity.z+event.direction.z*2,
    rx:CLAY_TILT,ry:angle,rz:0,wx:(Math.random()-.5)*17,wy:(Math.random()-.5)*17,wz:(Math.random()-.5)*17,size:.2+Math.random()*.13});
  }
 }
 function update(flights,flightTime,dt,now){
  for(let i=0;i<clays.length;i++){
   const flight=flights[i],mesh=clays[i];mesh.visible=!!flight;if(!flight)continue;
   clayPose(flight,flightTime,pose);mesh.position.set(pose.x,Math.max(CLAY_HALF_HEIGHT,pose.y),pose.z);mesh.rotation.set(CLAY_TILT,0,0);mesh.rotateY(pose.spin);
   if(flight.born>lastBorn){lastBorn=flight.born;pressedUntil=now+180;}
  }
  button.position.y=now<pressedUntil?.61:.64;
  shards.count=0;
  for(const p of pool){if(p.life<=0)continue;p.life=Math.max(0,p.life-dt);if(!p.life)continue;stepClayShard(p,dt);
   dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx,p.ry,p.rz);dummy.scale.setScalar(p.size*Math.min(1,p.life/.3));dummy.updateMatrix();shards.setMatrixAt(shards.count++,dummy.matrix);
  }
  if(shards.count)shards.instanceMatrix.needsUpdate=true;
 }
 return {update,shatter,machine};
}
