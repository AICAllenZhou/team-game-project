import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHandler, RedisStore} from '../api/multiplayer.mjs';

// This fake implements the store's atomic operations, with a controllable clock.
import {MemoryStore} from './memory-store.mjs';

function setup(options={}) {
  let time=1000,sequence=0,character=0;
  const clock=()=>time, store=new MemoryStore(clock);
  const handler=createHandler(store,{clock,uuid:()=>`id-${++sequence}`,integer:max=>Math.floor(character++/6)%max,adminCode:'0310',...options});
  return {store,advance:ms=>{time+=ms;},async call(body,status=200,extra={}) {
    const req=Readable.from(extra.raw===undefined?[]:[extra.raw]);req.method=extra.method||'POST';req.headers={host:'game.test','x-forwarded-for':'192.0.2.1',...extra.headers};if(extra.raw===undefined)req.body=body;
    let result;const response={setHeader(){},end(text){result=JSON.parse(text);}};
    await handler(req,response);assert.equal(response.statusCode,status,JSON.stringify(result));return result;
  }};
}
async function register(app,name='Player',createLobby=true) {if(createLobby&&!app.adminToken)app.adminToken=await login(app);return app.call({action:'register',name,createLobby,adminToken:app.adminToken});}
async function login(app) {return (await app.call({action:'adminLogin',code:'0310'})).adminToken;}

test('health, automatic unique codes, validated input and origin protection',async()=>{
  const app=setup();assert.deepEqual(await app.call(undefined,200,{method:'GET'}),{multiplayer:true,transport:'webrtc'});
  await app.call({action:'register',name:' '},400);await app.call({action:'register',name:'x'.repeat(17)},400);
  await app.call(null,400);await app.call(null,400,{raw:'{broken'});
  await app.call({action:'register',name:'Eve'},403,{headers:{origin:'https://other.test'}});
  const a=await register(app,'Alice'),b=await register(app,'Bob');assert.match(a.joinCode,/^[A-Z2-9]{6}$/);assert.notEqual(a.joinCode,b.joinCode);assert.equal(a.hostId,a.id);
  await app.call({action:'players'},403);await app.call({action:'heartbeat',token:'invalid'},401);
  const adminToken=await login(app), directory=await app.call({action:'players',adminToken});assert.equal(directory.rooms.length,2);
  for(const secret of [a.token,b.token,adminToken])assert.equal(JSON.stringify(directory).includes(secret),false);
  assert.equal(directory.rooms[0].players[0].name,'Alice');
});

test('regular players appear in the directory and only admins join, with two-player capacity',async()=>{
 const app=setup(),host=await register(app,'Host',false),guest=await register(app,'Guest',false),third=await register(app,'Third',false),adminToken=await login(app);
 assert.equal((await app.call({action:'players',adminToken})).rooms.length,3);
 await app.call({action:'join',token:guest.token,targetId:host.id},403);
 await app.call({action:'join',token:guest.token,joinCode:host.joinCode},403);
 const joined=await app.call({action:'join',token:guest.token,targetId:host.id,adminToken});assert.equal(joined.hostId,host.id);
 assert.equal((await app.call({action:'members',token:host.token})).players.length,2);
 assert.equal((await app.call({action:'join',token:third.token,targetId:host.id,adminToken},409)).code,'ROOM_FULL');
 const rooms=(await app.call({action:'players',adminToken})).rooms;assert.equal(rooms.length,2);assert.equal(rooms[0].players.length,2);
 assert.equal('joinCode' in rooms[0].players[0],false);
 await app.call({action:'leave',token:guest.token});await app.call({action:'join',token:third.token,targetId:host.id,adminToken});
});

test('host cannot abandon peers and room capacity is enforced',async()=>{
  const app=setup({roomCapacity:2}),a=await register(app,'A'),b=await register(app,'B'),c=await register(app,'C'),adminToken=await login(app);
  await app.call({action:'join',token:b.token,joinCode:a.joinCode,adminToken});
  assert.equal((await app.call({action:'join',token:a.token,joinCode:c.joinCode,adminToken},409)).code,'HOST_BUSY');
  assert.equal((await app.call({action:'join',token:c.token,joinCode:a.joinCode,adminToken},409)).code,'ROOM_FULL');
  await app.call({action:'host',token:b.token,adminToken});await app.call({action:'join',token:a.token,joinCode:c.joinCode,adminToken});
});

