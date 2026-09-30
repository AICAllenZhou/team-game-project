import * as THREE from './vendor/three.module.js';
import {createFoodGeometry} from './food-geometry.js';
import {createCanBody,stepCanBody,placeCanBody,stepCanLid} from './can-physics.js';
import {cutCanSurface,woundRim} from './can-wounds.js';
import {createFoodSplats} from './food-splats.js';

const TYPES=[{name:'BAKED BEANS',sub:'FRONTIER PANTRY',color:0xa84026,food:0x8e4524,scale:[1,.65,.7]},
 {name:'TOMATO SOUP',sub:'RICH & HEARTY',color:0xb52f26,food:0xd64b24,scale:[1,.45,1]},
 {name:'SWEET CORN',sub:'GOLDEN KERNELS',color:0x62834a,food:0xf3c94d,scale:[.7,1,.65]}];
const metal=new THREE.MeshStandardMaterial({color:0xaeb5b7,metalness:.8,roughness:.35,flatShading:true,side:THREE.DoubleSide});
const rimMetal=metal.clone();rimMetal.flatShading=false;rimMetal.roughness=.48;
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
 const geometry=new THREE.CylinderGeometry(.42,.42,1.8,48,48,true).toNonIndexed();
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

function cowboyHat(type){
 const group=new THREE.Group(),felt=new THREE.MeshStandardMaterial({color:[0x62412c,0x9a7950,0x46352b][type],roughness:1,flatShading:true});
 const brimGeometry=new THREE.CylinderGeometry(.64,.64,.045,24,1),vertices=brimGeometry.attributes.position;
 for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),z=vertices.getZ(i);vertices.setXYZ(i,x,vertices.getY(i)+.11*(Math.abs(x)/.64)**4,z*.82);}brimGeometry.computeVertexNormals();
 const brim=new THREE.Mesh(brimGeometry,felt);group.add(brim);
 const crownGeometry=new THREE.CylinderGeometry(.29,.36,.32,16,3),crownVertices=crownGeometry.attributes.position;
 for(let i=0;i<crownVertices.count;i++){const x=crownVertices.getX(i),y=crownVertices.getY(i),z=crownVertices.getZ(i);crownVertices.setXYZ(i,x,y-(y>0?.07*Math.exp(-x*x*55):0),z*.85);}crownGeometry.computeVertexNormals();
 const crown=new THREE.Mesh(crownGeometry,felt);crown.position.y=.17;group.add(crown);
 const band=new THREE.Mesh(new THREE.CylinderGeometry(.358,.361,.055,20,1,true),new THREE.MeshStandardMaterial({color:0x332018,roughness:.8}));band.scale.z=.85;band.position.y=.045;group.add(band);group.traverse(m=>{if(m.isMesh)m.castShadow=true;});return group;
}

export function createCanCharacter(type=0){
 type=((type%3)+3)%3;const root=new THREE.Group(),body=new THREE.Group();body.position.y=.9;root.add(body);
 const shell=surface(type);body.add(shell);shell.castShadow=shell.receiveShadow=true;
 const interior=new THREE.Mesh(shell.geometry,darkMetal);interior.scale.set(.995,1,.995);body.add(interior);
 for(const y of [-.88,.88])ring(.414,.023,y,body);
 for(const y of [-.76,-.71,.71,.76])ring(.416,.006,y,body);
 const bottom=new THREE.Mesh(new THREE.RingGeometry(0,.405,48,16).toNonIndexed(),metal);bottom.rotation.x=Math.PI/2;bottom.position.y=-.885;body.add(bottom);
 const lid=new THREE.Group();lid.position.y=.89;body.add(lid);
 const top=new THREE.Mesh(new THREE.RingGeometry(0,.405,48,16).toNonIndexed(),metal);top.rotation.x=-Math.PI/2;lid.add(top);ring(.31,.004,.013,lid);
 const tab=new THREE.Mesh(new THREE.TorusGeometry(.075,.012,4,10),metal);tab.rotation.x=Math.PI/2;tab.scale.z=.6;tab.position.set(0,.032,-.08);lid.add(tab);
 const sauce=new THREE.Mesh(new THREE.CylinderGeometry(.386,.386,1.65,32),new THREE.MeshStandardMaterial({color:TYPES[type].food,roughness:.23,metalness:0}));sauce.position.y=-.055;body.add(sauce);
 const hat=cowboyHat(type);hat.position.y=.97;body.add(hat);
 Object.assign(root.userData,{hat,fill:1,sauce,leaks:[],canType:type,body,shell,interior,baseGeometry:shell.geometry.clone(),capTop:top,capBottom:bottom,baseTop:top.geometry.clone(),baseBottom:bottom.geometry.clone(),lid,holes:[],dirtySurfaces:new Set(),tears:[],ragdoll:null});return root;
}

