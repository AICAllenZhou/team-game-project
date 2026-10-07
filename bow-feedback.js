import * as THREE from './vendor/three.module.js';
import {ARROW_TIP_Z} from './bow-view.js';
const forward=new THREE.Vector3(0,0,-1),face=new THREE.Vector3(0,0,1),temp=new THREE.Vector3();
export function createBowMarker(scene){
 const marker=new THREE.Group();marker.name='local-bow-impact-marker';marker.visible=false;
 const white=new THREE.MeshBasicMaterial({color:0xffedc5,transparent:true,opacity:.95,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const dark=white.clone();dark.color.setHex(0x23190e);dark.opacity=.8;
 for(const turn of [0,Math.PI/2])for(const outline of [true,false]){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(outline?.24:.2,outline?.055:.027),outline?dark:white);mesh.rotation.z=turn;mesh.position.z=outline?0:.002;marker.add(mesh);
 }
 scene.add(marker);return marker;
}
export function placeBowMarker(marker,hit){
 marker.visible=!!hit?.surface;if(!marker.visible)return;
 const normal=temp.set(hit.normal.x,hit.normal.y,hit.normal.z).normalize();
 marker.position.set(hit.point.x,hit.point.y,hit.point.z).addScaledVector(normal,.012);
 marker.quaternion.setFromUnitVectors(face,normal);
 // Fixed world size: its screen footprint naturally shrinks with distance.
 marker.scale.setScalar(1);
}
export function seatArrow(arrow,result,victim=null){
 const point=new THREE.Vector3(result.point.x,result.point.y,result.point.z),direction=new THREE.Vector3(result.direction.x,result.direction.y,result.direction.z).normalize();
 // Network targets are interpolated visually. Seat into that rendered shell,
 // matching the wound projection instead of burying it at an old server pose.
 if(victim?.userData.body){
  const body=victim.userData.body;body.updateWorldMatrix(true,false);body.worldToLocal(point);
  if(point.y>.87)point.y=.89;
  else if(point.y<-.87)point.y=-.89;
  else{const radius=Math.hypot(point.x,point.z)||1;point.x*=.422/radius;point.z*=.422/radius;}
  body.localToWorld(point);
 }
 arrow.position.copy(point).addScaledVector(direction,ARROW_TIP_Z+.025);
 arrow.quaternion.setFromUnitVectors(forward,direction);arrow.userData.stuckArrow=true;
 if(victim){victim.updateWorldMatrix(true,false);victim.attach(arrow);}
 return arrow.quaternion.clone();
}
export function wobbleStuckArrow(arrow,rest,age){
 const wobble=Math.sin(age*65)*Math.exp(-age*16)*.035;
 arrow.quaternion.copy(rest);arrow.rotateX(wobble);
}