test('admin powers apply only to authenticated player and logout revokes access',async()=>{
  const app=setup(),owner=await register(app,'Owner'),other=await register(app,'Other'),adminToken=await login(app);
  await app.call({action:'adminPowers',token:owner.token,powers:{infiniteHp:true}},403);
  const result=await app.call({action:'adminPowers',token:owner.token,targetId:other.id,adminToken,powers:{infiniteHp:true,infiniteAmmo:true,noRecoil:true}});
  assert.deepEqual(result.powers,{noRecoil:true,infiniteAmmo:true,infiniteHp:true,noCooldown:false,fullAuto:false});
  assert.equal((await app.call({action:'heartbeat',token:other.token,powers:{infiniteHp:true}})).powers.infiniteHp,false);
  const ownerState=await app.call({action:'heartbeat',token:owner.token,hp:900,active:true});assert.equal(ownerState.powers.infiniteHp,true);
  await app.call({action:'adminLogout',adminToken});await app.call({action:'players',adminToken},403);
  await app.call({action:'adminLoadout',token:owner.token,allWeapons:true,adminToken},403);
});

test('signals stay between a player and their current host, drain once and reject stale mail',async()=>{
  const app=setup({roomCapacity:3}),host=await register(app,'Host'),a=await register(app,'A'),b=await register(app,'B'),outsider=await register(app,'Outside'),adminToken=await login(app);
  for(const guest of [a,b])await app.call({action:'join',token:guest.token,joinCode:host.joinCode,adminToken});
  const message={type:'offer',sdp:{type:'offer',sdp:'example'}};
  await app.call({action:'signal',token:a.token,targetId:outsider.id,message},403);
  await app.call({action:'signal',token:a.token,targetId:b.id,message},403);
  await app.call({action:'signal',token:a.token,targetId:host.id,message:{type:'game-state'}},400);
  await app.call({action:'signal',token:a.token,targetId:host.id,message:{type:'offer',sdp:'x'.repeat(65536)}},413);
  await app.call({action:'signal',token:a.token,targetId:host.id,from:outsider.id,message});
  assert.deepEqual((await app.call({action:'poll',token:host.token})).signals,[{from:a.id,message}]);
  assert.deepEqual((await app.call({action:'poll',token:host.token})).signals,[]);
  await app.call({action:'signal',token:a.token,targetId:host.id,message});
  await app.call({action:'host',token:a.token,adminToken});assert.deepEqual((await app.call({action:'poll',token:host.token})).signals,[]);
});

test('heartbeat extends session and code expiry; missing host is detected and hosting recovers',async()=>{
  const app=setup(),host=await register(app,'Host'),guest=await register(app,'Guest'),adminToken=await login(app);
  await app.call({action:'join',token:guest.token,joinCode:host.joinCode,adminToken});app.advance(60_000);await app.call({action:'heartbeat',token:guest.token,active:true});
  app.advance(31_000);assert.equal((await app.call({action:'heartbeat',token:guest.token},409)).code,'HOST_OFFLINE');
  const list=await app.call({action:'players',adminToken});assert.equal(list.rooms.flatMap(r=>r.players).length,0);
  await app.call({action:'heartbeat',token:host.token},401);await app.call({action:'join',token:guest.token,joinCode:host.joinCode,adminToken},404);
  assert.equal((await app.call({action:'host',token:guest.token,adminToken})).hostId,guest.id);
  const newcomer=await register(app,'New');await app.call({action:'join',token:newcomer.token,joinCode:guest.joinCode,adminToken});
  await app.call({action:'leave',token:newcomer.token});await app.call({action:'heartbeat',token:newcomer.token},401);
  app.advance(8*60*60*1000);await app.call({action:'players',adminToken},403);
});