function puncture(root,point,direction,radius=.075){
 const data=root.userData;if(data.holes.length>=40)return;
 root.updateWorldMatrix(true,true);const local=data.body.worldToLocal(new THREE.Vector3(point.x,point.y,point.z));
 const surface=local.y>.87?1:local.y<-.87?2:0,cap=surface===1?data.capTop:surface===2?data.capBottom:null;
 const length=Math.hypot(local.x,local.z);if(!cap){if(length<.01)return;local.x*=.422/length;local.z*=.422/length;local.y=THREE.MathUtils.clamp(local.y,-.85,.85);}
 const cutPoint=cap?cap.worldToLocal(new THREE.Vector3(point.x,point.y,point.z)):local.clone();if(cap)cutPoint.z=0;
 data.holes.push({point:local.clone(),radius,cutPoint,surface});data.leaks.push({point:local.clone(),radius,clock:0});data.dirtySurfaces.add(surface);
 const normal=cap?new THREE.Vector3(0,surface===1?1:-1,0):new THREE.Vector3(local.x,0,local.z).normalize(),tear=new THREE.Group();tear.position.copy(local);tear.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
 tear.add(new THREE.Mesh(woundRim(radius,!cap),rimMetal));data.body.add(tear);data.tears.push(tear);
}

export function resetCan(root){
 const d=root.userData;root.rotation.set(0,0,0);d.ragdoll=null;d.fill=1;d.leaks=[];d.sauce.scale.y=1;d.sauce.position.y=-.055;d.holes=[];d.dirtySurfaces.clear();for(const [mesh,base] of [[d.shell,d.baseGeometry],[d.capTop,d.baseTop],[d.capBottom,d.baseBottom]]){mesh.geometry.dispose();mesh.geometry=base.clone();}d.interior.geometry=d.shell.geometry;d.lid.rotation.set(0,0,0);d.rightHand?.rotation.set(0,0,0);d.lid.visible=true;d.hat.visible=true;if(d.rightHand)d.rightHand.visible=true;
 for(const tear of d.tears){tear.traverse(m=>m.geometry?.dispose());d.body.remove(tear);}d.tears=[];root.visible=true;
}

