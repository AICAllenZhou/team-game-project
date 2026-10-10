import * as THREE from './vendor/three.module.js';
import {CELL} from './voxel-walls.mjs';
// Merge coplanar exposed cells into rectangles. Destruction still edits the
// same small voxels; an intact floor no longer needs a face for every cell.
export function wallSurface(w){
 const positions=[],normals=[],colors=[],uv=[],size=[w.nx,w.ny,w.nz],offset=[w.x,w.y,w.z];
 const solid=c=>c[0]>=0&&c[1]>=0&&c[2]>=0&&c[0]<w.nx&&c[1]<w.ny&&c[2]<w.nz&&w.cells[(c[1]*w.nz+c[2])*w.nx+c[0]];
 for(let axis=0;axis<3;axis++){
  const u=(axis+1)%3,v=(axis+2)%3,width=size[u],height=size[v],mask=new Int8Array(width*height),c=[0,0,0];
  for(let plane=0;plane<=size[axis];plane++){
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    c[u]=x;c[v]=y;c[axis]=plane-1;const a=solid(c);c[axis]=plane;const b=solid(c);mask[y*width+x]=!!a===!!b?0:a?1:-1;
   }
   for(let y=0;y<height;y++)for(let x=0;x<width;){
    const sign=mask[y*width+x];if(!sign){x++;continue;}
    let rw=1,rh=1;while(x+rw<width&&mask[y*width+x+rw]===sign)rw++;
    outer:while(y+rh<height){for(let i=0;i<rw;i++)if(mask[(y+rh)*width+x+i]!==sign)break outer;rh++;}
    const corners=[[x,y],[x+rw,y],[x+rw,y+rh],[x,y+rh]],normal=[0,0,0];normal[axis]=sign;
    for(const corner of (sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2])){
     const [cx,cy]=corners[corner],point=[0,0,0];point[axis]=plane;point[u]=cx;point[v]=cy;
     positions.push(...point.map((n,i)=>offset[i]+n*w.cell));normals.push(...normal);colors.push(.98,.98,.98);uv.push(cx,cy);
    }
    for(let yy=0;yy<rh;yy++)mask.fill(0,(y+yy)*width+x,(y+yy)*width+x+rw);x+=rw;
   }
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingSphere();return g;
}
let voxelGrid;
function wallMaterial(w){
 if(!voxelGrid&&typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,32,32);ctx.fillStyle='#ededed';ctx.fillRect(0,0,32,1);ctx.fillRect(0,0,1,32);
  voxelGrid=new THREE.CanvasTexture(canvas);voxelGrid.wrapS=voxelGrid.wrapT=THREE.RepeatWrapping;voxelGrid.anisotropy=4;
 }
 return new THREE.MeshStandardMaterial({color:w.color,roughness:1,flatShading:true,vertexColors:true,map:voxelGrid||null});
}
export function createVoxelWallView(scene,world){
 let meshes=world.walls.map(w=>{const mesh=new THREE.Mesh(wallSurface(w),wallMaterial(w));mesh.receiveShadow=true;mesh.userData.version=w.version;scene.add(mesh);return mesh;});
 const debris=new THREE.InstancedMesh(new THREE.BoxGeometry(.065,.065,.065),new THREE.MeshStandardMaterial({roughness:1}),96);debris.frustumCulled=false;debris.count=0;debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(debris);
 const chips=Array.from({length:96},()=>({life:0})),dummy=new THREE.Object3D(),color=new THREE.Color();let last=-1,cursor=0;
 function burst(wall,removed){const w=world.walls[wall];if(!w)return;for(const i of removed){const p=chips[cursor++%chips.length],x=i%w.nx,z=Math.floor(i/w.nx)%w.nz,y=Math.floor(i/(w.nx*w.nz));Object.assign(p,{life:2,x:w.x+(x+.5)*w.cell,y:w.y+(y+.5)*w.cell,z:w.z+(z+.5)*w.cell,vx:(Math.random()-.5)*3,vy:1+Math.random()*2,vz:(Math.random()-.5)*3,angle:Math.random()*6,color:w.color});}}
 let layout=world.walls;
 function update(dt){
  if(layout!==world.walls){for(const m of meshes){scene.remove(m);m.geometry.dispose();m.material.dispose();}layout=world.walls;meshes=world.walls.map(w=>{const m=new THREE.Mesh(wallSurface(w),wallMaterial(w));m.receiveShadow=true;m.userData.version=w.version;scene.add(m);return m;});for(const p of chips)p.life=0;}

  if(last!==world.revision){last=world.revision;world.walls.forEach((w,k)=>{const m=meshes[k];if(m.userData.version===w.version)return;const previous=m.geometry;m.geometry=wallSurface(w);m.userData.version=w.version;previous.dispose();});}
  debris.count=0;for(const p of chips){if(p.life<=0)continue;p.life-=dt;if(p.life<=0)continue;p.vy-=9.81*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.y<.04){p.y=.04;p.vy=Math.abs(p.vy)*.22;p.vx*=.8;p.vz*=.8;}else p.angle+=dt*8;dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.angle,p.angle*.7,0);dummy.scale.setScalar(Math.min(1,p.life*3));dummy.updateMatrix();debris.setMatrixAt(debris.count,dummy.matrix);debris.setColorAt(debris.count++,color.setHex(p.color));}if(debris.count){debris.instanceMatrix.needsUpdate=true;debris.instanceColor.needsUpdate=true;}
 }update(0);return {update,burst};
}
