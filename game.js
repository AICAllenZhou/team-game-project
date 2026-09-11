import * as THREE from './vendor/three.module.js';
import {placeWeapon,freeAimInput,followAim,stepRecoil,kickRecoil,hitMarkerLayout} from './weapon-pose.js';
import {move,TRAINING_TARGETS,traceShot,PROJECTILE_SPEED,projectileProgress,predictionCorrection,settlePrediction} from './simulation.mjs';
const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0xb7c8c7);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xb7c8c7,38,100);
// A short edge-only RGB split on shots; the center stays clear for aiming.
const shotBuffer=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});
const colorShift=new THREE.ShaderMaterial({
 uniforms:{frame:{value:shotBuffer.texture},strength:{value:0}},depthTest:false,depthWrite:false,
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
 fragmentShader:`uniform sampler2D frame; uniform float strength; varying vec2 vUv;
 void main(){vec2 radial=vUv-0.5;float edge=smoothstep(0.2,0.65,length(radial));
 vec2 shift=radial*edge*strength*0.009;
 vec3 color=vec3(texture2D(frame,clamp(vUv+shift,vec2(0.001),vec2(0.999))).r,
 texture2D(frame,vUv).g,texture2D(frame,clamp(vUv-shift,vec2(0.001),vec2(0.999))).b);
 gl_FragColor=vec4(color,1.0);
 #include <colorspace_fragment>
 }`
});
const screenScene=new THREE.Scene(),screenCamera=new THREE.Camera();screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),colorShift));
const camera=new THREE.PerspectiveCamera(100,innerWidth/innerHeight,.05,160);camera.rotation.order='YXZ';scene.add(camera);
scene.add(new THREE.HemisphereLight(0xe7f2ff,0x987143,2.7));const sun=new THREE.DirectionalLight(0xffe1ac,3.2);sun.position.set(-15,30,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,far:90});sun.shadow.bias=-.001;scene.add(sun);
const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true});
const sand=mat(0xbfa16e),edge=mat(0x796345),skin=mat(0xd7b18a),steel=mat(0x484b4a),wood=mat(0x633f2a),hat=mat(0x493d2b);
function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,m,p,x,y,z){return mesh(new THREE.BoxGeometry(w,h,d),m,p,x,y,z);}
box(56,.5,56,sand,scene,0,-.26,0);const grid=new THREE.GridHelper(56,28,0x8f784f,0xad915f);grid.position.y=.002;grid.material.transparent=true;grid.material.opacity=.24;scene.add(grid);
for(const side of [-1,1]){box(56,.16,.18,edge,scene,0,.08,side*27.8);box(.18,.16,56,edge,scene,side*27.8,.08,0);for(let i=-24;i<=24;i+=8){box(.22,1.2,.22,wood,scene,i,.6,side*28);box(.22,1.2,.22,wood,scene,side*28,.6,i);}}
// Distant scenery stays outside the playable base plate.
for(let i=0;i<20;i++){const a=i*2.399,r=65+(i%3)*12;const rock=mesh(new THREE.ConeGeometry(10+i%7,7+i%5,4),mat(i%2?0x9a8a73:0xa69379),scene,Math.sin(a)*r,1,Math.cos(a)*r);rock.rotation.y=a;}
function revolver(parent){const g=new THREE.Group();parent.add(g);box(.12,.14,.32,steel,g,0,0,-.05);box(.085,.09,.34,steel,g,0,.025,-.35);const cylinder=mesh(new THREE.CylinderGeometry(.095,.095,.17,8),steel,g,0,.005,-.04);cylinder.rotation.x=Math.PI/2;const grip=box(.1,.23,.12,wood,g,0,-.16,.08);grip.rotation.x=-.25;box(.025,.04,.025,steel,g,0,.09,-.49);box(.025,.05,.045,steel,g,0,.09,.075);return g;}
function cowboy(color){const g=new THREE.Group();mesh(new THREE.CapsuleGeometry(.42,.96,4,8),mat(color),g,0,.9,0);mesh(new THREE.CylinderGeometry(.67,.67,.09,10),hat,g,0,1.79,0);mesh(new THREE.CylinderGeometry(.34,.38,.3,8),hat,g,0,1.95,0);box(.74,.1,.08,wood,g,0,.76,-.32);
 const right=new THREE.Group();right.position.set(.4,1.15,-.55);g.add(right);mesh(new THREE.SphereGeometry(.13,8,6),skin,right,0,-.13,.07);revolver(right);
 g.userData.rightHand=right;scene.add(g);return g;}
