import * as THREE from './vendor/three.module.js';

// Call only on parts that stay fixed relative to this parent. Animated child
// groups (hammer, cylinder, wrist, target face) remain independent.
export function batchMeshes(parent){
 const groups=new Map();
 for(const mesh of parent.children){
  if(!mesh.isMesh||mesh.isInstancedMesh||mesh.children.length||!mesh.visible||Array.isArray(mesh.material)||mesh.material.transparent)continue;
  const key=`${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
 }
 for(const meshes of groups.values()){
  if(meshes.length<2)continue;
  const parts=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return geometry.applyMatrix4(mesh.matrix);});
  const geometry=new THREE.BufferGeometry();
  for(const name of ['position','normal','uv']){
   if(!parts.every(part=>part.hasAttribute(name)))continue;
   const itemSize=parts[0].getAttribute(name).itemSize;
   const values=new Float32Array(parts.reduce((sum,part)=>sum+part.getAttribute(name).array.length,0));
   let offset=0;for(const part of parts){const array=part.getAttribute(name).array;values.set(array,offset);offset+=array.length;}
   geometry.setAttribute(name,new THREE.BufferAttribute(values,itemSize));
  }
  geometry.computeBoundingSphere();geometry.computeBoundingBox();
  const merged=new THREE.Mesh(geometry,meshes[0].material);merged.castShadow=meshes[0].castShadow;merged.receiveShadow=meshes[0].receiveShadow;merged.matrixAutoUpdate=false;
  parent.add(merged);for(const mesh of meshes)parent.remove(mesh);for(const part of parts)part.dispose();
 }
}

// One draw for all sparks and one for all smoke, including per-particle color
// and fading. No material/mesh creation or scene sorting per emitted particle.
export function createParticles(scene){
 const groups=[{smoke:true,capacity:32,geometry:new THREE.SphereGeometry(.1,6,4)},{smoke:false,capacity:48,geometry:new THREE.IcosahedronGeometry(.024,0)}];
 const particles=[],matrix=new THREE.Matrix4(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
 for(const group of groups){
  const opacity=new THREE.InstancedBufferAttribute(new Float32Array(group.capacity),1).setUsage(THREE.DynamicDrawUsage);
  group.geometry.setAttribute('instanceOpacity',opacity);
  const material=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false});
  material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float instanceOpacity; varying float particleOpacity;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nparticleOpacity = instanceOpacity;');
   shader.fragmentShader='varying float particleOpacity;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= particleOpacity;');
  };
  material.customProgramCacheKey=()=> 'particle-opacity-v1';
  const mesh=new THREE.InstancedMesh(group.geometry,material,group.capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;
  // Allocate instanceColor before shader precompilation, including while empty.
  mesh.setColorAt(0,new THREE.Color());mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
  Object.assign(group,{mesh,opacity});
  for(let i=0;i<group.capacity;i++)particles.push({group,smoke:group.smoke,life:0,total:1,position:new THREE.Vector3(),velocity:new THREE.Vector3(),color:new THREE.Color(),scale:1});
 }
 function emit(origin,direction,color,count,smoke,options={}){
  for(const p of particles){if(count<=0)break;if(p.life>0||p.smoke!==smoke)continue;count--;
   p.life=p.total=options.life??(smoke?.32+Math.random()*.2:.18+Math.random()*.2);p.scale=options.size??1;p.alpha=options.opacity??(smoke?.045:1);p.drag=options.drag??0;p.position.copy(origin);p.color.setHex(color);
   p.velocity.copy(direction).multiplyScalar(options.speed?(options.speed*(.75+Math.random()*.5)):(smoke?.4:2+Math.random()*3));
   const spread=options.spread??1.5;p.velocity.x+=(Math.random()-.5)*spread;p.velocity.y+=Math.random()*spread*.53;p.velocity.z+=(Math.random()-.5)*spread;
  }
 }
 function update(dt){
  for(const group of groups)group.mesh.count=0;
  for(const p of particles){if(p.life<=0)continue;p.life=Math.max(0,p.life-dt);if(p.life===0)continue;
   if(p.drag)p.velocity.multiplyScalar(Math.exp(-p.drag*dt));p.velocity.y+=(p.smoke?.4:-8)*dt;p.position.addScaledVector(p.velocity,dt);
   const progress=1-p.life/p.total,size=p.smoke?.35+progress*1.3:1-progress*.6;
   const {mesh,opacity}=p.group,index=mesh.count++;matrix.compose(p.position,rotation,scale.setScalar(size*p.scale));mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,p.color);opacity.setX(index,(1-progress)*p.alpha);
  }
  for(const {mesh,opacity} of groups){if(!mesh.count)continue;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;opacity.needsUpdate=true;}
 }
 return {emit,update,groups};
}
