import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanClient,directory} from '../lan-client.js';
import {createRoomEngine} from '../room-engine.mjs';

function network({blocked=false}={}){
 const connections=new Map(),configs=[];let sequence=0;
 class Channel{
  constructor(){this.label='dustline';this.readyState='connecting';this.bufferedAmount=0;}
  send(data){if(this.readyState!=='open')throw Error('closed');const other=this.other;queueMicrotask(()=>other.onmessage?.({data}));}
  close(){if(this.readyState==='closed')return;this.readyState='closed';queueMicrotask(()=>this.onclose?.());if(this.other&&this.other.readyState!=='closed')this.other.close();}
 }
 class RTC{
  constructor(config){this.id=String(++sequence);configs.push(config);connections.set(this.id,this);this.connectionState='new';}
  createDataChannel(){this.channel=new Channel();return this.channel;}
  async createOffer(){return {type:'offer',sdp:this.id};}
  async createAnswer(){return {type:'answer',sdp:this.id};}
  async setLocalDescription(description){this.localDescription=description;}
  async setRemoteDescription(description){
   this.remoteDescription=description;this.other=connections.get(description.sdp);this.other.other=this;
   if(description.type==='offer'){
    this.channel=new Channel();this.channel.other=this.other.channel;this.other.channel.other=this.channel;
    queueMicrotask(()=>this.ondatachannel?.({channel:this.channel}));
   }else if(!blocked){
    queueMicrotask(()=>{
     for(const pc of [this.other,this]){pc.connectionState='connected';pc.channel.readyState='open';pc.channel.onopen?.();pc.onconnectionstatechange?.();}
    });
   }
  }
  async addIceCandidate(){}
  close(){this.connectionState='closed';this.channel?.close();this.onconnectionstatechange?.();}
 }
 return {RTC,configs};
}

function cloud(){
 let sequence=0;const players=new Map(),queues=new Map();
 const copy=value=>JSON.parse(JSON.stringify(value));
 const request=async(action,data={})=>{
  if(action==='register'){
   if(data.createLobby&&data.adminToken!=='admin')throw Object.assign(Error('Admin required'),{status:403});
   const id='player-'+(++sequence),player={id,token:'token-'+id,name:data.name,joinCode:'CODE'+sequence,hostId:id,isLobby:true,lobbyCode:'CODE'+sequence,powers:{noRecoil:false,infiniteAmmo:false,infiniteHp:false}};
   players.set(player.token,player);queues.set(id,[]);return copy(player);
  }
  const player=players.get(data.token);if(!player)throw Object.assign(Error('Session expired'),{status:401});
  if(action==='leave'){players.delete(data.token);return {};}
  if(action==='join'){
   if(data.adminToken!=='admin')throw Object.assign(Error('Admin required'),{status:403});
   const target=[...players.values()].find(other=>data.targetId?other.id===data.targetId:other.joinCode===data.joinCode);
   if(!target)throw Error('Code not found');
   const host=[...players.values()].find(p=>p.id===target.hostId);if(!host?.isLobby)throw Error('Lobby closed');
   if(player.hostId!==target.hostId&&[...players.values()].filter(p=>p.hostId===target.hostId).length>=2)throw Error('Lobby full');
   if(player.hostId===player.id&&target.hostId!==player.id&&[...players.values()].some(other=>other.id!==player.id&&other.hostId===player.id))throw Error('Other players are using your hosted game');
   player.hostId=target.hostId;player.lobbyCode=host.joinCode;return copy(player);
  }
  if(action==='host'){player.hostId=player.id;return copy(player);}
  if(action==='members')return {players:copy([...players.values()].filter(other=>other.hostId===player.id))};
  if(action==='heartbeat')return copy(player);
  if(action==='signal'){
   const target=[...players.values()].find(other=>other.id===data.targetId);
   if(!target||target.hostId!==player.hostId)throw Error('Not in same game');
   queues.get(target.id).push(copy({from:player.id,message:data.message}));return {};
  }
  if(action==='poll'){const signals=queues.get(player.id)||[];queues.set(player.id,[]);return {signals,commands:player.cookieReset?[{type:'resetCookie',id:player.cookieReset}]:[]};}
  if(action==='ackCookieReset'){if(data.id===player.cookieReset)delete player.cookieReset;return {};}
  throw Error('Unexpected action '+action);
 };
 return {request,players};
}

function engineFactory(options){
 const positions=[10,5,10,-5].map(value=>value/36+.5);
 return createRoomEngine({...options,random:()=>positions.shift()??.5});
}
async function until(check){
 const deadline=Date.now()+1500;
 while(!check()){if(Date.now()>deadline)throw Error('Timed out waiting for LAN state');await new Promise(resolve=>setTimeout(resolve,5));}
}
function fixture(t,settings={}){
 const backend=cloud(),transport=network(settings),clients=[];
 const create=(extra={})=>{const client=createLanClient({request:backend.request,RTC:transport.RTC,engineFactory,timing:{poll:5,guestPoll:5,connectingPoll:5,members:100,heartbeat:100,connect:settings.blocked?80:1000},...extra});clients.push(client);return client;};
 t.after(()=>clients.forEach(client=>client.close()));
 return {...backend,...transport,create};
}

