import * as THREE from './vendor/three.module.js';
import {createBowString,stepBowString,releaseBowString} from './bow-string.mjs';
export const ARROW_TIP_Z=-.52;
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const wood=new THREE.MeshStandardMaterial({color:0x795134,roughness:.8,flatShading:true});
const shaft=new THREE.CylinderGeometry(.012,.012,.8,6),tip=new THREE.ConeGeometry(.035,.12,4),feather=new THREE.BoxGeometry(.09,.005,.1);
const arrowWood=new THREE.MeshStandardMaterial({color:0xc9a46a,roughness:.8}),metal=new THREE.MeshStandardMaterial({color:0x929b9c,metalness:.7,roughness:.4}),fletch=new THREE.MeshStandardMaterial({color:0xdecdb4,side:THREE.DoubleSide});
export function createArrow(){
 const g=new THREE.Group(),body=new THREE.Mesh(shaft,arrowWood),head=new THREE.Mesh(tip,metal);body.rotation.x=Math.PI/2;head.rotation.x=-Math.PI/2;head.position.z=-.46;g.add(body,head);
 for(let i=0;i<3;i++){const f=new THREE.Mesh(feather,fletch);f.position.z=.32;f.rotation.z=i*Math.PI/3;g.add(f);}return g;
}
export function createBow(parent,{firstPerson=false}={}){
 const g=new THREE.Group();parent.add(g);
 const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.63,.12),new THREE.Vector3(0,-.4,-.06),new THREE.Vector3(0,0,-.13),new THREE.Vector3(0,.4,-.06),new THREE.Vector3(0,.63,.12)]);
 const limbs=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.023,6,false),wood);g.add(limbs);
 const grip=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.19,8),new THREE.MeshStandardMaterial({color:0x34291e}));grip.position.z=-.13;g.add(grip);
 const string=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(51),3)),new THREE.LineBasicMaterial({color:0xd2c9ac}));g.add(string);
 const arrow=createArrow();g.add(arrow);
 const drawHand=new THREE.Mesh(new THREE.SphereGeometry(.105,10,7),new THREE.MeshStandardMaterial({color:0xd4b58f,roughness:.8}));g.add(drawHand);
 g.userData={type:'bow',muzzleObject:arrow,muzzleZ:ARROW_TIP_Z,muzzleY:0,string,rope:createBowString(),arrow,drawHand,limbs,limbBase:limbs.geometry.attributes.position.array.slice(),limbCharge:0,releaseAge:Infinity,firstPerson,visibility:firstPerson?.55:1};
 if(firstPerson)g.traverse(m=>{if(m.material){m.material=m.material.clone();m.material.transparent=true;m.material.depthWrite=false;m.material.opacity=.55;}});
 animateBow(g,0,true);return g;
}
export function releaseBow(g){g.userData.releaseAge=0;g.userData.arrow.visible=false;releaseBowString(g.userData.rope);}
export function resetBow(g){const d=g.userData;d.rope=createBowString();d.limbCharge=0;d.releaseAge=Infinity;if(d.firstPerson)g.traverse(m=>{if(m.material)m.material.opacity=.55;});animateBow(g,0,true);}
export function animateBow(g,charge,loaded=true,{dt=1/60,reload=-1}={}){
 const d=g.userData,c=Math.max(0,Math.min(1,charge)),loading=reload>=0&&reload<1;
 d.releaseAge+=dt;d.limbCharge+=(c-d.limbCharge)*(1-Math.exp(-45*dt));
 const limb=d.limbCharge,draw=.12+c*.35;
 const vertices=d.limbs.geometry.attributes.position;
 for(let i=0;i<vertices.count;i++){const y=d.limbBase[i*3+1];vertices.setY(i,y*(1-limb*.1/.63*(Math.abs(y)/.63)**1.5));}vertices.needsUpdate=true;
 const pin=loaded&&!loading&&d.releaseAge>.12;
 const positions=stepBowString(d.rope,dt,pin?c:limb,pin),p=d.string.geometry.attributes.position;
 p.array.set(positions);p.needsUpdate=true;d.string.frustumCulled=false;
 const nock=loading?ease((reload-.18)/.72):loaded?1:0;
 d.arrow.visible=loaded&&!loading||loading&&reload>.12;
 d.arrow.position.set(.03+(1-nock)*.42,.025-(1-nock)*.46,draw-.4+(1-nock)*.22);
 d.arrow.rotation.set((1-nock)*-.55,(1-nock)*.6,0);
 d.drawHand.visible=loading||loaded||d.releaseAge<.16;
 if(loading){d.drawHand.position.set(0,0,.38).applyEuler(d.arrow.rotation).add(d.arrow.position);}
 else{d.drawHand.position.set(.055,0,draw+Math.max(0,1-d.releaseAge/.16)*.12);}
 g.rotation.z=-.12+(loading?Math.sin(Math.PI*reload)*.08:0);
}

const eyeScratch=new THREE.Vector3();
export function updateBowVisibility(g,eye,charge){
 const d=g.userData;if(!d.firstPerson)return 1;
 const alpha=.55*(1-ease((charge-.7)/.24));d.visibility=alpha;
 g.traverse(m=>{if(m.material)m.material.opacity=alpha;});
 d.drawHand.getWorldPosition(eyeScratch);
 const distance=eyeScratch.distanceTo(eye),handAlpha=ease((distance-.36)/.22);
 d.drawHand.material.opacity=Math.min(alpha,handAlpha);
 return alpha;
}
