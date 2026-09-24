import * as THREE from './vendor/three.module.js';
import {batchMeshes} from './render-batches.js';
import {SHOTGUN_SEPARATION,SHOTGUN_MODEL_SCALE} from './weapons.mjs';

const steelMaterial=new THREE.MeshStandardMaterial({color:0x494944,metalness:.35,roughness:.58,flatShading:true});
const woodMaterial=new THREE.MeshStandardMaterial({color:0x62361e,roughness:.72,flatShading:true});
const boreMaterial=new THREE.MeshStandardMaterial({color:0x101110,roughness:1});
const beadMaterial=new THREE.MeshStandardMaterial({color:0xae9466,roughness:.6});
// Original low-poly silhouette studied from Nuria Cherta's Sketchfab reference.
// Coordinates are (rearward z, height y); no downloaded model or textures.
function profile(points,width,bevel=.003){
 const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:width-2*bevel,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1});
 geometry.translate(0,0,-width/2+bevel);geometry.rotateY(Math.PI/2);return geometry;
}
// Curved bird's-head grip, narrow wrist and a rounded, faceted heel.
const stockGeometry=profile([[-.005,.022],[.073,.016],[.14,-.002],[.208,-.032],[.265,-.077],[.302,-.127],[.315,-.18],[.3,-.217],[.27,-.227],[.234,-.21],[.208,-.176],[.181,-.131],[.15,-.097],[.105,-.075],[.036,-.067],[-.008,-.053]],.074,.007);
stockGeometry.scale(.9,.76,.72);
const receiverGeometry=profile([[-.066,.055],[-.018,.055],[.016,.033],[.058,.012],[.058,-.045],[.015,-.064],[-.055,-.06],[-.072,-.038]],.077,.003);
const lockGeometry=profile([[.012,.022],[.075,.009],[.135,-.017],[.15,-.037],[.137,-.054],[.097,-.06],[.032,-.044],[.005,-.025]],.003,.0006);
const forendGeometry=profile([[-.105,-.008],[-.49,-.008],[-.516,-.02],[-.492,-.038],[-.19,-.058],[-.105,-.041]],.068,.004);
// Hooked external hammers: forward faces meet the breech on their firing arc.
const hammerGeometry=profile([[0,0],[.01,.008],[.012,.028],[.017,.052],[.014,.062],[.005,.067],[-.004,.064],[-.005,.056],[.005,.054],[.002,.029],[-.008,.012]],.012,.001);
// Closed 360-degree tube: outer wall, muzzle lip, inner wall and rear rim.
const barrelGeometry=new THREE.LatheGeometry([[.016,0],[.028,0],[.026,.58],[.016,.58],[.016,0]].map(([r,z])=>new THREE.Vector2(r,z)),12,0,Math.PI*2);barrelGeometry.rotateX(-Math.PI/2);
const ribGeometry=profile([[0,.053],[-.58,.049],[-.58,.055],[0,.06]],.01,.0005);
function curvedStrip(points,radius){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([z,y])=>new THREE.Vector3(0,y,z))),12,radius,4,false);}
const guardGeometry=curvedStrip([[.025,-.055],[.007,-.081],[.02,-.121],[.068,-.135],[.118,-.12],[.14,-.095],[.12,-.073]],.0035);
const triggerGeometry=curvedStrip([[.045,-.053],[.04,-.078],[.046,-.098],[.058,-.108]],.0025);
export function createShotgun(parent,steel,wood,skin,firstPerson=false){
 const gun=new THREE.Group();gun.scale.setScalar(SHOTGUN_MODEL_SCALE);parent.add(gun);
 function part(geometry,material,p=gun,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);p.add(mesh);return mesh;}
 part(stockGeometry,woodMaterial);
 for(const side of [-1,1])part(lockGeometry,steelMaterial,gun,side*.039);
 part(receiverGeometry,steelMaterial);
 const hammers=[];
 for(const side of [-1,1]){const pivot=new THREE.Group();pivot.position.set(side*SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),-.025,.025);gun.add(pivot);part(hammerGeometry,steelMaterial,pivot,side*.024);
  part(new THREE.BoxGeometry(.029,.01,.011),steelMaterial,pivot,side*.012,.063,.007);
  const pin=part(new THREE.CylinderGeometry(.009,.009,.008,8),steelMaterial,gun,side*.05,-.025,.025);pin.rotation.z=Math.PI/2;
  pivot.rotation.x=.38;hammers.push(pivot);}
 part(guardGeometry,steelMaterial);part(triggerGeometry,steelMaterial,gun,-.012);part(triggerGeometry,steelMaterial,gun,.012,0,.036);
 const lever=new THREE.Group();lever.position.set(0,.061,-.018);gun.add(lever);
 part(profile([[0,0],[.067,0],[.078,.005],[.073,.014],[.05,.015],[0,.008]],.012,.001),steelMaterial,lever);
 const barrels=new THREE.Group();barrels.position.z=-.06;gun.add(barrels);
 for(const x of [-SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE)]){
  part(barrelGeometry,steelMaterial,barrels,x,.025);
  const bore=part(new THREE.CircleGeometry(.016,8),boreMaterial,barrels,x,.025,-.5);bore.rotation.y=Math.PI;
 }
 part(profile([[.004,.053],[-.045,.053],[-.055,-.012],[.004,-.02]],.073),steelMaterial,barrels);
 part(ribGeometry,steelMaterial,barrels);part(forendGeometry,woodMaterial,barrels);
 part(new THREE.SphereGeometry(.006,8,6),beadMaterial,barrels,0,.06,-.563);
 const supportHand=part(new THREE.SphereGeometry(.10,8,6),skin,barrels,-.025,-.117,-.32);
 const flash=new THREE.Group();barrels.add(flash);flash.visible=false;
 const flameMaterial=new THREE.MeshBasicMaterial({color:0xffb44d,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
 const coreMaterial=new THREE.MeshBasicMaterial({color:0xfff5d5,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
 for(const x of [-SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE)]){
  const burst=new THREE.Group();burst.position.set(x,.025,-.58);flash.add(burst);
  const flame=part(new THREE.ConeGeometry(.22,.8,7),flameMaterial,burst,0,0,-.38);flame.rotation.x=-Math.PI/2;
  const core=part(new THREE.ConeGeometry(.115,.5,6),coreMaterial,burst,0,0,-.23);core.rotation.x=-Math.PI/2;
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3,jet=part(new THREE.ConeGeometry(.045,.36,5),flameMaterial,burst,Math.cos(a)*.065,Math.sin(a)*.065,-.14);jet.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a)*.6,Math.sin(a)*.6,-1).normalize());}
 }
 // Reload parts stay in child groups so static batching cannot absorb them.
 const handPivot=new THREE.Group();barrels.add(handPivot);handPivot.add(supportHand);
 const shellBody=new THREE.MeshStandardMaterial({color:0x943a27,roughness:.8,flatShading:true}),shellBrass=new THREE.MeshStandardMaterial({color:0xb69344,roughness:.45,metalness:.4,flatShading:true});
 function shell(){const g=new THREE.Group();barrels.add(g);const body=part(new THREE.CylinderGeometry(.015,.015,.078,8),shellBody,g);body.rotation.x=Math.PI/2;const cap=part(new THREE.CylinderGeometry(.017,.017,.016,8),shellBrass,g,0,0,.043);cap.rotation.x=Math.PI/2;g.visible=false;return g;}
 const shells=[shell(),shell()],ejected=[shell(),shell()];
 for(const x of [-SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE)])part(new THREE.CircleGeometry(.018,8),boreMaterial,barrels,x,.025,.002);
 batchMeshes(gun);batchMeshes(barrels);
 gun.userData={type:'shotgun',lever,muzzleZ:-.58,muzzleObject:barrels,barrels,flash,flashMaterials:[flameMaterial,coreMaterial],hammers,supportHand,handTarget:new THREE.Vector3(-.025,-.117,-.32),shells,ejected,lastBarrel:0};
 gun.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=true;}});
 return gun;
}

