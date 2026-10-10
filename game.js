import {createLaserEffects} from './laser-view.js';
import {createDuelUI} from './duel-ui.js';
import {createBow,animateBow,createArrow,releaseBow,resetBow,updateBowVisibility,ARROW_TIP_Z} from './bow-view.js';
import {createBowMarker,placeBowMarker,createBowGuide,placeBowGuide,seatArrow,wobbleStuckArrow} from './bow-feedback.js';
import {DUEL_SOLIDS} from './arena.mjs';
import {chargedArrow,BOW_CHARGE_MS} from './weapons.mjs';
import {preparePlay} from './play-start.js';
import {adminLoadout,applyAdminLoadout,createAutoFire} from './admin-gameplay.mjs';
import {createTrainingCans} from './training-cans.mjs';
import {createWallet,restoreWallet,canShop,awardBeans,purchaseAmmo} from './shop.mjs';
import {createShopView} from './shop-view.js';
import {createShopMenu} from './shop-ui.js';
import {createCanCharacter,createCanEffects,resetCan} from './can-characters.js';
import {launchProjectile,advanceProjectile,advanceVisualProjectile,predictArrowImpact,traceLaser} from './projectile-physics.mjs';
import {createMenu} from './menu.js';
import {installBeanScare} from './bean-scare.js';
import {API_BASE} from './runtime-config.js';
import {createLanClient} from './lan-client.js';
import {applyDamage,setPowers} from './combat.mjs';
import {createVoxelWalls} from './voxel-walls.mjs';
import {createVoxelWallView} from './voxel-wall-view.js';
import * as THREE from './vendor/three.module.js';
import {createWeaponAudio} from './weapon-audio.js';
import {createGameLoop} from './game-loop.js';
import {batchMeshes,createParticles} from './render-batches.js';
import {createSkeetRange,clayPose} from './skeet.mjs';
import {createSkeetView} from './skeet-view.js';
import {AMMO_MODS,ammoProfile,SHOTGUN_PICKUP,canPickUpShotgun,WEAPONS,shotgunPellets,SHOTGUN_INTERVAL,shotgunDischarge,SHOTGUN_SEPARATION,SHOTGUN_MODEL_SCALE} from './weapons.mjs';
import {createShellPhysics} from './shell-physics.js';
import {createShotgun,animateShotgun} from './shotgun-view.js';
import {placeWeapon,freeAimInput,followAim,stepRecoil,kickRecoil,captureBarrelRay} from './weapon-pose.js';
import {move,TRAINING_TARGETS,traceShot,predictionCorrection,settlePrediction,FAN_INTERVAL,FAN_CLICK_WINDOW} from './simulation.mjs';
const $=id=>document.getElementById(id);
const gameLoop=createGameLoop({onFrame:now=>frame(now)});
let renderReady=false,inputTimer=null,idleTimer=null,pendingState=null,stopInputPending=false;
const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:false});renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x9b9387);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x9b9387,38,100);const laserEffects=createLaserEffects(scene);
const shellPhysics=createShellPhysics(scene),canEffects=createCanEffects(scene,{floorAt:(x,z,y)=>mapId==='duel'?wallWorld.floorAt(x,z,y):0});
function ejectShells(frame){for(const side of [-1,1])shellPhysics.eject(frame,side*SHOTGUN_SEPARATION/(2*SHOTGUN_MODEL_SCALE));}
const scenery=new THREE.Group();scene.add(scenery);
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
// Keep one rendering path active so firing/aiming cannot switch render targets
// and shader variants midway through mouse movement.
const shotBuffer=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,samples:2});
const colorShift=new THREE.ShaderMaterial({
 uniforms:{frame:{value:shotBuffer.texture},exposure:{value:0},strength:{value:0},blast:{value:0},muzzleUV:{value:new THREE.Vector2(.5,.3)},heat:{value:0},time:{value:0},aspect:{value:1},aimStart:{value:new THREE.Vector2(.5,.3)},aimEnd:{value:new THREE.Vector2(.5,.6)}},depthTest:false,depthWrite:false,
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
 fragmentShader:`uniform sampler2D frame; uniform float strength,blast,heat,time,aspect,exposure; uniform vec2 aimStart,aimEnd,muzzleUV; varying vec2 vUv;
 vec3 bright(vec2 uv){vec3 c=texture2D(frame,clamp(uv,vec2(0.001),vec2(0.999))).rgb;return c*smoothstep(0.65,1.0,max(c.r,max(c.g,c.b)));}
 void main(){vec2 radial=vUv-0.5;float edge=smoothstep(0.2,0.65,length(radial));
 vec2 ratio=vec2(aspect,1.0),wave=vec2(0.0);
 if(heat>0.001){vec2 a=aimStart*ratio,b=aimEnd*ratio,p=vUv*ratio,ab=b-a;
 float along=clamp(dot(p-a,ab)/max(dot(ab,ab),0.00001),0.0,1.0);
 float beamDistance=length(p-a-ab*along);
 float haze=exp(-beamDistance*beamDistance/0.00045)*heat*smoothstep(0.0015,0.004,beamDistance);
 wave=vec2(sin(vUv.y*110.0-time*7.0),cos(vUv.x*95.0+time*5.0))*haze*0.0025;}
 vec2 uv=clamp(vUv+wave,vec2(0.001),vec2(0.999));
 vec2 shift=radial*edge*strength*0.009;
 vec3 color=texture2D(frame,uv).rgb;
 if(strength>0.001){color.r=texture2D(frame,clamp(uv+shift,vec2(0.001),vec2(0.999))).r;
 color.b=texture2D(frame,clamp(uv-shift,vec2(0.001),vec2(0.999))).b;}
 // Skip the bright-pass texture fetches between shots, keeping one shader.
 if(blast>0.001){vec2 muzzleDelta=(vUv-muzzleUV)*ratio;float radius2=dot(muzzleDelta,muzzleDelta);
 // Only pixels near the muzzle need the eight bloom texture samples.
 if(radius2<0.20){vec2 texel=vec2(0.008/aspect,0.008);
 vec3 bloom=bright(uv+texel*vec2(1.,0.))+bright(uv+texel*vec2(-1.,0.))
 +bright(uv+texel*vec2(0.,1.))+bright(uv+texel*vec2(0.,-1.))
 +bright(uv+texel*vec2(1.,1.))+bright(uv+texel*vec2(-1.,1.))
 +bright(uv+texel*vec2(1.,-1.))+bright(uv+texel*vec2(-1.,-1.));
 float halo=exp(-radius2/0.003)*0.9+exp(-radius2/0.024)*0.18;
 color+=blast*(bloom*0.16*exp(-radius2/0.05)+vec3(1.0,0.64,0.29)*halo);}}
 gl_FragColor=vec4(color,1.0);
 #include <colorspace_fragment>
 // Smooth screen glow shares the existing GPU pass. No animated DOM blur,
 // gradient repaint or extra screen-blend compositor layers while firing.
 if(exposure>0.0001){float radius=length(radial*2.0);
 float glow=smoothstep(0.64-exposure*0.24,1.18,radius)*exposure*0.22;
 vec3 tint=vec3(1.0,0.76,0.48);
 tint+=vec3(0.16,-0.02,0.16)*radial.x;
 gl_FragColor.rgb=mix(gl_FragColor.rgb,tint,glow);}
 }`
});
const screenScene=new THREE.Scene(),screenCamera=new THREE.Camera();screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),colorShift));
const camera=new THREE.PerspectiveCamera(100,innerWidth/innerHeight,.05,240);camera.rotation.order='YXZ';scene.add(camera);
scene.add(new THREE.HemisphereLight(0xc9d0dc,0x705237,1.9));const sun=new THREE.DirectionalLight(0xffd09a,2.6);sun.position.set(-20,18,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,far:90});sun.shadow.bias=-.001;scene.add(sun);
const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true});
const sand=mat(0xa8895c),edge=mat(0x796345),skin=mat(0xd7b18a),steel=mat(0x484b4a),wood=mat(0x633f2a),hat=mat(0x493d2b);
function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,m,p,x,y,z){return mesh(new THREE.BoxGeometry(w,h,d),m,p,x,y,z);}
box(56,.5,56,sand,scenery,0,-.26,0);const grid=new THREE.GridHelper(56,28,0x8f784f,0xad915f);grid.position.y=.002;grid.material.transparent=true;grid.material.opacity=.24;scene.add(grid);
for(const side of [-1,1]){box(56,.16,.18,edge,scenery,0,.08,side*27.8);box(.18,.16,56,edge,scenery,side*27.8,.08,0);for(let i=-24;i<=24;i+=8){box(.22,1.2,.22,wood,scenery,i,.6,side*28);box(.22,1.2,.22,wood,scenery,side*28,.6,i);}}
// Distant scenery stays outside the playable base plate.
const rockMaterials=[mat(0xa69379),mat(0x9a8a73)];
for(let i=0;i<20;i++){const a=i*2.399,r=65+(i%3)*12;const rock=mesh(new THREE.ConeGeometry(10+i%7,7+i%5,4),rockMaterials[i%2],scenery,Math.sin(a)*r,1,Math.cos(a)*r);rock.rotation.y=a;}
function revolver(parent){const g=new THREE.Group();parent.add(g);box(.12,.14,.32,steel,g,0,0,-.05);box(.085,.09,.34,steel,g,0,.025,-.35);
 const cylinderPivot=new THREE.Group();cylinderPivot.position.set(0,.005,-.04);g.add(cylinderPivot);
 const cylinder=mesh(new THREE.CylinderGeometry(.095,.095,.17,12),steel,cylinderPivot);cylinder.rotation.x=Math.PI/2;
 const grip=box(.1,.23,.12,wood,g,0,-.16,.08);grip.rotation.x=-.25;
 // Small SAA-style hammer: the pivot and lower shank sit inside the rear
 // frame, with only the narrow head and thumb spur protruding above it.
 const hammer=new THREE.Group();hammer.position.set(0,-.012,.087);g.add(hammer);
 box(.024,.095,.03,steel,hammer,0,.043,.003);hammer.rotation.x=.62;
 const fanHand=new THREE.Group();g.add(fanHand);mesh(new THREE.SphereGeometry(.115,8,6),skin,fanHand);fanHand.visible=false;
 batchMeshes(g);batchMeshes(cylinderPivot);
 Object.assign(g.userData,{cylinder,cylinderPivot,cylinderFrom:0,cylinderTarget:0,hammer,fanHand,firedAt:-1000,fanAt:-1000});return g;}
