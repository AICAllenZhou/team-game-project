import * as THREE from './vendor/three.module.js';
const wood=new THREE.MeshStandardMaterial({color:0x795134,roughness:.8,flatShading:true});
const shaft=new THREE.CylinderGeometry(.012,.012,.8,6),tip=new THREE.ConeGeometry(.035,.12,4),feather=new THREE.BoxGeometry(.09,.005,.1);
const arrowWood=new THREE.MeshStandardMaterial({color:0xc9a46a,roughness:.8}),metal=new THREE.MeshStandardMaterial({color:0x929b9c,metalness:.7,roughness:.4}),fletch=new THREE.MeshStandardMaterial({color:0xdecdb4,side:THREE.DoubleSide});
export function createArrow(){
 const g=new THREE.Group(),body=new THREE.Mesh(shaft,arrowWood),head=new THREE.Mesh(tip,metal);body.rotation.x=Math.PI/2;head.rotation.x=-Math.PI/2;head.position.z=-.46;g.add(body,head);
 for(let i=0;i<3;i++){const f=new THREE.Mesh(feather,fletch);f.position.z=.32;f.rotation.z=i*Math.PI/3;g.add(f);}return g;
}
export function createBow(parent){
 const g=new THREE.Group();parent.add(g);
 const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.63,.12),new THREE.Vector3(0,-.4,-.06),new THREE.Vector3(0,0,-.13),new THREE.Vector3(0,.4,-.06),new THREE.Vector3(0,.63,.12)]);
 g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,16,.023,6,false),wood));
 const grip=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.19,8),new THREE.MeshStandardMaterial({color:0x34291e}));grip.position.z=-.13;g.add(grip);
 const string=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3)),new THREE.LineBasicMaterial({color:0xd2c9ac}));g.add(string);
 const arrow=createArrow();g.add(arrow);g.userData={type:'bow',muzzleZ:-.5,string,arrow};animateBow(g,0,true);return g;
}
export function animateBow(g,charge,loaded=true){
 const draw=.12+Math.max(0,Math.min(1,charge))*.35,p=g.userData.string.geometry.attributes.position;
 p.setXYZ(0,0,-.63,.12);p.setXYZ(1,0,0,draw);p.setXYZ(2,0,.63,.12);p.needsUpdate=true;
 g.userData.arrow.visible=loaded;g.userData.arrow.position.set(.03,.025,draw-.4);g.rotation.z=-.12;
}