// All phases derive from reload progress, so pausing and packet cadence do
// not skip ejection, create new meshes, or leave shells floating after reload.
export function animateShotgun(gun,ammo,dt,reloadProgress=-1,onEject=null){
 const data=gun.userData,reloading=reloadProgress>=0,p=Math.max(0,Math.min(1,reloadProgress));
 const ease=(a,b)=>{const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
 if(!reloading||p<(data.previousReloadProgress??0)-.1)data.didEject=false;
 data.previousReloadProgress=p;
 const opening=reloading?ease(0,.18)*(1-ease(.82,1)):0;
 data.barrels.rotation.x=-.72*opening;
 data.lever.rotation.y=reloading?.5*ease(0,.06)*(1-ease(.82,.97)):0;
 if(reloading&&p>=.19&&!data.didEject){data.didEject=true;if(onEject)onEject(data.barrels);}
 const fired=reloading&&p>.78?0:2-Math.max(0,Math.min(2,ammo));
 data.hammers.forEach((hammer,index)=>{const target=index<fired?-.75:.38;hammer.rotation.x+=(target-hammer.rotation.x)*(1-Math.exp(-45*dt));});
 for(let i=0;i<2;i++){
  const side=i===0?-1:1,x=side*SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),spent=data.ejected[i],fresh=data.shells[i];
  // The cases are handed to world physics as soon as they leave the breech.
  spent.visible=reloading&&p>=.16&&p<.19;
  spent.position.set(x,.025,-.035+Math.max(0,(p-.16)/.03)*.06);spent.rotation.set(0,0,0);
  const start=i===0?.43:.61,insert=ease(start,start+.17);
  fresh.visible=reloading&&p>=start;
  fresh.position.set(x+side*.035*(1-insert),.025+.085*(1-insert),-.035+.24*(1-insert));fresh.rotation.set(0,0,0);
 }
 const hand=data.handTarget;
 if(reloading){
  if(p<.4){const t=ease(.08,.32);hand.set(-.025-.2*t,-.117-.04*t,-.32+.6*t);}
  else if(p<.81){const i=p<.61?0:1,shell=data.shells[i];hand.set(shell.position.x-.07,shell.position.y-.06,shell.position.z+.035);}
  else{const t=ease(.81,.99);hand.set(-.09+.065*t,-.035-.082*t,.03-.35*t);}
 }else hand.set(-.025,-.117,-.32);
 data.supportHand.position.lerp(hand,1-Math.exp(-22*dt));
}