function animateRevolver(g,now,dt){const data=g.userData;
 if(data.type==='shotgun'||data.type==='bow')return;
 const age=Math.max(0,(now-data.firedAt)/1000),recockStart=data.fanning?.035:.075,recockTime=data.fanning?.065:.13;
 const ease=x=>{const a=Math.max(0,Math.min(1,x));return a*a*(3-2*a);};
 // The hammer is down when the shot ignites. Cocking then pulls it back and
 // indexes the next chamber together, finishing before another shot is ready.
 const cock=ease((age-recockStart)/recockTime);
 data.hammer.rotation.x=.62*cock;
 data.cylinderPivot.rotation.z=data.cylinderFrom+(data.cylinderTarget-data.cylinderFrom)*cock;
 const fanAge=(now-data.fanAt)/1000;data.fanHand.visible=fanAge<.34;
 if(data.fanHand.visible){const stroke=Math.sin(Math.min(1,fanAge/.13)*Math.PI),exit=Math.max(0,(fanAge-.15)/.19);data.fanHand.position.set(-.33+stroke*.35-exit*.2,.1+stroke*.01-exit*.2,.15);}
}
function cockRevolver(g,now,fan){const data=g.userData;if(data.type==='shotgun'||data.type==='bow')return;data.hammer.rotation.x=0;data.cylinderFrom=data.cylinderTarget;data.cylinderTarget+=Math.PI*2/(data.heavy?3:6);data.firedAt=now;data.fanning=fan;if(fan)data.fanAt=now;}
function setRevolverAmmo(g,mod){const d=g.userData,heavy=mod==='heavy';if(d.heavy===heavy)return;d.heavy=heavy;d.cylinder.geometry.dispose();d.cylinder.geometry=new THREE.CylinderGeometry(heavy?.115:.095,heavy?.115:.095,.17,heavy?3:12);}
function cowboy(color,type=[0xc17a47,0x658c91,0x96799c,0x879466].indexOf(color)%3){const g=createCanCharacter(type);
 const right=new THREE.Group();right.position.set(.4,1.15,-.55);g.add(right);mesh(new THREE.SphereGeometry(.13,8,6),skin,right,0,-.13,.07);g.userData.revolver=revolver(right);
 g.userData.shotgun=createShotgun(right,steel,wood,skin);g.userData.shotgun.visible=false;
 g.userData.bow=createBow(right);g.userData.bow.visible=false;g.userData.rightHand=right;scene.add(g);return g;}
