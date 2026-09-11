import * as THREE from './vendor/three.module.js';
const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0xb7c8c7);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xb7c8c7,38,100);
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
function cowboy(color){const g=new THREE.Group();mesh(new THREE.CapsuleGeometry(.42,.96,4,8),mat(color),g,0,.9,0);mesh(new THREE.CylinderGeometry(.67,.67,.09,10),hat,g,0,1.79,0);mesh(new THREE.CylinderGeometry(.34,.38,.3,8),hat,g,0,1.95,0);box(.74,.1,.08,wood,g,0,.76,-.32);const hands=new THREE.Group();hands.position.set(0,1.05,0);g.add(hands);mesh(new THREE.SphereGeometry(.13,8,6),skin,hands,.4,0,-.48);mesh(new THREE.SphereGeometry(.13,8,6),skin,hands,-.4,-.12,-.27);const gun=revolver(hands);gun.position.set(.4,.1,-.55);g.userData.hands=hands;scene.add(g);return g;}
const rig=new THREE.Group();camera.add(rig);mesh(new THREE.SphereGeometry(.13,8,6),skin,rig,.3,-.3,-.55);mesh(new THREE.SphereGeometry(.13,8,6),skin,rig,-.25,-.39,-.5);const gun=revolver(rig);gun.position.set(.3,-.21,-.62);
const flash=mesh(new THREE.ConeGeometry(.12,.52,5),new THREE.MeshBasicMaterial({color:0xffe6a6}),rig,.3,-.185,-1.23);flash.rotation.x=-Math.PI/2;flash.visible=false;
const dummies=[cowboy(0xa57450),cowboy(0x6b9290),cowboy(0x9d7b8f)];dummies.forEach((g,i)=>g.position.set((i-1)*5,0,-9-Math.abs(i-1)*3));
let token=null,id=null,events=null,online=false,joining=false,local={x:0,y:0,z:8,hp:100,ammo:6},yaw=0,pitch=0,freeX=0,freeY=0,gunYaw=0,gunPitch=0,recoil=0,kick=0,lastShot=0,reloading=0,vy=0,last=performance.now(),started=last,serverTime=0,receivedAt=0;
const keys=new Set(),peers=new Map(),projectiles=[];let audio;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const angleDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const gunDirection=()=>new THREE.Vector3(-Math.sin(gunYaw)*Math.cos(gunPitch),Math.sin(gunPitch),-Math.cos(gunYaw)*Math.cos(gunPitch));
function muzzlePosition(){return camera.position.clone().add(gunDirection().multiplyScalar(.76)).add(new THREE.Vector3(Math.cos(gunYaw)*.19,-.23,-Math.sin(gunYaw)*.19));}
function sound(){try{audio??=new AudioContext();audio.resume();const n=audio.createBufferSource(),b=audio.createBuffer(1,audio.sampleRate*.14,audio.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length)**2.1;n.buffer=b;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1150;const gain=audio.createGain();gain.gain.value=.23;n.connect(filter).connect(gain).connect(audio.destination);n.start();}catch{}}
async function post(path,data={}){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});if(!r.ok)throw Error(await r.text()||'Connection lost');return r.status===204?null:r.json();}
function shotEffect(s){const direction=new THREE.Vector3(s.direction.x,s.direction.y,s.direction.z).normalize(),round=mesh(new THREE.CapsuleGeometry(.025,.22,2,6),new THREE.MeshBasicMaterial({color:0xffd27a}),scene,s.origin.x,s.origin.y,s.origin.z);round.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);projectiles.push({round,direction,distance:s.distance,travel:0});if(s.id===id&&s.hit){$('hit').style.opacity=1;setTimeout(()=>$('hit').style.opacity=0,130);}}
function applyState(s){serverTime=s.time;receivedAt=performance.now();const mine=s.players.find(p=>p.id===id);if(!mine)return;local=mine;$('health').textContent=mine.hp;$('ammo').textContent=mine.ammo;$('connection').textContent=`${s.players.length} / 12 • ${$('room').value.toUpperCase()}`;
 const ids=new Set();for(const p of s.players){if(p.id===id)continue;ids.add(p.id);if(!peers.has(p.id))peers.set(p.id,cowboy(p.color));const g=peers.get(p.id);g.userData.target=p;g.visible=p.hp>0;g.userData.hands.rotation.set(p.gunPitch||0,angleDelta(p.yaw,p.gunYaw||p.yaw),0);}
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
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===$('game');document.body.classList.toggle('playing',locked);keys.clear();if(locked)$('play').innerHTML='RESUME <span>↗</span>';});
document.addEventListener('mousemove',e=>{if(!document.pointerLockElement)return;const nextX=freeX+e.movementX*.0018,nextY=freeY+e.movementY*.0018,limitX=.115,limitY=.08;freeX=clamp(nextX,-limitX,limitX);freeY=clamp(nextY,-limitY,limitY);yaw-=(nextX-freeX)*1.75;pitch=clamp(pitch-(nextY-freeY)*1.75,-1.35,1.35);});
window.addEventListener('keydown',e=>{if(['Space','Tab'].includes(e.code)&&document.pointerLockElement)e.preventDefault();keys.add(e.code);if(e.code==='Tab')$('score').style.display='block';if(e.code==='KeyR'&&document.pointerLockElement)reload();});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab')$('score').style.display='none';});window.addEventListener('blur',()=>{keys.clear();$('score').style.display='none';});
function reload(){if(online){post('reload').catch(networkError);}else if(!reloading&&local.ammo<6)reloading=performance.now()+1800;}
function networkError(e){$('connection').textContent='DISCONNECTED';$('error').textContent=e.message+' — reload the page to rejoin.';document.exitPointerLock();online=false;token=null;events?.close();}
window.addEventListener('mousedown',e=>{if(e.button!==0||!document.pointerLockElement||local.hp<=0)return;const now=performance.now();if(now-lastShot<240||local.reloadUntil||reloading)return;if(!local.ammo){reload();return;}lastShot=now;recoil+=.24;kick+=.035;sound();flash.visible=true;setTimeout(()=>flash.visible=false,48);if(online)post('fire').catch(networkError);else{local.ammo--;$('ammo').textContent=local.ammo;const direction=gunDirection(),origin=muzzlePosition(),ray=new THREE.Raycaster(origin,direction);const hits=ray.intersectObjects(dummies,true);if(hits.length){$('hit').style.opacity=1;setTimeout(()=>$('hit').style.opacity=0,130);}shotEffect({id:'local',origin,direction,distance:hits[0]?.distance||60});}});
setInterval(()=>{if(!online)return;const active=!!document.pointerLockElement;post('input',{x:active?Number(keys.has('KeyD'))-Number(keys.has('KeyA')):0,z:active?Number(keys.has('KeyS'))-Number(keys.has('KeyW')):0,yaw,pitch,gunYaw,gunPitch,jump:active&&keys.has('Space')}).catch(networkError);},50);
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;const t=(now-started)/1000,locked=!!document.pointerLockElement;
 if(!online&&locked){let x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyS'))-Number(keys.has('KeyW')),len=Math.max(1,Math.hypot(x,z));local.x=THREE.MathUtils.clamp(local.x+(x*Math.cos(yaw)+z*Math.sin(yaw))/len*4.5*dt,-27,27);local.z=THREE.MathUtils.clamp(local.z+(-x*Math.sin(yaw)+z*Math.cos(yaw))/len*4.5*dt,-27,27);if(keys.has('Space')&&local.y===0)vy=5;vy-=15*dt;local.y=Math.max(0,local.y+vy*dt);if(!local.y)vy=0;}
 if(reloading&&now>=reloading){reloading=0;local.ammo=6;$('ammo').textContent=6;}
 const moving=locked&&['KeyW','KeyA','KeyS','KeyD'].some(k=>keys.has(k)),lean=locked?(Number(keys.has('KeyE'))-Number(keys.has('KeyQ'))):0,bob=moving?Math.sin(t*9)*.025:Math.sin(t*1.8)*.004;
 const targetGunYaw=yaw-freeX,targetGunPitch=clamp(pitch-freeY,-1.35,1.35),follow=1-Math.exp(-7.5*dt);gunYaw+=angleDelta(gunYaw,targetGunYaw)*follow;gunPitch+=angleDelta(gunPitch,targetGunPitch)*follow;
 camera.position.lerp(new THREE.Vector3(local.x,local.y+1.5+bob,local.z),online?1-Math.exp(-20*dt):1);recoil*=Math.exp(-12*dt);kick*=Math.exp(-17*dt);camera.rotation.set(pitch+kick,yaw,moving?Math.sin(t*4.5)*.008:0,'YXZ');
 const gunLocalYaw=angleDelta(yaw,gunYaw),gunLocalPitch=gunPitch-pitch,motion=lean*.08+Math.sin(t*9)*Number(moving)*.018;rig.position.set(.08+freeX*1.8+gunLocalYaw*.5,bob*.55+freeY*1.3+gunLocalPitch*.35,recoil*.32);rig.rotation.set(-gunLocalPitch+recoil*2.3,gunLocalYaw,lean*.16+motion);
 const reloadEnd=online?local.reloadUntil:reloading,clock=online?serverTime+now-receivedAt:now;if(reloadEnd){rig.rotation.z=-.4;rig.position.y-=.25;$('reload').textContent='RELOADING';}else{rig.rotation.z=0;$('reload').textContent='R · RELOAD';}
 $('notice').textContent=local.hp<=0?`BACK IN ${Math.max(1,Math.ceil((local.deadUntil-clock)/1000))}`:'';
 for(const g of peers.values()){const p=g.userData.target;if(p){g.position.lerp(new THREE.Vector3(p.x,p.y,p.z),1-Math.exp(-15*dt));g.rotation.y=p.yaw;}}
 for(let i=projectiles.length-1;i>=0;i--){const projectile=projectiles[i],step=Math.min(260*dt,projectile.distance-projectile.travel);projectile.round.position.addScaledVector(projectile.direction,step);projectile.travel+=step;if(projectile.travel>=projectile.distance){scene.remove(projectile.round);projectile.round.geometry.dispose();projectile.round.material.dispose();projectiles.splice(i,1);}}
 $('time').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;renderer.render(scene,camera);
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});renderer.setSize(innerWidth,innerHeight);camera.position.set(0,1.5,8);requestAnimationFrame(frame);
