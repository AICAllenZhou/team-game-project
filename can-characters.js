import * as THREE from './vendor/three.module.js';
import {createFoodSplats} from './food-splats.js';

const TYPES=[{name:'BAKED BEANS',sub:'FRONTIER PANTRY',color:0xa84026,food:0x8e4524,scale:[1,.65,.7]},
 {name:'TOMATO SOUP',sub:'RICH & HEARTY',color:0xb52f26,food:0xd64b24,scale:[1,.45,1]},
 {name:'SWEET CORN',sub:'GOLDEN KERNELS',color:0x62834a,food:0xf3c94d,scale:[.7,1,.65]}];
const metal=new THREE.MeshStandardMaterial({color:0xaeb5b7,metalness:.8,roughness:.35,flatShading:true,side:THREE.DoubleSide});
const darkMetal=new THREE.MeshStandardMaterial({color:0x333b3b,metalness:.6,roughness:.6,side:THREE.BackSide});
const temp=new THREE.Object3D(),color=new THREE.Color(),up=new THREE.Vector3(0,1,0),offset=new THREE.Vector3();

function label(type){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');
 c.fillStyle='#'+type.color.toString(16);c.fillRect(0,0,1024,512);
 c.fillStyle='#e8dab2';c.fillRect(0,70,1024,340);c.fillStyle='#302d24';c.textAlign='center';
 for(const x of [170,512,854]){c.font='bold 21px Arial';c.fillText(type.sub,x,130);c.font='bold 31px Arial';
  const words=type.name.split(' ');c.fillText(words[0],x,205);c.fillText(words.slice(1).join(' '),x,246);
  c.font='17px Arial';c.fillText('NET WT  •  400 g',x,366);
  c.fillStyle='#'+type.food.toString(16);for(let i=0;i<7;i++){c.beginPath();c.ellipse(x-65+i*21,300+(i%2)*7,12,8,.4,0,7);c.fill();}c.fillStyle='#302d24';
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
let labels;
function surface(type){
 const geometry=new THREE.CylinderGeometry(.42,.42,1.8,40,20,true).toNonIndexed();
 const positions=geometry.attributes.position,colors=[];
 // Small deterministic dents vary the normals of the individual triangles.
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),angle=Math.atan2(x,z);
  const dent=1+.008*Math.sin(angle*9+y*23);positions.setXYZ(i,x*dent,y,z*dent);
  const shade=.94+.06*Math.sin(Math.floor(i/3)*12.9898);colors.push(shade,shade,shade);
 }
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 labels??=TYPES.map(t=>new THREE.MeshStandardMaterial({map:label(t),roughness:.76,metalness:.12,flatShading:true,vertexColors:true,side:THREE.DoubleSide}));
 return new THREE.Mesh(geometry,labels[type]);
}
function ring(radius,tube,y,parent){const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,6,40),metal);mesh.rotation.x=Math.PI/2;mesh.position.y=y;parent.add(mesh);return mesh;}

export function createCanCharacter(type=0){
 type=((type%3)+3)%3;const root=new THREE.Group(),body=new THREE.Group();body.position.y=.9;root.add(body);
 const shell=surface(type);body.add(shell);shell.castShadow=shell.receiveShadow=true;
 const interior=new THREE.Mesh(new THREE.CylinderGeometry(.397,.397,1.76,32,1,true),darkMetal);body.add(interior);
 for(const y of [-.88,.88])ring(.414,.023,y,body);
 for(const y of [-.76,-.71,.71,.76])ring(.416,.006,y,body);
 const bottom=new THREE.Mesh(new THREE.CylinderGeometry(.405,.405,.025,40),metal);bottom.position.y=-.885;body.add(bottom);
 const lid=new THREE.Group();lid.position.y=.89;body.add(lid);
 const top=new THREE.Mesh(new THREE.CylinderGeometry(.405,.405,.023,40),metal);lid.add(top);ring(.31,.004,.013,lid);
 const tab=new THREE.Mesh(new THREE.TorusGeometry(.075,.012,4,10),metal);tab.rotation.x=Math.PI/2;tab.scale.z=.6;tab.position.set(0,.032,-.08);lid.add(tab);
 Object.assign(root.userData,{canType:type,body,shell,baseGeometry:shell.geometry.clone(),lid,holes:[],tears:[],ragdoll:null});return root;
}