const rig=new THREE.Group();camera.add(rig);
// The revolver is held with one visible hand.
const wrist=new THREE.Group();wrist.position.set(0,-.13,.07);rig.add(wrist);
mesh(new THREE.SphereGeometry(.13,8,6),skin,wrist);const gun=revolver(wrist);gun.position.set(0,.13,-.07);
placeWeapon(rig,{});
const flash=new THREE.Group();gun.add(flash);flash.position.set(0,.025,-.52);flash.visible=false;
const flame=mesh(new THREE.ConeGeometry(.18,.65,7),new THREE.MeshBasicMaterial({color:0xffad39}),flash,0,0,-.24);flame.rotation.x=-Math.PI/2;
const flashCore=mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xfff4ce}),flash,0,0,-.08);flashCore.scale.set(1,1,2.7);
const muzzleLight=new THREE.PointLight(0xffb95d,0,6,2);flash.add(muzzleLight);
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
let token=null,id=null,events=null,online=false,joining=false,local={x:0,y:0,z:8,hp:100,ammo:6},yaw=0,pitch=0,freeX=0,freeY=0,gunYaw=0,gunPitch=0,recoil=0,kick=0,lastShot=0,reloading=0,vy=0,last=performance.now(),started=last,serverTime=0,receivedAt=0;
const keys=new Set(),peers=new Map(),projectiles=[];let audio;
const pendingShots=new Map(),impacts=[];let shotSequence=0;
const roundGeometry=new THREE.CapsuleGeometry(.045,.4,3,8),roundMaterial=new THREE.MeshBasicMaterial({color:0xffedb0});
const glowMaterial=new THREE.MeshBasicMaterial({color:0xffb744,transparent:true,opacity:.22,depthWrite:false});
let focusHeld=false,focusBlend=0;
let mouseX=0,mouseY=0,lookYaw=0,lookPitch=0,handYaw=0,handPitch=0;
const wristSpring={angle:0,velocity:0};let wristTwist=0,flashLife=0;
const cameraSpring={angle:0,velocity:0};
const predicted={x:0,y:0,z:8,vy:0,yaw:0,pitch:0};let predictionReady=false,correction={x:0,z:0};
const smoothPosition=new THREE.Vector3(0,1.5,8);let walkBlend=0,walkPhase=0,inputInFlight=false;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const gunDirection=()=>{gun.updateWorldMatrix(true,false);return new THREE.Vector3(0,0,-1).transformDirection(gun.matrixWorld);};
function muzzlePosition(){return gun.localToWorld(new THREE.Vector3(0,.025,-.52));}
function sound(){try{audio??=new AudioContext();audio.resume();const n=audio.createBufferSource(),b=audio.createBuffer(1,audio.sampleRate*.14,audio.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length)**2.1;n.buffer=b;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1150;const gain=audio.createGain();gain.gain.value=.23;n.connect(filter).connect(gain).connect(audio.destination);n.start();}catch{}}
async function post(path,data={}){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});if(!r.ok)throw Error(await r.text()||'Connection lost');return r.status===204?null:r.json();}
function shotEffect(s,predicted=false){
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
 if(!result.surface||(result.id!==id&&result.id!=='local'))return;
 camera.updateMatrixWorld(true);
 const point=new THREE.Vector3(result.point.x,result.point.y,result.point.z),projected=point.clone().project(camera);
 const ahead=point.sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()))>0;
 const x=ahead?clamp(projected.x,-1,1):0,y=ahead?clamp(projected.y,-1,1):0;
 const marker=document.createElement('div');marker.className='hud-impact';marker.textContent='×';marker.setAttribute('aria-hidden','true');
 marker.style.setProperty('--impact-color',result.hit?'#ff7958':result.targetId?'#ffd65e':'#ffffff');
 document.body.append(marker);impacts.push({marker,born:now,x,y});
}
function applyState(s){if(s.time<=serverTime)return;serverTime=s.time;receivedAt=performance.now();const mine=s.players.find(p=>p.id===id);if(!mine)return;
 if(!predictionReady||(!local.hp&&mine.hp>0)){Object.assign(predicted,{x:mine.x,y:mine.y,z:mine.z,vy:0});correction={x:0,z:0};smoothPosition.set(mine.x,mine.y+1.5,mine.z);predictionReady=true;}
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
 try{await $('game').requestPointerLock();}catch{$('error').textContent='Click Enter again to capture the mouse.';}
};
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===$('game');document.body.classList.toggle('playing',locked);keys.clear();focusHeld=false;mouseX=mouseY=0;if(locked)$('play').innerHTML='RESUME <span>↗</span>';});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('game'))return;focusHeld=!!(e.buttons&2);mouseX+=e.movementX;mouseY+=e.movementY;});
window.addEventListener('mousedown',e=>{if(e.button===2&&document.pointerLockElement===$('game')){e.preventDefault();focusHeld=true;}});
window.addEventListener('mouseup',e=>{if(e.button===2)focusHeld=false;});
$('game').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(['Space','Tab'].includes(e.code)&&document.pointerLockElement)e.preventDefault();keys.add(e.code);if(e.code==='Tab')$('score').style.display='block';if(e.code==='KeyR'&&document.pointerLockElement)reload();});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab')$('score').style.display='none';});window.addEventListener('blur',()=>{keys.clear();focusHeld=false;mouseX=mouseY=0;$('score').style.display='none';});
function reload(){if(online){post('reload').catch(networkError);}else if(!reloading&&local.ammo<6)reloading=performance.now()+1800;}
function networkError(e){$('connection').textContent='DISCONNECTED';$('error').textContent=e.message+' — reload the page to rejoin.';document.exitPointerLock();online=false;token=null;events?.close();}
window.addEventListener('mousedown',e=>{if(e.button!==0||!document.pointerLockElement||local.hp<=0)return;const now=performance.now();if(now-lastShot<240||local.reloadUntil||reloading)return;if(!local.ammo){reload();return;}
 const direction=gunDirection(),origin=muzzlePosition();
 lastShot=now;kickRecoil(wristSpring);wristTwist+=(Math.random()-.35)*.09;cameraSpring.velocity=Math.min(2,cameraSpring.velocity+1.1);sound();flashLife=.075;flash.visible=true;flash.rotation.z=Math.random()*Math.PI;flash.scale.setScalar(.85+Math.random()*.4);muzzleLight.intensity=12;
 const candidates=online?[...peers.values()].map(g=>g.userData.target).filter(Boolean):dummies.map((g,i)=>({id:`dummy-${i}`,x:g.position.x,y:g.position.y,z:g.position.z,hp:100}));
 const result=traceShot(origin,direction,candidates),shotId=String(++shotSequence);
 shotEffect({id:online?id:'local',shotId,origin,direction,...result},online);
 if(online)post('fire',{shotId,gunYaw:Math.atan2(-direction.x,-direction.z),gunPitch:Math.asin(clamp(direction.y,-1,1)),muzzleOffset:origin.clone().sub(camera.position)}).catch(networkError);
 else{local.ammo--;$('ammo').textContent=local.ammo;}});
