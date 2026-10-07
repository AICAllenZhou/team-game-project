import {randomInt, randomUUID} from 'node:crypto';
import {adminLoadout} from '../admin-gameplay.mjs';

const PREFIX = 'dustline:lan:v1:';
const SESSION_MS = 90_000;
const ADMIN_MS = 8 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_BODY_BYTES = MAX_MESSAGE_BYTES + 4096;
const defaultPowers = () => ({noRecoil:false, infiniteAmmo:false, infiniteHp:false,noCooldown:false,fullAuto:false});
const fail = (status, error, code) => Object.assign(new Error(error), {status, code});
const publicPlayer = p => ({id:p.id, name:p.name, hostId:p.hostId, active:p.active, hp:p.hp, powers:p.powers,mapConfig:p.mapConfig,loadout:p.loadout,cookieResetPending:!!p.cookieReset&&p.cookieReset!==p.cookieResetAck});
const sessionResult = p => ({id:p.id, joinCode:p.joinCode, lobbyCode:p.lobbyCode||'', isLobby:p.isLobby===true, hostId:p.hostId, powers:p.powers,mapConfig:p.mapConfig,loadout:p.loadout});

// The shared directory contains only connection metadata. Game frames travel over WebRTC.
export class RedisStore {
  constructor(url, token, request = fetch) {
    this.url = url.replace(/\/$/, ''); this.token = token; this.request = request;
  }
  async command(...command) {
    const response = await this.request(this.url, {method:'POST', headers:{Authorization:`Bearer ${this.token}`, 'Content-Type':'application/json'}, body:JSON.stringify(command), signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Shared directory unavailable');
    const result = await response.json();
    if (result.error) throw new Error('Shared directory unavailable');
    return result.result;
  }
  eval(script, keys, args=[]) { return this.command('EVAL', script, keys.length, ...keys, ...args); }
  async get(key) { const value = await this.command('GET', PREFIX + key); return value === null ? null : JSON.parse(value); }
  async playerForToken(token) {
    const value=await this.eval("local encoded=redis.call('GET',KEYS[1]); if not encoded then return false end; return redis.call('GET',ARGV[1]..cjson.decode(encoded))",[PREFIX+'token:'+token],[PREFIX+'player:']);
    return value ? JSON.parse(value) : null;
  }
  set(key, value, ttl) { return this.command('SET', PREFIX + key, JSON.stringify(value), 'PX', ttl); }
  delete(key) { return this.command('DEL', PREFIX + key); }
  count(key, ttl) {
    return this.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n", [PREFIX+key], [ttl]);
  }
  async listPlayers(now) {
    const values = await this.eval("redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); local ids=redis.call('ZRANGE',KEYS[1],0,-1); if #ids==0 then return {} end; local keys={}; for _,id in ipairs(ids) do table.insert(keys,ARGV[2]..id) end; local out={}; for i,p in ipairs(redis.call('MGET',unpack(keys))) do if p then table.insert(out,p) else redis.call('ZREM',KEYS[1],ids[i]) end end; return out", [PREFIX+'presence'], [now, PREFIX+'player:']);
    return values.map(value=>JSON.parse(value));
  }
  async register(player, now, ttl, maxPlayers) {
    return this.eval("redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[5]) then return 'FULL' end; if redis.call('EXISTS',KEYS[4])==1 then return 'COLLISION' end; redis.call('SET',KEYS[2],ARGV[3],'PX',ARGV[2]); redis.call('SET',KEYS[3],cjson.encode(ARGV[4]),'PX',ARGV[2]); redis.call('SET',KEYS[4],cjson.encode(ARGV[4]),'PX',ARGV[2]); redis.call('ZADD',KEYS[1],tonumber(ARGV[1])+tonumber(ARGV[2]),ARGV[4]); return 'OK'", [PREFIX+'presence', PREFIX+'player:'+player.id, PREFIX+'token:'+player.token, PREFIX+'code:'+player.joinCode], [now, ttl, JSON.stringify(player), player.id, maxPlayers]);
  }
  async change(playerId, kind, data, now, ttl, capacity=12) {
    // A single transaction prevents simultaneous joins from overfilling a room or moving its host.
    const result = await this.eval(`
local raw=redis.call('GET',KEYS[1]); if not raw then return {'MISSING'} end
local p=cjson.decode(raw); local kind=ARGV[1]; local data=cjson.decode(ARGV[2]); local prefix=ARGV[5]
if kind=='heartbeat' then
  if p.hostId~=p.id and redis.call('EXISTS',prefix..'player:'..p.hostId)==0 then return {'HOST_OFFLINE'} end
  p.active=data.active; p.hp=data.hp
elseif kind=='powers' then p.powers=data
elseif kind=='map' then p.mapConfig=data
elseif kind=='loadout' then p.loadout=data
elseif kind=='cookieReset' then p.cookieReset=data.id
elseif kind=='cookieResetAck' then if p.cookieReset==data.id then p.cookieResetAck=data.id end
elseif kind=='join' or kind=='host' then
  local hostId=p.id
  if kind=='join' then
    local targetRaw=redis.call('GET',prefix..'player:'..data.targetId); if not targetRaw then return {'TARGET_MISSING'} end
    local target=cjson.decode(targetRaw); hostId=target.hostId
    local hostRaw=redis.call('GET',prefix..'player:'..hostId); if not hostRaw then return {'HOST_OFFLINE'} end
    local host=cjson.decode(hostRaw); if host.hostId~=host.id or host.isLobby~=true then return {'HOST_OFFLINE'} end
    p.lobbyCode=host.joinCode
  else
    p.isLobby=true; p.lobbyCode=p.joinCode
  end
  if hostId~=p.hostId then
    local members=0
    local ids=redis.call('ZRANGEBYSCORE',KEYS[2],ARGV[3],'+inf'); local keys={}
    for _,id in ipairs(ids) do table.insert(keys,prefix..'player:'..id) end
    if #keys>0 then
      for _,otherRaw in ipairs(redis.call('MGET',unpack(keys))) do
        if otherRaw then local other=cjson.decode(otherRaw)
          if other.id~=p.id and other.hostId==p.id then return {'HOST_BUSY'} end
          if other.id~=p.id and other.hostId==hostId then members=members+1 end
        end
      end
    end
    if members>=tonumber(ARGV[6]) then return {'ROOM_FULL'} end
  end
  if p.hostId~=hostId then redis.call('DEL',prefix..'mailbox:'..p.id) end
  p.hostId=hostId
end
p.lastSeen=tonumber(ARGV[3]); local encoded=cjson.encode(p)
redis.call('SET',KEYS[1],encoded,'PX',ARGV[4]); redis.call('SET',prefix..'token:'..p.token,cjson.encode(p.id),'PX',ARGV[4]); redis.call('SET',prefix..'code:'..p.joinCode,cjson.encode(p.id),'PX',ARGV[4]); redis.call('ZADD',KEYS[2],tonumber(ARGV[3])+tonumber(ARGV[4]),p.id)
return {'OK',encoded}`, [PREFIX+'player:'+playerId, PREFIX+'presence'], [kind, JSON.stringify(data), now, ttl, PREFIX, capacity]);
    return {status:result[0], player:result[1] ? JSON.parse(result[1]) : undefined};
  }
  async remove(id) {
    return this.eval("local raw=redis.call('GET',KEYS[1]); if raw then local p=cjson.decode(raw); redis.call('DEL',KEYS[1],ARGV[1]..'token:'..p.token,ARGV[1]..'code:'..p.joinCode,ARGV[1]..'mailbox:'..p.id) end; redis.call('ZREM',KEYS[2],ARGV[2]); return 1", [PREFIX+'player:'+id, PREFIX+'presence'], [PREFIX,id]);
  }
  push(id, value, ttl) {
    return this.eval("if redis.call('LLEN',KEYS[1])>=256 then return 0 end; redis.call('RPUSH',KEYS[1],ARGV[1]); redis.call('PEXPIRE',KEYS[1],ARGV[2]); return 1", [PREFIX+'mailbox:'+id], [JSON.stringify(value),ttl]);
  }
  async drain(id) {
    const items=await this.eval("local items=redis.call('LRANGE',KEYS[1],0,-1); redis.call('DEL',KEYS[1]); return items", [PREFIX+'mailbox:'+id]);
    return items.map(item=>JSON.parse(item));
  }
}

function changeError(status) {
  const errors={MISSING:[401,'Your player session expired. Press Play again.'], TARGET_MISSING:[404,'That player is no longer available. Refresh the player list.'], HOST_OFFLINE:[409,'That host is offline. Ask them to press Play and keep the game open.'], HOST_BUSY:[409,'Another player is connected to your game. Leave before joining someone else.'], ROOM_FULL:[409,'That game is full (2 players).']};
  const [http,message]=errors[status]||[503,'The player directory is temporarily unavailable.'];
  return fail(http,message,status);
}

async function readBody(req) {
  let value=req.body;
  if (value===undefined) {
    const chunks=[]; let length=0;
    for await (const chunk of req) { length+=Buffer.byteLength(chunk); if(length>MAX_BODY_BYTES) throw fail(413,'Request is too large.'); chunks.push(Buffer.from(chunk)); }
    value=Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value=value.toString('utf8');
  if (typeof value==='string') {
    if(Buffer.byteLength(value)>MAX_BODY_BYTES) throw fail(413,'Request is too large.');
    try { value=JSON.parse(value); } catch { throw fail(400,'Send a valid JSON request.'); }
  }
  if (!value || typeof value!=='object' || Array.isArray(value)) throw fail(400,'Send a JSON object.');
  if (Buffer.byteLength(JSON.stringify(value))>MAX_BODY_BYTES) throw fail(413,'Request is too large.');
  return value;
}

export function createHandler(store, {clock=Date.now, uuid=randomUUID, integer=randomInt, adminCode=process.env.ADMIN_CODE||'0310', sessionMs=SESSION_MS, maxPlayers=128, roomCapacity=2}={}) {
  return async (req,res) => {
    const reply=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
    try {
      if(req.headers.origin) {
        let origin; try { origin=new URL(req.headers.origin); } catch { throw fail(403,'This origin is not allowed.'); }
        if(!['http:','https:'].includes(origin.protocol)||origin.host!==req.headers.host) throw fail(403,'This origin is not allowed.');
      }
      if(!store) throw fail(503,'Online players are unavailable until the shared player directory is connected.','NOT_CONFIGURED');
      if(req.method==='GET') return reply(200,{multiplayer:true,transport:'webrtc'});
      if(req.method!=='POST') throw fail(405,'Use GET or POST.');
      const data=await readBody(req), now=clock();
      const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,100);
      const limit=async(key,max,ttl)=>{if(await store.count(key,ttl)>max)throw fail(429,'Too many requests. Please try again shortly.','RATE_LIMITED');};
      const admin=async()=>{if(typeof data.adminToken!=='string'||!await store.get('admin:'+data.adminToken))throw fail(403,'Unlock the admin panel first.','ADMIN_REQUIRED');};
      const authenticate=async()=>{
        if(typeof data.token!=='string'||data.token.length>100) throw fail(401,'Your player session expired. Join again.','MISSING');
        const player=await store.playerForToken(data.token);
        if(!player) throw fail(401,'Your player session expired. Join again.','MISSING');
        return player;
      };
      const change=async(p,kind,patch)=>{const result=await store.change(p.id,kind,patch,now,sessionMs,roomCapacity);if(result.status!=='OK')throw changeError(result.status);return result.player;};
      if(data.action==='register') {
        await limit('rate:register:'+ip,30,60_000);
        if(typeof data.name!=='string')throw fail(400,'Enter a username between 1 and 16 characters.');
        const name=data.name.trim();
        if(!name||name.length>16||/[\x00-\x1f\x7f]/.test(name))throw fail(400,'Enter a username between 1 and 16 characters.');
        const isLobby=true;
        for(let attempt=0;attempt<12;attempt++) {
          const id=uuid(),token=uuid(),joinCode=Array.from({length:6},()=>ALPHABET[integer(ALPHABET.length)]).join('');
          const player={id,token,joinCode,name,isLobby,lobbyCode:isLobby?joinCode:'',hostId:id,active:false,hp:100,powers:defaultPowers(),lastSeen:now};
          const status=await store.register(player,now,sessionMs,maxPlayers);
          if(status==='OK')return reply(200,{token,...sessionResult(player)});
          if(status==='FULL')throw fail(503,'The player directory is full. Try again shortly.','DIRECTORY_FULL');
        }
        throw fail(503,'Could not assign a player code. Try again.');
      }
      if(data.action==='adminLogin') {
        await limit('rate:admin:'+ip,5,60_000);
        if(typeof data.code!=='string'||data.code!==adminCode)throw fail(403,'Incorrect admin code.','BAD_ADMIN_CODE');
        const adminToken=uuid();await store.set('admin:'+adminToken,{createdAt:now},ADMIN_MS);
        return reply(200,{adminToken});
      }
      if(data.action==='adminLogout') {await admin();await store.delete('admin:'+data.adminToken);return reply(200,{ok:true});}
      if(data.action==='players') {
        await admin();const rooms=new Map();
        const players=await store.listPlayers(now),hosts=new Set(players.filter(p=>p.isLobby&&p.hostId===p.id).map(p=>p.id));
        for(const p of players) {if(!hosts.has(p.hostId))continue;if(!rooms.has(p.hostId))rooms.set(p.hostId,{name:p.hostId,players:[]});rooms.get(p.hostId).players.push(publicPlayer(p));}
        return reply(200,{rooms:[...rooms.values()]});
      }
      if(data.action==='adminResetCookie'){
        await admin();await limit('rate:cookieReset:'+ip,30,60_000);
        if(typeof data.targetId!=='string'||data.targetId.length>100)throw fail(400,'Invalid player.');
        const target=await store.get('player:'+data.targetId);if(!target)throw changeError('TARGET_MISSING');
        await change(target,'cookieReset',{id:uuid()});return reply(200,{ok:true});
      }
      const player=await authenticate();
      await limit('rate:session:'+player.id,360,60_000);
      if(data.action==='heartbeat') {
        const hp=Number.isFinite(data.hp)?Math.max(0,Math.min(100,data.hp)):player.hp;
        const next=await change(player,'heartbeat',{active:typeof data.active==='boolean'?data.active:player.active,hp});
        return reply(200,sessionResult(next));
      }
      if(data.action==='adminMap'){
        await admin();if(!['practice','duel'].includes(data.mapId))throw fail(400,'Invalid map.');
        const host=await store.get('player:'+player.hostId);if(!host)throw changeError('HOST_OFFLINE');
        const next=await change(host,'map',{id:data.mapId,revision:uuid(),changedAt:now});return reply(200,{mapConfig:next.mapConfig});
      }
      if(data.action==='adminPowers') {
        await admin();const powers={};for(const key of Object.keys(defaultPowers()))powers[key]=data.powers?.[key]===true;
        const next=await change(player,'powers',powers);return reply(200,{powers:next.powers});
      }
      if(data.action==='adminLoadout'){
        await admin();let loadout;
        try{loadout=adminLoadout(player.loadout,data,uuid());}catch{throw fail(400,'Invalid ammo.');}
        const next=await change(player,'loadout',loadout);return reply(200,{loadout:next.loadout});
      }
      if(data.action==='ackCookieReset'){
        if(typeof data.id!=='string'||data.id.length>100)throw fail(400,'Invalid reset.');
        await change(player,'cookieResetAck',{id:data.id});return reply(200,{ok:true});
      }
      if(data.action==='join') {
        await admin();
        let targetId;
        if(data.targetId!==undefined) {if(typeof data.targetId!=='string'||data.targetId.length>100)throw fail(400,'Invalid target player.');targetId=data.targetId;}
        else {if(typeof data.joinCode!=='string'||!/^[a-z0-9]{6}$/i.test(data.joinCode.trim()))throw fail(400,'Enter a six-character player code.');targetId=await store.get('code:'+data.joinCode.trim().toUpperCase());}
        if(!targetId)throw changeError('TARGET_MISSING');
        const next=await change(player,'join',{targetId}), host=await store.get('player:'+next.hostId);
        return reply(200,{...sessionResult(next),hostName:host?.name||'Host'});
      }
      if(data.action==='host') {await admin();const next=await change(player,'host',{});return reply(200,{...sessionResult(next),hostName:next.name});}
      if(data.action==='members') {
        if(player.hostId!==player.id&&!await store.get('player:'+player.hostId))throw changeError('HOST_OFFLINE');
        const players=(await store.listPlayers(now)).filter(p=>p.hostId===player.hostId).map(publicPlayer);
        return reply(200,{players});
      }
      if(data.action==='signal') {
        await limit('rate:signal:'+player.id,300,60_000);
        if(typeof data.targetId!=='string'||data.targetId.length>100)throw fail(400,'Invalid signal target.');
        const target=await store.get('player:'+data.targetId);
        if(!target)throw changeError('TARGET_MISSING');
        if(target.id===player.id||target.hostId!==player.hostId||(player.id!==player.hostId&&target.id!==player.hostId))throw fail(403,'Signals can only connect a player and their host.','WRONG_ROOM');
        const message=data.message;
        if(!message||typeof message!=='object'||Array.isArray(message)||!['offer','answer','ice'].includes(message.type))throw fail(400,'Invalid connection message.');
        if(Buffer.byteLength(JSON.stringify(message))>MAX_MESSAGE_BYTES)throw fail(413,'Connection message is too large.');
        if(!await store.push(target.id,{from:player.id,message},sessionMs))throw fail(429,'The connection message queue is full. Try again shortly.');
        return reply(200,{ok:true});
      }
      if(data.action==='poll') {
        const signals=[];
        for(const envelope of await store.drain(player.id)) {
          const sender=await store.get('player:'+envelope.from);
          if(sender&&sender.hostId===player.hostId&&(sender.id===player.hostId||player.id===player.hostId))signals.push(envelope);
        }
        const commands=player.cookieReset&&player.cookieReset!==player.cookieResetAck?[{type:'resetCookie',id:player.cookieReset}]:[];
        return reply(200,{signals,commands});
      }
      if(data.action==='leave') {await store.remove(player.id);return reply(200,{ok:true});}
      throw fail(400,'Unknown multiplayer action.');
    } catch(error) {
      reply(error.status||503,{error:error.status?error.message:'The player directory is temporarily unavailable. Please try again.',...(error.code?{code:error.code}:{})});
    }
  };
}

let configuredHandler;
export default async function handler(req,res) {
  if(!configuredHandler) {
    const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
    const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
    configuredHandler=createHandler(url&&token?new RedisStore(url,token):null);
  }
  return configuredHandler(req,res);
}
