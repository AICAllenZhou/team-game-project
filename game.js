import * as THREE from './vendor/three.module.js';
import {createWeaponAudio} from './weapon-audio.js';
import {createGameLoop} from './game-loop.js';
import {batchMeshes,createParticles} from './render-batches.js';
import {createSkeetRange,clayPose} from './skeet.mjs';
import {createSkeetView} from './skeet-view.js';
import {WEAPONS,shotgunPellets,SHOTGUN_INTERVAL,shotgunDischarge} from './weapons.mjs';
import {createShotgun,animateShotgun} from './shotgun-view.js';
import {placeWeapon,freeAimInput,followAim,stepRecoil,kickRecoil,captureBarrelRay} from './weapon-pose.js';
import {move,TRAINING_TARGETS,traceShot,PROJECTILE_SPEED,projectileProgress,predictionCorrection,settlePrediction,FAN_INTERVAL,FAN_CLICK_WINDOW} from './simulation.mjs';
const $=id=>document.getElementById(id);
const gameLoop=createGameLoop({onFrame:now=>frame(now)});
let renderReady=false,inputTimer=null,idleTimer=null,pendingState=null,stopInputPending=false;
const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:false});renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x9b9387);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x9b9387,38,100);
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
const camera=new THREE.PerspectiveCamera(100,innerWidth/innerHeight,.05,160);camera.rotation.order='YXZ';scene.add(camera);
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
 Object.assign(g.userData,{cylinderPivot,cylinderFrom:0,cylinderTarget:0,hammer,fanHand,firedAt:-1000,fanAt:-1000});return g;}
