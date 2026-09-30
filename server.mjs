import {launchProjectile,advanceProjectile} from './projectile-physics.mjs';
import {networkInterfaces} from 'node:os';
import {applyDamage,setPowers} from './combat.mjs';
import {createVoxelWalls} from './voxel-walls.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {move,firingMode,resolveBarrelShot} from './simulation.mjs';
import {createSkeetRange,clayPose} from './skeet.mjs';
import {AMMO_MODS,ammoProfile,canPickUpShotgun,WEAPONS,shotgunPellets,SHOTGUN_INTERVAL,shotgunDischarge} from './weapons.mjs';
const adminSessions=new Map(),loginAttempts=new Map();
const adminCode=process.env.ADMIN_CODE||'0310';
const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
function isAdmin(value){const expires=adminSessions.get(value);return expires>Date.now();}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const rooms=new Map(),sessions=new Map(),skeetRanges=new Map(),wallWorlds=new Map(),bullets=[];
const spawn=()=>({x:(Math.random()-.5)*36,z:(Math.random()-.5)*36,y:0,vy:0,vx:0,vz:0});
const send=(res,event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
function publicPlayer(p){const {id,name,x,y,z,yaw,pitch,gunYaw,gunPitch,hp,ammo,weapon,kills,deaths,reloadUntil,deadUntil,color,hasShotgun,mods,powers}=p;return {id,name,x,y,z,yaw,pitch,gunYaw,gunPitch,hp,ammo,weapon,kills,deaths,reloadUntil,deadUntil,color,hasShotgun,mods,powers};}
function broadcast(room,event,data){for(const p of room.values())if(p.stream)send(p.stream,event,data);}
function remove(p){p.stream?.end();sessions.delete(p.token);const room=rooms.get(p.room);room?.delete(p.id);if(!room?.size){rooms.delete(p.room);skeetRanges.delete(p.room);wallWorlds.delete(p.room);}}
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 const origin=req.headers.origin;
 if(origin){
  if(new URL(origin).host!==req.headers.host&&!allowedOrigins.has(origin)){res.writeHead(403).end('Origin not allowed');return;}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
 }
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}).end();return;}
 if(req.method==='GET'&&url.pathname==='/api/health'){json(res,{multiplayer:true});return;}

 if(req.method==='POST'&&url.pathname.startsWith('/api/')){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){res.writeHead(413).end();return;}}
  let data;try{data=JSON.parse(body);}catch{res.writeHead(400).end();return;}
  if(!data||typeof data!=='object'||Array.isArray(data)){res.writeHead(400).end();return;}
  if(url.pathname==='/api/admin/login'){
   const address=req.socket.remoteAddress,now=Date.now();let attempts=loginAttempts.get(address);
   if(!attempts||now>attempts.until){attempts={count:0,until:now+60000};loginAttempts.set(address,attempts);}
   if(++attempts.count>5){res.writeHead(429).end('Too many attempts. Try again in a minute.');return;}
   if(data.code!==adminCode){res.writeHead(403).end('Incorrect admin code');return;}
   const adminToken=randomUUID();adminSessions.set(adminToken,now+8*60*60*1000);json(res,{adminToken});return;
  }
  if(url.pathname.startsWith('/api/admin/')){
   if(!isAdmin(data.adminToken)){res.writeHead(403).end('Unlock the admin panel first');return;}
   if(url.pathname==='/api/admin/players'){
    json(res,{rooms:[...rooms].map(([name,room])=>({name,players:[...room.values()].filter(p=>Date.now()-p.lastSeen<15000).map(p=>({id:p.id,name:p.name,hp:p.hp,kills:p.kills,deaths:p.deaths,active:!!p.input.active}))})).filter(r=>r.players.length)});return;
   }
   if(url.pathname==='/api/admin/logout'){adminSessions.delete(data.adminToken);res.writeHead(204).end();return;}
   if(url.pathname==='/api/admin/powers'){
    const own=sessions.get(data.token);if(!own){res.writeHead(401).end('Join a game first');return;}
    setPowers(own,data.powers);json(res,publicPlayer(own));return;
   }
   res.writeHead(404).end();return;
  }
  if(url.pathname==='/api/join'){
   const name=typeof data.name==='string'?data.name.trim():'';
   if(!name||name.length>16||/[\u0000-\u001f\u007f]/.test(name)){res.writeHead(400).end('Enter a username (1–16 characters)');return;}
   const previous=sessions.get(data.previousToken);
   let target=null;
   if(data.targetId){
    if(!isAdmin(data.adminToken)){res.writeHead(403).end('Unlock the admin panel first');return;}
    target=[...sessions.values()].find(p=>p.id===data.targetId&&Date.now()-p.lastSeen<15000);
    if(!target){res.writeHead(404).end('That player has left');return;}
   }

   let key=String(target?.room||data.room||'frontier').replace(/[^a-z0-9-]/gi,'').slice(0,24).toLowerCase()||'frontier';
   if(!target&&!data.room){let number=1;while((rooms.get(key)?.size||0)-(previous?.room===key?1:0)>=12)key='frontier-'+(++number);}
   if(sessions.size>=128&&!previous){res.writeHead(503).end('Server full');return;}
   if(!rooms.has(key)){rooms.set(key,new Map());skeetRanges.set(key,createSkeetRange());wallWorlds.set(key,createVoxelWalls());}const room=rooms.get(key);
   if(room.size>=12&&previous?.room!==key){res.writeHead(409).end('Room full (12 players)');return;}
   const p={id:randomUUID(),token:randomUUID(),room:key,name,...spawn(),yaw:0,pitch:0,gunYaw:0,gunPitch:0,hp:100,ammo:6,weapon:'revolver',hasShotgun:false,mods:{revolver:'standard',shotgun:'standard'},ammoByWeapon:{revolver:6,shotgun:2},kills:0,deaths:0,reloadUntil:0,deadUntil:0,lastShot:0,lastSeen:Date.now(),powers:{noRecoil:false,infiniteAmmo:false,infiniteHp:false},input:{},color:[0xc17a47,0x658c91,0x96799c,0x879466][room.size%4]};room.set(p.id,p);sessions.set(p.token,p);if(previous){if(isAdmin(data.adminToken))setPowers(p,previous.powers);remove(previous);}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({token:p.token,id:p.id,room:key}));return;
  }
  const p=sessions.get(data.token);if(!p){res.writeHead(401).end();return;}p.lastSeen=Date.now();const now=Date.now(),room=rooms.get(p.room);
  if(url.pathname==='/api/input'){p.input={x:data.x,z:data.z,yaw:data.yaw,pitch:data.pitch,jump:!!data.jump,active:data.active===true};p.gunYaw=Number.isFinite(data.gunYaw)?data.gunYaw:p.yaw;p.gunPitch=Math.max(-1.35,Math.min(1.35,Number.isFinite(data.gunPitch)?data.gunPitch:p.pitch));}
  else if(url.pathname==='/api/leave'){remove(p);res.writeHead(204).end();return;}
  else if(url.pathname==='/api/resetWalls'){wallWorlds.get(p.room).reset();broadcast(room,'wallReset',{});}
  else if(url.pathname==='/api/modify'&&p.hp>0&&!p.reloadUntil&&Object.hasOwn(AMMO_MODS[p.weapon],data.mod)){p.mods[p.weapon]=data.mod;p.ammo=ammoProfile(p.weapon,p.mods).capacity;p.ammoByWeapon[p.weapon]=p.ammo;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(publicPlayer(p)));return;}
  else if(url.pathname==='/api/launch'&&p.hp>0)skeetRanges.get(p.room).launch(now);
  else if(url.pathname==='/api/pickup'&&!p.hasShotgun&&canPickUpShotgun(p,data.yaw,data.pitch)){p.hasShotgun=true;p.ammoByWeapon[p.weapon]=p.ammo;p.weapon='shotgun';p.ammo=p.ammoByWeapon.shotgun;}
  else if(url.pathname==='/api/equip'&&Object.hasOwn(WEAPONS,data.weapon)&&(data.weapon!=='shotgun'||p.hasShotgun)&&p.hp>0&&!p.reloadUntil){p.ammoByWeapon[p.weapon]=p.ammo;p.weapon=data.weapon;p.ammo=p.ammoByWeapon[p.weapon];}
  else if(url.pathname==='/api/reload'&&!p.powers.infiniteAmmo&&p.hp>0&&!p.reloadUntil&&p.ammo<ammoProfile(p.weapon,p.mods).capacity)p.reloadUntil=now+WEAPONS[p.weapon].reload;
  else if(url.pathname==='/api/fire'&&p.hp>0&&!p.reloadUntil&&p.ammo>=WEAPONS[p.weapon].cost&&(p.weapon==='shotgun'?now-p.lastShot>=SHOTGUN_INTERVAL:firingMode(now,p.lastShot,data.fan).ready)){
   const ray=resolveBarrelShot(p,data);if(!ray){res.writeHead(400).end('Invalid muzzle pose');return;}
   const fan=p.weapon==='revolver'&&firingMode(now,p.lastShot,data.fan).fan;
   // Use the displayed barrel pose at the instant of firing, not a stale input tick.
   if(Number.isFinite(data.gunYaw))p.gunYaw=data.gunYaw;
   if(Number.isFinite(data.gunPitch))p.gunPitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,data.gunPitch));
   const discharge=p.weapon==='shotgun'?shotgunDischarge(p.ammo,data.both===true):{cost:1};
   p.lastShot=now;if(!p.powers.infiniteAmmo)p.ammo-=discharge.cost;p.ammoByWeapon[p.weapon]=p.ammo;const {origin,direction}=ray;
   const range=skeetRanges.get(p.room),clays=range.flights.map(f=>clayPose(f,now)).filter(c=>c.y>0);
   const shotId=typeof data.shotId==='string'?data.shotId.slice(0,64):'',players=[...room.values()].filter(other=>other!==p);
   const profile=ammoProfile(p.weapon,p.mods);
   const rays=p.weapon==='shotgun'?shotgunPellets(origin,direction,data.barrelRight,shotId,discharge.barrel,profile):[{origin,direction}];
   for(let i=0;i<rays.length;i++)bullets.push(launchProjectile(rays[i],profile,{room:p.room,shooter:p.id,weapon:p.weapon,shotId:p.weapon==='shotgun'?`${shotId}/${i}`:shotId,born:now,updatedAt:now}));
   broadcast(room,'shot',{id:p.id,weapon:p.weapon,bulletSize:profile.size,profile,origin,direction,...(p.weapon==='shotgun'?{pellets:rays}:{}),fan,shotId});
  }
  res.writeHead(204).end();return;
 }
 if(req.method==='GET'&&url.pathname==='/api/events'){
  const p=sessions.get(url.searchParams.get('token'));if(!p){res.writeHead(401).end();return;}
  p.stream?.end();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');p.stream=res;send(res,'wallState',wallWorlds.get(p.room).snapshot());
  req.on('close',()=>{if(p.stream===res)p.stream=null;});return;
 }
 const files={'/can-physics.js':'can-physics.js','/food-geometry.js':'food-geometry.js','/food-splats.js':'food-splats.js','/projectile-physics.mjs':'projectile-physics.mjs','/can-characters.js':'can-characters.js','/bootstrap.js':'bootstrap.js','/combat.mjs':'combat.mjs','/menu.js':'menu.js','/runtime-config.js':'runtime-config.js','/voxel-walls.mjs':'voxel-walls.mjs','/voxel-wall-view.js':'voxel-wall-view.js','/':'index.html','/index.html':'index.html','/game.js':'game.js','/game-loop.js':'game-loop.js','/render-batches.js':'render-batches.js','/weapon-pose.js':'weapon-pose.js','/weapon-audio.js':'weapon-audio.js','/simulation.mjs':'simulation.mjs','/skeet.mjs':'skeet.mjs','/skeet-view.js':'skeet-view.js','/weapons.mjs':'weapons.mjs','/shotgun-view.js':'shotgun-view.js','/shell-physics.js':'shell-physics.js','/style.css':'style.css','/vendor/three.module.js':'vendor/three.module.js','/vendor/three.core.js':'vendor/three.core.js'};
 for(const i of [1,2,3])files['/assets/audio/revolver-'+i+'.wav']='assets/audio/revolver-'+i+'.wav';
 const file=files[url.pathname];if(!file||req.method!=='GET'){res.writeHead(404).end('Not found');return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.wav')?'audio/wav':'text/javascript');res.end(await readFile(fileURLToPath(new URL(file,import.meta.url))));
 }catch(e){console.error(e.message);if(!res.headersSent)res.writeHead(500);res.end();}
});
setInterval(()=>{const now=Date.now();for(let i=bullets.length-1;i>=0;i--)if(!rooms.has(bullets[i].room))bullets.splice(i,1);for(const [key,expires] of adminSessions)if(expires<=now)adminSessions.delete(key);for(const [key,attempt] of loginAttempts)if(attempt.until<=now)loginAttempts.delete(key);for(const [key,room] of rooms){
 const range=skeetRanges.get(key);for(const broken of range.update(now))broadcast(room,'clayBreak',broken);
 for(const p of room.values()){
 if(now-p.lastSeen>15000){remove(p);continue;}
 if(p.deadUntil&&now>=p.deadUntil){Object.assign(p,spawn(),{hp:100,ammo:ammoProfile(p.weapon,p.mods).capacity,ammoByWeapon:{revolver:ammoProfile('revolver',p.mods).capacity,shotgun:2},deadUntil:0,reloadUntil:0});}
 if(p.reloadUntil&&now>=p.reloadUntil){p.ammo=ammoProfile(p.weapon,p.mods).capacity;p.ammoByWeapon[p.weapon]=p.ammo;p.reloadUntil=0;}
 if(p.hp>0){const old={x:p.x,z:p.z};move(p,p.input,.05);wallWorlds.get(key).collide(p,old);}
 }
 for(let i=bullets.length-1;i>=0;i--){const bullet=bullets[i];if(bullet.room!==key)continue;const dt=Math.min(.1,(now-bullet.updatedAt)/1000);bullet.updatedAt=now;
  const clays=range.flights.map(f=>clayPose(f,now));
  for(const result of advanceProjectile(bullet,dt,[...room.values()].filter(p=>p.id!==bullet.shooter),clays,wallWorlds.get(key))){
   for(const change of result.wallChanges)broadcast(room,'wallDamage',change);
   if(result.clayId){const broken=range.breakClay(result.clayId,now,bullet.direction);if(broken)broadcast(room,'clayBreak',broken);}
   const victim=room.get(result.hit);if(victim){const killed=applyDamage(victim,result.headshot?bullet.profile.headDamage:bullet.profile.damage,now);const shooter=room.get(bullet.shooter);if(killed&&shooter)shooter.kills++;result.killed=killed;}
   broadcast(room,'impact',result);
  }
  if(!bullet.alive)bullets.splice(i,1);
 }broadcast(room,'state',{time:now,players:[...room.values()].map(publicPlayer),clays:range.flights});
}},50);
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>{
 const port=server.address().port;console.log(`DUSTLINE ready at http://localhost:${port}`);
 for(const entries of Object.values(networkInterfaces()))for(const entry of entries||[])if(entry.family==='IPv4'&&!entry.internal)console.log(`Same-Wi-Fi join address: http://${entry.address}:${port}`);
});
