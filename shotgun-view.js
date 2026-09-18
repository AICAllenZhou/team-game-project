import * as THREE from './vendor/three.module.js';
import {batchMeshes} from './render-batches.js';
export function createShotgun(parent,steel,wood,skin,firstPerson=false){
 const gun=new THREE.Group();parent.add(gun);
 function box(w,h,d,material,x,y,z,p=gun){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);p.add(m);return m;}
 // A handful of flat faces define the old-fashioned stock and tapered fore-end.
 function profile(points,width,material,p=gun,x=0){const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,steps:1});g.translate(0,0,-width/2);g.rotateY(Math.PI/2);const m=new THREE.Mesh(g,material);m.position.x=x;p.add(m);return m;}
 box(.19,.095,.23,steel,0,-.005,.015);
 profile([[.07,.025],[.22,-.025],[.32,-.13],[.26,-.22],[.17,-.12],[.07,-.07]],.115,wood);
 // The shoulder end is outside the first-person view, avoiding sight obstruction.
 if(!firstPerson){profile([[.25,-.07],[.62,-.10],[.66,-.36],[.40,-.28],[.25,-.22]],.14,wood);box(.15,.26,.025,steel,0,-.23,.65);}
 // Two small exposed hammers, without engraving or extra ornamental parts.
 for(const x of [-.082,.082])profile([[.07,.015],[.105,.045],[.125,.11],[.10,.125],[.08,.07],[.04,.05]],.022,steel,gun,x);
 const guard=new THREE.Mesh(new THREE.TorusGeometry(.065,.009,4,8),steel);guard.rotation.y=Math.PI/2;guard.scale.set(1,.7,1);guard.position.set(0,-.115,.06);gun.add(guard);
 const barrels=new THREE.Group();barrels.position.z=-.06;gun.add(barrels);
 const dark=new THREE.MeshStandardMaterial({color:0x171918,roughness:.85});
 for(const x of [-.066,.066]){
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.049,.058,1.02,10),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(x,.025,-.51);barrels.add(barrel);
  const bore=new THREE.Mesh(new THREE.CircleGeometry(.035,10),dark);bore.rotation.y=Math.PI;bore.position.set(x,.025,-1.021);barrels.add(bore);
 }
 profile([[-.12,-.025],[-.55,-.03],[-.64,-.065],[-.51,-.095],[-.12,-.10]],.14,wood,barrels);
 const bead=new THREE.Mesh(new THREE.SphereGeometry(.012,6,4),new THREE.MeshStandardMaterial({color:0xcfaa63,roughness:.6}));bead.position.set(0,.082,-.99);barrels.add(bead);
 const hand=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),skin);hand.position.set(-.04,-.14,-.31);barrels.add(hand);
 const flash=new THREE.Group();barrels.add(flash);flash.visible=false;
 const flameMaterial=new THREE.MeshBasicMaterial({color:0xffe4ad,transparent:true,opacity:.8,depthWrite:false});
 for(const x of [-.066,.066]){const flame=new THREE.Mesh(new THREE.ConeGeometry(.055,.2,5),flameMaterial);flame.rotation.x=-Math.PI/2;flame.position.set(x,.025,-1.12);flash.add(flame);}
 batchMeshes(gun);batchMeshes(barrels);
 gun.userData={type:'shotgun',muzzleZ:-1.022,muzzleObject:barrels,barrels,flash};
 gun.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=true;}});
 return gun;
}