function animateRevolver(g,now,dt){const data=g.userData;
 if(data.type==='shotgun')return;
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
function cockRevolver(g,now,fan){const data=g.userData;if(data.type==='shotgun')return;data.hammer.rotation.x=0;data.cylinderFrom=data.cylinderTarget;data.cylinderTarget+=Math.PI/3;data.firedAt=now;data.fanning=fan;if(fan)data.fanAt=now;}
function cowboy(color){const g=new THREE.Group();mesh(new THREE.CapsuleGeometry(.42,.96,4,8),mat(color),g,0,.9,0);mesh(new THREE.CylinderGeometry(.67,.67,.09,10),hat,g,0,1.79,0);mesh(new THREE.CylinderGeometry(.34,.38,.3,8),hat,g,0,1.95,0);
 const right=new THREE.Group();right.position.set(.4,1.15,-.55);g.add(right);mesh(new THREE.SphereGeometry(.13,8,6),skin,right,0,-.13,.07);g.userData.revolver=revolver(right);
 g.userData.shotgun=createShotgun(right,steel,wood,skin);g.userData.shotgun.visible=false;
 batchMeshes(g);g.userData.rightHand=right;scene.add(g);return g;}
const rig=new THREE.Group();camera.add(rig);
// The revolver is held with one visible hand.
const wrist=new THREE.Group();wrist.position.set(0,-.13,.07);rig.add(wrist);
mesh(new THREE.SphereGeometry(.13,8,6),skin,wrist);const revolverGun=revolver(wrist),shotgunGun=createShotgun(wrist,steel,wood,skin,true);let gun=revolverGun,weapon='revolver';
revolverGun.position.set(0,.13,-.07);shotgunGun.position.copy(revolverGun.position);shotgunGun.visible=false;
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
batchMeshes(scenery);
scenery.updateWorldMatrix(true,true);
scenery.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});
const dummies=[cowboy(0xa57450),cowboy(0x6b9290),cowboy(0x9d7b8f)];dummies.forEach((g,i)=>g.position.set((i-1)*5,0,-9-Math.abs(i-1)*3));
let token=null,id=null,events=null,online=false,joining=false,local={x:0,y:0,z:8,vy:0,hp:100,ammo:6},yaw=0,pitch=0,freeX=0,freeY=0,gunYaw=0,gunPitch=0,lastShot=-Infinity,reloading=0,last=0,lastAimFrame=0,started=0,serverTime=0,receivedAt=0;
const keys=new Set(),peers=new Map(),projectiles=[];let audio;
const pendingShots=new Map();let shotSequence=0,barrelHeat=0;
let displayedAim=null,frozenAim=null,lastClick=-Infinity,queuedFanClick=false;
const particles=createParticles(scene),emitParticles=particles.emit;
const skeetRange=createSkeetRange(),skeetView=createSkeetView(scene);let serverClays=[];
const clayCandidates=Array.from({length:3},()=>({})),liveClays=[];
function skeetTime(){return online?serverTime+gameLoop.now()-receivedAt:gameLoop.now();}
function launchClay(){if(!gameLoop.running||local.hp<=0)return;if(online)post('launch').catch(networkError);else skeetRange.launch(gameLoop.now());}
const roundGeometry=new THREE.CapsuleGeometry(.045,.4,3,8),roundMaterial=new THREE.MeshBasicMaterial({color:0xffedb0});
const glowMaterial=new THREE.MeshBasicMaterial({color:0xffb744,transparent:true,opacity:.22,depthWrite:false});
const pelletMesh=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.009,.13,2,5),new THREE.MeshBasicMaterial({color:0xffd79a}),384),pelletMatrix=new THREE.Matrix4(),pelletRotation=new THREE.Quaternion(),pelletUp=new THREE.Vector3(0,1,0),pelletScale=new THREE.Vector3(1,1,1);pelletMesh.count=0;pelletMesh.frustumCulled=false;pelletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(pelletMesh);
const ammoByWeapon={revolver:6,shotgun:2};let lastShotWeapon='revolver';
function showWeapon(next){if(next===weapon)return;weapon=next;focusHeld=false;gun=weapon==='shotgun'?shotgunGun:revolverGun;revolverGun.visible=weapon==='revolver';shotgunGun.visible=weapon==='shotgun';displayedAim=frozenAim=null;queuedFanClick=false;shotExposure.energy=shotExposure.visible=barrelHeat=0;wristSpring.angle=wristSpring.velocity=0;}
function equip(next){if(!gameLoop.running||local.reloadUntil||reloading||next===weapon)return;if(online)post('equip',{weapon:next}).catch(networkError);else{ammoByWeapon[weapon]=local.ammo;showWeapon(next);local.ammo=ammoByWeapon[next];}}
let focusHeld=false,focusBlend=0;
let lookYaw=0,lookPitch=0,handYaw=0,handPitch=0,previousFreeX=0,previousFreeY=0;
const wristSpring={angle:0,velocity:0};let wristTwist=0,flashLife=0;
const cameraSpring={angle:0,velocity:0};
const predicted={x:0,y:0,z:8,vy:0,yaw:0,pitch:0};let predictionReady=false,correction={x:0,z:0};
const smoothPosition=new THREE.Vector3(0,1.5,8);let walkBlend=0,walkPhase=0,inputInFlight=false;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const positionScratch=new THREE.Vector3(),uvScratch=new THREE.Vector3(),beamEndScratch=new THREE.Vector3(),directionScratch=new THREE.Vector3();
const practiceCandidates=dummies.map((g,i)=>({id:`dummy-${i}`,x:g.position.x,y:g.position.y,z:g.position.z,hp:100})),shotCandidates=[];
function captureAim(){const {origin,direction}=captureBarrelRay(gun);
 const candidates=online?shotCandidates:practiceCandidates;
 if(online){shotCandidates.length=0;for(const g of peers.values())if(g.userData.target)shotCandidates.push(g.userData.target);}
 liveClays.length=0;const flights=online?serverClays:skeetRange.flights,now=skeetTime();
 for(let i=0;i<flights.length;i++)liveClays.push(clayPose(flights[i],now,clayCandidates[i]));
 return {origin,direction,result:traceShot(origin,direction,candidates,liveClays)};
}
function sound(){try{audio?.play(weapon==='shotgun'?.82:1);}catch{}}
async function post(path,data={}){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});if(!r.ok)throw Error(await r.text()||'Connection lost');return r.status===204?null:r.json();}
function shotEffect(s,predicted=false){
 if(!gameLoop.running)return;
 if(s.pellets){s.pellets.forEach((pellet,i)=>shotEffect({...pellet,id:s.id,shotId:`${s.shotId}/${i}`,weapon:'shotgun'},predicted));return;}
 if(s.weapon!=='shotgun'&&s.id!==id&&peers.has(s.id))cockRevolver(peers.get(s.id).userData.revolver,gameLoop.now(),s.fan);
 const existing=s.id===id&&s.shotId?pendingShots.get(s.shotId):null;
 if(existing&&!predicted){existing.result=s;existing.distance=s.distance;existing.confirmed=true;return;}
 const direction=new THREE.Vector3(s.direction.x,s.direction.y,s.direction.z).normalize(),origin=new THREE.Vector3(s.origin.x,s.origin.y,s.origin.z);
 let round=null;
 if(s.weapon!=='shotgun'){round=new THREE.Mesh(roundGeometry,roundMaterial);round.position.copy(origin);round.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);scene.add(round);const glow=new THREE.Mesh(roundGeometry,glowMaterial);glow.scale.set(1.8,1.15,1.8);round.add(glow);}
 const flight={round,direction,origin,distance:s.distance,born:gameLoop.now(),result:s,confirmed:!predicted};
 projectiles.push(flight);if(predicted)pendingShots.set(s.shotId,flight);
}
function impactEffect(result,now){
 if(result.clayId){if(!online){const broken=skeetRange.breakClay(result.clayId,now,result.direction);if(broken)skeetView.shatter(broken,now);}return;}
 if(result.targetId&&targets.has(result.targetId))targets.get(result.targetId).hitAt=(now-started)/1000;
 if(result.weapon==='shotgun')return;
 if(!result.surface)return;
 const normal=new THREE.Vector3(result.normal.x,result.normal.y,result.normal.z),point=new THREE.Vector3(result.point.x,result.point.y,result.point.z).addScaledVector(normal,.03);
 emitParticles(point,normal,result.surface==='world'?0xc5b28b:0xffd16b,9,false);
 emitParticles(point,normal,0xa99e87,2,true);
}
function applyState(s){if(s.time<=serverTime)return;serverTime=s.time;receivedAt=gameLoop.now();const mine=s.players.find(p=>p.id===id);if(!mine)return;
 serverClays=s.clays||[];
 renderer.shadowMap.needsUpdate=true;
 if(!predictionReady||(!local.hp&&mine.hp>0)){Object.assign(predicted,{x:mine.x,y:mine.y,z:mine.z,vy:0,vx:0,vz:0,correctionVX:0,correctionVZ:0});correction={x:0,z:0};smoothPosition.set(mine.x,mine.y+1.5,mine.z);predictionReady=true;}
 else correction=predictionCorrection(predicted,mine);
 local=mine;showWeapon(mine.weapon||'revolver');
 const ids=new Set();for(const p of s.players){if(p.id===id)continue;ids.add(p.id);if(!peers.has(p.id))peers.set(p.id,cowboy(p.color));const g=peers.get(p.id);g.userData.target=p;g.visible=p.hp>0;g.userData.rightHand.rotation.set(p.gunPitch??0,angleDelta(p.yaw,p.gunYaw??p.yaw),p.reloadUntil?-.4:0,'YXZ');}
 for(const [key,g] of peers)if(!ids.has(key)){scene.remove(g);peers.delete(key);}
 for(const g of peers.values()){const shotgun=g.userData.target.weapon==='shotgun';g.userData.revolver.visible=!shotgun;g.userData.shotgun.visible=shotgun;}
}
function joinError(message){$('play').title=message;$('play').setAttribute('aria-label','Join. '+message);console.warn(message);}
$('play').onclick=async()=>{
 if(joining)return;
 joining=true;$('play').disabled=true;
 try{audio??=createWeaponAudio();await Promise.all([audio.resume(),audio.ready]);}
 catch{joinError('Gunshot audio could not load. Refresh and try again.');audio=null;return;}
 finally{joining=false;$('play').disabled=false;}
 if(!matchMedia('(pointer:fine)').matches){joinError('This prototype needs a keyboard and mouse.');return;}
 $('play').title='';$('play').removeAttribute('aria-label');
 if(!token){joining=true;$('play').disabled=true;try{
 const r=await fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Drifter',room:'frontier'})});
 if(r.status===404||r.status===405){online=false;}
 else {if(!r.ok)throw Error(await r.text());const data=await r.json();token=data.token;id=data.id;online=true;events=new EventSource('/api/events?token='+encodeURIComponent(token));events.addEventListener('state',e=>{const state=JSON.parse(e.data);if(gameLoop.running)applyState(state);else pendingState=state;});events.addEventListener('shot',e=>shotEffect(JSON.parse(e.data)));events.addEventListener('clayBreak',e=>{const broken=JSON.parse(e.data);serverClays=serverClays.filter(f=>f.id!==broken.id);if(gameLoop.running)skeetView.shatter(broken,gameLoop.now());});dummies.forEach(g=>g.visible=false);}
 }catch(e){joinError('Could not join: '+e.message);joining=false;$('play').disabled=false;return;}joining=false;$('play').disabled=false;}
 try{try{await $('game').requestPointerLock({unadjustedMovement:true});}catch(e){if(e.name!=='NotSupportedError')throw e;await $('game').requestPointerLock();}}catch{joinError('Click Join again to capture the mouse.');syncActivity(false);}
};
document.addEventListener('pointerlockchange',syncActivity);
document.addEventListener('visibilitychange',()=>{if(document.hidden)document.exitPointerLock();syncActivity();});
window.addEventListener('focus',syncActivity);
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('game'))return;
 const aim={freeX,freeY,lookYaw,lookPitch};freeAimInput(aim,e.movementX,e.movementY,Number(focusHeld));({freeX,freeY,lookYaw,lookPitch}=aim);
});
window.addEventListener('mousedown',e=>{if(e.button===2&&document.pointerLockElement===$('game')){e.preventDefault();if(weapon==='shotgun'){focusHeld=false;fire(false,gameLoop.now(),true);}else focusHeld=true;}});
window.addEventListener('mouseup',e=>{if(e.button===2)focusHeld=false;});
$('game').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(['Space','Tab'].includes(e.code)&&document.pointerLockElement)e.preventDefault();keys.add(e.code);if(e.code==='KeyR'&&document.pointerLockElement)reload();});
window.addEventListener('keydown',e=>{if(e.code==='KeyF'&&!e.repeat){e.preventDefault();launchClay();}});
window.addEventListener('keydown',e=>{if(!e.repeat&&['Digit1','Digit2'].includes(e.code))equip(e.code==='Digit2'?'shotgun':'revolver');});
window.addEventListener('keyup',e=>{keys.delete(e.code);});window.addEventListener('blur',()=>{document.exitPointerLock();syncActivity(false);});
function reload(){queuedFanClick=false;if(online){post('reload').catch(networkError);}else if(!reloading&&local.ammo<WEAPONS[weapon].capacity)reloading=gameLoop.now()+WEAPONS[weapon].reload;}
function networkError(e){joinError(e.message+' — reload the page to rejoin.');online=false;token=null;events?.close();pendingState=null;document.exitPointerLock();syncActivity(false);}
function fire(requestFan,now=gameLoop.now(),both=false){
 if(!document.pointerLockElement||local.hp<=0||local.reloadUntil||reloading)return;
 if(!local.ammo){reload();return;}
 if(weapon==='shotgun'){
  if(local.ammo<1||now-lastShot<SHOTGUN_INTERVAL||Math.abs(shotgunGun.userData.barrels.rotation.x)>.025)return;
  const aim=captureAim(),{origin,direction}=aim,barrelRight=new THREE.Vector3(1,0,0).transformDirection(gun.matrixWorld),shotId=String(++shotSequence);
  const {barrel,cost}=shotgunDischarge(local.ammo,both);shotgunGun.userData.lastBarrel=barrel;
  const pellets=shotgunPellets(origin,direction,barrelRight,shotId,barrel).map(ray=>({...ray,...traceShot(ray.origin,ray.direction,online?shotCandidates:practiceCandidates,liveClays)}));
  lastShot=now;lastShotWeapon=weapon;local.ammo-=cost;ammoByWeapon.shotgun=local.ammo;
  wristSpring.velocity=Math.min(29,wristSpring.velocity+(cost===2?21:17));wristSpring.angle=Math.min(1.1,wristSpring.angle+.13);cameraSpring.velocity=Math.min(2,cameraSpring.velocity+1.3);sound();
  shotExposure.energy=Math.min(1.2,shotExposure.energy+.5);emitParticles(origin,direction,0xaaa396,2,true);
  shotEffect({id:online?id:'local',shotId,weapon,origin,direction,pellets},online);
  if(online)post('fire',{shotId,both,muzzle:origin,direction,barrelRight,gunYaw:Math.atan2(-direction.x,-direction.z),gunPitch:Math.asin(clamp(direction.y,-1,1))}).catch(networkError);
  return;
 }
 const fan=requestFan&&now-lastShot<=650;
 if(now-lastShot<(fan?FAN_INTERVAL+15:250))return;
 // Freeze the exact ray that was shown, before recoil changes the gun pose.
 const aim=displayedAim||captureAim(),origin=aim.origin.clone(),direction=aim.direction.clone(),result=aim.result;
 frozenAim={origin:origin.clone(),direction:direction.clone(),result,until:now+90};
 lastShot=now;lastShotWeapon=weapon;cockRevolver(gun,now,fan);kickRecoil(wristSpring,fan);wristTwist+=(Math.random()-.35)*(fan?.135:.12);cameraSpring.velocity=Math.min(2,cameraSpring.velocity+1.1);sound();flashLife=.055;flash.visible=gapFlash.visible=true;flashOuterMaterial.opacity=.7;flashCoreMaterial.opacity=1;flash.rotation.z=Math.random()*Math.PI;flash.scale.set(1,1,.85+Math.random()*.4);muzzleLight.intensity=20;barrelHeat=Math.min(1,barrelHeat+.45);
 shotExposure.energy=Math.min(1.2,shotExposure.energy+.38);
 emitParticles(origin,direction,0xffd684,4,false);emitParticles(origin,direction,0xaaa396,2,true);
 const shotId=String(++shotSequence);shotEffect({id:online?id:'local',shotId,origin,direction,...result,fan},online);
 local.ammo--;
 if(online)post('fire',{shotId,fan,muzzle:origin,direction,gunYaw:Math.atan2(-direction.x,-direction.z),gunPitch:Math.asin(clamp(direction.y,-1,1))}).catch(networkError);
}
window.addEventListener('mousedown',e=>{if(e.button!==0||document.pointerLockElement!==$('game')||local.hp<=0)return;
 const now=gameLoop.now(),fan=weapon==='revolver'&&now-lastClick<=FAN_CLICK_WINDOW;lastClick=now;
 if(local.reloadUntil||reloading)return;
 if(fan&&now-lastShot<FAN_INTERVAL+15){queuedFanClick=true;return;}
 fire(fan,now);
});
function sendInput(active=gameLoop.running){
 if(!online)return;
 if(inputInFlight){if(!active)stopInputPending=true;return;}
 inputInFlight=true;
 post('input',{x:active?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:active?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,gunYaw,gunPitch,jump:active&&keys.has('Space')})
 .catch(networkError).finally(()=>{inputInFlight=false;if(stopInputPending){stopInputPending=false;sendInput(false);}});
}
function syncActivity(allowRun=true){
 if(!renderReady)return;
 const active=allowRun!==false&&!document.hidden&&document.hasFocus()&&document.pointerLockElement===$('game');
 document.body.classList.toggle('playing',active);keys.clear();focusHeld=false;queuedFanClick=false;lastClick=-Infinity;
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
function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;const t=(now-started)/1000,locked=!!document.pointerLockElement;
 focusBlend+=(Number(focusHeld&&locked&&local.hp>0)-focusBlend)*(1-Math.exp(-12*dt));
 // Input gain uses the actual button state, never the animated focus blend.
 const aimPose={yaw,pitch,lookYaw,lookPitch,freeX,freeY,handYaw,handPitch,previousFreeX,previousFreeY};followAim(aimPose,(now-lastAimFrame)/1000);lastAimFrame=now;({yaw,pitch,handYaw,handPitch,previousFreeX,previousFreeY}=aimPose);
 const focusLimitX=.28+.28*focusBlend,focusLimitY=.2+.18*focusBlend;
 freeX+=(clamp(freeX,-focusLimitX,focusLimitX)-freeX)*(1-Math.exp(-12*dt));
 freeY+=(clamp(freeY,-focusLimitY,focusLimitY)-freeY)*(1-Math.exp(-12*dt));
 if(online&&predictionReady){move(predicted,{x:locked&&local.hp>0?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:locked&&local.hp>0?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,jump:locked&&local.hp>0&&keys.has('Space')},dt);settlePrediction(predicted,correction,dt);}
 if(!online)move(local,{x:locked?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:locked?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,jump:locked&&keys.has('Space')},dt);
 if(reloading&&now>=reloading){reloading=0;local.ammo=WEAPONS[weapon].capacity;ammoByWeapon[weapon]=local.ammo;}
 const moving=locked&&['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k)),lean=locked?(Number(keys.has('KeyE'))-Number(keys.has('KeyQ'))):0;
 walkBlend+=(Number(moving)-walkBlend)*(1-Math.exp(-10*dt));walkPhase+=dt*9*walkBlend;const bob=Math.sin(walkPhase)*.025*walkBlend;
 gunYaw=yaw+handYaw;gunPitch=pitch+handPitch;
 const view=online&&predictionReady?predicted:local;smoothPosition.lerp(positionScratch.set(view.x,view.y+1.5,view.z),1-Math.exp(-35*dt));camera.position.copy(smoothPosition);stepRecoil(wristSpring,dt);stepRecoil(cameraSpring,dt);wristTwist*=Math.exp(-10*dt);camera.rotation.set(pitch+cameraSpring.angle,yaw,0,'YXZ');
 const reloadEnd=online?local.reloadUntil:reloading;
 placeWeapon(rig,{yaw:handYaw,pitch:handPitch,bob,lean,recoil:0,reload:!!reloadEnd});
 wrist.rotation.set(wristSpring.angle,0,wristTwist,'YXZ');
 animateRevolver(gun,now,dt);
 animateShotgun(shotgunGun,weapon==='shotgun'?local.ammo:ammoByWeapon.shotgun,dt);
 shotgunGun.userData.barrels.rotation.x+=((reloadEnd?-.55:0)-shotgunGun.userData.barrels.rotation.x)*(1-Math.exp(-12*dt));
 shotgunGun.userData.flash.children.forEach((flame,index)=>flame.visible=shotgunGun.userData.lastBarrel===2||index===shotgunGun.userData.lastBarrel);
 shotgunGun.userData.flash.visible=weapon==='shotgun'&&lastShotWeapon==='shotgun'&&now-lastShot<35;
 flashLife=lastShotWeapon===weapon?Math.max(0,.065-(now-lastShot)/1000):0;flash.visible=gapFlash.visible=weapon==='revolver'&&flashLife>0;const flashPower=(flashLife/.065)**1.5;muzzleLight.intensity=(weapon==='shotgun'?42:32)*flashPower;flashOuterMaterial.opacity=.9*flashPower;flashCoreMaterial.opacity=flashPower;barrelHeat*=Math.exp(-1.6*dt);
 // Shots add exposure energy; the screen glow eases up and gently recovers.
 // Keep this separate from the short, physical muzzle flash.
 if(shotExposure.energy>0||shotExposure.visible>0){
 shotExposure.energy*=Math.exp(-1.5*dt);
 shotExposure.visible+=(shotExposure.energy-shotExposure.visible)*(1-Math.exp(-(shotExposure.energy>shotExposure.visible?12:4.5)*dt));
 if(shotExposure.energy<.0001&&shotExposure.visible<.0001)shotExposure.energy=shotExposure.visible=0;
 }
 colorShift.uniforms.exposure.value=shotExposure.visible;
 for(const target of targets.values()){const age=t-target.hitAt,tilt=age<.5?Math.sin(age*32)*.12*Math.exp(-age*8):0;if(target.group.rotation.x!==tilt){target.group.rotation.x=tilt;renderer.shadowMap.needsUpdate=true;}target.face.material.emissive.setHex(age<.16?0x664018:0x000000);}
 if(peers.size)renderer.shadowMap.needsUpdate=true;
 for(const g of peers.values()){const p=g.userData.target;if(p){g.position.lerp(positionScratch.set(p.x,p.y,p.z),1-Math.exp(-15*dt));g.rotation.y=p.yaw;animateRevolver(g.userData.revolver,now,dt);if(p.weapon==='shotgun')animateShotgun(g.userData.shotgun,p.ammo,dt);}}
 pelletMesh.count=0;
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i],age=(now-p.born)/1000,progress=p.round?projectileProgress(p.distance,age):Math.min(1,age/Math.max(.025,p.distance/360));
  positionScratch.copy(p.origin).addScaledVector(p.direction,p.distance*progress);
  if(p.round){p.round.position.copy(positionScratch);p.round.visible=progress<1;}
  else if(progress<1&&pelletMesh.count<384){pelletRotation.setFromUnitVectors(pelletUp,p.direction);pelletMatrix.compose(positionScratch,pelletRotation,pelletScale);pelletMesh.setMatrixAt(pelletMesh.count++,pelletMatrix);}
  if(progress===1&&(p.confirmed||age>2)){if(p.confirmed)impactEffect(p.result,now);if(p.round)scene.remove(p.round);if(pendingShots.get(p.result.shotId)===p)pendingShots.delete(p.result.shotId);projectiles.splice(i,1);}
 }
 if(pelletMesh.count)pelletMesh.instanceMatrix.needsUpdate=true;
 particles.update(dt);
 if(!online)for(const broken of skeetRange.update(now))skeetView.shatter(broken,now);
 skeetView.update(online?serverClays:skeetRange.flights,skeetTime(),dt,now);
 const aimOpacity=weapon==='revolver'&&locked&&local.hp>0&&!reloadEnd?focusBlend:0;
 aimBeam.visible=aimOpacity>.001;aimMaterial.opacity=.6*aimOpacity;
 const liveAim=aimBeam.visible?captureAim():null;
 displayedAim=liveAim?(frozenAim&&now<frozenAim.until?frozenAim:liveAim):null;
 colorShift.uniforms.blast.value=lastShotWeapon===weapon?Math.exp(-Math.max(0,now-lastShot)/32):0;
 if(colorShift.uniforms.blast.value>.001){const muzzle=liveAim?.origin??captureBarrelRay(gun).origin;muzzleLight.position.copy(muzzle);const muzzleUV=uvScratch.copy(muzzle).project(camera);colorShift.uniforms.muzzleUV.value.set(muzzleUV.x*.5+.5,muzzleUV.y*.5+.5);}
 colorShift.uniforms.heat.value=0;
 if(displayedAim){
 const beamOrigin=displayedAim.origin,beamDirection=displayedAim.direction;
 const beamEnd=beamEndScratch.copy(beamOrigin).addScaledVector(beamDirection,displayedAim.result.distance);
 const beamPositions=aimGeometry.attributes.position;beamPositions.setXYZ(0,beamOrigin.x,beamOrigin.y,beamOrigin.z);beamPositions.setXYZ(1,beamEnd.x,beamEnd.y,beamEnd.z);beamPositions.needsUpdate=true;
 const startUV=uvScratch.copy(beamOrigin).project(camera);colorShift.uniforms.aimStart.value.set(startUV.x*.5+.5,startUV.y*.5+.5);
 const endUV=uvScratch.copy(beamEnd).project(camera);colorShift.uniforms.aimEnd.value.set(endUV.x*.5+.5,endUV.y*.5+.5);
 colorShift.uniforms.heat.value=aimOpacity*(.25+barrelHeat*.75)*clamp(beamDirection.dot(camera.getWorldDirection(directionScratch))/.2,0,1);
 }
 colorShift.uniforms.time.value=t;
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
renderReady=true;frame(gameLoop.now());syncActivity();