test('LAN peers exchange real engine state and sender-bound combat without a relay',async t=>{
 const {create,configs,players}=fixture(t),events=[];
 const host=create(),guest=create({onEvent:(event,data)=>events.push({event,data})});
 const first=await host.start({name:'Host',createLobby:true,adminToken:'admin'});
 assert.equal(first.initialState.players.length,1);assert.equal(first.initialState.cans.length,3);assert.ok(Array.isArray(first.wallState));
 await guest.start({name:'Guest'});
 const joined=await guest.join({targetId:first.id,adminToken:'admin'}),second=joined;
 assert.equal(joined.lobbyCode,first.joinCode);assert.equal(joined.hostId,first.id);
 assert.equal(joined.initialState.cans.length,3);
 assert.deepEqual(joined.initialState.players.map(player=>player.name),['Host','Guest']);
 assert.ok(configs.every(config=>config.iceServers.length===0),'no public STUN or TURN service');

 assert.equal(await guest.command('input',{active:false,id:first.id,powers:{infiniteHp:true}}),null);
 await assert.rejects(guest.command('powers',{infiniteHp:true}),/Invalid game command/);
 await guest.command('fire',{id:first.id,muzzle:{x:10,y:1.6,z:-5},direction:{x:0,y:0,z:1}});
 await until(()=>events.some(event=>event.event==='state'&&event.data.players.find(player=>player.id===first.id)?.hp===0));
 assert.equal(events.find(event=>event.event==='shot').data.id,second.id);
 assert.ok(events.some(event=>event.event==='impact'&&event.data.shooter===second.id));
 assert.equal(guest.session().initialState.players.find(player=>player.id===second.id).kills,1);

 players.get(second.token).powers={infiniteHp:true,infiniteAmmo:true,noRecoil:true};
 players.get(second.token).loadout={revision:'grant-1',hasShotgun:true,mods:{shotgun:'slug'}};
 const powered=await guest.refreshOwnPowers();
 assert.equal(powered.hasShotgun,true);assert.equal(powered.mods.shotgun,'slug');
 players.get(second.token).cookieReset='reset-1';await until(()=>events.some(event=>event.event==='resetCookie'));
 await until(()=>!players.get(second.token).cookieReset);
 assert.equal(players.get(first.token).cookieReset,undefined);
 assert.equal(powered.id,second.id);assert.equal(powered.powers.infiniteHp,true);assert.equal(powered.ammo,6);
 assert.equal(host.session().initialState.players.find(player=>player.id===first.id).powers.infiniteHp,false);
});

test('admin joins a selected player without a code and host departure closes the guest',async t=>{
 const {create}=fixture(t),disconnects=[];
 const host=create(),admin=create({onDisconnect:message=>disconnects.push(message)});
 const first=await host.start({name:'Player',createLobby:true,adminToken:'admin'}),second=await admin.start({name:'Admin',createLobby:true,adminToken:'admin'});
 const joined=await admin.join({targetId:first.id,adminToken:'admin'});
 assert.equal(joined.hostId,first.id);assert.equal(joined.joinCode,second.joinCode);
 host.close();await until(()=>disconnects.length===1);
 assert.match(disconnects[0],/host/i);assert.equal(admin.session(),null);
});

test('blocked LAN join reports failure and does not create a separate game',async t=>{
 const {create}=fixture(t,{blocked:true}),disconnects=[];
 const host=create(),guest=create({onDisconnect:message=>disconnects.push(message)});
 const first=await host.start({name:'Player',createLobby:true,adminToken:'admin'}),second=await guest.start({name:'Guest',createLobby:true,adminToken:'admin'});
 await assert.rejects(guest.join({targetId:first.id,adminToken:'admin'}),/same local network/);
 assert.equal(guest.session(),null);assert.equal(disconnects.length,0);
 await assert.rejects(guest.command('reload'),/not connected/);
});

