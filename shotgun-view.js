import * as THREE from './vendor/three.module.js';
import {batchMeshes} from './render-batches.js';
import {SHOTGUN_SEPARATION,SHOTGUN_MODEL_SCALE} from './weapons.mjs';

const steelMaterial=new THREE.MeshStandardMaterial({color:0x494944,metalness:.35,roughness:.58,flatShading:true});
const woodMaterial=new THREE.MeshStandardMaterial({color:0x62361e,roughness:.72,flatShading:true});
const boreMaterial=new THREE.MeshStandardMaterial({color:0x101110,roughness:1});
const beadMaterial=new THREE.MeshStandardMaterial({color:0xae9466,roughness:.6});
// Side outlines hand-traced from the supplied 1912 x 492 reference photo.
// Keep the original reference scale; only cut the barrels just past the fore-end.
const scale=1.022/(1887-920),axisY=135;
const stockOutline=[[90,270],[97,255],[112,247],[476,203],[515,202],[537,209],[551,225],[704,164],[792,137],[854,126],[879,155],[875,204],[756,232],[674,253],[626,282],[590,319],[565,345],[544,353],[525,350],[507,338],[500,318],[487,344],[404,380],[312,420],[133,490],[96,300]];
const forendOutline=[[1050,161],[1418,158],[1448,178],[1050,199]];
const actionOutline=[[868,161],[918,165],[1048,163],[1048,195],[888,206],[870,198]];
const hammerOutline=[[807,191],[831,186],[839,176],[827,151],[818,127],[813,109],[819,103],[826,108],[831,128],[841,145],[857,168],[866,185],[857,198],[829,201]];
function trace(points,width,originX=864,bevel=.003){
 const shape=new THREE.Shape();points.forEach(([x,y],i)=>{const px=(x-originX)*scale,py=.025+(axisY-y)*scale;i?shape.lineTo(px,py):shape.moveTo(px,py);});shape.closePath();
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:width-2*bevel,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1});
 geometry.translate(0,0,-width/2+bevel);geometry.rotateY(Math.PI/2);return geometry;
}
// Clip only the unseen shoulder end, preserving the traced wrist in first person.
function clipShoulder(points,minX){const result=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],inside=a[0]>=minX,nextInside=b[0]>=minX;if(inside)result.push(a);if(inside!==nextInside){const t=(minX-a[0])/(b[0]-a[0]);result.push([minX,a[1]+(b[1]-a[1])*t]);}}return result;}
const stockGeometry=trace(stockOutline,.085),wristGeometry=trace(clipShoulder(stockOutline,750),.075);
const forendGeometry=trace(forendOutline,.073,920);
const receiverGeometry=trace(actionOutline,.117);
const hammerGeometry=trace(hammerOutline,.013,864,.0015);
// Tapered, hollow barrels, with a eight sides and deliberately faceted surface normals.
const barrelGeometry=new THREE.LatheGeometry([[.016,.5],[.016,.58],[.025,.58],[.026,.4],[.033,.07],[.033,0]].reverse().map(([r,z])=>new THREE.Vector2(r,z)),8);barrelGeometry.rotateX(-Math.PI/2);
const ribGeometry=trace([[920,103],[1469,108],[1469,112],[920,107]],.014,920,.0005);
function curvedStrip(points,radius){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(0,.025+(axisY-y)*scale,(864-x)*scale))),8,radius,4,false);}
const guardGeometry=curvedStrip([[785,225],[751,244],[747,270],[767,287],[811,289],[852,278],[871,258],[866,236],[853,221]],.004);
const triggerGeometry=curvedStrip([[817,224],[813,241],[816,263],[826,279]],.003);
export function createShotgun(parent,steel,wood,skin,firstPerson=false){
 const gun=new THREE.Group();gun.scale.setScalar(SHOTGUN_MODEL_SCALE);parent.add(gun);
 function part(geometry,material,p=gun,x=0,y=0,z=0){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);p.add(mesh);return mesh;}
 part(firstPerson?wristGeometry:stockGeometry,woodMaterial);
 part(receiverGeometry,steelMaterial);
 const hammers=[];
 for(const side of [-1,1]){const pivot=new THREE.Group();pivot.position.set(side*.05,-.022,.035);gun.add(pivot);const geometry=hammerGeometry.clone();geometry.translate(0,.022,-.035);part(geometry,steelMaterial,pivot,0,.008);pivot.rotation.x=.38;hammers.push(pivot);}
 part(guardGeometry,steelMaterial);part(triggerGeometry,steelMaterial,gun,-.012);part(triggerGeometry,steelMaterial,gun,.012,0,.036);
 const barrels=new THREE.Group();barrels.position.z=-.06;gun.add(barrels);
 for(const x of [-SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE)]){
  part(barrelGeometry,steelMaterial,barrels,x,.025);
  const bore=part(new THREE.CircleGeometry(.016,8),boreMaterial,barrels,x,.025,-.5);bore.rotation.y=Math.PI;
 }
 part(trace([[879,117],[911,104],[920,104],[920,165],[882,165],[873,145]],.117,920),steelMaterial,barrels);
 part(ribGeometry,steelMaterial,barrels);part(forendGeometry,woodMaterial,barrels);
 part(new THREE.SphereGeometry(.006,8,6),beadMaterial,barrels,0,.06,-.563);
 const supportHand=part(new THREE.SphereGeometry(.10,8,6),skin,barrels,-.025,-.117,-.32);
 const flash=new THREE.Group();barrels.add(flash);flash.visible=false;
 const flameMaterial=new THREE.MeshBasicMaterial({color:0xffb44d,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
 const coreMaterial=new THREE.MeshBasicMaterial({color:0xfff5d5,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
 for(const x of [-SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE)]){
  const burst=new THREE.Group();burst.position.set(x,.025,-.58);flash.add(burst);
  const flame=part(new THREE.ConeGeometry(.16,.62,7),flameMaterial,burst,0,0,-.29);flame.rotation.x=-Math.PI/2;
  const core=part(new THREE.ConeGeometry(.085,.38,6),coreMaterial,burst,0,0,-.17);core.rotation.x=-Math.PI/2;
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3,jet=part(new THREE.ConeGeometry(.035,.28,5),flameMaterial,burst,Math.cos(a)*.065,Math.sin(a)*.065,-.14);jet.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a)*.6,Math.sin(a)*.6,-1).normalize());}
 }
 // Reload parts stay in child groups so static batching cannot absorb them.
 const handPivot=new THREE.Group();barrels.add(handPivot);handPivot.add(supportHand);
 const shellBody=new THREE.MeshStandardMaterial({color:0x943a27,roughness:.8,flatShading:true}),shellBrass=new THREE.MeshStandardMaterial({color:0xb69344,roughness:.45,metalness:.4,flatShading:true});
 function shell(){const g=new THREE.Group();barrels.add(g);const body=part(new THREE.CylinderGeometry(.015,.015,.078,8),shellBody,g);body.rotation.x=Math.PI/2;const cap=part(new THREE.CylinderGeometry(.017,.017,.016,8),shellBrass,g,0,0,.043);cap.rotation.x=Math.PI/2;g.visible=false;return g;}
 const shells=[shell(),shell()],ejected=[shell(),shell()];
 for(const x of [-SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE),SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE)])part(new THREE.CircleGeometry(.018,8),boreMaterial,barrels,x,.025,.002);
 batchMeshes(gun);batchMeshes(barrels);
 gun.userData={type:'shotgun',muzzleZ:-.58,muzzleObject:barrels,barrels,flash,flashMaterials:[flameMaterial,coreMaterial],hammers,supportHand,handTarget:new THREE.Vector3(-.025,-.117,-.32),shells,ejected,lastBarrel:0};
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