function puncture(root,point,direction){
 const data=root.userData;if(data.holes.length>=16)return;
 root.updateWorldMatrix(true,true);const local=data.body.worldToLocal(new THREE.Vector3(point.x,point.y,point.z));
 // Project the hit to the metal skin, keeping dents attached while it tumbles.
 const length=Math.hypot(local.x,local.z);if(length<.05)return;
 local.x*=.422/length;local.z*=.422/length;local.y=THREE.MathUtils.clamp(local.y,-.85,.85);
 const radius=.105;data.holes.push({point:local.clone(),radius});
 const base=data.baseGeometry,positions=base.attributes.position,indices=[];
 for(let i=0;i<positions.count;i+=3){
  const center=new THREE.Vector3();for(let n=0;n<3;n++)center.add(new THREE.Vector3().fromBufferAttribute(positions,i+n));center.multiplyScalar(1/3);
  if(!data.holes.some(h=>center.distanceToSquared(h.point)<h.radius*h.radius))indices.push(i,i+1,i+2);
 }
 data.shell.geometry.setIndex(indices);
 const normal=new THREE.Vector3(local.x,0,local.z).normalize(),tear=new THREE.Group();tear.position.copy(local);tear.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
 const vertices=[];
 for(let i=0;i<10;i++){const a=i*Math.PI/5,b=(i+1)*Math.PI/5,r=radius*(.7+.2*Math.sin(i*7));
  vertices.push(Math.cos(a)*r,Math.sin(a)*r,.012,Math.cos(b)*radius,Math.sin(b)*radius,.005,Math.cos(a+.2)*radius*1.35,Math.sin(a+.2)*radius*1.35,.025+(i%3)*.015);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();tear.add(new THREE.Mesh(geometry,metal));data.body.add(tear);data.tears.push(tear);
}

export function resetCan(root){
 const d=root.userData;root.rotation.set(0,0,0);d.ragdoll=null;d.holes=[];d.shell.geometry.setIndex(null);d.lid.rotation.set(0,0,0);d.rightHand?.rotation.set(0,0,0);d.lid.visible=true;if(d.rightHand)d.rightHand.visible=true;
 for(const tear of d.tears){tear.traverse(m=>m.geometry?.dispose());d.body.remove(tear);}d.tears=[];root.visible=true;
}

export function createCanEffects(scene){
 const splats=createFoodSplats(scene),lids=[];
 const capacity=600,items=[],mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({roughness:.67,flatShading:true}),capacity);
 mesh.name='can-food-pieces';mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
 const bodies=new Set();
 function spill(root,point,direction,count){const type=TYPES[root.userData.canType];
  for(let i=0;i<count;i++){if(items.length>=capacity)items.shift();const scrap=i%7===0,size=scrap?.045:.085+Math.random()*.035;
   items.push({type:root.userData.canType,splat:!scrap&&i%3===1,landed:false,x:point.x,y:point.y,z:point.z,vx:-direction.x*1.7+(Math.random()-.5)*2.8,vy:1.5+Math.random()*2.4+direction.y,vz:-direction.z*1.7+(Math.random()-.5)*2.8,rx:Math.random()*6,rz:Math.random()*6,life:18+Math.random()*2,size,scale:scrap?[1,.13,1.6]:type.scale,color:scrap?0xaab1b4:type.food});
  }
 }
 function hit(root,result){
  puncture(root,result.point,result.direction);spill(root,result.point,result.direction,result.killed?48:14);
  if(result.killed)kill(root,result.direction);
 }
 function kill(root,direction={x:0,y:0,z:-1}){
  if(root.userData.ragdoll)return;
  const data=root.userData;if(data.rightHand)data.rightHand.visible=false;
  root.updateWorldMatrix(true,true);const lid=data.lid.clone(true);lid.name='ejected-can-lid';lid.traverse(m=>{if(m.geometry)m.geometry=m.geometry.clone();});data.lid.getWorldPosition(lid.position);data.lid.getWorldQuaternion(lid.quaternion);scene.add(lid);data.lid.visible=false;
  if(lids.length>=24){const oldest=lids.shift();scene.remove(oldest.mesh);oldest.mesh.traverse(m=>m.geometry?.dispose());}
  lids.push({mesh:lid,vx:direction.x*1.5+(Math.random()-.5),vy:9.5,vz:direction.z*1.5,wx:5,wz:3,life:15});
  root.visible=true;root.userData.ragdoll={x:root.position.x,y:root.position.y+.9,z:root.position.z,vx:direction.x*2.7,vy:2.2,vz:direction.z*2.7,wx:-direction.z*4,wz:direction.x*4,age:0};bodies.add(root);
 }
 function update(dt){
  for(const root of bodies){const p=root.userData.ragdoll;if(!p){bodies.delete(root);continue;}p.age+=dt;
   const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
   for(let j=0;j<steps;j++){
    p.vy-=9.81*h;p.x+=p.vx*h;p.y+=p.vy*h;p.z+=p.vz*h;root.rotation.x+=p.wx*h;root.rotation.z+=p.wz*h;
    up.set(0,1,0).applyQuaternion(root.quaternion);const support=.9*Math.abs(up.y)+.42*Math.sqrt(Math.max(0,1-up.y*up.y));
    if(p.y<support){p.y=support;p.vy=Math.abs(p.vy)>.5?-p.vy*.24:0;const damping=Math.exp(-5*h);p.vx*=damping;p.vz*=damping;
     // Gravity tips a tall can onto its side, then friction settles the roll.
     const torque=up.y*.42*Math.sign(up.z||1);p.wx=(p.wx+torque*h*8)*Math.exp(-3*h);p.wz*=Math.exp(-3*h);
    }
   }
   offset.set(0,.9,0).applyQuaternion(root.quaternion);root.position.set(p.x-offset.x,p.y-offset.y,p.z-offset.z);
  }
  for(let i=lids.length-1;i>=0;i--){const p=lids[i];p.life-=dt;
   if(p.life<=0){scene.remove(p.mesh);p.mesh.traverse(m=>m.geometry?.dispose());lids.splice(i,1);continue;}
   const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
   for(let j=0;j<steps;j++){p.vy-=9.81*h;p.mesh.position.x+=p.vx*h;p.mesh.position.y+=p.vy*h;p.mesh.position.z+=p.vz*h;p.mesh.rotation.x+=p.wx*h;p.mesh.rotation.z+=p.wz*h;
    up.set(0,1,0).applyQuaternion(p.mesh.quaternion);const support=.405*Math.sqrt(Math.max(0,1-up.y*up.y))+.025*Math.abs(up.y);
    if(p.mesh.position.y<support){p.mesh.position.y=support;p.vy=Math.abs(p.vy)>.4?-p.vy*.3:0;const friction=Math.exp(-5*h);p.vx*=friction;p.vz*=friction;p.wx*=friction;p.wz*=friction;}
   }
  }
  splats.update(dt);
  mesh.count=0;
  for(let i=items.length-1;i>=0;i--){const p=items[i];p.life-=dt;if(p.life<=0){items.splice(i,1);continue;}
   p.vy-=9.81*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   if(p.y<p.size){if(!p.landed){p.landed=true;if(p.splat)splats.add(p.type,p.x,p.z,.65+Math.random()*.5);}p.y=p.size;p.vy=Math.abs(p.vy)>.5?-p.vy*.22:0;const friction=Math.exp(-9*dt);p.vx*=friction;p.vz*=friction;}else{p.rx+=dt*6;p.rz+=dt*4;}
   temp.position.set(p.x,p.y,p.z);temp.rotation.set(p.rx,0,p.rz);const size=p.size*Math.min(1,p.life);temp.scale.set(size*p.scale[0],size*p.scale[1],size*p.scale[2]);temp.updateMatrix();mesh.setMatrixAt(mesh.count,temp.matrix);mesh.setColorAt(mesh.count++,color.setHex(p.color));
  }
  if(mesh.count){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
 }
 return {hit,kill,update,remove(root){bodies.delete(root);root.traverse(m=>m.geometry?.dispose());root.userData.baseGeometry.dispose();}};
}
