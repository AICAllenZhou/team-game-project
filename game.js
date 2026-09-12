import * as THREE from './vendor/three.module.js';
import {placeWeapon,freeAimInput,followAim,stepRecoil,kickRecoil,captureBarrelRay} from './weapon-pose.js';
import {move,TRAINING_TARGETS,traceShot,PROJECTILE_SPEED,projectileProgress,predictionCorrection,settlePrediction,FAN_INTERVAL,FAN_CLICK_WINDOW} from './simulation.mjs';
const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x9b9387);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x9b9387,38,100);
// Keep one rendering path active so firing/aiming cannot switch render targets
// and shader variants midway through mouse movement.
const shotBuffer=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,samples:2});
const colorShift=new THREE.ShaderMaterial({
 uniforms:{frame:{value:shotBuffer.texture},strength:{value:0},blast:{value:0},muzzleUV:{value:new THREE.Vector2(.5,.3)},heat:{value:0},time:{value:0},aspect:{value:1},aimStart:{value:new THREE.Vector2(.5,.3)},aimEnd:{value:new THREE.Vector2(.5,.6)}},depthTest:false,depthWrite:false,
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
 fragmentShader:`uniform sampler2D frame; uniform float strength,blast,heat,time,aspect; uniform vec2 aimStart,aimEnd,muzzleUV; varying vec2 vUv;
 vec3 bright(vec2 uv){vec3 c=texture2D(frame,clamp(uv,vec2(0.001),vec2(0.999))).rgb;return c*smoothstep(0.65,1.0,max(c.r,max(c.g,c.b)));}
 void main(){vec2 radial=vUv-0.5;float edge=smoothstep(0.2,0.65,length(radial));
 vec2 ratio=vec2(aspect,1.0),a=aimStart*ratio,b=aimEnd*ratio,p=vUv*ratio,ab=b-a;
 float along=clamp(dot(p-a,ab)/max(dot(ab,ab),0.00001),0.0,1.0);
 float beamDistance=length(p-a-ab*along);
 float haze=exp(-beamDistance*beamDistance/0.00045)*heat*smoothstep(0.0015,0.004,beamDistance);
 vec2 wave=vec2(sin(vUv.y*110.0-time*7.0),cos(vUv.x*95.0+time*5.0))*haze*0.0025;
 vec2 uv=clamp(vUv+wave,vec2(0.001),vec2(0.999));
 vec2 shift=radial*edge*strength*0.009;
 vec3 color=vec3(texture2D(frame,clamp(uv+shift,vec2(0.001),vec2(0.999))).r,
 texture2D(frame,uv).g,texture2D(frame,clamp(uv-shift,vec2(0.001),vec2(0.999))).b);
 // Constant-cost bright-pass blur plus a soft lens halo around the muzzle.
 // The pass stays compiled and active even between shots.
 vec2 texel=vec2(0.008/aspect,0.008);
 vec3 bloom=bright(uv+texel*vec2(1.,0.))+bright(uv+texel*vec2(-1.,0.))
 +bright(uv+texel*vec2(0.,1.))+bright(uv+texel*vec2(0.,-1.))
 +bright(uv+texel*vec2(1.,1.))+bright(uv+texel*vec2(-1.,1.))
 +bright(uv+texel*vec2(1.,-1.))+bright(uv+texel*vec2(-1.,-1.));
 vec2 muzzleDelta=(vUv-muzzleUV)*ratio;float radius2=dot(muzzleDelta,muzzleDelta);
 float halo=exp(-radius2/0.003)*0.9+exp(-radius2/0.024)*0.18;
 color+=blast*(bloom*0.16*exp(-radius2/0.05)+vec3(1.0,0.64,0.29)*halo);
 gl_FragColor=vec4(color,1.0);
 #include <colorspace_fragment>
 }`
});
const screenScene=new THREE.Scene(),screenCamera=new THREE.Camera();screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),colorShift));
const camera=new THREE.PerspectiveCamera(100,innerWidth/innerHeight,.05,160);camera.rotation.order='YXZ';scene.add(camera);
scene.add(new THREE.HemisphereLight(0xc9d0dc,0x705237,1.9));const sun=new THREE.DirectionalLight(0xffd09a,2.6);sun.position.set(-20,18,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,far:90});sun.shadow.bias=-.001;scene.add(sun);
const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true});
const sand=mat(0xa8895c),edge=mat(0x796345),skin=mat(0xd7b18a),steel=mat(0x484b4a),wood=mat(0x633f2a),hat=mat(0x493d2b);
function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,m,p,x,y,z){return mesh(new THREE.BoxGeometry(w,h,d),m,p,x,y,z);}
box(56,.5,56,sand,scene,0,-.26,0);const grid=new THREE.GridHelper(56,28,0x8f784f,0xad915f);grid.position.y=.002;grid.material.transparent=true;grid.material.opacity=.24;scene.add(grid);
for(const side of [-1,1]){box(56,.16,.18,edge,scene,0,.08,side*27.8);box(.18,.16,56,edge,scene,side*27.8,.08,0);for(let i=-24;i<=24;i+=8){box(.22,1.2,.22,wood,scene,i,.6,side*28);box(.22,1.2,.22,wood,scene,side*28,.6,i);}}
// Distant scenery stays outside the playable base plate.
for(let i=0;i<20;i++){const a=i*2.399,r=65+(i%3)*12;const rock=mesh(new THREE.ConeGeometry(10+i%7,7+i%5,4),mat(i%2?0x9a8a73:0xa69379),scene,Math.sin(a)*r,1,Math.cos(a)*r);rock.rotation.y=a;}
function revolver(parent){const g=new THREE.Group();parent.add(g);box(.12,.14,.32,steel,g,0,0,-.05);box(.085,.09,.34,steel,g,0,.025,-.35);
 const cylinderPivot=new THREE.Group();cylinderPivot.position.set(0,.005,-.04);g.add(cylinderPivot);
 const cylinder=mesh(new THREE.CylinderGeometry(.095,.095,.17,12),steel,cylinderPivot);cylinder.rotation.x=Math.PI/2;
 const dark=mat(0x242725);for(let i=0;i<6;i++){const a=i*Math.PI/3;const chamber=mesh(new THREE.CylinderGeometry(.018,.018,.012,8),dark,cylinderPivot,Math.cos(a)*.064,Math.sin(a)*.064,-.09);chamber.rotation.x=Math.PI/2;}
 const grip=box(.1,.23,.12,wood,g,0,-.16,.08);grip.rotation.x=-.25;box(.025,.04,.025,steel,g,0,.09,-.49);
 const hammer=new THREE.Group();hammer.position.set(0,.09,.075);g.add(hammer);box(.035,.06,.05,steel,hammer,0,.025,.015);
 const fanHand=new THREE.Group();g.add(fanHand);mesh(new THREE.SphereGeometry(.115,8,6),skin,fanHand);fanHand.visible=false;
 Object.assign(g.userData,{cylinderPivot,cylinderTarget:0,hammer,fanHand,firedAt:-1000,fanAt:-1000});return g;}
