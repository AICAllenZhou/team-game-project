import * as THREE from './vendor/three.module.js';
import {batchMeshes} from './render-batches.js';
export function createShotgun(parent,steel,wood,skin,firstPerson=false){
 const gun=new THREE.Group();parent.add(gun);
 function box(w,h,d,material,x,y,z,p=gun){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);p.add(m);return m;}
 box(.22,.1,.22,steel,0,0,.02);box(.14,.19,.12,wood,0,-.12,.13);
 // In the first-person view the buttstock is against the unseen shoulder.
 if(!firstPerson)box(.13,.14,.27,wood,0,-.2,.25);
 const barrels=new THREE.Group();barrels.position.z=-.06;gun.add(barrels);
 const dark=new THREE.MeshStandardMaterial({color:0x171918,roughness:.85});
 for(const x of [-.066,.066]){
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.056,.061,.76,10),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(x,.025,-.38);barrels.add(barrel);
  const bore=new THREE.Mesh(new THREE.CircleGeometry(.036,10),dark);bore.rotation.y=Math.PI;bore.position.set(x,.025,-.761);barrels.add(bore);
 }
 box(.17,.09,.34,wood,0,-.055,-.35,barrels);
 const bead=new THREE.Mesh(new THREE.SphereGeometry(.014,6,4),new THREE.MeshStandardMaterial({color:0xcfaa63,roughness:.6}));bead.position.set(0,.09,-.73);barrels.add(bead);
 const hand=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),skin);hand.position.set(-.04,-.14,-.31);barrels.add(hand);
 const flash=new THREE.Group();barrels.add(flash);flash.visible=false;
 const flameMaterial=new THREE.MeshBasicMaterial({color:0xffe4ad,transparent:true,opacity:.8,depthWrite:false});
 for(const x of [-.066,.066]){const flame=new THREE.Mesh(new THREE.ConeGeometry(.055,.2,5),flameMaterial);flame.rotation.x=-Math.PI/2;flame.position.set(x,.025,-.86);flash.add(flame);}
 batchMeshes(gun);batchMeshes(barrels);
 gun.userData={type:'shotgun',muzzleZ:-.762,muzzleObject:barrels,barrels,flash};
 gun.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=true;}});
 return gun;
}
