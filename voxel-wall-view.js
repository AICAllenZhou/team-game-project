import * as THREE from './vendor/three.module.js';
import {CELL} from './voxel-walls.mjs';
const faceSteps=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const cube=new THREE.BoxGeometry(CELL,CELL,CELL).toNonIndexed();
export function wallSurface(w){
 const positions=[],normals=[],colors=[],p=cube.attributes.position,n=cube.attributes.normal;
 for(let i=0;i<w.cells.length;i++){if(!w.cells[i])continue;const x=i%w.nx,z=Math.floor(i/w.nx)%w.nz,y=Math.floor(i/(w.nx*w.nz)),shade=.9+((i*137+17)%101)/500;
  for(let face=0;face<6;face++){const step=faceSteps[face],xx=x+step[0],yy=y+step[1],zz=z+step[2];if(xx>=0&&xx<w.nx&&yy>=0&&yy<w.ny&&zz>=0&&zz<w.nz&&w.cells[(yy*w.nz+zz)*w.nx+xx])continue;
   for(let v=face*6;v<face*6+6;v++){positions.push(p.getX(v)+w.x+(x+.5)*CELL,p.getY(v)+w.y+(y+.5)*CELL,p.getZ(v)+w.z+(z+.5)*CELL);normals.push(n.getX(v),n.getY(v),n.getZ(v));colors.push(shade,shade,shade);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeBoundingSphere();return g;
}
export function createVoxelWallView(scene,world){
 const meshes=world.walls.map(w=>{const mesh=new THREE.Mesh(wallSurface(w),new THREE.MeshStandardMaterial({color:w.color,roughness:1,flatShading:true,vertexColors:true}));mesh.receiveShadow=true;mesh.userData.version=w.version;scene.add(mesh);return mesh;});
 const debris=new THREE.InstancedMesh(new THREE.BoxGeometry(.065,.065,.065),new THREE.MeshStandardMaterial({roughness:1}),96);debris.frustumCulled=false;debris.count=0;debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(debris);
 const chips=Array.from({length:96},()=>({life:0})),dummy=new THREE.Object3D(),color=new THREE.Color();let last=-1,cursor=0;
 function burst(wall,removed){const w=world.walls[wall];if(!w)return;for(const i of removed){const p=chips[cursor++%chips.length],x=i%w.nx,z=Math.floor(i/w.nx)%w.nz,y=Math.floor(i/(w.nx*w.nz));Object.assign(p,{life:2,x:w.x+(x+.5)*CELL,y:w.y+(y+.5)*CELL,z:w.z+(z+.5)*CELL,vx:(Math.random()-.5)*3,vy:1+Math.random()*2,vz:(Math.random()-.5)*3,angle:Math.random()*6,color:w.color});}}
 function update(dt){
  if(last!==world.revision){last=world.revision;world.walls.forEach((w,k)=>{const m=meshes[k];if(m.userData.version===w.version)return;const previous=m.geometry;m.geometry=wallSurface(w);m.userData.version=w.version;previous.dispose();});}
  debris.count=0;for(const p of chips){if(p.life<=0)continue;p.life-=dt;if(p.life<=0)continue;p.vy-=9.81*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.y<.04){p.y=.04;p.vy=Math.abs(p.vy)*.22;p.vx*=.8;p.vz*=.8;}else p.angle+=dt*8;dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.angle,p.angle*.7,0);dummy.scale.setScalar(Math.min(1,p.life*3));dummy.updateMatrix();debris.setMatrixAt(debris.count,dummy.matrix);debris.setColorAt(debris.count++,color.setHex(p.color));}if(debris.count){debris.instanceMatrix.needsUpdate=true;debris.instanceColor.needsUpdate=true;}
 }update(0);return {update,burst};
}