setInterval(()=>{if(!online||inputInFlight)return;inputInFlight=true;const active=!!document.pointerLockElement;post('input',{x:active?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:active?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,gunYaw,gunPitch,jump:active&&keys.has('Space')}).catch(networkError).finally(()=>{inputInFlight=false;});},50);
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;const t=(now-started)/1000,locked=!!document.pointerLockElement;
 focusBlend+=(Number(focusHeld&&locked&&local.hp>0)-focusBlend)*(1-Math.exp(-12*dt));
 // Mouse events accumulate; apply them once per frame, then smooth head rotation.
 if(mouseX||mouseY){const aim={freeX,freeY,lookYaw,lookPitch};freeAimInput(aim,mouseX,mouseY,focusBlend);({freeX,freeY,lookYaw,lookPitch}=aim);mouseX=mouseY=0;}
 const aimPose={yaw,pitch,lookYaw,lookPitch,freeX,freeY,handYaw,handPitch};followAim(aimPose,dt);({yaw,pitch,handYaw,handPitch}=aimPose);
 const focusLimitX=.28+.28*focusBlend,focusLimitY=.2+.18*focusBlend;
 freeX+=(clamp(freeX,-focusLimitX,focusLimitX)-freeX)*(1-Math.exp(-12*dt));
 freeY+=(clamp(freeY,-focusLimitY,focusLimitY)-freeY)*(1-Math.exp(-12*dt));
 if(online&&predictionReady){move(predicted,{x:locked&&local.hp>0?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:locked&&local.hp>0?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,jump:locked&&local.hp>0&&keys.has('Space')},dt);settlePrediction(predicted,correction,dt);}
 if(!online&&locked){let x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyS'))-Number(keys.has('KeyW')),len=Math.max(1,Math.hypot(x,z));local.x=THREE.MathUtils.clamp(local.x+(x*Math.cos(yaw)+z*Math.sin(yaw))/len*4.5*dt,-27,27);local.z=THREE.MathUtils.clamp(local.z+(-x*Math.sin(yaw)+z*Math.cos(yaw))/len*4.5*dt,-27,27);if(keys.has('Space')&&local.y===0)vy=5;vy-=15*dt;local.y=Math.max(0,local.y+vy*dt);if(!local.y)vy=0;}
 if(reloading&&now>=reloading){reloading=0;local.ammo=6;$('ammo').textContent=6;}
 const moving=locked&&['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k)),lean=locked?(Number(keys.has('KeyE'))-Number(keys.has('KeyQ'))):0;
 walkBlend+=(Number(moving)-walkBlend)*(1-Math.exp(-10*dt));walkPhase+=dt*9*walkBlend;const bob=Math.sin(walkPhase)*.025*walkBlend;
 gunYaw=yaw+handYaw;gunPitch=pitch+handPitch;
 const view=online&&predictionReady?predicted:local;smoothPosition.lerp(new THREE.Vector3(view.x,view.y+1.5,view.z),1-Math.exp(-35*dt));camera.position.copy(smoothPosition);stepRecoil(wristSpring,dt);stepRecoil(cameraSpring,dt);wristTwist*=Math.exp(-10*dt);camera.rotation.set(pitch+cameraSpring.angle,yaw,0,'YXZ');
 const reloadEnd=online?local.reloadUntil:reloading,clock=online?serverTime+now-receivedAt:now;
 placeWeapon(rig,{yaw:handYaw,pitch:handPitch,bob,lean,recoil:0,reload:!!reloadEnd});
 wrist.rotation.set(wristSpring.angle,0,wristTwist,'YXZ');
 flashLife=Math.max(0,flashLife-dt);flash.visible=flashLife>0;muzzleLight.intensity=12*flashLife/.075;
 shotVignette.style.opacity=String(Math.max(flashLife/.075*.65,Math.max(0,wristSpring.angle)*.14));
 for(const target of targets.values()){const age=t-target.hitAt;target.group.rotation.x=age<.5?Math.sin(age*32)*.12*Math.exp(-age*8):0;target.face.material.emissive.setHex(age<.16?0x664018:0x000000);}
 $('reload').textContent=reloadEnd?'RELOADING':'R · RELOAD';
 $('notice').textContent=local.hp<=0?`BACK IN ${Math.max(1,Math.ceil((local.deadUntil-clock)/1000))}`:'';
 for(const g of peers.values()){const p=g.userData.target;if(p){g.position.lerp(new THREE.Vector3(p.x,p.y,p.z),1-Math.exp(-15*dt));g.rotation.y=p.yaw;}}
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i],age=(now-p.born)/1000,progress=projectileProgress(p.distance,age);
  p.round.position.copy(p.origin).addScaledVector(p.direction,p.distance*progress);p.round.visible=progress<1;
  if(progress===1&&(p.confirmed||age>2)){if(p.confirmed)impactEffect(p.result,now);scene.remove(p.round);if(pendingShots.get(p.result.shotId)===p)pendingShots.delete(p.result.shotId);projectiles.splice(i,1);}
 }
 for(let i=impacts.length-1;i>=0;i--){const hit=impacts[i],age=(now-hit.born)/1000,layout=hitMarkerLayout(hit.x,hit.y,innerWidth,innerHeight,age);
  hit.marker.style.left=layout.x+'px';hit.marker.style.top=layout.y+'px';hit.marker.style.opacity=String(layout.opacity);hit.marker.style.transform=`translate(-50%,-50%) scale(${layout.scale})`;
  if(age>=.25){hit.marker.remove();impacts.splice(i,1);}
 }
 $('time').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
 colorShift.uniforms.strength.value=Math.max(0,1-(now-lastShot)/160);
 if(colorShift.uniforms.strength.value>0){renderer.setRenderTarget(shotBuffer);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(screenScene,screenCamera);}else renderer.render(scene,camera);
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const size=renderer.getDrawingBufferSize(new THREE.Vector2());shotBuffer.setSize(size.x,size.y);}
window.addEventListener('resize',resize);resize();camera.position.set(0,1.5,8);requestAnimationFrame(frame);