export function createCanEffects(scene){
 const splats=createFoodSplats(scene),lids=[];
 const capacity=400,items=[],meshes=[0,1,2,3,4].map(type=>{const mesh=new THREE.InstancedMesh(createFoodGeometry(type===4?1:type),new THREE.MeshStandardMaterial({roughness:type===3?.5:.32,flatShading:false}),capacity);mesh.name='can-food-pieces-'+type;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);return mesh;});
 const leaking=new Set(),damaged=new Set();
 const bodies=new Set();
 function spill(root,point,direction,count){const type=TYPES[root.userData.canType];
  for(let i=0;i<count;i++){if(items.length>=capacity)items.shift();const scrap=i%7===0,size=scrap?.045:.085+Math.random()*.035;
   items.push({type:root.userData.canType,splat:!scrap&&i%3===1,landed:false,x:point.x,y:point.y,z:point.z,vx:-direction.x*1.7+(Math.random()-.5)*2.8,vy:1.5+Math.random()*2.4+direction.y,vz:-direction.z*1.7+(Math.random()-.5)*2.8,rx:Math.random()*6,rz:Math.random()*6,life:5+Math.random()*1.5,size,scale:[1,1,1],meshType:scrap?3:root.userData.canType,color:scrap?0xaab1b4:type.food});
  }
 }
 function hit(root,result){
  damaged.add(root);const radius=result.holeRadius??.075;puncture(root,result.point,result.direction,radius);if(result.exitPoint)puncture(root,result.exitPoint,result.direction,radius*1.15);leaking.add(root);spill(root,result.point,result.direction,Math.min(32,Math.max(3,Math.round(radius*100))));
  if(result.killed)kill(root,result.direction,result.point);
 }
 function kill(root,direction={x:0,y:0,z:-1},point=null){
  if(root.userData.ragdoll)return;
  const data=root.userData;if(data.rightHand)data.rightHand.visible=false;
  // Preserve a final top hit on the detached lid before its geometry is cloned.
  if(data.dirtySurfaces.delete(1)){const old=data.capTop.geometry;data.capTop.geometry=cutCanSurface(data.baseTop,data.holes.filter(h=>h.surface===1));old.dispose();}
  root.updateWorldMatrix(true,true);const lid=data.lid.clone(true);lid.name='ejected-can-lid';lid.traverse(m=>{if(m.geometry)m.geometry=m.geometry.clone();});data.lid.getWorldPosition(lid.position);data.lid.getWorldQuaternion(lid.quaternion);scene.add(lid);data.lid.visible=false;
  while(lids.length>=23){const oldest=lids.shift();scene.remove(oldest.mesh);oldest.mesh.traverse(m=>m.geometry?.dispose());}
  const hat=data.hat.clone(true);hat.name='fallen-cowboy-hat';hat.traverse(m=>{if(m.geometry)m.geometry=m.geometry.clone();});data.hat.getWorldPosition(hat.position);data.hat.getWorldQuaternion(hat.quaternion);scene.add(hat);data.hat.visible=false;lids.push({mesh:hat,radius:.64,vx:direction.x,vy:2.2,vz:direction.z,wx:2,wz:1,life:8});
  lids.push({mesh:lid,vx:direction.x*1.5+(Math.random()-.5),vy:9.5,vz:direction.z*1.5,wx:5,wz:3,life:15});
  root.visible=true;root.userData.ragdoll=createCanBody(root.position,root.quaternion,direction,point,data.fill);bodies.add(root);
 }
 function update(dt){
  // All pellets arriving this frame share one geometry rebuild per surface.
  for(const root of damaged){const d=root.userData;
   for(const surface of d.dirtySurfaces){const mesh=surface===1?d.capTop:surface===2?d.capBottom:d.shell,base=surface===1?d.baseTop:surface===2?d.baseBottom:d.baseGeometry,old=mesh.geometry;
    mesh.geometry=cutCanSurface(base,d.holes.filter(h=>h.surface===surface));if(!surface)d.interior.geometry=mesh.geometry;old.dispose();
   }d.dirtySurfaces.clear();
  }damaged.clear();
  for(const root of bodies){const p=root.userData.ragdoll;if(!p){bodies.delete(root);continue;}const com=.9-.1*root.userData.fill;p.position.addScaledVector(up.set(0,1,0).applyQuaternion(p.quaternion),com-p.com);p.com=com;stepCanBody(p,dt);placeCanBody(root,p);}
  for(const root of leaking){const d=root.userData;if(!d.leaks.length||d.fill<=.01){leaking.delete(root);continue;}
   root.updateWorldMatrix(true,true);
   for(const leak of d.leaks){
    const level=-.88+1.65*d.fill;if(!d.ragdoll&&leak.point.y>level)continue;
    leak.clock+=dt;const interval=Math.max(.07,.22-leak.radius*.5);
    if(leak.clock<interval)continue;leak.clock%=interval;
    const point=d.body.localToWorld(leak.point.clone()),outward=new THREE.Vector3(leak.point.x,0,leak.point.z).normalize().transformDirection(d.body.matrixWorld);
    if(items.length>=capacity)items.shift();const amount=Math.min(d.fill,.0015+leak.radius*.022);d.fill-=amount;
    items.push({type:d.canType,meshType:4,splat:true,landed:false,x:point.x,y:Math.max(.04,point.y),z:point.z,vx:outward.x*.16,vy:-.25,vz:outward.z*.16,rx:0,rz:0,life:3,size:.035+leak.radius*.11,scale:[.7,2,.7],color:TYPES[d.canType].food});
   }
   d.sauce.scale.y=Math.max(.01,d.fill);d.sauce.position.y=-.88+1.65*d.fill/2;
  }
  for(let i=lids.length-1;i>=0;i--){const p=lids[i];p.life-=dt;
   if(p.life<=0){scene.remove(p.mesh);p.mesh.traverse(m=>m.geometry?.dispose());lids.splice(i,1);continue;}
   stepCanLid(p,dt);
  }
  splats.update(dt);
  for(const mesh of meshes)mesh.count=0;
  for(let i=items.length-1;i>=0;i--){const p=items[i];p.life-=dt;if(p.life<=0){items.splice(i,1);continue;}
   p.vy-=9.81*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   if(p.y<p.size){if(!p.landed){p.landed=true;if(p.splat)splats.add(p.type,p.x,p.z,p.meshType===4?.20+Math.random()*.12:.45+Math.random()*.3);}p.y=p.size;p.vy=Math.abs(p.vy)>.5?-p.vy*.22:0;const friction=Math.exp(-9*dt);p.vx*=friction;p.vz*=friction;}else{p.rx+=dt*6;p.rz+=dt*4;}
   temp.position.set(p.x,p.y,p.z);temp.rotation.set(p.rx,0,p.rz);const size=p.size*Math.min(1,p.life);temp.scale.set(size*p.scale[0],size*p.scale[1],size*p.scale[2]);temp.updateMatrix();const mesh=meshes[p.meshType];mesh.setMatrixAt(mesh.count,temp.matrix);mesh.setColorAt(mesh.count++,color.setHex(p.color));
  }
  for(const mesh of meshes)if(mesh.count){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
 }
 return {hit,kill,update,remove(root){damaged.delete(root);bodies.delete(root);leaking.delete(root);root.traverse(m=>m.geometry?.dispose());root.userData.baseGeometry.dispose();root.userData.baseTop.dispose();root.userData.baseBottom.dispose();}};
}