test('rejected joins and joining an existing member preserve the working room and its peers',async t=>{
 const {create}=fixture(t),disconnects=[];
 const host=create(),guest=create({onDisconnect:message=>disconnects.push(message)}),other=create();
 const first=await host.start({name:'Host',createLobby:true,adminToken:'admin'}),second=await guest.start({name:'Guest',createLobby:true,adminToken:'admin'}),third=await other.start({name:'Other',createLobby:true,adminToken:'admin'});
 await guest.join({targetId:first.id,adminToken:'admin'});
 await host.command('fire',{direction:{x:0,y:1,z:0}});
 await assert.rejects(host.join({joinCode:'MISSING',adminToken:'admin'}),/Code not found/);
 await assert.rejects(host.join({targetId:third.id,adminToken:'admin'}),/using your hosted game/);
 await assert.rejects(guest.join({targetId:third.id,adminToken:'wrong'}),/Admin required/);
 const sameRoom=await host.join({targetId:second.id,adminToken:'admin'});
 assert.equal(sameRoom.initialState.players.length,2);
 assert.equal(sameRoom.initialState.players.find(player=>player.id===first.id).ammo,5);
 assert.equal(guest.session().hostId,first.id);assert.equal(disconnects.length,0);
 assert.equal(await guest.command('reload'),null);
});

test('shop purchases return the authoritative wallet and ammo reply over the LAN channel',async t=>{
 const {create}=fixture(t);let hostedEngine;
 const host=create({engineFactory:options=>{
  const positions=[10,5,-13,8].map(value=>value/36+.5);
  hostedEngine=createRoomEngine({...options,random:()=>positions.shift()??.5});return hostedEngine;
 }}),guest=create();
 const first=await host.start({name:'Host',createLobby:true,adminToken:'admin'}),second=await guest.start({name:'Customer',createLobby:true,adminToken:'admin'});
 await guest.join({targetId:first.id,adminToken:'admin'});
 await assert.rejects(guest.command('buy',{weapon:'revolver',mod:'standard'}),/counter/);
 await guest.command('input',{active:true,x:0,z:-1,yaw:0,pitch:0});
 for(let i=0;i<16;i++)hostedEngine.tick();
 await guest.command('input',{active:false,x:0,z:0,yaw:0,pitch:0});
 for(let i=0;i<10;i++)hostedEngine.tick();
 await guest.command('fire',{direction:{x:0,y:1,z:0}});
 const purchased=await guest.command('buy',{weapon:'revolver',mod:'standard',yaw:0,pitch:0});
 assert.equal(purchased.player.id,second.id);assert.equal(purchased.player.ammo,6);
 assert.equal(purchased.player.ammoByWeapon.revolver,6);assert.equal(purchased.player.beans,0);
 assert.equal(purchased.message,'Loaded.');assert.ok(Number.isFinite(purchased.time));
 await assert.rejects(guest.command('buy',{weapon:'revolver',mod:'small',beans:9999}),/Not enough beans/);
});

test('directory preserves actionable backend error status and code',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'Connect the player directory first',code:'NOT_CONFIGURED'}),{status:503});
 await assert.rejects(directory('health'),error=>error.status===503&&error.code==='NOT_CONFIGURED'&&/directory/.test(error.message));
});

test('ordinary Play starts a discoverable game with cans but cannot join another player',async t=>{
 const {create}=fixture(t);const host=create(),guest=create();
 const first=await host.start({name:'Host'}),second=await guest.start({name:'Guest'});
 assert.equal(first.initialState.cans.length,3);assert.equal(second.initialState.players.length,1);
 await assert.rejects(guest.join({targetId:first.id}),error=>error.status===403);
 assert.equal(guest.session().hostId,second.id);
});


test('room switching waits for a delayed mailbox poll before changing membership',async t=>{
 const {create,request}=fixture(t);let releasePoll,pollStarted=false,joinRequested=false,delayPoll=true;
 const host=create(),guest=create({request:async(action,data)=>{
  if(action==='poll'&&delayPoll){delayPoll=false;pollStarted=true;await new Promise(resolve=>{releasePoll=resolve;});}
  if(action==='join')joinRequested=true;
  return request(action,data);
 }});
 const first=await host.start({name:'Host'});await guest.start({name:'Admin'});await until(()=>pollStarted);
 const joining=guest.join({targetId:first.id,adminToken:'admin'});
 await new Promise(resolve=>setTimeout(resolve,25));
 const raced=joinRequested;releasePoll();
 const joined=await joining;
 assert.equal(raced,false,'an old draining poll must finish before directory membership changes');
 assert.equal(joined.hostId,first.id);assert.equal(joined.initialState.players.length,2);
 await guest.command('input',{active:false,yaw:.3});
});

test('closing while waiting for the previous poll cancels joining without a directory mutation',async t=>{
 const {create,request}=fixture(t);let releasePoll,pollStarted=false,joinRequested=false;
 const guest=create({request:async(action,data)=>{
  if(action==='poll'){pollStarted=true;await new Promise(resolve=>{releasePoll=resolve;});}
  if(action==='join')joinRequested=true;
  return request(action,data);
 }});
 await guest.start({name:'Admin'});await until(()=>pollStarted);
 const joining=guest.join({targetId:'unused',adminToken:'admin'});
 guest.close();releasePoll();await assert.rejects(joining,/canceled/);assert.equal(joinRequested,false);
});