test('admin guessing and directory capacity are limited',async()=>{
  const app=setup({maxPlayers:1});await register(app,'Player',false);
  assert.equal((await app.call({action:'register',name:'Next'},503)).code,'DIRECTORY_FULL');
  for(let i=0;i<5;i++)await app.call({action:'adminLogin',code:'bad'},403);
  await app.call({action:'adminLogin',code:'0310'},429);app.advance(60_001);await login(app);
});

test('Redis REST uses server credentials, bounds requests and hides provider errors',async()=>{
  const calls=[];const store=new RedisStore('https://redis.example/', 'secret-token',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({result:'"value"'})};});
  assert.equal(await store.get('example'),'value');assert.equal(calls[0].url,'https://redis.example');assert.equal(calls[0].options.headers.Authorization,'Bearer secret-token');assert.deepEqual(JSON.parse(calls[0].options.body),['GET','dustline:lan:v1:example']);assert.ok(calls[0].options.signal);
  const handler=createHandler(null);let status,body;await handler({method:'GET',headers:{}},{set statusCode(v){status=v;},setHeader(){},end(v){body=JSON.parse(v);}});assert.equal(status,503);assert.equal(body.code,'NOT_CONFIGURED');
});

test('admin loadouts are validated and cookie resets target only the selected player until acknowledged',async()=>{
 const app=setup(),a=await register(app,'A',false),b=await register(app,'B',false),adminToken=await login(app);
 await app.call({action:'adminLoadout',token:a.token,allWeapons:true},403);
 await app.call({action:'adminLoadout',token:a.token,adminToken,weapon:'shotgun',mod:'bad'},400);
 const first=await app.call({action:'adminLoadout',token:a.token,adminToken,targetId:b.id,allWeapons:true});assert.equal(first.loadout.hasShotgun,true);
 const second=await app.call({action:'adminLoadout',token:a.token,adminToken,weapon:'shotgun',mod:'slug'});assert.equal(second.loadout.mods.shotgun,'slug');assert.equal(second.loadout.hasShotgun,true);assert.notEqual(second.loadout.revision,first.loadout.revision);
 assert.equal((await app.call({action:'heartbeat',token:b.token})).loadout,undefined);
 await app.call({action:'adminPowers',token:a.token,adminToken,powers:{noCooldown:true,fullAuto:true}});
 assert.equal((await app.call({action:'heartbeat',token:a.token})).powers.noCooldown,true);
 await app.call({action:'adminResetCookie',token:a.token,targetId:b.id},403);
 await app.call({action:'adminResetCookie',adminToken,targetId:b.id});
 const commands=(await app.call({action:'poll',token:b.token})).commands;assert.equal(commands[0].type,'resetCookie');
 assert.deepEqual((await app.call({action:'poll',token:a.token})).commands,[]);
 await app.call({action:'ackCookieReset',token:a.token,id:commands[0].id,targetId:b.id});
 await app.call({action:'ackCookieReset',token:b.token,id:'stale'});assert.deepEqual((await app.call({action:'poll',token:b.token})).commands,commands);
 await app.call({action:'ackCookieReset',token:b.token,id:commands[0].id});assert.deepEqual((await app.call({action:'poll',token:b.token})).commands,[]);
 await app.call({action:'adminResetCookie',adminToken,targetId:b.id});assert.notEqual((await app.call({action:'poll',token:b.token})).commands[0].id,commands[0].id);
});


test('only a verified admin can change the current P2P host map',async()=>{
 const app=setup(),host=await register(app,'Host'),guest=await register(app,'Admin'),adminToken=await login(app);
 await app.call({action:'adminMap',token:host.token,mapId:'duel'},403);
 await app.call({action:'join',token:guest.token,targetId:host.id,adminToken});
 await app.call({action:'adminMap',token:guest.token,mapId:'invalid',adminToken},400);
 const result=await app.call({action:'adminMap',token:guest.token,mapId:'duel',adminToken});assert.equal(result.mapConfig.id,'duel');
 const heartbeat=await app.call({action:'heartbeat',token:host.token});assert.equal(heartbeat.mapConfig.revision,result.mapConfig.revision);
 const guestState=await app.call({action:'heartbeat',token:guest.token});assert.equal(guestState.mapConfig,undefined);
});