function animateRevolver(g,now,dt){const data=g.userData;data.cylinderPivot.rotation.z+=(data.cylinderTarget-data.cylinderPivot.rotation.z)*(1-Math.exp(-32*dt));
 const age=(now-data.firedAt)/1000;data.hammer.rotation.x=age<.1?-.6*Math.sin(age/.1*Math.PI):0;
 const fanAge=(now-data.fanAt)/1000;data.fanHand.visible=fanAge<.34;
 if(data.fanHand.visible){const stroke=Math.sin(Math.min(1,fanAge/.13)*Math.PI),exit=Math.max(0,(fanAge-.15)/.19);data.fanHand.position.set(-.33+stroke*.35-exit*.2,.12+stroke*.04-exit*.2,.15);}
}
function cockRevolver(g,now,fan){g.userData.cylinderTarget+=Math.PI/3;g.userData.firedAt=now;if(fan)g.userData.fanAt=now;}
function cowboy(color){const g=new THREE.Group();mesh(new THREE.CapsuleGeometry(.42,.96,4,8),mat(color),g,0,.9,0);mesh(new THREE.CylinderGeometry(.67,.67,.09,10),hat,g,0,1.79,0);mesh(new THREE.CylinderGeometry(.34,.38,.3,8),hat,g,0,1.95,0);box(.74,.1,.08,wood,g,0,.76,-.32);
 const right=new THREE.Group();right.position.set(.4,1.15,-.55);g.add(right);mesh(new THREE.SphereGeometry(.13,8,6),skin,right,0,-.13,.07);g.userData.revolver=revolver(right);
 g.userData.rightHand=right;scene.add(g);return g;}