const rig=new THREE.Group();camera.add(rig);
// The revolver is held with one visible hand.
const wrist=new THREE.Group();wrist.position.set(0,-.13,.07);rig.add(wrist);
const viewHand=mesh(new THREE.SphereGeometry(.13,8,6),skin.clone(),wrist);viewHand.material.transparent=true;const revolverGun=revolver(wrist),shotgunGun=createShotgun(wrist,steel,wood,skin,true);const bowGun=createBow(wrist,{firstPerson:true});let gun=revolverGun,weapon='revolver';bowGun.visible=false;
revolverGun.position.set(0,.13,-.07);bowGun.position.copy(revolverGun.position);shotgunGun.position.copy(revolverGun.position);shotgunGun.visible=false;
placeWeapon(rig,{});
const flash=new THREE.Group();gun.add(flash);flash.position.set(0,.025,-.52);flash.visible=false;
const flashOuterMaterial=new THREE.MeshBasicMaterial({color:0xffa647,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false});
const flashCoreMaterial=new THREE.MeshBasicMaterial({color:0xfff4d6,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});
const flame=mesh(new THREE.ConeGeometry(.15,.52,7),flashOuterMaterial,flash,0,0,-.22);flame.rotation.x=-Math.PI/2;
const flashCore=mesh(new THREE.SphereGeometry(.08,8,6),flashCoreMaterial,flash,0,0,-.09);flashCore.scale.set(1,1,2.8);
for(let i=0;i<5;i++){const a=i*Math.PI*2/5,jet=mesh(new THREE.ConeGeometry(.045,.24,5),flashOuterMaterial,flash,Math.cos(a)*.1,Math.sin(a)*.1,-.12);jet.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a)*.55,Math.sin(a)*.55,-1).normalize());}
const gapFlash=new THREE.Group();gun.add(gapFlash);gapFlash.position.set(0,.005,-.1);gapFlash.visible=false;
for(const side of [-1,1]){const jet=mesh(new THREE.ConeGeometry(.035,.15,5),flashOuterMaterial,gapFlash,side*.13,0,0);jet.rotation.z=-side*Math.PI/2;}
// Keep the light visible at zero intensity to prevent shader recompilation
// whenever a muzzle flash changes the number of visible lights.
const muzzleLight=new THREE.PointLight(0xffb95d,0,7,2);scene.add(muzzleLight);
rig.traverse(object=>{if(object.isMesh)object.castShadow=false;});
const aimGeometry=new THREE.BufferGeometry();aimGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
const aimMaterial=new THREE.LineBasicMaterial({color:0xffdf9b,transparent:true,opacity:0,depthWrite:false});
const aimBeam=new THREE.Line(aimGeometry,aimMaterial);aimBeam.frustumCulled=false;scene.add(aimBeam);
const shotExposure={energy:0,visible:0};
const targets=new Map();
for(const target of TRAINING_TARGETS){
 const g=new THREE.Group();scene.add(g);g.position.set(target.x,target.y,target.z);
 const face=mesh(new THREE.SphereGeometry(target.radius,20,12),mat(0xd8d1af),g);
 for(const side of [-1,1]){
  const ring=mesh(new THREE.TorusGeometry(.29,.05,6,24),mat(0xb43b28),g,0,0,side*.465);
  mesh(new THREE.SphereGeometry(.12,12,8),mat(0xb43b28),g,0,0,side*.54);
 }
 box(.1,1.05,.1,steel,scenery,target.x,.525,target.z);box(.8,.08,.6,wood,scenery,target.x,.04,target.z);
 targets.set(target.id,{group:g,face,hitAt:-100});
}
createShopView(scenery);
batchMeshes(scenery);
scenery.updateWorldMatrix(true,true);
scenery.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});
const dummies=[cowboy(0xa57450,0),cowboy(0x6b9290,1),cowboy(0x9d7b8f,2)];dummies.forEach((g,i)=>g.position.set((i-1)*5,0,-9-Math.abs(i-1)*3));
let mapId='practice',duelState=null,latestState=null,deathAt=0,bowChargeAt=null;
let menu,hasJoined=false,currentRoom='',playerCode='',lanClient=null,soloSnapshot=null;
let token=null,id=null,events=null,online=false,joining=false,local={x:0,y:0,z:8,vy:0,hp:100,ammo:6},yaw=0,pitch=0,freeX=0,freeY=0,gunYaw=0,gunPitch=0,lastShot=-Infinity,reloading=0,last=0,lastAimFrame=0,started=0,serverTime=0,receivedAt=0;
Object.assign(local,createWallet());try{Object.assign(local,restoreWallet(JSON.parse(localStorage.getItem('dustline_beans_v1'))));}catch{}
let walletSavePending=false;
function saveWallet(){if(online||walletSavePending)return;walletSavePending=true;queueMicrotask(()=>{walletSavePending=false;if(!online)try{localStorage.setItem('dustline_beans_v1',JSON.stringify({beans:local.beans,ownedAmmo:local.ownedAmmo}));}catch{}});}
const autoFire=createAutoFire();
const keys=new Set(),peers=new Map(),projectiles=[];let audio;
const practiceBleeds=[];const pendingShots=new Map();let shotSequence=0,barrelHeat=0;
let displayedAim=null,frozenAim=null,lastClick=-Infinity,queuedFanClick=false;
const particles=createParticles(scene),emitParticles=particles.emit;
const wallWorld=createVoxelWalls(),wallView=createVoxelWallView(scene,wallWorld);
const wallOld={x:0,y:0,z:0};
const skeetRange=createSkeetRange(),skeetView=createSkeetView(scene);let serverClays=[];
const pickupStand=new THREE.Group();pickupStand.position.set(SHOTGUN_PICKUP.x,0,SHOTGUN_PICKUP.z);scene.add(pickupStand);
const stand=new THREE.Mesh(new THREE.BoxGeometry(1.15,.65,.55),new THREE.MeshStandardMaterial({color:0x574333,roughness:1}));stand.position.y=.325;pickupStand.add(stand);
const pickupGun=createShotgun(pickupStand,null,null,new THREE.MeshStandardMaterial());pickupGun.position.set(-.15,.83,0);pickupGun.rotation.y=Math.PI/2;pickupGun.userData.supportHand.visible=false;
let pickupPending=false,pickupRetryAt=0;
function pickUpShotgun(){
 if(!gameLoop.running||local.hasShotgun||reloading||pickupPending||gameLoop.now()<pickupRetryAt||!canPickUpShotgun(local,yaw,pitch))return;
 if(online){pickupPending=true;pickupRetryAt=gameLoop.now()+500;post('pickup',{yaw,pitch}).catch(actionError).finally(()=>{pickupPending=false;});}
 else{local.hasShotgun=true;equip('shotgun');}
}
const clayCandidates=Array.from({length:3},()=>({})),liveClays=[];
function skeetTime(){return online?serverTime+gameLoop.now()-receivedAt:gameLoop.now();}
function launchClay(){if(mapId!=='practice'||!gameLoop.running||local.hp<=0)return;if(online)post('launch').catch(actionError);else skeetRange.launch(gameLoop.now());}
const roundGeometry=new THREE.CapsuleGeometry(.045,.4,3,8),roundMaterial=new THREE.MeshBasicMaterial({color:0xffedb0});
const glowMaterial=new THREE.MeshBasicMaterial({color:0xffb744,transparent:true,opacity:.22,depthWrite:false});
const pelletMesh=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.017,.28,2,5),new THREE.MeshBasicMaterial({color:0xffffdf}),384),pelletMatrix=new THREE.Matrix4(),pelletRotation=new THREE.Quaternion(),pelletUp=new THREE.Vector3(0,1,0),pelletScale=new THREE.Vector3(1,1,1);pelletMesh.count=0;pelletMesh.frustumCulled=false;pelletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(pelletMesh);
const ammoByWeapon={revolver:6,shotgun:2,bow:1};let lastShotWeapon='revolver';
function showWeapon(next){if(next===weapon)return;weapon=next;focusHeld=false;gun=weapon==='shotgun'?shotgunGun:weapon==='bow'?bowGun:revolverGun;bowGun.visible=weapon==='bow';bowChargeAt=null;resetBow(bowGun);revolverGun.visible=weapon==='revolver';shotgunGun.visible=weapon==='shotgun';displayedAim=frozenAim=null;queuedFanClick=false;shotExposure.energy=shotExposure.visible=barrelHeat=0;wristSpring.angle=wristSpring.velocity=0;}
function equip(next){if(!gameLoop.running||local.reloadUntil||reloading||next===weapon||(next==='shotgun'&&!local.hasShotgun)||(next==='bow'&&!local.hasBow))return;if(online)post('equip',{weapon:next}).catch(actionError);else{ammoByWeapon[weapon]=local.ammo;showWeapon(next);local.weapon=next;local.ammo=ammoByWeapon[next];}}
const resetButton=document.createElement('button');resetButton.id='reset-walls';resetButton.textContent='Reset walls';document.body.append(resetButton);
resetButton.onclick=()=>{if(online)post('resetWalls').catch(actionError);else{wallWorld.reset();wallView.update(0);renderScene();}};
const shopPrompt=document.createElement('div');shopPrompt.id='shop-prompt';shopPrompt.textContent='E · GUNZ';shopPrompt.hidden=true;document.body.append(shopPrompt);
const shopMenu=createShopMenu({getPlayer:()=>local,onClose:()=>captureMouse().catch(()=>syncActivity(false)),buy:async item=>{
 let result;
 if(online){const updated=await post('buy',{weapon:item.weapon,mod:item.mod,yaw,pitch});Object.assign(local,{beans:updated.player.beans,ownedAmmo:updated.player.ownedAmmo,mods:updated.player.mods,ammo:updated.player.ammo,ammoByWeapon:updated.player.ammoByWeapon});serverTime=Math.max(serverTime,updated.time);pendingState=null;result={ok:true,message:updated.message};}
 else{local.weapon=weapon;local.ammoByWeapon=ammoByWeapon;result=purchaseAmmo(local,item.weapon,item.mod,yaw,pitch);saveWallet();}
 Object.assign(ammoByWeapon,local.ammoByWeapon);return result;
}});
window.addEventListener('keydown',e=>{
 if(mapId==='practice'&&e.code==='KeyE'&&!e.repeat&&gameLoop.running&&!reloading&&canShop(online&&predictionReady?{...local,...predicted}:local,yaw,pitch)){
  e.preventDefault();document.exitPointerLock();syncActivity(false);shopPrompt.hidden=true;shopMenu.open();
 }
});
let focusHeld=false,focusBlend=0;
let lookYaw=0,lookPitch=0,handYaw=0,handPitch=0,previousFreeX=0,previousFreeY=0;
const wristSpring={angle:0,velocity:0};let wristTwist=0,flashLife=0;
const cameraSpring={angle:0,velocity:0};
const deathBody=cowboy(0xc17a47);deathBody.visible=false;
const remoteFlashes=[],stuckArrows=[],bowMarker=createBowMarker(scene),bowGuide=createBowGuide(scene),bowPath=[];let nextBowPreview=0;
const predicted={x:0,y:0,z:8,vy:0,yaw:0,pitch:0};let predictionReady=false,correction={x:0,z:0};
const smoothPosition=new THREE.Vector3(0,1.5,8);let walkBlend=0,walkPhase=0,inputInFlight=false;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const positionScratch=new THREE.Vector3(),uvScratch=new THREE.Vector3(),beamEndScratch=new THREE.Vector3(),directionScratch=new THREE.Vector3();
const practiceCandidates=createTrainingCans(),shotCandidates=[];
const duelScenery=new THREE.Group();scene.add(duelScenery);duelScenery.visible=false;
for(const solid of DUEL_SOLIDS)box(solid.w,solid.h,solid.d,edge,duelScenery,solid.x,solid.y,solid.z);
const bowMeter=document.createElement('div');bowMeter.id='bow-charge';bowMeter.hidden=true;document.body.append(bowMeter);
const duelUI=createDuelUI({choose:data=>post('loadout',data),resume:()=>{menu?.close();captureMouse().catch(()=>syncActivity(false));}});
function clearArrows(){bowMarker.visible=bowGuide.visible=false;nextBowPreview=0;for(const a of stuckArrows)a.mesh.removeFromParent();stuckArrows.length=0;}
function setMapView(next){
 if(next===mapId)return;mapId=next;laserEffects.clear();scene.fog.near=next==='duel'?100:38;scene.fog.far=next==='duel'?230:100;const span=next==='duel'?65:35;Object.assign(sun.shadow.camera,{left:-span,right:span,top:span,bottom:-span,far:180});sun.shadow.camera.updateProjectionMatrix();wallWorld.setMap(next);wallView.update(0);clearArrows();
 const practice=next==='practice';scenery.visible=grid.visible=practice;duelScenery.visible=!practice;pickupStand.visible=practice;skeetView.machine.visible=practice;
 for(const t of targets.values())t.group.visible=practice;for(const g of dummies)g.visible=practice;
 resetButton.hidden=!practice;renderer.shadowMap.needsUpdate=true;
}
function shotPayload(origin,direction,extra={}){
 // Offset from the same rendered eye as the weapon; the authority anchors it
 // to its player pose, avoiding stale world coordinates while moving/respawning.
 return {...extra,muzzleOffset:{x:origin.x-camera.position.x,y:origin.y-camera.position.y,z:origin.z-camera.position.z},direction,gunYaw:Math.atan2(-direction.x,-direction.z),gunPitch:Math.asin(clamp(direction.y,-1,1))};
}
function actionError(error){
 // A rejected action is not a lost peer connection. Session failures still
 // come through the transport's onDisconnect callback.
 console.warn(error.message);if(error.status===401)networkError(error);
}
function lodgeArrow(result){
 const arrow=createArrow();scene.add(arrow);
 const victim=result.hit===id?deathBody:peers.get(result.hit)||dummies[practiceCandidates.findIndex(p=>p.id===result.hit)];
 const rest=seatArrow(arrow,result,victim);
 stuckArrows.push({mesh:arrow,rest,victim,age:0,life:15});if(stuckArrows.length>96)stuckArrows.shift().mesh.removeFromParent();
}
function remoteShot(s){
 if(s.id===id||s.id==='local'||s.pellet)return;
 if(s.profile?.laser){audio?.play(1,s.origin);return;}
 const g=peers.get(s.id),rate=s.weapon==='shotgun'?.82:1;
 if(s.weapon==='bow'){if(g)releaseBow(g.userData.bow);audio?.arrow?.(s.origin,s.profile?.charge||0);return;}
 audio?.play(rate,s.origin);
 const f=new THREE.Group();f.position.set(s.origin.x,s.origin.y,s.origin.z);f.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(s.direction.x,s.direction.y,s.direction.z));
 const material=new THREE.MeshBasicMaterial({color:0xffd88d,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}),shape=new THREE.Mesh(new THREE.ConeGeometry(.18,.7,7),material);shape.rotation.x=-Math.PI/2;shape.position.z=-.3;f.add(shape);f.scale.setScalar((s.weapon==='shotgun'?2.2:1)*(s.profile?.flash||1));scene.add(f);remoteFlashes.push({mesh:f,material,life:.09});
 if(g){if(s.weapon==='revolver'){setRevolverAmmo(g.userData.revolver,s.profile?.capacity===3?'heavy':'standard');cockRevolver(g.userData.revolver,gameLoop.now(),s.fan);}g.userData.kick=.18;}
}
function captureAim(){const {origin,direction}=captureBarrelRay(gun);
 const candidates=online?shotCandidates:practiceCandidates;
 if(online){shotCandidates.length=0;if(mapId==='practice')shotCandidates.push(...practiceCandidates);for(const g of peers.values())if(g.userData.target)shotCandidates.push(g.userData.target);}
 liveClays.length=0;const flights=online?serverClays:skeetRange.flights,now=skeetTime();
 for(let i=0;i<flights.length;i++)liveClays.push(clayPose(flights[i],now,clayCandidates[i]));
 return {origin,direction,result:traceShot(origin,direction,candidates,liveClays,wallWorld)};
}
function projectileImpact(result,projectile=null){
 const now=gameLoop.now();
 if(result.arrow){if(result.stuck)lodgeArrow(result);if(result.impactSound!==false)audio?.arrowImpact?.(result.point,!!result.hit);}
 if(!online&&result.hit){const victim=practiceCandidates.find(p=>p.id===result.hit);if(victim){const profile=projectile.profile;result.killed=applyDamage(victim,result.damage??(result.headshot?profile.headDamage:profile.damage),now);if(profile.arrow&&!result.killed)practiceBleeds.push({victim,next:now+400,left:3});}}
 if(!online&&awardBeans(local,result))saveWallet();
 if(result.hit){const index=practiceCandidates.findIndex(p=>p.id===result.hit),character=result.hit===id?deathBody:index>=0?dummies[index]:peers.get(result.hit);if(character&&result.hit!==id)canEffects.hit(character,result);if(result.hit===id&&result.killed)deathBody.userData.lastImpact=result;}
 for(const change of result.wallChanges||[])if(!online)wallView.burst(change.wallId,change.removed);
 impactEffect(result,now);
}
function sound(charge=0){try{if(weapon==='bow')audio?.arrow?.(null,charge);else audio?.play(weapon==='shotgun'?.82:1);}catch{}}
async function post(path,data={}){if(lanClient)return lanClient.command(path,data);const r=await fetch(API_BASE+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});if(!r.ok)throw Object.assign(Error(await r.text()||'Connection lost'),{status:r.status});return r.status===204?null:r.json();}
function shotEffect(s,predicted=false){
 if(!gameLoop.running)return;
 if(!online)for(const change of s.wallChanges||[])wallView.burst(change.wallId,change.removed);
 if(!predicted)remoteShot(s);
 if(s.profile?.laser){if(s.laserEnd)laserEffects.fire(s.origin,s.laserEnd);return;}
 if(s.pellets){s.pellets.forEach((pellet,i)=>shotEffect({...pellet,id:s.id,shotId:`${s.shotId}/${i}`,weapon:'shotgun',bulletSize:s.bulletSize,profile:s.profile,pellet:true},predicted));return;}

 const existing=s.id===id&&s.shotId?pendingShots.get(s.shotId):null;
 if(existing&&!predicted){existing.confirmed=true;if(!existing.physics.alive)pendingShots.delete(s.shotId);return;}
 const direction=new THREE.Vector3(s.direction.x,s.direction.y,s.direction.z).normalize(),origin=new THREE.Vector3(s.origin.x,s.origin.y,s.origin.z);
 let round=null;
 if(s.weapon==='bow'){round=createArrow();round.position.copy(origin);round.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);round.position.addScaledVector(direction,ARROW_TIP_Z);scene.add(round);}
 else if(s.weapon!=='shotgun'){round=new THREE.Mesh(roundGeometry,roundMaterial);round.scale.setScalar(s.bulletSize||1);round.position.copy(origin);round.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);scene.add(round);const glow=new THREE.Mesh(roundGeometry,glowMaterial);glow.scale.set(1.8,1.15,1.8);round.add(glow);}
 const flight={round,direction,origin,born:gameLoop.now(),result:s,confirmed:!predicted,physics:launchProjectile({origin,direction},s.profile||ammoProfile(s.weapon||'revolver'),{weapon:s.weapon||'revolver',shotId:s.shotId})};
 projectiles.push(flight);if(predicted){pendingShots.set(s.shotId,flight);if(pendingShots.size>512)pendingShots.delete(pendingShots.keys().next().value);}
}
function impactEffect(result,now){
 if(result.clayId){if(!online){const broken=skeetRange.breakClay(result.clayId,now,result.direction);if(broken)skeetView.shatter(broken,now);}return;}
 if(result.targetId&&targets.has(result.targetId))targets.get(result.targetId).hitAt=(now-started)/1000;
 if(result.surface==='voxel'){emitParticles(new THREE.Vector3(result.point.x,result.point.y,result.point.z),new THREE.Vector3(result.normal.x,result.normal.y,result.normal.z),0xb29c7e,2,true);return;}
 if(result.weapon==='shotgun')return;
 if(!result.surface)return;
 const normal=new THREE.Vector3(result.normal.x,result.normal.y,result.normal.z),point=new THREE.Vector3(result.point.x,result.point.y,result.point.z).addScaledVector(normal,.03);
 emitParticles(point,normal,result.surface==='world'?0xc5b28b:0xffd16b,9,false);
 emitParticles(point,normal,0xa99e87,2,true);
}
function applyState(s){if(s.time<=serverTime)return;const previousMap=mapId;setMapView(s.mapId||'practice');latestState=s;duelState=s.duel||null;serverTime=s.time;receivedAt=gameLoop.now();const mine=s.players.find(p=>p.id===id);if(!mine)return;
 const presentationChanged=previousMap!==mapId||mine.weapon!==weapon||mine.spawnSerial!==local.spawnSerial;
 serverClays=s.clays||[];
 for(const g of dummies)g.visible=mapId==='practice';
 for(const p of s.cans||[]){const index=practiceCandidates.findIndex(can=>can.id===p.id);if(index<0)continue;const g=dummies[index];Object.assign(practiceCandidates[index],p);g.visible=true;if(p.hp>0&&g.userData.ragdoll){resetCan(g);g.position.set(p.x,p.y,p.z);}if(p.hp<=0&&!g.userData.ragdoll)canEffects.kill(g);}
 renderer.shadowMap.needsUpdate=true;
 if(!predictionReady||(!local.hp&&mine.hp>0)||local.spawnSerial!==mine.spawnSerial){Object.assign(predicted,{x:mine.x,y:mine.y,z:mine.z,vy:0,vx:0,vz:0,correctionVX:0,correctionVZ:0});correction={x:0,z:0};smoothPosition.set(mine.x,mine.y+1.5,mine.z);predictionReady=true;displayedAim=frozenAim=null;lastShot=-Infinity;bowChargeAt=null;resetBow(bowGun);predicted.jumpHeld=false;wristSpring.angle=wristSpring.velocity=cameraSpring.angle=cameraSpring.velocity=0;freeX=freeY=handYaw=handPitch=0;yaw=lookYaw=mine.yaw;pitch=lookPitch=mine.pitch;clearArrows();for(const p of projectiles)p.round?.removeFromParent();projectiles.length=0;pendingShots.clear();}
 else correction=predictionCorrection(predicted,mine);
 if(local.hp>0&&mine.hp<=0){deathAt=gameLoop.now();resetCan(deathBody);deathBody.position.set(mine.x,mine.y,mine.z);deathBody.rotation.y=mine.yaw;if(deathBody.userData.lastImpact){if(deathBody.userData.lastImpact.stuck)lodgeArrow(deathBody.userData.lastImpact);canEffects.hit(deathBody,deathBody.userData.lastImpact);delete deathBody.userData.lastImpact;}else canEffects.kill(deathBody);bowChargeAt=null;}
 if(mine.hp>0){deathBody.visible=false;deathBody.position.set(mine.x,mine.y,mine.z);}
 local=mine;Object.assign(ammoByWeapon,mine.ammoByWeapon);showWeapon(mine.weapon||'revolver');
 setRevolverAmmo(revolverGun,mine.mods?.revolver);duelUI.update(s,id,s.time);
 const ids=new Set();for(const p of s.players){if(p.id===id)continue;ids.add(p.id);if(!peers.has(p.id)){const character=cowboy(p.color);character.position.set(p.x,p.y,p.z);peers.set(p.id,character);}const g=peers.get(p.id);if(p.hp>0&&g.userData.ragdoll)resetCan(g);if(p.hp<=0&&!g.userData.ragdoll)canEffects.kill(g);g.userData.target=p;g.visible=true;g.userData.rightHand.rotation.set(p.gunPitch??0,angleDelta(p.yaw,p.gunYaw??p.yaw),p.reloadUntil?-.4:0,'YXZ');}
 for(const [key,g] of peers)if(!ids.has(key)){scene.remove(g);canEffects.remove(g);peers.delete(key);}
 for(const g of peers.values()){const shotgun=g.userData.target.weapon==='shotgun';g.userData.rightHand.position.z=shotgun?-.38:-.55;g.userData.revolver.visible=g.userData.target.weapon==='revolver';g.userData.shotgun.visible=shotgun;g.userData.bow.visible=g.userData.target.weapon==='bow';setRevolverAmmo(g.userData.revolver,g.userData.target.mods?.revolver);}
 if(!gameLoop.running&&presentationChanged){camera.position.copy(smoothPosition);camera.rotation.set(pitch,yaw,0,'YXZ');placeWeapon(rig,{shotgun:weapon==='shotgun'});rig.visible=local.hp>0;renderScene();}
}
function joinError(message){menu?.message(message);$('play').title=message;$('play').setAttribute('aria-label','Join. '+message);console.warn(message);}
function handleNetworkEvent(event,data){
 if(event==='resetCookie'){menu?.resetCookie();if(!lanClient&&data?.id)void post('ackCookieReset',{id:data.id}).catch(()=>{});return;}
 if(joining)return;
 if(event==='state'){if(gameLoop.running||data.duel||duelState)applyState(data);else if(shopMenu.opened){const before=local.beans;applyState(data);if(local.hp<=0)shopMenu.close();else if(before!==local.beans)shopMenu.refresh();}else pendingState=data;}
 else if(event==='wallReset'){if(data.mapId)setMapView(data.mapId);clearArrows();for(const p of projectiles)p.round?.removeFromParent();projectiles.length=0;pendingShots.clear();wallWorld.reset();wallView.update(0);if(!gameLoop.running)renderScene();}
 else if(event==='wallState')data.forEach((removed,i)=>wallWorld.apply(i,removed));
 else if(event==='wallDamage'){wallWorld.apply(data.wallId,data.removed);if(gameLoop.running)wallView.burst(data.wallId,data.removed);}
 else if(event==='shot')shotEffect(data);
 else if(event==='impact'){if(!gameLoop.running)return;projectileImpact(data);for(const p of projectiles)if(p.result.id===data.shooter&&p.result.shotId===data.shotId&&data.speed){p.physics.speed=data.speed;p.physics.position={...data.point};if(data.arrow&&data.direction)p.physics.direction={...data.direction};}if(data.stopped||(!data.penetrated&&data.surface!=='voxel'))for(const p of projectiles)if(p.result.id===data.shooter&&p.result.shotId===data.shotId)p.physics.alive=false;}
 else if(event==='clayBreak'){serverClays=serverClays.filter(f=>f.id!==data.id);if(gameLoop.running)skeetView.shatter(data,gameLoop.now());}
}
function installSession(data){
 events?.close();events=null;clearInterval(inputTimer);clearInterval(idleTimer);
 pendingState=null;predictionReady=false;serverTime=0;reloading=0;lastShot=-Infinity;
 for(const g of peers.values()){scene.remove(g);canEffects.remove(g);}peers.clear();shotCandidates.length=0;
 for(const p of projectiles)if(p.round)scene.remove(p.round);projectiles.length=0;pendingShots.clear();serverClays=[];wallWorld.reset();
 token=data.token;id=data.id;currentRoom=data.room||data.hostId;playerCode=data.lobbyCode||data.joinCode||'';online=true;
 if(lanClient){
  setMapView(data.initialState?.mapId||'practice');data.wallState?.forEach((removed,i)=>wallWorld.apply(i,removed));
  pendingState=data.initialState||null;menu?.setMode('p2p');
 }else{
  menu?.setMode('online');events=new EventSource(API_BASE+'/api/events?token='+encodeURIComponent(token));
  for(const event of ['state','wallReset','wallState','wallDamage','shot','impact','clayBreak','bleed','resetCookie'])events.addEventListener(event,e=>handleNetworkEvent(event,JSON.parse(e.data)));
 }
 for(const [i,can] of createTrainingCans().entries()){Object.assign(practiceCandidates[i],can);resetCan(dummies[i]);dummies[i].position.set(can.x,can.y,can.z);dummies[i].visible=true;}
}
async function playGame(options={}){
 if(joining||!options.name)return;
 joining=true;$('play').disabled=true;clearInterval(inputTimer);clearInterval(idleTimer);
 const capture=preparePlay({stayInMenu:options.stayInMenu,captureMouse,startAudio:()=>audio??=createWeaponAudio()});
 try{
  if(!matchMedia('(pointer:fine)').matches)throw Error('This prototype needs a keyboard and mouse.');
  $('play').title='';$('play').removeAttribute('aria-label');menu?.message('');
  if(options.targetId||(!hasJoined&&menu?.mode()==='p2p')){
   if(menu?.mode()!=='p2p')throw Error('Connection unavailable.');
   const saved=structuredClone(local);
   if(lanClient){installSession(await lanClient.join(options));}
   else{
    const next=createLanClient({onEvent:handleNetworkEvent,onDisconnect:message=>networkError(Error(message))});
    try{const data=await next.start(options);lanClient=next;soloSnapshot=saved;installSession(data);}
    catch(error){next.close();throw error;}
   }
  }else if(!hasJoined){
   online=false;local.name=options.name;local.weapon=weapon;local.ammoByWeapon=ammoByWeapon;
   dummies.forEach(g=>g.visible=true);
  }
  if(pendingState){applyState(pendingState);pendingState=null;}
  hasJoined=true;menu?.sessionChanged();
 }catch(e){
  if(lanClient&&!lanClient.session())leaveLobby();
  document.exitPointerLock();joinError('Could not join: '+e.message);throw e;
 }finally{joining=false;$('play').disabled=false;syncActivity();}
 const captureError=await capture;if(captureError){joinError('Click Resume to capture the mouse.');syncActivity(false);}
}
async function captureMouse(){try{await $('game').requestPointerLock({unadjustedMovement:true});}catch(e){if(e.name!=='NotSupportedError')throw e;await $('game').requestPointerLock();}}
function closeAdminAmmo(resume=true){
 const wasOpen=!$('admin-ammo').hidden;$('admin-ammo').hidden=true;document.body.classList.remove('modifying');
 if(wasOpen&&resume)captureMouse().catch(()=>syncActivity(false));
}
$('admin-ammo-close').onclick=()=>closeAdminAmmo();
window.addEventListener('keydown',e=>{
 if(e.code==='Escape'&&!$('admin-ammo').hidden){e.preventDefault();closeAdminAmmo();return;}
 if(e.code!=='KeyB'||e.repeat||document.pointerLockElement!==$('game')||!menu?.isAdmin())return;
 e.preventDefault();document.exitPointerLock();syncActivity(false);document.body.classList.add('modifying');
 $('admin-ammo').hidden=false;$('admin-ammo-message').textContent='';$('admin-ammo-options').replaceChildren();
 for(const [mod,profile] of Object.entries(AMMO_MODS[weapon])){
  const button=document.createElement('button');button.textContent=profile.label;button.setAttribute('aria-pressed',String((local.mods?.[weapon]||'standard')===mod));
  button.onclick=async()=>{button.disabled=true;try{await menu.loadout({weapon,mod});closeAdminAmmo();}catch(error){$('admin-ammo-message').textContent=error.message;}finally{button.disabled=false;}};
  $('admin-ammo-options').append(button);
 }
});
const mouseAim={freeX:0,freeY:0,lookYaw:0,lookPitch:0};
document.addEventListener('pointerlockchange',syncActivity);
document.addEventListener('visibilitychange',()=>{if(document.hidden)document.exitPointerLock();syncActivity();});
window.addEventListener('focus',syncActivity);
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('game')||local.hp<=0||duelState&&duelState.phase!=='active')return;
 mouseAim.freeX=freeX;mouseAim.freeY=freeY;mouseAim.lookYaw=lookYaw;mouseAim.lookPitch=lookPitch;freeAimInput(mouseAim,e.movementX,e.movementY,Number(focusHeld));({freeX,freeY,lookYaw,lookPitch}=mouseAim);
});
window.addEventListener('mousedown',e=>{if(e.button===2&&document.pointerLockElement===$('game')){e.preventDefault();if(weapon==='bow'){cancelBowDraw();return;}if(weapon==='shotgun'){focusHeld=false;fire(false,gameLoop.now(),true);}else focusHeld=true;}});
function beginBowDraw(){
 if(!gameLoop.running||local.hp<=0||local.reloadUntil||reloading||bowChargeAt!==null||duelState&&duelState.phase!=='active')return;
 if(!local.ammo){reload();return;}
 bowChargeAt=gameLoop.now();if(online)post('charge',{active:true}).catch(actionError);
}
function cancelBowDraw(){if(bowChargeAt===null)return;bowChargeAt=null;if(online)post('charge',{active:false}).catch(actionError);}
window.addEventListener('mouseup',e=>{if(e.button===2)focusHeld=false;if(e.button===0){autoFire.release();if(weapon==='bow'){if(bowChargeAt!==null&&document.pointerLockElement===$('game'))fire(false);cancelBowDraw();}}});
$('game').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(['Space','Tab'].includes(e.code)&&document.pointerLockElement)e.preventDefault();keys.add(e.code);if(e.code==='KeyR'&&document.pointerLockElement)reload();});
window.addEventListener('keydown',e=>{if(e.code==='KeyF'&&!e.repeat&&document.pointerLockElement){e.preventDefault();launchClay();}});
window.addEventListener('keydown',e=>{if(!e.repeat&&['Digit1','Digit2','Digit3'].includes(e.code))equip(e.code==='Digit1'?'revolver':e.code==='Digit3'?'bow':duelState?(local.secondary||'shotgun'):'shotgun');});
window.addEventListener('keyup',e=>{keys.delete(e.code);});window.addEventListener('blur',()=>{document.exitPointerLock();syncActivity(false);});
function reload(){queuedFanClick=false;bowChargeAt=null;if(online&&weapon==='bow')post('charge',{active:false}).catch(actionError);if(local.powers?.infiniteAmmo)return;if(online){post('reload').catch(actionError);}else if(!reloading&&local.ammo<ammoProfile(weapon,local.mods).capacity)reloading=gameLoop.now()+WEAPONS[weapon].reload;}
function leaveLobby(){setMapView('practice');duelState=null;latestState=null;deathBody.visible=false;rig.visible=true;duelUI.update({duel:null},id,0);
 const previous=lanClient,oldToken=token;lanClient=null;previous?.close();events?.close();events=null;
 if(!previous&&oldToken)void fetch(API_BASE+'/api/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:oldToken}),keepalive:true}).catch(()=>{});
 clearInterval(inputTimer);clearInterval(idleTimer);pendingState=null;online=false;token=id=null;playerCode=currentRoom='';hasJoined=false;predictionReady=false;serverTime=0;reloading=0;
 for(const g of peers.values()){scene.remove(g);canEffects.remove(g);}peers.clear();
 for(const p of projectiles)if(p.round)scene.remove(p.round);projectiles.length=0;pendingShots.clear();serverClays=[];wallWorld.reset();
 for(const [i,can] of createTrainingCans().entries()){Object.assign(practiceCandidates[i],can);resetCan(dummies[i]);dummies[i].position.set(can.x,can.y,can.z);dummies[i].visible=true;}
 local=soloSnapshot||{x:0,y:0,z:8,vy:0,hp:100,ammo:6,...createWallet()};soloSnapshot=null;
 smoothPosition.set(local.x,local.y+1.5,local.z);yaw=lookYaw=local.yaw||0;pitch=lookPitch=local.pitch||0;freeX=freeY=handYaw=handPitch=0;
 showWeapon(local.weapon||'revolver');Object.assign(ammoByWeapon,local.ammoByWeapon||{revolver:6,shotgun:2});
 document.exitPointerLock();menu?.sessionChanged();syncActivity(false);renderScene();
}
function networkError(e){if(joining)return;leaveLobby();joinError(e.message+' — press Play for solo, or join a lobby again.');}
function fire(requestFan,now=gameLoop.now(),both=false){
 if(!document.pointerLockElement||local.hp<=0||local.reloadUntil||reloading||duelState&&duelState.phase!=='active')return;
 if(!local.ammo){reload();return;}
 const shotProfile=ammoProfile(weapon,local.mods);
 if(shotProfile.laser){
  if(!menu?.isAdmin()||!local.powers?.noCooldown&&now-lastShot<250)return;
  const {origin,direction}=captureAim(),shotId=String(++shotSequence),profile=shotProfile;
  lastShot=now;lastShotWeapon=weapon;queuedFanClick=false;wristSpring.angle=wristSpring.velocity=cameraSpring.angle=cameraSpring.velocity=wristTwist=0;shotExposure.energy=shotExposure.visible=barrelHeat=0;sound();
  if(!local.powers?.infiniteAmmo)local.ammo--;ammoByWeapon[weapon]=local.ammo;
  if(online)post('fire',shotPayload(origin,direction,{shotId})).catch(actionError);
  else{const beam=traceLaser({origin,direction},profile,practiceCandidates,liveClays,wallWorld,{shooter:'local',shotId,weapon});shotEffect({id:'local',weapon,profile,origin,direction,laserEnd:beam.end,shotId});for(const result of beam.impacts)projectileImpact(result,{profile});}
  return;
 }
 if(weapon==='bow'){
  if(now-lastShot<WEAPONS.bow.reload)return;
  const {origin,direction}=captureAim(),profile=chargedArrow(bowChargeAt===null?0:(now-bowChargeAt)/BOW_CHARGE_MS),shotId=String(++shotSequence);
  lastShot=now;lastShotWeapon=weapon;if(!local.powers?.infiniteAmmo)local.ammo--;ammoByWeapon.bow=local.ammo;sound(profile.charge);releaseBow(bowGun);bowMarker.visible=bowGuide.visible=false;
  if(!local.powers?.noRecoil){wristSpring.velocity+=.7+.6*profile.charge;cameraSpring.velocity+=.06+.04*profile.charge;}reloading=now+WEAPONS.bow.reload;
  shotEffect({id:online?id:'local',shotId,weapon,origin,direction,profile},online);
  if(online)post('fire',shotPayload(origin,direction,{shotId})).catch(actionError);
  bowChargeAt=null;return;
 }
 if(weapon==='shotgun'){
  if(local.ammo<1||(!local.powers?.noCooldown&&now-lastShot<SHOTGUN_INTERVAL)||Math.abs(shotgunGun.userData.barrels.rotation.x)>.025)return;
  const aim=captureAim(),{origin,direction}=aim,barrelRight=new THREE.Vector3(1,0,0).transformDirection(gun.matrixWorld),shotId=String(++shotSequence);
  const {barrel,cost}=shotgunDischarge(local.ammo,both);shotgunGun.userData.lastBarrel=barrel;
  const profile=ammoProfile(weapon,local.mods);
  const pellets=shotgunPellets(origin,direction,barrelRight,shotId,barrel,profile);
  lastShot=now;lastShotWeapon=weapon;if(!local.powers?.infiniteAmmo)local.ammo-=cost;ammoByWeapon.shotgun=local.ammo;
  if(!local.powers?.noRecoil){wristSpring.velocity=Math.min(18,wristSpring.velocity+(cost===2?13:9)*profile.recoil);wristSpring.angle=Math.min(.5,wristSpring.angle+(cost===2?.055:.035)*profile.recoil);cameraSpring.velocity=Math.min(1.2,cameraSpring.velocity+(cost===2?.55:.35));}sound();
  shotExposure.energy=Math.min(2,shotExposure.energy+(cost===2?1.3:.9));for(let i=0;i<pellets.length;i+=profile.pellets)emitParticles(pellets[i].origin,direction,0xb5aea1,8,true,{speed:5,spread:.65,life:.7,size:1.5,opacity:.16,drag:2.3});
  shotEffect({id:online?id:'local',shotId,weapon,origin,direction,pellets,profile,bulletSize:profile.size},online);
  if(online)post('fire',shotPayload(origin,direction,{shotId,both,barrelRight})).catch(actionError);
  return;
 }
 const fan=requestFan&&now-lastShot<=650;
 if(!local.powers?.noCooldown&&now-lastShot<(fan?FAN_INTERVAL+15:250))return;
 // Freeze the exact ray that was shown, before recoil changes the gun pose.
 const aim=displayedAim||captureAim(),origin=aim.origin.clone(),direction=aim.direction.clone(),profile=ammoProfile(weapon,local.mods),result=aim.result;
 frozenAim={origin:origin.clone(),direction:direction.clone(),result,until:now+90};
 lastShot=now;lastShotWeapon=weapon;cockRevolver(gun,now,fan);if(!local.powers?.noRecoil){const beforeAngle=wristSpring.angle,beforeKick=wristSpring.velocity;kickRecoil(wristSpring,fan);wristSpring.velocity=beforeKick+(wristSpring.velocity-beforeKick)*profile.recoil;wristSpring.angle=beforeAngle+(wristSpring.angle-beforeAngle)*profile.recoil;wristTwist+=(Math.random()-.35)*(fan?.135:.12);cameraSpring.velocity=Math.min(2,cameraSpring.velocity+1.1*profile.recoil);}sound();flashLife=.055;flash.visible=gapFlash.visible=true;flashOuterMaterial.opacity=.7;flashCoreMaterial.opacity=1;flash.rotation.z=Math.random()*Math.PI;flash.scale.set(profile.flash||1,profile.flash||1,(profile.flash||1)*(.85+Math.random()*.4));muzzleLight.intensity=20;barrelHeat=Math.min(1,barrelHeat+.45);
 shotExposure.energy=Math.min(1.2,shotExposure.energy+.38);
 emitParticles(origin,direction,0xffd684,4,false);emitParticles(origin,direction,0xaaa396,2,true);
 const shotId=String(++shotSequence);shotEffect({id:online?id:'local',shotId,origin,direction,weapon,profile,fan,bulletSize:profile.size},online);
 if(!local.powers?.infiniteAmmo)local.ammo--;
 if(online)post('fire',shotPayload(origin,direction,{shotId,fan})).catch(actionError);
}
window.addEventListener('mousedown',e=>{if(e.button!==0||document.pointerLockElement!==$('game')||local.hp<=0)return;
 if(weapon==='bow'){beginBowDraw();return;}
 autoFire.press();
 const now=gameLoop.now(),fan=weapon==='revolver'&&now-lastClick<=FAN_CLICK_WINDOW;lastClick=now;
 if(local.reloadUntil||reloading)return;
 if(!local.powers?.noCooldown&&fan&&now-lastShot<FAN_INTERVAL+15){queuedFanClick=true;return;}
 fire(fan,now);
});
function sendInput(active=gameLoop.running){
 if(!online||joining)return;
 if(inputInFlight){if(!active)stopInputPending=true;return;}
 inputInFlight=true;const submittedToken=token;
 post('input',{active,x:active?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:active?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,gunYaw,gunPitch,jump:active&&keys.has('Space')})
 .catch(e=>{if(token===submittedToken)networkError(e);}).finally(()=>{inputInFlight=false;if(stopInputPending){stopInputPending=false;sendInput(false);}});
}
function syncActivity(allowRun=true){
 if(!renderReady)return;
 const active=hasJoined&&!joining&&allowRun!==false&&!document.hidden&&document.hasFocus()&&document.pointerLockElement===$('game');
 if(!active){laserEffects.clear();bowMarker.visible=bowGuide.visible=false;nextBowPreview=0;autoFire.release();bowChargeAt=null;if(online&&weapon==='bow')post('charge',{active:false}).catch(actionError);}
 document.body.classList.toggle('playing',active);if(!active)shopPrompt.hidden=true;keys.clear();focusHeld=false;queuedFanClick=false;lastClick=-Infinity;
 clearInterval(inputTimer);clearInterval(idleTimer);inputTimer=idleTimer=null;
 if(active){
  if(pendingState){predictionReady=false;applyState(pendingState);pendingState=null;}
  last=lastAimFrame=gameLoop.now();gameLoop.start();audio?.resume().catch(()=>{});
  if(online){sendInput();inputTimer=setInterval(sendInput,50);}
 }else{
  gameLoop.stop();audio?.pause().catch(()=>{});displayedAim=frozenAim=null;
  if(online){
   for(const p of projectiles)if(p.round)scene.remove(p.round);projectiles.length=0;pendingShots.clear();pelletMesh.count=0;
   sendInput(false);idleTimer=setInterval(()=>sendInput(false),5000);
  }
 }
}
function frame(now){
 for(let i=practiceBleeds.length-1;i>=0;i--){const b=practiceBleeds[i];if(online||b.victim.hp<=0){practiceBleeds.splice(i,1);continue;}if(now>=b.next){const killed=applyDamage(b.victim,5,now);b.next+=400;b.left--;if(killed){const index=practiceCandidates.indexOf(b.victim);canEffects.kill(dummies[index]);awardBeans(local,{hit:b.victim.id,killed:true,wallChanges:[]});saveWallet();}if(killed||!b.left)practiceBleeds.splice(i,1);}}

 if(!online)for(let i=0;i<practiceCandidates.length;i++){const p=practiceCandidates[i];if(p.hp<=0&&now>=p.deadUntil){p.hp=100;p.deadUntil=0;resetCan(dummies[i]);dummies[i].position.set(p.x,p.y,p.z);}}
 if(hasJoined)$('hud').textContent=local.hp<=0?'Eliminated · Respawning…':`${local.name||'Player'} · ${online?'P2P':'Practice'} · HP ${local.powers?.infiniteHp?'∞':local.hp} · Ammo ${local.powers?.infiniteAmmo?'∞':local.ammo} · ${local.beans||0} beans`;
 shopPrompt.hidden=mapId!=='practice'||!canShop(online&&predictionReady?{...local,...predicted}:local,yaw,pitch)||!!reloading;
 const dt=Math.min((now-last)/1000,.05);last=now;const t=(now-started)/1000,locked=!!document.pointerLockElement;
 focusBlend+=(Number(focusHeld&&locked&&local.hp>0)-focusBlend)*(1-Math.exp(-12*dt));
 // Input gain uses the actual button state, never the animated focus blend.
 const aimPose={yaw,pitch,lookYaw,lookPitch,freeX,freeY,handYaw,handPitch,previousFreeX,previousFreeY};followAim(aimPose,(now-lastAimFrame)/1000);lastAimFrame=now;({yaw,pitch,handYaw,handPitch,previousFreeX,previousFreeY}=aimPose);
 const focusLimitX=.28+.28*focusBlend,focusLimitY=.2+.18*focusBlend;
 freeX+=(clamp(freeX,-focusLimitX,focusLimitX)-freeX)*(1-Math.exp(-12*dt));
 freeY+=(clamp(freeY,-focusLimitY,focusLimitY)-freeY)*(1-Math.exp(-12*dt));
 const wallPlayer=online&&predictionReady?predicted:local;wallOld.x=wallPlayer.x;wallOld.y=wallPlayer.y;wallOld.z=wallPlayer.z;
 if(online&&predictionReady){move(predicted,{x:locked&&local.hp>0&&(!duelState||duelState.phase==='active')?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:locked&&local.hp>0&&(!duelState||duelState.phase==='active')?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,jump:locked&&local.hp>0&&(!duelState||duelState.phase==='active')&&keys.has('Space')},dt,{mapId});settlePrediction(predicted,correction,dt);}
 if(!online)move(local,{x:locked?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:locked?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,jump:locked&&keys.has('Space')},dt);
 wallWorld.collide(wallPlayer,wallOld);
 if(reloading&&now>=reloading){reloading=0;local.ammo=ammoProfile(weapon,local.mods).capacity;ammoByWeapon[weapon]=local.ammo;}
 const moving=locked&&['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k));
 walkBlend+=(Number(moving)-walkBlend)*(1-Math.exp(-10*dt));walkPhase+=dt*9*walkBlend;const bob=Math.sin(walkPhase)*.025*walkBlend;
 gunYaw=yaw+handYaw;gunPitch=pitch+handPitch;
 const view=online&&predictionReady?predicted:local;const groundBlend=1-Math.exp(-(view.grounded?12:35)*dt),horizontalBlend=1-Math.exp(-35*dt);smoothPosition.x+=(view.x-smoothPosition.x)*horizontalBlend;smoothPosition.z+=(view.z-smoothPosition.z)*horizontalBlend;smoothPosition.y+=(view.y+1.5-smoothPosition.y)*groundBlend;camera.position.copy(smoothPosition);const aimRecovery=weapon==='revolver'&&focusHeld&&locked?focusBlend:0;const recoveryScale=ammoProfile(weapon,local.mods).recovery||1;stepRecoil(wristSpring,dt*recoveryScale,aimRecovery);stepRecoil(cameraSpring,dt*recoveryScale,aimRecovery);wristTwist*=Math.exp(-(10+14*aimRecovery)*dt);camera.rotation.set(pitch+cameraSpring.angle,yaw,0,'YXZ');
 rig.visible=local.hp>0;
 if(local.hp<=0){deathBody.visible=true;const pan=1-Math.exp(-Math.max(0,now-deathAt)/480);const away=new THREE.Vector3(Math.sin(yaw)*3.8,2,Math.cos(yaw)*3.8),eye={x:local.x,y:local.y+1.5,z:local.z},distance=away.length()*pan;away.normalize();const obstruction=traceShot(eye,away,[],[],wallWorld);camera.position.set(eye.x,eye.y,eye.z).addScaledVector(away,Math.min(distance,Math.max(0,obstruction.distance-.25)));camera.lookAt(deathBody.position.x,deathBody.position.y+.6,deathBody.position.z);}
 audio?.listener?.(camera.position,camera.getWorldDirection(directionScratch));
 if(latestState)duelUI.update(latestState,id,skeetTime());
 const charge=bowChargeAt===null?0:clamp((now-bowChargeAt)/BOW_CHARGE_MS,0,1),bowReload=reloading||local.reloadUntil?clamp(Math.max(reloading?1-(reloading-now)/WEAPONS.bow.reload:-1,online&&local.reloadUntil?1-(local.reloadUntil-skeetTime())/WEAPONS.bow.reload:-1),0,.9999):-1;if(weapon==='bow')animateBow(bowGun,charge,local.ammo>0,{dt,reload:bowReload});bowMeter.hidden=weapon!=='bow'||local.hp<=0;bowMeter.textContent=bowReload>=0?'Nocking…':bowChargeAt===null?'Hold LMB · release to shoot':Math.round(charge*100)+'% · release to shoot';
 const reloadEnd=online?local.reloadUntil:reloading;
 placeWeapon(rig,{yaw:handYaw,pitch:handPitch,bob,recoil:0,reload:!!reloadEnd,shotgun:weapon==='shotgun'});
 wrist.rotation.set(wristSpring.angle,0,wristTwist,'YXZ');
 viewHand.material.opacity=weapon==='bow'?updateBowVisibility(bowGun,camera.position,charge):1;viewHand.material.depthWrite=viewHand.material.opacity>=.999;
 animateRevolver(gun,now,dt);
 animateShotgun(shotgunGun,weapon==='shotgun'?local.ammo:ammoByWeapon.shotgun,dt,weapon==='shotgun'&&reloadEnd?1-(reloadEnd-(online?skeetTime():now))/WEAPONS.shotgun.reload:-1,ejectShells);
 shotgunGun.userData.flash.children.forEach((flame,index)=>flame.visible=shotgunGun.userData.lastBarrel===2||index===shotgunGun.userData.lastBarrel);
 const laserSelected=!!ammoProfile(weapon,local.mods).laser;
 const shotgunFlashDuration=shotgunGun.userData.lastBarrel===2?120:95,shotgunFlashPower=Math.max(0,1-(now-lastShot)/shotgunFlashDuration);
 shotgunGun.userData.flash.visible=weapon==='shotgun'&&lastShotWeapon==='shotgun'&&shotgunFlashPower>0;
 for(const material of shotgunGun.userData.flashMaterials)material.opacity=shotgunFlashPower**.55;
 flashLife=lastShotWeapon===weapon?Math.max(0,.065-(now-lastShot)/1000):0;flash.visible=gapFlash.visible=weapon==='revolver'&&!laserSelected&&flashLife>0;const flashPower=(flashLife/.065)**1.5;muzzleLight.intensity=weapon==='shotgun'&&lastShotWeapon===weapon?(shotgunGun.userData.lastBarrel===2?145:105)*shotgunFlashPower:weapon==='revolver'&&!laserSelected?32*flashPower:0;flashOuterMaterial.opacity=.9*flashPower;flashCoreMaterial.opacity=flashPower;barrelHeat*=Math.exp(-1.6*dt);
 // Shots add exposure energy; the screen glow eases up and gently recovers.
 // Keep this separate from the short, physical muzzle flash.
 if(shotExposure.energy>0||shotExposure.visible>0){
 shotExposure.energy*=Math.exp(-(weapon==='shotgun'?1.2:1.5)*dt);
 shotExposure.visible+=(shotExposure.energy-shotExposure.visible)*(1-Math.exp(-(shotExposure.energy>shotExposure.visible?12:4.5)*dt));
 if(shotExposure.energy<.0001&&shotExposure.visible<.0001)shotExposure.energy=shotExposure.visible=0;
 }
 colorShift.uniforms.exposure.value=shotExposure.visible;
 for(const target of targets.values()){const age=t-target.hitAt,tilt=age<.5?Math.sin(age*32)*.12*Math.exp(-age*8):0;if(target.group.rotation.x!==tilt){target.group.rotation.x=tilt;renderer.shadowMap.needsUpdate=true;}target.face.material.emissive.setHex(age<.16?0x664018:0x000000);}
 if(peers.size)renderer.shadowMap.needsUpdate=true;
 for(const g of peers.values()){const p=g.userData.target;if(p&&!g.userData.ragdoll){g.position.lerp(positionScratch.set(p.x,p.y,p.z),1-Math.exp(-15*dt));g.rotation.y=p.yaw;g.userData.kick=(g.userData.kick||0)*Math.exp(-12*dt);g.userData.rightHand.rotation.x=(p.gunPitch||0)+g.userData.kick;animateRevolver(g.userData.revolver,now,dt);if(p.weapon==='bow')animateBow(g.userData.bow,p.chargeAt==null?0:clamp((skeetTime()-p.chargeAt)/BOW_CHARGE_MS,0,1),p.ammo>0,{dt,reload:p.reloadUntil?clamp(1-(p.reloadUntil-skeetTime())/WEAPONS.bow.reload,0,.9999):-1});if(p.weapon==='shotgun')animateShotgun(g.userData.shotgun,p.ammo,dt,p.reloadUntil?1-(p.reloadUntil-skeetTime())/WEAPONS.shotgun.reload:-1,ejectShells);}}
 pelletMesh.count=0;
 liveClays.length=0;for(const flight of (online?serverClays:skeetRange.flights))liveClays.push(clayPose(flight,skeetTime(),{}));
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i],flight=p.physics;
  if(!online){for(const result of advanceProjectile(flight,dt,practiceCandidates,liveClays,wallWorld))projectileImpact(result,flight);}
  else advanceVisualProjectile(flight,dt);
  positionScratch.set(flight.position.x,flight.position.y,flight.position.z);
  if(p.round){p.round.position.copy(positionScratch);if(p.result.weapon==='bow'){p.round.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(flight.direction.x,flight.direction.y,flight.direction.z));p.round.position.addScaledVector(directionScratch.set(flight.direction.x,flight.direction.y,flight.direction.z),ARROW_TIP_Z);}const size=p.result.bulletSize||1,width=Math.min(3,Math.max(1,positionScratch.distanceTo(camera.position)*.12));if(p.result.weapon!=='bow')p.round.scale.set(size*width,size,size*width);}
  else if(flight.alive&&pelletMesh.count<384){pelletRotation.setFromUnitVectors(pelletUp,p.direction);const width=Math.min(6,Math.max(1,positionScratch.distanceTo(camera.position)*.24));pelletScale.set(width*(p.result.bulletSize||1),p.result.bulletSize||1,width*(p.result.bulletSize||1));pelletMatrix.compose(positionScratch,pelletRotation,pelletScale);pelletMesh.setMatrixAt(pelletMesh.count++,pelletMatrix);}
  if(!flight.alive){if(p.round)scene.remove(p.round);if(p.confirmed&&pendingShots.get(p.result.shotId)===p)pendingShots.delete(p.result.shotId);projectiles.splice(i,1);}
 }
 if(pelletMesh.count)pelletMesh.instanceMatrix.needsUpdate=true;
 for(let i=remoteFlashes.length-1;i>=0;i--){const f=remoteFlashes[i];f.life-=dt;f.material.opacity=Math.max(0,f.life/.09);if(f.life<=0){f.mesh.removeFromParent();f.mesh.children[0].geometry.dispose();f.material.dispose();remoteFlashes.splice(i,1);}}
 for(let i=stuckArrows.length-1;i>=0;i--){const a=stuckArrows[i];a.life-=dt;a.age+=dt;wobbleStuckArrow(a.mesh,a.rest,a.age);if(a.life<=0||!a.mesh.parent||a.victim&&!a.victim.parent){a.mesh.removeFromParent();stuckArrows.splice(i,1);}}
 laserEffects.update(dt);particles.update(dt);shellPhysics.update(dt);canEffects.update(dt);if(dummies.some(g=>g.userData.ragdoll))renderer.shadowMap.needsUpdate=true;
 if(!online)for(const broken of skeetRange.update(now))skeetView.shatter(broken,now);
 if(locked&&mapId==='practice')pickUpShotgun();
 pickupGun.visible=!local.hasShotgun;wallView.update(dt);
 skeetView.update(online?serverClays:skeetRange.flights,skeetTime(),dt,now);
 const previewBow=weapon==='bow'&&locked&&local.hp>0&&local.ammo>0&&!reloading&&!reloadEnd&&(!duelState||duelState.phase==='active');
 if(charge<=.1)bowGuide.visible=false;
 if(!previewBow)bowMarker.visible=bowGuide.visible=false;
 else if(now>=nextBowPreview){const ray=captureAim();placeBowMarker(bowMarker,predictArrowImpact(ray,chargedArrow(charge),online?shotCandidates:practiceCandidates,liveClays,wallWorld,bowPath));placeBowGuide(bowGuide,bowPath,charge);nextBowPreview=now+1000/30;}
 const aimOpacity=weapon==='revolver'&&locked&&local.hp>0&&!reloadEnd?focusBlend:0;
 aimBeam.visible=aimOpacity>.001;aimMaterial.opacity=.6*aimOpacity;aimMaterial.color.setHex(laserSelected?0xff3030:0xffdf9b);
 const liveAim=aimBeam.visible?captureAim():null;
 displayedAim=liveAim?(frozenAim&&now<frozenAim.until?frozenAim:liveAim):null;
 colorShift.uniforms.blast.value=!laserSelected&&weapon!=='bow'&&lastShotWeapon===weapon?(weapon==='shotgun'?(shotgunGun.userData.lastBarrel===2?2.2:1.7):1)*Math.exp(-Math.max(0,now-lastShot)/(weapon==='shotgun'?45:32)):0;
 if(colorShift.uniforms.blast.value>.001){const muzzle=liveAim?.origin??captureBarrelRay(gun).origin;muzzleLight.position.copy(muzzle);const muzzleUV=uvScratch.copy(muzzle).project(camera);colorShift.uniforms.muzzleUV.value.set(muzzleUV.x*.5+.5,muzzleUV.y*.5+.5);}
 colorShift.uniforms.heat.value=0;
 if(displayedAim){
 const beamOrigin=displayedAim.origin,beamDirection=displayedAim.direction;
 const beamEnd=beamEndScratch.copy(beamOrigin).addScaledVector(beamDirection,displayedAim.result.distance);
 const beamPositions=aimGeometry.attributes.position;beamPositions.setXYZ(0,beamOrigin.x,beamOrigin.y,beamOrigin.z);beamPositions.setXYZ(1,beamEnd.x,beamEnd.y,beamEnd.z);beamPositions.needsUpdate=true;
 const startUV=uvScratch.copy(beamOrigin).project(camera);colorShift.uniforms.aimStart.value.set(startUV.x*.5+.5,startUV.y*.5+.5);
 const endUV=uvScratch.copy(beamEnd).project(camera);colorShift.uniforms.aimEnd.value.set(endUV.x*.5+.5,endUV.y*.5+.5);
 colorShift.uniforms.heat.value=(laserSelected?0:aimOpacity)*(.25+barrelHeat*.75)*clamp(beamDirection.dot(camera.getWorldDirection(directionScratch))/.2,0,1);
 }
 colorShift.uniforms.time.value=t;
 if(weapon!=='bow'&&autoFire.ready(now,{active:locked&&gameLoop.running,unlocked:menu?.isAdmin(),powers:local.powers}))fire(false,now);
 if(queuedFanClick&&now-lastShot>=FAN_INTERVAL+15){queuedFanClick=false;fire(true,now);}
 colorShift.uniforms.strength.value=shotExposure.visible*.5;
 renderScene();
}
function renderScene(){renderer.setRenderTarget(shotBuffer);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(screenScene,screenCamera);}
// Avoid supersampling the entire arena and every effect on high-DPI displays.
// Retain 2x MSAA at up to a 1080p pixel budget; input uses CSS pixels as before.
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1,Math.sqrt(1920*1080/(innerWidth*innerHeight))));renderer.setSize(innerWidth,innerHeight);const size=renderer.getDrawingBufferSize(new THREE.Vector2());shotBuffer.setSize(size.x,size.y);colorShift.uniforms.aspect.value=camera.aspect;if(renderReady&&!gameLoop.running)renderScene();}
window.addEventListener('resize',resize);resize();camera.position.set(0,1.5,8);
// Compile both passes and the pooled particle materials before play so the
// first shot/aim does not pause movement to compile new effects.
renderer.setRenderTarget(shotBuffer);await renderer.compileAsync(scene,camera);
renderer.setRenderTarget(null);await renderer.compileAsync(screenScene,screenCamera);
renderReady=true;
const beanScare=installBeanScare(document,()=>menu?.isAdmin()===true);
menu=createMenu({changeMap:async()=>{if(lanClient)await lanClient.refreshOwnPowers();},join:playGame,leave:leaveLobby,previewScare:()=>beanScare.show(),onAdminLock:()=>{beanScare.hide();closeAdminAmmo(false);},changeLoadout:async(data,player)=>{
 if(lanClient)player=await lanClient.refreshOwnPowers();
 if(player){local=player;pendingState=null;}else{local.weapon=weapon;local.ammoByWeapon=ammoByWeapon;applyAdminLoadout(local,adminLoadout(null,data,crypto.randomUUID()));}
 Object.assign(ammoByWeapon,local.ammoByWeapon);reloading=0;return local;
},getSession:()=>({token,id,online,started:hasJoined,room:currentRoom,joinCode:playerCode,transport:lanClient?'p2p':'node',powers:local.powers}),changePowers:async(powers,player)=>{
 if(lanClient)player=await lanClient.refreshOwnPowers();
 if(player){local=player;pendingState=null;}else{local.weapon=weapon;local.ammoByWeapon=ammoByWeapon;setPowers(local,powers);Object.assign(ammoByWeapon,local.ammoByWeapon);}
 if(powers.infiniteAmmo)reloading=0;
 if(powers.noRecoil){wristSpring.angle=wristSpring.velocity=cameraSpring.angle=cameraSpring.velocity=wristTwist=0;}
}});
frame(gameLoop.now());syncActivity();
