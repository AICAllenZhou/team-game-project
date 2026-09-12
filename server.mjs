import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {move,traceShot,firingMode,resolveBarrelShot} from './simulation.mjs';
const rooms=new Map(),sessions=new Map();
const spawn=()=>({x:(Math.random()-.5)*36,z:(Math.random()-.5)*36,y:0,vy:0,vx:0,vz:0});
const send=(res,event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
function publicPlayer(p){const {id,name,x,y,z,yaw,pitch,gunYaw,gunPitch,hp,ammo,kills,deaths,reloadUntil,deadUntil,color}=p;return {id,name,x,y,z,yaw,pitch,gunYaw,gunPitch,hp,ammo,kills,deaths,reloadUntil,deadUntil,color};}
function broadcast(room,event,data){for(const p of room.values())if(p.stream)send(p.stream,event,data);}
function remove(p){p.stream?.end();sessions.delete(p.token);const room=rooms.get(p.room);room?.delete(p.id);if(!room?.size)rooms.delete(p.room);}
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'&&url.pathname.startsWith('/api/')){
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.writeHead(403).end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){res.writeHead(413).end();return;}}
  let data;try{data=JSON.parse(body);}catch{res.writeHead(400).end();return;}
  if(url.pathname==='/api/join'){
   const key=String(data.room||'frontier').replace(/[^a-z0-9-]/gi,'').slice(0,24).toLowerCase()||'frontier';
   if(sessions.size>=128){res.writeHead(503).end('Server full');return;}
   if(!rooms.has(key))rooms.set(key,new Map());const room=rooms.get(key);
   if(room.size>=12){res.writeHead(409).end('Room full (12 players)');return;}
   const p={id:randomUUID(),token:randomUUID(),room:key,name:String(data.name||'Drifter').slice(0,16),...spawn(),yaw:0,pitch:0,gunYaw:0,gunPitch:0,hp:100,ammo:6,kills:0,deaths:0,reloadUntil:0,deadUntil:0,lastShot:0,lastSeen:Date.now(),input:{},color:[0xc17a47,0x658c91,0x96799c,0x879466][room.size%4]};room.set(p.id,p);sessions.set(p.token,p);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({token:p.token,id:p.id,room:key}));return;
  }
  const p=sessions.get(data.token);if(!p){res.writeHead(401).end();return;}p.lastSeen=Date.now();const now=Date.now(),room=rooms.get(p.room);
  if(url.pathname==='/api/input'){p.input={x:data.x,z:data.z,yaw:data.yaw,pitch:data.pitch,jump:!!data.jump};p.gunYaw=Number.isFinite(data.gunYaw)?data.gunYaw:p.yaw;p.gunPitch=Math.max(-1.35,Math.min(1.35,Number.isFinite(data.gunPitch)?data.gunPitch:p.pitch));}
  else if(url.pathname==='/api/reload'&&p.hp>0&&!p.reloadUntil&&p.ammo<6)p.reloadUntil=now+1800;
  else if(url.pathname==='/api/fire'&&p.hp>0&&!p.reloadUntil&&p.ammo>0&&firingMode(now,p.lastShot,data.fan).ready){
   const ray=resolveBarrelShot(p,data);if(!ray){res.writeHead(400).end('Invalid muzzle pose');return;}
   const fan=firingMode(now,p.lastShot,data.fan).fan;
   // Use the displayed barrel pose at the instant of firing, not a stale input tick.
   if(Number.isFinite(data.gunYaw))p.gunYaw=data.gunYaw;
   if(Number.isFinite(data.gunPitch))p.gunPitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,data.gunPitch));
   p.lastShot=now;p.ammo--;const {origin,direction}=ray;
   const result=traceShot(origin,direction,[...room.values()].filter(other=>other!==p));
   const victim=result.hit?room.get(result.hit):null;
   if(victim){victim.hp=Math.max(0,victim.hp-34);if(!victim.hp){victim.deaths++;p.kills++;victim.deadUntil=now+3000;victim.input={};}}
   broadcast(room,'shot',{id:p.id,origin,direction,...result,fan,shotId:typeof data.shotId==='string'?data.shotId.slice(0,64):null});
  }
  res.writeHead(204).end();return;
 }
 if(req.method==='GET'&&url.pathname==='/api/events'){
  const p=sessions.get(url.searchParams.get('token'));if(!p){res.writeHead(401).end();return;}
  p.stream?.end();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');p.stream=res;
  req.on('close',()=>{if(p.stream===res)p.stream=null;});return;
 }
 const files={'/':'index.html','/index.html':'index.html','/game.js':'game.js','/game-loop.js':'game-loop.js','/render-batches.js':'render-batches.js','/weapon-pose.js':'weapon-pose.js','/weapon-audio.js':'weapon-audio.js','/simulation.mjs':'simulation.mjs','/style.css':'style.css','/vendor/three.module.js':'vendor/three.module.js','/vendor/three.core.js':'vendor/three.core.js'};
 for(const i of [1,2,3])files['/assets/audio/revolver-'+i+'.wav']='assets/audio/revolver-'+i+'.wav';
 const file=files[url.pathname];if(!file||req.method!=='GET'){res.writeHead(404).end('Not found');return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.wav')?'audio/wav':'text/javascript');res.end(await readFile(fileURLToPath(new URL(file,import.meta.url))));
 }catch(e){console.error(e.message);if(!res.headersSent)res.writeHead(500);res.end();}
});
setInterval(()=>{const now=Date.now();for(const room of rooms.values()){
 for(const p of room.values()){
 if(now-p.lastSeen>15000){remove(p);continue;}
 if(p.deadUntil&&now>=p.deadUntil){Object.assign(p,spawn(),{hp:100,ammo:6,deadUntil:0,reloadUntil:0});}
 if(p.reloadUntil&&now>=p.reloadUntil){p.ammo=6;p.reloadUntil=0;}
 if(p.hp>0)move(p,p.input,.05);
 }broadcast(room,'state',{time:now,players:[...room.values()].map(publicPlayer)});
}},50);
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`DUSTLINE ready at http://localhost:${server.address().port}`));