const rig=new THREE.Group();camera.add(rig);
// The revolver is held with one visible hand.
const wrist=new THREE.Group();wrist.position.set(0,-.13,.07);rig.add(wrist);
mesh(new THREE.SphereGeometry(.13,8,6),skin,wrist);const gun=revolver(wrist);gun.position.set(0,.13,-.07);
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
const muzzleLight=new THREE.PointLight(0xffb95d,0,7,2);gun.add(muzzleLight);muzzleLight.position.set(0,.025,-.52);
const aimGeometry=new THREE.BufferGeometry();aimGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
const aimMaterial=new THREE.LineBasicMaterial({color:0xffdf9b,transparent:true,opacity:0,depthWrite:false});
const aimBeam=new THREE.Line(aimGeometry,aimMaterial);aimBeam.frustumCulled=false;scene.add(aimBeam);
const shotVignette=document.createElement('div');shotVignette.className='shot-vignette';document.body.append(shotVignette);
const targets=new Map();
for(const target of TRAINING_TARGETS){
 const g=new THREE.Group();scene.add(g);g.position.set(target.x,target.y,target.z);
 const face=mesh(new THREE.SphereGeometry(target.radius,20,12),mat(0xd8d1af),g);
 for(const side of [-1,1]){
  const ring=mesh(new THREE.TorusGeometry(.29,.05,6,24),mat(0xb43b28),g,0,0,side*.465);
  mesh(new THREE.SphereGeometry(.12,12,8),mat(0xb43b28),g,0,0,side*.54);
 }
 box(.1,1.05,.1,steel,scene,target.x,.525,target.z);box(.8,.08,.6,wood,scene,target.x,.04,target.z);
 targets.set(target.id,{group:g,face,hitAt:-100});
}
const dummies=[cowboy(0xa57450),cowboy(0x6b9290),cowboy(0x9d7b8f)];dummies.forEach((g,i)=>g.position.set((i-1)*5,0,-9-Math.abs(i-1)*3));
let token=null,id=null,events=null,online=false,joining=false,local={x:0,y:0,z:8,vy:0,hp:100,ammo:6},yaw=0,pitch=0,freeX=0,freeY=0,gunYaw=0,gunPitch=0,lastShot=0,reloading=0,last=performance.now(),started=last,serverTime=0,receivedAt=0;
const keys=new Set(),peers=new Map(),projectiles=[];let audio;
const pendingShots=new Map();let shotSequence=0,barrelHeat=0;
let displayedAim=null,frozenAim=null,lastClick=-Infinity,queuedFanClick=false;
const particlePool=[];
const sparkGeometry=new THREE.IcosahedronGeometry(.024,0),smokeGeometry=new THREE.SphereGeometry(.1,6,4);
for(let i=0;i<80;i++){const smoke=i<32,material=new THREE.MeshBasicMaterial({color:smoke?0xb7ae9e:0xffc267,transparent:true,opacity:0,depthWrite:false});const mesh=new THREE.Mesh(smoke?smokeGeometry:sparkGeometry,material);mesh.visible=false;scene.add(mesh);particlePool.push({mesh,smoke,life:0,total:1,velocity:new THREE.Vector3()});}
const roundGeometry=new THREE.CapsuleGeometry(.045,.4,3,8),roundMaterial=new THREE.MeshBasicMaterial({color:0xffedb0});
const glowMaterial=new THREE.MeshBasicMaterial({color:0xffb744,transparent:true,opacity:.22,depthWrite:false});
let focusHeld=false,focusBlend=0;
let lookYaw=0,lookPitch=0,handYaw=0,handPitch=0,previousFreeX=0,previousFreeY=0;
const wristSpring={angle:0,velocity:0};let wristTwist=0,flashLife=0;
const cameraSpring={angle:0,velocity:0};
const predicted={x:0,y:0,z:8,vy:0,yaw:0,pitch:0};let predictionReady=false,correction={x:0,z:0};
const smoothPosition=new THREE.Vector3(0,1.5,8);let walkBlend=0,walkPhase=0,inputInFlight=false;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
function captureAim(){const {origin,direction}=captureBarrelRay(gun);
 const candidates=online?[...peers.values()].map(g=>g.userData.target).filter(Boolean):dummies.map((g,i)=>({id:`dummy-${i}`,x:g.position.x,y:g.position.y,z:g.position.z,hp:100}));
 return {origin,direction,result:traceShot(origin,direction,candidates)};
}
function sound(){try{audio??=new AudioContext();audio.resume();const n=audio.createBufferSource(),b=audio.createBuffer(1,audio.sampleRate*.14,audio.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length)**2.1;n.buffer=b;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1150;const gain=audio.createGain();gain.gain.value=.23;n.connect(filter).connect(gain).connect(audio.destination);n.start();}catch{}}
async function post(path,data={}){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});if(!r.ok)throw Error(await r.text()||'Connection lost');return r.status===204?null:r.json();}
function shotEffect(s,predicted=false){
 if(s.id!==id&&peers.has(s.id))cockRevolver(peers.get(s.id).userData.revolver,performance.now(),s.fan);
 const existing=s.id===id&&s.shotId?pendingShots.get(s.shotId):null;
 if(existing&&!predicted){existing.result=s;existing.confirmed=true;return;}
 const direction=new THREE.Vector3(s.direction.x,s.direction.y,s.direction.z).normalize(),origin=new THREE.Vector3(s.origin.x,s.origin.y,s.origin.z);
 const round=new THREE.Mesh(roundGeometry,roundMaterial);round.position.copy(origin);round.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);scene.add(round);
 const glow=new THREE.Mesh(roundGeometry,glowMaterial);glow.scale.set(1.8,1.15,1.8);round.add(glow);
 const flight={round,direction,origin,distance:s.distance,duration:Math.max(.05,s.distance/PROJECTILE_SPEED),born:performance.now(),result:s,confirmed:!predicted};
 projectiles.push(flight);if(predicted)pendingShots.set(s.shotId,flight);
}
function impactEffect(result,now){
 if(result.targetId&&targets.has(result.targetId))targets.get(result.targetId).hitAt=(now-started)/1000;
 if(!result.surface)return;
 const normal=new THREE.Vector3(result.normal.x,result.normal.y,result.normal.z),point=new THREE.Vector3(result.point.x,result.point.y,result.point.z).addScaledVector(normal,.03);
 emitParticles(point,normal,result.surface==='world'?0xc5b28b:0xffd16b,9,false);
 emitParticles(point,normal,0xa99e87,2,true);
}
function emitParticles(origin,direction,color,count,smoke){
 for(const p of particlePool){if(count<=0)break;if(p.life>0||p.smoke!==smoke)continue;count--;
 p.life=p.total=smoke?.32+Math.random()*.2:.18+Math.random()*.2;p.mesh.visible=true;p.mesh.position.copy(origin);p.mesh.material.color.setHex(color);
 p.velocity.copy(direction).multiplyScalar(smoke?.4:2+Math.random()*3).add(new THREE.Vector3((Math.random()-.5)*1.5,Math.random()*.8,(Math.random()-.5)*1.5));
 p.mesh.scale.setScalar(smoke?.6:1);
 }
}
function applyState(s){if(s.time<=serverTime)return;serverTime=s.time;receivedAt=performance.now();const mine=s.players.find(p=>p.id===id);if(!mine)return;
 if(!predictionReady||(!local.hp&&mine.hp>0)){Object.assign(predicted,{x:mine.x,y:mine.y,z:mine.z,vy:0,vx:0,vz:0,correctionVX:0,correctionVZ:0});correction={x:0,z:0};smoothPosition.set(mine.x,mine.y+1.5,mine.z);predictionReady=true;}
 else correction=predictionCorrection(predicted,mine);
 local=mine;$('health').textContent=mine.hp;$('ammo').textContent=mine.ammo;$('connection').textContent=`${s.players.length} / 12 • ${$('room').value.toUpperCase()}`;
 const ids=new Set();for(const p of s.players){if(p.id===id)continue;ids.add(p.id);if(!peers.has(p.id))peers.set(p.id,cowboy(p.color));const g=peers.get(p.id);g.userData.target=p;g.visible=p.hp>0;g.userData.rightHand.rotation.set(p.gunPitch??0,angleDelta(p.yaw,p.gunYaw??p.yaw),p.reloadUntil?-.4:0,'YXZ');}
 for(const [key,g] of peers)if(!ids.has(key)){scene.remove(g);peers.delete(key);}
 $('score').textContent='CALLSIGN          K / D\n'+s.players.sort((a,b)=>b.kills-a.kills).map(p=>`${p.name.padEnd(17)} ${p.kills} / ${p.deaths}`).join('\n');
}
$('play').onclick=async()=>{
 if(joining)return;
 if(!matchMedia('(pointer:fine)').matches){$('error').textContent='This prototype needs a keyboard and mouse.';return;}
 $('error').textContent='';
 if(!token){joining=true;$('play').disabled=true;try{
 const r=await fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('name').value,room:$('room').value})});
 if(r.status===404||r.status===405){online=false;$('connection').textContent='LOCAL PRACTICE';}
 else {if(!r.ok)throw Error(await r.text());const data=await r.json();token=data.token;id=data.id;$('room').value=data.room;online=true;events=new EventSource('/api/events?token='+encodeURIComponent(token));events.addEventListener('state',e=>applyState(JSON.parse(e.data)));events.addEventListener('shot',e=>shotEffect(JSON.parse(e.data)));events.onerror=()=>{$('connection').textContent='RECONNECTING';};dummies.forEach(g=>g.visible=false);}
 }catch(e){$('error').textContent='Could not join: '+e.message;joining=false;$('play').disabled=false;return;}joining=false;$('play').disabled=false;}
 try{try{await $('game').requestPointerLock({unadjustedMovement:true});}catch(e){if(e.name!=='NotSupportedError')throw e;await $('game').requestPointerLock();}}catch{$('error').textContent='Click Enter again to capture the mouse.';}
};
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===$('game');document.body.classList.toggle('playing',locked);keys.clear();focusHeld=false;queuedFanClick=false;if(locked)$('play').innerHTML='RESUME <span>↗</span>';});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('game'))return;
 const aim={freeX,freeY,lookYaw,lookPitch};freeAimInput(aim,e.movementX,e.movementY,Number(focusHeld));({freeX,freeY,lookYaw,lookPitch}=aim);
});
window.addEventListener('mousedown',e=>{if(e.button===2&&document.pointerLockElement===$('game')){e.preventDefault();focusHeld=true;}});
window.addEventListener('mouseup',e=>{if(e.button===2)focusHeld=false;});
$('game').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(['Space','Tab'].includes(e.code)&&document.pointerLockElement)e.preventDefault();keys.add(e.code);if(e.code==='Tab')$('score').style.display='block';if(e.code==='KeyR'&&document.pointerLockElement)reload();});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab')$('score').style.display='none';});window.addEventListener('blur',()=>{keys.clear();focusHeld=false;queuedFanClick=false;$('score').style.display='none';});
function reload(){queuedFanClick=false;if(online){post('reload').catch(networkError);}else if(!reloading&&local.ammo<6)reloading=performance.now()+1800;}
function networkError(e){$('connection').textContent='DISCONNECTED';$('error').textContent=e.message+' — reload the page to rejoin.';document.exitPointerLock();online=false;token=null;events?.close();}
function fire(requestFan,now=performance.now()){
 if(!document.pointerLockElement||local.hp<=0||local.reloadUntil||reloading)return;
 if(!local.ammo){reload();return;}
 const fan=requestFan&&now-lastShot<=650;
 if(now-lastShot<(fan?FAN_INTERVAL+15:250))return;
 // Freeze the exact ray that was shown, before recoil changes the gun pose.
 const aim=displayedAim||captureAim(),origin=aim.origin.clone(),direction=aim.direction.clone(),result=aim.result;
 frozenAim={origin:origin.clone(),direction:direction.clone(),result,until:now+90};
 lastShot=now;cockRevolver(gun,now,fan);kickRecoil(wristSpring,fan);wristTwist+=(Math.random()-.35)*(fan?.135:.12);cameraSpring.velocity=Math.min(2,cameraSpring.velocity+1.1);sound();flashLife=.055;flash.visible=gapFlash.visible=true;flashOuterMaterial.opacity=.7;flashCoreMaterial.opacity=1;flash.rotation.z=Math.random()*Math.PI;flash.scale.set(1,1,.85+Math.random()*.4);muzzleLight.intensity=20;barrelHeat=Math.min(1,barrelHeat+.45);
 emitParticles(origin,direction,0xffd684,4,false);emitParticles(origin,direction,0xaaa396,2,true);
 const shotId=String(++shotSequence);shotEffect({id:online?id:'local',shotId,origin,direction,...result,fan},online);
 local.ammo--;$('ammo').textContent=local.ammo;
 if(online)post('fire',{shotId,fan,muzzle:origin,direction,gunYaw:Math.atan2(-direction.x,-direction.z),gunPitch:Math.asin(clamp(direction.y,-1,1))}).catch(networkError);
}
window.addEventListener('mousedown',e=>{if(e.button!==0||document.pointerLockElement!==$('game')||local.hp<=0)return;
 const now=performance.now(),fan=now-lastClick<=FAN_CLICK_WINDOW;lastClick=now;
 if(local.reloadUntil||reloading)return;
 if(fan&&now-lastShot<FAN_INTERVAL+15){queuedFanClick=true;return;}
 fire(fan,now);
});
setInterval(()=>{if(!online||inputInFlight)return;inputInFlight=true;const active=!!document.pointerLockElement;post('input',{x:active?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:active?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,gunYaw,gunPitch,jump:active&&keys.has('Space')}).catch(networkError).finally(()=>{inputInFlight=false;});},50);
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;const t=(now-started)/1000,locked=!!document.pointerLockElement;
 focusBlend+=(Number(focusHeld&&locked&&local.hp>0)-focusBlend)*(1-Math.exp(-12*dt));
 // Input gain uses the actual button state, never the animated focus blend.
 const aimPose={yaw,pitch,lookYaw,lookPitch,freeX,freeY,handYaw,handPitch,previousFreeX,previousFreeY};followAim(aimPose,(now-lastAimFrame)/1000);lastAimFrame=now;({yaw,pitch,handYaw,handPitch,previousFreeX,previousFreeY}=aimPose);
 const focusLimitX=.28+.28*focusBlend,focusLimitY=.2+.18*focusBlend;
 freeX+=(clamp(freeX,-focusLimitX,focusLimitX)-freeX)*(1-Math.exp(-12*dt));
 freeY+=(clamp(freeY,-focusLimitY,focusLimitY)-freeY)*(1-Math.exp(-12*dt));
 if(online&&predictionReady){move(predicted,{x:locked&&local.hp>0?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:locked&&local.hp>0?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,jump:locked&&local.hp>0&&keys.has('Space')},dt);settlePrediction(predicted,correction,dt);}
 if(!online)move(local,{x:locked?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:locked?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,jump:locked&&keys.has('Space')},dt);
 if(reloading&&now>=reloading){reloading=0;local.ammo=6;$('ammo').textContent=6;}
 const moving=locked&&['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k)),lean=locked?(Number(keys.has('KeyE'))-Number(keys.has('KeyQ'))):0;
 walkBlend+=(Number(moving)-walkBlend)*(1-Math.exp(-10*dt));walkPhase+=dt*9*walkBlend;const bob=Math.sin(walkPhase)*.025*walkBlend;
 gunYaw=yaw+handYaw;gunPitch=pitch+handPitch;
 const view=online&&predictionReady?predicted:local;smoothPosition.lerp(new THREE.Vector3(view.x,view.y+1.5,view.z),1-Math.exp(-35*dt));camera.position.copy(smoothPosition);stepRecoil(wristSpring,dt);stepRecoil(cameraSpring,dt);wristTwist*=Math.exp(-10*dt);camera.rotation.set(pitch+cameraSpring.angle,yaw,0,'YXZ');
 const reloadEnd=online?local.reloadUntil:reloading,clock=online?serverTime+now-receivedAt:now;
 placeWeapon(rig,{yaw:handYaw,pitch:handPitch,bob,lean,recoil:0,reload:!!reloadEnd});
 wrist.rotation.set(wristSpring.angle,0,wristTwist,'YXZ');
 animateRevolver(gun,now,dt);
 flashLife=Math.max(0,.065-(now-lastShot)/1000);flash.visible=gapFlash.visible=flashLife>0;const flashPower=(flashLife/.065)**1.5;muzzleLight.intensity=32*flashPower;flashOuterMaterial.opacity=.9*flashPower;flashCoreMaterial.opacity=flashPower;barrelHeat*=Math.exp(-1.6*dt);
 shotVignette.style.opacity=String(Math.max(flashPower*.6,Math.max(0,wristSpring.angle)*.14));
 for(const target of targets.values()){const age=t-target.hitAt;target.group.rotation.x=age<.5?Math.sin(age*32)*.12*Math.exp(-age*8):0;target.face.material.emissive.setHex(age<.16?0x664018:0x000000);}
 $('reload').textContent=reloadEnd?'RELOADING':'R · RELOAD';
 $('notice').textContent=local.hp<=0?`BACK IN ${Math.max(1,Math.ceil((local.deadUntil-clock)/1000))}`:'';
 for(const g of peers.values()){const p=g.userData.target;if(p){g.position.lerp(new THREE.Vector3(p.x,p.y,p.z),1-Math.exp(-15*dt));g.rotation.y=p.yaw;animateRevolver(g.userData.revolver,now,dt);}}
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i],age=(now-p.born)/1000,progress=projectileProgress(p.distance,age);
  p.round.position.copy(p.origin).addScaledVector(p.direction,p.distance*progress);p.round.visible=progress<1;
  if(progress===1&&(p.confirmed||age>2)){if(p.confirmed)impactEffect(p.result,now);scene.remove(p.round);if(pendingShots.get(p.result.shotId)===p)pendingShots.delete(p.result.shotId);projectiles.splice(i,1);}
 }
 for(const p of particlePool){if(p.life<=0)continue;p.life=Math.max(0,p.life-dt);p.mesh.visible=p.life>0;p.velocity.y+=(p.smoke?.4:-8)*dt;p.mesh.position.addScaledVector(p.velocity,dt);
 const progress=1-p.life/p.total;p.mesh.material.opacity=(1-progress)*(p.smoke?.045:1);p.mesh.scale.setScalar(p.smoke?.35+progress*1.3:1-progress*.6);
 }
 const liveAim=captureAim();displayedAim=frozenAim&&now<frozenAim.until?frozenAim:liveAim;
 const muzzleUV=liveAim.origin.clone().project(camera);colorShift.uniforms.muzzleUV.value.set(muzzleUV.x*.5+.5,muzzleUV.y*.5+.5);
 colorShift.uniforms.blast.value=lastShot>0?Math.exp(-Math.max(0,now-lastShot)/32):0;
 const beamOrigin=displayedAim.origin,beamDirection=displayedAim.direction;
 const beamEnd=beamOrigin.clone().addScaledVector(beamDirection,displayedAim.result.distance);
 const beamPositions=aimGeometry.attributes.position;beamPositions.setXYZ(0,beamOrigin.x,beamOrigin.y,beamOrigin.z);beamPositions.setXYZ(1,beamEnd.x,beamEnd.y,beamEnd.z);beamPositions.needsUpdate=true;
 const aimOpacity=locked&&local.hp>0&&!reloadEnd?focusBlend:0;aimMaterial.opacity=.6*aimOpacity;
 const startUV=beamOrigin.clone().project(camera),endUV=beamEnd.clone().project(camera);
 colorShift.uniforms.aimStart.value.set(startUV.x*.5+.5,startUV.y*.5+.5);colorShift.uniforms.aimEnd.value.set(endUV.x*.5+.5,endUV.y*.5+.5);
 colorShift.uniforms.heat.value=aimOpacity*(.25+barrelHeat*.75)*clamp(beamDirection.dot(camera.getWorldDirection(new THREE.Vector3()))/.2,0,1);colorShift.uniforms.time.value=t;
 if(queuedFanClick&&now-lastShot>=FAN_INTERVAL+15){queuedFanClick=false;fire(true,now);}
 $('time').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
 colorShift.uniforms.strength.value=Math.max(0,1-(now-lastShot)/160);
 renderer.setRenderTarget(shotBuffer);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(screenScene,screenCamera);
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const size=renderer.getDrawingBufferSize(new THREE.Vector2());shotBuffer.setSize(size.x,size.y);colorShift.uniforms.aspect.value=camera.aspect;}
window.addEventListener('resize',resize);resize();camera.position.set(0,1.5,8);
// Compile both passes and the pooled particle materials before play so the
// first shot/aim does not pause movement to compile new effects.
renderer.setRenderTarget(shotBuffer);await renderer.compileAsync(scene,camera);
renderer.setRenderTarget(null);await renderer.compileAsync(screenScene,screenCamera);
last=performance.now();let lastAimFrame=last;requestAnimationFrame(frame);
