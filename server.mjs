import {chargedArrow,BOW_CHARGE_MS} from './weapons.mjs';
import {adminLoadout,applyAdminLoadout} from './admin-gameplay.mjs';
import {createTrainingCans,respawnTrainingCans} from './training-cans.mjs';
import {createWallet,canShop,ownsAmmo,purchaseAmmo,awardBeans} from './shop.mjs';
import {launchProjectile,advanceProjectile,traceLaser} from './projectile-physics.mjs';
import {networkInterfaces} from 'node:os';
import {applyDamage,setPowers} from './combat.mjs';
import {createVoxelWalls} from './voxel-walls.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomInt} from 'node:crypto';
import {move,firingMode,resolveBarrelShot} from './simulation.mjs';
import {createSkeetRange,clayPose} from './skeet.mjs';
import {AMMO_MODS,ammoProfile,canUseAmmo,canPickUpShotgun,WEAPONS,shotgunPellets,SHOTGUN_INTERVAL,shotgunDischarge} from './weapons.mjs';
const adminSessions=new Map(),loginAttempts=new Map();
const adminCode=process.env.ADMIN_CODE||'0310';
const allowedOrigins=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
function isAdmin(value){const expires=adminSessions.get(value);return expires>Date.now();}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const rooms=new Map(),sessions=new Map(),skeetRanges=new Map(),wallWorlds=new Map(),roomCans=new Map(),bullets=[],bleeds=[];
const codeAlphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function playerCode(){let code;do{code=Array.from({length:6},()=>codeAlphabet[randomInt(codeAlphabet.length)]).join('');}while([...sessions.values()].some(p=>p.joinCode===code));return code;}
function live(p){return p&&Date.now()-p.lastSeen<15000;}
const spawn=()=>{let x,z;do{x=(Math.random()-.5)*36;z=(Math.random()-.5)*36;}while(x>-17&&x<-9&&z>0&&z<7);return {x,z,y:0,vy:0,vx:0,vz:0};};
const send=(res,event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
function publicPlayer(p){const {id,name,x,y,z,yaw,pitch,gunYaw,gunPitch,hp,ammo,weapon,kills,deaths,reloadUntil,deadUntil,color,hasShotgun,hasBow,chargeAt,mods,powers,beans,ownedAmmo}=p;return {id,name,x,y,z,yaw,pitch,gunYaw,gunPitch,hp,ammo,weapon,kills,deaths,reloadUntil,deadUntil,color,hasShotgun,hasBow,chargeAt,mods,powers,beans,ownedAmmo,ammoByWeapon:{...p.ammoByWeapon}};}
function broadcast(room,event,data){for(const p of room.values())if(p.stream)send(p.stream,event,data);}
function processImpact(room,range,cans,bullet,result,now){
   for(const change of result.wallChanges)broadcast(room,'wallDamage',change);
   if(result.clayId){const broken=range.breakClay(result.clayId,now,bullet.direction);if(broken)broadcast(room,'clayBreak',broken);}
   const victim=room.get(result.hit)||cans.find(can=>can.id===result.hit);if(victim){const killed=applyDamage(victim,result.damage,now);const shooter=room.get(bullet.shooter);if(killed&&shooter)shooter.kills++;result.killed=killed;if(bullet.profile.arrow&&!killed&&!victim.powers?.infiniteHp)bleeds.push({room:bullet.room,target:victim.id,shooter:bullet.shooter,left:3,next:now+400});}
   const earner=room.get(bullet.shooter);if(earner)awardBeans(earner,result);
   broadcast(room,'impact',result);
}
function remove(p,keepRoom=false){p.stream?.end();sessions.delete(p.token);const room=rooms.get(p.room);room?.delete(p.id);if(!room?.size&&!keepRoom){rooms.delete(p.room);skeetRanges.delete(p.room);wallWorlds.delete(p.room);roomCans.delete(p.room);}}
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
    json(res,{rooms:[...rooms].map(([name,room])=>({name,players:[...room.values()].filter(live).map(p=>({id:p.id,name:p.name,cookieResetPending:!!p.cookieReset&&p.cookieReset!==p.cookieResetAck,hp:p.hp,kills:p.kills,deaths:p.deaths,active:!!p.input.active}))})).filter(r=>r.players.length)});return;
   }
   if(url.pathname==='/api/admin/logout'){adminSessions.delete(data.adminToken);res.writeHead(204).end();return;}
   if(url.pathname==='/api/admin/powers'){
    const own=sessions.get(data.token);if(!own){res.writeHead(401).end('Join a game first');return;}
    setPowers(own,data.powers);json(res,publicPlayer(own));return;
   }
   if(url.pathname==='/api/admin/loadout'){
    const own=sessions.get(data.token);if(!own){res.writeHead(401).end('Join a game first');return;}
    let loadout;try{loadout=adminLoadout(null,data,randomUUID());}catch{res.writeHead(400).end('Invalid ammo');return;}
    applyAdminLoadout(own,loadout);json(res,publicPlayer(own));return;
   }
   if(url.pathname==='/api/admin/resetCookie'){
    const target=[...sessions.values()].find(p=>p.id===data.targetId&&live(p));
    if(!target){res.writeHead(404).end('That player has left');return;}
    target.cookieReset=randomUUID();target.nextResetAt=0;json(res,{ok:true});return;
   }
   res.writeHead(404).end();return;
  }
  if(url.pathname==='/api/join'){
   const name=typeof data.name==='string'?data.name.trim():'';
   if(!name||name.length>16||/[\u0000-\u001f\u007f]/.test(name)){res.writeHead(400).end('Enter a username (1–16 characters)');return;}
   const previousSession=sessions.get(data.previousToken),previous=live(previousSession)?previousSession:null;
   if((data.targetId!==undefined||data.room!==undefined||data.joinCode!==undefined)&&!isAdmin(data.adminToken)){res.writeHead(403).end('Only admins can join another player.');return;}
   let target=null;
   if(data.targetId!==undefined){
    if(typeof data.targetId!=='string'||!data.targetId||data.targetId.length>100){res.writeHead(400).end('Invalid target player');return;}
    target=[...sessions.values()].find(p=>p.id===data.targetId&&live(p));
    if(!target){res.writeHead(404).end('That player has left');return;}
   }else if(data.joinCode!==undefined){
    if(typeof data.joinCode!=='string'){res.writeHead(400).end('Enter a six-character player code');return;}
    const code=data.joinCode.trim().toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){res.writeHead(404).end('That player code is not online');return;}
    target=[...sessions.values()].find(p=>p.joinCode===code&&live(p));
    if(!target){res.writeHead(404).end('That player code is not online');return;}
   }

   const key=target?.room||(data.room?String(data.room).replace(/[^a-z0-9-]/gi,'').slice(0,24).toLowerCase():null)||`private-${randomUUID().replaceAll('-','').slice(0,16)}`;
   if(sessions.size>=128&&!previous){res.writeHead(503).end('Server full');return;}
   if(!rooms.has(key)){rooms.set(key,new Map());skeetRanges.set(key,createSkeetRange());wallWorlds.set(key,createVoxelWalls());roomCans.set(key,createTrainingCans());}const room=rooms.get(key);
   if(room.size>=2&&previous?.room!==key){res.writeHead(409).end('Lobby full (2 players)');return;}
   const p={id:previous?.id||randomUUID(),joinCode:previous?.joinCode||playerCode(),token:randomUUID(),room:key,name,...spawn(),...createWallet(),yaw:0,pitch:0,gunYaw:0,gunPitch:0,hp:100,ammo:6,weapon:'revolver',hasShotgun:false,hasBow:false,chargeAt:null,mods:{revolver:'standard',shotgun:'standard',bow:'standard'},ammoByWeapon:{revolver:6,shotgun:2,bow:1},kills:0,deaths:0,reloadUntil:0,deadUntil:0,lastShot:0,lastSeen:Date.now(),powers:{noRecoil:false,infiniteAmmo:false,infiniteHp:false,noCooldown:false,fullAuto:false},input:{},color:[0xc17a47,0x658c91,0x96799c,0x879466][room.size%4]};
   if(previous){if(isAdmin(data.adminToken))setPowers(p,previous.powers);remove(previous,previous.room===key);}
   room.set(p.id,p);sessions.set(p.token,p);
   json(res,{token:p.token,id:p.id,room:key,joinCode:p.joinCode,lobbyCode:target?.lobbyCode||target?.joinCode||p.joinCode});p.lobbyCode=target?.lobbyCode||target?.joinCode||p.joinCode;return;
  }
  const p=sessions.get(data.token);if(!p){res.writeHead(401).end();return;}p.lastSeen=Date.now();const now=Date.now(),room=rooms.get(p.room);
  if(url.pathname==='/api/input'){if(data.active!==true)p.chargeAt=null;p.input={x:data.x,z:data.z,yaw:data.yaw,pitch:data.pitch,jump:!!data.jump,active:data.active===true};p.gunYaw=Number.isFinite(data.gunYaw)?data.gunYaw:p.yaw;p.gunPitch=Math.max(-1.35,Math.min(1.35,Number.isFinite(data.gunPitch)?data.gunPitch:p.pitch));}
  else if(url.pathname==='/api/charge'){if(p.weapon==='bow'&&p.hp>0&&!p.reloadUntil)p.chargeAt=data.active===true?(p.chargeAt??now):null;}
  else if(url.pathname==='/api/ackCookieReset'){if(data.id===p.cookieReset)p.cookieResetAck=data.id;}
  else if(url.pathname==='/api/leave'){remove(p);res.writeHead(204).end();return;}
  else if(url.pathname==='/api/resetWalls'){wallWorlds.get(p.room).reset();broadcast(room,'wallReset',{});}
  else if(url.pathname==='/api/buy'){
   const result=purchaseAmmo(p,data.weapon,data.mod,data.yaw,data.pitch);
   if(!result.ok){res.writeHead(403).end(result.message);return;}
   json(res,{player:{...publicPlayer(p),ammoByWeapon:p.ammoByWeapon},message:result.message,time:now});return;
  }
  else if(url.pathname==='/api/modify'){
   if(!canShop(p)||!ownsAmmo(p,p.weapon,data.mod)||!Object.hasOwn(AMMO_MODS[p.weapon],data.mod)){res.writeHead(403).end('Buy ammo at GUNZ.');return;}
   purchaseAmmo(p,p.weapon,data.mod);json(res,publicPlayer(p));return;
  }
  else if(url.pathname==='/api/launch'&&p.hp>0)skeetRanges.get(p.room).launch(now);
  else if(url.pathname==='/api/pickup'&&!p.hasShotgun&&canPickUpShotgun(p,data.yaw,data.pitch)){p.hasShotgun=true;p.ammoByWeapon[p.weapon]=p.ammo;p.weapon='shotgun';p.ammo=p.ammoByWeapon.shotgun;}
  else if(url.pathname==='/api/equip'&&Object.hasOwn(WEAPONS,data.weapon)&&(data.weapon!=='shotgun'||p.hasShotgun)&&(data.weapon!=='bow'||p.hasBow)&&p.hp>0&&!p.reloadUntil){p.ammoByWeapon[p.weapon]=p.ammo;p.weapon=data.weapon;p.chargeAt=null;p.ammo=p.ammoByWeapon[p.weapon];}
  else if(url.pathname==='/api/reload'&&!p.powers.infiniteAmmo&&p.hp>0&&!p.reloadUntil&&p.ammo<ammoProfile(p.weapon,p.mods).capacity)p.reloadUntil=now+WEAPONS[p.weapon].reload;
  else if(url.pathname==='/api/fire'&&p.hp>0&&!p.reloadUntil&&p.ammo>=WEAPONS[p.weapon].cost&&(p.powers.noCooldown||(p.weapon==='bow'?now-p.lastShot>=WEAPONS.bow.reload:p.weapon==='shotgun'?now-p.lastShot>=SHOTGUN_INTERVAL:firingMode(now,p.lastShot,data.fan).ready))){
   if(!canUseAmmo(p,p.weapon,p.mods[p.weapon]||'standard')){res.writeHead(403).end('This ammo is admin only.');return;}
   const ray=resolveBarrelShot(p,data);if(!ray){res.writeHead(400).end('Invalid muzzle pose');return;}
   const fan=p.weapon==='revolver'&&firingMode(now,p.lastShot,data.fan).fan;
   // Use the displayed barrel pose at the instant of firing, not a stale input tick.
   if(Number.isFinite(data.gunYaw))p.gunYaw=data.gunYaw;
   if(Number.isFinite(data.gunPitch))p.gunPitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,data.gunPitch));
   const discharge=p.weapon==='shotgun'?shotgunDischarge(p.ammo,data.both===true):{cost:1};
   p.lastShot=now;if(!p.powers.infiniteAmmo)p.ammo-=discharge.cost;p.ammoByWeapon[p.weapon]=p.ammo;const {origin,direction}=ray;
   const range=skeetRanges.get(p.room),clays=range.flights.map(f=>clayPose(f,now)).filter(c=>c.y>0);
   const shotId=typeof data.shotId==='string'?data.shotId.slice(0,64):'',players=[...room.values()].filter(other=>other!==p);
   const profile=p.weapon==='bow'?chargedArrow(p.chargeAt==null?0:(now-p.chargeAt)/BOW_CHARGE_MS):ammoProfile(p.weapon,p.mods);p.chargeAt=null;
   if(p.weapon==='bow'&&!p.powers.infiniteAmmo)p.reloadUntil=now+WEAPONS.bow.reload;
   if(profile.laser){
    const cans=roomCans.get(p.room)||[],beam=traceLaser(ray,profile,players.concat(cans),clays,wallWorlds.get(p.room),{room:p.room,shooter:p.id,weapon:p.weapon,shotId});
    broadcast(room,'shot',{id:p.id,weapon:p.weapon,profile,origin,direction,laserEnd:beam.end,shotId});
    for(const result of beam.impacts)processImpact(room,range,cans,{room:p.room,shooter:p.id,profile,direction},result,now);
    res.writeHead(204).end();return;
   }
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
 const files={'/laser-view.js':'laser-view.js','/bow-feedback.js':'bow-feedback.js','/bow-string.mjs':'bow-string.mjs','/peer-connection.mjs':'peer-connection.mjs','/arena.mjs':'arena.mjs','/bow-view.js':'bow-view.js','/duel-ui.js':'duel-ui.js','/play-start.js':'play-start.js','/bean-scare.js':'bean-scare.js','/admin-gameplay.mjs':'admin-gameplay.mjs','/saved-player.js':'saved-player.js','/training-cans.mjs':'training-cans.mjs','/connection-check.html':'connection-check.html','/connection-check.js':'connection-check.js','/lan-client.js':'lan-client.js','/room-engine.mjs':'room-engine.mjs','/shop.mjs':'shop.mjs','/shop-view.js':'shop-view.js','/shop-ui.js':'shop-ui.js','/can-wounds.js':'can-wounds.js','/can-physics.js':'can-physics.js','/food-geometry.js':'food-geometry.js','/food-splats.js':'food-splats.js','/projectile-physics.mjs':'projectile-physics.mjs','/can-characters.js':'can-characters.js','/bootstrap.js':'bootstrap.js','/combat.mjs':'combat.mjs','/menu.js':'menu.js','/runtime-config.js':'runtime-config.js','/voxel-walls.mjs':'voxel-walls.mjs','/voxel-wall-view.js':'voxel-wall-view.js','/':'index.html','/index.html':'index.html','/game.js':'game.js','/game-loop.js':'game-loop.js','/render-batches.js':'render-batches.js','/weapon-pose.js':'weapon-pose.js','/weapon-audio.js':'weapon-audio.js','/simulation.mjs':'simulation.mjs','/skeet.mjs':'skeet.mjs','/skeet-view.js':'skeet-view.js','/weapons.mjs':'weapons.mjs','/shotgun-view.js':'shotgun-view.js','/shell-physics.js':'shell-physics.js','/style.css':'style.css','/vendor/three.module.js':'vendor/three.module.js','/vendor/three.core.js':'vendor/three.core.js'};
 for(const i of [1,2,3])files['/assets/audio/revolver-'+i+'.wav']='assets/audio/revolver-'+i+'.wav';
 const file=files[url.pathname];if(!file||req.method!=='GET'){res.writeHead(404).end('Not found');return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.wav')?'audio/wav':'text/javascript');res.end(await readFile(fileURLToPath(new URL(file,import.meta.url))));
 }catch(e){console.error(e.message);if(!res.headersSent)res.writeHead(500);res.end();}
});
setInterval(()=>{const now=Date.now();for(let i=bullets.length-1;i>=0;i--)if(!rooms.has(bullets[i].room))bullets.splice(i,1);for(const [key,expires] of adminSessions)if(expires<=now)adminSessions.delete(key);for(const [key,attempt] of loginAttempts)if(attempt.until<=now)loginAttempts.delete(key);for(const [key,room] of rooms){
 const cans=roomCans.get(key)||[];respawnTrainingCans(cans,now);
 const range=skeetRanges.get(key);for(const broken of range.update(now))broadcast(room,'clayBreak',broken);
 for(const p of room.values()){
 if(p.stream&&p.cookieReset&&p.cookieReset!==p.cookieResetAck&&now>=(p.nextResetAt||0)){send(p.stream,'resetCookie',{id:p.cookieReset});p.nextResetAt=now+1000;}
 if(now-p.lastSeen>15000){remove(p);continue;}
 if(p.deadUntil&&now>=p.deadUntil){Object.assign(p,spawn(),{hp:100,ammo:ammoProfile(p.weapon,p.mods).capacity,ammoByWeapon:{revolver:ammoProfile('revolver',p.mods).capacity,shotgun:2,bow:1},chargeAt:null,deadUntil:0,reloadUntil:0});}
 if(p.reloadUntil&&now>=p.reloadUntil){p.ammo=ammoProfile(p.weapon,p.mods).capacity;p.ammoByWeapon[p.weapon]=p.ammo;p.reloadUntil=0;}
 if(p.hp>0){const old={x:p.x,y:p.y,z:p.z};move(p,p.input,.05);wallWorlds.get(key).collide(p,old);}
 }
 for(let i=bleeds.length-1;i>=0;i--){const b=bleeds[i];if(b.room!==key)continue;const victim=room.get(b.target)||cans.find(c=>c.id===b.target);if(!victim||victim.hp<=0){bleeds.splice(i,1);continue;}if(now>=b.next){const killed=applyDamage(victim,5,now);if(killed&&room.get(b.shooter))room.get(b.shooter).kills++;b.left--;b.next+=400;broadcast(room,'bleed',{id:victim.id,damage:5,killed});if(killed||!b.left)bleeds.splice(i,1);}}
 for(let i=bullets.length-1;i>=0;i--){const bullet=bullets[i];if(bullet.room!==key)continue;const dt=Math.min(.1,(now-bullet.updatedAt)/1000);bullet.updatedAt=now;
  const clays=range.flights.map(f=>clayPose(f,now));
  for(const result of advanceProjectile(bullet,dt,[...room.values()].filter(p=>p.id!==bullet.shooter).concat(cans),clays,wallWorlds.get(key))){
   processImpact(room,range,cans,bullet,result,now);
  }
  if(!bullet.alive)bullets.splice(i,1);
 }broadcast(room,'state',{time:now,players:[...room.values()].map(publicPlayer),cans,clays:range.flights});
}},50);
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>{
 const port=server.address().port;console.log(`DUSTLINE ready at http://localhost:${port}`);
 try{for(const entries of Object.values(networkInterfaces()))for(const entry of entries||[])if(entry.family==='IPv4'&&!entry.internal)console.log(`Same-Wi-Fi join address: http://${entry.address}:${port}`);}
 catch{console.warn('Local network addresses are unavailable; the game server is still running.');}
});
