import * as THREE from './vendor/three.module.js';
const up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
export function createLaserEffects(scene){
 const geometry=new THREE.CylinderGeometry(1,1,1,6),pool=[];let cursor=0;
 for(let i=0;i<12;i++){
  const group=new THREE.Group(),materials=[];
  for(const [radius,color,opacity] of [[.045,0xff1020,.3],[.012,0xff544c,1]]){
   const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
   const mesh=new THREE.Mesh(geometry,material);mesh.scale.set(radius,1,radius);group.add(mesh);materials.push({material,opacity});
  }
  group.name='red-laser-beam';group.visible=false;scene.add(group);pool.push({group,materials,life:0});
 }
 function fire(origin,end){
  const beam=pool[cursor++%pool.length];delta.set(end.x-origin.x,end.y-origin.y,end.z-origin.z);const length=delta.length();
  if(length<.001)return;beam.group.position.set((origin.x+end.x)/2,(origin.y+end.y)/2,(origin.z+end.z)/2);beam.group.quaternion.setFromUnitVectors(up,delta.normalize());beam.group.scale.y=length;beam.group.visible=true;beam.life=.16;
  for(const {material,opacity} of beam.materials)material.opacity=opacity;
 }
 function update(dt){for(const beam of pool)if(beam.life>0){beam.life=Math.max(0,beam.life-dt);beam.group.visible=beam.life>0;for(const {material,opacity} of beam.materials)material.opacity=opacity*Math.min(1,beam.life/.1);}}
 function clear(){for(const beam of pool){beam.life=0;beam.group.visible=false;}}
 return {fire,update,clear};
}
